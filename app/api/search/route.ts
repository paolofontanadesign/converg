import { NextRequest } from 'next/server'

function detectLanguage(title: string): string {
  const t = title.toLowerCase()
  if (/[\u4e00-\u9fff]/.test(t)) return 'zh'
  if (/[\u0600-\u06ff]/.test(t)) return 'ar'
  if (/[\u0400-\u04ff]/.test(t)) return 'ru'
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(t)) return 'ja'
  if (/[\uac00-\ud7af]/.test(t)) return 'ko'
  const patterns: [string, RegExp][] = [
    ['de', /\b(und|der|die|das|ein|eine|von|mit|für|bei|nach|über|durch|oder|nicht|auch|wird|dass)\b/],
    ['fr', /\b(que|du|des|les|une|pour|avec|comme|mais|après|cette|sont|aussi|sur|dans|tout|leur|dont)\b/],
    ['es', /\b(que|del|los|las|una|por|con|para|como|más|pero|sobre|cuando|esto|están|son|fue|han|muy)\b/],
    ['it', /\b(che|del|dei|gli|una|per|con|come|più|dopo|quando|questo|questa|sono|stato|ogni|dalla|nel)\b/],
    ['pt', /\b(que|do|da|os|as|uma|por|com|para|como|mais|mas|sobre|quando|isso|são|foi|têm|muito)\b/],
    ['en', /\b(the|and|for|with|that|this|from|have|are|was|were|will|not|but|also|after|over|about|more)\b/],
  ]
  let best = 'undetected'
  let bestScore = 0
  for (const [lang, re] of patterns) {
    const matches = t.match(new RegExp(re.source, 'g'))
    const score = matches ? matches.length : 0
    if (score > bestScore) { bestScore = score; best = lang }
  }
  return best
}

function extractVideoId(url: string): string | null {
  const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return match ? match[1] : null
}

const majorOutlets = [
  'bbc','cnn','sky news','abc news','cbs news','nbc news','reuters','ap ','associated press',
  'france 24','dw news','al jazeera','nyt','new york times','washington post','guardian',
  'bloomberg','euronews','fox news','msnbc','the times','le monde','der spiegel','corriere',
]

// Titles with these patterns are editorial commentary, not independent footage
const editorialPatterns = [
  'reaction','compilation','explained','analysis','breakdown','fact.?check',
  'debunked','fake or real','real or fake','opinion','documentary','what happened',
  'why did','how did','the truth','full story','in depth',
]
const editorialRe = new RegExp(editorialPatterns.join('|'), 'i')

function isEditorial(title: string): boolean {
  return editorialRe.test(title)
}

