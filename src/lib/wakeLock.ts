/** Keep the screen on while the practice view is open, where the Wake Lock API exists. */
export function acquireWakeLock(): () => void {
  let sentinel: WakeLockSentinel | null = null
  let active = true

  const request = async () => {
    if (!active || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return
    try {
      sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => {
        sentinel = null
      })
    } catch {
      // Not supported, low battery, or denied: nothing to do.
    }
  }
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void request()
  }
  document.addEventListener('visibilitychange', onVisibility)
  void request()

  return () => {
    active = false
    document.removeEventListener('visibilitychange', onVisibility)
    void sentinel?.release()
    sentinel = null
  }
}
