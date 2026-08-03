/**
 * Purpose: Capture and upload one browser environment snapshot per diagnostic session.
 * Owner: core:logger
 * Responsibility: Environment collection and one-session delivery state only.
 */

import { ENGINE_VERSION } from '@/core/version'

import { getCachedDiagnosticPlayerCode } from '../diagnostic-player-code-client'
import type { ClientDiagnosticEntry } from './contracts'
import {
  getDiagnosticSessionId,
  rememberDiagnosticEntry,
} from './diagnostic-transport'

const LOG_API = '/api/log'
const DIAGNOSTIC_ENVIRONMENT_REPORTED_KEY = 'ai-life-sim:diagnostic-environment-reported:2.3.0'

async function collectDiagnosticSessionEnvironment(): Promise<Record<string, unknown>> {
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
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
      // sessionStorage may be unavailable until the next page session.
    }
    return false
  }
}
