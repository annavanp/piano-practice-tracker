import { getMeta, setMeta } from '../db/repo'

/** Ask Safari to keep our data; called once on first launch. */
export async function ensurePersistentStorage(): Promise<void> {
  try {
    const asked = await getMeta<boolean>('persistRequested')
    if (asked) return
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      await navigator.storage.persist()
    }
    await setMeta('persistRequested', true)
  } catch {
    // Ignore: storage persistence is best-effort.
  }
}
