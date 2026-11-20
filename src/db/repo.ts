import type { IDBPTransaction } from 'idb'
import { fromStored, toStored, withDB, type PracticeDB } from './db'
import { deriveBars } from '../lib/bars'
import {
  DEFAULT_SETTINGS,
  newId,
  statusId,
  type Bar,
  type Hand,
  type Level,
  type Piece,
  type PieceData,
  type Section,
  type Settings,
  type Status,
  type StatusLogEntry,
  type System,
} from './types'

// ---- Pieces -------------------------------------------------------------

export async function listPieces(): Promise<Piece[]> {
  return withDB(async (db) => {
    const pieces = await db.getAll('pieces')
    return pieces.map(fromStored).sort((a, b) => b.createdAt - a.createdAt)
  })
}

export async function getPiece(id: string): Promise<Piece | undefined> {
  return withDB(async (db) => {
    const stored = await db.get('pieces', id)
    return stored && fromStored(stored)
  })
}

export async function addPiece(input: { title: string; composer: string; pdf: Blob; pageCount: number }): Promise<Piece> {
  return withDB(async (db) => {
    const pdfData = await input.pdf.arrayBuffer()
    const piece: Piece = {
      id: newId(),
      title: input.title,
      composer: input.composer,
      pdf: new Blob([pdfData], { type: 'application/pdf' }),
      pageCount: input.pageCount,
      firstBarNumber: 1,
      createdAt: Date.now(),
    }
    await db.put('pieces', toStored(piece, pdfData))
    return piece
  })
}

export async function updatePiece(id: string, patch: Partial<Pick<Piece, 'title' | 'composer' | 'firstBarNumber'>>): Promise<Piece> {
  return withDB(async (db) => {
    const stored = await db.get('pieces', id)
    if (!stored) throw new Error('Piece not found')
    const next = { ...stored, ...patch }
    await db.put('pieces', next)
    if (patch.firstBarNumber !== undefined && patch.firstBarNumber !== stored.firstBarNumber) {
      await regenerateBars(id)
    }
    return fromStored(next)
  })
}

export async function deletePiece(id: string): Promise<void> {
  return withDB(async (db) => {
    const tx = db.transaction(['pieces', 'systems', 'bars', 'statuses', 'statusLog', 'sections'], 'readwrite')
    await tx.objectStore('pieces').delete(id)
    for (const store of ['systems', 'bars', 'statuses', 'statusLog', 'sections'] as const) {
      const keys = await tx.objectStore(store).index('byPiece').getAllKeys(id)
      for (const k of keys) await tx.objectStore(store).delete(k as never)
    }
    await tx.done
  })
}

// ---- Loading everything for one piece ------------------------------------

export async function loadPieceData(pieceId: string): Promise<PieceData | null> {
  return withDB(async (db) => {
    const stored = await db.get('pieces', pieceId)
    if (!stored) return null
    const piece = fromStored(stored)
    const [systems, bars, statusList, sections, log] = await Promise.all([
      db.getAllFromIndex('systems', 'byPiece', pieceId),
      db.getAllFromIndex('bars', 'byPiece', pieceId),
      db.getAllFromIndex('statuses', 'byPiece', pieceId),
      db.getAllFromIndex('sections', 'byPiece', pieceId),
      db.getAllFromIndex('statusLog', 'byPiece', pieceId),
    ])
    const statuses: Record<string, Status> = {}
    for (const s of statusList) statuses[s.id] = s
    return { piece, systems, bars: bars.sort((a, b) => a.order - b.order), statuses, sections, log }
  })
}

// ---- Systems and bars -----------------------------------------------------

/** Replace all systems of a piece and regenerate its bars. Returns the new bars. */
export async function saveSystems(pieceId: string, systems: System[]): Promise<{ systems: System[]; bars: Bar[] }> {
  return withDB(async (db) => {
    const piece = await db.get('pieces', pieceId)
    if (!piece) throw new Error('Piece not found')
    const tx = db.transaction(['systems', 'bars', 'statuses'], 'readwrite')
    const sysStore = tx.objectStore('systems')
    const oldKeys = await sysStore.index('byPiece').getAllKeys(pieceId)
    for (const k of oldKeys) await sysStore.delete(k)
    for (const s of systems) await sysStore.put({ ...s, pieceId })
    const bars = await writeBars(tx, pieceId, systems, piece.firstBarNumber)
    await tx.done
    return { systems, bars }
  })
}

type BarsTx = IDBPTransaction<PracticeDB, ('systems' | 'bars' | 'statuses')[], 'readwrite'>

async function writeBars(tx: BarsTx, pieceId: string, systems: System[], firstBarNumber: number): Promise<Bar[]> {
  const barStore = tx.objectStore('bars')
  const statusStore = tx.objectStore('statuses')
  const previous = (await barStore.index('byPiece').getAll(pieceId)) as Bar[]
  const bars = deriveBars(pieceId, systems, firstBarNumber, previous)
  const keep = new Set(bars.map((b) => b.id))
  for (const old of previous) {
    if (!keep.has(old.id)) {
      await barStore.delete(old.id)
      for (const h of ['RH', 'LH', 'HT'] as Hand[]) await statusStore.delete(statusId(old.id, h))
    }
  }
  for (const b of bars) await barStore.put(b)
  return bars
}

