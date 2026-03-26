// In-memory store — persists across requests within the same server process
let recentQueries: string[] = []

export async function GET() {
  return Response.json({ queries: recentQueries.slice(0, 10) })
}

export async function POST(request: Request) {
  try {
    const { query } = await request.json()
    if (query && typeof query === 'string' && query.trim().length > 0) {
      const q = query.trim()
      recentQueries = [q, ...recentQueries.filter(r => r !== q)].slice(0, 10)
    }
  } catch {}
  return Response.json({ queries: recentQueries.slice(0, 10) })
}
