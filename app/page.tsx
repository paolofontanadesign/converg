'use client'

import { Fragment, createContext, useContext, useEffect, useRef, useState } from 'react'
import { zipSync, strToU8 } from 'fflate'

const MobileCtx = createContext(false)
const useMobile = () => useContext(MobileCtx)

const steps = [
  { key: 'metadata', label: 'Metadata extraction', detail: 'Title · timestamp · location signals' },
  { key: 'query', label: 'AI claim interpretation', detail: 'Extracting entities · building search strategy...' },
  { key: 'sources', label: 'Searching for independent footage', detail: 'YouTube API · scanning for raw footage...' },
  { key: 'analysis', label: 'Corroboration analysis', detail: 'Classifying footage sources · scoring independence' },
  { key: 'ai', label: 'AI visual analysis', detail: 'Comparing scene thumbnails · synthesising verdict...' },
]

const SOURCE_COLORS: Record<string, string> = {
  raw: '#1a6b4a', secondary: '#3a3a38', aggregated: '#c8c8c4',
  agency: '#1a4a8a', major: '#2a6a9a', independent: '#5a7a5a', unverified: '#b0a8a0',
}
const SOURCE_LABELS: Record<string, string> = {
  raw: 'Raw footage', secondary: 'Secondary', aggregated: 'News pkg',
  agency: 'News agency', major: 'Major outlet', independent: 'Independent', unverified: 'Unverified',
}
const SOURCE_WEIGHTS: Record<string, number> = {
  raw: 1.5, secondary: 1.5, aggregated: 0.5,
  agency: 4, major: 2, independent: 1, unverified: 0.5,
}
const PLATFORM_LABELS: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' }

const MONO = "'DM Mono', monospace"
const SANS = "'DM Sans', sans-serif"

const STOP_WORDS = new Set([
  // English
  'the','a','an','in','of','to','and','for','is','on','at','by','from','with','as','its',
  'this','that','are','was','were','will','not','but','also','after','over','about','more',
  'live','breaking','watch','video','news','update','full','official','raw','footage',
  'new','just','now','today','how','why','what','when','who','which','has','have','had',
  'they','their','there','then','than','into','been','get','got','via',
  // Italian
  'il','lo','la','gli','le','un','una','uno','del','della','dello','dei','delle','degli',
  'che','con','per','nel','nella','negli','nelle','dal','dalla','dai','dalle','sul','sulla',
  'sui','sulle','tra','fra','sono','stato','stata','stati','state','essere','fare','fatto',
  'hanno','aveva','erano','viene','anche','molto','come','dove','quando','cosa',
  'questo','questa','questi','queste','quello','quella','quelli','quelle','loro','tutto',
  'tutti','tutte','ancora','dopo','prima','mentre','però','quindi','oppure','senza',
  // French / Spanish / German / Portuguese
  'del','los','las','una','por','con','para','como','más','pero','sobre','cuando','esto','están','son','fue','han','muy',
  'les','des','dans','sur','pas','plus','par','mais','qui','que','ont','cette','leur','leurs','tout','tous',
  'der','die','das','ein','eine','von','mit','für','bei','nach','über','durch','oder','nicht','auch','wird','sind',
  // Russian / Ukrainian (Cyrillic)
  'это','как','что','или','его','она','они','мне','мы','вы','он','не','на','за','по','из','от','при','под','над','всё','все','было','быть','будет','также','после','через','когда','где','который','которая','которые',
  'це','як','що','або','його','вона','вони','ми','ви','він','не','на','за','по','із','від','при','під','над','усіх','було','бути','буде','також','після','через','коли','де','який','яка','які',
  // Arabic
  'في','من','إلى','على','هذا','هذه','هو','هي','لا','أن','أو','مع','كل','بعد','قبل','حتى','عند','بين','خلال','بعض','عن','إن','كان','التي','الذي','وقد','كما','ذلك','هذه',
])

// ── Shared tooltip ────────────────────────────────────────────────────────────

type Tip = { x: number; y: number; lines: string[] }

function ChartTooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null
  return (
    <div style={{
      position: 'fixed', left: tip.x + 14, top: tip.y - 12,
      background: '#0f0f0e', padding: '7px 11px',
      pointerEvents: 'none', zIndex: 9999,
      boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
    }}>
      {tip.lines.map((l, i) => (
        <div key={i} style={{ fontFamily: MONO, fontSize: '11px', lineHeight: '1.6', color: i === 0 ? '#f7f4ef' : '#888680' }}>{l}</div>
      ))}
    </div>
  )
}

// ── Shared section header ─────────────────────────────────────────────────────

function ChartHeader({ title, sub }: { title: string; sub: string }) {
  const mobile = useMobile()
  const px = mobile ? '0 16px' : undefined
  return (
    <>
      <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0f0f0e', marginBottom: '6px', padding: px }}>{title}</p>
      <p style={{ fontFamily: SANS, fontSize: '13px', color: '#888680', marginBottom: '24px', padding: px }}>{sub}</p>
    </>
  )
}

// ── Chart 1: Cumulative corroboration score over time ────────────────────────

