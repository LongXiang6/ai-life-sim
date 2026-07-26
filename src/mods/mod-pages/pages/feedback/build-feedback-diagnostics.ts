'use client'

/**
 * @module build-feedback-diagnostics.ts
 * @description 组装玩家主动提交的完整诊断数据
 * @mod mod-pages
 */

import { modRegistry, useGlobalStore, useThemeStore } from '@/core'
import { useFontStore } from '@/core/theme/font-store'
import { ENGINE_VERSION } from '@/core/version'
import {
  getDiagnosticSessionId,
  getRecentClientDiagnostics,
} from '@/core/logger/client-logger'
import { getCachedDiagnosticPlayerCode } from '@/core/logger/diagnostic-player-code-client'
import { RECENT_NARRATIVE_WINDOW, useEngineStore } from '@/mods/mod-engine'
import { useCharacterStore } from '@/mods/mod-character'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import type { PlayerFeedbackEnvelope } from '@/core/logger/feedback-contract'

type FeedbackDiagnostics = PlayerFeedbackEnvelope['diagnostics']

function toSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item, seen))
  }
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([key, item]) => [String(key), toSerializable(item, seen)]))
  }
  if (value instanceof Set) return [...value].map((item) => toSerializable(item, seen))
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const serialized = toSerializable(child, seen)
      if (serialized !== undefined) output[key] = serialized
    }
    seen.delete(value)
    return output
  }
  return String(value)
}

function serializeRecord(value: unknown): Record<string, unknown> {
  const serialized = toSerializable(value)
  return serialized && typeof serialized === 'object' && !Array.isArray(serialized)
    ? serialized as Record<string, unknown>
    : {}
}

function collectProjectConfigEntries(): Record<string, unknown> {
  if (typeof localStorage === 'undefined') return {}
  const entries: Record<string, unknown> = {}
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (!key?.startsWith('ai-life-sim:') || !key.includes(':config:')) continue
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    try {
      entries[key] = JSON.parse(raw)
    } catch {
      entries[key] = raw
    }
  }
  return serializeRecord(entries)
}

async function collectDeviceEnvironment(): Promise<Record<string, unknown>> {
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean }
    deviceMemory?: number
  }).connection
  const memory = (performance as Performance & {
    memory?: { jsHeapSizeLimit?: number; totalJSHeapSize?: number; usedJSHeapSize?: number }
  }).memory
  const storage = await navigator.storage?.estimate().catch(() => undefined)
  const orientation = screen.orientation

  return serializeRecord({
    browser: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      vendor: navigator.vendor,
      languages: navigator.languages,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      online: navigator.onLine,
    },
    hardware: {
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
      orientationType: orientation?.type,
      orientationAngle: orientation?.angle,
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
  })
}

export async function buildFeedbackDiagnostics(): Promise<FeedbackDiagnostics> {
  const globalState = useGlobalStore.getState()
  const settingsState = useSettingsStore.getState()
  const worldState = useWorldStore.getState()
  const characterState = useCharacterStore.getState()
  const engineState = useEngineStore.getState()
  const themeState = useThemeStore.getState()
  const fontState = useFontStore.getState()
  const diagnosticSessionId = getDiagnosticSessionId()

  const settings = serializeRecord(settingsState)

  const engineWithoutHistory = serializeRecord(engineState)
  delete engineWithoutHistory.narrativeHistory

  const recentStory = engineState.narrativeHistory
    .slice(-RECENT_NARRATIVE_WINDOW)
    .map((entry) => serializeRecord(entry))

  const recentClientLogs = getRecentClientDiagnostics()
    .map((entry) => serializeRecord(entry))

  return {
    app: serializeRecord({
      version: ENGINE_VERSION,
      page: location.pathname,
      diagnosticSessionId,
      diagnosticCode: getCachedDiagnosticPlayerCode(),
      submittedAtIso: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffsetMinutes: new Date().getTimezoneOffset(),
      loadedMods: modRegistry.getLoadOrder(),
      availableCapabilities: Object.fromEntries(modRegistry.getAvailableCapabilities()),
    }),
    device: await collectDeviceEnvironment(),
    globalConfig: serializeRecord({
      app: globalState,
      settings,
      theme: themeState,
      font: fontState,
      projectConfigEntries: collectProjectConfigEntries(),
    }),
    gameState: serializeRecord({
      world: worldState,
      character: characterState,
      engine: engineWithoutHistory,
    }),
    recentStory,
    recentClientLogs,
  }
}
