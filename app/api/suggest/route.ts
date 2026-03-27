import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 3) return NextResponse.json({ suggestions: [] })

  const NEWSAPI_KEY = process.env.NEWSAPI_KEY

  type Suggestion = { title: string; source: string; url: string; publishedAt: string; description: string }
  const seen = new Set<string>()
  const results: Suggestion[] = []

  // Last 14 days for NewsAPI
  const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [newsRes, gdeltRes] = await Promise.allSettled([
    NEWSAPI_KEY
      ? fetch(
          `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&pageSize=8&sortBy=publishedAt&from=${from}&apiKey=${NEWSAPI_KEY}`,
          { headers: { 'User-Agent': 'Converg/1.0' } }
        ).then(r => r.json()).catch(() => null)
      : Promise.resolve(null),

    // GDELT — no key, near real-time global news
    fetch(
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=10&format=json&timespan=2weeks&sort=DateDesc`
    ).then(r => r.json()).catch(() => null),
  ])

  // NewsAPI results
  if (newsRes.status === 'fulfilled' && newsRes.value?.articles) {
    for (const a of newsRes.value.articles) {
      const title = (a.title ?? '').replace(/ - [^-]+$/, '').trim()
      if (!title || title === '[Removed]' || seen.has(title)) continue
      seen.add(title)
      results.push({
        title,
        source: a.source?.name ?? '',
        url: a.url ?? '',
        publishedAt: a.publishedAt ?? '',
        description: a.description ?? '',
      })
    }
  }

  // GDELT results
  if (gdeltRes.status === 'fulfilled' && gdeltRes.value?.articles) {
    for (const a of gdeltRes.value.articles) {
      const title = (a.title ?? '').trim()
      if (!title || seen.has(title)) continue
      seen.add(title)
      const sd = (a.seendate ?? '') as string
      const publishedAt = sd.length >= 8
        ? `${sd.slice(0,4)}-${sd.slice(4,6)}-${sd.slice(6,8)}T${sd.length >= 10 ? sd.slice(8,10) : '00'}:${sd.length >= 12 ? sd.slice(10,12) : '00'}:${sd.length >= 14 ? sd.slice(12,14) : '00'}Z`
        : ''
      results.push({
        title,
        source: a.domain ?? '',
        url: a.url ?? '',
        publishedAt,
        description: '',
      })
    }
  }

  // Sort by recency, most recent first
  results.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())

  return NextResponse.json({ suggestions: results.slice(0, 8) })
}
