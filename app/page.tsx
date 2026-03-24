'use client'

import { useState } from 'react'

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const analyze = async () => {
    if (!query.trim()) return
    setLoading(true)
    setSearched(false)
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
    const data = await res.json()
    setResults(data.results || [])
    setLoading(false)
    setSearched(true)
  }

  return (
    <main style={{ background: '#f7f4ef', minHeight: '100vh' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@300;400&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f7f4ef; }
        .analyze-btn:hover { background: #c8472a !important; }
      `}</style>

      <header style={{ borderBottom: '1px solid #0f0f0e', padding: '18px 40px', display: 'flex', alignItems: 'baseline', gap: '16px' }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: 700, color: '#0f0f0e' }}>
          Converg<span style={{ color: '#c8472a' }}>.</span>
        </span>
        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680', letterSpacing: '0.08em', textTransform: 'uppercase', borderLeft: '1px solid #888680', paddingLeft: '16px' }}>
          Multi-source corroboration engine
        </span>
      </header>

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '64px 40px 80px' }}>

        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888680', marginBottom: '16px' }}>Content verification</p>

        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '42px', fontWeight: 400, lineHeight: 1.15, color: '#0f0f0e', marginBottom: '12px' }}>
          Reality leaves <em style={{ color: '#3a3a38' }}>multiple traces.</em>
        </h1>

        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', fontWeight: 300, color: '#3a3a38', lineHeight: 1.6, marginBottom: '48px', maxWidth: '520px' }}>
          Paste a URL or describe an event. Converg searches for independent sources of the same moment and measures the physical convergence between them.
        </p>

        <div style={{ border: '1px solid #0f0f0e', background: 'white', display: 'flex', marginBottom: '12px' }}>
          <input
            type="text"
            placeholder="https://... or describe the event"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && analyze()}
            style={{ flex: 1, border: 'none', outline: 'none', padding: '16px 20px', fontFamily: "'DM Mono', monospace", fontSize: '13px', color: '#0f0f0e', background: 'transparent' }}
          />
          <button
            className="analyze-btn"
            onClick={analyze}
            style={{ border: 'none', borderLeft: '1px solid #0f0f0e', background: '#0f0f0e', color: '#f7f4ef', fontFamily: "'DM Mono', monospace", fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 24px', cursor: 'pointer', transition: 'background 0.15s' }}>
            {loading ? '...' : 'Analyze →'}
          </button>
        </div>

        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680', marginBottom: '48px' }}>YouTube · Reddit · Wikimedia — no data sent to third parties</p>

        {/* Loading */}
        {loading && (
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#888680', letterSpacing: '0.06em' }}>
            Searching independent sources...
          </p>
        )}

        {/* Results */}
        {searched && !loading && (
          <>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888680', marginBottom: '24px' }}>
              {results.length} sources found
            </div>

            <div style={{ border: '1px solid #0f0f0e', background: 'white', padding: '32px', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '24px' }}>
                <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 400, lineHeight: 1.3, color: '#0f0f0e', flex: 1 }}>{query}</p>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{
                    fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 10px', marginBottom: '4px',
                    background: results.length >= 5 ? '#1a6b4a' : results.length >= 2 ? '#f0f8f4' : 'transparent',
                    color: results.length >= 5 ? 'white' : results.length >= 2 ? '#1a6b4a' : '#888680',
                    border: results.length >= 2 ? '1px solid #1a6b4a' : '1px solid #888680'
                  }}>
                    {results.length >= 5 ? 'Strongly corroborated' : results.length >= 2 ? 'Corroborated' : 'Not verifiable'}
                  </div>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680' }}>{results.length} independent sources</p>
                </div>
              </div>

              <div style={{ height: '3px', background: '#edeae3', marginBottom: '8px' }}>
                <div style={{ width: `${Math.min(results.length * 10, 100)}%`, height: '3px', background: results.length >= 2 ? '#1a6b4a' : '#888680', transition: 'width 0.8s ease' }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'DM Mono', monospace", fontSize: '9px', color: '#888680', textTransform: 'uppercase', marginBottom: '24px' }}>
                <span>No corroboration</span><span>Maximum convergence</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {results.map((r, i) => (
                  <a key={i} href={r.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', border: '1px solid #edeae3', padding: '12px 14px', background: '#f7f4ef', display: 'block' }}>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', textTransform: 'uppercase', color: '#888680', marginBottom: '4px' }}>YouTube · {r.channel}</p>
                    <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#0f0f0e', lineHeight: 1.4 }}>{r.title}</p>
                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: '#888680', marginTop: '6px' }}>{new Date(r.published).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </a>
                ))}
              </div>
            </div>

            {results.length === 0 && (
              <div style={{ border: '1px solid #edeae3', background: '#f7f4ef', padding: '32px' }}>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#888680' }}>
                  No independent sources found for this event. Converg does not render a verdict.
                </p>
              </div>
            )}
          </>
        )}

        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680', lineHeight: 1.7, borderTop: '1px solid #edeae3', paddingTop: '24px', marginTop: '40px' }}>
          Converg never says "fake". It only certifies what it can certify.<br />
          The absence of corroboration is not a verdict — it is information.
        </div>

      </div>
    </main>
  )
}