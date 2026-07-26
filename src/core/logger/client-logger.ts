/**
 * @module client-logger.ts
 * @description 统一客户端日志工具 —— warn/error 级别自动上报到服务端，不截断任何信息
 * @mod core
 *
 * 废弃项目参考：src/lib/utils/logger.ts
 */

import { getCachedDiagnosticPlayerCode } from './diagnostic-player-code-client'

import { ENGINE_VERSION } from '@/core/version'
import type { StoryRepetitionUsageMetric } from './usage-metrics'

const LOG_API = '/api/log'
const RECENT_DIAGNOSTIC_LIMIT = 80
const DIAGNOSTIC_SESSION_KEY = 'ai-life-sim:diagnostic-session-id'
const DIAGNOSTIC_ENVIRONMENT_REPORTED_KEY = 'ai-life-sim:diagnostic-environment-reported:2.3.0'

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
  eventType?: 'log' | 'exception' | 'metric'
  context?: Record<string, unknown>
  metric?: StoryRepetitionUsageMetric
}

export type { StoryRepetitionUsageMetric } from './usage-metrics'

const recentDiagnosticEntries: ClientDiagnosticEntry[] = []
let consoleCaptureSuppressionDepth = 0

function writeConsole(level: LogLevel, ...args: unknown[]): void {
  consoleCaptureSuppressionDepth += 1
  try {
    console[level](...args)
  } finally {
    consoleCaptureSuppressionDepth -= 1
  }
}

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
  recentDiagnosticEntries.push(entry)
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
  const payload = JSON.stringify(enriched)
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' })
    if (navigator.sendBeacon(LOG_API, blob)) return
  }
  fetch(LOG_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // 上报失败静默丢弃
  })
}

/** 上报叙事生成质量指标；不记录页面、点击、推进或分支操作。 */
export function reportUsageMetric(metric: StoryRepetitionUsageMetric): void {
  if (typeof window === 'undefined') return
  sendToServer({
    level: 'info',
    module: 'story-quality',
    message: metric.kind,
    timestamp: Date.now(),
    eventType: 'metric',
    metric,
  })
}

async function collectDiagnosticSessionEnvironment(): Promise<Record<string, unknown>> {
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
    deviceMemory?: number
  }).connection
  const memory = (performance as Performance & {
    memory?: { jsHeapSizeLimit?: number; totalJSHeapSize?: number; usedJSHeapSize?: number }
  }).memory
  const storage = await navigator.storage?.estimate().catch(() => undefined)
  return {
    app: {
      version: ENGINE_VERSION,
      page: location.pathname,
      diagnosticSessionId: getDiagnosticSessionId(),
      diagnosticCode: getCachedDiagnosticPlayerCode(),
      capturedAt: new Date().toISOString(),
    },
    browser: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      online: navigator.onLine,
    },
    runtime: {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemoryGiB: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      maxTouchPoints: navigator.maxTouchPoints,
    },
    display: {
      screenWidth: screen.width,
      screenHeight: screen.height,
      availableWidth: screen.availWidth,
      availableHeight: screen.availHeight,
      colorDepth: screen.colorDepth,
      pixelDepth: screen.pixelDepth,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      orientationType: screen.orientation?.type,
      orientationAngle: screen.orientation?.angle,
      colorScheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      displayMode: matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
    },
    network: connection ? {
      effectiveType: connection.effectiveType,
      downlinkMbps: connection.downlink,
      roundTripTimeMs: connection.rtt,
      saveData: connection.saveData,
    } : undefined,
    storage: storage ? { usageBytes: storage.usage, quotaBytes: storage.quota } : undefined,
    javascriptMemory: memory ? {
      heapLimitBytes: memory.jsHeapSizeLimit,
      totalHeapBytes: memory.totalJSHeapSize,
      usedHeapBytes: memory.usedJSHeapSize,
    } : undefined,
  }
}

/** 每个浏览器会话静默保存一次完整运行环境。 */
export async function reportDiagnosticSessionEnvironment(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    if (sessionStorage.getItem(DIAGNOSTIC_ENVIRONMENT_REPORTED_KEY) === 'sent') return true
    if (sessionStorage.getItem(DIAGNOSTIC_ENVIRONMENT_REPORTED_KEY) === 'pending') return false
    sessionStorage.setItem(DIAGNOSTIC_ENVIRONMENT_REPORTED_KEY, 'pending')
    const environmentSnapshot = await collectDiagnosticSessionEnvironment()
    const entry: ClientDiagnosticEntry = {
      level: 'info',
      module: 'diagnostic-session',
      message: 'environment-snapshot',
      timestamp: Date.now(),
      eventType: 'log',
      context: { environmentSnapshot },
    }
    const response = await fetch(LOG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      keepalive: true,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    rememberDiagnosticEntry(entry)
    sessionStorage.setItem(DIAGNOSTIC_ENVIRONMENT_REPORTED_KEY, 'sent')
    return true
  } catch {
    try {
      sessionStorage.removeItem(DIAGNOSTIC_ENVIRONMENT_REPORTED_KEY)
    } catch {
      // sessionStorage 不可用时等待下一次页面会话。
    }
    return false
  }
}

/** 统一日志工具 */
export const logger = {
  debug(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('debug')) return
    writeConsole('debug', `[${module}] ${message}`, ...args)
    sendToServer({
      level: 'debug',
      module,
      message,
      timestamp: Date.now(),
      args: args.length > 0 ? args : undefined,
    })
  },

  info(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('info')) return
    writeConsole('info', `[${module}] ${message}`, ...args)
    sendToServer({
      level: 'info',
      module,
      message,
      timestamp: Date.now(),
      args: args.length > 0 ? args : undefined,
    })
  },

  warn(module: string, message: string, ...args: unknown[]): void {
    if (!shouldLog('warn')) return
    writeConsole('warn', `[${module}] ${message}`, ...args)
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
    writeConsole('error', `[${module}] ${message}`, ...args)
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
    writeConsole('warn', `[${module}] ${message}`, raw.slice(0, 200), error)
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
    writeConsole('error', `[${module}] ${message}`, raw.slice(0, 200), error)
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

}

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
    if (consoleCaptureSuppressionDepth > 0) return
    const error = args.find((arg) => arg instanceof Error) as Error | undefined
    sendToServer({
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
