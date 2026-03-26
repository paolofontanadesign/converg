import { NextRequest } from 'next/server'

const encoder = new TextEncoder()

// ── Source weights ─────────────────────────────────────────────────────────
const SOURCE_WEIGHTS: Record<string, number> = {
  agency: 4,       // AFP, Reuters, AP — highest corroboration value
  major: 2,        // BBC, NYT, Guardian
  independent: 1,  // smaller known outlets
  unverified: 0.5, // unknown blogs / no source id
  raw: 3,          // raw footage from unknown channel
  secondary: 1.5,  // news channel, non-editorial
  aggregated: 0.5, // editorial/compilation video
}

// ── Language detection ─────────────────────────────────────────────────────
function detectLanguage(text: string): string {
  const t = text.toLowerCase()
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
  let best = 'undetected'; let bestScore = 0
  for (const [lang, re] of patterns) {
    const matches = t.match(new RegExp(re.source, 'g'))
    const score = matches ? matches.length : 0
    if (score > bestScore) { bestScore = score; best = lang }
  }
  return best
}

// ── Video source classification ────────────────────────────────────────────
const majorOutlets = [
  'bbc','cnn','sky news','abc news','cbs news','nbc news','reuters','ap ','associated press',
  'france 24','dw news','al jazeera','nyt','new york times','washington post','guardian',
  'bloomberg','euronews','fox news','msnbc','the times','le monde','der spiegel','corriere',
]
const editorialRe = /reaction|compilation|explained|analysis|breakdown|fact.?check|debunked|fake or real|real or fake|opinion|documentary|what happened|why did|how did|the truth|full story|in depth/i

function isEditorial(title: string): boolean { return editorialRe.test(title) }

function classifyVideoSource(channelName: string, title: string): 'raw' | 'secondary' | 'aggregated' {
  const lower = channelName.toLowerCase()
  if (majorOutlets.some(o => lower.includes(o))) return 'aggregated'
  if (isEditorial(title)) return 'aggregated'
  if (lower.includes('news') || lower.includes('tv') || lower.includes('media') || lower.includes('press')) return 'secondary'
  return 'raw'
}

// ── Article source classification ──────────────────────────────────────────
const AGENCY_IDS = new Set(['reuters', 'associated-press', 'afp', 'bloomberg', 'ap-news'])
const MAJOR_IDS = new Set([
  'bbc-news','bbc-sport','al-jazeera-english','cnn','the-new-york-times','the-guardian',
  'the-washington-post','le-monde','der-spiegel','la-stampa','corriere-della-sera',
  'the-times-of-india','abc-news','nbc-news','cbs-news','fox-news','msnbc','the-telegraph',
  'the-independent','euronews','france-24','deutsche-welle','rt','xinhua',
])
const AGENCY_DOMAINS = ['reuters.com','apnews.com','afp.com','bloomberg.com']
const FACTCHECK_DOMAINS = [
  'snopes.com','politifact.com','factcheck.org','fullfact.org','leadstories.com',
  'checkyourfact.com','poynter.org','verafiles.org','reuters.com/fact-check',
  'apnews.com/hub/ap-fact-check','afp.com/en/fact-check','misbar.com','alt-news.in',
]
const MAJOR_DOMAINS  = [
  'bbc.com','bbc.co.uk','cnn.com','nytimes.com','theguardian.com','washingtonpost.com',
  'aljazeera.com','lemonde.fr','spiegel.de','corriere.it','ansa.it','theindependent.co.uk',
  'telegraph.co.uk','france24.com','dw.com','euronews.com',
]

function classifyArticleSource(article: any): 'agency' | 'major' | 'independent' | 'unverified' {
  const id  = (article.source?.id  ?? '').toLowerCase()
  const url = (article.url         ?? '').toLowerCase()
  if (AGENCY_IDS.has(id) || AGENCY_DOMAINS.some(d => url.includes(d))) return 'agency'
  if (MAJOR_IDS.has(id)  || MAJOR_DOMAINS.some(d => url.includes(d)))  return 'major'
  if (id.length > 0) return 'independent'
  return 'unverified'
}

