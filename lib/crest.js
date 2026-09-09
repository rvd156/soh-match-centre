const SUPABASE_HOST = 'fmbvqrjkyiuacymhulql.supabase.co'
const CREST_PATH_PREFIX = '/storage/v1/object/public/club-crests/'
const SOH_CREST_URL = `https://${SUPABASE_HOST}${CREST_PATH_PREFIX}SOH_Logo.png?v=2`

export function getCrestSrc(url, teamId) {
  const source = Number(teamId) === 1 ? SOH_CREST_URL : url
  if (!source) return ''

  try {
    const parsed = new URL(source)

    if (parsed.hostname === SUPABASE_HOST && parsed.pathname.startsWith(CREST_PATH_PREFIX)) {
      return `/api/crest?url=${encodeURIComponent(parsed.toString())}`
    }
  } catch {
    // Keep non-URL values usable if an existing team record contains one.
  }

  return source
}
