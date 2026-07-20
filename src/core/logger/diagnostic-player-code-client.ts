'use client'

/**
 * @module diagnostic-player-code-client.ts
 * @description 浏览器诊断编号初始化与只读缓存
 * @mod core
 */

import { normalizeDiagnosticPlayerCode } from './diagnostic-player-code'

interface DiagnosticIdentityResponse {
  diagnosticCode?: string
}

let cachedDiagnosticPlayerCode: string | undefined
let pendingDiagnosticPlayerCode: Promise<string | undefined> | null = null

export function getCachedDiagnosticPlayerCode(): string | undefined {
  return cachedDiagnosticPlayerCode
}

export async function ensureDiagnosticPlayerCode(): Promise<string | undefined> {
  if (cachedDiagnosticPlayerCode) return cachedDiagnosticPlayerCode
  if (pendingDiagnosticPlayerCode) return pendingDiagnosticPlayerCode

  pendingDiagnosticPlayerCode = (async () => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch('/api/diagnostic-identity', {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!response.ok) return undefined
      const result = await response.json().catch(() => ({})) as DiagnosticIdentityResponse
      cachedDiagnosticPlayerCode = normalizeDiagnosticPlayerCode(result.diagnosticCode)
      return cachedDiagnosticPlayerCode
    } catch {
      return undefined
    } finally {
      window.clearTimeout(timeoutId)
      pendingDiagnosticPlayerCode = null
    }
  })()

  return pendingDiagnosticPlayerCode
}

