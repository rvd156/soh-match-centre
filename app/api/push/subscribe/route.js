import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const allowedHosts = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com'
]

function reply(body, status = 200) {
  return Response.json(body, { status })
}

function validEndpoint(endpoint) {
  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' &&
      allowedHosts.includes(url.hostname) &&
      !url.username && !url.password && !url.port && !url.hash
  } catch {
    return false
  }
}

function preferenceFields(preferences) {
  if (preferences == null) return null

  const level = preferences.level
  if (!['key_updates', 'every_score', 'custom'].includes(level)) {
    throw new Error('Invalid notification level.')
  }

  if (level === 'key_updates') {
    return {
      notification_level: level,
      notify_goals: true,
      notify_two_pointers: true,
      notify_points: false,
      notify_match_milestones: true,
      notify_manual_updates: true,
      notify_match_updates: true
    }
  }

  if (level === 'every_score') {
    return {
      notification_level: level,
      notify_goals: true,
      notify_two_pointers: true,
      notify_points: true,
      notify_match_milestones: true,
      notify_manual_updates: true,
      notify_match_updates: true
    }
  }

  const names = [
    'goals',
    'twoPointers',
    'points',
    'matchMilestones',
    'manualUpdates',
    'matchUpdates'
  ]
  if (names.some(name => typeof preferences[name] !== 'boolean')) {
    throw new Error('Invalid custom preferences.')
  }

  return {
    notification_level: level,
    notify_goals: preferences.goals,
    notify_two_pointers: preferences.twoPointers,
    notify_points: preferences.points,
    notify_match_milestones: preferences.matchMilestones,
    notify_manual_updates: preferences.manualUpdates,
    notify_match_updates: preferences.matchUpdates
  }
}

function adminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY

  if (!supabaseUrl || !secretKey) return null

  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

export async function POST(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return reply({ error: 'Request not allowed.' }, 403)
  }

  let parsed
  try {
    const body = await request.text()
    if (body.length > 8192) {
      return reply({ error: 'Subscription is too large.' }, 413)
    }
    parsed = JSON.parse(body)
  } catch {
    return reply({ error: 'Invalid subscription.' }, 400)
  }

  // Accept the original subscription body and the new body with preferences.
  const subscription = parsed?.subscription || parsed
  const endpoint = subscription?.endpoint
  const p256dh = subscription?.keys?.p256dh
  const auth = subscription?.keys?.auth

  if (
    typeof endpoint !== 'string' ||
    endpoint.length > 2048 ||
    typeof p256dh !== 'string' ||
    !/^[A-Za-z0-9_-]{87}$/.test(p256dh) ||
    typeof auth !== 'string' ||
    !/^[A-Za-z0-9_-]{22}$/.test(auth)
  ) {
    return reply({ error: 'Invalid subscription details.' }, 400)
  }

  if (!validEndpoint(endpoint)) {
    return reply({ error: 'Unsupported push service.' }, 400)
  }

  let preferences
  try {
    preferences = preferenceFields(parsed?.preferences)
  } catch (error) {
    return reply({ error: error.message }, 400)
  }

  const supabaseAdmin = adminClient()
  if (!supabaseAdmin) {
    return reply({ error: 'Notification setup is incomplete.' }, 503)
  }

  try {
    const row = {
      endpoint,
      p256dh,
      auth,
      updated_at: new Date().toISOString(),
      ...(preferences || {})
    }

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert(row, { onConflict: 'endpoint' })

    if (error) {
      console.error('Push subscription save failed:', error.code)
      return reply({ error: 'Unable to save subscription.' }, 500)
    }

    return reply({
      success: true,
      notificationLevel: preferences?.notification_level || null
    })
  } catch {
    return reply({ error: 'Unable to save subscription.' }, 500)
  }
}

export async function DELETE(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    return reply({ error: 'Request not allowed.' }, 403)
  }

  let endpoint
  try {
    const body = await request.text()
    if (body.length > 4096) {
      return reply({ error: 'Request is too large.' }, 413)
    }
    endpoint = JSON.parse(body)?.endpoint
  } catch {
    return reply({ error: 'Invalid request.' }, 400)
  }

  if (
    typeof endpoint !== 'string' ||
    endpoint.length > 2048 ||
    !validEndpoint(endpoint)
  ) {
    return reply({ error: 'Invalid subscription.' }, 400)
  }

  const supabaseAdmin = adminClient()
  if (!supabaseAdmin) {
    return reply({ error: 'Notification setup is incomplete.' }, 503)
  }

  try {
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)

    if (error) {
      return reply({ error: 'Unable to remove subscription.' }, 500)
    }

    return reply({ success: true })
  } catch {
    return reply({ error: 'Unable to remove subscription.' }, 500)
  }
}
