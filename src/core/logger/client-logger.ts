/**
 * Purpose: Expose the public client logger and story-quality metric reporter.
 * Owner: core:logger
 * Responsibility: Build log entries for explicit caller commands; transport and global hooks stay separate.
 */

import type { StoryRepetitionUsageMetric } from './usage-metrics'
import {
  rememberLocalDiagnostic,
  sendClientDiagnostic,
  shouldLog,
  writeClientConsole,
} from './client-logger/diagnostic-transport'

export type { ClientDiagnosticEntry } from './client-logger/contracts'
export { getDiagnosticSessionId, getRecentClientDiagnostics } from './client-logger/diagnostic-transport'
export { reportDiagnosticSessionEnvironment } from './client-logger/environment-reporter'
export { installGlobalLogHandlers } from './client-logger/global-handlers'
export type { StoryRepetitionUsageMetric } from './usage-metrics'

export function reportUsageMetric(metric: StoryRepetitionUsageMetric): void {
  if (typeof window === 'undefined') return
  sendClientDiagnostic({
    level: 'info',
    module: 'story-quality',
    message: metric.kind,
    timestamp: Date.now(),
    eventType: 'metric',
    metric,
  })
}

export const logger = {
  debug(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('debug')) return
    writeClientConsole('debug', `[${module}] ${message}`, ...args)
    rememberLocalDiagnostic({
      level: 'debug',
      module,
      message,
      timestamp: Date.now(),
      args: args.length > 0 ? args : undefined,
    })
  },

  info(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('info')) return
    writeClientConsole('info', `[${module}] ${message}`, ...args)
    rememberLocalDiagnostic({
      level: 'info',
      module,
      message,
      timestamp: Date.now(),
      args: args.length > 0 ? args : undefined,
    })
  },

  warn(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('warn')) return
    writeClientConsole('warn', `[${module}] ${message}`, ...args)
    sendClientDiagnostic({
      level: 'warn',
      module,
      message,
      timestamp: Date.now(),
      args: args.length > 0 ? args : undefined,
    })
  },

  error(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('error')) return
    writeClientConsole('error', `[${module}] ${message}`, ...args)
    const errorArg = args.find((argument) => argument instanceof Error) as Error | undefined
    const requestId = errorArg && typeof (errorArg as Error & { requestId?: unknown }).requestId === 'string'
      ? (errorArg as Error & { requestId: string }).requestId
      : undefined
    sendClientDiagnostic({
      level: 'error',
      module,
      message,
      timestamp: Date.now(),
      args: args.length > 0 ? args : undefined,
      error: errorArg?.message,
      errorName: errorArg?.name,
      stack: errorArg?.stack,
      requestId,
    })
  },

  warnRaw(
    module: string,
    message: string,
    raw: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void {
    if (!shouldLog('warn')) return
    writeClientConsole('warn', `[${module}] ${message}`, raw.slice(0, 200), error)
    sendClientDiagnostic({
      level: 'warn',
      module,
      message,
      timestamp: Date.now(),
      raw,
      error: error instanceof Error ? error.message : undefined,
      requestId: typeof context?.requestId === 'string' ? context.requestId : undefined,
      context,
    })
  },

  errorRaw(
    module: string,
    message: string,
    raw: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void {
    if (!shouldLog('error')) return
    writeClientConsole('error', `[${module}] ${message}`, raw.slice(0, 200), error)
    sendClientDiagnostic({
      level: 'error',
      module,
      message,
      timestamp: Date.now(),
      raw,
      error: error instanceof Error ? error.message : undefined,
      errorName: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      requestId: typeof context?.requestId === 'string' ? context.requestId : undefined,
      context,
    })
  },
}
