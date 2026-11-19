import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PdfPage } from '../components/PdfPage'
import { Stepper } from '../components/Stepper'
import { newId, type Bar, type PieceData, type Rect, type System } from '../db/types'
import type { PieceActions } from '../hooks/usePieceData'
import { useElementWidth } from '../hooks/useElementWidth'
import { usePdfDocument } from '../hooks/usePdfDocument'
import { usePieceData } from '../hooks/usePieceData'
import { deriveBars } from '../lib/bars'
import { navigate } from '../router'

/*
 * Bar marking works in one mode, so a whole page can be done without switching tools:
 *   drag on empty paper        → draw a system
 *   tap inside a system        → add a barline there
 *   tap a barline              → remove it;  drag a barline → move it
 *   drag a corner handle       → resize the system
 *   drag inside a system       → move the system
 *   ✕ beside a system          → delete it
 *   two fingers                → scroll (one finger draws)
 */

const HIT_PX = 22 // half of a 44pt touch target
const TAP_PX = 10 // a finger that moves less than this is a tap
const SNAP_PX = 14 // system edges snap to other systems' edges within this distance
const MIN_SYSTEM = 0.02

type Corner = 'nw' | 'ne' | 'sw' | 'se'

type Drag =
  | { type: 'draw'; x0: number; y0: number }
  /** Started inside a system away from barlines: a tap adds a barline, a drag moves the system. */
  | { type: 'body'; id: string; start: Rect; x0: number; y0: number; moved: boolean; before: System[] }
  | { type: 'resize'; id: string; corner: Corner; start: Rect; x0: number; y0: number; before: System[] }
  | { type: 'barline'; id: string; index: number; x0: number; moved: boolean; before: System[] }

export function Setup({ pieceId }: { pieceId: string }) {
  const { data, actions } = usePieceData(pieceId)
  useEffect(() => {
    if (data === null) navigate({ name: 'library' })
  }, [data])
  if (data === undefined) return <div className="empty">Loading…</div>
  if (data === null) return null
  return <SetupView data={data} actions={actions} pieceId={pieceId} />
}

interface SetupViewProps {
  data: PieceData
  actions: PieceActions
  pieceId: string
}

