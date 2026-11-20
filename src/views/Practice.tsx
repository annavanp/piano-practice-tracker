import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Light } from '../components/Light'
import { PdfPage } from '../components/PdfPage'
import { PenTray } from '../components/PenTray'
import { ProgressPanel } from '../components/ProgressPanel'
import { HANDS, nextLevel, type Bar, type Pen, type PieceData, type Settings, type System } from '../db/types'
import type { PieceActions } from '../hooks/usePieceData'
import { useElementWidth } from '../hooks/useElementWidth'
import { usePdfDocument, type LoadedPdf } from '../hooks/usePdfDocument'
import { usePieceData } from '../hooks/usePieceData'
import { useSettings } from '../hooks/useSettings'
import { findTarget, levelOf } from '../lib/progress'
import { acquireWakeLock } from '../lib/wakeLock'
import { navigate } from '../router'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 4
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export function Practice({ pieceId }: { pieceId: string }) {
  const { data, actions } = usePieceData(pieceId)
  const pdf = usePdfDocument(data?.piece.pdf)
  const [settings, updateSettings] = useSettings()

  useEffect(() => acquireWakeLock(), [])

  useEffect(() => {
    if (data === null) navigate({ name: 'library' })
  }, [data])

  if (data === undefined) return <div className="empty">Loading…</div>
  if (data === null) return null
  if (data.bars.length === 0) {
    return (
      <div className="practice">
        <div className="toolbar">
          <button onClick={() => navigate({ name: 'library' })}>← Pieces</button>
          <span className="title">{data.piece.title}</span>
        </div>
        <div className="empty">
          <p>This piece has no bars yet.</p>
          <button className="primary" onClick={() => navigate({ name: 'setup', id: pieceId })}>
            Mark the bars
          </button>
        </div>
      </div>
    )
  }
  return <PracticeView data={data} actions={actions} pdf={pdf} settings={settings} updateSettings={updateSettings} />
}

interface ViewProps {
  data: PieceData
  actions: PieceActions
  pdf: LoadedPdf | null
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}

