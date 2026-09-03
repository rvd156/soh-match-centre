import { createClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'node:crypto'
import { POST as sendGoal } from '../goal/route'
import { POST as sendStatus } from '../status/route'
import { POST as sendScoreUpdate } from '../score-update/route'

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
  const summary = {
    scoresChecked: 0,
    statusesChecked: 0,
    updatesChecked: 0,
    sent: 0,
    failedChecks: 0,
    deferred: false
  }

  try {
    const db = createClient(supabaseUrl, supabaseSecret, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    async function runRecent({ table, columns, filter, handler, path, countKey, makeRecord }) {
      let cursor = null
      while (true) {
        if (Date.now() - startedAt > 60000) {
          summary.deferred = true
          break
        }

        let query = db.from(table)
          .select(columns)
          .gte('created_at', cutoff)
          .lte('created_at', upperBound)
          .order('id', { ascending: true })
          .limit(50)
        if (filter) query = filter(query)
        if (cursor !== null) query = query.gt('id', cursor)

        const { data: records, error } = await query
        if (error) throw new Error(`Unable to read recent ${table} (${error.code}).`)
        if (!records?.length) break

        for (let index = 0; index < records.length; index += 2) {
          if (Date.now() - startedAt > 60000) {
            summary.deferred = true
            break
          }

          const results = await Promise.allSettled(
            records.slice(index, index + 2).map(async record => {
              const response = await handler(new Request(
                `https://soh-match-centre.vercel.app${path}`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${sendSecret}`
                  },
                  body: JSON.stringify({
                    type: 'INSERT',
                    schema: 'public',
                    table,
                    record: makeRecord(record)
                  })
                }
              ))
              return { ok: response.ok, data: await response.json() }
            })
          )

          for (const result of results) {
            summary[countKey] += 1
            if (result.status === 'rejected') {
              summary.failedChecks += 1
            } else {
              summary.sent += Number(result.value.data.sent) || 0
              if (!result.value.ok) summary.failedChecks += 1
            }
          }
        }

        if (summary.deferred || records.length < 50) break
        cursor = records[records.length - 1].id
      }
    }

    // Scan recent records, including alerts whose webhook never arrived.
    await runRecent({
      table: 'match_events',
      columns: 'id, event_type',
      filter: query => query.in('event_type', ['goal', 'point', 'two_pointer']),
      handler: sendGoal,
      path: '/api/push/goal',
      countKey: 'scoresChecked',
      makeRecord: record => ({ id: record.id, event_type: record.event_type })
    })

    if (!summary.deferred) {
      await runRecent({
        table: 'match_status_events',
        columns: 'id, status',
        filter: null,
        handler: sendStatus,
        path: '/api/push/status',
        countKey: 'statusesChecked',
        makeRecord: record => ({ id: record.id, status: record.status })
      })
    }

    if (!summary.deferred) {
      await runRecent({
        table: 'push_score_updates',
        columns: 'id',
        filter: null,
        handler: sendScoreUpdate,
        path: '/api/push/score-update',
        countKey: 'updatesChecked',
        makeRecord: record => ({ id: record.id })
      })
    }

    console.info('Push retry check:', summary)
    return reply(summary, summary.failedChecks || summary.deferred ? 503 : 200)
  } catch (error) {
    console.error('Push retry check failed:',
      error instanceof Error ? error.message : 'Unknown error')
    return reply({ error: 'Unable to check recent push alerts.' }, 503)
  }
}
