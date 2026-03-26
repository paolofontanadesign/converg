'use client'

import { Fragment, useEffect, useState } from 'react'

const steps = [
  { key: 'metadata', label: 'Metadata extraction', detail: 'Title · timestamp · location signals' },
  { key: 'query', label: 'Corroboration query generation', detail: 'Building footage search variants...' },
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
  raw: 3, secondary: 1.5, aggregated: 0.5,
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
  // French / Spanish / German
  'del','der','die','lors','dans','pour','avec','sont','dont','leur','tout','plus','tres','muy','pero',
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
  return (
    <>
      <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0f0f0e', marginBottom: '6px' }}>{title}</p>
      <p style={{ fontFamily: SANS, fontSize: '13px', color: '#888680', marginBottom: '24px' }}>{sub}</p>
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

  return (
    <div style={{}}>
      <ChartHeader title="Corroboration buildup" sub="Cumulative corroboration score as independent footage accumulates. Each step up is a new source." />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        {/* threshold bands */}
        {showCorr && <rect x={pL} y={pT} width={plotW} height={yS(6) - pT} fill="rgba(26,107,74,0.04)" />}
        {/* grid */}
        <line x1={pL} y1={H - pB} x2={W - pR} y2={H - pB} stroke="#edeae3" strokeWidth="1" />
        {showPartial && <line x1={pL} y1={yS(2)} x2={W - pR} y2={yS(2)} stroke="#888680" strokeWidth="0.75" strokeDasharray="4,4" />}
        {showCorr && <line x1={pL} y1={yS(6)} x2={W - pR} y2={yS(6)} stroke="#1a6b4a" strokeWidth="0.75" strokeDasharray="4,4" />}
        {/* source video line */}
        <line x1={x0} y1={pT} x2={x0} y2={H - pB} stroke="#c8472a" strokeWidth="1" strokeDasharray="4,3" />
        <text x={x0} y={pT - 8} textAnchor="middle" fontSize="10" fill="#c8472a" fontFamily={MONO}>source</text>
        {/* area fill */}
        <path d={fill} fill="#0f0f0e" opacity="0.05" />
        {/* score line */}
        <path d={d} fill="none" stroke="#0f0f0e" strokeWidth="2" strokeLinejoin="round" />
        {/* threshold labels — full size, left-anchored */}
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
        {/* Y axis ticks */}
        {showPartial && <text x={pL - 6} y={yS(2) + 4} textAnchor="end" fontSize="10" fill="#888680" fontFamily={MONO}>2</text>}
        {showCorr && <text x={pL - 6} y={yS(6) + 4} textAnchor="end" fontSize="10" fill="#1a6b4a" fontFamily={MONO}>6</text>}
        <text x={pL - 6} y={yS(0) + 4} textAnchor="end" fontSize="10" fill="#888680" fontFamily={MONO}>0</text>
        {/* X axis labels */}
        <text x={pL} y={H - 10} textAnchor="middle" fontSize="10" fill="#888680" fontFamily={MONO}>−48h</text>
        <text x={x0} y={H - 10} textAnchor="middle" fontSize="10" fill="#c8472a" fontFamily={MONO}>0</text>
        <text x={W - pR} y={H - 10} textAnchor="end" fontSize="10" fill="#888680" fontFamily={MONO}>+48h</text>
        {/* event dots — colored by sourceType, hoverable */}
        {events.map(({ h, score, r }, i) => (
          <circle
            key={i}
            cx={xS(h)} cy={yS(score)} r={6}
            fill={SOURCE_COLORS[r.sourceType as keyof typeof SOURCE_COLORS] ?? '#888680'}
            stroke="#f7f4ef" strokeWidth="1.5"
            style={{ cursor: 'pointer' }}
            onMouseEnter={e => show(e, [
              r.channel,
              `${PLATFORM_LABELS[r.platform] ?? 'YouTube'} · ${SOURCE_LABELS[r.sourceType as keyof typeof SOURCE_LABELS]} · +${SOURCE_WEIGHTS[r.sourceType]}pts`,
              `${r.hoursAfterSource > 0 ? '+' : ''}${r.hoursAfterSource}h from source · score → ${score.toFixed(1)}`,
            ])}
            onMouseMove={move}
            onMouseLeave={hide}
          />
        ))}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Chart 2: Source type swim lanes × time ───────────────────────────────────

function SwimLanes({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  const W = 620, laneH = 52, pL = 110, pR = 24, pT = 16, pB = 36
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
              <text x={pL - 10} y={y + laneH / 2 - 5} textAnchor="end" fontSize="11" fill={SOURCE_COLORS[lane]} fontFamily={MONO} fontWeight="600">{SOURCE_LABELS[lane]}</text>
              <text x={pL - 10} y={y + laneH / 2 + 9} textAnchor="end" fontSize="10" fill="#888680" fontFamily={MONO}>{count} source{count !== 1 ? 's' : ''}</text>
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

// ── Chart 3: Score composition breakdown ─────────────────────────────────────

function ScoreAnatomy({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  const segmentDefs = [
    { key: 'agency',      label: 'News agency',    weight: 4,   color: '#1a4a8a' },
    { key: 'major',       label: 'Major outlet',   weight: 2,   color: '#2a6a9a' },
    { key: 'independent', label: 'Independent',    weight: 1,   color: '#5a7a5a' },
    { key: 'unverified',  label: 'Unverified',     weight: 0.5, color: '#b0a8a0' },
    { key: 'raw',         label: 'Raw footage',    weight: 3,   color: '#1a6b4a' },
    { key: 'secondary',   label: 'Secondary',      weight: 1.5, color: '#3a3a38' },
    { key: 'aggregated',  label: 'News package',   weight: 0.5, color: '#c8c8c4' },
  ]
  const segments = segmentDefs.map(s => ({
    ...s,
    count: results.filter(r => r.sourceType === s.key).length,
    score: results.filter(r => r.sourceType === s.key).length * s.weight,
  })).filter(s => s.count > 0)

  const total = segments.reduce((s, seg) => s + seg.score, 0)
  if (total === 0) return null
  const pct = (n: number) => `${Math.round((n / total) * 100)}%`

  return (
    <div style={{}}>
      <ChartHeader title="Score anatomy" sub="Raw footage contributes 6× more than a news package — outlets report without independently verifying." />
      {/* stacked bar */}
      <div style={{ height: '28px', display: 'flex', gap: '2px', marginBottom: '28px', borderRadius: '1px', overflow: 'hidden' }}>
        {segments.map(s => (
          <div
            key={s.key}
            style={{ width: `${(s.score / total) * 100}%`, background: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'default', transition: 'opacity 0.15s' }}
            onMouseEnter={e => show(e, [`${s.label}`, `${s.count} source${s.count > 1 ? 's' : ''} × ${s.weight}pts = ${s.score.toFixed(1)}`, `${pct(s.score)} of total score`])}
            onMouseMove={move}
            onMouseLeave={hide}
          >
            {(s.score / total) > 0.12 && (
              <span style={{ fontFamily: MONO, fontSize: '10px', color: (s.key === 'aggregated' || s.key === 'unverified') ? '#888680' : 'white', fontWeight: '600' }}>{s.score.toFixed(1)}</span>
            )}
          </div>
        ))}
      </div>
      {/* rows */}
      {segments.map(s => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '10px 0', borderBottom: '1px solid #f0ede6' }}>
          <div style={{ width: '14px', height: '14px', background: s.color, flexShrink: 0, border: (s.key === 'aggregated' || s.key === 'unverified') ? '1px solid #b0b0a8' : 'none' }} />
          <span style={{ fontFamily: MONO, fontSize: '11px', color: '#0f0f0e', flex: 1 }}>{s.label}</span>
          <span style={{ fontFamily: MONO, fontSize: '11px', color: '#888680' }}>{s.count} × {s.weight} pts</span>
          <span style={{ fontFamily: MONO, fontSize: '11px', color: '#888680', width: '40px', textAlign: 'right' }}>{pct(s.score)}</span>
          <span style={{ fontFamily: MONO, fontSize: '11px', color: '#0f0f0e', width: '36px', textAlign: 'right', fontWeight: '600' }}>{s.score.toFixed(1)}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '20px', paddingTop: '12px' }}>
        <span style={{ fontFamily: MONO, fontSize: '11px', color: '#888680' }}>Total corroboration score</span>
        <span style={{ fontFamily: MONO, fontSize: '11px', color: '#0f0f0e', fontWeight: '600' }}>{total.toFixed(1)}</span>
      </div>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Chart 4: Language × time witness matrix ──────────────────────────────────

function WitnessMatrix({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  const buckets = [-48, -36, -24, -12, 0, 12, 24, 36]
  const getBucket = (h: number) => Math.max(-48, Math.min(36, Math.floor(h / 12) * 12))
  const languages = [...new Set(results.map(r => r.language))].sort()
  if (languages.length === 0) return null

  const matrix: Record<string, Record<number, number>> = {}
  for (const lang of languages) {
    matrix[lang] = {}
    for (const b of buckets) matrix[lang][b] = 0
  }
  for (const r of results) {
    const b = getBucket(r.hoursAfterSource)
    if (matrix[r.language]) matrix[r.language][b]++
  }
  const maxCount = Math.max(...languages.flatMap(l => buckets.map(b => matrix[l][b])), 1)

  const bucketLabel = (b: number) => b === 0 ? '0' : `${b > 0 ? '+' : ''}${b}h`
  const bucketRange = (b: number) => `${bucketLabel(b)} → ${bucketLabel(b + 12)}`

  return (
    <div style={{}}>
      <ChartHeader title="Witness spread" sub="Independent footage across language communities and time windows. Broader spread = broader independent witnessing." />
      {/* column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(8, 1fr)', gap: '3px', marginBottom: '4px' }}>
        <div />
        {buckets.map(b => (
          <div key={b} style={{ fontFamily: MONO, fontSize: '10px', color: b === 0 ? '#c8472a' : '#888680', textAlign: 'center', fontWeight: b === 0 ? '600' : '400' }}>
            {b === 0 ? '0' : `${b > 0 ? '+' : ''}${b}`}
          </div>
        ))}
      </div>
      {/* rows */}
      {languages.map(lang => (
        <div key={lang} style={{ display: 'grid', gridTemplateColumns: '80px repeat(8, 1fr)', gap: '3px', marginBottom: '3px' }}>
          <div style={{ fontFamily: MONO, fontSize: '11px', color: '#0f0f0e', textTransform: 'uppercase', display: 'flex', alignItems: 'center' }}>{lang}</div>
          {buckets.map(b => {
            const count = matrix[lang][b]
            const intensity = count / maxCount
            return (
              <div
                key={b}
                style={{
                  height: `${Math.max(44, Math.floor(160 / Math.max(languages.length, 1)))}px`,
                  background: count > 0 ? `rgba(26,107,74,${0.12 + intensity * 0.88})` : '#f7f4ef',
                  border: b === 0 ? '1px solid rgba(200,71,42,0.3)' : '1px solid transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: count > 0 ? 'default' : 'default',
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => count > 0 && show(e, [
                  `${lang.toUpperCase()} · ${bucketRange(b)}`,
                  `${count} source${count > 1 ? 's' : ''}`,
                ])}
                onMouseMove={move}
                onMouseLeave={hide}
              >
                {count > 0 && (
                  <span style={{ fontFamily: MONO, fontSize: '11px', fontWeight: '600', color: intensity > 0.5 ? 'white' : '#1a6b4a' }}>{count}</span>
                )}
              </div>
            )
          })}
        </div>
      ))}
      <div style={{ fontFamily: MONO, fontSize: '10px', color: '#888680', marginTop: '10px', textAlign: 'right' }}>
        each column = 12h window · 0 = source video upload time
      </div>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Chart 5: Upload velocity histogram ───────────────────────────────────────

function VelocityHistogram({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  const W = 620, H = 160, pL = 36, pR = 16, pT = 16, pB = 40
  const plotW = W - pL - pR, plotH = H - pT - pB
  const bucketDefs = [-48, -36, -24, -12, 0, 12, 24, 36]
  const getBucket = (h: number) => Math.floor(Math.max(-48, Math.min(36, h)) / 12) * 12

  const allTypes = [...new Set(results.map(r => r.sourceType))]
  const data = bucketDefs.map(b => {
    const byType: Record<string, number> = {}
    for (const t of allTypes) byType[t] = results.filter(r => getBucket(r.hoursAfterSource) === b && r.sourceType === t).length
    const total = Object.values(byType).reduce((s, v) => s + v, 0)
    return { b, byType, total }
  })
  const maxTotal = Math.max(...data.map(d => d.total), 1)
  const slotW = plotW / bucketDefs.length
  const barW = slotW - 6
  const xCenter = (i: number) => pL + (i + 0.5) * slotW
  const yH = (count: number) => (count / maxTotal) * plotH
  const yTicks = Array.from({ length: Math.min(maxTotal, 4) }, (_, i) => i + 1)

  return (
    <div style={{}}>
      <ChartHeader title="Upload velocity" sub="Footage sources appearing per 12-hour window. A sharp spike before the source line may indicate coordinated activity." />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        <line x1={pL} y1={H - pB} x2={W - pR} y2={H - pB} stroke="#edeae3" strokeWidth="1" />
        {yTicks.map(tick => (
          <line key={tick} x1={pL} y1={H - pB - yH(tick)} x2={W - pR} y2={H - pB - yH(tick)} stroke="#edeae3" strokeWidth="0.5" strokeDasharray="3,3" />
        ))}
        <line x1={xCenter(4)} y1={pT} x2={xCenter(4)} y2={H - pB} stroke="#c8472a" strokeWidth="1" strokeDasharray="4,3" opacity="0.7" />
        {data.map((d, i) => {
          const cx = xCenter(i)
          const x = cx - barW / 2
          let yOffset = H - pB
          return (
            <g key={d.b} style={{ cursor: d.total > 0 ? 'pointer' : 'default' }}
               onMouseEnter={e => d.total > 0 && show(e, [
                 `${d.b >= 0 ? '+' : ''}${d.b}h → ${d.b >= 0 ? '+' : ''}${d.b + 12}h`,
                 `${d.total} source${d.total !== 1 ? 's' : ''}`,
                 ...allTypes.filter(t => (d.byType[t] ?? 0) > 0).map(t => `${SOURCE_LABELS[t] ?? t}: ${d.byType[t]}`),
               ])}
               onMouseMove={move} onMouseLeave={hide}
            >
              {allTypes.map(t => {
                const count = d.byType[t] ?? 0
                if (count === 0) return null
                const h = yH(count)
                yOffset -= h
                return <rect key={t} x={x} y={yOffset} width={barW} height={h} fill={SOURCE_COLORS[t] ?? '#888680'} />
              })}
            </g>
          )
        })}
        {bucketDefs.map((b, i) => (
          <text key={b} x={xCenter(i)} y={H - pB + 16} textAnchor="middle" fontSize="10" fill={b === 0 ? '#c8472a' : '#888680'} fontFamily={MONO}>
            {b === 0 ? '0' : `${b > 0 ? '+' : ''}${b}`}
          </text>
        ))}
        {yTicks.map(tick => (
          <text key={tick} x={pL - 6} y={H - pB - yH(tick) + 4} textAnchor="end" fontSize="10" fill="#888680" fontFamily={MONO}>{tick}</text>
        ))}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Chart 6: Platform spread ──────────────────────────────────────────────────

function PlatformBreakdown({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  const articleTypes = new Set(['agency','major','independent','unverified'])
  const platforms = [
    { key: 'youtube', label: 'YouTube', barColor: '#c8472a' },
    { key: 'tiktok', label: 'TikTok', barColor: '#0f0f0e' },
    { key: 'instagram', label: 'Instagram', barColor: '#9b59b6' },
    { key: 'news', label: 'News outlets', barColor: '#1a4a8a' },
  ]

  const data = platforms.map(p => {
    const items = p.key === 'news'
      ? results.filter(r => articleTypes.has(r.sourceType))
      : results.filter(r => !articleTypes.has(r.sourceType) && (r.platform ?? 'youtube') === p.key)
    const score = items.reduce((s, r) => s + (SOURCE_WEIGHTS[r.sourceType] ?? 1), 0)
    const breakdown = [...new Set(items.map(r => r.sourceType))]
      .map(t => `${SOURCE_LABELS[t] ?? t}: ${items.filter(r => r.sourceType === t).length}`)
    return { ...p, items, score, breakdown }
  }).filter(p => p.items.length > 0)

  if (data.length <= 1) return null

  const maxScore = Math.max(...data.map(d => d.score), 0.1)

  return (
    <div style={{}}>
      <ChartHeader title="Platform spread" sub="Finding the same scene independently on multiple platforms is the strongest possible corroboration signal." />
      {data.map(p => (
        <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '96px 1fr 56px', gap: '16px', alignItems: 'center', marginBottom: '14px' }}>
          <span style={{ fontFamily: MONO, fontSize: '11px', color: '#0f0f0e', fontWeight: '600', textAlign: 'right' }}>{p.label}</span>
          <div style={{ height: '22px', background: '#f7f4ef', position: 'relative', overflow: 'hidden', cursor: 'default' }}
               onMouseEnter={e => show(e, [
                 p.label,
                 `${p.items.length} source${p.items.length !== 1 ? 's' : ''} · score ${p.score.toFixed(1)}`,
                 ...p.breakdown,
               ])}
               onMouseMove={move} onMouseLeave={hide}
          >
            <div style={{ height: '100%', width: `${(p.score / maxScore) * 100}%`, background: p.barColor, transition: 'width 0.6s ease' }} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: '11px', color: '#888680' }}>{p.score.toFixed(1)}pts</span>
        </div>
      ))}
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Chart 7: Reach × timing scatter ──────────────────────────────────────────

function ReachBubbles({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  const withViews = results.filter(r => r.viewCount > 0)
  if (withViews.length === 0) return null

  const W = 620, H = 160, pL = 56, pR = 24, pT = 16, pB = 40
  const plotW = W - pL - pR, plotH = H - pT - pB
  const xMin = -48, xMax = 48
  const maxViews = Math.max(...withViews.map(r => r.viewCount))
  const xS = (h: number) => pL + ((Math.max(xMin, Math.min(xMax, h)) - xMin) / (xMax - xMin)) * plotW
  const yS = (v: number) => H - pB - (Math.log(v + 1) / Math.log(maxViews + 1)) * plotH
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n)
  const ticks = [-48, -24, 0, 24, 48]

  return (
    <div style={{}}>
      <ChartHeader title="Reach × timing" sub="View counts of corroborating sources plotted against upload time. High-reach raw footage before the source line is the strongest signal." />
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
        <line x1={pL} y1={H - pB} x2={W - pR} y2={H - pB} stroke="#edeae3" strokeWidth="1" />
        {ticks.map(t => (
          <line key={t} x1={xS(t)} y1={pT} x2={xS(t)} y2={H - pB} stroke={t === 0 ? 'rgba(200,71,42,0.15)' : '#edeae3'} strokeWidth={t === 0 ? 1 : 0.5} />
        ))}
        <line x1={xS(0)} y1={pT} x2={xS(0)} y2={H - pB} stroke="#c8472a" strokeWidth="1" strokeDasharray="4,3" />
        {withViews.map((r, i) => (
          <circle key={i}
            cx={xS(r.hoursAfterSource)} cy={yS(r.viewCount)}
            r={(SOURCE_WEIGHTS[r.sourceType] ?? 1) * 3 + 2}
            fill={SOURCE_COLORS[r.sourceType as keyof typeof SOURCE_COLORS] ?? '#888680'}
            opacity={0.82}
            stroke="#f7f4ef" strokeWidth="1.5"
            style={{ cursor: 'pointer' }}
            onMouseEnter={e => show(e, [
              r.channel,
              `${fmt(r.viewCount)} views`,
              `${PLATFORM_LABELS[r.platform] ?? 'YouTube'} · ${SOURCE_LABELS[r.sourceType as keyof typeof SOURCE_LABELS]}`,
              `${r.hoursAfterSource > 0 ? '+' : ''}${r.hoursAfterSource}h from source`,
            ])}
            onMouseMove={move} onMouseLeave={hide}
          />
        ))}
        {ticks.map(t => (
          <text key={t} x={xS(t)} y={H - pB + 16} textAnchor="middle" fontSize="10" fill={t === 0 ? '#c8472a' : '#888680'} fontFamily={MONO}>
            {t === 0 ? '0' : `${t > 0 ? '+' : ''}${t}h`}
          </text>
        ))}
        <text x={pL - 6} y={pT + 4} textAnchor="end" fontSize="10" fill="#888680" fontFamily={MONO}>{fmt(maxViews)}</text>
        <text x={pL - 6} y={H - pB + 4} textAnchor="end" fontSize="10" fill="#888680" fontFamily={MONO}>0</text>
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Chart 8: Keyword consensus ────────────────────────────────────────────────

function KeywordFrequency({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  if (results.length === 0) return null

  const freq: Record<string, number> = {}
  for (const r of results) {
    const words = r.title.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
    for (const w of words) {
      if (w.length < 3) continue
      if (/^\p{N}+$/u.test(w)) continue  // skip pure numbers (years, ids…)
      const lower = w.toLowerCase()
      if (STOP_WORDS.has(lower)) continue
      freq[lower] = (freq[lower] ?? 0) + 1
    }
  }

  const top = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8)
  if (top.length === 0) return null

  const maxFreq = top[0][1]

  return (
    <div style={{}}>
      <ChartHeader title="Keyword consensus" sub="Most frequent words across corroborating titles. High overlap means independent sources describe the same event in similar terms." />
      {top.map(([word, count], i) => (
        <div key={word} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 32px', gap: '16px', alignItems: 'center', marginBottom: '10px', cursor: 'default' }}
             onMouseEnter={e => show(e, [word, `${count} title${count !== 1 ? 's' : ''}`, `${Math.round((count / results.length) * 100)}% of sources`])}
             onMouseMove={move} onMouseLeave={hide}
        >
          <span style={{ fontFamily: MONO, fontSize: '11px', color: '#0f0f0e', textAlign: 'right', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{word}</span>
          <div style={{ height: '16px', background: '#f7f4ef', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(count / maxFreq) * 100}%`, background: i === 0 ? '#0f0f0e' : '#3a3a38', opacity: Math.max(1 - i * 0.07, 0.35), transition: 'width 0.5s ease' }} />
          </div>
          <span style={{ fontFamily: MONO, fontSize: '10px', color: '#888680' }}>{count}×</span>
        </div>
      ))}
      <ChartTooltip tip={tip} />
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

  return (
    <div style={{}}>
      <ChartHeader title="Corroboration profile" sub="Six-dimensional view of corroboration quality. Fuller polygon = stronger, more diverse, less emotionally loaded signal." />
      <div style={{ display: 'flex', gap: '40px', alignItems: 'center', flexWrap: 'wrap' }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: '220px', height: '220px', flexShrink: 0 }}>
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

// ── Chart 11: Title independence matrix ───────────────────────────────────────

function OverlapMatrix({ results }: { results: any[] }) {
  const [tip, setTip] = useState<Tip | null>(null)
  const show = (e: React.MouseEvent, lines: string[]) => setTip({ x: e.clientX, y: e.clientY, lines })
  const move = (e: React.MouseEvent) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)
  const hide = () => setTip(null)

  if (results.length < 2 || results.length > 12) return null

  const wordSet = (r: any): Set<string> => new Set(
    r.title.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/)
      .filter((w: string) => w.length >= 3 && !/^\p{N}+$/u.test(w) && !STOP_WORDS.has(w.toLowerCase()))
      .map((w: string) => w.toLowerCase())
  )
  const sets = results.map(wordSet)
  const jaccard = (a: Set<string>, b: Set<string>) => {
    const inter = [...a].filter(w => b.has(w)).length
    const union = new Set([...a, ...b]).size
    return union === 0 ? 0 : inter / union
  }

  const n = results.length
  const cell = Math.min(Math.floor(260 / n), 30)
  const lw = 56

  return (
    <div style={{}}>
      <ChartHeader title="Title independence" sub="Word overlap (Jaccard %) between titles. Empty = no shared keywords = independent sources." />
      <div style={{ overflowX: 'auto' }}>
        {/* Column index headers */}
        <div style={{ display: 'flex', paddingLeft: `${lw}px`, marginBottom: '3px' }}>
          {results.map((_, i) => (
            <div key={i} style={{ width: cell, flexShrink: 0, fontFamily: MONO, fontSize: '9px', color: '#888680', textAlign: 'center' }}>#{i + 1}</div>
          ))}
        </div>
        {results.map((rA, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
            <div style={{ width: `${lw}px`, flexShrink: 0, fontFamily: MONO, fontSize: '9px', color: '#888680', textAlign: 'right', paddingRight: '6px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              #{i + 1}
            </div>
            {results.map((rB, j) => {
              const isDiag = i === j
              const sim = isDiag ? 1 : jaccard(sets[i], sets[j])
              const simPct = Math.round(sim * 100)
              const overlap = isDiag ? 'same source' : sim < 0.05 ? 'no shared keywords' : sim < 0.25 ? 'mostly independent' : sim < 0.5 ? 'some shared language' : 'high overlap — may reference same source'
              return (
                <div key={j}
                  style={{
                    width: cell, height: cell, flexShrink: 0, marginRight: 2,
                    background: isDiag ? '#0f0f0e' : sim < 0.05 ? '#f7f4ef' : `rgba(26,107,74,${0.12 + sim * 0.88})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}
                  onMouseEnter={e => show(e, [
                    isDiag ? rA.channel : `#${i+1} × #${j+1}`,
                    isDiag ? `${SOURCE_LABELS[rA.sourceType as keyof typeof SOURCE_LABELS]}` : `${simPct}% overlap`,
                    overlap,
                  ])}
                  onMouseMove={move} onMouseLeave={hide}
                >
                  {!isDiag && sim >= 0.05 && (
                    <span style={{ fontFamily: MONO, fontSize: '9px', color: sim > 0.4 ? 'white' : '#1a6b4a', fontWeight: '600' }}>{simPct}</span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div style={{ fontFamily: MONO, fontSize: '10px', color: '#888680', marginTop: '10px', textAlign: 'right' }}>
        numbers = keyword overlap % · black diagonal = self · empty = independent
      </div>
      <ChartTooltip tip={tip} />
    </div>
  )
}

// ── Who reported this ─────────────────────────────────────────────────────────

const SOURCE_RANK: Record<string, number> = { agency: 0, major: 1, independent: 2, unverified: 3, raw: 4, secondary: 5, aggregated: 6 }

function WhoReportedIt({ results, debunked, suspicious }: { results: any[]; debunked: boolean; suspicious: boolean }) {
  if (results.length === 0) return null

  const sorted = [...results].sort((a, b) => (SOURCE_RANK[a.sourceType] ?? 9) - (SOURCE_RANK[b.sourceType] ?? 9))
  const title = debunked ? 'Who fell for it' : suspicious ? 'Who spread this claim' : 'Who ran the story'
  const sub   = debunked
    ? 'These outlets published the false claim as fact. They did not wait for independent confirmation.'
    : suspicious
    ? 'These sources ran the story without sufficient verification. Not victims — they chose to publish.'
    : 'Sources that covered this story. Publishing is a choice — sorted by how much their verification process is worth trusting.'

  const fmtViews = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n/1000)}k` : n > 0 ? String(n) : '—'

  return (
    <div style={{}}>
      <p style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: debunked ? '#c8472a' : '#0f0f0e', marginBottom: '6px' }}>{title}</p>
      <p style={{ fontFamily: SANS, fontSize: '13px', color: debunked ? '#888680' : '#888680', marginBottom: debunked ? '12px' : '24px' }}>{sub}</p>
      {debunked && (
        <div style={{ fontFamily: MONO, fontSize: '9px', color: '#c8472a', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#c8472a', animation: 'pulse 1s ease-in-out infinite' }} />
          Claim independently debunked by fact-checkers
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '16px 110px 1fr auto auto', gap: '0', borderTop: '1px solid #edeae3' }}>
        {/* Header row */}
        {['', 'Source', 'Headline', 'Views', ''].map((h, i) => (
          <div key={i} style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888680', padding: '8px 10px 8px 0', borderBottom: '2px solid #0f0f0e' }}>{h}</div>
        ))}
        {sorted.map((r, i) => {
          const color = SOURCE_COLORS[r.sourceType] ?? '#888680'
          const isArticle = ['agency','major','independent','unverified'].includes(r.sourceType)
          return (
            <Fragment key={i}>
              {/* Color dot */}
              <div key={`dot-${i}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f0ede6', paddingTop: '12px', paddingBottom: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
              </div>
              {/* Source name + type */}
              <div key={`src-${i}`} style={{ padding: '12px 10px 12px 0', borderBottom: '1px solid #f0ede6' }}>
                <div style={{ fontFamily: MONO, fontSize: '10px', color: debunked ? '#f7f4ef' : '#0f0f0e', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: '100px' }}>{r.channel}</div>
                <div style={{ fontFamily: MONO, fontSize: '9px', color, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '2px' }}>{SOURCE_LABELS[r.sourceType] ?? r.sourceType}</div>
              </div>
              {/* Headline */}
              <div key={`title-${i}`} style={{ padding: '12px 16px 12px 0', borderBottom: '1px solid #f0ede6' }}>
                <div style={{ fontFamily: SANS, fontSize: '12px', color: debunked ? '#c8c8c4' : '#3a3a38', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.title}</div>
              </div>
              {/* Views */}
              <div key={`views-${i}`} style={{ padding: '12px 16px 12px 0', borderBottom: '1px solid #f0ede6', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontFamily: MONO, fontSize: '10px', color: '#888680', whiteSpace: 'nowrap' }}>{fmtViews(r.viewCount ?? 0)}</span>
              </div>
              {/* Link */}
              <div key={`link-${i}`} style={{ padding: '12px 0', borderBottom: '1px solid #f0ede6', display: 'flex', alignItems: 'center' }}>
                <a href={r.url} target="_blank" rel="noopener noreferrer"
                   style={{ fontFamily: MONO, fontSize: '9px', color, textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${color}`, paddingBottom: '1px', whiteSpace: 'nowrap' }}>
                  {isArticle ? 'Read →' : 'Watch →'}
                </a>
              </div>
            </Fragment>
          )
        })}
      </div>
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

  return (
    <div style={{}}>
      <ChartHeader title="Upload clock" sub="Hour of day (UTC) when each source was uploaded. Clustered bars may indicate scheduled or coordinated activity." />
      <div style={{ display: 'flex', gap: '48px', alignItems: 'center', flexWrap: 'wrap' }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: '220px', height: '220px', flexShrink: 0 }}>
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

function VisualVerdictHero({ checkedQuery, results, narrative, corroborationScore, corroborationLabel, hasStrongVisual, hasAnyVisual, aiScores, debunked, agencyCount, factCheckArticles, isMobile }: {
  checkedQuery: string; results: any[]; narrative: string; corroborationScore: number; corroborationLabel: string; hasStrongVisual: boolean; hasAnyVisual: boolean; aiScores: { outrage: number; simplicity: number; credibility: number }; debunked: boolean; agencyCount: number; factCheckArticles: { title: string; url: string; source: string }[]; isMobile: boolean
}) {
  const scoreColor = debunked ? '#c8472a'
    : agencyCount > 0 && aiScores.outrage < 6 ? '#1a6b4a'
    : agencyCount > 0 ? '#888680'
    : aiScores.outrage >= 7 ? '#c8472a'
    : '#555452'
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

  // Top visual witnesses — YouTube only, sorted by score desc then earliest first
  const witnesses = [...results]
    .filter(r => r.visualScore !== null && (r.platform ?? 'youtube') === 'youtube')
    .sort((a, b) => b.visualScore - a.visualScore || a.hoursAfterSource - b.hoursAfterSource)
    .slice(0, 5)

  const scoreCol = (s: number) => s >= 7 ? '#1a6b4a' : s >= 4 ? '#c8c8c4' : '#555452'
  const formatH = (h: number) => `${h > 0 ? '+' : ''}${h}h`

  return (
    <div style={{ background: '#0f0f0e' }}>

      {/* Main visual row */}
      <div style={{ padding: isMobile ? '24px 20px 0' : '40px 40px 0', display: 'flex', gap: '32px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Query text block — replaces source video */}
        <div style={{ flex: '0 0 220px' }}>
          <p style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', color: '#c8472a', letterSpacing: '0.12em', marginBottom: '10px', fontWeight: '600' }}>Verified claim</p>
          <div style={{ border: '2px solid #c8472a', padding: '20px', marginBottom: '12px', minHeight: '100px', display: 'flex', alignItems: 'center' }}>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', fontStyle: 'italic', color: '#f7f4ef', lineHeight: 1.5 }}>
              "{checkedQuery}"
            </p>
          </div>
          {/* Score pills */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ padding: '4px 10px', border: `1px solid ${(aiScores.outrage ?? 5) >= 7 ? '#c8472a' : '#3a3a38'}`, display: 'flex', gap: '6px', alignItems: 'baseline' }}>
              <span style={{ fontFamily: MONO, fontSize: '9px', color: '#555452', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Outrage</span>
              <span style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 700, color: (aiScores.outrage ?? 5) >= 7 ? '#c8472a' : (aiScores.outrage ?? 5) >= 4 ? '#888680' : '#555452' }}>{aiScores.outrage ?? '—'}</span>
              <span style={{ fontFamily: MONO, fontSize: '9px', color: '#555452' }}>/10</span>
            </div>
            <div style={{ padding: '4px 10px', border: `1px solid ${(aiScores.credibility ?? 5) >= 7 ? '#1a6b4a' : '#3a3a38'}`, display: 'flex', gap: '6px', alignItems: 'baseline' }}>
              <span style={{ fontFamily: MONO, fontSize: '9px', color: '#555452', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Credibility</span>
              <span style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 700, color: (aiScores.credibility ?? 5) >= 7 ? '#1a6b4a' : (aiScores.credibility ?? 5) >= 4 ? '#888680' : '#c8472a' }}>{aiScores.credibility ?? '—'}</span>
              <span style={{ fontFamily: MONO, fontSize: '9px', color: '#555452' }}>/10</span>
            </div>
          </div>

          {/* Fact-check warning */}
          {factCheckArticles.length > 0 && (
            <div style={{ marginTop: '16px', padding: '12px', border: '1px solid #c8472a', background: 'rgba(200,71,42,0.08)' }}>
              <p style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#c8472a', marginBottom: '8px', fontWeight: '600' }}>⚠ Fact-checkers flagged this claim</p>
              {factCheckArticles.map((a, i) => (
                <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none', marginBottom: '6px' }}>
                  <span style={{ fontFamily: MONO, fontSize: '9px', color: '#888680', marginRight: '6px' }}>{a.source}</span>
                  <span style={{ fontFamily: SANS, fontSize: '11px', color: '#c8c8c4', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.title}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Arrow */}
        {witnesses.length > 0 && (
          <div style={{ flex: '0 0 auto', paddingTop: '80px', color: '#555452', fontFamily: MONO, fontSize: '20px' }}>→</div>
        )}

        {/* Witnesses */}
        {witnesses.length > 0 ? (
          <div style={{ flex: 1, minWidth: isMobile ? '100%' : '300px' }}>
            <p style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', color: '#555452', letterSpacing: '0.12em', marginBottom: '10px' }}>
              Independent visual witnesses · sorted by scene similarity
            </p>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '4px' }}>
              {witnesses.map((r, i) => (
                <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer"
                   style={{ flex: '0 0 220px', textDecoration: 'none', display: 'block' }}>
                  <div style={{ position: 'relative', marginBottom: '12px' }}>
                    <img
                      src={`https://img.youtube.com/vi/${r.id}/hqdefault.jpg`}
                      alt=""
                      style={{ width: '100%', display: 'block', opacity: 0.85 }}
                    />
                    {/* Visual score badge */}
                    <div style={{
                      position: 'absolute', top: '6px', right: '6px',
                      background: scoreCol(r.visualScore),
                      padding: '3px 7px',
                      display: 'flex', alignItems: 'baseline', gap: '1px',
                    }}>
                      <span style={{ fontFamily: MONO, fontSize: '16px', fontWeight: 700, color: '#f7f4ef', lineHeight: 1 }}>{r.visualScore}</span>
                      <span style={{ fontFamily: MONO, fontSize: '9px', color: 'rgba(247,244,239,0.6)' }}>/10</span>
                    </div>
                    {/* Rank */}
                    <div style={{ position: 'absolute', top: '6px', left: '6px', background: '#0f0f0e', padding: '2px 5px' }}>
                      <span style={{ fontFamily: MONO, fontSize: '9px', color: '#888680' }}>#{i + 1}</span>
                    </div>
                  </div>
                  <p style={{ fontFamily: MONO, fontSize: '9px', color: '#888680', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{r.channel}</p>
                  <p style={{ fontFamily: SANS, fontSize: '12px', color: '#c8c8c4', lineHeight: 1.4, marginBottom: '6px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.title}</p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontFamily: MONO, fontSize: '9px', color: SOURCE_COLORS[r.sourceType] ?? '#888680', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{SOURCE_LABELS[r.sourceType] ?? r.sourceType}</span>
                    <span style={{ fontFamily: MONO, fontSize: '9px', color: '#555452' }}>{formatH(r.hoursAfterSource)}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, paddingTop: '60px' }}>
            <p style={{ fontFamily: MONO, fontSize: '11px', color: '#555452' }}>No visual matches scored — AI vision analysis unavailable or no YouTube sources found.</p>
          </div>
        )}
      </div>

      {/* Narrative + Visual scores side by side */}
      <div style={{ padding: isMobile ? '20px 20px 0' : '28px 40px 0', display: 'flex', gap: '48px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {narrative && (
          <div style={{ flex: '1 1 340px' }}>
            <p style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#555452', marginBottom: '10px' }}>AI assessment</p>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '16px', fontStyle: 'italic', color: '#c8c8c4', lineHeight: 1.75 }}>
              "{narrative}"
            </p>
          </div>
        )}
        {/* Inline visual scores */}
        {results.filter(r => r.visualScore !== null && (r.platform ?? 'youtube') === 'youtube').length > 0 && (
          <div style={{ flex: '1 1 260px' }}>
            <p style={{ fontFamily: MONO, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#555452', marginBottom: '14px' }}>Visual similarity scores</p>
            {results
              .filter(r => r.visualScore !== null && (r.platform ?? 'youtube') === 'youtube')
              .sort((a, b) => b.visualScore - a.visualScore)
              .map((r, i) => {
                const col = r.visualScore >= 7 ? '#1a6b4a' : r.visualScore >= 4 ? '#888680' : '#3a3a38'
                return (
                  <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 36px 28px', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: '9px', color: '#888680', marginBottom: '4px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.channel}</div>
                      <div style={{ height: '4px', background: '#1a1a18' }}>
                        <div style={{ height: '100%', width: `${r.visualScore * 10}%`, background: col, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 700, color: col, textAlign: 'right' }}>{r.visualScore}</span>
                    <span style={{ fontFamily: MONO, fontSize: '9px', color: '#555452' }}>/10</span>
                  </div>
                )
              })}
          </div>
        )}
      </div>

      {/* Verdict bar */}
      <div style={{ padding: isMobile ? '20px 20px' : '24px 40px', marginTop: '28px', borderTop: '1px solid #1a1a18', display: 'flex', alignItems: 'center', gap: '32px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontFamily: MONO, fontSize: '40px', fontWeight: 700, lineHeight: 1, color: scoreColor }}>{corroborationScore.toFixed(1)}</span>
          <span style={{ fontFamily: MONO, fontSize: '10px', color: '#555452', textTransform: 'uppercase', letterSpacing: '0.1em' }}>score</span>
        </div>
        <div style={{
          fontFamily: MONO, fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', padding: '7px 16px',
          background: badgeBg, color: badgeColor, border: `1px solid ${badgeBorder}`,
        }}>
          {corroborationLabel}
        </div>
        <span style={{ fontFamily: MONO, fontSize: '10px', color: '#555452' }}>{results.length} source{results.length !== 1 ? 's' : ''} found</span>
        {hasAnyVisual && !hasStrongVisual && (
          <span style={{ fontFamily: MONO, fontSize: '9px', color: '#555452', fontStyle: 'italic' }}>
            Visual analysis based on auto-generated thumbnails — accuracy varies
          </span>
        )}
      </div>

      {/* Score bar */}
      <div style={{ height: '3px', background: '#1a1a18' }}>
        <div style={{ width: `${Math.min((corroborationScore / 12) * 100, 100)}%`, height: '3px', background: scoreColor, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Home() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [currentStep, setCurrentStep] = useState(-1)
  const [checkedQuery, setCheckedQuery] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [narrative, setNarrative] = useState<string>('')
  const [aiScores, setAiScores] = useState<{ outrage: number; simplicity: number; credibility: number }>({ outrage: 5, simplicity: 5, credibility: 5 })
  const [debunked, setDebunked] = useState(false)
  const [agencyCount, setAgencyCount] = useState(0)
  const [factCheckArticles, setFactCheckArticles] = useState<{ title: string; url: string; source: string }[]>([])

  // Visual score multiplier — unverified sources get no bonus (same clip re-uploaded ≠ independent corroboration)
  const visualMultiplier = (r: any): number => {
    if (r.visualScore === null || r.visualScore === undefined) return 1.0
    if (r.sourceType === 'unverified') return r.visualScore >= 3 ? 1.0 : 0.8
    if (r.visualScore >= 7) return 1.5
    if (r.visualScore >= 3) return 1.0
    return 0.8
  }

  // Cap total unverified contribution: 10 re-uploads of the same clip don't equal 10 independent sources
  const UNVERIFIED_CAP = 1.5
  const corroborationScore = (() => {
    let total = 0
    let unverifiedTotal = 0
    for (const r of results) {
      const contribution = (SOURCE_WEIGHTS[r.sourceType] ?? 1) * visualMultiplier(r)
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

  // Credibility-based verdict (replaces simple corroboration count)
  const unverifiedRatio = results.length > 0
    ? results.filter(r => ['unverified','raw'].includes(r.sourceType)).length / results.length
    : 0
  const corroborationLabel = (() => {
    if (results.length === 0) return 'No coverage found'
    if (debunked) return 'Flagged as false'
    if (agencyCount > 0 && aiScores.outrage < 6) return hasStrongVisual ? 'Visually confirmed' : 'Credibly reported'
    if (agencyCount > 0) return 'Reported — verify independently'
    if (aiScores.outrage >= 7 && unverifiedRatio > 0.5) return 'Suspicious claim'
    if (aiScores.credibility >= 6) return 'Partially corroborated'
    return 'Unverified claim'
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
    fetch('/api/recent-queries').then(r => r.json()).then(d => setRecentQueries(d.queries ?? [])).catch(() => {})
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const charCount = query.replace(/\s/g, '').length
  const charsNeeded = Math.max(0, 30 - charCount)

  const analyze = async () => {
    if (!query.trim() || charsNeeded > 0) return
    setResults([])
    setSearched(false)
    setCheckedQuery('')
    setError(null)
    fetch('/api/recent-queries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: query.trim() }) })
      .then(r => r.json()).then(d => setRecentQueries(d.queries ?? [])).catch(() => {})
    setNarrative('')
    setAiScores({ outrage: 5, simplicity: 5, credibility: 5 })
    setDebunked(false)
    setAgencyCount(0)
    setFactCheckArticles([])
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
            if (typeof data.step === 'number') setCurrentStep(data.step)
            if (data._debug) console.log('[AI debug]', data._debug)
            if (data.result) {
              setCheckedQuery(data.result.query ?? query)
              setResults(data.result.results ?? [])
              setNarrative(data.result.narrative ?? '')
              setFactCheckArticles(data.result.factCheckArticles ?? [])
              if (data.result.scores) {
                const s = data.result.scores
                setAiScores({ outrage: s.outrage ?? 5, simplicity: s.simplicity ?? 5, credibility: s.credibility ?? 5 })
                setDebunked(s.debunked ?? false)
                setAgencyCount(s.agencyCount ?? 0)
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

  const hasViews = results.some(r => r.viewCount > 0)
  const articleTypes = new Set(['agency','major','independent','unverified'])
  const hasVideos = results.some(r => !articleTypes.has(r.sourceType))
  const hasArticles = results.some(r => articleTypes.has(r.sourceType))
  const hasPlatforms = hasVideos && (new Set(results.filter(r => !articleTypes.has(r.sourceType)).map(r => r.platform ?? 'youtube')).size > 1 || hasArticles)
  const hasOverlap = results.length >= 2 && results.length <= 12
  const hasUploadClock = results.length >= 3
  const hasVisualScores = results.some(r => r.visualScore !== null && (r.platform ?? 'youtube') === 'youtube')

  // Card wrapper for dashboard grid cells
  const C = ({ children, span = 6, bg = '#f7f4ef' }: { children: React.ReactNode; span?: number; bg?: string }) => (
    <div style={{ gridColumn: isMobile ? 'span 12' : `span ${span}`, background: bg, padding: isMobile ? '24px 16px' : '32px 28px', minWidth: 0, overflow: 'hidden' }}>{children}</div>
  )

  return (
    <main style={{ background: '#f7f4ef', minHeight: '100vh' }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ borderBottom: '1px solid #0f0f0e', padding: isMobile ? '16px 20px' : '18px 40px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '26px', fontWeight: 700, color: '#0f0f0e' }}>
          Converg<span style={{ color: '#c8472a' }}>.</span>
        </span>
        <span style={{ fontFamily: MONO, fontSize: '10px', color: '#888680', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          News corroboration engine
        </span>
      </header>

      {/* ── Input area ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
      <div style={{ flex: 1, maxWidth: isMobile ? '100%' : '760px', padding: isMobile ? '40px 20px 0' : '64px 40px 0' }}>
        <p style={{ fontFamily: MONO, fontSize: '11px', color: '#c8472a', marginBottom: '20px' }}>Don't trust one source.</p>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '40px', fontWeight: 400, lineHeight: 1.15, color: '#0f0f0e', marginBottom: '20px' }}>
          Real events leave <em style={{ color: '#3a3a38' }}>multiple traces.</em>
        </h1>
        <p style={{ fontFamily: SANS, fontSize: '15px', color: '#3a3a38', lineHeight: 1.65, marginBottom: '48px', maxWidth: '540px' }}>
          Describe a news event. Converg searches for corroboration across agencies, independent outlets and raw footage — then scores reliability based on source diversity, timing, language spread and outrage signals.
        </p>
        <div style={{ border: `1px solid ${loading ? '#888680' : '#0f0f0e'}`, background: 'white', display: 'flex', marginBottom: '48px', opacity: loading ? 0.6 : 1, transition: 'all 0.3s' }}>
          <input
            type="text"
            placeholder="Describe the news event to verify…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && analyze()}
            disabled={loading}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', padding: '16px 20px', fontFamily: MONO, fontSize: '13px', color: '#0f0f0e', background: 'transparent' }}
          />
          {mounted && charsNeeded > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', padding: '0 16px', fontFamily: MONO, fontSize: '15px', fontWeight: 600, color: charCount === 0 ? '#b0a8a0' : charCount >= 20 ? '#1a6b4a' : charCount >= 10 ? '#b07a3a' : '#c8472a', borderLeft: '1px solid #edeae3', transition: 'color 0.2s', whiteSpace: 'nowrap', minWidth: '48px', justifyContent: 'center' }}>
              {charsNeeded}
            </span>
          )}
          <button className="analyze-btn" onClick={analyze} disabled={loading || (mounted && charsNeeded > 0)}
            style={{ border: 'none', borderLeft: `1px solid ${loading ? '#888680' : '#0f0f0e'}`, background: loading ? '#888680' : '#0f0f0e', color: '#f7f4ef', fontFamily: MONO, fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '16px 24px', cursor: loading ? 'default' : 'pointer', transition: 'background 0.15s' }}>
            {loading ? '...' : 'Analyze →'}
          </button>
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
            corroborationScore={corroborationScore}
            corroborationLabel={corroborationLabel}
            hasStrongVisual={hasStrongVisual}
            hasAnyVisual={hasAnyVisual}
            aiScores={aiScores}
            debunked={debunked}
            agencyCount={agencyCount}
            factCheckArticles={factCheckArticles}
            isMobile={isMobile}
          />

          {results.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(12, 1fr)', gap: '1px', background: '#d4d0c8' }}>

              {/* Row 1: score buildup + score anatomy */}
              <C span={8}><CorroborationBuildup results={results} /></C>
              <C span={4}><ScoreAnatomy results={results} /></C>

              {/* Row 2: corroboration profile + clock */}
              <C span={hasUploadClock ? 6 : 12}><DiversityRadar results={results} aiScores={aiScores} /></C>
              {hasUploadClock && <C span={6}><UploadClock results={results} /></C>}

              {/* Row 3: swim lanes + title independence */}
              <C span={8}><SwimLanes results={results} /></C>
              <C span={4}>{hasOverlap ? <OverlapMatrix results={results} /> : <VelocityHistogram results={results} />}</C>

              {/* Row 4: witness matrix + keyword frequency */}
              <C span={7}><WitnessMatrix results={results} /></C>
              <C span={5}><KeywordFrequency results={results} /></C>

              {/* Row 5: who reported this — full width, always */}
              <C span={12} bg={debunked ? '#1a0808' : '#f2efe9'}>
                <WhoReportedIt results={results} debunked={debunked} suspicious={corroborationColor === 'suspicious'} />
              </C>

              {/* Row 6 conditional: reach × timing + visual similarity */}
              {hasViews && <C span={hasVisualScores ? 6 : 12}><ReachBubbles results={results} /></C>}
              {hasVisualScores && <C span={hasViews ? 6 : 12}><VisualMatchChart results={results} /></C>}
              {hasPlatforms && <C span={12}><PlatformBreakdown results={results} /></C>}

            </div>
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

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div style={{ background: '#0f0f0e', padding: isMobile ? '32px 20px' : '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '24px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: isMobile ? '16px' : '22px', fontWeight: 400, color: '#f7f4ef', lineHeight: 1.35, flex: '1 1 0', minWidth: 0 }}>
            <em>Converg is pure heuristics — source authority, emotional tone,<br />and coverage rarity, cross-referenced.</em>
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
