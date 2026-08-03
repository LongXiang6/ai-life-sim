/**
 * Purpose: Enrich, retain, print, and upload client diagnostic entries.
 * Owner: core:logger
 * Responsibility: Client diagnostic transport and bounded recent-entry memory only.
 */

import { getCachedDiagnosticPlayerCode } from '../diagnostic-player-code-client'
import type { ClientDiagnosticEntry, ClientLogLevel } from './contracts'

const LOG_API = '/api/log'
const RECENT_DIAGNOSTIC_LIMIT = 80
const DIAGNOSTIC_SESSION_KEY = 'ai-life-sim:diagnostic-session-id'
const LOG_LEVEL_KEY = 'ai-life-sim:log-level'
const LOG_LEVEL_PRIORITY: Record<ClientLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const recentDiagnosticEntries: ClientDiagnosticEntry[] = []
let consoleCaptureSuppressionDepth = 0

export function writeClientConsole(level: ClientLogLevel, ...args: unknown[]): void {
  consoleCaptureSuppressionDepth += 1
  try {
    console[level](...args)
  } finally {
    consoleCaptureSuppressionDepth -= 1
  }
}

export function isConsoleCaptureSuppressed(): boolean {
  return consoleCaptureSuppressionDepth > 0
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

export function rememberDiagnosticEntry(entry: ClientDiagnosticEntry): void {
  recentDiagnosticEntries.push(entry)
  if (recentDiagnosticEntries.length > RECENT_DIAGNOSTIC_LIMIT) {
    recentDiagnosticEntries.splice(0, recentDiagnosticEntries.length - RECENT_DIAGNOSTIC_LIMIT)
  }
}

function enrichDiagnosticEntry(entry: ClientDiagnosticEntry): ClientDiagnosticEntry {
  return {
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
}

export function rememberLocalDiagnostic(entry: ClientDiagnosticEntry): void {
  rememberDiagnosticEntry(enrichDiagnosticEntry(entry))
}

export function getRecentClientDiagnostics(): ClientDiagnosticEntry[] {
  return recentDiagnosticEntries.map((entry) => structuredClone(entry))
}

function getMinLogLevel(): ClientLogLevel {
  try {
    const stored = localStorage.getItem(LOG_LEVEL_KEY)
    if (stored) return stored as ClientLogLevel
  } catch {
    // localStorage may be unavailable.
  }
  return 'debug'
}

export function shouldLog(level: ClientLogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[getMinLogLevel()]
}

export function sendClientDiagnostic(entry: ClientDiagnosticEntry): void {
  const enriched = enrichDiagnosticEntry(entry)
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
    // Logging failures must not affect the player workflow.
  })
}
