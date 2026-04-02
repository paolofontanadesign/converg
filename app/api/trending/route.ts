type TrendingItem = { title: string; source: string; publishedAt: string }

// In-memory cache — refreshed every 5 minutes
let cache: { items: TrendingItem[]; at: number } | null = null
const TTL = 5 * 60 * 1000

export async function GET() {
  if (cache && cache.items.length > 0 && Date.now() - cache.at < TTL) {
    return Response.json({ items: cache.items })
  }

  const items: TrendingItem[] = []

  // Try NewsAPI first
  try {
    const key = process.env.NEWS_API_KEY
    if (key) {
      const res = await fetch(
        `https://newsapi.org/v2/top-headlines?language=en&pageSize=15&apiKey=${key}`,
        { signal: AbortSignal.timeout(5000) }
      )
      if (res.ok) {
        const data = await res.json()
        for (const a of data.articles ?? []) {
          if (!a.title || a.title === '[Removed]') continue
          items.push({
            title: a.title.replace(/ - [^-]+$/, '').trim(),
            source: a.source?.name ?? '',
            publishedAt: a.publishedAt ?? '',
          })
          if (items.length === 10) break
        }
      } else {
        console.log('[trending] NewsAPI status:', res.status)
      }
    }
  } catch (e) {
    console.log('[trending] NewsAPI error:', String(e))
  }

  // Fallback: GDELT
  if (items.length < 5) {
    try {
      const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=(war+OR+election+OR+economy+OR+climate)&mode=artlist&maxrecords=25&format=json&sort=datedesc&timespan=12h'
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      console.log('[trending] GDELT status:', res.status, res.ok)
      if (res.ok) {
        const text = await res.text()
        console.log('[trending] GDELT response preview:', text.slice(0, 100))
        const data = JSON.parse(text)
        const arts = data.articles ?? []
        console.log('[trending] GDELT articles count:', arts.length, 'sample lang:', arts[0]?.language)
        for (const a of arts) {
          if (!a.title || a.language !== 'English') continue
          if (items.some(x => x.title === a.title)) continue
          items.push({ title: a.title.trim(), source: a.domain ?? '', publishedAt: a.seendate ?? '' })
          if (items.length === 10) break
        }
      }
    } catch (e) {
      console.log('[trending] GDELT error:', String(e))
    }
  }

  console.log('[trending] final items count:', items.length)
  const result = items.slice(0, 10)
  if (result.length > 0) cache = { items: result, at: Date.now() }
  return Response.json({ items: result })
}
