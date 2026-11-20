import { useEffect, useState } from 'react'
import { onSaveError } from '../lib/saveErrors'

export function SaveErrorBanner() {
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => onSaveError(setMessage), [])
  if (!message) return null
  return (
    <div className="save-error" role="alert" data-testid="save-error">
      <span>{message}</span>
      <div className="row">
        <button className="primary" onClick={() => window.location.reload()}>
          Reload
        </button>
        <button onClick={() => setMessage(null)}>Dismiss</button>
      </div>
    </div>
  )
}
