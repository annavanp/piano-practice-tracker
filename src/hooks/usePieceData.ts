import { useCallback, useEffect, useRef, useState } from 'react'
import * as repo from '../db/repo'
import { statusId, type Hand, type Level, type PieceData, type Section, type System } from '../db/types'

export interface PieceActions {
  reload: () => Promise<void>
  setLevel: (barId: string, hand: Hand, level: Level) => Promise<void>
  saveSystems: (systems: System[]) => Promise<void>
  updatePiece: (patch: { title?: string; composer?: string; firstBarNumber?: number }) => Promise<void>
  addSection: (name: string, startBar: number, endBar: number) => Promise<void>
  updateSection: (section: Section) => Promise<void>
  deleteSection: (id: string) => Promise<void>
}

/** Loads everything about one piece and exposes mutations that write through to IndexedDB. */
export function usePieceData(pieceId: string): { data: PieceData | null | undefined; actions: PieceActions } {
  const [data, setData] = useState<PieceData | null | undefined>(undefined)
  const dataRef = useRef(data)
  dataRef.current = data

  const reload = useCallback(async () => {
    const next = await repo.loadPieceData(pieceId)
    setData((prev) => {
      // Keep the same Blob object across reloads so the PDF is not reopened on every save.
      if (next && prev && prev.piece.id === next.piece.id) return { ...next, piece: { ...next.piece, pdf: prev.piece.pdf } }
      return next
    })
  }, [pieceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const setLevel = useCallback(
    async (barId: string, hand: Hand, level: Level) => {
      const time = Date.now()
      // Optimistic update so the light responds instantly.
      setData((d) => {
        if (!d) return d
        const status = { id: statusId(barId, hand), pieceId, barId, hand, level, updatedAt: time }
        return {
          ...d,
          statuses: { ...d.statuses, [status.id]: status },
          log: [...d.log, { pieceId, barId, hand, level, time }],
        }
      })
      await repo.setStatus(pieceId, barId, hand, level, time)
    },
    [pieceId],
  )

  const saveSystems = useCallback(
    async (systems: System[]) => {
      await repo.saveSystems(pieceId, systems)
      await reload()
    },
    [pieceId, reload],
  )

  const updatePiece = useCallback(
    async (patch: { title?: string; composer?: string; firstBarNumber?: number }) => {
      await repo.updatePiece(pieceId, patch)
      await reload()
    },
    [pieceId, reload],
  )

  const addSection = useCallback(
    async (name: string, startBar: number, endBar: number) => {
      await repo.addSection(pieceId, name, startBar, endBar)
      await reload()
    },
    [pieceId, reload],
  )
  const updateSection = useCallback(
    async (section: Section) => {
      await repo.updateSection(section)
      await reload()
    },
    [reload],
  )
  const deleteSection = useCallback(
    async (id: string) => {
      await repo.deleteSection(id)
      await reload()
    },
    [reload],
  )

  return { data, actions: { reload, setLevel, saveSystems, updatePiece, addSection, updateSection, deleteSection } }
}
