import type { DayCounts } from '../lib/progress'

interface Props {
  days: DayCounts[]
  total: number
}

const W = 300
const H = 120
const PAD = { l: 26, r: 4, t: 6, b: 22 }

/** Stacked columns of HT red / yellow / green counts, one per day with changes. */
export function HistoryChart({ days, total }: Props) {
  if (days.length === 0 || total === 0) return <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No changes recorded yet.</p>
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const n = days.length
  const slot = innerW / n
  const colW = Math.min(28, slot * 0.7)
  const y = (v: number) => PAD.t + innerH - (v / total) * innerH
  const label = (day: string) => {
    const [, m, d] = day.split('-')
    return `${parseInt(d, 10)}/${parseInt(m, 10)}`
  }
  const labelEvery = Math.max(1, Math.ceil(n / 6))
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="History of hands-together lights by day" data-testid="history-chart">
      <line x1={PAD.l} y1={y(0)} x2={W - PAD.r} y2={y(0)} stroke="var(--border)" />
      <line x1={PAD.l} y1={y(total)} x2={W - PAD.r} y2={y(total)} stroke="var(--border)" strokeDasharray="2 3" />
      <text x={PAD.l - 4} y={y(total) + 4} fontSize="10" textAnchor="end" fill="var(--text-muted)">
        {total}
      </text>
      <text x={PAD.l - 4} y={y(0) + 4} fontSize="10" textAnchor="end" fill="var(--text-muted)">
        0
      </text>
      {days.map((d, i) => {
        const x = PAD.l + slot * i + (slot - colW) / 2
        const gTop = y(d.green)
        const yTop = y(d.green + d.yellow)
        const rTop = y(d.green + d.yellow + d.red)
        return (
          <g key={d.day} data-day={d.day} data-red={d.red} data-yellow={d.yellow} data-green={d.green}>
            <rect x={x} y={gTop} width={colW} height={y(0) - gTop} fill="var(--green)" />
            <rect x={x} y={yTop} width={colW} height={gTop - yTop} fill="var(--yellow)" />
            <rect x={x} y={rTop} width={colW} height={yTop - rTop} fill="var(--red)" />
            {(i % labelEvery === 0 || i === n - 1) && (
              <text x={x + colW / 2} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--text-muted)">
                {label(d.day)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
