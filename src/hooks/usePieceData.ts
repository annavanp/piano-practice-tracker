import { useCallback, useEffect, useRef, useState } from 'react'
import * as repo from '../db/repo'
import { reportSaveError } from '../lib/saveErrors'
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
      try {
        await repo.setStatus(pieceId, barId, hand, level, time)
      } catch (err) {
        reportSaveError(err, 'that light')
        // Put the screen back to what is actually stored, so it never shows an unsaved light.
        await reload().catch(() => undefined)
      }
    },
    [pieceId, reload],
  )

  const saveSystems = useCallback(
    async (systems: System[]) => {
      try {
        await repo.saveSystems(pieceId, systems)
      } catch (err) {
        reportSaveError(err)
      }
      await reload().catch(() => undefined)
    },
    [pieceId, reload],
  )

  const updatePiece = useCallback(
    async (patch: { title?: string; composer?: string; firstBarNumber?: number }) => {
      try {
        await repo.updatePiece(pieceId, patch)
      } catch (err) {
        reportSaveError(err)
      }
      await reload().catch(() => undefined)
    },
    [pieceId, reload],
  )

  const addSection = useCallback(
    async (name: string, startBar: number, endBar: number) => {
      try {
        await repo.addSection(pieceId, name, startBar, endBar)
      } catch (err) {
        reportSaveError(err)
      }
      await reload().catch(() => undefined)
    },
    [pieceId, reload],
  )
  const updateSection = useCallback(
    async (section: Section) => {
      try {
        await repo.updateSection(section)
      } catch (err) {
        reportSaveError(err)
      }
      await reload().catch(() => undefined)
    },
    [reload],
  )
  const deleteSection = useCallback(
    async (id: string) => {
      try {
        await repo.deleteSection(id)
      } catch (err) {
        reportSaveError(err)
      }
      await reload().catch(() => undefined)
    },
    [reload],
  )

  return { data, actions: { reload, setLevel, saveSystems, updatePiece, addSection, updateSection, deleteSection } }
}