function CorroborationBuildup({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  const sorted = [...results].sort((a, b) => a.hoursAfterSource - b.hoursAfterSource)
  const pL = 52, pR = 16, pT = 38, chartH = 170
  const chartBottom = pT + chartH
  const plotW = 400 - pL - pR
  const xMin = -48, xMax = 48
  const totalScore = sorted.reduce((s, r) => s + (SOURCE_WEIGHTS[r.sourceType] ?? 1), 0)
  const yMax = Math.max(totalScore, 6, 0.1)
  const xS = (h: number) => pL + ((Math.max(xMin, Math.min(xMax, h)) - xMin) / (xMax - xMin)) * plotW
  const yS = (s: number) => chartBottom - (s / yMax) * chartH
  const x0 = xS(0)

  const pts: [number, number][] = [[xMin, 0]]
  const events: { h: number; score: number; r: any }[] = []
  let cum = 0
  for (const r of sorted) {
    const h = Math.max(xMin, Math.min(xMax, r.hoursAfterSource))
    pts.push([h, cum]); cum += SOURCE_WEIGHTS[r.sourceType] ?? 1; pts.push([h, cum])
    events.push({ h, score: cum, r })
  }
  pts.push([xMax, cum])
  const d = pts.map(([h, s], i) => `${i === 0 ? 'M' : 'L'}${xS(h).toFixed(1)},${yS(s).toFixed(1)}`).join(' ')
  const fillPath = d + ` L${xS(xMax).toFixed(1)},${yS(0).toFixed(1)} L${xS(xMin).toFixed(1)},${yS(0).toFixed(1)} Z`

  const finalScore = Math.min(cum, 10)
  const hours = sorted.map(r => r.hoursAfterSource)
  const timeSpan = hours.length > 1 ? Math.max(...hours) - Math.min(...hours) : 0
  const corrHit = events.find(e => e.score >= 6)
  const corrHitH = corrHit ? corrHit.r.hoursAfterSource : null
  const fmtH = (h: number) => { const r = Math.round(Math.abs(h)); if (r < 1) return '<1h'; if (r >= 24) return `${Math.round(r/24)}d`; return `${r}h` }
  const showPartial = yMax >= 2, showCorr = yMax >= 6

  const byType = Object.entries(sorted.reduce((acc: Record<string, number>, r) => { acc[r.sourceType] = (acc[r.sourceType] ?? 0) + 1; return acc }, {}))
    .sort((a, b) => (SOURCE_RANK[a[0]] ?? 9) - (SOURCE_RANK[b[0]] ?? 9))

  const stats = [
    { label: 'Score', value: `${finalScore.toFixed(1)}/10`, color: finalScore >= 6 ? '#1a6b4a' : finalScore >= 2 ? '#888680' : '#c8472a' },
    { label: 'Sources', value: String(sorted.length), color: '#0f0f0e' },
    { label: 'Span', value: fmtH(timeSpan), color: '#888680' },
    { label: corrHitH !== null ? 'Corr. at' : 'Status', value: corrHitH !== null ? (corrHitH >= 0 ? `+${fmtH(corrHitH)}` : fmtH(corrHitH)) : 'Not yet', color: corrHitH !== null ? '#1a6b4a' : '#c8472a' },
  ]

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%', display: 'block' }}>
        <text x="20" y="22" fontSize="10" fontFamily={MONO} fontWeight="600" fill="#1e293b" letterSpacing="0.10em" style={{ textTransform: 'uppercase' }}>Corroboration buildup</text>
        {showCorr && <rect x={pL} y={pT} width={plotW} height={yS(6) - pT} fill="rgba(26,107,74,0.04)" />}
        <line x1={pL} y1={chartBottom} x2={400 - pR} y2={chartBottom} stroke="#e2e8f0" strokeWidth="0.75" />
        {showPartial && <line x1={pL} y1={yS(2)} x2={400 - pR} y2={yS(2)} stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="3,3" />}
        {showCorr && <line x1={pL} y1={yS(6)} x2={400 - pR} y2={yS(6)} stroke="#1a6b4a" strokeWidth="0.5" strokeDasharray="3,3" />}
        <line x1={x0} y1={pT} x2={x0} y2={chartBottom} stroke="#c8472a" strokeWidth="0.75" strokeDasharray="3,3" />
        {showPartial && <text x={pL - 4} y={yS(2) + 3} textAnchor="end" fontSize="8" fill="#64748b" fontFamily={MONO}>2</text>}
        {showCorr && <text x={pL - 4} y={yS(6) + 3} textAnchor="end" fontSize="8" fill="#1a6b4a" fontFamily={MONO}>6</text>}
        <text x={pL - 4} y={chartBottom + 3} textAnchor="end" fontSize="8" fill="#64748b" fontFamily={MONO}>0</text>
        <text x={pL} y={chartBottom + 14} fontSize="8" fill="#64748b" fontFamily={MONO}>−48h</text>
        <text x={x0} y={chartBottom + 14} textAnchor="middle" fontSize="8" fill="#c8472a" fontFamily={MONO}>0</text>
        <text x={400 - pR} y={chartBottom + 14} textAnchor="end" fontSize="8" fill="#64748b" fontFamily={MONO}>+48h</text>
        <path d={fillPath} fill="#1e40af" opacity="0.06" />
        <path d={d} fill="none" stroke="#1e40af" strokeWidth="1.5" strokeLinejoin="round" />
        {events.map(({ h, score, r }, i) => (
          <circle key={i} cx={xS(h)} cy={yS(score)} r={5}
            fill={SOURCE_COLORS[r.sourceType] ?? '#888680'} stroke="#ffffff" strokeWidth="1.5" style={{ cursor: 'pointer' }}
            onMouseEnter={e => show(e, [r.channel, `${SOURCE_LABELS[r.sourceType]} · +${SOURCE_WEIGHTS[r.sourceType]}pts`, `${r.hoursAfterSource >= 0 ? '+' : ''}${r.hoursAfterSource}h → score ${score.toFixed(1)}`])}
            onMouseMove={move} onMouseLeave={hide} />
        ))}
        <line x1="20" y1="228" x2="380" y2="228" stroke="#f1f5f9" strokeWidth="0.75" />
        {stats.map((s, i) => {
          const cx = 24 + (i % 2) * 190, cy = 238 + Math.floor(i / 2) * 54
          return (
            <g key={i}>
              <text x={cx} y={cy + 9} fontSize="8" fontFamily={MONO} fill="#64748b" letterSpacing="0.08em" style={{ textTransform: 'uppercase' }}>{s.label}</text>
              <text x={cx} y={cy + 26} fontSize="15" fontFamily={MONO} fontWeight="700" fill={s.color}>{s.value}</text>
            </g>
          )
        })}
        <line x1="20" y1="352" x2="380" y2="352" stroke="#f1f5f9" strokeWidth="0.75" />
        {byType.map(([type, count], i) => {
          const bx = 24 + i * 70; if (bx > 350) return null
          const color = SOURCE_COLORS[type as keyof typeof SOURCE_COLORS] ?? '#888680'
          return (
            <g key={type}>
              <circle cx={bx + 4} cy={370} r={3.5} fill={color} />
              <text x={bx + 12} y={374} fontSize="9" fontFamily={MONO} fill="#475569">{SOURCE_LABELS_SHORT[type] ?? type} {count}</text>
            </g>
          )
        })}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Chart 2: Source type swim lanes × time ───────────────────────────────────

const SOURCE_LABELS_SHORT: Record<string, string> = {
  agency: 'Agency', major: 'Major', independent: 'Indep.', unverified: 'Unverf.', raw: 'Raw', secondary: 'Second.', aggregated: 'Aggr.',
}

function SwimLanes({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  const allLanes = ['agency', 'major', 'independent', 'unverified', 'raw', 'secondary', 'aggregated'] as const
  const lanes = allLanes.filter(l => results.some(r => r.sourceType === l))
  const pL = 82, pR = 12, pT = 38, pB = 36
  const plotW = 400 - pL - pR
  const availH = 400 - pT - pB
  const laneH = Math.min(50, availH / Math.max(lanes.length, 1))
  const totalLanesH = lanes.length * laneH
  const lanesTop = pT + (availH - totalLanesH) / 2
  const xMin = -48, xMax = 48
  const xS = (h: number) => pL + ((Math.max(xMin, Math.min(xMax, h)) - xMin) / (xMax - xMin)) * plotW
  const x0 = xS(0)
  const ticks = [-48, -24, 0, 24, 48]
  const xAxisY = lanesTop + totalLanesH + 16

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%', display: 'block' }}>
        <text x="20" y="22" fontSize="10" fontFamily={MONO} fontWeight="600" fill="#1e293b" letterSpacing="0.10em" style={{ textTransform: 'uppercase' }}>Source independence × time</text>
        {ticks.map(t => (
          <line key={t} x1={xS(t)} y1={lanesTop} x2={xS(t)} y2={lanesTop + totalLanesH}
            stroke={t === 0 ? 'rgba(200,71,42,0.18)' : '#edeae3'} strokeWidth={t === 0 ? 1 : 0.5} />
        ))}
        {lanes.map((lane, li) => {
          const y = lanesTop + li * laneH
          const laneResults = results.filter(r => r.sourceType === lane)
          const color = SOURCE_COLORS[lane]
          return (
            <g key={lane}>
              <rect x={pL} y={y + 4} width={plotW} height={laneH - 8} fill={li % 2 === 0 ? 'rgba(30,64,175,0.04)' : 'transparent'} />
              <text x={pL - 6} y={y + laneH / 2 - 4} textAnchor="end" fontSize="9" fill={color} fontFamily={MONO} fontWeight="600" style={{ textTransform: 'uppercase' }}>{SOURCE_LABELS_SHORT[lane]}</text>
              <text x={pL - 6} y={y + laneH / 2 + 8} textAnchor="end" fontSize="8" fill="#64748b" fontFamily={MONO}>{laneResults.length}×</text>
              {laneResults.map((r, i) => (
                <circle key={i} cx={xS(r.hoursAfterSource)} cy={y + laneH / 2}
                  r={6} fill={color} opacity={0.9} stroke="#ffffff" strokeWidth="1.5" style={{ cursor: 'pointer' }}
                  onMouseEnter={e => show(e, [r.channel, `${SOURCE_LABELS[lane]} · ${r.hoursAfterSource >= 0 ? '+' : ''}${r.hoursAfterSource}h`])}
                  onMouseMove={move} onMouseLeave={hide} />
              ))}
            </g>
          )
        })}
        <line x1={x0} y1={lanesTop} x2={x0} y2={lanesTop + totalLanesH} stroke="#c8472a" strokeWidth="1.5" strokeDasharray="3,3" />
        <line x1={pL} y1={lanesTop + totalLanesH + 2} x2={400 - pR} y2={lanesTop + totalLanesH + 2} stroke="#e2e8f0" strokeWidth="0.75" />
        {ticks.map(t => (
          <text key={t} x={xS(t)} y={xAxisY}
            textAnchor={t === -48 ? 'start' : t === 48 ? 'end' : 'middle'}
            fontSize="8" fill={t === 0 ? '#c8472a' : '#888680'} fontFamily={MONO}>
            {t === 0 ? '0' : `${t > 0 ? '+' : ''}${t}h`}
          </text>
        ))}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Chart B: Score waterfall ──────────────────────────────────────────────────

function ScoreWaterfall({ results, aiScores, corroborationScore }: {
  results: any[]; aiScores: { outrage: number; simplicity: number; credibility: number }; corroborationScore: number
}) {
  const rawScore = Math.min(results.reduce((s, r) => s + (SOURCE_WEIGHTS[r.sourceType] ?? 1), 0), 10)
  const outrMult = aiScores.outrage >= 8 ? 0.1 : aiScores.outrage >= 6 ? 0.4 : aiScores.outrage >= 4 ? 0.75 : 1.0
  const afterOutrage = Math.min(rawScore * outrMult, 10)
  const credGate = 0.10 + (aiScores.credibility / 10) * 0.90
  const afterGate = Math.min(afterOutrage * credGate, 10)
  const final = Math.min(corroborationScore, 10)
  const steps = [
    { label: 'Raw coverage', value: rawScore, color: '#555452', desc: `${results.length} sources weighted` },
    { label: 'After outrage', value: afterOutrage, color: aiScores.outrage >= 6 ? '#c8472a' : '#888680', desc: `Outrage ${aiScores.outrage}/10 → ×${outrMult.toFixed(2)}` },
    { label: 'After credibility', value: afterGate, color: aiScores.credibility >= 6 ? '#1a6b4a' : '#c8472a', desc: `Credibility ${aiScores.credibility}/10 → ×${credGate.toFixed(2)}` },
    { label: 'Final score', value: final, color: '#1e293b', desc: 'Capped at 10' },
  ]
  const max = Math.max(...steps.map(s => s.value), 0.1)
  const pT = 38, rowH = 86, barL = 160, barR = 340, barW = barR - barL

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%', display: 'block' }}>
        <text x="20" y="22" fontSize="10" fontFamily={MONO} fontWeight="600" fill="#1e293b" letterSpacing="0.10em" style={{ textTransform: 'uppercase' }}>Score waterfall</text>
        {steps.map((s, i) => {
          const y = pT + i * rowH
          const bw = (s.value / max) * barW
          const isFinal = i === steps.length - 1
          const midY = y + rowH / 2
          return (
            <g key={i}>
              <line x1="20" y1={y + rowH} x2="390" y2={y + rowH} stroke="#f1f5f9" strokeWidth="0.5" />
              <text x={barL - 8} y={midY - 7} textAnchor="end" fontSize="9" fill="#0f0f0e" fontFamily={MONO} style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</text>
              <text x={barL - 8} y={midY + 7} textAnchor="end" fontSize="8" fill="#64748b" fontFamily={MONO}>{s.desc}</text>
              <rect x={barL} y={midY - 11} width={barW} height={22} fill="#f1f5f9" />
              <rect x={barL} y={midY - 11} width={bw} height={22} fill={s.color} opacity={isFinal ? 1 : 0.72} />
              <text x={barR + 8} y={midY + 5} fontSize="14" fontWeight="700" fill={s.color} fontFamily={MONO}>{s.value.toFixed(1)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Chart D: Red flags ────────────────────────────────────────────────────────

function RedFlags({ results, aiScores, unverifiedRatio, aiAnalysisAvailable, corroborationScore }: {
  results: any[]; aiScores: { outrage: number; simplicity: number; credibility: number };
  unverifiedRatio: number; aiAnalysisAvailable: boolean; corroborationScore: number
}) {
  const flags: { label: string; detail: string; severity: 'high'|'medium'|'low' }[] = []
  if (aiScores.outrage >= 8) flags.push({ label: 'Extreme outrage', detail: `Outrage ${aiScores.outrage}/10 — highly emotionally manipulative`, severity: 'high' })
  else if (aiScores.outrage >= 6) flags.push({ label: 'Elevated outrage', detail: `Outrage ${aiScores.outrage}/10 — emotional framing may distort story`, severity: 'medium' })
  if (aiScores.credibility <= 2) flags.push({ label: 'Claim likely false', detail: `Credibility ${aiScores.credibility}/10 — facts appear fabricated`, severity: 'high' })
  else if (aiScores.credibility <= 4) flags.push({ label: 'Low credibility', detail: `Credibility ${aiScores.credibility}/10 — poorly supported`, severity: 'medium' })
  if (unverifiedRatio > 0.7) flags.push({ label: 'Mostly unverified', detail: `${Math.round(unverifiedRatio * 100)}% from unknown channels`, severity: 'medium' })
  if (!results.some(r => r.sourceType === 'agency') && results.length > 0) flags.push({ label: 'No agency coverage', detail: 'No Reuters, AP, or AFP found', severity: 'low' })
  const langs = new Set(results.map(r => r.language ?? 'undetected').filter(l => l !== 'undetected'))
  if (langs.size === 1 && results.length >= 4) flags.push({ label: 'Single language only', detail: 'No cross-border corroboration detected', severity: 'low' })
  if (!aiAnalysisAvailable) flags.push({ label: 'AI analysis unavailable', detail: 'Scores are estimated defaults', severity: 'low' })
  if (aiScores.simplicity <= 3) flags.push({ label: 'Contradictory narratives', detail: `Consistency ${aiScores.simplicity}/10 — conflicting stories`, severity: 'medium' })
  flags.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]))

  const severityColor = (s: string) => s === 'high' ? '#c8472a' : s === 'medium' ? '#c8822a' : '#888680'
  const truncate = (t: string, n: number) => t.length > n ? t.slice(0, n - 1) + '…' : t
  const pT = 38, pL = 16, pR = 16

  if (flags.length === 0) {
    return (
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%', display: 'block' }}>
          <text x="20" y="22" fontSize="10" fontFamily={MONO} fontWeight="600" fill="#1e293b" letterSpacing="0.10em" style={{ textTransform: 'uppercase' }}>Red flags</text>
            <rect x={pL} y={pT + 12} width={400 - pL - pR} height={52} fill="rgba(26,107,74,0.08)" />
          <rect x={pL} y={pT + 12} width={2.5} height={52} fill="#1a6b4a" />
          <text x={pL + 16} y={pT + 43} fontSize="12" fill="#1a6b4a" fontFamily={SANS}>No suspicious signals detected</text>
        </svg>
      </div>
    )
  }

  const availH = 400 - pT - 10
  const rowH = Math.min(52, availH / flags.length)
  const gap = Math.max(4, (availH - flags.length * rowH) / Math.max(flags.length - 1, 1))

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%', display: 'block' }}>
        <text x="20" y="22" fontSize="10" fontFamily={MONO} fontWeight="600" fill="#1e293b" letterSpacing="0.10em" style={{ textTransform: 'uppercase' }}>Red flags</text>
        {flags.map((f, i) => {
          const y = pT + i * (rowH + gap)
          const col = severityColor(f.severity)
          return (
            <g key={i}>
              <rect x={pL} y={y} width={400 - pL - pR} height={rowH} fill={col === '#c8472a' ? 'rgba(200,71,42,0.06)' : col === '#c8822a' ? 'rgba(200,130,42,0.06)' : 'rgba(0,0,0,0.025)'} />
              <rect x={pL} y={y} width={2.5} height={rowH} fill={col} />
              <text x={pL + 12} y={y + rowH * 0.4} fontSize="9" fontWeight="700" fill={col} fontFamily={MONO} style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{truncate(f.label, 40)}</text>
              <text x={pL + 12} y={y + rowH * 0.4 + 14} fontSize="10" fill="#475569" fontFamily={SANS}>{truncate(f.detail, 50)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Chart 9: Corroboration profile radar ─────────────────────────────────────

function DiversityRadar({ results, aiScores }: { results: any[]; aiScores: { outrage: number; simplicity: number } }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)
  if (results.length === 0) return null

  const totalScore = results.reduce((s, r) => s + (SOURCE_WEIGHTS[r.sourceType] ?? 1), 0)
  const highTrustScore = results.filter(r => ['raw','agency'].includes(r.sourceType)).reduce((s, r) => s + (SOURCE_WEIGHTS[r.sourceType] ?? 1), 0)
  const platforms = new Set(results.map(r => r.platform ?? 'youtube')).size
  const langs = new Set(results.map(r => r.language).filter((l: string) => l && l !== 'undetected')).size
  const hrs = results.map(r => r.hoursAfterSource)
  const spread = hrs.length > 1 ? Math.max(...hrs) - Math.min(...hrs) : 0
  const axes = [
    { label: 'Purity', desc: `${Math.round(totalScore > 0 ? (highTrustScore/totalScore)*100 : 0)}% agencies & raw`, value: totalScore > 0 ? highTrustScore / totalScore : 0 },
    { label: 'Platforms', desc: `${platforms} of 3 covered`, value: Math.min(platforms / 3, 1) },
    { label: 'Languages', desc: `${langs} language${langs !== 1 ? 's' : ''}`, value: Math.min(langs / 5, 1) },
    { label: 'Spread', desc: `${spread}h time span`, value: Math.min(spread / 48, 1) },
    { label: 'Objectivity', desc: `Outrage ${aiScores.outrage ?? 5}/10`, value: (10 - (aiScores.outrage ?? 5)) / 10 },
    { label: 'Consistency', desc: `Consistency ${aiScores.simplicity ?? 5}/10`, value: (aiScores.simplicity ?? 5) / 10 },
  ]

  const N = 6, CX = 200, CY = 212, R = 112
  const angle = (i: number) => (i / N) * Math.PI * 2 - Math.PI / 2
  const pt = (i: number, v: number): [number, number] => [CX + Math.cos(angle(i)) * R * v, CY + Math.sin(angle(i)) * R * v]
  const polyStr = (v: number) => Array.from({ length: N }, (_, i) => pt(i, v).join(',')).join(' ')
  const dataStr = axes.map((a, i) => pt(i, a.value).join(',')).join(' ')

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%', display: 'block' }}>
        <text x="20" y="22" fontSize="10" fontFamily={MONO} fontWeight="600" fill="#1e293b" letterSpacing="0.10em" style={{ textTransform: 'uppercase' }}>Corroboration profile</text>
        {[0.25, 0.5, 0.75, 1].map(level => (
          <polygon key={level} points={polyStr(level)} fill="none" stroke={level === 1 ? '#d4d0c8' : '#edeae3'} strokeWidth={level === 1 ? 0.75 : 0.5} />
        ))}
        {Array.from({ length: N }, (_, i) => {
          const [x, y] = pt(i, 1)
          return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#f1f5f9" strokeWidth="0.5" />
        })}
        <polygon points={dataStr} fill="rgba(30,64,175,0.12)" stroke="#1e40af" strokeWidth="1.5" strokeLinejoin="round" />
        {axes.map((a, i) => {
          const [x, y] = pt(i, a.value)
          return (
            <circle key={i} cx={x} cy={y} r={4} fill="#1e40af" style={{ cursor: 'pointer' }}
              onMouseEnter={e => show(e, [a.label, a.desc, `${Math.round(a.value * 100)}%`])}
              onMouseMove={move} onMouseLeave={hide} />
          )
        })}
        {axes.map((a, i) => {
          const ang = angle(i)
          const lx = CX + Math.cos(ang) * (R + 20)
          const ly = CY + Math.sin(ang) * (R + 20)
          const anchor = Math.abs(Math.cos(ang)) < 0.15 ? 'middle' : Math.cos(ang) > 0 ? 'start' : 'end'
          return (
            <g key={i}>
              <text x={lx} y={ly + 4} textAnchor={anchor} fontSize="9" fill="#64748b" fontFamily={MONO} style={{ textTransform: 'uppercase' }}>{a.label}</text>
              <text x={lx} y={ly + 16} textAnchor={anchor} fontSize="9" fill="#1e40af" fontFamily={MONO} fontWeight="600">{Math.round(a.value * 100)}%</text>
            </g>
          )
        })}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Chart 10: First witnesses chain ──────────────────────────────────────────

function WitnessChain({ results }: { results: any[] }) {
  if (results.length === 0) return null

  const sorted = [...results].sort((a, b) => a.hoursAfterSource - b.hoursAfterSource).slice(0, 6)
  const hasVisual = sorted.some(r => r.visualScore !== null)
  const isArticle = (r: any) => ['agency','major','independent','unverified'].includes(r.sourceType)

  return (
    <div style={{}}>
      <ChartHeader title="First witnesses" sub="Earliest independent sources in chronological order — agencies, outlets and raw footage." />
      <div style={{ display: 'flex', overflowX: 'auto', paddingBottom: '4px', gap: '0' }}>
        {sorted.map((r, i) => {
          const color = SOURCE_COLORS[r.sourceType] ?? '#888680'
          const vs: number | null = r.visualScore
          const vsColor = vs === null ? '#888680' : vs >= 7 ? '#1a6b4a' : vs >= 4 ? '#888680' : '#c8c8c4'
          const article = isArticle(r)
          return (
            <div key={r.id ?? r.url ?? i} style={{ flex: '0 0 auto', width: '190px', borderLeft: `3px solid ${color}`, paddingLeft: '14px', paddingRight: '20px' }}>
              <div style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color, marginBottom: '8px' }}>
                #{i + 1} · {SOURCE_LABELS[r.sourceType] ?? r.sourceType}
              </div>
              {/* Article: show outlet badge; Video: show platform */}
              {article ? (
                <div style={{ background: color, display: 'inline-block', padding: '3px 8px', marginBottom: '8px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '9px', color: '#f7f4ef', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {r.channel ?? r.outlet ?? 'Article'}
                  </span>
                </div>
              ) : null}
              <div style={{ fontFamily: SANS, fontSize: '12px', color: '#0f0f0e', lineHeight: 1.4, marginBottom: '8px', maxHeight: '54px', overflow: 'hidden' }}>
                {r.title.length > 72 ? r.title.slice(0, 69) + '…' : r.title}
              </div>
              {!article && (
                <div style={{ fontFamily: MONO, fontSize: '10px', color: '#888680', marginBottom: '2px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.channel}</div>
              )}
              <div style={{ fontFamily: MONO, fontSize: '10px', color: '#888680', marginBottom: '10px' }}>
                {r.hoursAfterSource > 0 ? '+' : ''}{r.hoursAfterSource}h{!article ? ` · ${PLATFORM_LABELS[r.platform] ?? 'YouTube'}` : ''}
              </div>
              {hasVisual && !article && (
                <div style={{ marginBottom: '10px' }}>
                  {vs !== null ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ flex: 1, height: '3px', background: '#edeae3' }}>
                        <div style={{ height: '100%', width: `${vs * 10}%`, background: vsColor, transition: 'width 0.5s ease' }} />
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: '9px', color: vsColor, fontWeight: '600' }}>{vs}/10</span>
                    </div>
                  ) : (
                    <div style={{ fontFamily: MONO, fontSize: '9px', color: '#c8c8c4' }}>no visual score</div>
                  )}
                </div>
              )}
              <a href={r.url} target="_blank" rel="noopener noreferrer"
                 style={{ fontFamily: MONO, fontSize: '9px', color, textDecoration: 'none', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: `1px solid ${color}`, paddingBottom: '1px' }}>
                {article ? 'Read →' : 'Watch →'}
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Chart 13: Visual similarity scores ───────────────────────────────────────

function VisualMatchChart({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  const scored = results.filter(r => r.visualScore !== null && (r.platform ?? 'youtube') === 'youtube')
  if (scored.length === 0) return null

  const sorted = [...scored].sort((a, b) => b.visualScore - a.visualScore)
  const vsColor = (v: number) => v >= 7 ? '#1a6b4a' : v >= 4 ? '#888680' : '#c8c8c4'
  const vsLabel = (v: number) => v >= 7 ? 'High visual match' : v >= 4 ? 'Partial match' : 'Low match'

  return (
    <div style={{}}>
      <ChartHeader title="Visual similarity" sub="AI vision score (0–10) comparing each source thumbnail to the reference scene. High scores indicate the same physical location was filmed." />
      {sorted.map(r => (
        <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 36px', gap: '12px', alignItems: 'center', marginBottom: '12px', cursor: 'default' }}
             onMouseEnter={e => show(e, [r.channel, vsLabel(r.visualScore), `${r.visualScore}/10 visual similarity`, SOURCE_LABELS[r.sourceType as keyof typeof SOURCE_LABELS]])}
             onMouseMove={move} onMouseLeave={hide}
        >
          <span style={{ fontFamily: MONO, fontSize: '10px', color: '#0f0f0e', textAlign: 'right', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.channel}</span>
          <div style={{ height: '18px', background: '#f7f4ef', overflow: 'hidden', position: 'relative' }}>
            <div style={{ height: '100%', width: `${r.visualScore * 10}%`, background: vsColor(r.visualScore), transition: 'width 0.6s ease' }} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: '11px', color: vsColor(r.visualScore), fontWeight: '600', textAlign: 'right' }}>{r.visualScore}/10</span>
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: '10px', color: '#888680', marginTop: '8px', textAlign: 'right' }}>
        scored by claude-sonnet-4-6 vision · YouTube thumbnails only
      </div>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Who reported this ─────────────────────────────────────────────────────────

const SOURCE_RANK: Record<string, number> = { agency: 0, major: 1, independent: 2, raw: 3, unverified: 4, secondary: 5, aggregated: 6 }

// Detects sources that are debunking/fact-checking the claim rather than spreading it
const debunkRe = /bufala|bufale|debunked?|fact.?check|hoax|fake.news|smentis|disinformation|misinformation|è.falso|it.s.fake|it.s.false|not.true|untrue/i
const isDebunker = (title: string) => debunkRe.test(title)

// ── Chart: Geographic spread (world map) ─────────────────────────────────────

const LANG_GEO: Record<string, [number, number]> = {
  en: [40, -95], fr: [46, 2], de: [51, 10], es: [40, -3], it: [42, 12],
  pt: [-14, -51], ru: [61, 105], zh: [35, 105], ja: [36, 138], ko: [36, 128],
  ar: [25, 45], hi: [20, 77], tr: [39, 35], nl: [52, 5], pl: [52, 20],
  sv: [60, 18], uk: [49, 32], he: [31, 35], fa: [33, 53], id: [-2, 118],
  vi: [16, 108], th: [15, 101], ms: [4, 110], ro: [45, 25], cs: [50, 15],
  hu: [47, 19], el: [38, 22], da: [56, 10], fi: [61, 26], no: [60, 10],
  bg: [43, 25], hr: [45, 16], sk: [49, 19], sr: [44, 21], lt: [56, 24],
  lv: [57, 25], et: [59, 25], sl: [46, 15], af: [-28, 25], sw: [-6, 35],
  am: [9, 38], ur: [30, 70], bn: [23, 90], ta: [12, 80],
}

const MAP_W = 800, MAP_H = 380
const toMapXY = (lat: number, lng: number): [number, number] => [
  Math.round((lng + 180) * MAP_W / 360),
  Math.round((90 - lat) * MAP_H / 180),
]

// Continent paths — equirectangular 800×380
// x = (lng + 180) * 800/360,  y = (90 - lat) * 380/180
const WORLD_CONTINENTS = [
  // North America — 22 pts, clockwise from NW Alaska
  { id: 'na', d: 'M 29 63 L 40 74 L 62 68 L 89 65 L 111 78 L 124 89 L 129 110 L 140 120 L 156 141 L 171 152 L 207 147 L 222 138 L 233 117 L 244 102 L 260 98 L 282 91 L 276 78 L 240 47 L 222 38 L 133 38 L 49 42 L 27 51 Z' },
  // Greenland — 7 pts
  { id: 'gl', d: 'M 302 63 L 278 38 L 249 25 L 311 15 L 351 30 L 347 46 L 300 61 Z' },
  // South America — 17 pts, clockwise from NW Colombia
  { id: 'sa', d: 'M 229 173 L 253 169 L 264 169 L 320 179 L 322 200 L 318 211 L 304 237 L 291 248 L 273 264 L 260 279 L 249 304 L 251 308 L 238 279 L 242 243 L 233 222 L 220 200 L 222 190 Z' },
  // Europe — 20 pts: Atlantic coast, Scandinavia, E Europe, Balkans, Iberia
  { id: 'eu', d: 'M 380 112 L 380 100 L 391 89 L 404 82 L 413 68 L 458 40 L 462 42 L 456 63 L 453 70 L 440 76 L 482 70 L 482 91 L 471 93 L 462 104 L 451 112 L 436 110 L 427 97 L 416 99 L 400 112 L 391 112 Z' },
  // Africa — 21 pts: N coast, Horn, S tip, W coast back to NW
  { id: 'af', d: 'M 387 116 L 422 116 L 444 118 L 453 125 L 471 125 L 476 129 L 496 169 L 513 169 L 491 187 L 487 207 L 489 220 L 473 244 L 440 262 L 431 240 L 427 207 L 420 190 L 407 181 L 380 179 L 362 160 L 362 148 L 382 120 Z' },
  // Asia — 27 pts: Turkey → Ural → Siberia → Kamchatka → E coast → SE Asia bump → India bump → Arabia bump → Sinai
  { id: 'as', d: 'M 462 104 L 480 104 L 511 96 L 529 80 L 547 51 L 600 38 L 667 38 L 729 38 L 778 53 L 760 68 L 749 82 L 700 100 L 687 116 L 671 127 L 653 143 L 638 169 L 631 188 L 620 169 L 616 152 L 602 144 L 578 163 L 571 173 L 564 165 L 547 133 L 527 130 L 498 163 L 487 144 L 476 129 Z' },
  // Australia — 8 pts
  { id: 'au', d: 'M 682 220 L 691 215 L 720 220 L 740 241 L 729 270 L 713 270 L 660 264 L 653 234 Z' },
  // Japan — 5 pts
  { id: 'jp', d: 'M 706 113 L 714 100 L 720 101 L 718 110 L 712 118 Z' },
  // British Isles — 5 pts
  { id: 'uk', d: 'M 390 82 L 393 70 L 399 68 L 402 74 L 399 82 Z' },
  // New Zealand — 4 pts
  { id: 'nz', d: 'M 762 286 L 768 274 L 776 278 L 772 292 Z' },
]

function GeoSpreadMap({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  if (results.length === 0) return null

  const langGroups: Record<string, { count: number; views: number; types: string[] }> = {}
  for (const r of results) {
    const lang = (r.language ?? 'en').toLowerCase().slice(0, 2)
    if (!langGroups[lang]) langGroups[lang] = { count: 0, views: 0, types: [] }
    langGroups[lang].count++
    langGroups[lang].views += r.viewCount ?? 0
    langGroups[lang].types.push(r.sourceType)
  }

  const maxCount = Math.max(...Object.values(langGroups).map(g => g.count), 1)
  const langCount = Object.keys(langGroups).length

  // Map rect inside 400×400 square
  const mX = 14, mY = 38, mW = 372, mH = 186
  const sx = mW / MAP_W, sy = mH / MAP_H
  const fmtV = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n/1000)}k` : String(n)

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%', display: 'block' }}>
        <text x="20" y="22" fontSize="10" fontFamily={MONO} fontWeight="600" fill="#1e293b" letterSpacing="0.10em" style={{ textTransform: 'uppercase' }}>Geographic spread</text>

        {/* Ocean background */}
        <rect x={mX} y={mY} width={mW} height={mH} fill="#eef2f7" />
        {/* Graticule lines */}
        {[-60, -30, 0, 30, 60].map(lat => {
          const gy = mY + (90 - lat) * mH / 180
          return <line key={`lat-${lat}`} x1={mX} y1={gy} x2={mX + mW} y2={gy} stroke="#e8e4dc" strokeWidth={lat === 0 ? 0.8 : 0.4} />
        })}
        {[-120, -60, 0, 60, 120].map(lng => {
          const gx = mX + (lng + 180) * mW / 360
          return <line key={`lng-${lng}`} x1={gx} y1={mY} x2={gx} y2={mY + mH} stroke="#e8e4dc" strokeWidth="0.4" />
        })}
        {/* Continents — scale from MAP_W×MAP_H space into mX,mY,mW,mH */}
        <g transform={`translate(${mX},${mY}) scale(${sx},${sy})`}>
          {WORLD_CONTINENTS.map(c => (
            <path key={c.id} d={c.d} fill="#c8d8e8" stroke="#a8c0d8" strokeWidth={1 / Math.min(sx, sy)} />
          ))}
        </g>
        {/* Source dots by language */}
        {Object.entries(langGroups).map(([lang, g]) => {
          const coords = LANG_GEO[lang]
          if (!coords) return null
          const [lat, lng] = coords
          const [rawX, rawY] = toMapXY(lat, lng)
          const cx = mX + rawX * sx
          const cy = mY + rawY * sy
          const r = 4 + (g.count / maxCount) * 12
          const typeCount: Record<string, number> = {}
          for (const t of g.types) typeCount[t] = (typeCount[t] || 0) + 1
          const dominantType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unverified'
          const color = SOURCE_COLORS[dominantType] ?? '#888680'
          return (
            <g key={lang}>
              <circle cx={cx} cy={cy} r={r + 3} fill={color} opacity={0.12} />
              <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.8} stroke="white" strokeWidth="0.75"
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => show(e, [lang.toUpperCase(), `${g.count} source${g.count !== 1 ? 's' : ''}`, `${fmtV(g.views)} views`])}
                onMouseMove={move} onMouseLeave={hide}
              />
              {r >= 9 && (
                <text x={cx} y={cy + 3} textAnchor="middle" fontSize="7" fill="white" fontFamily={MONO}
                  style={{ pointerEvents: 'none' }}>{lang}</text>
              )}
            </g>
          )
        })}

        {/* Lang count label below map */}
        <text x="20" y={mY + mH + 18} fontSize="9" fontFamily={MONO} fill="#64748b" letterSpacing="0.06em" style={{ textTransform: 'uppercase' }}>
          {`${langCount} language${langCount !== 1 ? 's' : ''} detected`}
        </text>
        <text x="20" y={mY + mH + 32} fontSize="8" fontFamily={MONO} fill="#94a3b8">
          Dot size = number of sources · position approximated from language
        </text>
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  )
}


// ── Chart: Audience reach by source type ─────────────────────────────────────

function ReachByType({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  if (results.length === 0) return null

  const typeStats: Record<string, { count: number; views: number }> = {}
  for (const r of results) {
    const t = r.sourceType ?? 'unverified'
    if (!typeStats[t]) typeStats[t] = { count: 0, views: 0 }
    typeStats[t].count++
    typeStats[t].views += r.viewCount ?? 0
  }

  const entries = Object.entries(typeStats).sort((a, b) => b[1].views - a[1].views).filter(([, v]) => v.count > 0)
  const maxViews = Math.max(...entries.map(([, v]) => v.views), 1)
  const fmtV = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n/1000)}k` : n > 0 ? String(n) : '—'

  const pT = 38, pL = 144, barR = 352, barW = barR - pL
  const availH = 400 - pT - 8
  const rowH = Math.min(48, Math.floor(availH / Math.max(entries.length, 1)))

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%', display: 'block' }}>
        <text x="20" y="22" fontSize="10" fontFamily={MONO} fontWeight="600" fill="#1e293b" letterSpacing="0.10em" style={{ textTransform: 'uppercase' }}>Audience reach</text>
        {entries.map(([type, stats], i) => {
          const y = pT + i * rowH
          const bw = Math.max((stats.views / maxViews) * barW, stats.views > 0 ? 2 : 0)
          const color = SOURCE_COLORS[type] ?? '#888680'
          const label = SOURCE_LABELS[type] ?? type
          return (
            <g key={type} style={{ cursor: 'pointer' }}
              onMouseEnter={e => show(e, [label, `${stats.count} source${stats.count !== 1 ? 's' : ''}`, `${fmtV(stats.views)} total views`])}
              onMouseMove={move} onMouseLeave={hide}
            >
              <line x1="20" y1={y + rowH} x2="380" y2={y + rowH} stroke="#f1f5f9" strokeWidth="0.5" />
              <circle cx={22} cy={y + rowH / 2} r={4} fill={color} />
              <text x={pL - 8} y={y + rowH / 2 - 4} textAnchor="end" fontSize="8" fill="#0f0f0e" fontFamily={MONO}
                style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</text>
              <text x={pL - 8} y={y + rowH / 2 + 8} textAnchor="end" fontSize="8" fill="#64748b" fontFamily={MONO}>{stats.count} src</text>
              <rect x={pL} y={y + rowH / 2 - 8} width={barW} height={16} fill="#f1f5f9" />
              <rect x={pL} y={y + rowH / 2 - 8} width={bw} height={16} fill={color} opacity={0.82} />
              <text x={barR + 8} y={y + rowH / 2 + 4} fontSize="11" fontWeight="700" fill={color} fontFamily={MONO}>{fmtV(stats.views)}</text>
            </g>
          )
        })}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Chart: Language distribution ──────────────────────────────────────────────

const LANG_NAMES: Record<string, string> = {
  en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
  pt: 'Portuguese', ru: 'Russian', zh: 'Chinese', ja: 'Japanese', ko: 'Korean',
  ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', nl: 'Dutch', pl: 'Polish',
  sv: 'Swedish', uk: 'Ukrainian', he: 'Hebrew', fa: 'Persian', id: 'Indonesian',
  vi: 'Vietnamese', th: 'Thai', ms: 'Malay', ro: 'Romanian', cs: 'Czech',
  hu: 'Hungarian', el: 'Greek', da: 'Danish', fi: 'Finnish', no: 'Norwegian',
}

function LangDistribution({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  if (results.length === 0) return null

  const counts: Record<string, number> = {}
  for (const r of results) {
    const l = (r.language ?? 'en').toLowerCase().slice(0, 2)
    counts[l] = (counts[l] ?? 0) + 1
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxCount = Math.max(...entries.map(([, c]) => c), 1)

  const pT = 38, pL = 126, barR = 352, barW = barR - pL
  const availH = 400 - pT - 8
  const rowH = Math.min(46, Math.floor(availH / Math.max(entries.length, 1)))

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%', display: 'block' }}>
        <text x="20" y="22" fontSize="10" fontFamily={MONO} fontWeight="600" fill="#1e293b" letterSpacing="0.10em" style={{ textTransform: 'uppercase' }}>Language spread</text>
        {entries.map(([lang, count], i) => {
          const y = pT + i * rowH
          const bw = Math.max((count / maxCount) * barW, 2)
          const pct = Math.round((count / results.length) * 100)
          return (
            <g key={lang} style={{ cursor: 'pointer' }}
              onMouseEnter={e => show(e, [LANG_NAMES[lang] ?? lang.toUpperCase(), `${count} source${count !== 1 ? 's' : ''}`, `${pct}% of total`])}
              onMouseMove={move} onMouseLeave={hide}
            >
              <line x1="20" y1={y + rowH} x2="380" y2={y + rowH} stroke="#f1f5f9" strokeWidth="0.5" />
              <text x={pL - 8} y={y + rowH / 2 - 4} textAnchor="end" fontSize="8" fill="#0f0f0e" fontFamily={MONO}
                style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{LANG_NAMES[lang] ?? lang.toUpperCase()}</text>
              <text x={pL - 8} y={y + rowH / 2 + 8} textAnchor="end" fontSize="8" fill="#64748b" fontFamily={MONO}>{lang.toUpperCase()} · {pct}%</text>
              <rect x={pL} y={y + rowH / 2 - 8} width={barW} height={16} fill="#f1f5f9" />
              <rect x={pL} y={y + rowH / 2 - 8} width={bw} height={16} fill="#1e40af" opacity={0.8} />
              <text x={barR + 8} y={y + rowH / 2 + 4} fontSize="11" fontWeight="700" fill="#1e40af" fontFamily={MONO}>{count}</text>
            </g>
          )
        })}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Chart 12: Upload clock (24h polar) ────────────────────────────────────────

function UploadClock({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  if (results.length < 3) return null

  const counts = Array(24).fill(0)
  const byHour: string[][] = Array.from({ length: 24 }, () => [])
  for (const r of results) {
    const h = new Date(r.publishedAt ?? r.published ?? 0).getUTCHours()
    counts[h]++
    byHour[h].push(r.channel)
  }
  const maxCount = Math.max(...counts, 1)

  const CX = 200, CY = 208, R_IN = 44, R_OUT = 148
  const hourAngle = (h: number) => (h / 24) * Math.PI * 2 - Math.PI / 2
  const GAP = 0.04

  const arcPath = (h: number, count: number) => {
    if (count === 0) return ''
    const r = R_IN + (count / maxCount) * (R_OUT - R_IN)
    const a0 = hourAngle(h) - Math.PI / 24 + GAP
    const a1 = hourAngle(h) + Math.PI / 24 - GAP
    const cos0 = Math.cos(a0), sin0 = Math.sin(a0)
    const cos1 = Math.cos(a1), sin1 = Math.sin(a1)
    return [
      `M${(CX + cos0 * R_IN).toFixed(2)},${(CY + sin0 * R_IN).toFixed(2)}`,
      `L${(CX + cos0 * r).toFixed(2)},${(CY + sin0 * r).toFixed(2)}`,
      `A${r},${r} 0 0,1 ${(CX + cos1 * r).toFixed(2)},${(CY + sin1 * r).toFixed(2)}`,
      `L${(CX + cos1 * R_IN).toFixed(2)},${(CY + sin1 * R_IN).toFixed(2)}`,
      `A${R_IN},${R_IN} 0 0,0 ${(CX + cos0 * R_IN).toFixed(2)},${(CY + sin0 * R_IN).toFixed(2)}`,
    ].join(' ')
  }

  const activeHours = counts.filter(c => c > 0).length
  const peakHour = counts.indexOf(maxCount)
  const spreadLabel = activeHours <= 3
    ? 'Tightly clustered — possible coordination'
    : activeHours <= 8
    ? 'Moderate spread — breaking event'
    : 'Wide spread — organic discovery'

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%', display: 'block' }}>
        <text x="20" y="22" fontSize="10" fontFamily={MONO} fontWeight="600" fill="#1e293b" letterSpacing="0.10em" style={{ textTransform: 'uppercase' }}>Upload clock</text>

        {/* Inner/outer guide circles */}
        <circle cx={CX} cy={CY} r={R_IN} fill="none" stroke="#f1f5f9" strokeWidth="0.75" />
        <circle cx={CX} cy={CY} r={R_OUT} fill="none" stroke="#f1f5f9" strokeWidth="0.5" strokeDasharray="2,4" />

        {/* Hour arcs */}
        {Array.from({ length: 24 }, (_, h) => {
          const path = arcPath(h, counts[h])
          if (!path) return null
          return (
            <path key={h} d={path}
              fill={counts[h] === maxCount ? '#1e40af' : '#3b82f6'}
              opacity={0.45 + (counts[h] / maxCount) * 0.55}
              style={{ cursor: 'pointer' }}
              onMouseEnter={e => show(e, [
                `${String(h).padStart(2, '0')}:00 UTC`,
                `${counts[h]} source${counts[h] !== 1 ? 's' : ''}`,
                ...byHour[h].slice(0, 3),
                byHour[h].length > 3 ? `+${byHour[h].length - 3} more` : '',
              ].filter(Boolean))}
              onMouseMove={move} onMouseLeave={hide}
            />
          )
        })}

        {/* Clock labels: 0h 6h 12h 18h */}
        {[0, 6, 12, 18].map(h => {
          const ang = hourAngle(h)
          const lx = CX + Math.cos(ang) * (R_OUT + 16)
          const ly = CY + Math.sin(ang) * (R_OUT + 16)
          return <text key={h} x={lx} y={ly + 4} textAnchor="middle" fontSize="9" fill="#64748b" fontFamily={MONO}>{h}h</text>
        })}

        {/* Center: active hours count */}
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize="22" fontWeight="700" fill="#1e40af" fontFamily={MONO}>{activeHours}</text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize="8" fill="#64748b" fontFamily={MONO} letterSpacing="0.08em" style={{ textTransform: 'uppercase' }}>hrs active</text>

        {/* Stats row at bottom */}
        <line x1="20" y1="366" x2="380" y2="366" stroke="#f1f5f9" strokeWidth="0.5" />
        <text x="20" y="382" fontSize="8" fontFamily={MONO} fill="#64748b" letterSpacing="0.06em" style={{ textTransform: 'uppercase' }}>{spreadLabel}</text>
        <text x="380" y="382" textAnchor="end" fontSize="8" fontFamily={MONO} fill="#94a3b8">Peak {String(peakHour).padStart(2,'0')}:00 UTC · {maxCount} src</text>
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Visual Verdict Hero ───────────────────────────────────────────────────────

function VisualVerdictHero({ checkedQuery, results, narrative, corroborationScore, corroborationLabel, hasStrongVisual, hasAnyVisual, aiScores, debunked, agencyCount, factCheckArticles, isMobile, outrageMultiplier, aiAnalysisAvailable }: {
  checkedQuery: string; results: any[]; narrative: string; corroborationScore: number; corroborationLabel: string; hasStrongVisual: boolean; hasAnyVisual: boolean; aiScores: { outrage: number; simplicity: number; credibility: number }; debunked: boolean; agencyCount: number; factCheckArticles: { title: string; url: string; source: string }[]; isMobile: boolean; outrageMultiplier: number; aiAnalysisAvailable: boolean
}) {
  const scoreGradientColor = (() => {
    const t = Math.min(Math.max(corroborationScore / 10, 0), 1)
    const hue = Math.round(8 + t * 137) // 8° (red) → 145° (green)
    const sat = Math.round(63 + t * 7)  // 63% → 70%
    const light = Math.round(48 + t * 2) // 48% → 50%
    return `hsl(${hue}, ${sat}%, ${light}%)`
  })()
  const scoreColor = debunked ? '#c8472a' : scoreGradientColor
  const badgeBg = debunked ? '#c8472a'
    : agencyCount > 0 && aiScores.outrage < 6 ? '#1a6b4a'
    : agencyCount > 0 ? 'transparent'
    : aiScores.outrage >= 7 ? 'rgba(200,71,42,0.15)'
    : 'transparent'
  const badgeColor = (debunked || (agencyCount > 0 && aiScores.outrage < 6)) ? '#f7f4ef' : scoreColor
  const badgeBorder = debunked ? '#c8472a'
    : agencyCount > 0 && aiScores.outrage < 6 ? '#1a6b4a'
    : agencyCount > 0 ? '#888680'
    : aiScores.outrage >= 7 ? '#c8472a'
    : '#3a3a38'

  return (
    <div style={{ background: '#0f0f0e' }}>

      {/* Score + AI assessment + verdict */}
      <div style={{ padding: isMobile ? '32px 20px 48px' : '48px 40px 56px', display: 'flex', gap: '48px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Score block */}
        <div style={{ flex: '0 0 auto', minWidth: isMobile ? 'unset' : '300px' }}>

          {/* Number */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontFamily: MONO, fontSize: isMobile ? '72px' : '96px', fontWeight: 700, lineHeight: 1, color: scoreColor }}>{corroborationScore.toFixed(1)}</span>
            <span style={{ fontFamily: MONO, fontSize: '28px', fontWeight: 400, color: '#3a3a38', lineHeight: 1 }}>/10</span>
          </div>

          {/* Scale hint */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', maxWidth: '260px' }}>
            <span style={{ fontFamily: MONO, fontSize: '10px', color: '#555452', letterSpacing: '0.06em' }}>0 = no sources</span>
            <span style={{ fontFamily: MONO, fontSize: '10px', color: '#555452', letterSpacing: '0.06em' }}>10 = fully corroborated</span>
          </div>

          {/* Verdict badge */}
          <div style={{
            fontFamily: MONO, fontSize: '13px', letterSpacing: '0.12em', textTransform: 'uppercase',
            padding: '12px 20px', marginBottom: '28px',
            background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}`, display: 'inline-block',
          }}>
            {corroborationLabel}
          </div>

          {/* Fact-checkers */}
          {factCheckArticles.length > 0 && (
            <div style={{ padding: '14px 16px', border: '1px solid #c8472a', background: 'rgba(200,71,42,0.08)', maxWidth: '300px' }}>
              <p style={{ fontFamily: MONO, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#c8472a', marginBottom: '10px', fontWeight: '600' }}>⚠ Fact-checkers flagged this</p>
              {factCheckArticles.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none', marginBottom: '8px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '11px', color: '#888680', marginRight: '6px' }}>{a.source}</span>
                  <span style={{ fontFamily: SANS, fontSize: '13px', color: '#c8c8c4', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.title}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* AI assessment */}
        {narrative && (
          <div style={{ flex: '1 1 300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <p style={{ fontFamily: MONO, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#888680', margin: 0 }}>AI assessment</p>
              {!aiAnalysisAvailable && (
                <span style={{ fontFamily: MONO, fontSize: '9px', color: '#555452', letterSpacing: '0.06em' }}>— scores estimated (analysis unavailable)</span>
              )}
            </div>
            <p style={{ fontFamily: SANS, fontSize: '16px', color: '#c8c8c4', lineHeight: 1.7, marginBottom: '28px' }}>
              {narrative}
            </p>
            {/* Stat cards */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ padding: '14px 18px', border: `1px solid ${(aiScores.outrage ?? 5) >= 7 ? '#c8472a' : '#3a3a38'}`, minWidth: '90px' }}>
                <div style={{ fontFamily: MONO, fontSize: '11px', color: '#888680', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Outrage</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '28px', fontWeight: 700, color: (aiScores.outrage ?? 5) >= 7 ? '#c8472a' : (aiScores.outrage ?? 5) >= 4 ? '#888680' : '#555452' }}>{aiScores.outrage ?? '—'}</span>
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: '#555452' }}>/10</span>
                </div>
              </div>
              <div style={{ padding: '14px 18px', border: `1px solid ${(aiScores.credibility ?? 5) >= 7 ? '#1a6b4a' : '#3a3a38'}`, minWidth: '90px' }}>
                <div style={{ fontFamily: MONO, fontSize: '11px', color: '#888680', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Credibility</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '28px', fontWeight: 700, color: (aiScores.credibility ?? 5) >= 7 ? '#1a6b4a' : (aiScores.credibility ?? 5) >= 4 ? '#888680' : '#c8472a' }}>{aiScores.credibility ?? '—'}</span>
                  <span style={{ fontFamily: MONO, fontSize: '12px', color: '#555452' }}>/10</span>
                </div>
              </div>
              <div style={{ padding: '14px 18px', border: '1px solid #3a3a38', minWidth: '90px' }}>
                <div style={{ fontFamily: MONO, fontSize: '11px', color: '#888680', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '6px' }}>Sources</div>
                <div style={{ fontFamily: MONO, fontSize: '28px', fontWeight: 700, color: '#c8c8c4' }}>{results.length}</div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Score bar */}
      <div style={{ height: '3px', background: '#1a1a18' }}>
        <div style={{ width: `${Math.min((corroborationScore / 10) * 100, 100)}%`, height: '3px', background: scoreColor, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const chartsRef = useRef<HTMLDivElement>(null)
  const [searched, setSearched] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [checkedQuery, setCheckedQuery] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [narrative, setNarrative] = useState<string>('')
  const [aiScores, setAiScores] = useState<{ outrage: number; simplicity: number; credibility: number }>({ outrage: 5, simplicity: 5, credibility: 5 })
  const [outrageMultiplier, setOutrageMultiplier] = useState(1.0)
  const [serverCorroborationScore, setServerCorroborationScore] = useState<number | null>(null)
  const [debunked, setDebunked] = useState(false)
  const [agencyCount, setAgencyCount] = useState(0)
  const [factCheckArticles, setFactCheckArticles] = useState<{ title: string; url: string; source: string }[]>([])
  const [aiAnalysisAvailable, setAiAnalysisAvailable] = useState(false)
  const [serverUnverifiedRatio, setServerUnverifiedRatio] = useState(0)

  // Visual score multiplier — unverified sources get no bonus (same clip re-uploaded ≠ independent corroboration)
  const visualMultiplier = (r: any): number => {
    if (r.visualScore === null || r.visualScore === undefined) return 1.0
    if (r.sourceType === 'unverified') return r.visualScore >= 3 ? 1.0 : 0.8
    if (r.visualScore >= 7) return 1.5
    if (r.visualScore >= 3) return 1.0
    return 0.8
  }

  // Local score — mirrors backend logic exactly; used as fallback before server responds
  const UNVERIFIED_CAP = 1.5
  const corroborationScore = (() => {
    let total = 0
    let unverifiedTotal = 0
    for (const r of results) {
      const weight = SOURCE_WEIGHTS[r.sourceType] ?? 1
      const rawOutrMult = aiScores.outrage >= 8 ? 0.5 : aiScores.outrage >= 6 ? 0.7 : 1.0
      const outrMult = (r.sourceType === 'agency' || r.sourceType === 'major') ? 1.0 : r.sourceType === 'raw' ? rawOutrMult : outrageMultiplier
      const contribution = weight * outrMult * visualMultiplier(r)
      if (r.sourceType === 'unverified') {
        unverifiedTotal = Math.min(unverifiedTotal + contribution, UNVERIFIED_CAP)
      } else {
        total += contribution
      }
    }
    return total + unverifiedTotal
  })()
  const hasStrongVisual = results.some(r => typeof r.visualScore === 'number' && r.visualScore >= 7 && r.sourceType !== 'unverified')
  const hasAnyVisual = results.some(r => typeof r.visualScore === 'number')

  // Use server-computed ratio (based on filtered final results, not local raw list)
  const unverifiedRatio = serverUnverifiedRatio
  // Always use the same score shown to the user (server applies credibilityGate, local does not)
  const displayScore = serverCorroborationScore ?? corroborationScore
  const corroborationLabel = (() => {
    if (results.length === 0) return '✕  No sources found'
    if (debunked) return '✕  Debunked — false claim'
    if (displayScore >= 8) return hasStrongVisual ? '✓  Fully corroborated' : '✓  Strongly corroborated'
    if (displayScore >= 6 && agencyCount > 0) return hasStrongVisual ? '✓  Confirmed by major agencies' : '✓  Reported by major agencies'
    if (displayScore >= 6) return '✓  Strongly corroborated'
    if (displayScore >= 3 && agencyCount > 0) return '△  Reported — verify independently'
    if (displayScore >= 3 && aiScores.credibility >= 6) return '△  Partially corroborated'
    if (aiScores.outrage >= 7 && unverifiedRatio > 0.5) return '⚠  High outrage — suspicious'
    if (displayScore >= 1.5) return '?  Weak signal — few sources'
    return '?  Unverified — no signal'
  })()
  const corroborationColor = debunked ? 'debunked'
    : agencyCount > 0 && aiScores.outrage < 6 ? 'high'
    : agencyCount > 0 ? 'partial'
    : aiScores.outrage >= 7 ? 'suspicious'
    : 'none'

  const [mounted, setMounted] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    setMounted(true)
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const formatAge = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    const h = Math.floor((Date.now() - d.getTime()) / 3600000)
    if (h < 1) return 'ora'
    if (h < 24) return `${h}h fa`
    const days = Math.floor(h / 24)
    if (days < 30) return `${days}g fa`
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })
  }


  function svgFileFromCell(cell: Element): string | null {
    // Skip button SVGs (download icons) — find only chart SVGs
    const svgs = Array.from(cell.querySelectorAll('svg'))
    const svg = svgs.find(s => !s.closest('button'))
    if (!svg) return null
    const vb = svg.getAttribute('viewBox') ?? '0 0 800 400'
    const parts = vb.trim().split(/[\s,]+/).map(Number)
    const [, , vw = 800, vh = 400] = parts
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb}" width="${vw}" height="${vh}">\n  <rect width="${vw}" height="${vh}" fill="#f7f4ef"/>\n  ${svg.innerHTML}\n</svg>`
  }

  function downloadChartsSVG() {
    const container = chartsRef.current
    if (!container) return
    const cells = Array.from(container.querySelectorAll('[data-chart-name]'))
    if (cells.length === 0) return

    const files: Record<string, Uint8Array> = {}
    cells.forEach(cell => {
      const name = cell.getAttribute('data-chart-name') || 'chart'
      const content = svgFileFromCell(cell)
      if (content) files[`${name}.svg`] = strToU8(content)
    })

    if (Object.keys(files).length === 0) return
    const zip = zipSync(files)
    const slug = checkedQuery.slice(0, 40).replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    const blob = new Blob([zip.buffer as ArrayBuffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `converg-${slug || 'charts'}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function downloadSingleChart(cell: Element) {
    const name = cell.getAttribute('data-chart-name') || 'chart'
    const content = svgFileFromCell(cell)
    if (!content) return
    const blob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name}.svg`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const analyze = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim()
    if (!q) return
    setResults([])
    setSearched(false)
    setCheckedQuery('')
    setError(null)
    if (overrideQuery) setQuery(overrideQuery)
    setNarrative('')
    setAiScores({ outrage: 5, simplicity: 5, credibility: 5 })
    setOutrageMultiplier(1.0)
    setServerCorroborationScore(null)
    setDebunked(false)
    setAgencyCount(0)
    setFactCheckArticles([])
    setAiAnalysisAvailable(false)
    setServerUnverifiedRatio(0)
    setLoading(true)
    setCurrentStep(0)

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
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
            if (typeof data.step === 'number') setCurrentStep(data.step)
            if (data._debug) console.log('[AI debug]', data._debug)
            if (data.result) {
              setCheckedQuery(data.result.query ?? q)
              setResults(data.result.results ?? [])
              setNarrative(data.result.narrative ?? '')
              setFactCheckArticles(data.result.factCheckArticles ?? [])
              if (data.result.scores) {
                const s = data.result.scores
                setAiScores({ outrage: s.outrage ?? 5, simplicity: s.simplicity ?? 5, credibility: s.credibility ?? 5 })
                setOutrageMultiplier(s.outrageMultiplier ?? 1.0)
                setServerCorroborationScore(typeof s.corroboration === 'number' ? s.corroboration : null)
                setDebunked(s.debunked ?? false)
                setAgencyCount(s.agencyCount ?? 0)
                setAiAnalysisAvailable(s.aiAnalysisAvailable ?? false)
                setServerUnverifiedRatio(typeof s.unverifiedRatio === 'number' ? s.unverifiedRatio : 0)
              }
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

  const hasUploadClock = results.length >= 3
  const hasVisualScores = results.some(r => r.visualScore !== null && (r.platform ?? 'youtube') === 'youtube')

  // Card wrapper for dashboard grid cells
  const C = ({ children, span = 6, bg = '#ffffff', style, name }: { children: React.ReactNode; span?: number; bg?: string; style?: React.CSSProperties; name?: string }) => {
    const cellRef = useRef<HTMLDivElement>(null)
    return (
      <div ref={cellRef} data-chart-name={name} style={{ gridColumn: isMobile ? '1 / -1' : `span ${span}`, background: bg, aspectRatio: '1', position: 'relative', overflow: 'hidden', minWidth: 0, ...style }}>
        {children}
      </div>
    )
  }

  return (
    <main style={{ background: '#f7f4ef', minHeight: '100vh' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ borderBottom: '1px solid #0f0f0e', padding: isMobile ? '16px 20px' : '18px 40px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <a href="/" style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: 700, color: '#0f0f0e', textDecoration: 'none' }}>
          Converg<span style={{ color: '#c8472a' }}>.</span>
        </a>
        <span style={{ fontFamily: MONO, fontSize: '10px', color: '#888680', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          News corroboration engine
        </span>
      </header>

      {/* ── Input area ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: searched ? 'flex-start' : 'center', minHeight: searched ? 'auto' : 'calc(100vh - 61px)', padding: isMobile ? '40px 20px' : searched ? '20px 40px 40px' : '0 40px 80px' }}>
        <div style={{ width: '100%', maxWidth: '800px', textAlign: 'center' }}>
        <p style={{ fontFamily: MONO, fontSize: '13px', color: '#c8472a', marginBottom: '24px', letterSpacing: '0.06em' }}>
          OSINT intelligence,{isMobile ? <br /> : ' '}simplified.
        </p>
        <div style={{ width: '100%', overflowX: 'auto', textAlign: 'center', marginBottom: '16px' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: isMobile ? '36px' : '48px', fontWeight: 400, lineHeight: 1.15, color: '#0f0f0e', whiteSpace: 'nowrap', display: 'inline-block', padding: '0 10px' }}>
            Real events leave{isMobile ? <br /> : ' '}<em style={{ color: '#3a3a38' }}>multiple</em> traces.
          </h1>
        </div>
        <p style={{ fontFamily: SANS, fontSize: '15px', color: '#3a3a38', lineHeight: 1.65, marginBottom: '40px' }}>
          Type a few words in any language. Converg scores reliability using source diversity, timing and outrage signals.
        </p>
        <div style={{ position: 'relative', marginBottom: '24px' }}>
          <div style={{ border: `1px solid ${loading ? '#888680' : '#0f0f0e'}`, background: 'white', display: 'flex', opacity: loading ? 0.6 : 1, transition: 'all 0.3s' }}>
            {isMobile ? (
              <textarea
                placeholder="Describe the news…"
                value={query}
                maxLength={100}
                rows={3}
                onChange={e => { setQuery(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !loading) { e.preventDefault(); analyze() } }}
                disabled={loading}
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', padding: '16px 20px', fontFamily: MONO, fontSize: '16px', color: '#0f0f0e', background: 'transparent', resize: 'none', lineHeight: '1.5' }}
              />
            ) : (
              <input
                type="text"
                placeholder="Describe the news…"
                value={query}
                maxLength={100}
                onChange={e => { setQuery(e.target.value) }}
                onKeyDown={e => e.key === 'Enter' && !loading && analyze()}
                disabled={loading}
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', padding: '16px 20px', fontFamily: MONO, fontSize: '16px', color: '#0f0f0e', background: 'transparent' }}
              />
            )}
            <button className="analyze-btn" onClick={() => analyze()} disabled={loading}
              style={{ border: 'none', borderLeft: `1px solid ${loading ? '#888680' : '#0f0f0e'}`, background: loading ? '#888680' : '#0f0f0e', color: '#f7f4ef', fontFamily: MONO, fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 12px', cursor: loading ? 'default' : 'pointer', transition: 'background 0.15s', whiteSpace: 'nowrap', alignSelf: isMobile ? 'flex-end' : undefined }}>
              {loading ? '...' : 'Run →'}
            </button>
          </div>

        </div>

        {loading && (
          <div style={{ marginBottom: '48px', textAlign: 'left' }}>
            {steps.map((step, i) => {
              const done = i < currentStep, active = i === currentStep, pending = i > currentStep
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
                    <p style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '0.06em', color: pending ? '#888680' : '#0f0f0e', marginBottom: '4px' }}>{step.label}</p>
                    <p style={{ fontFamily: MONO, fontSize: '10px', color: '#888680', letterSpacing: '0.04em' }}>{step.detail}</p>
                  </div>
                  <p style={{ fontFamily: MONO, fontSize: '10px', color: done ? '#1a6b4a' : '#888680' }}>{done ? '✓ done' : '—'}</p>
                </div>
              )
            })}
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', fontStyle: 'italic', color: '#888680', marginTop: '32px' }}>Reality needs a moment to surface.</p>
          </div>
        )}

        {error && !loading && (
          <div style={{ border: '1px solid #c8472a', background: '#fff8f7', padding: '20px 24px', marginBottom: '24px', textAlign: 'left' }}>
            <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c8472a', marginBottom: '6px' }}>Error</p>
            <p style={{ fontFamily: SANS, fontSize: '13px', color: '#3a3a38' }}>{error}</p>
          </div>
        )}
        </div>
      </div>

      {/* ── Dashboard ──────────────────────────────────────────────────────── */}
      {searched && !loading && (
        <div style={{ marginTop: '48px', overflowX: 'hidden' }}>

          <VisualVerdictHero
            checkedQuery={checkedQuery}
            results={results}
            narrative={narrative}
            corroborationScore={serverCorroborationScore ?? corroborationScore}
            corroborationLabel={corroborationLabel}
            hasStrongVisual={hasStrongVisual}
            hasAnyVisual={hasAnyVisual}
            aiScores={aiScores}
            debunked={debunked}
            agencyCount={agencyCount}
            factCheckArticles={factCheckArticles}
            isMobile={isMobile}
            outrageMultiplier={outrageMultiplier}
            aiAnalysisAvailable={aiAnalysisAvailable}
          />

          {results.length > 0 ? (
            <MobileCtx.Provider value={isMobile}>
            <div ref={chartsRef} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '1px', background: '#cbd5e1' }}>

              {/* Row 1: buildup | profile | clock */}
              <C span={hasUploadClock ? 1 : 2} name="corroboration-buildup"><CorroborationBuildup results={results} /></C>
              <C span={1} name="corroboration-profile"><DiversityRadar results={results} aiScores={aiScores} /></C>
              {hasUploadClock && <C span={1} name="upload-clock"><UploadClock results={results} /></C>}

              {/* Row 2: swim lanes | waterfall */}
              <C span={1} name="swim-lanes"><SwimLanes results={results} /></C>
              <C span={1} name="score-waterfall"><ScoreWaterfall results={results} aiScores={aiScores} corroborationScore={corroborationScore} /></C>
              <C span={1} name="geo-spread"><GeoSpreadMap results={results} /></C>

            </div>
            </MobileCtx.Provider>
          ) : (
            <div style={{ maxWidth: '760px', margin: '48px 0', padding: isMobile ? '0 20px' : '0 40px' }}>
              <div style={{ border: '1px solid #edeae3', background: 'white', padding: '32px' }}>
                <p style={{ fontFamily: MONO, fontSize: '11px', color: '#888680' }}>
                  No independent sources found. Converg does not render a verdict.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Download charts ────────────────────────────────────────────────── */}
      {searched && !loading && results.length > 0 && (
        <div style={{ display: 'flex' }}>
          <button
            onClick={downloadChartsSVG}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', borderTop: '1px solid #cbd5e1', padding: '14px 20px', fontFamily: MONO, fontSize: '11px', letterSpacing: '0.06em', color: '#0f0f0e', cursor: 'pointer', justifyContent: 'center', width: '100%' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="#0f0f0e" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            DOWNLOAD ALL CHARTS (.ZIP)
          </button>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div style={{ background: '#0f0f0e', padding: isMobile ? '32px 20px' : '40px' }}>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: isMobile ? '16px' : '24px' }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: isMobile ? '16px' : '22px', fontWeight: 400, color: '#f7f4ef', lineHeight: 1.45 }}>
            <em>Converg is pure heuristics — source authority, emotional tone and coverage rarity, cross-referenced.</em>
          </span>
          <a href="https://instagram.com/paolofontanadesign" target="_blank" rel="noopener noreferrer"
             style={{ fontFamily: MONO, fontSize: '11px', color: '#f7f4ef', textDecoration: 'none', letterSpacing: '0.06em', borderBottom: '1px solid #3a3a38', paddingBottom: '1px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            @paolofontanadesign ↗
          </a>
        </div>
      </div>

    </main>
  )
}