function PracticeView({ data, actions, pdf, settings, updateSettings }: ViewProps) {
  const { piece, systems, bars, statuses } = data
  const scoreRef = useRef<HTMLDivElement>(null)
  const containerWidth = useElementWidth(scoreRef)
  const [zoom, setZoom] = useState(1)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const [settled, setSettled] = useState(true)
  const settleTimer = useRef(0)
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia('(orientation: landscape)').matches)
  const [target, setTarget] = useState<number | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const suppress = useRef(false)
  const pageEls = useRef(new Map<number, HTMLDivElement>())
  const scrollAnchor = useRef<{ contentY: number; cy: number; contentX: number; cx: number; fromZoom: number } | null>(null)

  const pageWidth = Math.max(0, Math.floor(containerWidth * zoom))
  // Re-evaluated whenever a light changes so the history chart's "today" column is current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => Date.now(), [data.log.length])
  const systemsByPage = useMemo(() => {
    const m = new Map<number, System[]>()
    for (const s of systems) m.set(s.page, [...(m.get(s.page) ?? []), s])
    return m
  }, [systems])
  const barsBySystem = useMemo(() => {
    const m = new Map<string, Bar[]>()
    for (const b of bars) m.set(b.systemId, [...(m.get(b.systemId) ?? []), b])
    return m
  }, [bars])

  // Follow orientation: landscape shows the panel, portrait hides it.
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)')
    const onChange = (e: MediaQueryListEvent) => setPanelOpen(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const applyZoom = useCallback((z: number) => {
    const next = clampZoom(z)
    setZoom(next)
    setSettled(false)
    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => setSettled(true), 220)
  }, [])

  // Pinch to zoom with two fingers; the browser keeps one-finger scrolling.
  useEffect(() => {
    const el = scoreRef.current
    if (!el) return
    let pinch: { dist: number; zoom: number } | null = null
    const center = (t: TouchList) => {
      const r = el.getBoundingClientRect()
      return { cx: (t[0].clientX + t[1].clientX) / 2 - r.left, cy: (t[0].clientY + t[1].clientY) / 2 - r.top }
    }
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onStart = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        suppress.current = true
        if (e.touches.length === 2) {
          const { cx, cy } = center(e.touches)
          pinch = { dist: dist(e.touches), zoom: zoomRef.current }
          scrollAnchor.current = { contentX: el.scrollLeft + cx, cx, contentY: el.scrollTop + cy, cy, fromZoom: zoomRef.current }
          e.preventDefault()
        }
      }
    }
    const onMove = (e: TouchEvent) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      const { cx, cy } = center(e.touches)
      if (scrollAnchor.current) {
        scrollAnchor.current.cx = cx
        scrollAnchor.current.cy = cy
      }
      applyZoom(pinch.zoom * (dist(e.touches) / pinch.dist))
    }
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinch = null
        if (e.touches.length === 0) window.setTimeout(() => (suppress.current = false), 80)
      }
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
  }, [applyZoom])

  // After a zoom re-layout, keep the point under the fingers (or the viewport centre) in place.
  useLayoutEffect(() => {
    const el = scoreRef.current
    const a = scrollAnchor.current
    if (!el || !a) return
    const ratio = zoom / a.fromZoom
    el.scrollTop = a.contentY * ratio - a.cy
    el.scrollLeft = a.contentX * ratio - a.cx
    a.contentY = el.scrollTop + a.cy
    a.contentX = el.scrollLeft + a.cx
    a.fromZoom = zoom
  }, [zoom])

  const zoomBy = (factor: number) => {
    const el = scoreRef.current
    if (el) {
      const cx = el.clientWidth / 2
      const cy = el.clientHeight / 2
      scrollAnchor.current = { contentX: el.scrollLeft + cx, cx, contentY: el.scrollTop + cy, cy, fromZoom: zoomRef.current }
    }
    applyZoom(zoomRef.current * factor)
  }

  const onPageElement = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) pageEls.current.set(index, el)
    else pageEls.current.delete(index)
  }, [])

  const scrollToBar = useCallback(
    (bar: Bar) => {
      const sys = systems.find((s) => s.id === bar.systemId)
      const score = scoreRef.current
      const pageEl = sys ? pageEls.current.get(sys.page) : undefined
      if (!sys || !score || !pageEl || !pdf) return
      const size = pdf.sizes[sys.page]
      const pageH = (pageWidth * size.height) / size.width
      const pageTop = pageEl.getBoundingClientRect().top - score.getBoundingClientRect().top + score.scrollTop
      const pageLeft = pageEl.getBoundingClientRect().left - score.getBoundingClientRect().left + score.scrollLeft
      const sysTop = pageTop + sys.rect.y * pageH
      const sysH = sys.rect.h * pageH
      const barLeft = pageLeft + bar.left * pageWidth
      const barW = (bar.right - bar.left) * pageWidth
      const top = Math.max(0, sysTop - score.clientHeight / 2 + sysH / 2)
      let left = score.scrollLeft
      if (barLeft < score.scrollLeft || barLeft + barW > score.scrollLeft + score.clientWidth) {
        left = Math.max(0, barLeft - score.clientWidth / 2 + barW / 2)
      }
      score.scrollTo({ top, left })
      setTarget(bar.order)
    },
    [systems, pdf, pageWidth],
  )

  const goTarget = (direction: 1 | -1) => {
    const bar = findTarget(bars, statuses, settings.filter, target, direction)
    if (bar) {
      setNotice(null)
      scrollToBar(bar)
    } else {
      setTarget(null)
      setNotice(`No ${settings.filter.hand} bars need work.`)
      window.setTimeout(() => setNotice(null), 2500)
    }
  }

  const targetBar = target === null ? null : bars.find((b) => b.order === target) ?? null

  return (
    <div className="practice" data-testid="practice">
      <div className="toolbar">
        <button onClick={() => navigate({ name: 'library' })} aria-label="Back to pieces">
          ←
        </button>
        <span className="title">
          {piece.title}
          {piece.composer ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {piece.composer}</span> : null}
        </span>
        <div className="group" aria-label="Zoom">
          <button className="icon" onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out" data-testid="zoom-out">
            −
          </button>
          <button className="quiet" onClick={() => zoomBy(1 / zoomRef.current)} aria-label="Fit width" style={{ minWidth: 64 }}>
            {Math.round(zoom * 100)}%
          </button>
          <button className="icon" onClick={() => zoomBy(1.25)} aria-label="Zoom in" data-testid="zoom-in">
            +
          </button>
        </div>
        <div className="group" aria-label="Practice filter navigation">
          <button onClick={() => goTarget(-1)} aria-label="Previous bar that needs work" data-testid="prev-target">
            ◀ Needs work
          </button>
          <button onClick={() => goTarget(1)} aria-label="Next bar that needs work" data-testid="next-target">
            Needs work ▶
          </button>
        </div>
        <button onClick={() => navigate({ name: 'setup', id: piece.id })} aria-label="Edit bar marking">
          Bars
        </button>
        <button className={panelOpen ? 'active' : ''} onClick={() => setPanelOpen((v) => !v)} aria-pressed={panelOpen} data-testid="panel-toggle">
          Progress
        </button>
        {notice && (
          <span className="hint" role="status" data-testid="notice">
            {notice}
          </span>
        )}
      </div>
      <div className="practice-body">
        <div className="score" ref={scoreRef} data-testid="score">
          {pdf && pageWidth > 0 && (
            <div className="score-inner">
              {pdf.sizes.map((size, i) => {
                const pageH = (pageWidth * size.height) / size.width
                return (
                  <PdfPage key={i} doc={pdf.doc} pageIndex={i} size={size} cssWidth={pageWidth} settled={settled} onElement={onPageElement}>
                    {(systemsByPage.get(i) ?? []).map((sys) => (
                      <SystemLights
                        key={sys.id}
                        system={sys}
                        bars={barsBySystem.get(sys.id) ?? []}
                        data={data}
                        actions={actions}
                        W={pageWidth}
                        H={pageH}
                        tint={settings.tint}
                        targetBarId={targetBar?.id ?? null}
                        pen={settings.pen}
                        suppress={suppress}
                      />
                    ))}
                  </PdfPage>
                )
              })}
            </div>
          )}
        </div>
        <PenTray pen={settings.pen} onPen={(pen) => updateSettings({ pen })} />
        {panelOpen && (
          <ProgressPanel data={data} actions={actions} settings={settings} onSettings={updateSettings} onJumpToBar={scrollToBar} now={now} />
        )}
      </div>
    </div>
  )
}