async function regenerateBars(pieceId: string): Promise<void> {
  return withDB(async (db) => {
    const piece = await db.get('pieces', pieceId)
    if (!piece) return
    const tx = db.transaction(['systems', 'bars', 'statuses'], 'readwrite')
    const systems = await tx.objectStore('systems').index('byPiece').getAll(pieceId)
    await writeBars(tx, pieceId, systems, piece.firstBarNumber)
    await tx.done
  })
}

// ---- Statuses -------------------------------------------------------------

export async function setStatus(pieceId: string, barId: string, hand: Hand, level: Level, time = Date.now()): Promise<Status> {
  return withDB(async (db) => {
    const status: Status = { id: statusId(barId, hand), pieceId, barId, hand, level, updatedAt: time }
    const tx = db.transaction(['statuses', 'statusLog'], 'readwrite')
    await tx.objectStore('statuses').put(status)
    await tx.objectStore('statusLog').add({ pieceId, barId, hand, level, time })
    await tx.done
    return status
  })
}

// ---- Sections -------------------------------------------------------------

export async function addSection(pieceId: string, name: string, startBar: number, endBar: number): Promise<Section> {
  return withDB(async (db) => {
    const section: Section = {
      id: newId(),
      pieceId,
      name,
      startBar: Math.min(startBar, endBar),
      endBar: Math.max(startBar, endBar),
    }
    await db.put('sections', section)
    return section
  })
}

export async function updateSection(section: Section): Promise<void> {
  return withDB(async (db) => {
    await db.put('sections', section)
  })
}

export async function deleteSection(id: string): Promise<void> {
  return withDB(async (db) => {
    await db.delete('sections', id)
  })
}

// ---- Settings -------------------------------------------------------------

export async function loadSettings(): Promise<Settings> {
  return withDB(async (db) => {
    const stored = (await db.get('meta', 'settings')) as Partial<Settings> | undefined
    return { ...DEFAULT_SETTINGS, ...stored, filter: { ...DEFAULT_SETTINGS.filter, ...stored?.filter } }
  })
}

export async function saveSettings(settings: Settings): Promise<void> {
  return withDB(async (db) => {
    await db.put('meta', settings, 'settings')
  })
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return withDB(async (db) => {
    return (await db.get('meta', key)) as T | undefined
  })
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  return withDB(async (db) => {
    await db.put('meta', value, key)
  })
}

// ---- Whole-database operations (backup) -------------------------------------

export interface FullDump {
  pieces: Piece[]
  systems: System[]
  bars: Bar[]
  statuses: Status[]
  statusLog: StatusLogEntry[]
  sections: Section[]
  settings: Settings
}

export async function dumpAll(): Promise<FullDump> {
  return withDB(async (db) => {
    const [storedPieces, systems, bars, statuses, statusLog, sections, settings] = await Promise.all([
      db.getAll('pieces'),
      db.getAll('systems'),
      db.getAll('bars'),
      db.getAll('statuses'),
      db.getAll('statusLog'),
      db.getAll('sections'),
      loadSettings(),
    ])
    return { pieces: storedPieces.map(fromStored), systems, bars, statuses, statusLog, sections, settings }
  })
}

export async function clearAll(): Promise<void> {
  return withDB(async (db) => {
    const stores = ['pieces', 'systems', 'bars', 'statuses', 'statusLog', 'sections', 'meta'] as const
    const tx = db.transaction(stores, 'readwrite')
    for (const s of stores) await tx.objectStore(s).clear()
    await tx.done
  })
}

export async function restoreAll(dump: FullDump): Promise<void> {
  await clearAll()
  // Read the PDF bytes before opening the transaction: awaiting anything else inside it would close it.
  const storedPieces = await Promise.all(dump.pieces.map(async (p) => toStored(p, await p.pdf.arrayBuffer())))
  return withDB(async (db) => {
    const tx = db.transaction(['pieces', 'systems', 'bars', 'statuses', 'statusLog', 'sections', 'meta'], 'readwrite')
    for (const p of storedPieces) await tx.objectStore('pieces').put(p)
    for (const s of dump.systems) await tx.objectStore('systems').put(s)
    for (const b of dump.bars) await tx.objectStore('bars').put(b)
    for (const s of dump.statuses) await tx.objectStore('statuses').put(s)
    for (const e of dump.statusLog) {
      const { id: _ignored, ...rest } = e
      void _ignored
      await tx.objectStore('statusLog').add(rest)
    }
    for (const s of dump.sections) await tx.objectStore('sections').put(s)
    await tx.objectStore('meta').put(dump.settings, 'settings')
    await tx.done
  })
}
