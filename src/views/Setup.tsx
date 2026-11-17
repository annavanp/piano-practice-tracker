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

type Mode = 'systems' | 'barlines'

const HIT_PX = 22 // half of a 44pt touch target
const MOVE_PX = 6
const MIN_SYSTEM = 0.02

type Corner = 'nw' | 'ne' | 'sw' | 'se'

type Drag =
  | { type: 'draw'; page: number; x0: number; y0: number }
  | { type: 'move'; id: string; start: Rect; x0: number; y0: number; moved: boolean; before: System[] }
  | { type: 'resize'; id: string; corner: Corner; start: Rect; x0: number; y0: number; before: System[] }
  | { type: 'barline'; id: string; index: number; x0: number; moved: boolean; before: System[] }
  | { type: 'addbar'; id: string; rel: number; x0: number; y0: number }

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
  const [mode, setMode] = useState<Mode>('systems')
  const [systems, setSystems] = useState<System[]>(data.systems)
  const [selected, setSelected] = useState<string | null>(null)
  const [history, setHistory] = useState<System[][]>([])
  const [draft, setDraft] = useState<{ page: number; rect: Rect } | null>(null)
  const [firstBar, setFirstBar] = useState<number>(data.piece.firstBarNumber)
  const dragRef = useRef<Drag | null>(null)

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
    setSelected((id) => (prev.some((s) => s.id === id) ? id : null))
    void actions.saveSystems(prev)
  }

  const bars = useMemo<Bar[]>(() => deriveBars(pieceId, systems, firstBar, data.bars), [data.bars, systems, firstBar, pieceId])

  const hint =
    mode === 'systems'
      ? selected
        ? 'Drag the system to move it, drag a corner to resize, or tap ✕ to delete it.'
        : 'Drag a rectangle around each system (both staves together). Tap a system to select it.'
      : 'Tap inside a system to add a barline. Tap a barline to delete it, or drag it to move it. The edges count as barlines already.'

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
        <div className="segmented" role="radiogroup" aria-label="Mode">
          <button className={mode === 'systems' ? 'active' : ''} role="radio" aria-checked={mode === 'systems'} onClick={() => setMode('systems')} data-testid="mode-systems">
            Systems
          </button>
          <button
            className={mode === 'barlines' ? 'active' : ''}
            role="radio"
            aria-checked={mode === 'barlines'}
            onClick={() => {
              setMode('barlines')
              setSelected(null)
            }}
            data-testid="mode-barlines"
          >
            Barlines
          </button>
        </div>
        <button onClick={undo} disabled={history.length === 0} data-testid="undo">
          Undo
        </button>
        <div className="group">
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>First bar</span>
          <Stepper value={firstBar} onChange={changeFirstBar} min={0} max={999} label="First bar number" testId="first-bar" />
        </div>
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }} data-testid="bar-count">
          {bars.length} bars
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
                    mode={mode}
                    systems={systems}
                    bars={bars}
                    selected={selected}
                    draft={draft?.page === i ? draft.rect : null}
                    dragRef={dragRef}
                    setDraft={setDraft}
                    setSelected={setSelected}
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
  mode: Mode
  systems: System[]
  bars: Bar[]
  selected: string | null
  draft: Rect | null
  dragRef: React.MutableRefObject<Drag | null>
  setDraft: (d: { page: number; rect: Rect } | null) => void
  setSelected: (id: string | null) => void
  setSystems: (s: System[]) => void
  commit: (before: System[], next: System[]) => void
  pieceId: string
}

function normRect(x0: number, y0: number, x1: number, y1: number): Rect {
  const x = Math.max(0, Math.min(x0, x1))
  const y = Math.max(0, Math.min(y0, y1))
  return { x, y, w: Math.min(1, Math.max(x0, x1)) - x, h: Math.min(1, Math.max(y0, y1)) - y }
}

function inRect(r: Rect, fx: number, fy: number, slopX = 0, slopY = 0): boolean {
  return fx >= r.x - slopX && fx <= r.x + r.w + slopX && fy >= r.y - slopY && fy <= r.y + r.h + slopY
}