interface SystemLightsProps {
  system: System
  bars: Bar[]
  data: PieceData
  actions: PieceActions
  W: number
  H: number
  tint: boolean
  targetBarId: string | null
  pen: Pen | null
  suppress: React.RefObject<boolean>
}

const STRIP_H = 44
const DOT_H = 17

function SystemLights({ system, bars, data, actions, W, H, tint, targetBarId, pen, suppress }: SystemLightsProps) {
  const sysTop = system.rect.y * H
  const sysH = system.rect.h * H
  const first = bars[0]
  return (
    <>
      {first && (
        <span className="bar-number" style={{ right: W - system.rect.x * W + 4, top: sysTop - 2 }}>
          {first.number}
        </span>
      )}
      {bars.map((bar) => {
        const left = bar.left * W
        const width = (bar.right - bar.left) * W
        const hitWidth = Math.max(30, Math.min(56, Math.floor(width / 3) - 2))
        const ht = levelOf(data.statuses, bar.id, 'HT')
        return (
          <div key={bar.id} data-testid="bar" data-bar={bar.number}>
            {tint && ht !== 'grey' && <div className="bar-tint" data-level={ht} style={{ left, top: sysTop, width, height: sysH }} />}
            {targetBarId === bar.id && (
              <div className="bar-target" data-testid="target-outline" data-bar={bar.number} style={{ left: left - 2, top: sysTop - DOT_H - 4, width: width + 4, height: sysH + DOT_H + 6 }} />
            )}
            <div className="bar-strip" style={{ left, width, top: sysTop - STRIP_H + 2, height: STRIP_H }}>
              {HANDS.map((hand) => {
                const level = levelOf(data.statuses, bar.id, hand)
                return (
                  <Light
                    key={hand}
                    hand={hand}
                    level={level}
                    barNumber={bar.number}
                    hitWidth={hitWidth}
                    suppress={suppress}
                    onTap={() => {
                      const next = pen ?? nextLevel(level)
                      if (next !== level) void actions.setLevel(bar.id, hand, next)
                    }}
                    onReset={() => {
                      if (level !== 'grey') void actions.setLevel(bar.id, hand, 'grey')
                    }}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}