// ── Noise words (multilingual) ─────────────────────────────────────────────
const noiseWords = new Set([
  // English
  'the','a','an','in','of','to','and','for','is','on','at','by','from','with','as','its',
  'this','that','are','was','were','been','have','has','had','will','would','could','should',
  'they','them','their','there','then','than','when','what','which','who','how','why','not',
  'but','also','over','into','about','more','after','before','during','between',
  'live','breaking','watch','video','news','update','full','official','raw','footage',
  'caught','camera','exclusive','alert','urgent','latest','report','today','now','just',
  'says','said','tells','shows','reveals','warns','claims','hits','kills','dead','dies',
  // Italian
  'il','lo','la','gli','le','un','una','uno','del','della','dello','dei','delle','degli',
  'che','con','per','nel','nella','negli','nelle','dal','dalla','dai','dalle','sul','sulla',
  'sui','sulle','tra','fra','sono','stato','stata','stati','state','essere','fare','fatto',
  'hanno','aveva','erano','viene','hanno','anche','molto','come','dove','quando','cosa',
  'questo','questa','questi','queste','quello','quella','quelli','quelle','loro','tutto',
  'tutti','tutte','ancora','dopo','prima','mentre','però','quindi','oppure','senza',
  // Spanish / Portuguese
  'del','los','las','una','por','con','para','como','más','pero','sobre','cuando',
  'esto','están','son','fue','han','muy','dos','desde','hasta','entre','hacia',
  // French
  'les','des','une','dans','sur','pas','plus','par','mais','qui','que','ont',
  'cette','leur','leurs','tout','tous','bien','être','avoir','fait','nous','vous',
  // German
  'der','die','das','ein','eine','von','mit','für','bei','nach','über','durch',
  'oder','nicht','auch','wird','sind','haben','wurde','werden','kann','war',
])