function SetupOverlay(p: OverlayProps) {
  const { page, W, H, mode, systems, bars, selected, draft, dragRef, setDraft, setSelected, setSystems, commit } = p
  const svgRef = useRef<SVGSVGElement>(null)
  const pageSystems = systems.filter((s) => s.page === page)
  const selectedSys = pageSystems.find((s) => s.id === selected) ?? null

  const toFrac = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect()
    return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height, px: e.clientX, py: e.clientY }
  }
  const slopX = HIT_PX / W
  const slopY = HIT_PX / H

  const corners = (r: Rect): Record<Corner, { x: number; y: number }> => ({
    nw: { x: r.x, y: r.y },
    ne: { x: r.x + r.w, y: r.y },
    sw: { x: r.x, y: r.y + r.h },
    se: { x: r.x + r.w, y: r.y + r.h },
  })

  const onDown = (e: React.PointerEvent) => {
    if (!e.isPrimary || dragRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const { fx, fy } = toFrac(e)
    if (mode === 'systems') {
      if (selectedSys) {
        for (const [corner, c] of Object.entries(corners(selectedSys.rect)) as [Corner, { x: number; y: number }][]) {
          if (Math.abs(c.x - fx) <= slopX && Math.abs(c.y - fy) <= slopY) {
            dragRef.current = { type: 'resize', id: selectedSys.id, corner, start: selectedSys.rect, x0: fx, y0: fy, before: systems }
            return
          }
        }
      }
      const hit = [...pageSystems].reverse().find((s) => inRect(s.rect, fx, fy))
      if (hit) {
        setSelected(hit.id)
        dragRef.current = { type: 'move', id: hit.id, start: hit.rect, x0: fx, y0: fy, moved: false, before: systems }
        return
      }
      setSelected(null)
      dragRef.current = { type: 'draw', page, x0: fx, y0: fy }
      setDraft({ page, rect: { x: fx, y: fy, w: 0, h: 0 } })
    } else {
      const sys = pageSystems.find((s) => inRect(s.rect, fx, fy, 0, slopY))
      if (!sys) return
      const rel = (fx - sys.rect.x) / sys.rect.w
      const relSlop = slopX / sys.rect.w
      let nearest = -1
      let best = relSlop
      sys.barlines.forEach((b, i) => {
        const d = Math.abs(b - rel)
        if (d <= best) {
          best = d
          nearest = i
        }
      })
      if (nearest >= 0) dragRef.current = { type: 'barline', id: sys.id, index: nearest, x0: fx, moved: false, before: systems }
      else dragRef.current = { type: 'addbar', id: sys.id, rel, x0: fx, y0: fy }
    }
  }

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    const { fx, fy } = toFrac(e)
    const movedPx = (dx: number, dy: number) => Math.hypot(dx * W, dy * H) > MOVE_PX
    switch (d.type) {
      case 'draw':
        setDraft({ page, rect: normRect(d.x0, d.y0, fx, fy) })
        break
      case 'move': {
        if (!d.moved && !movedPx(fx - d.x0, fy - d.y0)) return
        d.moved = true
        const nx = Math.min(1 - d.start.w, Math.max(0, d.start.x + fx - d.x0))
        const ny = Math.min(1 - d.start.h, Math.max(0, d.start.y + fy - d.y0))
        setSystems(systems.map((s) => (s.id === d.id ? { ...s, rect: { ...d.start, x: nx, y: ny } } : s)))
        break
      }
      case 'resize': {
        const c = corners(d.start)
        const moving = c[d.corner]
        const opposite = c[d.corner === 'nw' ? 'se' : d.corner === 'ne' ? 'sw' : d.corner === 'sw' ? 'ne' : 'nw']
        const r = normRect(opposite.x, opposite.y, moving.x + fx - d.x0, moving.y + fy - d.y0)
        if (r.w < MIN_SYSTEM || r.h < MIN_SYSTEM) return
        setSystems(systems.map((s) => (s.id === d.id ? { ...s, rect: r } : s)))
        break
      }
      case 'barline': {
        if (!d.moved && !movedPx(fx - d.x0, 0)) return
        d.moved = true
        setSystems(
          systems.map((s) => {
            if (s.id !== d.id) return s
            const rel = Math.min(0.995, Math.max(0.005, (fx - s.rect.x) / s.rect.w))
            const barlines = [...s.barlines]
            barlines[d.index] = rel
            return { ...s, barlines }
          }),
        )
        break
      }
      case 'addbar':
        break
    }
  }

  const onUp = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    dragRef.current = null
    const { fx, fy } = toFrac(e)
    switch (d.type) {
      case 'draw': {
        const r = normRect(d.x0, d.y0, fx, fy)
        setDraft(null)
        if (r.w >= MIN_SYSTEM && r.h >= MIN_SYSTEM) {
          const sys: System = { id: newId(), pieceId: p.pieceId, page, rect: r, barlines: [] }
          commit(systems, [...systems, sys])
          setSelected(sys.id)
        }
        break
      }
      case 'move':
      case 'resize':
        if (d.type === 'resize' || d.moved) commit(d.before, systems)
        break
      case 'barline': {
        if (d.moved) {
          commit(d.before, systems)
        } else {
          commit(
            d.before,
            d.before.map((s) => (s.id === d.id ? { ...s, barlines: s.barlines.filter((_, i) => i !== d.index) } : s)),
          )
        }
        break
      }
      case 'addbar': {
        if (Math.hypot((fx - d.x0) * W, (fy - d.y0) * H) > MOVE_PX) break
        const rel = Math.min(0.995, Math.max(0.005, d.rel))
        commit(
          systems,
          systems.map((s) => (s.id === d.id ? { ...s, barlines: [...s.barlines, rel].sort((a, b) => a - b) } : s)),
        )
        break
      }
    }
  }

  const onCancel = () => {
    const d = dragRef.current
    dragRef.current = null
    setDraft(null)
    if (d && 'before' in d) setSystems(d.before)
  }

  const deleteSelected = () => {
    if (!selectedSys) return
    commit(
      systems,
      systems.filter((s) => s.id !== selectedSys.id),
    )
    setSelected(null)
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
        onPointerCancel={onCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {pageSystems.map((s) => {
          const r = s.rect
          return (
            <g key={s.id} data-testid="system" data-system-id={s.id}>
              <rect className={`system${s.id === selected ? ' selected' : ''}`} x={r.x * W} y={r.y * H} width={r.w * W} height={r.h * H} />
              {s.barlines.map((b, i) => {
                const x = (r.x + b * r.w) * W
                return <line key={i} className="barline" data-testid="barline" x1={x} y1={r.y * H} x2={x} y2={(r.y + r.h) * H} />
              })}
              {mode === 'systems' &&
                s.id === selected &&
                Object.values(corners(r)).map((c, i) => <circle key={i} className="handle" cx={c.x * W} cy={c.y * H} r={9} />)}
            </g>
          )
        })}
        {bars
          .filter((b) => pageSystems.some((s) => s.id === b.systemId))
          .map((b) => {
            const sys = pageSystems.find((s) => s.id === b.systemId)!
            return (
              <text key={b.id} className="barnum" x={b.left * W + 3} y={sys.rect.y * H - 3} data-testid="bar-number" data-bar={b.number}>
                {b.number}
              </text>
            )
          })}
        {draft && <rect className="draft" x={draft.x * W} y={draft.y * H} width={draft.w * W} height={draft.h * H} />}
      </svg>
      {mode === 'systems' && selectedSys && (
        <button
          className="sys-delete"
          aria-label="Delete system"
          data-testid="delete-system"
          style={{ left: (selectedSys.rect.x + selectedSys.rect.w) * W, top: selectedSys.rect.y * H }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={deleteSelected}
        >
          ✕
        </button>
      )}
    </>
  )
}
