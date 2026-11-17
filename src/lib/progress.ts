import { HANDS, type Bar, type Hand, type Level, type PracticeFilter, type Section, type Status, type StatusLogEntry, statusId } from '../db/types'

export interface LevelCounts {
  grey: number
  red: number
  yellow: number
  green: number
}

export function emptyCounts(): LevelCounts {
  return { grey: 0, red: 0, yellow: 0, green: 0 }
}

export function levelOf(statuses: Record<string, Status>, barId: string, hand: Hand): Level {
  return statuses[statusId(barId, hand)]?.level ?? 'grey'
}

export function countLevels(bars: Bar[], statuses: Record<string, Status>, hand: Hand): LevelCounts {
  const c = emptyCounts()
  for (const b of bars) c[levelOf(statuses, b.id, hand)]++
  return c
}

export function countsByHand(bars: Bar[], statuses: Record<string, Status>): Record<Hand, LevelCounts> {
  const out = {} as Record<Hand, LevelCounts>
  for (const h of HANDS) out[h] = countLevels(bars, statuses, h)
  return out
}

/** Percentage (0..100, rounded) of bars that are green for the given hand. */
export function percentGreen(bars: Bar[], statuses: Record<string, Status>, hand: Hand = 'HT'): number {
  if (bars.length === 0) return 0
  const c = countLevels(bars, statuses, hand)
  return Math.round((c.green / bars.length) * 100)
}

export function barsInSection(bars: Bar[], section: Pick<Section, 'startBar' | 'endBar'>): Bar[] {
  const lo = Math.min(section.startBar, section.endBar)
  const hi = Math.max(section.startBar, section.endBar)
  return bars.filter((b) => b.number >= lo && b.number <= hi)
}

export function needsWork(level: Level, filter: PracticeFilter): boolean {
  if (filter.threshold === 'red') return level === 'red'
  return level === 'red' || level === 'yellow'
}

/**
 * Find the next (direction 1) or previous (direction -1) bar, in reading order, that still
 * needs work according to the filter. Starts strictly after/before `fromOrder`; wraps around.
 * Returns null when no bar matches.
 */
export function findTarget(
  bars: Bar[],
  statuses: Record<string, Status>,
  filter: PracticeFilter,
  fromOrder: number | null,
  direction: 1 | -1,
): Bar | null {
  if (bars.length === 0) return null
  const sorted = [...bars].sort((a, b) => a.order - b.order)
  const n = sorted.length
  let start: number
  if (fromOrder === null) start = direction === 1 ? 0 : n - 1
  else {
    const idx = sorted.findIndex((b) => b.order === fromOrder)
    start = idx === -1 ? (direction === 1 ? 0 : n - 1) : (idx + direction + n) % n
  }
  for (let k = 0; k < n; k++) {
    const b = sorted[(start + direction * k + n) % n]
    if (needsWork(levelOf(statuses, b.id, filter.hand), filter)) return b
  }
  return null
}

export interface DayCounts {
  /** Local-date key YYYY-MM-DD. */
  day: string
  red: number
  yellow: number
  green: number
  grey: number
}

export function dayKey(time: number): string {
  const d = new Date(time)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/**
 * Replay the status log and return the HT counts at the end of each day that had a change,
 * plus today's current state. Only bars that still exist are counted.
 */
export function historyByDay(bars: Bar[], log: StatusLogEntry[], now: number, hand: Hand = 'HT'): DayCounts[] {
  const barIds = new Set(bars.map((b) => b.id))
  const entries = log.filter((e) => e.hand === hand && barIds.has(e.barId)).sort((a, b) => a.time - b.time)
  const state = new Map<string, Level>()
  const out: DayCounts[] = []
  const snapshot = (day: string): DayCounts => {
    const c = { day, red: 0, yellow: 0, green: 0, grey: 0 }
    for (const id of barIds) c[state.get(id) ?? 'grey']++
    return c
  }
  let currentDay: string | null = null
  for (const e of entries) {
    const d = dayKey(e.time)
    if (currentDay !== null && d !== currentDay) out.push(snapshot(currentDay))
    currentDay = d
    state.set(e.barId, e.level)
  }
  if (currentDay !== null) out.push(snapshot(currentDay))
  const today = dayKey(now)
  if (out.length === 0 || out[out.length - 1].day !== today) out.push(snapshot(today))
  return out
}
