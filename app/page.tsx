export default function Home() {
  return (
    <main style={{ background: '#f7f4ef', minHeight: '100vh', fontFamily: 'Georgia, serif' }}>
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
          <input type="text" placeholder="https://... or describe the event" style={{ flex: 1, border: 'none', outline: 'none', padding: '16px 20px', fontFamily: "'DM Mono', monospace", fontSize: '13px', color: '#0f0f0e', background: 'transparent' }} />
          <button className="analyze-btn" style={{ border: 'none', borderLeft: '1px solid #0f0f0e', background: '#0f0f0e', color: '#f7f4ef', fontFamily: "'DM Mono', monospace", fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 24px', cursor: 'pointer', transition: 'background 0.15s' }}>
            Analyze →
          </button>
        </div>

        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680' }}>YouTube · Reddit · Wikimedia — no data sent to third parties</p>

        <hr style={{ border: 'none', borderTop: '1px solid #edeae3', margin: '56px 0' }} />

        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888680', marginBottom: '24px' }}>Sample results</p>

        <div style={{ border: '1px solid #0f0f0e', background: 'white', padding: '32px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '24px' }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 400, lineHeight: 1.3, color: '#0f0f0e', flex: 1 }}>Valencia flooding, Spain — October 29, 2024</p>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 10px', background: '#1a6b4a', color: 'white', marginBottom: '4px' }}>Strongly corroborated</div>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680' }}>14 independent sources</p>
            </div>
          </div>
          <div style={{ height: '3px', background: '#edeae3', marginBottom: '8px' }}><div style={{ width: '92%', height: '3px', background: '#1a6b4a' }}></div></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'DM Mono', monospace", fontSize: '9px', color: '#888680', textTransform: 'uppercase', marginBottom: '24px' }}>
            <span>No corroboration</span><span>Maximum convergence</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            {[
              { platform: 'YouTube', title: 'Aerial footage, industrial area', meta: 'Oct 28 · GPS 39.4°N 0.3°W' },
              { platform: 'Reddit · r/worldnews', title: 'Thread with 6 videos, multiple angles', meta: 'Oct 29 · +2.4k comments' },
              { platform: 'YouTube', title: 'Flooded streets, city centre', meta: 'Oct 29 · GPS 39.5°N 0.4°W' },
            ].map((s, i) => (
              <div key={i} style={{ border: '1px solid #edeae3', padding: '12px 14px', background: '#f7f4ef' }}>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', textTransform: 'uppercase', color: '#888680', marginBottom: '4px' }}>{s.platform}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: '#3a3a38', lineHeight: 1.4 }}>{s.title}</p>
                <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', color: '#888680', marginTop: '6px' }}>{s.meta}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid #edeae3', background: '#f7f4ef', padding: '32px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', gap: '24px' }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '20px', fontWeight: 400, lineHeight: 1.3, color: '#3a3a38', flex: 1 }}>Alleged bridge collapse — single source</p>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '5px 10px', border: '1px solid #888680', color: '#888680', marginBottom: '4px' }}>Not verifiable</div>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680' }}>1 source found</p>
            </div>
          </div>
          <div style={{ height: '3px', background: '#edeae3', marginBottom: '8px' }}><div style={{ width: '6%', height: '3px', background: '#888680' }}></div></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: "'DM Mono', monospace", fontSize: '9px', color: '#888680', textTransform: 'uppercase', marginBottom: '16px' }}>
            <span>No corroboration</span><span>Maximum convergence</span>
          </div>
          <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#888680', paddingTop: '16px', borderTop: '1px solid #edeae3' }}>
            No independent sources found for this event. Converg does not render a verdict.
          </p>
        </div>

        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#888680', lineHeight: 1.7, borderTop: '1px solid #edeae3', paddingTop: '24px', marginTop: '40px' }}>
          Converg never says "fake". It only certifies what it can certify.<br />
          The absence of corroboration is not a verdict — it is information.
        </div>

      </div>
    </main>
  );
}