import { useEffect, useRef, useState, type RefObject } from 'react'
import type { Hand, Level } from '../db/types'

const HAND_LETTER: Record<Hand, string> = { RH: 'R', LH: 'L', HT: 'H' }
const LEVEL_GLYPH: Record<Level, string> = { grey: '', red: '✕', yellow: '−', green: '✓' }
const LEVEL_NAME: Record<Level, string> = { grey: 'not set', red: 'red', yellow: 'yellow', green: 'green' }
const HAND_NAME: Record<Hand, string> = { RH: 'right hand', LH: 'left hand', HT: 'hands together' }

export const LONG_PRESS_MS = 550
const MOVE_TOLERANCE_PX = 10

interface Props {
  hand: Hand
  level: Level
  barNumber: number
  hitWidth: number
  /** A clean tap: cycle the colour, or apply the selected pen. */
  onTap: () => void
  /** A long press: reset to grey. */
  onReset: () => void
  /** While true (pinch or scroll gesture in progress), taps are ignored. */
  suppress: RefObject<boolean>
}

/**
 * One stoplight. A clean tap cycles grey → red → yellow → green → red; a long press resets to
 * grey. Any movement (scroll, pinch) or a second finger cancels the gesture, so scrolling never
 * changes a light.
 */
export function Light({ hand, level, barNumber, hitWidth, onTap, onReset, suppress }: Props) {
  const [pressed, setPressed] = useState(false)
  const gesture = useRef<{ id: number; x: number; y: number; consumed: boolean; timer: number } | null>(null)

  const clear = () => {
    const g = gesture.current
    if (g) window.clearTimeout(g.timer)
    gesture.current = null
    setPressed(false)
  }

  useEffect(() => clear, [])

  return (
    <button
      type="button"
      className={`light${pressed ? ' pressed' : ''}`}
      data-hand={hand}
      data-level={level}
      data-bar={barNumber}
      aria-label={`Bar ${barNumber}, ${HAND_NAME[hand]}: ${LEVEL_NAME[level]}`}
      style={{ width: hitWidth }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (!e.isPrimary || gesture.current || suppress.current) return
        const timer = window.setTimeout(() => {
          const g = gesture.current
          if (!g || g.consumed) return
          g.consumed = true
          setPressed(false)
          onReset()
        }, LONG_PRESS_MS)
        gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, consumed: false, timer }
        setPressed(true)
      }}
      onPointerMove={(e) => {
        const g = gesture.current
        if (!g || g.id !== e.pointerId) return
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > MOVE_TOLERANCE_PX) clear()
      }}
      onPointerUp={(e) => {
        const g = gesture.current
        if (!g || g.id !== e.pointerId) return
        const consumed = g.consumed
        clear()
        if (consumed || suppress.current) return
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > MOVE_TOLERANCE_PX) return
        onTap()
      }}
      onPointerCancel={clear}
      onPointerLeave={clear}
    >
      <span className="dot" aria-hidden="true">
        {HAND_LETTER[hand]}
        {LEVEL_GLYPH[level]}
      </span>
    </button>
  )
}
