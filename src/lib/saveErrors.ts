/** A tiny broadcast so any failed save can raise the app-wide warning banner. */
type Listener = (message: string) => void

const listeners = new Set<Listener>()

export function reportSaveError(err: unknown, what = 'your last change'): void {
  const detail = err instanceof Error ? ` (${err.name}: ${err.message})` : ''
  console.error('Save failed', err)
  const message = `The app could not save ${what}${detail}. Reload the app; if this keeps happening, export a backup.`
  for (const l of listeners) l(message)
}

export function onSaveError(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
