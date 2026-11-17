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

export function getDB(): Promise<IDBPDatabase<PracticeDB>> {
  if (!dbPromise) {
    dbPromise = openDB<PracticeDB>(DB_NAME, SCHEMA_VERSION, {
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
    })
  }
  return dbPromise
}

export type PracticeDatabase = IDBPDatabase<PracticeDB>
