import { useEffect, useRef } from 'react'

export function useHelpModalFocusTrap(visible: boolean, onClose: () => void) {
  const modalRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!visible) return

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusFrame = window.requestAnimationFrame(() => modalRef.current?.focus())

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      const modal = modalRef.current
      if (!modal) return

      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const selector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>(selector))
        .filter((element) => element.getClientRects().length > 0 && element.getAttribute('aria-hidden') !== 'true')

      if (focusable.length === 0) {
        event.preventDefault()
        modal.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      const activeIsFocusable = focusable.includes(active as HTMLElement)

      if (event.shiftKey) {
        if (active === first || !modal.contains(active) || !activeIsFocusable) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || !modal.contains(active) || !activeIsFocusable) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleDocumentKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleDocumentKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [visible])

  return modalRef
}
