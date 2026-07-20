/**
 * @module client-logger.ts
 * @description 统一客户端日志工具 —— warn/error 级别自动上报到服务端，不截断任何信息
 * @mod core
 *
 * 废弃项目参考：src/lib/utils/logger.ts
 */

import { redactSensitiveData } from './redact-sensitive-data'
import { getCachedDiagnosticPlayerCode } from './diagnostic-player-code-client'

const LOG_API = '/api/log'
const RECENT_DIAGNOSTIC_LIMIT = 80
const DIAGNOSTIC_SESSION_KEY = 'ai-life-sim:diagnostic-session-id'

/** 日志级别 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 日志条目 */
export interface ClientDiagnosticEntry {
  level: LogLevel
  module: string
  message: string
  timestamp: number
  args?: unknown[]
  /** 原始 AI 响应内容（不截断） */
  raw?: string
  /** 原始错误对象 */
  error?: string
  errorName?: string
  stack?: string
  requestId?: string
  eventType?: 'log' | 'exception' | 'user_action'
  action?: string
  context?: Record<string, unknown>
}

const recentDiagnosticEntries: ClientDiagnosticEntry[] = []

export function getDiagnosticSessionId(): string {
  if (typeof window === 'undefined') return 'server'
  try {
    const existing = sessionStorage.getItem(DIAGNOSTIC_SESSION_KEY)
    if (existing) return existing
    const created = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(DIAGNOSTIC_SESSION_KEY, created)
    return created
  } catch {
    return `session-${Date.now().toString(36)}`
  }
}

function rememberDiagnosticEntry(entry: ClientDiagnosticEntry): void {
  const redacted = redactSensitiveData(entry) as ClientDiagnosticEntry
  recentDiagnosticEntries.push(redacted)
  if (recentDiagnosticEntries.length > RECENT_DIAGNOSTIC_LIMIT) {
    recentDiagnosticEntries.splice(0, recentDiagnosticEntries.length - RECENT_DIAGNOSTIC_LIMIT)
  }
}

export function getRecentClientDiagnostics(): ClientDiagnosticEntry[] {
  return recentDiagnosticEntries.map((entry) => structuredClone(entry))
}

/** 日志级别控制 key */
const LOG_LEVEL_KEY = 'ai-life-sim:log-level'

/** 获取当前最低日志级别 */
function getMinLogLevel(): LogLevel {
  try {
    const stored = localStorage.getItem(LOG_LEVEL_KEY)
    if (stored) return stored as LogLevel
  } catch {
    // localStorage 不可用
  }
  return 'debug'
}

/** 日志级别优先级 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

/** 判断是否应该输出 */
function shouldLog(level: LogLevel): boolean {
  const minLevel = getMinLogLevel()
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel]
}

/** 发送日志到服务端 */
function sendToServer(entry: ClientDiagnosticEntry): void {
  const enriched: ClientDiagnosticEntry = {
    eventType: 'log',
    ...entry,
    context: {
      ...(typeof location !== 'undefined' ? { path: location.pathname, url: location.href } : {}),
      ...(typeof navigator !== 'undefined' ? { userAgent: navigator.userAgent } : {}),
      diagnosticSessionId: getDiagnosticSessionId(),
      diagnosticCode: getCachedDiagnosticPlayerCode(),
      ...entry.context,
    },
  }
  rememberDiagnosticEntry(enriched)
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(enriched)], { type: 'application/json' })
    navigator.sendBeacon(LOG_API, blob)
  } else {
    fetch(LOG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enriched),
    }).catch(() => {
      // 上报失败静默丢弃
    })
  }
}

/** 统一日志工具 */
export const logger = {
  debug(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('debug')) return
    console.debug(`[${module}] ${message}`, ...args)
  },

  info(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('info')) return
    console.info(`[${module}] ${message}`, ...args)
  },

  warn(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('warn')) return
    console.warn(`[${module}] ${message}`, ...args)
    // 自动上报到服务端
    sendToServer({
      level: 'warn',
      module,
      message,
      timestamp: Date.now(),
      args: args.length > 0 ? args : undefined,
    })
  },

  error(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('error')) return
    console.error(`[${module}] ${message}`, ...args)
    // 自动上报到服务端
    const errorArg = args.find(a => a instanceof Error)
    const errorWithRequestId = errorArg as (Error & { requestId?: unknown }) | undefined
    const requestId = errorWithRequestId && typeof errorWithRequestId.requestId === 'string'
      ? errorWithRequestId.requestId
      : undefined
    sendToServer({
      level: 'error',
      module,
      message,
      timestamp: Date.now(),
      args: args.length > 0 ? args : undefined,
      error: errorArg ? errorArg.message : undefined,
      errorName: errorArg ? errorArg.name : undefined,
      stack: errorArg ? errorArg.stack : undefined,
      requestId,
    })
  },

  /**
   * 带原始内容的 warn 日志
   * 用于记录 AI 响应原文等不截断内容
   */
  warnRaw(
    module: string,
    message: string,
    raw: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void {
    if (!shouldLog('warn')) return
    console.warn(`[${module}] ${message}`, raw.slice(0, 200), error)
    sendToServer({
      level: 'warn',
      module,
      message,
      timestamp: Date.now(),
      raw, // 完整原文，不截断
      error: error instanceof Error ? error.message : undefined,
      requestId: typeof context?.requestId === 'string' ? context.requestId : undefined,
      context,
    })
  },

  /**
   * 带原始内容的 error 日志
   * 用于记录 AI 响应原文等不截断内容
   */
  errorRaw(
    module: string,
    message: string,
    raw: string,
    error?: unknown,
    context?: Record<string, unknown>,
  ): void {
    if (!shouldLog('error')) return
    console.error(`[${module}] ${message}`, raw.slice(0, 200), error)
    sendToServer({
      level: 'error',
      module,
      message,
      timestamp: Date.now(),
      raw, // 完整原文，不截断
      error: error instanceof Error ? error.message : undefined,
      errorName: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
      requestId: typeof context?.requestId === 'string' ? context.requestId : undefined,
      context,
    })
  },

  action(module: string, action: string, context?: Record<string, unknown>): void {
    if (!shouldLog('info')) return
    console.info(`[${module}] action:${action}`, context)
    sendToServer({
      level: 'info',
      module,
      message: action,
      timestamp: Date.now(),
      eventType: 'user_action',
      action,
      context,
    })
  },
}

let globalHandlersInstalled = false

export function installGlobalLogHandlers(): void {
  if (globalHandlersInstalled || typeof window === 'undefined') return
  globalHandlersInstalled = true

  window.addEventListener('error', (event) => {
    const err = event.error instanceof Error ? event.error : undefined
    sendToServer({
      level: 'error',
      module: 'global',
      message: event.message || 'window error',
      timestamp: Date.now(),
      eventType: 'exception',
      error: err?.message ?? event.message,
      errorName: err?.name,
      stack: err?.stack,
      context: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? event.reason : undefined
    sendToServer({
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
