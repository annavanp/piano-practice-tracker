import { newId, type Bar, type System } from '../db/types'

/** Reading order: page, then top edge, then left edge. */
export function sortSystems(systems: System[]): System[] {
  return [...systems].sort((a, b) => a.page - b.page || a.rect.y - b.rect.y || a.rect.x - b.rect.x)
}

/** Tolerance (fraction of system width) within which a bar edge counts as unchanged. */
const EDGE_TOLERANCE = 0.004

interface Edges {
  relLeft: number
  relRight: number
}

export function barEdges(system: System): Edges[] {
  const inner = [...system.barlines].filter((x) => x > 0 && x < 1).sort((a, b) => a - b)
  const points = [0, ...inner, 1]
  const out: Edges[] = []
  for (let i = 0; i < points.length - 1; i++) {
    out.push({ relLeft: points[i], relRight: points[i + 1] })
  }
  return out
}

/**
 * Derive bars from systems. A bar keeps its id (and so its lights) when it sits in the
 * same system at the same relative edges as before; everything else gets a fresh id.
 * Numbering is firstBarNumber + reading-order index.
 */
export function deriveBars(pieceId: string, systems: System[], firstBarNumber: number, previous: Bar[]): Bar[] {
  const prevBySystem = new Map<string, Bar[]>()
  for (const b of previous) {
    const list = prevBySystem.get(b.systemId) ?? []
    list.push(b)
    prevBySystem.set(b.systemId, list)
  }
  const used = new Set<string>()
  const bars: Bar[] = []
  let order = 0
  for (const system of sortSystems(systems)) {
    const { x, w } = system.rect
    const candidates = prevBySystem.get(system.id) ?? []
    for (const e of barEdges(system)) {
      let id: string | null = null
      for (const old of candidates) {
        if (used.has(old.id)) continue
        if (Math.abs(old.relLeft - e.relLeft) < EDGE_TOLERANCE && Math.abs(old.relRight - e.relRight) < EDGE_TOLERANCE) {
          id = old.id
          used.add(old.id)
          break
        }
      }
      bars.push({
        id: id ?? newId(),
        pieceId,
        systemId: system.id,
        order,
        number: firstBarNumber + order,
        left: x + e.relLeft * w,
        right: x + e.relRight * w,
        relLeft: e.relLeft,
        relRight: e.relRight,
      })
      order++
    }
  }
  return bars
}
