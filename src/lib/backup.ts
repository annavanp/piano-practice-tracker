import { dumpAll, restoreAll, type FullDump } from '../db/repo'
import { DEFAULT_SETTINGS, SCHEMA_VERSION, type Piece } from '../db/types'

export interface BackupFile {
  app: 'piano-practice-tracker'
  schemaVersion: number
  exportedAt: string
  pieces: Array<Omit<Piece, 'pdf'> & { pdfBase64: string; pdfType: string }>
  systems: FullDump['systems']
  bars: FullDump['bars']
  statuses: FullDump['statuses']
  statusLog: FullDump['statusLog']
  sections: FullDump['sections']
  settings: FullDump['settings']
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < buf.length; i += chunk) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBlob(b64: string, type: string): Blob {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type })
}

export async function createBackup(): Promise<Blob> {
  const dump = await dumpAll()
  const pieces = await Promise.all(
    dump.pieces.map(async ({ pdf, ...rest }) => ({
      ...rest,
      pdfBase64: await blobToBase64(pdf),
      pdfType: pdf.type || 'application/pdf',
    })),
  )
  const file: BackupFile = {
    app: 'piano-practice-tracker',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    pieces,
    systems: dump.systems,
    bars: dump.bars,
    statuses: dump.statuses,
    statusLog: dump.statusLog,
    sections: dump.sections,
    settings: dump.settings,
  }
  return new Blob([JSON.stringify(file)], { type: 'application/json' })
}

export function backupFilename(): string {
  const d = new Date()
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `piano-practice-backup-${stamp}.json`
}

export interface BackupSummary {
  pieceCount: number
  exportedAt: string
}

export async function parseBackup(text: string): Promise<{ file: BackupFile; summary: BackupSummary }> {
  const parsed = JSON.parse(text) as Partial<BackupFile>
  if (parsed.app !== 'piano-practice-tracker' || typeof parsed.schemaVersion !== 'number') {
    throw new Error('This is not a Piano Practice Tracker backup file.')
  }
  if (parsed.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`This backup was made by a newer version of the app (schema ${parsed.schemaVersion}).`)
  }
  // Future: migrate older schema versions here before restoring.
  const file = parsed as BackupFile
  return { file, summary: { pieceCount: file.pieces?.length ?? 0, exportedAt: file.exportedAt } }
}

export async function restoreBackup(file: BackupFile): Promise<void> {
  const dump: FullDump = {
    pieces: file.pieces.map(({ pdfBase64, pdfType, ...rest }) => ({ ...rest, pdf: base64ToBlob(pdfBase64, pdfType) })),
    systems: file.systems ?? [],
    bars: file.bars ?? [],
    statuses: file.statuses ?? [],
    statusLog: file.statusLog ?? [],
    sections: file.sections ?? [],
    settings: file.settings ?? DEFAULT_SETTINGS,
  }
  await restoreAll(dump)
}

/** Trigger a file download; works in Safari and in Playwright. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 10_000)
}

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false
  try {
    const probe = new File([''], 'probe.json', { type: 'application/json' })
    return navigator.canShare({ files: [probe] })
  } catch {
    return false
  }
}

export async function shareBlob(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type })
  await navigator.share({ files: [file], title: 'Piano practice backup' })
}
