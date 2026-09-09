const SUPABASE_HOST = 'fmbvqrjkyiuacymhulql.supabase.co'
const CREST_PATH_PREFIX = '/storage/v1/object/public/club-crests/'

export function getCrestSrc(url, teamId) {
  if (Number(teamId) === 1) return '/soh-crest.png'
  if (!url) return ''

  try {
    const parsed = new URL(url)

    if (parsed.hostname === SUPABASE_HOST && parsed.pathname.startsWith(CREST_PATH_PREFIX)) {
      return `/api/crest?url=${encodeURIComponent(parsed.toString())}`
    }
  } catch {
    // Keep non-URL values usable if an existing team record contains one.
  }

  return url
}
