'use client'

import { useState } from 'react'

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K views`
  if (n > 0) return `${n} views`
  return ''
}

const steps = [
  { key: 'metadata', label: 'Metadata extraction', detail: 'Title · timestamp · location signals' },
  { key: 'query', label: 'Corroboration query generation', detail: 'Building footage search variants...' },
  { key: 'sources', label: 'Searching for independent footage', detail: 'YouTube API · scanning for raw footage...' },
  { key: 'analysis', label: 'Corroboration analysis', detail: 'Classifying footage sources · scoring independence' },
]

function Timeline({ results }: { results: any[] }) {
  const buckets: Record<number, number> = {}
  for (let i = -48; i <= 48; i += 6) buckets[i] = 0
  results.forEach(r => {
    const bucket = Math.round(r.hoursAfterSource / 6) * 6
    const key = Math.max(-48, Math.min(48, bucket))
    buckets[key] = (buckets[key] || 0) + 1
  })
  const keys = Object.keys(buckets).map(Number).sort((a, b) => a - b)
  const max = Math.max(...Object.values(buckets), 1)

  return (
    <div style={{ borderTop: '1px solid #edeae3', paddingTop: '40px', marginBottom: '48px' }}>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0f0f0e', marginBottom: '6px' }}>Footage timeline</p>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#888680', marginBottom: '28px' }}>Distribution of independent footage across the 96h window around the source video</p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '120px', marginBottom: '8px' }}>
        {keys.map(k => (
          <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <div style={{
              width: '100%',
              background: k === 0 ? '#c8472a' : k < 0 ? '#888680' : '#1a6b4a',
              height: `${(buckets[k] / max) * 100}px`,
              minHeight: buckets[k] > 0 ? '6px' : '0',
              transition: 'height 0.6s ease'
            }} />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'DM Mono', monospace", fontSize: '9px', color: '#888680' }}>
        <span>−48h</span>
        <span style={{ color: '#c8472a' }}>source video</span>
        <span>+48h</span>
      </div>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: '#888680', marginTop: '12px' }}>
        Footage published before the source video suggests the event was real and already being captured independently before this upload.
      </p>
      <div style={{ display: 'flex', gap: '20px', marginTop: '16px' }}>
        {[{ color: '#888680', label: 'Footage before source' }, { color: '#c8472a', label: 'Source video' }, { color: '#1a6b4a', label: 'Footage after source' }].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '10px', height: '10px', background: item.color }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: '#888680' }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function UploadTiming({ results }: { results: any[] }) {
  const sorted = [...results].sort((a, b) => a.hoursAfterSource - b.hoursAfterSource)
  const max = Math.max(...sorted.map(r => Math.abs(r.hoursAfterSource)), 1)

  return (
    <div style={{ borderTop: '1px solid #edeae3', paddingTop: '40px', marginBottom: '48px' }}>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0f0f0e', marginBottom: '6px' }}>Upload timing</p>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#888680', marginBottom: '8px' }}>Hours between each footage source and the source video</p>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: '#888680', marginBottom: '28px' }}>Sources uploaded independently and close in time — especially before — are the strongest corroboration signal.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {sorted.map((r, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#3a3a38', width: '120px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.channel}</span>
            <div style={{ flex: 1, height: '8px', background: '#edeae3', position: 'relative' }}>
              <div style={{
                position: 'absolute',
                left: r.hoursAfterSource >= 0 ? '0%' : `${50 - (Math.abs(r.hoursAfterSource) / max) * 50}%`,
                width: `${(Math.abs(r.hoursAfterSource) / max) * 100}%`,
                height: '8px',
                background: r.hoursAfterSource < 0 ? '#888680' : '#1a6b4a',
                transition: 'width 0.6s ease'
              }} />
            </div>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: r.hoursAfterSource < 0 ? '#888680' : '#1a6b4a', width: '40px', textAlign: 'right', flexShrink: 0 }}>
              {r.hoursAfterSource > 0 ? '+' : ''}{r.hoursAfterSource}h
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SourceIndependence({ results }: { results: any[] }) {
  const counts = { raw: 0, secondary: 0, aggregated: 0 }
  results.forEach(r => { counts[r.sourceType as keyof typeof counts]++ })
  const total = results.length || 1
  const colors = { raw: '#1a6b4a', secondary: '#3a3a38', aggregated: '#c8c8c4' }
  const labels = { raw: 'Raw footage', secondary: 'Secondary source', aggregated: 'News package' }

  return (
    <div style={{ borderTop: '1px solid #edeae3', paddingTop: '40px', marginBottom: '48px' }}>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0f0f0e', marginBottom: '6px' }}>Source independence</p>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#888680', marginBottom: '28px' }}>Raw footage from unknown channels is stronger corroboration than a news package — outlets can report without verifying</p>
      <div style={{ height: '20px', display: 'flex', marginBottom: '20px', gap: '2px' }}>
        {(['raw', 'secondary', 'aggregated'] as const).map(type =>
          counts[type] > 0 ? (
            <div key={type} style={{ width: `${(counts[type] / total) * 100}%`, background: colors[type], transition: 'width 0.6s ease', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: type === 'aggregated' ? '#888680' : 'white', opacity: 0.9 }}>{counts[type]}</span>
            </div>
          ) : null
        )}
      </div>
      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {(['raw', 'secondary', 'aggregated'] as const).map(type => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '12px', height: '12px', background: colors[type], border: type === 'aggregated' ? '1px solid #b0b0a8' : 'none' }} />
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#3a3a38' }}>{labels[type]} <span style={{ color: '#888680' }}>({counts[type]})</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LanguageDiversity({ results }: { results: any[] }) {
  const langs: Record<string, number> = {}
  results.forEach(r => {
    const l = r.language === 'unknown' ? 'undetected' : r.language
    langs[l] = (langs[l] || 0) + 1
  })
  const sorted = Object.entries(langs).sort((a, b) => b[1] - a[1])
  const total = results.length || 1

  return (
    <div style={{ borderTop: '1px solid #edeae3', paddingTop: '40px', marginBottom: '16px' }}>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0f0f0e', marginBottom: '6px' }}>Language diversity</p>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#888680', marginBottom: '28px' }}>Footage from multiple languages suggests the event was witnessed across different communities</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {sorted.map(([lang, count]) => (
          <div key={lang} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#3a3a38', width: '80px', flexShrink: 0, textTransform: 'uppercase' }}>{lang}</span>
            <div style={{ flex: 1, height: '8px', background: '#edeae3' }}>
              <div style={{ width: `${(count / total) * 100}%`, height: '8px', background: '#1a6b4a', transition: 'width 0.6s ease' }} />
            </div>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680', width: '24px', textAlign: 'right' }}>{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [sourceInfo, setSourceInfo] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  // Raw footage from unknown channels = strongest signal (3)
  // News packages = weakest — outlets report without independently verifying (0.5)
  const sourceWeights: Record<string, number> = { raw: 3, secondary: 1.5, aggregated: 0.5 }
  const corroborationScore = results.reduce((sum, r) => sum + (sourceWeights[r.sourceType] ?? 1), 0)
  const corroborationLabel = corroborationScore >= 6 ? 'Corroborated' : corroborationScore >= 2 ? 'Partial corroboration' : 'No corroboration found'
  const corroborationColor = corroborationScore >= 6 ? 'high' : corroborationScore >= 2 ? 'partial' : 'none'

  const sourceTypeColors: Record<string, string> = { raw: '#1a6b4a', secondary: '#3a3a38', aggregated: '#b0b0a8' }
  const sourceTypeLabels: Record<string, string> = { raw: 'raw footage', secondary: 'secondary', aggregated: 'news package' }

  const analyze = async () => {
    if (!query.trim()) return
    setResults([])
    setSearched(false)
    setSourceInfo(null)
    setError(null)
    setLoading(true)
    setCurrentStep(0)

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (typeof data.step === 'number') {
              setCurrentStep(data.step)
            }
            if (data.result) {
              setSourceInfo(data.result.source ?? null)
              setResults(data.result.results ?? [])
              setSearched(true)
              setLoading(false)
              setCurrentStep(-1)
            }
            if (data.error) {
              setError(data.error)
              setLoading(false)
              setCurrentStep(-1)
            }
          } catch {}
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Unexpected error')
      setLoading(false)
      setCurrentStep(-1)
    }
  }

  return (
    <main style={{ background: '#f7f4ef', minHeight: '100vh' }}>
      <header style={{ borderBottom: '1px solid #0f0f0e', padding: '18px 40px', display: 'flex', alignItems: 'baseline', gap: '16px' }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: 700, color: '#0f0f0e' }}>
          Converg<span style={{ color: '#c8472a' }}>.</span>
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680', letterSpacing: '0.08em', textTransform: 'uppercase', borderLeft: '1px solid #888680', paddingLeft: '16px' }}>
          Visual corroboration engine
        </span>
      </header>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '64px 40px 80px' }}>

        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888680', marginBottom: '16px' }}>Independent footage analysis</p>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '42px', fontWeight: 400, lineHeight: 1.15, color: '#0f0f0e', marginBottom: '12px' }}>
          Reality leaves <em style={{ color: '#3a3a38' }}>multiple traces.</em>
        </h1>

        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', fontWeight: 300, color: '#3a3a38', lineHeight: 1.6, marginBottom: '48px', maxWidth: '520px' }}>
          Paste a YouTube URL. Converg searches for independent footage of the same scene — other people who were there and filmed it too. That is corroboration.
        </p>

        <div style={{ border: `1px solid ${loading ? '#888680' : '#0f0f0e'}`, background: 'white', display: 'flex', marginBottom: '12px', opacity: loading ? 0.6 : 1, transition: 'all 0.3s' }}>
          <input
            type="text"
            placeholder="Paste a YouTube URL to analyze"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && analyze()}
            disabled={loading}
            style={{ flex: 1, border: 'none', outline: 'none', padding: '16px 20px', fontFamily: "'DM Mono', monospace", fontSize: '13px', color: '#0f0f0e', background: 'transparent' }}
          />
          <button
            className="analyze-btn"
            onClick={analyze}
            disabled={loading}
            style={{ border: 'none', borderLeft: `1px solid ${loading ? '#888680' : '#0f0f0e'}`, background: loading ? '#888680' : '#0f0f0e', color: '#f7f4ef', fontFamily: "'DM Mono', monospace", fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 24px', cursor: loading ? 'default' : 'pointer', transition: 'background 0.15s' }}>
            {loading ? '...' : 'Analyze →'}
          </button>
        </div>

        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680', marginBottom: '48px' }}>YouTube search only — no data sent to third parties</p>

        {loading && (
          <div style={{ marginBottom: '48px' }}>
            {steps.map((step, i) => {
              const done = i < currentStep
              const active = i === currentStep
              const pending = i > currentStep
              return (
                <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', padding: '20px 0', borderBottom: '1px solid #edeae3', opacity: pending ? 0.4 : 1, transition: 'opacity 0.4s' }}>
                  <div style={{ width: '20px', height: '20px', flexShrink: 0, position: 'relative', marginTop: '1px' }}>
                    {done && <div style={{ width: '9px', height: '5px', borderLeft: '1.5px solid #1a6b4a', borderBottom: '1.5px solid #1a6b4a', transform: 'rotate(-45deg)', position: 'absolute', top: '5px', left: '4px' }} />}
                    {active && <>
                      <div style={{ width: '16px', height: '16px', border: '1.5px solid #edeae3', borderTopColor: '#0f0f0e', borderRadius: '50%', animation: 'spin 0.8s linear infinite', position: 'absolute', top: '2px', left: '2px' }} />
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#c8472a', position: 'absolute', top: '7px', left: '7px', animation: 'pulse 1s ease-in-out infinite' }} />
                    </>}
                    {pending && <div style={{ width: '16px', height: '16px', border: '1.5px solid #edeae3', borderRadius: '50%', position: 'absolute', top: '2px', left: '2px' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', letterSpacing: '0.06em', color: pending ? '#888680' : '#0f0f0e', marginBottom: '4px' }}>{step.label}</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680', letterSpacing: '0.04em' }}>{step.detail}</p>
                  </div>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: done ? '#1a6b4a' : '#888680' }}>{done ? '✓ done' : '—'}</p>
                </div>
              )
            })}
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', fontStyle: 'italic', color: '#888680', marginTop: '32px' }}>Reality needs a moment to surface.</p>
          </div>
        )}

        {error && !loading && (
          <div style={{ border: '1px solid #c8472a', background: '#fff8f7', padding: '20px 24px', marginBottom: '24px' }}>
            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c8472a', marginBottom: '6px' }}>Error</p>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#3a3a38' }}>{error}</p>
          </div>
        )}

        {searched && !loading && (
          <>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888680', marginBottom: '24px' }}>
              {results.length} independent footage {results.length === 1 ? 'source' : 'sources'} found
            </div>

            <div style={{ border: '1px solid #0f0f0e', background: 'white', padding: '32px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '24px' }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 400, lineHeight: 1.3, color: '#0f0f0e', flex: 1 }}>
                  {sourceInfo ? sourceInfo.title : query}
                </p>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 10px', marginBottom: '4px',
                    background: corroborationColor === 'high' ? '#1a6b4a' : corroborationColor === 'partial' ? '#f0f8f4' : 'transparent',
                    color: corroborationColor === 'high' ? 'white' : corroborationColor === 'partial' ? '#1a6b4a' : '#888680',
                    border: corroborationColor !== 'none' ? '1px solid #1a6b4a' : '1px solid #888680'
                  }}>
                    {corroborationLabel}
                  </div>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680' }}>
                    score {corroborationScore.toFixed(1)} · {results.length} {results.length === 1 ? 'source' : 'sources'}
                  </p>
                </div>
              </div>

              <div style={{ height: '3px', background: '#edeae3', marginBottom: '8px' }}>
                <div style={{ width: `${Math.min((corroborationScore / 12) * 100, 100)}%`, height: '3px', background: corroborationColor !== 'none' ? '#1a6b4a' : '#888680', transition: 'width 0.8s ease' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'DM Mono', monospace", fontSize: '9px', color: '#888680', textTransform: 'uppercase', marginBottom: '24px' }}>
                <span>No corroboration</span><span>Corroborated</span>
              </div>

              {sourceInfo && (
                <div style={{ marginBottom: '16px', padding: '12px 14px', background: '#0f0f0e', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', textTransform: 'uppercase', color: '#888680', marginBottom: '4px' }}>Source video · {sourceInfo.channel}</p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: '#f7f4ef', lineHeight: 1.4 }}>{sourceInfo.title}</p>
                  </div>
                  <a href={sourceInfo.url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: '#888680', textDecoration: 'none', letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0, marginLeft: '16px' }}>View →</a>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                {results.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', border: '1px solid #edeae3', padding: '12px 14px', background: '#f7f4ef', display: 'block' }}>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', textTransform: 'uppercase', color: '#888680', marginBottom: '4px' }}>
                      YouTube · {r.channel} · <span style={{ color: sourceTypeColors[r.sourceType] ?? '#888680' }}>{sourceTypeLabels[r.sourceType] ?? r.sourceType}</span>
                    </p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#0f0f0e', lineHeight: 1.4 }}>{r.title}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: '#888680' }}>{new Date(r.published).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      {r.viewCount > 0 && <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: '#888680' }}>{formatViews(r.viewCount)}</p>}
                    </div>
                  </a>
                ))}
              </div>

              {results.length > 0 && (
                <div style={{ borderTop: '1px solid #edeae3', paddingTop: '8px' }}>
                  <Timeline results={results} />
                  <UploadTiming results={results} />
                  <SourceIndependence results={results} />
                  <LanguageDiversity results={results} />
                </div>
              )}
            </div>

            {results.length === 0 && (
              <div style={{ border: '1px solid #edeae3', background: '#f7f4ef', padding: '32px' }}>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#888680' }}>
                  No independent footage found in the 96h window. Converg does not render a verdict.
                </p>
              </div>
            )}
          </>
        )}

        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680', lineHeight: 1.7, borderTop: '1px solid #edeae3', paddingTop: '24px', marginTop: '40px' }}>
          Converg searches for independent footage of the same event, not authenticity verification.<br />
          Corroboration means other people filmed the same scene. No corroboration means the opposite — nothing more.
        </div>

      </div>
    </main>
  )
}
