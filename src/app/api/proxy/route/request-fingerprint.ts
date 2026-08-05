/**
 * Purpose: Compute and track short-lived AI proxy request fingerprints for retry observability.
 * Owner: app:api
 * Responsibility: In-memory retry correlation only; it never rejects or persists requests.
 */

import { createHash } from 'node:crypto'

const recentFingerprints = new Map<string, { firstSeen: number; retryCount: number }>()
const FINGERPRINT_TTL_MS = 30_000

if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [fingerprint, data] of recentFingerprints) {
      if (now - data.firstSeen > FINGERPRINT_TTL_MS) recentFingerprints.delete(fingerprint)
    }
  }, 60_000)
  cleanupTimer.unref?.()
}

export function computeFingerprint(
  messages: Array<{ role: string; content: string }>,
): string {
  const systemMessage = messages.find((message) => message.role === 'system')
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')
  const seed = `${systemMessage?.content.slice(0, 200) ?? ''}|${lastUserMessage?.content.slice(0, 200) ?? ''}`
  return createHash('sha256').update(seed).digest('hex').slice(0, 12)
}

export function trackFingerprint(
  fingerprint: string,
): { isRetry: boolean; retryCount: number } {
  const existing = recentFingerprints.get(fingerprint)
  if (existing) {
    existing.retryCount += 1
    return { isRetry: true, retryCount: existing.retryCount }
  }
  recentFingerprints.set(fingerprint, { firstSeen: Date.now(), retryCount: 0 })
  return { isRetry: false, retryCount: 0 }
}
