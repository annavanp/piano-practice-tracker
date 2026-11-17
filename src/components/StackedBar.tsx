import type { LevelCounts } from '../lib/progress'

interface Props {
  counts: LevelCounts
  showNumbers?: boolean
  testId?: string
}

export function StackedBar({ counts, showNumbers = true, testId }: Props) {
  const total = counts.grey + counts.red + counts.yellow + counts.green
  const seg = (key: keyof LevelCounts, label: string) => {
    const n = counts[key]
    if (n === 0) return null
    return (
      <span
        key={key}
        className={`s-${key}`}
        style={{ width: `${(n / Math.max(total, 1)) * 100}%` }}
        data-level={key}
        data-count={n}
        title={`${label}: ${n}`}
      >
        {showNumbers ? n : ''}
      </span>
    )
  }
  return (
    <div
      className="stack"
      role="img"
      data-testid={testId}
      aria-label={`${counts.green} green, ${counts.yellow} yellow, ${counts.red} red, ${counts.grey} not set`}
    >
      {seg('green', 'Green')}
      {seg('yellow', 'Yellow')}
      {seg('red', 'Red')}
      {seg('grey', 'Not set')}
    </div>
  )
}
