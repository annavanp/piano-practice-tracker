import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { SCHEMA_VERSION, type Bar, type Piece, type Section, type Status, type StatusLogEntry, type System } from './types'

/** Pieces are stored with the PDF as raw bytes: Safari's IndexedDB is unreliable with Blob values. */
export type StoredPiece = Omit<Piece, 'pdf'> & { pdfData: ArrayBuffer; pdfType: string }

export function toStored(piece: Piece, pdfData: ArrayBuffer): StoredPiece {
  const { pdf, ...rest } = piece
  return { ...rest, pdfData, pdfType: pdf.type || 'application/pdf' }
}

export function fromStored(stored: StoredPiece): Piece {
  const { pdfData, pdfType, ...rest } = stored
  return { ...rest, pdf: new Blob([pdfData], { type: pdfType }) }
}

export interface PracticeDB extends DBSchema {
  pieces: { key: string; value: StoredPiece }
  systems: { key: string; value: System; indexes: { byPiece: string } }
  bars: { key: string; value: Bar; indexes: { byPiece: string } }
  statuses: { key: string; value: Status; indexes: { byPiece: string } }
  statusLog: { key: number; value: StatusLogEntry; indexes: { byPiece: string } }
  sections: { key: string; value: Section; indexes: { byPiece: string } }
  meta: { key: string; value: unknown }
}

export const DB_NAME = 'piano-practice-tracker'

let dbPromise: Promise<IDBPDatabase<PracticeDB>> | null = null

function open(): Promise<IDBPDatabase<PracticeDB>> {
  return openDB<PracticeDB>(DB_NAME, SCHEMA_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('pieces', { keyPath: 'id' })
        db.createObjectStore('systems', { keyPath: 'id' }).createIndex('byPiece', 'pieceId')
        db.createObjectStore('bars', { keyPath: 'id' }).createIndex('byPiece', 'pieceId')
        db.createObjectStore('statuses', { keyPath: 'id' }).createIndex('byPiece', 'pieceId')
        db.createObjectStore('statusLog', { keyPath: 'id', autoIncrement: true }).createIndex('byPiece', 'pieceId')
        db.createObjectStore('sections', { keyPath: 'id' }).createIndex('byPiece', 'pieceId')
        db.createObjectStore('meta')
      }
      // Future migrations: if (oldVersion < 2) { ... }
    },
    // The browser closed the connection (iPadOS does this to suspended pages): open a new one next time.
    terminated() {
      dbPromise = null
    },
    // A newer version of the app wants to upgrade the database: let it.
    blocking() {
      resetDB()
    },
  })
}

export function getDB(): Promise<IDBPDatabase<PracticeDB>> {
  if (!dbPromise) {
    dbPromise = open().catch((err) => {
      dbPromise = null
      throw err
    })
  }
  return dbPromise
}

/** Drop the cached connection so the next call opens a fresh one. */
export function resetDB(): void {
  const old = dbPromise
  dbPromise = null
  void old?.then((db) => db.close()).catch(() => undefined)
}

/** Errors that a fresh connection cannot fix; everything else is retried once. */
const PERMANENT_ERRORS = new Set(['QuotaExceededError', 'ConstraintError', 'DataError', 'DataCloneError', 'NotFoundError'])

/**
 * Run a database operation. If it fails because the connection went stale (Safari reports this as
 * InvalidStateError, UnknownError or "Connection to Indexed Database server lost"), reopen the
 * database and try once more. A transaction that failed never committed, so retrying is safe.
 */
export async function withDB<T>(fn: (db: IDBPDatabase<PracticeDB>) => Promise<T>): Promise<T> {
  try {
    return await fn(await getDB())
  } catch (err) {
    if (err instanceof Error && PERMANENT_ERRORS.has(err.name)) throw err
    resetDB()
    return await fn(await getDB())
  }
}

// After the app has been in the background, start from a fresh connection rather than
// discovering on the next tap that the old one is gone.
if (typeof document !== 'undefined') {
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now()
    else if (hiddenAt && Date.now() - hiddenAt > 5_000) resetDB()
  })
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) resetDB()
  })
}

/** Test hook: close the live connection to simulate iPadOS dropping it. */
if (typeof window !== 'undefined') {
  ;(window as unknown as { __pptDebug: object }).__pptDebug = {
    closeDB: async () => (await dbPromise)?.close(),
  }
}

export type PracticeDatabase = IDBPDatabase<PracticeDB>