// ── Main handler ───────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      controller.enqueue(encoder.encode(`: ${' '.repeat(1024)}\n\n`))

      try {
        if (!query) { send({ error: 'Please describe the news event to verify' }); return }

        const youtubeKey  = process.env.YOUTUBE_API_KEY
        const newsKey     = process.env.NEWSAPI_KEY
        const anthropicKey = process.env.ANTHROPIC_API_KEY
        const bingKey     = process.env.BING_API_KEY

        // ── Step 0: Extract keywords ──────────────────────────────────────
        send({ step: 0 })

        // Capitalised words are strong named-entity signals in any language
        const capitalWords = (query.match(/\b[A-Z][a-zA-Z]{2,}\b/g) ?? [])
        // All significant words regardless of language
        const allWords = query
          .replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 3 && !noiseWords.has(w.toLowerCase()))

        const seen = new Set<string>()
        const keywordParts: string[] = []
        for (const w of [...capitalWords, ...allWords]) {
          const lower = w.toLowerCase()
          if (!seen.has(lower)) { seen.add(lower); keywordParts.push(w) }
          if (keywordParts.length >= 6) break
        }
        // Use the raw query as fallback so non-English queries still work
        const keywordStr = keywordParts.join(' ') || query.trim()

        const namedEntityKws = [...new Set([
          ...capitalWords.map(w => w.toLowerCase()),
          ...(query.match(/\b\d{2,}\b/g) ?? []),
        ])]
        const regularKws = keywordParts.map(w => w.toLowerCase()).filter(w => !namedEntityKws.includes(w))

        // ── Step 1: Build queries ─────────────────────────────────────────
        send({ step: 1 })

        // ── Step 2: Parallel search (no date filter — covers all time) ────
        send({ step: 2 })

        const [ytResponses, newsData, factCheckData, tiktokData, instaData] = await Promise.all([
          youtubeKey
            ? Promise.all([
                fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keywordStr + ' footage')}&type=video&order=relevance&maxResults=15&key=${youtubeKey}`).then(r => r.json()).catch(() => ({ items: [] })),
                fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keywordStr + ' video')}&type=video&order=relevance&maxResults=10&key=${youtubeKey}`).then(r => r.json()).catch(() => ({ items: [] })),
                fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keywordStr)}&type=video&order=relevance&maxResults=10&key=${youtubeKey}`).then(r => r.json()).catch(() => ({ items: [] })),
                fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query.trim())}&type=video&order=relevance&maxResults=10&key=${youtubeKey}`).then(r => r.json()).catch(() => ({ items: [] })),
              ])
            : Promise.resolve([{ items: [] }]),

          newsKey
            ? fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(keywordStr)}&sortBy=relevancy&pageSize=20&apiKey=${newsKey}`).then(r => r.json()).catch(() => ({ articles: [] }))
            : Promise.resolve({ articles: [] }),

          // Dedicated fact-check search — looks for debunking on known fact-check domains
          newsKey
            ? fetch(`https://newsapi.org/v2/everything?q=${encodeURIComponent(keywordStr + ' fact check debunked hoax false')}&sortBy=relevancy&pageSize=10&apiKey=${newsKey}`).then(r => r.json()).catch(() => ({ articles: [] }))
            : Promise.resolve({ articles: [] }),

          bingKey
            ? fetch(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(keywordStr + ' site:tiktok.com')}&count=10&mkt=en-US`, { headers: { 'Ocp-Apim-Subscription-Key': bingKey } }).then(r => r.json()).catch(() => null)
            : Promise.resolve(null),

          bingKey
            ? fetch(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(keywordStr + ' site:instagram.com/reel')}&count=10&mkt=en-US`, { headers: { 'Ocp-Apim-Subscription-Key': bingKey } }).then(r => r.json()).catch(() => null)
            : Promise.resolve(null),
        ])

        if (ytResponses.some((d: any) => d.error?.code === 403)) {
          send({ error: 'YouTube API quota exceeded. Try again tomorrow or use a new API key.' }); return
        }

        // ── Step 3: Classify + filter ─────────────────────────────────────
        send({ step: 3 })

        // Relevance check using named entities (language-agnostic: proper nouns and numbers
        // appear in Latin script regardless of the query language).
        // Articles must match at least one named entity OR two regular keywords.
        // Videos keep a looser filter (just one keyword) since cross-language titles are common.
        const relevantEnough = (text: string, strict = false) => {
          if (namedEntityKws.length === 0 && regularKws.length === 0) return true
          const lower = text.toLowerCase()
          const entityHit = namedEntityKws.some(kw => lower.includes(kw))
          if (entityHit) return true
          const regularHits = regularKws.filter(kw => lower.includes(kw)).length
          // Without named entities (no proper nouns / numbers) the query is purely descriptive.
          // A single keyword hit produces too many false positives — require proportional coverage.
          const minHits = namedEntityKws.length === 0
            ? Math.max(2, Math.ceil(regularKws.length * 0.4))
            : (strict ? 2 : 1)
          return regularHits >= minHits
        }

        // YouTube — tag raw-query results (index 3) so they skip the relevance filter:
        // YouTube already ranks them by relevance for the user's exact query (including non-English).
        const seenVideoIds = new Set<string>()
        const seenChannels = new Set<string>()
        const videoItems: any[] = [
          ...(ytResponses[0]?.items ?? []).map((i: any) => ({ ...i, _rawQuery: false })),
          ...(ytResponses[1]?.items ?? []).map((i: any) => ({ ...i, _rawQuery: false })),
          ...(ytResponses[2]?.items ?? []).map((i: any) => ({ ...i, _rawQuery: false })),
          ...(ytResponses[3]?.items ?? []).map((i: any) => ({ ...i, _rawQuery: true })),
        ]
          .filter((item: any) => {
            const id = item.id?.videoId
            if (!id || seenVideoIds.has(id)) return false
            seenVideoIds.add(id); return true
          })
          .filter((item: any) => !isEditorial(item.snippet.title))
          .filter((item: any) => item._rawQuery || relevantEnough(item.snippet.title))
          .filter((item: any) => {
            const cid = item.snippet.channelId
            if (seenChannels.has(cid)) return false
            seenChannels.add(cid); return true
          })
          .map((item: any) => {
            const title = item.snippet.title.replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"')
            return {
              id: item.id.videoId,
              type: 'video',
              title,
              channel: item.snippet.channelTitle,
              publishedAt: item.snippet.publishedAt,
              language: item.snippet.defaultLanguage || item.snippet.defaultAudioLanguage || detectLanguage(title),
              sourceType: classifyVideoSource(item.snippet.channelTitle, title),
              platform: 'youtube',
              url: `https://youtube.com/watch?v=${item.id.videoId}`,
              viewCount: 0,
              visualScore: null,
            }
          })

        // YouTube view counts
        if (videoItems.length > 0 && youtubeKey) {
          const ids = videoItems.map(v => v.id).join(',')
          const statsData = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}&key=${youtubeKey}`).then(r => r.json()).catch(() => ({ items: [] }))
          const statsMap: Record<string, number> = {}
          for (const item of statsData.items ?? []) statsMap[item.id] = parseInt(item.statistics?.viewCount ?? '0', 10)
          videoItems.forEach(v => { v.viewCount = statsMap[v.id] ?? 0 })
        }

        // NewsAPI articles
        const articleItems: any[] = (newsData.articles ?? [])
          .filter((a: any) => a.title && a.title !== '[Removed]' && a.url)
          .filter((a: any) => relevantEnough(a.title + ' ' + (a.description ?? ''), true))
          .map((a: any, i: number) => {
            const title = a.title.replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"')
            return {
              id: `news-${i}-${Date.now()}`,
              type: 'article',
              title,
              channel: a.source?.name ?? 'Unknown',
              description: a.description ?? '',
              publishedAt: a.publishedAt ?? new Date().toISOString(),
              language: detectLanguage(title + ' ' + (a.description ?? '')),
              sourceType: classifyArticleSource(a),
              platform: 'newsapi',
              url: a.url,
              viewCount: 0,
              visualScore: null,
            }
          })

        // Bing social
        const parseBingItems = (data: any, platform: 'tiktok' | 'instagram') => {
          if (!data?.webPages?.value) return []
          const seenUrls = new Set<string>()
          return (data.webPages.value as any[])
            .filter((item: any) => item.datePublished && item.url)
            .map((item: any) => {
              if (seenUrls.has(item.url)) return null
              seenUrls.add(item.url)
              const title = (item.name || '').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&quot;/g,'"')
              const t = title.toLowerCase() + ' ' + (item.snippet || '').toLowerCase()
              if (!relevantEnough(t)) return null
              return {
                id: item.url,
                type: 'video',
                title,
                channel: item.displayUrl?.split('/')[2]?.replace('www.','') ?? platform,
                publishedAt: item.datePublished,
                language: detectLanguage(title),
                sourceType: isEditorial(title) ? 'aggregated' : 'raw',
                platform,
                url: item.url,
                viewCount: 0,
                visualScore: null,
              }
            }).filter(Boolean)
        }

        const socialResults = [
          ...parseBingItems(tiktokData, 'tiktok'),
          ...parseBingItems(instaData, 'instagram'),
        ]

        const allResults = [...videoItems, ...articleItems, ...socialResults]

        if (allResults.length === 0) {
          send({ result: { query, scores: { corroboration: 0, outrage: 5, simplicity: 5, credibility: 5, debunked: false, agencyCount: 0, factCheckCount: 0 }, results: [], narrative: '', factCheckArticles: [] } })
          return
        }

        // Timing relative to earliest credible source.
        // Anchor to agency/major first (reliable timestamps), then independent/raw,
        // then absolute earliest. Unverified pre-posts will show as negative hours — that's intentional.
        const timeOf = (types: string[]) => {
          const ts = allResults
            .filter(r => types.includes(r.sourceType))
            .map(r => new Date(r.publishedAt).getTime())
            .filter(t => !isNaN(t))
          return ts.length > 0 ? Math.min(...ts) : null
        }
        const allTimes = allResults.map(r => new Date(r.publishedAt).getTime()).filter(t => !isNaN(t))
        const referenceTime =
          timeOf(['agency', 'major']) ??
          timeOf(['agency', 'major', 'independent', 'raw']) ??
          (allTimes.length > 0 ? Math.min(...allTimes) : Date.now())
        const resultsWithTiming = allResults.map(r => ({
          ...r,
          hoursAfterSource: Math.round((new Date(r.publishedAt).getTime() - referenceTime) / (1000 * 60 * 60) * 10) / 10,
        }))

        // ── Step 4: AI analysis ───────────────────────────────────────────
        let narrative = ''
        const visualScores: Record<string, number> = {}
        let outrageScore    = 5
        let simplicityScore = 5
        let credibilityScore = 5

        if (anthropicKey && resultsWithTiming.length > 0) {
          send({ step: 4 })

          const anthropicFetch = (body: object) => fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify(body),
          }).then(r => r.json())

          const SOURCE_RANK: Record<string, number> = { agency: 0, major: 1, independent: 2, raw: 3, unverified: 4, secondary: 5, aggregated: 6 }
          const ytResults = resultsWithTiming.filter(r => r.platform === 'youtube')
          // Prefer highest-credibility source as visual reference; use time as tiebreaker
          const refVideo  = [...ytResults].sort((a, b) =>
            (SOURCE_RANK[a.sourceType] ?? 9) - (SOURCE_RANK[b.sourceType] ?? 9) ||
            a.hoursAfterSource - b.hoursAfterSource
          )[0]
          const otherVids = ytResults.filter(r => r.id !== refVideo?.id)

          const [visionRes, analysisRes] = await Promise.all([
            refVideo && otherVids.length > 0
              ? anthropicFetch({
                  model: 'claude-sonnet-4-6',
                  max_tokens: 128,
                  messages: [{
                    role: 'user',
                    content: [
                      { type: 'text', text: `Context: "${query}". Reference video below. Score each other video's visual similarity to the same physical scene (0–10). Return only a JSON array.` },
                      { type: 'text', text: `REFERENCE — "${refVideo.title}":` },
                      { type: 'image', source: { type: 'url', url: `https://img.youtube.com/vi/${refVideo.id}/hqdefault.jpg` } },
                      { type: 'image', source: { type: 'url', url: `https://img.youtube.com/vi/${refVideo.id}/1.jpg` } },
                      { type: 'image', source: { type: 'url', url: `https://img.youtube.com/vi/${refVideo.id}/2.jpg` } },
                      { type: 'image', source: { type: 'url', url: `https://img.youtube.com/vi/${refVideo.id}/3.jpg` } },
                      ...otherVids.flatMap((r: any, i: number) => [
                        { type: 'text', text: `#${i + 1} — "${r.channel}":` },
                        { type: 'image', source: { type: 'url', url: `https://img.youtube.com/vi/${r.id}/hqdefault.jpg` } },
                        { type: 'image', source: { type: 'url', url: `https://img.youtube.com/vi/${r.id}/2.jpg` } },
                      ]),
                    ],
                  }]
                }).catch(() => null)
              : Promise.resolve(null),

            anthropicFetch({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 300,
              messages: [{
                role: 'user',
                content: `Analyze this news claim and its sources for credibility. Respond with JSON only (no markdown):
{"narrative":"max 100 words: direct credibility verdict — are serious outlets covering it? does the source mix suggest real or fabricated? mention agency presence or absence","outrageScore":0-10,"simplicityScore":0-10,"credibilityScore":0-10}

outrageScore: emotional manipulation in titles (0=neutral/factual, 10=highly emotional/outrage-bait)
simplicityScore: narrative consistency across sources (10=all consistent, 0=contradictory)
credibilityScore: overall credibility of the claim based on who covers it and how (0=almost certainly false, 5=unverified, 10=confirmed by credible sources)

Claim: "${query}"
Sources (${resultsWithTiming.length} total — ${videoItems.length} videos, ${articleItems.length} articles):
${JSON.stringify(resultsWithTiming.slice(0, 14).map((r: any) => ({ title: r.title, source: r.channel, type: r.sourceType, platform: r.platform, hours: r.hoursAfterSource, lang: r.language })))}`,
              }]
            }).catch(() => null),
          ])

          // Parse visual scores
          if (refVideo && visionRes) {
            try {
              const raw = visionRes?.content?.[0]?.text ?? '[]'
              const scores: number[] = JSON.parse(raw.match(/\[[\d.,\s]+\]/)?.[0] ?? '[]')
              otherVids.forEach((r: any, i: number) => {
                if (typeof scores[i] === 'number') visualScores[r.id] = Math.max(0, Math.min(10, scores[i]))
              })
            } catch {}
          }

          // Parse analysis
          try {
            const text  = analysisRes?.content?.[0]?.text ?? '{}'
            const match = text.match(/\{[\s\S]*?\}/)
            const parsed = JSON.parse(match?.[0] ?? '{}')
            narrative        = parsed.narrative?.trim() ?? ''
            outrageScore     = typeof parsed.outrageScore     === 'number' ? Math.max(0, Math.min(10, parsed.outrageScore))     : 5
            simplicityScore  = typeof parsed.simplicityScore  === 'number' ? Math.max(0, Math.min(10, parsed.simplicityScore))  : 5
            credibilityScore = typeof parsed.credibilityScore === 'number' ? Math.max(0, Math.min(10, parsed.credibilityScore)) : 5
          } catch {}

          send({ _debug: { outrageScore, simplicityScore, narrativeLen: narrative.length, vScores: visualScores } })
        }

        const finalResults = resultsWithTiming.map((r: any) => ({
          ...r,
          visualScore: visualScores[r.id] ?? null,
        }))

        // ── Fact-check detection ──────────────────────────────────────────
        const factCheckHits = (factCheckData?.articles ?? []).filter((a: any) =>
          FACTCHECK_DOMAINS.some(d => (a.url ?? '').includes(d))
        ).slice(0, 3).map((a: any) => ({
          title: a.title,
          url: a.url,
          source: a.source?.name ?? 'Fact-checker',
        }))
        const debunked = factCheckHits.length > 0

        // ── Credibility-aware scoring ─────────────────────────────────────
        // Agencies & major outlets are positive signals.
        // Unverified sources with high outrage are penalized.
        const agencyCount = finalResults.filter((r: any) => r.sourceType === 'agency').length
        const majorCount  = finalResults.filter((r: any) => r.sourceType === 'major').length
        const outrageMultiplier = outrageScore >= 8 ? 0.1 : outrageScore >= 6 ? 0.4 : outrageScore >= 4 ? 0.75 : 1.0
        const credibilityWeightedScore =
          agencyCount * 4 +
          majorCount  * 2 +
          finalResults.filter((r: any) => r.sourceType === 'independent').length * 1 * outrageMultiplier +
          finalResults.filter((r: any) => ['unverified','raw','secondary','aggregated'].includes(r.sourceType)).length * 0.5 * outrageMultiplier

        send({
          result: {
            query,
            scores: {
              corroboration: credibilityWeightedScore,
              outrage: outrageScore,
              simplicity: simplicityScore,
              credibility: credibilityScore,
              debunked,
              agencyCount,
              factCheckCount: factCheckHits.length,
            },
            results: finalResults,
            narrative,
            factCheckArticles: factCheckHits,
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
