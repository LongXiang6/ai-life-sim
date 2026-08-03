/**
 * Purpose: Reserve unique diagnostic and device provenance identifiers in the log database.
 * Owner: core:logger
 * Responsibility: Identity reservation only; identifier generation remains with its source systems.
 */

import { getServerLogDatabase } from './database'

export type DiagnosticIdentityReservationResult = 'created' | 'exists' | 'failed'

async function reserveIdentity(
  table: 'diagnostic_identities' | 'device_provenance_identities',
  column: 'code' | 'id',
  value: string,
  issuedAt: number,
  errorMessage: string,
): Promise<DiagnosticIdentityReservationResult> {
  try {
    const result = getServerLogDatabase().prepare(`
      INSERT OR IGNORE INTO ${table}(${column}, issued_at, format_version)
      VALUES (?, ?, 1)
    `).run(value, issuedAt)
    return result.changes === 1 ? 'created' : 'exists'
  } catch (error) {
    console.error(errorMessage, error)
    return 'failed'
  }
}

export function reserveDiagnosticIdentity(
  code: string,
  issuedAt = Date.now(),
): Promise<DiagnosticIdentityReservationResult> {
  return reserveIdentity(
    'diagnostic_identities',
    'code',
    code,
    issuedAt,
    '[server-log-store] 诊断编号占用失败',
  )
}

export function reserveDeviceProvenanceIdentity(
  id: string,
  issuedAt = Date.now(),
): Promise<DiagnosticIdentityReservationResult> {
  return reserveIdentity(
    'device_provenance_identities',
    'id',
    id,
    issuedAt,
    '[server-log-store] 设备来源编号占用失败',
  )
}
