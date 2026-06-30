/**
 * @module client-logger.ts
 * @description 统一客户端日志工具 —— warn/error 级别自动上报到服务端，不截断任何信息
 * @mod core
 *
 * 废弃项目参考：src/lib/utils/logger.ts
 */

const LOG_API = '/api/log'

/** 日志级别 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

/** 日志条目 */
interface LogEntry {
  level: LogLevel
  module: string
  message: string
  timestamp: number
  args?: unknown[]
  /** 原始 AI 响应内容（不截断） */
  raw?: string
  /** 原始错误对象 */
  error?: string
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
function sendToServer(entry: LogEntry): void {
  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(entry)], { type: 'application/json' })
    navigator.sendBeacon(LOG_API, blob)
  } else {
    fetch(LOG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
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
    sendToServer({
      level: 'error',
      module,
      message,
      timestamp: Date.now(),
      args: args.length > 0 ? args : undefined,
      error: errorArg ? errorArg.message : undefined,
    })
  },

  /**
   * 带原始内容的 warn 日志
   * 用于记录 AI 响应原文等不截断内容
   */
  warnRaw(module: string, message: string, raw: string, error?: unknown): void {
    if (!shouldLog('warn')) return
    console.warn(`[${module}] ${message}`, raw.slice(0, 200), error)
    sendToServer({
      level: 'warn',
      module,
      message,
      timestamp: Date.now(),
      raw, // 完整原文，不截断
      error: error instanceof Error ? error.message : undefined,
    })
  },

  /**
   * 带原始内容的 error 日志
   * 用于记录 AI 响应原文等不截断内容
   */
  errorRaw(module: string, message: string, raw: string, error?: unknown): void {
    if (!shouldLog('error')) return
    console.error(`[${module}] ${message}`, raw.slice(0, 200), error)
    sendToServer({
      level: 'error',
      module,
      message,
      timestamp: Date.now(),
      raw, // 完整原文，不截断
      error: error instanceof Error ? error.message : undefined,
    })
  },
}
