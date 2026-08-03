/**
 * Purpose: Install one set of console, window-error, and unhandled-rejection diagnostic hooks.
 * Owner: core:logger
 * Responsibility: Global browser exception capture only; explicit logger calls remain separate.
 */

import {
  isConsoleCaptureSuppressed,
  sendClientDiagnostic,
} from './diagnostic-transport'

let globalHandlersInstalled = false

function diagnosticMessage(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  return Object.prototype.toString.call(value)
}

export function installGlobalLogHandlers(): void {
  if (globalHandlersInstalled || typeof window === 'undefined') return
  globalHandlersInstalled = true

  const originalConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args)
    if (isConsoleCaptureSuppressed()) return
    const error = args.find((argument) => argument instanceof Error) as Error | undefined
    sendClientDiagnostic({
      level: 'error',
      module: 'console',
      message: diagnosticMessage(args[0]),
      timestamp: Date.now(),
      args,
      error: error?.message,
      errorName: error?.name,
      stack: error?.stack,
      requestId: error && typeof (error as Error & { requestId?: unknown }).requestId === 'string'
        ? (error as Error & { requestId: string }).requestId
        : undefined,
    })
  }

  window.addEventListener('error', (event) => {
    const error = event.error instanceof Error ? event.error : undefined
    sendClientDiagnostic({
      level: 'error',
      module: 'global',
      message: event.message || 'window error',
      timestamp: Date.now(),
      eventType: 'exception',
      error: error?.message ?? event.message,
      errorName: error?.name,
      stack: error?.stack,
      context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason : undefined
    sendClientDiagnostic({
      level: 'error',
      module: 'global',
      message: 'unhandledrejection',
      timestamp: Date.now(),
      eventType: 'exception',
      error: reason?.message ?? String(event.reason ?? 'unknown'),
      errorName: reason?.name,
      stack: reason?.stack,
    })
  })
}
