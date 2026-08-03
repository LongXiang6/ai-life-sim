/**
 * Purpose: Manage the transient status message used by the talent-draw page.
 * Owner: mod-pages/talent-draw
 * Responsibility: Toast text and timer lifecycle only.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export function useTalentDrawNotification() {
  const [toastMessage, setToastMessage] = useState('')
  const toastTimerRef = useRef<number | null>(null)

  const notify = useCallback((message: string) => {
    setToastMessage(message)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('')
      toastTimerRef.current = null
    }, 1450)
  }, [])

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
  }, [])

  return { notify, toastMessage }
}
