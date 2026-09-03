export const dynamic = 'force-dynamic'

export async function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_URL ||
    'local'

  return Response.json(
    { version },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
}
