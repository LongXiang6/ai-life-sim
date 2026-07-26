/**
 * @module device-provenance-identity.ts
 * @description 生成并登记稳定的明文设备来源编号
 * @mod core
 */

import 'server-only'

import { randomUUID } from 'node:crypto'

import {
  normalizeDeviceProvenanceId,
} from './device-provenance'
import { reserveDeviceProvenanceIdentity } from './server-log-store'

export async function ensureDeviceProvenanceId(
  existingId?: string,
): Promise<string | null> {
  const normalizedExisting = normalizeDeviceProvenanceId(existingId)
  if (normalizedExisting) {
    const result = await reserveDeviceProvenanceIdentity(normalizedExisting)
    return result === 'failed' ? null : normalizedExisting
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = `DEV-${randomUUID().replaceAll('-', '').toUpperCase()}`
    const result = await reserveDeviceProvenanceIdentity(candidate)
    if (result === 'created') return candidate
    if (result === 'failed') return null
  }
  return null
}
