import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmModal, Modal } from '../components/Modal'
import * as repo from '../db/repo'
import type { Piece } from '../db/types'
import { backupFilename, canShareFiles, createBackup, downloadBlob, parseBackup, restoreBackup, shareBlob, type BackupFile, type BackupSummary } from '../lib/backup'
import { countPages } from '../lib/pdf'
import { percentGreen } from '../lib/progress'
import { navigate } from '../router'

interface PieceRow {
  piece: Piece
  percent: number
  barCount: number
}

type ModalState =
  | { kind: 'none' }
  | { kind: 'details'; piece?: Piece; pdf?: Blob; pageCount?: number; title: string; composer: string }
  | { kind: 'delete'; piece: Piece }
  | { kind: 'import'; file: BackupFile; summary: BackupSummary }
  | { kind: 'clear' }
  | { kind: 'error'; message: string }

export function Library() {
  const [rows, setRows] = useState<PieceRow[] | null>(null)
  const [modal, setModal] = useState<ModalState>({ kind: 'none' })
  const [busy, setBusy] = useState(false)
  const pdfInput = useRef<HTMLInputElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    const pieces = await repo.listPieces()
    const out: PieceRow[] = []
    for (const piece of pieces) {
      const data = await repo.loadPieceData(piece.id)
      out.push({ piece, percent: data ? percentGreen(data.bars, data.statuses) : 0, barCount: data?.bars.length ?? 0 })
    }
    setRows(out)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const onPdfChosen = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const pageCount = await countPages(file)
      const title = file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim()
      setModal({ kind: 'details', pdf: file, pageCount, title, composer: '' })
    } catch (err) {
      setModal({ kind: 'error', message: `Could not read that PDF. ${err instanceof Error ? err.message : ''}` })
    } finally {
      setBusy(false)
      if (pdfInput.current) pdfInput.current.value = ''
    }
  }

  const saveDetails = async () => {
    if (modal.kind !== 'details') return
    const title = modal.title.trim() || 'Untitled'
    const composer = modal.composer.trim()
    if (modal.piece) {
      await repo.updatePiece(modal.piece.id, { title, composer })
      setModal({ kind: 'none' })
      await refresh()
    } else if (modal.pdf) {
      const piece = await repo.addPiece({ title, composer, pdf: modal.pdf, pageCount: modal.pageCount ?? 1 })
      setModal({ kind: 'none' })
      navigate({ name: 'setup', id: piece.id })
    }
  }

  const onBackupChosen = async (file: File | undefined) => {
    if (!file) return
    try {
      const { file: parsed, summary } = await parseBackup(await file.text())
      setModal({ kind: 'import', file: parsed, summary })
    } catch (err) {
      setModal({ kind: 'error', message: err instanceof Error ? err.message : 'Could not read the backup file.' })
    } finally {
      if (backupInput.current) backupInput.current.value = ''
    }
  }

  const exportBackup = async (share: boolean) => {
    setBusy(true)
    try {
      const blob = await createBackup()
      if (share) await shareBlob(blob, backupFilename())
      else downloadBlob(blob, backupFilename())
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        setModal({ kind: 'error', message: err instanceof Error ? err.message : 'Export failed.' })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="library">
      <h1>Pieces</h1>
      <div className="row" style={{ marginBottom: 20 }}>
        <button className="primary" onClick={() => pdfInput.current?.click()} disabled={busy} data-testid="add-piece">
          Add piece from PDF…
        </button>
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          data-testid="pdf-input"
          onChange={(e) => void onPdfChosen(e.target.files?.[0])}
        />
      </div>

      {rows === null ? (
        <p className="empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="empty">No pieces yet. Add a PDF of the sheet music to begin.</p>
      ) : (
        <ul className="piece-list" data-testid="piece-list">
          {rows.map(({ piece, percent, barCount }) => (
            <li key={piece.id} className="piece-card" data-testid="piece-card">
              <button className="open" onClick={() => navigate({ name: barCount > 0 ? 'practice' : 'setup', id: piece.id })}>
                <div className="t">{piece.title}</div>
                <div className="c">{piece.composer || '—'}</div>
              </button>
              <div className="actions">
                <button onClick={() => navigate({ name: 'setup', id: piece.id })} aria-label="Mark bars">
                  Bars
                </button>
                <button
                  onClick={() => setModal({ kind: 'details', piece, title: piece.title, composer: piece.composer })}
                  aria-label="Rename"
                >
                  Rename
                </button>
                <button className="danger" onClick={() => setModal({ kind: 'delete', piece })} aria-label="Delete">
                  Delete
                </button>
              </div>
              <div className="progress-line">
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${percent}%` }} />
                </div>
                <span data-testid="piece-percent">{barCount > 0 ? `${percent}% green · ${barCount} bars` : 'Bars not marked yet'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="backup">
        <h2>Backup</h2>
        <p>Export saves every piece, its PDF and all progress to one file. Import restores from such a file.</p>
        <div className="row">
          <button onClick={() => void exportBackup(false)} disabled={busy} data-testid="export">
            Export backup
          </button>
          {canShareFiles() && (
            <button onClick={() => void exportBackup(true)} disabled={busy}>
              Share backup…
            </button>
          )}
          <button onClick={() => backupInput.current?.click()} disabled={busy} data-testid="import">
            Import backup…
          </button>
          <input
            ref={backupInput}
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="backup-input"
            onChange={(e) => void onBackupChosen(e.target.files?.[0])}
          />
          <button className="danger quiet" onClick={() => setModal({ kind: 'clear' })} data-testid="clear-all">
            Delete all data…
          </button>
        </div>
      </section>

      {modal.kind === 'details' && (
        <Modal
          title={modal.piece ? 'Rename piece' : 'New piece'}
          onClose={() => setModal({ kind: 'none' })}
          actions={
            <>
              <button onClick={() => setModal({ kind: 'none' })}>Cancel</button>
              <button className="primary" onClick={() => void saveDetails()} data-testid="save-details">
                {modal.piece ? 'Save' : 'Add'}
              </button>
            </>
          }
        >
          {modal.pageCount !== undefined && (
            <p style={{ color: 'var(--text-muted)' }}>
              {modal.pageCount} page{modal.pageCount === 1 ? '' : 's'}
            </p>
          )}
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              value={modal.title}
              autoFocus
              onChange={(e) => setModal({ ...modal, title: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="composer">Composer</label>
            <input id="composer" type="text" value={modal.composer} onChange={(e) => setModal({ ...modal, composer: e.target.value })} />
          </div>
        </Modal>
      )}

      {modal.kind === 'delete' && (
        <ConfirmModal
          title="Delete piece?"
          message={`“${modal.piece.title}” and all its progress will be removed from this iPad. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setModal({ kind: 'none' })}
          onConfirm={async () => {
            await repo.deletePiece(modal.piece.id)
            setModal({ kind: 'none' })
            await refresh()
          }}
        />
      )}

      {modal.kind === 'import' && (
        <ConfirmModal
          title="Restore backup?"
          message={`This backup holds ${modal.summary.pieceCount} piece${modal.summary.pieceCount === 1 ? '' : 's'} (exported ${new Date(modal.summary.exportedAt).toLocaleString()}). Restoring replaces everything currently in the app.`}
          confirmLabel="Replace and restore"
          danger
          onCancel={() => setModal({ kind: 'none' })}
          onConfirm={async () => {
            setBusy(true)
            try {
              await restoreBackup(modal.file)
              setModal({ kind: 'none' })
              await refresh()
            } catch (err) {
              setModal({ kind: 'error', message: err instanceof Error ? err.message : 'Restore failed.' })
            } finally {
              setBusy(false)
            }
          }}
        />
      )}

      {modal.kind === 'clear' && (
        <ConfirmModal
          title="Delete all data?"
          message="Every piece, PDF and all progress will be removed from this iPad. Export a backup first if you want to keep anything."
          confirmLabel="Delete everything"
          danger
          onCancel={() => setModal({ kind: 'none' })}
          onConfirm={async () => {
            await repo.clearAll()
            setModal({ kind: 'none' })
            await refresh()
          }}
        />
      )}

      {modal.kind === 'error' && (
        <Modal title="Something went wrong" onClose={() => setModal({ kind: 'none' })} actions={<button onClick={() => setModal({ kind: 'none' })}>OK</button>}>
          <p>{modal.message}</p>
        </Modal>
      )}
    </div>
  )
}
