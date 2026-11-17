import { useCallback, useEffect, useState } from 'react'
import { loadSettings, saveSettings } from '../db/repo'
import { DEFAULT_SETTINGS, type Settings } from '../db/types'

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  useEffect(() => {
    void loadSettings().then(setSettings)
  }, [])
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch }
      void saveSettings(next)
      return next
    })
  }, [])
  return [settings, update]
}
