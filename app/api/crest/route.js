const SUPABASE_HOST = 'fmbvqrjkyiuacymhulql.supabase.co'
const CREST_PATH_PREFIX = '/storage/v1/object/public/club-crests/'

export const runtime = 'edge'

export async function GET(request) {
  const source = new URL(request.url).searchParams.get('url')

  if (!source) {
    return Response.json({ error: 'Missing crest URL.' }, { status: 400 })
  }

  let crestUrl

  try {
    crestUrl = new URL(source)
  } catch {
    return Response.json({ error: 'Invalid crest URL.' }, { status: 400 })
  }

  if (
    crestUrl.protocol !== 'https:' ||
    crestUrl.hostname !== SUPABASE_HOST ||
    !crestUrl.pathname.startsWith(CREST_PATH_PREFIX)
  ) {
    return Response.json({ error: 'Crest URL is not allowed.' }, { status: 400 })
  }

  const upstream = await fetch(crestUrl, { cache: 'force-cache' })

  if (!upstream.ok) {
    return Response.json({ error: 'Unable to load crest.' }, { status: upstream.status })
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800'
    }
  })
}
