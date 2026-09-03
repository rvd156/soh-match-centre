import { createClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'node:crypto'
import { POST as sendGoal } from '../goal/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

function reply(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  })
}

function hash(value) {
  return createHash('sha256').update(value).digest()
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) return reply({ error: 'Retry check not configured.' }, 503)

  const authorization = request.headers.get('authorization') || ''
  if (!timingSafeEqual(hash(authorization), hash(`Bearer ${cronSecret}`))) {
    return reply({ error: 'Not authorized.' }, 401)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY
  const sendSecret = process.env.PUSH_SEND_SECRET?.trim()
  if (!supabaseUrl || !supabaseSecret || !sendSecret) {
    return reply({ error: 'Notification setup is incomplete.' }, 503)
  }

  const startedAt = Date.now()
  const cutoff = new Date(startedAt - 5 * 60 * 1000).toISOString()
  const upperBound = new Date(startedAt).toISOString()
  const summary = { goalsChecked: 0, sent: 0, failedChecks: 0, deferred: false }

  try {
    const db = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // Scan recent saved goals, including ones whose webhook never arrived.
    let cursor = null
    while (true) {
      if (Date.now() - startedAt > 60000) {
        summary.deferred = true
        break
      }

      let query = db.from('match_events')
        .select('id')
        .eq('event_type', 'goal')
        .gte('created_at', cutoff)
        .lte('created_at', upperBound)
        .order('id', { ascending: true })
        .limit(50)

      if (cursor !== null) query = query.gt('id', cursor)

      const { data: goals, error } = await query
      if (error) throw new Error(`Unable to read recent goals (${error.code}).`)
      if (!goals?.length) break

      for (let index = 0; index < goals.length; index += 2) {
        if (Date.now() - startedAt > 60000) {
          summary.deferred = true
          break
        }

        const results = await Promise.allSettled(
          goals.slice(index, index + 2).map(async goal => {
            // Call the existing handler directly: no additional HTTP request.
            // Its database claims skip sent, expired and busy deliveries,
            // and limit each delivery to three attempts in total.
            const response = await sendGoal(new Request(
              'https://soh-match-centre.vercel.app/api/push/goal',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${sendSecret}`
                },
                body: JSON.stringify({
                  type: 'INSERT',
                  schema: 'public',
                  table: 'match_events',
                  record: { id: goal.id, event_type: 'goal' }
                })
              }
            ))
            return { ok: response.ok, data: await response.json() }
          })
        )

        for (const result of results) {
          summary.goalsChecked += 1
          if (result.status === 'rejected') {
            summary.failedChecks += 1
          } else {
            summary.sent += Number(result.value.data.sent) || 0
            if (!result.value.ok) summary.failedChecks += 1
          }
        }
      }

      if (summary.deferred || goals.length < 50) break
      cursor = goals[goals.length - 1].id
    }

    console.info('Push retry check:', summary)
    return reply(summary, summary.failedChecks || summary.deferred ? 503 : 200)
  } catch (error) {
    console.error('Push retry check failed:',
      error instanceof Error ? error.message : 'Unknown error')
    return reply({ error: 'Unable to check recent goal alerts.' }, 503)
  }
}
