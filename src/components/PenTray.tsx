import { PENS, type Pen } from '../db/types'

const NAME: Record<Pen, string> = { red: 'Red', yellow: 'Yellow', green: 'Green' }
const GLYPH: Record<Pen, string> = { red: '✕', yellow: '−', green: '✓' }

interface Props {
  pen: Pen | null
  onPen: (pen: Pen | null) => void
}

/**
 * Red, yellow and green pens down the right-hand side of the score. With a pen picked, one tap
 * on any light sets it to that colour. Tap the picked pen again to go back to cycling.
 */
export function PenTray({ pen, onPen }: Props) {
  return (
    <div className="pen-tray" role="radiogroup" aria-label="Pens" data-testid="pen-tray">
      {PENS.map((p) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={pen === p}
          aria-label={`${NAME[p]} pen`}
          className={`pen${pen === p ? ' active' : ''}`}
          data-pen={p}
          data-testid={`pen-${p}`}
          onClick={() => onPen(pen === p ? null : p)}
        >
          <span className="pen-dot" aria-hidden="true">
            {GLYPH[p]}
          </span>
        </button>
      ))}
      <span className="pen-label" aria-live="polite">
        {pen ? 'Tap lights to colour' : 'Tap to cycle'}
      </span>
    </div>
  )
}
