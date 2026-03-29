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
  const mobile = useMobile()
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  const sorted = [...results].sort((a, b) => a.hoursAfterSource - b.hoursAfterSource)
  const W = 620, H = 180, pL = 56, pR = 24, pT = 36, pB = 36
  const xMin = -48, xMax = 48, plotW = W - pL - pR, plotH = H - pT - pB
  const xS = (h: number) => pL + ((h - xMin) / (xMax - xMin)) * plotW
  const totalScore = sorted.reduce((s, r) => s + (SOURCE_WEIGHTS[r.sourceType] ?? 1), 0)
  const yMax = Math.max(totalScore, 6, 0.1)
  const yS = (s: number) => H - pB - (s / yMax) * plotH

  // Build step path + collect event points
  const pts: [number, number][] = [[xMin, 0]]
  const events: { h: number; score: number; r: any }[] = []
  let cum = 0
  for (const r of sorted) {
    const h = Math.max(xMin, Math.min(xMax, r.hoursAfterSource))
    pts.push([h, cum])
    cum += SOURCE_WEIGHTS[r.sourceType] ?? 1
    pts.push([h, cum])
    events.push({ h, score: cum, r })
  }
  pts.push([xMax, cum])

  const d = pts.map(([h, s], i) => `${i === 0 ? 'M' : 'L'}${xS(h).toFixed(1)},${yS(s).toFixed(1)}`).join(' ')
  const fill = d + ` L${xS(xMax).toFixed(1)},${yS(0).toFixed(1)} L${xS(xMin).toFixed(1)},${yS(0).toFixed(1)} Z`
  const x0 = xS(0)
  const showPartial = yMax >= 2
  const showCorr = yMax >= 6

  // Summary stats
  const finalScore = Math.min(cum, 10)
  const hours = sorted.map(r => r.hoursAfterSource)
  const timeSpan = hours.length > 1 ? Math.max(...hours) - Math.min(...hours) : 0
  const corrHit = events.find(e => e.score >= 6)
  const corrHitH = corrHit ? corrHit.r.hoursAfterSource : null
  const byType = Object.entries(
    sorted.reduce((acc: Record<string, number>, r) => {
      acc[r.sourceType] = (acc[r.sourceType] ?? 0) + 1
      return acc
    }, {})
  ).sort((a, b) => (SOURCE_RANK[a[0]] ?? 9) - (SOURCE_RANK[b[0]] ?? 9))

  const fmtH = (h: number) => {
    const r = Math.round(Math.abs(h))
    if (r < 1) return '< 1h'
    if (r >= 24) return `${Math.round(r / 24)}d`
    return `${r}h`
  }
  const stats = [
    { label: 'Final score', value: `${finalScore.toFixed(1)} / 10`, color: finalScore >= 6 ? '#1a6b4a' : finalScore >= 2 ? '#888680' : '#c8472a' },
    { label: 'Sources', value: String(sorted.length), color: '#0f0f0e' },
    { label: 'Time span', value: fmtH(timeSpan), color: '#888680' },
    { label: corrHitH !== null ? 'Corroborated at' : 'Status', value: corrHitH !== null ? (corrHitH >= 0 ? `+${fmtH(corrHitH)}` : `-${fmtH(corrHitH)}`) : 'Not yet', color: corrHitH !== null ? '#1a6b4a' : '#c8472a' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <ChartHeader title="Corroboration buildup" sub="Cumulative score as independent sources accumulate. Each step is a new source." />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        {showCorr && <rect x={pL} y={pT} width={plotW} height={yS(6) - pT} fill="rgba(26,107,74,0.04)" />}
        <line x1={pL} y1={H - pB} x2={W - pR} y2={H - pB} stroke="#edeae3" strokeWidth="1" />
        {showPartial && <line x1={pL} y1={yS(2)} x2={W - pR} y2={yS(2)} stroke="#888680" strokeWidth="0.75" strokeDasharray="4,4" />}
        {showCorr && <line x1={pL} y1={yS(6)} x2={W - pR} y2={yS(6)} stroke="#1a6b4a" strokeWidth="0.75" strokeDasharray="4,4" />}
        <line x1={x0} y1={pT} x2={x0} y2={H - pB} stroke="#c8472a" strokeWidth="1" strokeDasharray="4,3" />
        <text x={x0} y={pT - 8} textAnchor="middle" fontSize="10" fill="#c8472a" fontFamily={MONO}>source</text>
        <path d={fill} fill="#0f0f0e" opacity="0.05" />
        <path d={d} fill="none" stroke="#0f0f0e" strokeWidth="2" strokeLinejoin="round" />
        {showPartial && (
          <>
            <rect x={pL} y={yS(2) - 14} width={58} height={16} fill="#f7f4ef" />
            <text x={pL + 4} y={yS(2) - 3} fontSize="10" fill="#888680" fontFamily={MONO}>partial</text>
          </>
        )}
        {showCorr && (
          <>
            <rect x={pL} y={yS(6) - 14} width={86} height={16} fill="#f7f4ef" />
            <text x={pL + 4} y={yS(6) - 3} fontSize="10" fill="#1a6b4a" fontFamily={MONO} fontWeight="600">corroborated</text>
          </>
        )}
        {showPartial && <text x={pL - 6} y={yS(2) + 4} textAnchor="end" fontSize="10" fill="#888680" fontFamily={MONO}>2</text>}
        {showCorr && <text x={pL - 6} y={yS(6) + 4} textAnchor="end" fontSize="10" fill="#1a6b4a" fontFamily={MONO}>6</text>}
        <text x={pL - 6} y={yS(0) + 4} textAnchor="end" fontSize="10" fill="#888680" fontFamily={MONO}>0</text>
        <text x={pL} y={H - 10} textAnchor="middle" fontSize="10" fill="#888680" fontFamily={MONO}>−48h</text>
        <text x={x0} y={H - 10} textAnchor="middle" fontSize="10" fill="#c8472a" fontFamily={MONO}>0</text>
        <text x={W - pR} y={H - 10} textAnchor="end" fontSize="10" fill="#888680" fontFamily={MONO}>+48h</text>
        {events.map(({ h, score, r }, i) => (
          <circle key={i} cx={xS(h)} cy={yS(score)} r={6}
            fill={SOURCE_COLORS[r.sourceType as keyof typeof SOURCE_COLORS] ?? '#888680'}
            stroke="#f7f4ef" strokeWidth="1.5" style={{ cursor: 'pointer' }}
            onMouseEnter={e => show(e, [
              r.channel,
              `${PLATFORM_LABELS[r.platform] ?? 'YouTube'} · ${SOURCE_LABELS[r.sourceType as keyof typeof SOURCE_LABELS]} · +${SOURCE_WEIGHTS[r.sourceType]}pts`,
              `${r.hoursAfterSource > 0 ? '+' : ''}${r.hoursAfterSource}h from source · score → ${score.toFixed(1)}`,
            ])}
            onMouseMove={move} onMouseLeave={hide}
          />
        ))}
      </svg>

      {/* Data summary below chart */}
      <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', borderTop: '1px solid #edeae3', padding: mobile ? '0 16px' : undefined }}>
        {stats.map(s => (
          <div key={s.label} style={{ padding: '12px 0', borderBottom: '1px solid #f0ede6' }}>
            <div style={{ fontFamily: MONO, fontSize: '9px', color: '#888680', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>{s.label}</div>
            <div style={{ fontFamily: MONO, fontSize: '16px', fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
        {byType.map(([type, count]) => (
          <div key={type} style={{ padding: '9px 0', borderBottom: '1px solid #f0ede6', display: 'grid', gridTemplateColumns: '10px 1fr 24px', gap: '8px', alignItems: 'center' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: SOURCE_COLORS[type as keyof typeof SOURCE_COLORS] ?? '#888680' }} />
            <span style={{ fontFamily: MONO, fontSize: '10px', color: '#0f0f0e' }}>{SOURCE_LABELS[type as keyof typeof SOURCE_LABELS] ?? type}</span>
            <span style={{ fontFamily: MONO, fontSize: '10px', color: '#888680', textAlign: 'right' }}>{count}</span>
          </div>
        ))}
      </div>

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
  const mobile = useMobile()

  const W = 620, laneH = 52, pL = mobile ? 68 : 110, pR = 24, pT = 16, pB = 36
  const xMin = -48, xMax = 48, plotW = W - pL - pR
  const allLanes = ['agency', 'major', 'independent', 'unverified', 'raw', 'secondary', 'aggregated'] as const
  const lanes = allLanes.filter(l => results.some(r => r.sourceType === l))
  const totalH = pT + lanes.length * laneH + pB
  const xS = (h: number) => pL + ((Math.max(xMin, Math.min(xMax, h)) - xMin) / (xMax - xMin)) * plotW
  const x0 = xS(0)

  // Tick marks every 12h
  const ticks = [-48, -36, -24, -12, 0, 12, 24, 36, 48]

  return (
    <div style={{}}>
      <ChartHeader title="Source independence × time" sub="Each dot is a source positioned by upload time. Raw footage and news agencies before the red line are the strongest corroboration signals." />
      <svg viewBox={`0 0 ${W} ${totalH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* vertical tick grid */}
        {ticks.map(t => (
          <line key={t} x1={xS(t)} y1={pT} x2={xS(t)} y2={totalH - pB} stroke={t === 0 ? 'rgba(200,71,42,0.15)' : '#edeae3'} strokeWidth={t === 0 ? 1 : 0.5} />
        ))}
        {/* lanes */}
        {lanes.map((lane, li) => {
          const y = pT + li * laneH
          const laneResults = results.filter(r => r.sourceType === lane)
          const count = laneResults.length
          return (
            <g key={lane}>
              <rect x={pL} y={y + 8} width={plotW} height={laneH - 18} fill={li % 2 === 0 ? '#f7f4ef' : '#f2efe9'} rx="2" />
              {/* lane label + count */}
              <text x={pL - 6} y={y + laneH / 2 - 5} textAnchor="end" fontSize={mobile ? 9 : 11} fill={SOURCE_COLORS[lane]} fontFamily={MONO} fontWeight="600">{mobile ? SOURCE_LABELS_SHORT[lane] : SOURCE_LABELS[lane]}</text>
              <text x={pL - 6} y={y + laneH / 2 + 9} textAnchor="end" fontSize={mobile ? 8 : 10} fill="#888680" fontFamily={MONO}>{count}x</text>
              {/* dots */}
              {laneResults.map((r, i) => (
                <circle
                  key={i}
                  cx={xS(r.hoursAfterSource)} cy={y + laneH / 2}
                  r={7}
                  fill={SOURCE_COLORS[lane]}
                  opacity={0.88}
                  stroke="#f7f4ef" strokeWidth="1.5"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={e => show(e, [
                    r.channel,
                    `${PLATFORM_LABELS[r.platform] ?? 'YouTube'} · ${SOURCE_LABELS[lane as keyof typeof SOURCE_LABELS]}`,
                    `${r.hoursAfterSource > 0 ? '+' : ''}${r.hoursAfterSource}h from source`,
                  ])}
                  onMouseMove={move}
                  onMouseLeave={hide}
                />
              ))}
            </g>
          )
        })}
        {/* source line on top */}
        <line x1={x0} y1={pT} x2={x0} y2={totalH - pB} stroke="#c8472a" strokeWidth="1.5" strokeDasharray="4,3" />
        {/* x axis */}
        <line x1={pL} y1={totalH - pB} x2={W - pR} y2={totalH - pB} stroke="#edeae3" strokeWidth="1" />
        {ticks.map(t => (
          <text key={t} x={xS(t)} y={totalH - pB + 16} textAnchor="middle" fontSize="10" fill={t === 0 ? '#c8472a' : '#888680'} fontFamily={MONO}>
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
    { label: 'Raw coverage', value: rawScore, color: '#555452', desc: 'Sum of source weights' },
    { label: 'After outrage', value: afterOutrage, color: aiScores.outrage >= 6 ? '#c8472a' : '#888680', desc: `Outrage ${aiScores.outrage}/10 → ×${outrMult.toFixed(2)}` },
    { label: 'After credibility', value: afterGate, color: aiScores.credibility >= 6 ? '#1a6b4a' : '#c8472a', desc: `Credibility ${aiScores.credibility}/10 → ×${credGate.toFixed(2)}` },
    { label: 'Final score', value: final, color: '#0f0f0e', desc: 'Capped at 10' },
  ]
  const max = Math.max(...steps.map(s => s.value), 0.1)
  const W = 500, barL = 144, barR = 432, barW = barR - barL, rowH = 48, pT = 8, H = pT + steps.length * rowH

  return (
    <div>
      <ChartHeader title="Score waterfall" sub="How the final score is constructed — each step shows penalties applied." />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {steps.map((s, i) => {
          const y = pT + i * rowH
          const bw = (s.value / max) * barW
          const isFinal = i === steps.length - 1
          return (
            <g key={i}>
              <text x={barL - 8} y={y + 13} textAnchor="end" fontSize="10" fill="#0f0f0e" fontFamily={MONO} style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</text>
              <text x={barL - 8} y={y + 25} textAnchor="end" fontSize="9" fill="#888680" fontFamily={MONO}>{s.desc}</text>
              <rect x={barL} y={y} width={barW} height={22} fill="#f0ede6" />
              <rect x={barL} y={y} width={bw} height={22} fill={s.color} opacity={isFinal ? 1 : 0.7} />
              <text x={barR + 10} y={y + 15} textAnchor="start" fontSize="12" fontWeight="700" fill={s.color} fontFamily={MONO}>{s.value.toFixed(1)}</text>
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

  if (aiScores.outrage >= 8) flags.push({ label: 'Extreme outrage signal', detail: `Outrage score ${aiScores.outrage}/10 — content is highly emotionally manipulative`, severity: 'high' })
  else if (aiScores.outrage >= 6) flags.push({ label: 'Elevated outrage', detail: `Outrage score ${aiScores.outrage}/10 — emotional framing may distort the story`, severity: 'medium' })
  if (aiScores.credibility <= 2) flags.push({ label: 'Claim likely false', detail: `Credibility ${aiScores.credibility}/10 — core facts appear fabricated or misrepresented`, severity: 'high' })
  else if (aiScores.credibility <= 4) flags.push({ label: 'Low credibility', detail: `Credibility ${aiScores.credibility}/10 — claim is poorly supported or misleadingly framed`, severity: 'medium' })
  if (unverifiedRatio > 0.7) flags.push({ label: 'Mostly unverified sources', detail: `${Math.round(unverifiedRatio * 100)}% of sources are from unknown/unverified channels`, severity: 'medium' })
  if (!results.some(r => r.sourceType === 'agency') && results.length > 0) flags.push({ label: 'No agency coverage', detail: 'No Reuters, AP, or AFP source found — not independently confirmed by wire services', severity: 'low' })
  const langs = new Set(results.map(r => r.language ?? 'undetected').filter(l => l !== 'undetected'))
  if (langs.size === 1 && results.length >= 4) flags.push({ label: 'Single language only', detail: 'All sources in one language — no cross-border corroboration detected', severity: 'low' })
  if (!aiAnalysisAvailable) flags.push({ label: 'AI analysis unavailable', detail: 'Scores are estimated defaults — Claude analysis did not complete', severity: 'low' })
  if (aiScores.simplicity <= 3) flags.push({ label: 'Contradictory narratives', detail: `Consistency score ${aiScores.simplicity}/10 — sources tell conflicting stories`, severity: 'medium' })
  flags.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.severity] - { high: 0, medium: 1, low: 2 }[b.severity]))

  const severityColor = (s: string) => s === 'high' ? '#c8472a' : s === 'medium' ? '#c8822a' : '#888680'
  const severityBg = (s: string) => s === 'high' ? 'rgba(200,71,42,0.08)' : s === 'medium' ? 'rgba(200,130,42,0.08)' : 'rgba(0,0,0,0.03)'
  const truncate = (t: string, n: number) => t.length > n ? t.slice(0, n - 1) + '…' : t

  const W = 500, pL = 12, rowH = 56, gap = 6, pT = 8
  const noFlagsH = pT + 56

  if (flags.length === 0) {
    return (
      <div>
        <ChartHeader title="Red flags" sub="Automated detection of suspicious signals." />
        <svg viewBox={`0 0 ${W} ${noFlagsH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <rect x={pL} y={pT} width={W - pL * 2} height={40} fill="rgba(26,107,74,0.08)" stroke="#1a6b4a" strokeWidth="1" />
          <circle cx={pL + 20} cy={pT + 20} r={5} fill="#1a6b4a" />
          <text x={pL + 36} y={pT + 24} fontSize="12" fill="#1a6b4a" fontFamily={SANS}>No suspicious signals detected</text>
        </svg>
      </div>
    )
  }

  const H = pT + flags.length * (rowH + gap)
  return (
    <div>
      <ChartHeader title="Red flags" sub="Automated detection of suspicious signals." />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {flags.map((f, i) => {
          const y = pT + i * (rowH + gap)
          const col = severityColor(f.severity)
          const line2 = truncate(f.detail, 68)
          return (
            <g key={i}>
              <rect x={pL} y={y} width={W - pL * 2} height={rowH} fill={severityBg(f.severity)} stroke={col} strokeWidth="0.75" />
              <circle cx={pL + 16} cy={y + 16} r={4} fill={col} />
              <text x={pL + 28} y={y + 19} fontSize="10" fontWeight="700" fill="#0f0f0e" fontFamily={MONO} style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{f.label}</text>
              <text x={pL + 28} y={y + 36} fontSize="11" fill="#555452" fontFamily={SANS}>{line2}</text>
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
  const highTrustScore = results.filter(r => ['raw','agency'].includes(r.sourceType))
    .reduce((s, r) => s + (SOURCE_WEIGHTS[r.sourceType] ?? 1), 0)
  const platforms = new Set(results.map(r => r.platform ?? 'youtube')).size
  const langs = new Set(results.map(r => r.language).filter((l: string) => l && l !== 'undetected')).size
  const hrs = results.map(r => r.hoursAfterSource)
  const spread = hrs.length > 1 ? Math.max(...hrs) - Math.min(...hrs) : 0
  // outrage 0-10: lower is better → invert for radar (0 outrage = 1.0)
  const outrageValue = (10 - (aiScores.outrage ?? 5)) / 10
  // simplicity 0-10: higher = more consistent narrative = better
  const simplicityValue = (aiScores.simplicity ?? 5) / 10

  const axes = [
    { label: 'Purity', desc: `${Math.round(totalScore > 0 ? (highTrustScore/totalScore)*100 : 0)}% of score from agencies & raw footage`, value: totalScore > 0 ? highTrustScore / totalScore : 0 },
    { label: 'Platforms', desc: `${platforms} of 3 platforms covered`, value: Math.min(platforms / 3, 1) },
    { label: 'Languages', desc: `${langs} language${langs !== 1 ? 's' : ''} detected`, value: Math.min(langs / 5, 1) },
    { label: 'Spread', desc: `${spread}h between earliest and latest`, value: Math.min(spread / 48, 1) },
    { label: 'Objectivity', desc: `Outrage score ${aiScores.outrage ?? 5}/10 (lower = better)`, value: outrageValue },
    { label: 'Consistency', desc: `Narrative consistency ${aiScores.simplicity ?? 5}/10`, value: simplicityValue },
  ]

  const N = 6, SIZE = 260, CX = 130, CY = 130, R = 88
  const angle = (i: number) => (i / N) * Math.PI * 2 - Math.PI / 2
  const pt = (i: number, v: number): [number, number] => [CX + Math.cos(angle(i)) * R * v, CY + Math.sin(angle(i)) * R * v]
  const polyStr = (v: number) => Array.from({ length: N }, (_, i) => pt(i, v).join(',')).join(' ')
  const dataStr = axes.map((a, i) => pt(i, a.value).join(',')).join(' ')

  const mobile = useMobile()
  return (
    <div style={{}}>
      <ChartHeader title="Corroboration profile" sub="Six-dimensional view of corroboration quality. Fuller polygon = stronger, more diverse, less emotionally loaded signal." />
      <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: mobile ? '16px' : '40px', alignItems: mobile ? 'stretch' : 'center', flexWrap: 'wrap', padding: mobile ? '0 16px' : undefined }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: mobile ? '100%' : 'min(220px, 100%)', height: 'auto', flexShrink: 0 }}>
          {[0.25, 0.5, 0.75, 1].map(level => (
            <polygon key={level} points={polyStr(level)} fill="none" stroke={level === 1 ? '#d4d0c8' : '#edeae3'} strokeWidth={level === 1 ? 1 : 0.5} />
          ))}
          {Array.from({ length: N }, (_, i) => {
            const [x, y] = pt(i, 1)
            return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="#edeae3" strokeWidth="0.5" />
          })}
          <polygon points={dataStr} fill="rgba(26,107,74,0.14)" stroke="#1a6b4a" strokeWidth="1.5" strokeLinejoin="round" />
          {axes.map((a, i) => {
            const [x, y] = pt(i, a.value)
            return (
              <circle key={i} cx={x} cy={y} r={4} fill="#1a6b4a" style={{ cursor: 'pointer' }}
                onMouseEnter={e => show(e, [a.label, a.desc, `Score: ${Math.round(a.value * 100)}%`])}
                onMouseMove={move} onMouseLeave={hide}
              />
            )
          })}
          {axes.map((a, i) => {
            const ang = angle(i)
            const lx = CX + Math.cos(ang) * (R + 18)
            const ly = CY + Math.sin(ang) * (R + 18)
            const anchor = Math.abs(Math.cos(ang)) < 0.15 ? 'middle' : Math.cos(ang) > 0 ? 'start' : 'end'
            return <text key={i} x={lx} y={ly + 4} textAnchor={anchor} fontSize="10" fill="#888680" fontFamily={MONO}>{a.label}</text>
          })}
        </svg>
        <div style={{ flex: 1, minWidth: '180px' }}>
          {axes.map(a => (
            <div key={a.label} style={{ padding: '9px 0', borderBottom: '1px solid #f0ede6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontFamily: MONO, fontSize: '11px', color: '#0f0f0e' }}>{a.label}</span>
                <span style={{ fontFamily: MONO, fontSize: '11px', color: '#1a6b4a', fontWeight: '600' }}>{Math.round(a.value * 100)}%</span>
              </div>
              <div style={{ height: '3px', background: '#f0ede6' }}>
                <div style={{ height: '100%', width: `${a.value * 100}%`, background: '#1a6b4a', transition: 'width 0.5s ease' }} />
              </div>
              <div style={{ fontFamily: MONO, fontSize: '10px', color: '#888680', marginTop: '3px' }}>{a.desc}</div>
            </div>
          ))}
        </div>
      </div>
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

const WORLD_CONTINENTS = [
  { id: 'na', d: 'M 44 42 L 222 42 L 278 80 L 251 97 L 222 137 L 200 156 L 164 144 L 140 122 L 116 84 Z' },
  { id: 'sa', d: 'M 238 173 L 284 179 L 322 200 L 304 238 L 282 260 L 249 306 L 238 285 L 231 211 Z' },
  { id: 'eu', d: 'M 380 110 L 411 40 L 467 63 L 484 74 L 480 112 L 453 112 L 389 114 Z' },
  { id: 'af', d: 'M 387 116 L 469 125 L 513 167 L 489 211 L 440 262 L 427 226 L 378 177 L 362 158 Z' },
  { id: 'as', d: 'M 458 108 L 498 158 L 571 173 L 631 188 L 640 169 L 653 144 L 684 110 L 700 84 L 729 42 L 533 42 L 533 95 Z' },
  { id: 'au', d: 'M 653 243 L 682 220 L 691 215 L 722 222 L 729 270 L 711 270 L 660 262 Z' },
  { id: 'gl', d: 'M 302 63 L 249 30 L 320 15 L 351 38 Z' },
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

  return (
    <div>
      <ChartHeader title="Geographic spread" sub={`Coverage detected in ${langCount} language${langCount !== 1 ? 's' : ''}. Dot size = number of sources. Positions approximated from language.`} />
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Ocean background */}
        <rect x={0} y={0} width={MAP_W} height={MAP_H} fill="#f2efe9" />
        {/* Graticule lines */}
        {[-60, -30, 0, 30, 60].map(lat => {
          const y = (90 - lat) * MAP_H / 180
          return <line key={`lat-${lat}`} x1={0} y1={y} x2={MAP_W} y2={y} stroke="#e8e4dc" strokeWidth={lat === 0 ? 1 : 0.5} />
        })}
        {[-120, -60, 0, 60, 120].map(lng => {
          const x = (lng + 180) * MAP_W / 360
          return <line key={`lng-${lng}`} x1={x} y1={0} x2={x} y2={MAP_H} stroke="#e8e4dc" strokeWidth="0.5" />
        })}
        {/* Continents */}
        {WORLD_CONTINENTS.map(c => (
          <path key={c.id} d={c.d} fill="#ddd9d0" stroke="#c8c4bc" strokeWidth="0.75" />
        ))}
        {/* Source dots by language */}
        {Object.entries(langGroups).map(([lang, g]) => {
          const coords = LANG_GEO[lang]
          if (!coords) return null
          const [lat, lng] = coords
          const [sx, sy] = toMapXY(lat, lng)
          const r = 5 + (g.count / maxCount) * 16
          const typeCount: Record<string, number> = {}
          for (const t of g.types) typeCount[t] = (typeCount[t] || 0) + 1
          const dominantType = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unverified'
          const color = SOURCE_COLORS[dominantType] ?? '#888680'
          const fmtV = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n/1000)}k` : String(n)
          return (
            <g key={lang}>
              <circle cx={sx} cy={sy} r={r + 3} fill={color} opacity={0.15} />
              <circle cx={sx} cy={sy} r={r} fill={color} opacity={0.75} stroke="white" strokeWidth="1"
                style={{ cursor: 'pointer' }}
                onMouseEnter={e => show(e, [lang.toUpperCase(), `${g.count} source${g.count !== 1 ? 's' : ''}`, `${fmtV(g.views)} views`])}
                onMouseMove={move} onMouseLeave={hide}
              />
              {r >= 10 && (
                <text x={sx} y={sy + 4} textAnchor="middle" fontSize="9" fill="white" fontFamily={MONO}
                  style={{ pointerEvents: 'none', fontWeight: 700 }}>{lang}</text>
              )}
            </g>
          )
        })}
        {/* Lat labels */}
        {[60, 30, 0, -30, -60].map(lat => (
          <text key={`llat-${lat}`} x={4} y={(90 - lat) * MAP_H / 180 + 4} fontSize="8" fill="#b0aca4" fontFamily={MONO}>{lat > 0 ? `${lat}°N` : lat < 0 ? `${-lat}°S` : '0°'}</text>
        ))}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Chart: Platform distribution (donut) ─────────────────────────────────────

const PLATFORM_COLORS_MAP: Record<string, string> = {
  youtube: '#c8472a', newsapi: '#1a4a8a', gdelt: '#555452',
  tiktok: '#1a6b4a', instagram: '#6b1a4a',
}
const PLATFORM_DISPLAY: Record<string, string> = {
  youtube: 'YouTube', newsapi: 'News APIs', gdelt: 'GDELT',
  tiktok: 'TikTok', instagram: 'Instagram',
}

function PlatformDonut({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const show = (e: React.MouseEvent, platform: string, lines: string[]) => { setTip({ x: e.clientX, y: e.clientY, lines }); setHovered(platform) }
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => { setTip(null); setHovered(null) }

  if (results.length === 0) return null

  const counts: Record<string, { count: number; views: number }> = {}
  for (const r of results) {
    const p = r.platform ?? 'newsapi'
    if (!counts[p]) counts[p] = { count: 0, views: 0 }
    counts[p].count++
    counts[p].views += r.viewCount ?? 0
  }
  const entries = Object.entries(counts).sort((a, b) => b[1].count - a[1].count)
  const total = entries.reduce((s, [, v]) => s + v.count, 0)
  if (total === 0) return null

  const CX = 110, CY = 110, R_OUT = 84, R_IN = 50, SIZE = 220
  let angle = -Math.PI / 2

  const arcs = entries.map(([platform, data]) => {
    const fraction = data.count / total
    const sweep = fraction * Math.PI * 2
    const a0 = angle, a1 = angle + sweep
    angle = a1
    const gap = entries.length > 1 ? 0.025 : 0
    const cos0 = Math.cos(a0 + gap), sin0 = Math.sin(a0 + gap)
    const cos1 = Math.cos(a1 - gap), sin1 = Math.sin(a1 - gap)
    const r = hovered === platform ? R_OUT + 6 : R_OUT
    const large = sweep > Math.PI ? 1 : 0
    const d = `M ${(CX + cos0 * R_IN).toFixed(1)} ${(CY + sin0 * R_IN).toFixed(1)} L ${(CX + cos0 * r).toFixed(1)} ${(CY + sin0 * r).toFixed(1)} A ${r} ${r} 0 ${large} 1 ${(CX + cos1 * r).toFixed(1)} ${(CY + sin1 * r).toFixed(1)} L ${(CX + cos1 * R_IN).toFixed(1)} ${(CY + sin1 * R_IN).toFixed(1)} A ${R_IN} ${R_IN} 0 ${large} 0 ${(CX + cos0 * R_IN).toFixed(1)} ${(CY + sin0 * R_IN).toFixed(1)}`
    const midA = (a0 + a1) / 2
    const lx = CX + Math.cos(midA) * (R_OUT + 20)
    const ly = CY + Math.sin(midA) * (R_OUT + 20)
    return { platform, data, fraction, d, lx, ly }
  })

  const fmtV = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n/1000)}k` : String(n)

  return (
    <div>
      <ChartHeader title="Platform mix" sub="How coverage is distributed across platforms." />
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: 'min(200px, 100%)', height: 'auto', flexShrink: 0 }}>
          {arcs.map(({ platform, data, fraction, d, lx, ly }) => {
            const color = PLATFORM_COLORS_MAP[platform] ?? '#888680'
            const pct = Math.round(fraction * 100)
            return (
              <g key={platform} style={{ cursor: 'pointer' }}
                onMouseEnter={e => show(e, platform, [PLATFORM_DISPLAY[platform] ?? platform, `${data.count} sources · ${pct}%`, data.views > 0 ? `${fmtV(data.views)} views` : ''])}
                onMouseMove={move} onMouseLeave={hide}
              >
                <path d={d} fill={color} opacity={hovered && hovered !== platform ? 0.35 : 0.88} />
                {fraction > 0.09 && (
                  <text x={lx} y={ly + 4} textAnchor="middle" fontSize="9" fill="#3a3a38" fontFamily={MONO}>{pct}%</text>
                )}
              </g>
            )
          })}
          <text x={CX} y={CY - 8} textAnchor="middle" fontSize="24" fontWeight="700" fill="#0f0f0e" fontFamily={MONO}>{total}</text>
          <text x={CX} y={CY + 10} textAnchor="middle" fontSize="9" fill="#888680" fontFamily={MONO} style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>sources</text>
        </svg>
        <div style={{ flex: 1, minWidth: '130px' }}>
          {arcs.map(({ platform, data }) => (
            <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}
              onMouseEnter={e => show(e as any, platform, [PLATFORM_DISPLAY[platform] ?? platform, `${data.count} sources`])}
              onMouseLeave={hide}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: PLATFORM_COLORS_MAP[platform] ?? '#888680', flexShrink: 0 }} />
              <span style={{ fontFamily: MONO, fontSize: '10px', color: '#0f0f0e', flex: 1 }}>{PLATFORM_DISPLAY[platform] ?? platform}</span>
              <span style={{ fontFamily: MONO, fontSize: '10px', color: '#888680' }}>{data.count}</span>
            </div>
          ))}
        </div>
      </div>
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

  const W = 500, pL = 148, barR = 418, barW = barR - pL, rowH = 46, pT = 8
  const H = pT + entries.length * rowH + 8

  return (
    <div>
      <ChartHeader title="Audience reach" sub="Total estimated views per source tier. Shows which type drove the most exposure." />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
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
              <line x1={0} y1={y + rowH} x2={W} y2={y + rowH} stroke="#f0ede6" strokeWidth="0.5" />
              <circle cx={10} cy={y + rowH / 2} r={4} fill={color} />
              <text x={pL - 8} y={y + rowH / 2 - 5} textAnchor="end" fontSize="9" fill="#0f0f0e" fontFamily={MONO}
                style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</text>
              <text x={pL - 8} y={y + rowH / 2 + 8} textAnchor="end" fontSize="9" fill="#888680" fontFamily={MONO}>{stats.count} src</text>
              <rect x={pL} y={y + 10} width={barW} height={18} fill="#f0ede6" />
              <rect x={pL} y={y + 10} width={bw} height={18} fill={color} opacity={0.8} />
              <text x={barR + 10} y={y + rowH / 2 + 5} fontSize="12" fontWeight="700" fill={color} fontFamily={MONO}>{fmtV(stats.views)}</text>
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

  const SIZE = 260, CX = 130, CY = 130, R_IN = 38, R_OUT = 110
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

  // Spread metric: how many distinct hours have uploads
  const activeHours = counts.filter(c => c > 0).length
  const clockLabels = [0, 6, 12, 18]

  const mobile = useMobile()
  return (
    <div style={{}}>
      <ChartHeader title="Upload clock" sub="Hour of day (UTC) when each source was uploaded. Clustered bars may indicate scheduled or coordinated activity." />
      <div style={{ display: 'flex', flexDirection: mobile ? 'column' : 'row', gap: mobile ? '16px' : '48px', alignItems: mobile ? 'stretch' : 'center', flexWrap: 'wrap', padding: mobile ? '0 16px' : undefined }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: mobile ? '100%' : 'min(220px, 100%)', height: 'auto', flexShrink: 0 }}>
          {/* Inner circle */}
          <circle cx={CX} cy={CY} r={R_IN} fill="none" stroke="#edeae3" strokeWidth="1" />
          {/* Outer ring guide */}
          <circle cx={CX} cy={CY} r={R_OUT} fill="none" stroke="#edeae3" strokeWidth="0.5" strokeDasharray="2,4" />
          {/* Hour arcs */}
          {Array.from({ length: 24 }, (_, h) => {
            const path = arcPath(h, counts[h])
            if (!path) return null
            return (
              <path key={h} d={path}
                fill={counts[h] === maxCount ? '#0f0f0e' : '#3a3a38'}
                opacity={0.6 + (counts[h] / maxCount) * 0.4}
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
          {/* Clock labels */}
          {clockLabels.map(h => {
            const ang = hourAngle(h)
            const lx = CX + Math.cos(ang) * (R_OUT + 14)
            const ly = CY + Math.sin(ang) * (R_OUT + 14)
            return <text key={h} x={lx} y={ly + 4} textAnchor="middle" fontSize="10" fill="#888680" fontFamily={MONO}>{h}h</text>
          })}
          {/* Center label */}
          <text x={CX} y={CY - 4} textAnchor="middle" fontSize="11" fill="#0f0f0e" fontFamily={MONO} fontWeight="600">{activeHours}</text>
          <text x={CX} y={CY + 10} textAnchor="middle" fontSize="9" fill="#888680" fontFamily={MONO}>hours</text>
        </svg>
        <div style={{ flex: 1, minWidth: '160px' }}>
          <p style={{ fontFamily: MONO, fontSize: '11px', color: '#0f0f0e', marginBottom: '8px' }}>
            Activity across <strong>{activeHours}</strong> of 24 hours (UTC)
          </p>
          <p style={{ fontFamily: SANS, fontSize: '13px', color: '#888680', lineHeight: 1.6 }}>
            {activeHours <= 3
              ? 'Uploads are tightly clustered. This may indicate coordinated posting or a very short-lived event.'
              : activeHours <= 8
              ? 'Moderate spread. Consistent with organic coverage of a breaking event over several hours.'
              : 'Wide spread across the day. Strong signal of organic, independent discovery by different people in different time zones.'}
          </p>
          <div style={{ marginTop: '16px', fontFamily: MONO, fontSize: '10px', color: '#888680' }}>
            Peak hour: {String(counts.indexOf(maxCount)).padStart(2,'0')}:00 UTC ({maxCount} source{maxCount !== 1 ? 's' : ''})
          </div>
        </div>
      </div>
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
  const [suggestions, setSuggestions] = useState<{ title: string; source: string; publishedAt: string; description: string }[]>([])
  const [suggLoading, setSuggLoading] = useState(false)
  const [showSugg, setShowSugg] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const chartsRef = useRef<HTMLDivElement>(null)
  const suppressSuggRef = useRef(false)
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
  const [recentQueries, setRecentQueries] = useState<string[]>([])
  useEffect(() => {
    setMounted(true)
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    try { setRecentQueries(JSON.parse(localStorage.getItem('convergRecentQueries') ?? '[]')) } catch {}
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Debounced suggestion fetch
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) { setSuggestions([]); setShowSugg(false); return }
    setSuggLoading(true)
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api/suggest?q=${encodeURIComponent(q)}`)
        const data = await r.json()
        setSuggestions(data.suggestions ?? [])
        if (!suppressSuggRef.current) setShowSugg(true)
      } catch {}
      setSuggLoading(false)
    }, 400)
    return () => { clearTimeout(timer); setSuggLoading(false) }
  }, [query])

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
    suppressSuggRef.current = true
    setShowSugg(false)
    setSuggestions([])
    setResults([])
    setSearched(false)
    setCheckedQuery('')
    setError(null)
    if (overrideQuery) setQuery(overrideQuery)
    try {
      const updated = [q, ...recentQueries.filter(r => r !== q)].slice(0, 10)
      localStorage.setItem('convergRecentQueries', JSON.stringify(updated))
      setRecentQueries(updated)
    } catch {}
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
  const C = ({ children, span = 6, bg = '#f7f4ef', style, name, noSvg }: { children: React.ReactNode; span?: number; bg?: string; style?: React.CSSProperties; name?: string; noSvg?: boolean }) => {
    const cellRef = useRef<HTMLDivElement>(null)
    return (
      <div ref={cellRef} data-chart-name={name} style={{ gridColumn: isMobile ? '1 / -1' : `span ${span}`, background: bg, padding: isMobile ? '24px 0' : '32px 28px', minWidth: 0, overflow: isMobile ? 'visible' : 'hidden', position: 'relative', ...style }}>
        {children}
        {name && !noSvg && (
          <button
            title={`Download ${name}`}
            onClick={() => cellRef.current && downloadSingleChart(cellRef.current)}
            style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', opacity: 0.35, lineHeight: 1 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.35')}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="#0f0f0e" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
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
      <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
      <div style={{ flex: 1, maxWidth: isMobile ? '100%' : '760px', padding: isMobile ? '40px 20px 0' : '64px 40px 0' }}>
        <p style={{ fontFamily: MONO, fontSize: '15px', color: '#c8472a', marginBottom: '20px' }}>OSINT intelligence,{isMobile ? <br /> : ' '}simplified for the curious.</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '40px', fontWeight: 400, lineHeight: 1.15, color: '#0f0f0e', marginBottom: '20px' }}>
          Real events leave <em style={{ color: '#3a3a38' }}>multiple traces.</em>
        </h1>
        <p style={{ fontFamily: SANS, fontSize: '15px', color: '#3a3a38', lineHeight: 1.65, marginBottom: '48px', maxWidth: '540px' }}>
          Type a few words in any language — recent headlines will appear. Pick one or describe freely. Converg scores reliability using source diversity, timing and outrage signals.
        </p>
        <div style={{ position: 'relative', marginBottom: '48px' }}>
          <div style={{ border: `1px solid ${loading ? '#888680' : '#0f0f0e'}`, background: 'white', display: 'flex', opacity: loading ? 0.6 : 1, transition: 'all 0.3s' }}>
            {isMobile ? (
              <textarea
                placeholder="Describe the news…"
                value={query}
                maxLength={100}
                rows={3}
                onChange={e => { setQuery(e.target.value) }}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !loading) { e.preventDefault(); analyze() } }}
                onFocus={() => { suppressSuggRef.current = false; (suggestions.length > 0 || suggLoading) && setShowSugg(true) }}
                onBlur={() => setTimeout(() => setShowSugg(false), 150)}
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
                onFocus={() => { suppressSuggRef.current = false; (suggestions.length > 0 || suggLoading) && setShowSugg(true) }}
                onBlur={() => setTimeout(() => setShowSugg(false), 150)}
                disabled={loading}
                style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', padding: '16px 20px', fontFamily: MONO, fontSize: '16px', color: '#0f0f0e', background: 'transparent' }}
              />
            )}
            <button className="analyze-btn" onClick={() => analyze()} disabled={loading}
              style={{ border: 'none', borderLeft: `1px solid ${loading ? '#888680' : '#0f0f0e'}`, background: loading ? '#888680' : '#0f0f0e', color: '#f7f4ef', fontFamily: MONO, fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 12px', cursor: loading ? 'default' : 'pointer', transition: 'background 0.15s', whiteSpace: 'nowrap', alignSelf: isMobile ? 'flex-end' : undefined }}>
              {loading ? '...' : 'Run →'}
            </button>
          </div>

          {/* Suggestions dropdown */}
          {showSugg && !loading && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #0f0f0e', borderTop: 'none', zIndex: 1000, maxHeight: '380px', overflowY: 'auto' }}>
              {suggLoading && (
                <div style={{ padding: '14px 20px', fontFamily: MONO, fontSize: '11px', color: '#888680', letterSpacing: '0.06em' }}>Ricerca in corso…</div>
              )}
              {!suggLoading && suggestions.length === 0 && (
                <div style={{ padding: '14px 20px', fontFamily: MONO, fontSize: '11px', color: '#888680', letterSpacing: '0.06em' }}>Nessuna notizia trovata</div>
              )}
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  onMouseDown={e => { e.preventDefault(); analyze(s.title) }}
                  style={{ padding: '12px 20px', borderBottom: i < suggestions.length - 1 ? '1px solid #edeae3' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f7f4ef')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                >
                  <div style={{ fontFamily: SANS, fontSize: '14px', color: '#0f0f0e', lineHeight: 1.4, marginBottom: '4px' }}>{s.title}</div>
                  <div style={{ fontFamily: MONO, fontSize: '10px', color: '#888680', letterSpacing: '0.04em' }}>
                    {s.source}{s.source && s.publishedAt ? ' · ' : ''}{formatAge(s.publishedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {loading && (
          <div style={{ marginBottom: '48px' }}>
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
          <div style={{ border: '1px solid #c8472a', background: '#fff8f7', padding: '20px 24px', marginBottom: '24px' }}>
            <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#c8472a', marginBottom: '6px' }}>Error</p>
            <p style={{ fontFamily: SANS, fontSize: '13px', color: '#3a3a38' }}>{error}</p>
          </div>
        )}
      </div>

      {/* ── Recent queries (right column) ───────────────────────────────────── */}
      {mounted && recentQueries.length > 0 && (
        <div style={{ width: isMobile ? '100%' : '260px', flexShrink: 0, borderLeft: isMobile ? 'none' : '1px solid #edeae3', borderTop: isMobile ? '1px solid #edeae3' : 'none', padding: isMobile ? '24px 20px 0' : '64px 32px 0 32px' }}>
          <p style={{ fontFamily: MONO, fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888680', marginBottom: '20px' }}>Recently searched</p>
          {recentQueries.map((q, i) => (
            <button key={i} onClick={() => setQuery(q)}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: '1px solid #edeae3', padding: '10px 0', fontFamily: MONO, fontSize: '11px', color: '#3a3a38', cursor: 'pointer', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {q}
            </button>
          ))}
        </div>
      )}
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
            <div ref={chartsRef} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '1px', background: '#d4d0c8' }}>

              {/* Row 1: buildup | profile | clock */}
              <C span={hasUploadClock ? 1 : 2} name="corroboration-buildup"><CorroborationBuildup results={results} /></C>
              <C span={1} name="corroboration-profile"><DiversityRadar results={results} aiScores={aiScores} /></C>
              {hasUploadClock && <C span={1} name="upload-clock"><UploadClock results={results} /></C>}

              {/* Row 2: swim lanes | waterfall | red flags */}
              <C span={1} name="swim-lanes"><SwimLanes results={results} /></C>
              <C span={1} name="score-waterfall"><ScoreWaterfall results={results} aiScores={aiScores} corroborationScore={corroborationScore} /></C>
              <C span={1} name="red-flags"><RedFlags results={results} aiScores={aiScores} unverifiedRatio={unverifiedRatio} aiAnalysisAvailable={aiAnalysisAvailable} corroborationScore={corroborationScore} /></C>

              {/* Row 3: geo spread | platform mix | audience reach */}
              <C span={3} name="geo-spread"><GeoSpreadMap results={results} /></C>
              <C span={1} name="platform-mix"><PlatformDonut results={results} /></C>
              <C span={2} name="audience-reach"><ReachByType results={results} /></C>

              {/* Row 4: visual match — full width, conditional */}
              {hasVisualScores && <C span={3} name="visual-match"><VisualMatchChart results={results} /></C>}

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
        <div style={{ padding: isMobile ? '20px' : '20px 0 0', display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={downloadChartsSVG}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: '1px solid #0f0f0e', padding: '10px 20px', fontFamily: MONO, fontSize: '11px', letterSpacing: '0.06em', color: '#0f0f0e', cursor: 'pointer', justifyContent: 'center' }}
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
