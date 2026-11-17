import { useMemo, useState } from 'react'
import { HANDS, type Bar, type FilterThreshold, type Hand, type PieceData, type Section, type Settings } from '../db/types'
import type { PieceActions } from '../hooks/usePieceData'
import { barsInSection, countLevels, countsByHand, historyByDay, percentGreen } from '../lib/progress'
import { HistoryChart } from './HistoryChart'
import { Modal } from './Modal'
import { Stepper } from './Stepper'
import { StackedBar } from './StackedBar'

interface Props {
  data: PieceData
  actions: PieceActions
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
  onJumpToBar: (bar: Bar) => void
  now: number
}

type SectionModal = { mode: 'add' } | { mode: 'edit'; section: Section }

export function ProgressPanel({ data, actions, settings, onSettings, onJumpToBar, now }: Props) {
  const { bars, statuses, sections, log, piece } = data
  const [sectionModal, setSectionModal] = useState<SectionModal | null>(null)
  const byHand = useMemo(() => countsByHand(bars, statuses), [bars, statuses])
  const history = useMemo(() => historyByDay(bars, log, now), [bars, log, now])
  const percent = percentGreen(bars, statuses)
  const minBar = bars.length ? bars[0].number : piece.firstBarNumber
  const maxBar = bars.length ? bars[bars.length - 1].number : piece.firstBarNumber

  return (
    <aside className="panel" data-testid="panel">
      <div>
        <h2>Hands together</h2>
        <div className="headline" data-testid="headline-percent">
          {percent}%<small>of {bars.length} bars green</small>
        </div>
      </div>

      <div>
        <h2>Breakdown</h2>
        {HANDS.map((h) => (
          <div className="stack-row" key={h}>
            <span className="label">{h}</span>
            <StackedBar counts={byHand[h]} testId={`stack-${h}`} />
          </div>
        ))}
        <div className="legend">
          <span>
            <i style={{ background: 'var(--green)' }} />
            green ✓
          </span>
          <span>
            <i style={{ background: 'var(--yellow)' }} />
            yellow −
          </span>
          <span>
            <i style={{ background: 'var(--red)' }} />
            red ✕
          </span>
          <span>
            <i style={{ background: 'var(--grey)' }} />
            not set
          </span>
        </div>
      </div>

      <div>
        <h2>Sections</h2>
        {sections.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 8px' }}>No sections yet.</p>}
        <ul className="section-list">
          {sections.map((s) => {
            const sb = barsInSection(bars, s)
            const first = sb[0]
            return (
              <li key={s.id} className="section-item" data-testid="section">
                <button className="jump" onClick={() => first && onJumpToBar(first)} disabled={!first}>
                  <div className="n">{s.name}</div>
                  <div className="r">
                    Bars {s.startBar}–{s.endBar} · {percentGreen(sb, statuses)}% green
                  </div>
                  <StackedBar counts={countLevels(sb, statuses, 'HT')} showNumbers={false} testId="section-stack" />
                </button>
                <button className="icon quiet" aria-label={`Edit section ${s.name}`} onClick={() => setSectionModal({ mode: 'edit', section: s })}>
                  ✎
                </button>
                <button className="icon quiet danger" aria-label={`Delete section ${s.name}`} onClick={() => void actions.deleteSection(s.id)}>
                  ✕
                </button>
              </li>
            )
          })}
        </ul>
        <button style={{ marginTop: 8 }} onClick={() => setSectionModal({ mode: 'add' })} disabled={bars.length === 0} data-testid="add-section">
          Add section…
        </button>
      </div>

      <div>
        <h2>History</h2>
        <HistoryChart days={history} total={bars.length} />
      </div>

      <div>
        <h2>Practice filter</h2>
        <div className="setting">
          <span>Light</span>
          <div className="segmented" role="radiogroup" aria-label="Which light counts">
            {HANDS.map((h) => (
              <button
                key={h}
                className={settings.filter.hand === h ? 'active' : ''}
                role="radio"
                aria-checked={settings.filter.hand === h}
                onClick={() => onSettings({ filter: { ...settings.filter, hand: h } })}
                data-testid={`filter-hand-${h}`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <span>Needs work</span>
          <div className="segmented" role="radiogroup" aria-label="Threshold">
            {(
              [
                ['red', 'Red only'],
                ['red-yellow', 'Red + yellow'],
              ] as [FilterThreshold, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                className={settings.filter.threshold === t ? 'active' : ''}
                role="radio"
                aria-checked={settings.filter.threshold === t}
                onClick={() => onSettings({ filter: { ...settings.filter, threshold: t } })}
                data-testid={`filter-threshold-${t}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting">
          <span>Tint bars by HT colour</span>
          <button
            className={`switch${settings.tint ? ' active' : ''}`}
            role="switch"
            aria-checked={settings.tint}
            onClick={() => onSettings({ tint: !settings.tint })}
            data-testid="tint-toggle"
          >
            {settings.tint ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {sectionModal && (
        <SectionEditor
          initial={sectionModal.mode === 'edit' ? sectionModal.section : null}
          minBar={minBar}
          maxBar={maxBar}
          onCancel={() => setSectionModal(null)}
          onSave={async (name, start, end) => {
            if (sectionModal.mode === 'edit') {
              await actions.updateSection({ ...sectionModal.section, name, startBar: Math.min(start, end), endBar: Math.max(start, end) })
            } else {
              await actions.addSection(name, start, end)
            }
            setSectionModal(null)
          }}
        />
      )}
    </aside>
  )
}

interface EditorProps {
  initial: Section | null
  minBar: number
  maxBar: number
  onCancel: () => void
  onSave: (name: string, start: number, end: number) => void | Promise<void>
}

function SectionEditor({ initial, minBar, maxBar, onCancel, onSave }: EditorProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [start, setStart] = useState(initial?.startBar ?? minBar)
  const [end, setEnd] = useState(initial?.endBar ?? maxBar)
  return (
    <Modal
      title={initial ? 'Edit section' : 'New section'}
      onClose={onCancel}
      actions={
        <>
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={() => void onSave(name.trim() || `Bars ${Math.min(start, end)}–${Math.max(start, end)}`, start, end)} data-testid="save-section">
            Save
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="section-name">Name</label>
        <input id="section-name" type="text" value={name} autoFocus placeholder="e.g. Exposition" onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Start bar</label>
        <Stepper value={start} onChange={setStart} min={minBar} max={maxBar} label="Start bar" testId="section-start" />
      </div>
      <div className="field">
        <label>End bar</label>
        <Stepper value={end} onChange={setEnd} min={minBar} max={maxBar} label="End bar" testId="section-end" />
      </div>
    </Modal>
  )
}

export type { Hand }
