import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 60

function reply(body, status = 200) {
  return Response.json(body, { status })
}

function related(value) {
  return Array.isArray(value) ? value[0] : value
}

function gaaScore(goals, points) {
  const safeGoals = Number(goals) || 0
  const safePoints = Number(points) || 0
  return `${safeGoals}-${String(safePoints).padStart(2, '0')} (${safeGoals * 3 + safePoints} pts)`
}

export async function POST(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  const secretKey = process.env.SUPABASE_SECRET_KEY
  const openAIKey = process.env.OPENAI_API_KEY

  if (!url || !publicKey || !secretKey || !openAIKey) {
    return reply({ error: 'Summary generator is not configured.' }, 503)
  }

  const authorization = request.headers.get('authorization') || ''
  const accessToken = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : ''

  if (!accessToken) return reply({ error: 'Not authorized.' }, 401)

  const authClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const { data: userData, error: userError } = await authClient.auth.getUser(accessToken)

  if (userError || !userData?.user) {
    return reply({ error: 'Not authorized.' }, 401)
  }

  let body
  try {
    const rawBody = await request.text()
    if (rawBody.length > 2048) return reply({ error: 'Request too large.' }, 413)
    body = JSON.parse(rawBody)
  } catch {
    return reply({ error: 'Invalid request.' }, 400)
  }

  const matchId = Number(body?.matchId)
  if (!Number.isSafeInteger(matchId) || matchId < 1) {
    return reply({ error: 'Invalid match.' }, 400)
  }

  const db = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const [matchResult, eventsResult, milestonesResult] = await Promise.all([
    db.from('matches')
      .select(`
        id, competition, venue, referee, match_date, status,
        home_goals, home_points, away_goals, away_points,
        home_team:teams!matches_home_team_id_fkey (name),
        away_team:teams!matches_away_team_id_fkey (name)
      `)
      .eq('id', matchId)
      .in('status', ['full_time', 'after_extra_time'])
      .maybeSingle(),
    db.from('match_events')
      .select(`
        event_type, score_type, match_minute, notes, created_at,
        players!match_events_player_id_fkey (name),
        player_off:players!match_events_player_off_id_fkey (name),
        player_on:players!match_events_player_on_id_fkey (name),
        teams (name)
      `)
      .eq('match_id', matchId)
      .order('created_at', { ascending: true }),
    db.from('match_status_events')
      .select(`
        status, home_goals, home_points,
        away_goals, away_points, created_at
      `)
      .eq('match_id', matchId)
      .order('created_at', { ascending: true })
  ])

  if (matchResult.error || !matchResult.data) {
    return reply({ error: 'A completed match could not be found.' }, 404)
  }
  if (eventsResult.error || milestonesResult.error) {
    return reply({ error: 'The recorded match action could not be loaded.' }, 500)
  }

  const match = matchResult.data
  const home = related(match.home_team)?.name || 'Home'
  const away = related(match.away_team)?.name || 'Away'

  const facts = {
    competition: match.competition || null,
    date: match.match_date || null,
    venue: match.venue || null,
    referee: match.referee || null,
    finishedAfterExtraTime: match.status === 'after_extra_time',
    finalScore: {
      home: `${home} ${gaaScore(match.home_goals, match.home_points)}`,
      away: `${away} ${gaaScore(match.away_goals, match.away_points)}`
    },
    milestones: (milestonesResult.data || [])
  .filter(item => item.status === 'half_time')
  .map(item => {
  const homeTotal = (Number(item.home_goals) || 0) * 3 +
    (Number(item.home_points) || 0)

  const awayTotal = (Number(item.away_goals) || 0) * 3 +
    (Number(item.away_points) || 0)

  return {
    status: item.status,
    home: `${home} ${gaaScore(item.home_goals, item.home_points)}`,
    away: `${away} ${gaaScore(item.away_goals, item.away_points)}`,
    result:
      homeTotal === awayTotal
        ? 'Scores level'
        : homeTotal > awayTotal
          ? `${home} leading by ${homeTotal - awayTotal}`
          : `${away} leading by ${awayTotal - homeTotal}`
  }
}),
    events: (eventsResult.data || []).map(item => ({
      minute: item.match_minute,
      type: item.event_type,
      scoreType: item.score_type,
      player: related(item.players)?.name || null,
      team: related(item.teams)?.name || null,
      playerOff: related(item.player_off)?.name || null,
      playerOn: related(item.player_on)?.name || null,
      note: item.notes || null
    }))
  }

  const aiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openAIKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-5.4-mini',
store: false,
reasoning: {
  effort: 'none'
},
max_output_tokens: 800,
      instructions: [
  'Write one natural paragraph of no more than three short sentences for a Gaelic football match report.',
  'Use the supplied final result, half-time result, competition, extra-time status and Ballinamore SOH scoring events.',
  'Begin with the winner and final score using traditional GAA notation and totals.',
  'Example format: Team A defeated Team B 1-16 (19 pts) to 0-17 (17 pts).',
  'If a half-time result is supplied, state which team led, the score and the margin.',
  'Mention that the match finished after extra time only when supplied.',
  'Do not mention milestones, phases, event logs, early scores, lead changes or the start of a half.',
  'End with one brief sentence mentioning no more than three Ballinamore SOH scorers.',
  'Prioritise the Ballinamore goal scorer and highest-scoring Ballinamore players when they can be established from the supplied events.',
  'Do not mention opposition scorers, cards, substitutions or other individual match events.',
  'Do not invent player totals, and omit the scorer sentence if the recorded information is unclear.',
  'Do not invent momentum, performances, atmosphere, tactics or descriptions of how a team played.',
  'Use ordinary sporting language and keep the summary factual.'
].join(' '),
      input: JSON.stringify(facts)
    })
  })

  const aiData = await aiResponse.json()
  if (!aiResponse.ok) {
    console.error('OpenAI summary generation failed:', aiData?.error?.code || aiResponse.status)
    return reply({ error: 'The summary could not be generated.' }, 502)
  }

  const summary = (aiData.output || [])
    .flatMap(item => item.type === 'message' ? item.content || [] : [])
    .filter(item => item.type === 'output_text')
    .map(item => item.text)
    .join('\n')
    .trim()

  if (!summary) return reply({ error: 'No summary was generated.' }, 502)

  return reply({ summary })
}
