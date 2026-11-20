/** Schema version stored in IndexedDB and in export files. Bump when the shape changes. */
export const SCHEMA_VERSION = 1

export type Hand = 'RH' | 'LH' | 'HT'
/** Display order everywhere: left hand, right hand, hands together. */
export const HANDS: Hand[] = ['LH', 'RH', 'HT']

export type Level = 'grey' | 'red' | 'yellow' | 'green'
export const LEVELS: Level[] = ['grey', 'red', 'yellow', 'green']

/** Tap cycle: grey → red → yellow → green → red. */
export function nextLevel(level: Level): Level {
  switch (level) {
    case 'grey':
      return 'red'
    case 'red':
      return 'yellow'
    case 'yellow':
      return 'green'
    case 'green':
      return 'red'
  }
}

export interface Piece {
  id: string
  title: string
  composer: string
  pdf: Blob
  pageCount: number
  firstBarNumber: number
  createdAt: number
}

/** Rectangle as fractions of the page: x, y, w, h all in 0..1. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface System {
  id: string
  pieceId: string
  /** 0-based page index. */
  page: number
  rect: Rect
  /**
   * Barlines inside the system, as fractions of the system width (0..1, exclusive).
   * The system's left and right edges are implicit barlines.
   */
  barlines: number[]
}

export interface Bar {
  id: string
  pieceId: string
  systemId: string
  /** 0-based reading order across systems and pages. */
  order: number
  /** Displayed bar number: firstBarNumber + order. */
  number: number
  /** Left and right edges as fractions of the page width. */
  left: number
  right: number
  /** The same edges as fractions of the system width; used to keep ids when a system is moved. */
  relLeft: number
  relRight: number
}

export interface Status {
  /** `${barId}:${hand}` */
  id: string
  pieceId: string
  barId: string
  hand: Hand
  level: Level
  updatedAt: number
}

export interface StatusLogEntry {
  id?: number
  pieceId: string
  barId: string
  hand: Hand
  level: Level
  time: number
}

export interface Section {
  id: string
  pieceId: string
  name: string
  /** Inclusive displayed bar numbers. */
  startBar: number
  endBar: number
}

export type FilterThreshold = 'red' | 'red-yellow'

export interface PracticeFilter {
  hand: Hand
  threshold: FilterThreshold
}

/** A pen sets a light straight to its colour in one tap. */
export type Pen = 'red' | 'yellow' | 'green'
export const PENS: Pen[] = ['red', 'yellow', 'green']

export interface Settings {
  filter: PracticeFilter
  tint: boolean
  /** The selected pen, or null to cycle colours by tapping. */
  pen: Pen | null
}

export const DEFAULT_SETTINGS: Settings = {
  filter: { hand: 'HT', threshold: 'red-yellow' },
  tint: false,
  pen: null,
}

export interface PieceData {
  piece: Piece
  systems: System[]
  bars: Bar[]
  statuses: Record<string, Status>
  sections: Section[]
  log: StatusLogEntry[]
}

export function statusId(barId: string, hand: Hand): string {
  return `${barId}:${hand}`
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
