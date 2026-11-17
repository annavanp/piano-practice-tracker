interface Props {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  label: string
  testId?: string
}

export function Stepper({ value, onChange, min = -Infinity, max = Infinity, label, testId }: Props) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  return (
    <div className="stepper" aria-label={label}>
      <button className="icon" aria-label={`${label}: decrease`} onClick={() => onChange(clamp(value - 1))} disabled={value <= min}>
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ''}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        aria-label={label}
        data-testid={testId}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10)
          if (!Number.isNaN(v)) onChange(clamp(v))
        }}
      />
      <button className="icon" aria-label={`${label}: increase`} onClick={() => onChange(clamp(value + 1))} disabled={value >= max}>
        +
      </button>
    </div>
  )
}