function classifySource(channelName: string, title: string): 'raw' | 'secondary' | 'aggregated' {
  const lower = channelName.toLowerCase()
  // Known major outlets or editorial titles → aggregated (lowest corroboration value)
  if (majorOutlets.some(o => lower.includes(o))) return 'aggregated'
  if (isEditorial(title)) return 'aggregated'
  // Channels with news/tv/media/press branding → secondary
  if (lower.includes('news') || lower.includes('tv') || lower.includes('media') || lower.includes('press')) return 'secondary'
  // Unknown channel, non-editorial title → raw footage (strongest corroboration signal)
  return 'raw'
}

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get('q')
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))

      // Flush Safari's 1KB buffer threshold
      controller.enqueue(encoder.encode(`: ${' '.repeat(1024)}\n\n`))

      try {
        if (!input) { send({ error: 'No input' }); return }

        const apiKey = process.env.YOUTUBE_API_KEY
        const videoId = extractVideoId(input)
        if (!videoId) { send({ error: 'Please paste a valid YouTube URL' }); return }

        // Step 0: Metadata extraction
        send({ step: 0 })
        const detailsData = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
        ).then(r => r.json())

        if (!detailsData.items?.length) { send({ error: 'Video not found' }); return }

        const sourceVideo = detailsData.items[0].snippet
        const publishedAt = new Date(sourceVideo.publishedAt)
        const title = sourceVideo.title

        // Step 1: Query generation
        send({ step: 1 })

        const noiseWords = new Set([
          'the','a','an','in','of','to','and','for','is','on','at','by','from','with','as','its',
          'this','that','are','was','were','been','have','has','had','will','would','could','should',
          'they','them','their','there','then','than','when','what','which','who','how','why','not',
          'but','also','over','into','about','more','after','before','during','between',
          'live','breaking','watch','video','news','update','full','official','raw','footage',
          'caught','camera','exclusive','alert','urgent','latest','report','today','now','just',
          'says','said','tells','shows','reveals','warns','claims','hits','kills','dead','dies',
        ])

        const cleanTitle = title.replace(/^(live|breaking|watch|exclusive|update)[^a-z]*/i, '').trim()
        const capitalWords: string[] = cleanTitle.match(/\b[A-Z][a-z]{2,}\b/g) ?? []
        const allWords: string[] = cleanTitle
          .replace(/[^a-zA-Z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w: string) => w.length > 3 && !noiseWords.has(w.toLowerCase()))

        const seen = new Set<string>()
        const keywordParts: string[] = []
        for (const w of [...capitalWords, ...allWords]) {
          const lower = w.toLowerCase()
          if (!seen.has(lower)) { seen.add(lower); keywordParts.push(w) }
          if (keywordParts.length >= 5) break
        }

        const keywords = keywordParts.length > 0
          ? keywordParts.join(' ')
          : cleanTitle.split(/\s+/).slice(0, 3).join(' ')

        const capitalizedKws = capitalWords.map(w => w.toLowerCase()).filter(w => seen.has(w))
        const titleNumbers = title.match(/\b\d{2,}\b/g) ?? []
        const namedEntityKws = [...new Set([...capitalizedKws, ...titleNumbers])]
        const regularKws = keywordParts.map(w => w.toLowerCase()).filter(w => !namedEntityKws.includes(w))

        // Corroboration queries: bias toward raw footage language
        // Named entities (places, names) are stable across languages — append footage/video to seek raw uploads
        const entityBase = namedEntityKws.length > 0 ? namedEntityKws.join(' ') : keywords
        const queries: string[] = [
          entityBase + ' footage',   // strongest corroboration signal: raw footage of the same place
          entityBase + ' video',     // broader: any video of the same event/location
          keywords,                  // fallback: filtered keywords, catches same-language editorial too
        ].filter((q, i, arr) => q.length > 0 && arr.indexOf(q) === i)

        const after = new Date(publishedAt.getTime() - 48 * 60 * 60 * 1000).toISOString()
        const before = new Date(publishedAt.getTime() + 48 * 60 * 60 * 1000).toISOString()

        const buildSearchUrl = (q: string) =>
          `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&publishedAfter=${after}&publishedBefore=${before}&maxResults=25&key=${apiKey}`

        // Step 2: Parallel corroboration search
        send({ step: 2 })
        const searchResponses = await Promise.all(
          queries.map(q => fetch(buildSearchUrl(q)).then(r => r.json()))
        )

        const seenVideoIds = new Set<string>()
        const mergedItems = searchResponses
          .flatMap((data: any) => data.items || [])
          .filter((item: any) => {
            if (seenVideoIds.has(item.id.videoId)) return false
            seenVideoIds.add(item.id.videoId)
            return true
          })

        // Step 3: Corroboration analysis
        send({ step: 3 })

        const sourceChannelId = sourceVideo.channelId
        const seenChannels = new Set()

        const filteredResults = mergedItems
          .filter((item: any) => item.id.videoId !== videoId && item.snippet.channelId !== sourceChannelId)
          .filter((item: any) => {
            // Relevance: require multiple overlapping signals to reduce false positives.
            // A single named entity match ("Valencia") is too loose — it matches unrelated content.
            // Combined score: each entity match = 1.5pts, each regular keyword = 1pt.
            // Threshold of 2 means: need 2 entities, OR 1 entity + 1 keyword, OR 2+ keywords.
            const t = item.snippet.title.toLowerCase()
            const entityScore = namedEntityKws
              .filter(kw => kw.length >= 4)  // skip short ambiguous entities (e.g. "LA", "UK")
              .filter(kw => t.includes(kw)).length * 1.5
            const regularScore = regularKws.filter((kw: string) => t.includes(kw)).length
            return entityScore + regularScore >= 2
          })
          .filter((item: any) => {
            if (seenChannels.has(item.snippet.channelId)) return false
            seenChannels.add(item.snippet.channelId)
            return true
          })
          .map((item: any) => {
            const publishedItem = new Date(item.snippet.publishedAt)
            const hoursAfterSource = Math.round((publishedItem.getTime() - publishedAt.getTime()) / (1000 * 60 * 60))
            const rawLang = item.snippet.defaultLanguage || item.snippet.defaultAudioLanguage || ''
            const lang = rawLang || detectLanguage(item.snippet.title)
            const cleanedTitle = item.snippet.title.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
            const sourceType = classifySource(item.snippet.channelTitle, cleanedTitle)
            return {
              id: item.id.videoId,
              title: cleanedTitle,
              channel: item.snippet.channelTitle,
              published: item.snippet.publishedAt,
              hoursAfterSource,
              language: lang,
              sourceType,
              url: `https://youtube.com/watch?v=${item.id.videoId}`
            }
          })

        const resultIds = filteredResults.map((r: any) => r.id)
        const viewCounts: Record<string, number> = {}
        if (resultIds.length > 0) {
          const statsData = await fetch(
            `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${resultIds.join(',')}&key=${apiKey}`
          ).then(r => r.json())
          for (const item of statsData.items || []) {
            viewCounts[item.id] = parseInt(item.statistics?.viewCount ?? '0', 10)
          }
        }

        const results = filteredResults.map((r: any) => ({ ...r, viewCount: viewCounts[r.id] ?? 0 }))

        send({
          result: {
            source: {
              id: videoId,
              title,
              published: sourceVideo.publishedAt,
              channel: sourceVideo.channelTitle,
              url: `https://youtube.com/watch?v=${videoId}`
            },
            window: { after, before },
            results
          }
        })
      } catch (e: any) {
        send({ error: e?.message ?? 'Unexpected error' })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
