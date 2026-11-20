import { getMeta, setMeta } from '../db/repo'

/** True when running from the home-screen icon rather than a Safari tab. */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

/**
 * Ask the browser to keep our data. Done on every launch until it is granted, because Safari
 * decides based on how the app is used (home-screen apps are normally granted).
 */
export async function ensurePersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persisted) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}

const LAST_BACKUP = 'lastBackupAt'

export async function recordBackup(): Promise<void> {
  await setMeta(LAST_BACKUP, Date.now())
}

export async function lastBackupAt(): Promise<number | undefined> {
  return getMeta<number>(LAST_BACKUP)
}