function SetupView({ data, actions, pieceId }: SetupViewProps) {
  const pdf = usePdfDocument(data.piece.pdf)
  const scoreRef = useRef<HTMLDivElement>(null)
  const width = useElementWidth(scoreRef)
  const [systems, setSystems] = useState<System[]>(data.systems)
  const [history, setHistory] = useState<System[][]>([])
  const [draft, setDraft] = useState<{ page: number; rect: Rect } | null>(null)
  const [firstBar, setFirstBar] = useState<number>(data.piece.firstBarNumber)
  const dragRef = useRef<Drag | null>(null)
  /** Set by the overlay so a second finger can cancel the one-finger gesture in progress. */
  const cancelDragRef = useRef<(() => void) | null>(null)

  const pageWidth = Math.max(0, width)

  const commit = useCallback(
    (before: System[], next: System[]) => {
      setHistory((h) => [...h.slice(-99), before])
      setSystems(next)
      void actions.saveSystems(next)
    },
    [actions],
  )

  const undo = () => {
    if (history.length === 0) return
    const prev = history[history.length - 1]
    setHistory((h) => h.slice(0, -1))
    setSystems(prev)
    void actions.saveSystems(prev)
  }

  // Two-finger pan scrolls the score; one finger is reserved for drawing.
  useEffect(() => {
    const el = scoreRef.current
    if (!el) return
    let last: { x: number; y: number } | null = null
    const mid = (t: TouchList) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 })
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        cancelDragRef.current?.()
        last = mid(e.touches)
        e.preventDefault()
      }
    }
    const onMove = (e: TouchEvent) => {
      if (!last || e.touches.length !== 2) return
      e.preventDefault()
      const m = mid(e.touches)
      el.scrollTop -= m.y - last.y
      el.scrollLeft -= m.x - last.x
      last = m
    }
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) last = null
    }
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  const bars = useMemo<Bar[]>(() => deriveBars(pieceId, systems, firstBar, data.bars), [data.bars, systems, firstBar, pieceId])

  const hint =
    systems.length === 0
      ? 'Drag a rectangle around each system (both staves together). You can draw them all first, then tap in the barlines.'
      : 'Drag on empty paper for a new system · tap inside a system to add a barline · tap a barline to remove it · drag a corner or the system to adjust · scroll with two fingers.'

  const changeFirstBar = (n: number) => {
    setFirstBar(n)
    void actions.updatePiece({ firstBarNumber: n })
  }

  return (
    <div className="setup" data-testid="setup">
      <div className="toolbar">
        <button onClick={() => navigate({ name: data.bars.length > 0 ? 'practice' : 'library', id: pieceId })} aria-label="Back">
          ←
        </button>
        <span className="title">{data.piece.title} · mark bars</span>
        <button onClick={undo} disabled={history.length === 0} data-testid="undo">
          Undo
        </button>
        <div className="group">
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>First bar</span>
          <Stepper value={firstBar} onChange={changeFirstBar} min={0} max={999} label="First bar number" testId="first-bar" />
        </div>
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }} data-testid="bar-count">
          {systems.length} system{systems.length === 1 ? '' : 's'} · {bars.length} bars
        </span>
        <button className="primary" onClick={() => navigate({ name: 'practice', id: pieceId })} disabled={bars.length === 0} data-testid="done">
          Done
        </button>
        <span className="hint">{hint}</span>
      </div>
      <div className="score" ref={scoreRef} data-testid="setup-score">
        {pdf && pageWidth > 0 && (
          <div className="score-inner">
            {pdf.sizes.map((size, i) => {
              const H = (pageWidth * size.height) / size.width
              return (
                <PdfPage key={i} doc={pdf.doc} pageIndex={i} size={size} cssWidth={pageWidth} settled>
                  <SetupOverlay
                    page={i}
                    W={pageWidth}
                    H={H}
                    systems={systems}
                    bars={bars}
                    draft={draft?.page === i ? draft.rect : null}
                    dragRef={dragRef}
                    cancelDragRef={cancelDragRef}
                    setDraft={setDraft}
                    setSystems={setSystems}
                    commit={commit}
                    pieceId={pieceId}
                  />
                </PdfPage>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

interface OverlayProps {
  page: number
  W: number
  H: number
  systems: System[]
  bars: Bar[]
  draft: Rect | null
  dragRef: React.MutableRefObject<Drag | null>
  cancelDragRef: React.MutableRefObject<(() => void) | null>
  setDraft: (d: { page: number; rect: Rect } | null) => void
  setSystems: (s: System[]) => void
  commit: (before: System[], next: System[]) => void
  pieceId: string
}

function normRect(x0: number, y0: number, x1: number, y1: number): Rect {
  const x = Math.max(0, Math.min(x0, x1))
  const y = Math.max(0, Math.min(y0, y1))
  return { x, y, w: Math.min(1, Math.max(x0, x1)) - x, h: Math.min(1, Math.max(y0, y1)) - y }
}

function inRect(r: Rect, fx: number, fy: number): boolean {
  return fx >= r.x && fx <= r.x + r.w && fy >= r.y && fy <= r.y + r.h
}

function corners(r: Rect): Record<Corner, { x: number; y: number }> {
  return {
    nw: { x: r.x, y: r.y },
    ne: { x: r.x + r.w, y: r.y },
    sw: { x: r.x, y: r.y + r.h },
    se: { x: r.x + r.w, y: r.y + r.h },
  }
}

const OPPOSITE: Record<Corner, Corner> = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' }

function SetupOverlay(p: OverlayProps) {
  const { page, W, H, systems, bars, draft, dragRef, cancelDragRef, setDraft, setSystems, commit } = p
  const svgRef = useRef<SVGSVGElement>(null)
  const pageSystems = systems.filter((s) => s.page === page)

  const toFrac = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height }
  }
  const slopX = HIT_PX / W
  const slopY = HIT_PX / H
  const isTap = (dx: number, dy: number) => Math.hypot(dx * W, dy * H) <= TAP_PX

  /** Snap a horizontal edge to the nearest left/right edge of another system in the piece. */
  const snapX = (x: number, excludeId?: string) => {
    let best = x
    let bestDist = SNAP_PX / W
    for (const s of systems) {
      if (s.id === excludeId) continue
      for (const edge of [s.rect.x, s.rect.x + s.rect.w]) {
        const d = Math.abs(edge - x)
        if (d < bestDist) {
          bestDist = d
          best = edge
        }
      }
    }
    return best
  }

  const cancel = () => {
    const d = dragRef.current
    dragRef.current = null
    setDraft(null)
    if (d && 'before' in d) setSystems(d.before)
  }

  const onDown = (e: React.PointerEvent) => {
    if (!e.isPrimary) {
      // A second finger: abandon the one-finger gesture so it can scroll instead.
      cancel()
      return
    }
    if (dragRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    cancelDragRef.current = cancel
    const { fx, fy } = toFrac(e)

    // 1. Corner handles of any system on this page.
    for (const s of pageSystems) {
      for (const [corner, c] of Object.entries(corners(s.rect)) as [Corner, { x: number; y: number }][]) {
        if (Math.abs(c.x - fx) <= slopX && Math.abs(c.y - fy) <= slopY) {
          dragRef.current = { type: 'resize', id: s.id, corner, start: s.rect, x0: fx, y0: fy, before: systems }
          return
        }
      }
    }

    // 2. Inside a system: an existing barline, or the body.
    const sys = [...pageSystems].reverse().find((s) => inRect(s.rect, fx, fy))
    if (sys) {
      const rel = (fx - sys.rect.x) / sys.rect.w
      let nearest = -1
      let best = slopX / sys.rect.w
      sys.barlines.forEach((b, i) => {
        const d = Math.abs(b - rel)
        if (d <= best) {
          best = d
          nearest = i
        }
      })
      dragRef.current =
        nearest >= 0
          ? { type: 'barline', id: sys.id, index: nearest, x0: fx, moved: false, before: systems }
          : { type: 'body', id: sys.id, start: sys.rect, x0: fx, y0: fy, moved: false, before: systems }
      return
    }

    // 3. Empty paper: draw a new system.
    dragRef.current = { type: 'draw', x0: snapX(fx), y0: fy }
    setDraft({ page, rect: { x: fx, y: fy, w: 0, h: 0 } })
  }

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || !e.isPrimary) return
    const { fx, fy } = toFrac(e)
    switch (d.type) {
      case 'draw':
        setDraft({ page, rect: normRect(d.x0, d.y0, snapX(fx), fy) })
        break
      case 'body': {
        if (!d.moved && isTap(fx - d.x0, fy - d.y0)) return
        d.moved = true
        const nx = Math.min(1 - d.start.w, Math.max(0, d.start.x + fx - d.x0))
        const ny = Math.min(1 - d.start.h, Math.max(0, d.start.y + fy - d.y0))
        setSystems(systems.map((s) => (s.id === d.id ? { ...s, rect: { ...d.start, x: nx, y: ny } } : s)))
        break
      }
      case 'resize': {
        const c = corners(d.start)
        const moving = c[d.corner]
        const opposite = c[OPPOSITE[d.corner]]
        const r = normRect(opposite.x, opposite.y, snapX(moving.x + fx - d.x0, d.id), moving.y + fy - d.y0)
        if (r.w < MIN_SYSTEM || r.h < MIN_SYSTEM) return
        setSystems(systems.map((s) => (s.id === d.id ? { ...s, rect: r } : s)))
        break
      }
      case 'barline': {
        if (!d.moved && isTap(fx - d.x0, 0)) return
        d.moved = true
        setSystems(
          systems.map((s) => {
            if (s.id !== d.id) return s
            const rel = Math.min(0.995, Math.max(0.005, (fx - s.rect.x) / s.rect.w))
            const barlines = [...s.barlines]
            barlines[d.index] = rel
            return { ...s, barlines: barlines.sort((a, b) => a - b) }
          }),
        )
        break
      }
    }
  }

  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d || !e.isPrimary) return
    dragRef.current = null
    cancelDragRef.current = null
    const { fx, fy } = toFrac(e)
    switch (d.type) {
      case 'draw': {
        const r = normRect(d.x0, d.y0, snapX(fx), fy)
        setDraft(null)
        if (r.w >= MIN_SYSTEM && r.h >= MIN_SYSTEM) {
          commit(systems, [...systems, { id: newId(), pieceId: p.pieceId, page, rect: r, barlines: [] }])
        }
        break
      }
      case 'body': {
        if (d.moved) {
          commit(d.before, systems)
          break
        }
        // A tap: add a barline where the finger went down.
        const rel = Math.min(0.995, Math.max(0.005, (d.x0 - d.start.x) / d.start.w))
        commit(
          d.before,
          d.before.map((s) => (s.id === d.id ? { ...s, barlines: [...s.barlines, rel].sort((a, b) => a - b) } : s)),
        )
        break
      }
      case 'resize':
        commit(d.before, systems)
        break
      case 'barline':
        if (d.moved) commit(d.before, systems)
        else commit(d.before, d.before.map((s) => (s.id === d.id ? { ...s, barlines: s.barlines.filter((_, i) => i !== d.index) } : s)))
        break
    }
  }

  const deleteSystem = (id: string) => {
    commit(
      systems,
      systems.filter((s) => s.id !== id),
    )
  }

  return (
    <>
      <svg
        ref={svgRef}
        className="setup-overlay"
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        data-testid="setup-overlay"
        data-page={page}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={cancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {pageSystems.map((s) => {
          const r = s.rect
          return (
            <g key={s.id} data-testid="system" data-system-id={s.id}>
              <rect className="system" x={r.x * W} y={r.y * H} width={r.w * W} height={r.h * H} />
              {s.barlines.map((b, i) => {
                const x = (r.x + b * r.w) * W
                return <line key={i} className="barline" data-testid="barline" x1={x} y1={r.y * H} x2={x} y2={(r.y + r.h) * H} />
              })}
              {Object.values(corners(r)).map((c, i) => (
                <circle key={i} className="handle" cx={c.x * W} cy={c.y * H} r={7} />
              ))}
            </g>
          )
        })}
        {bars
          .filter((b) => pageSystems.some((s) => s.id === b.systemId))
          .map((b) => {
            const sys = pageSystems.find((s) => s.id === b.systemId)!
            return (
              <text key={b.id} className="barnum" x={b.left * W + 10} y={sys.rect.y * H - 4} data-testid="bar-number" data-bar={b.number}>
                {b.number}
              </text>
            )
          })}
        {draft && <rect className="draft" x={draft.x * W} y={draft.y * H} width={draft.w * W} height={draft.h * H} />}
      </svg>
      {pageSystems.map((s) => {
        // Beside the system's right edge, vertically centred, kept on the page.
        const left = Math.min((s.rect.x + s.rect.w) * W + 30, W - 24)
        const top = (s.rect.y + s.rect.h / 2) * H
        return (
          <button
            key={s.id}
            className="sys-delete"
            aria-label="Delete system"
            data-testid="delete-system"
            style={{ left, top }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => deleteSystem(s.id)}
          >
            ✕
          </button>
        )
      })}
    </>
  )
}
