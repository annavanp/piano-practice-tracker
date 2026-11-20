import { useCallback, useEffect, useState } from 'react'
import { loadSettings, saveSettings } from '../db/repo'
import { DEFAULT_SETTINGS, type Settings } from '../db/types'
import { reportSaveError } from '../lib/saveErrors'

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  useEffect(() => {
    loadSettings().then(setSettings, () => undefined)
  }, [])
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch }
      saveSettings(next).catch((err) => reportSaveError(err, 'your settings'))
      return next
    })
  }, [])
  return [settings, update]
}
