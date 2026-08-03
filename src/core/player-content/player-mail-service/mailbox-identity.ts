/**
 * Purpose: Resolve trusted mailbox actors, public addresses, and the attached account store.
 * Owner: core:player-content
 * Responsibility: Mailbox identity and address resolution only; message operations remain separate.
 */

import { CloudMythicTalentSchema, type CloudMythicTalent } from '@/core/account/account-contract'
import { getAccountDatabase, getAccountDatabasePath } from '@/core/account/account-database'
import { normalizeDiagnosticPlayerCode } from '@/core/logger/diagnostic-player-code'
import { normalizeDeviceProvenanceId } from '@/core/logger/device-provenance'

import type { PlayerMailRecipient } from '../player-content-contract'
import { getPlayerContentDatabase } from '../player-content-database'
import { PlayerContentServiceError } from '../player-content-error'
import type { PlayerMailboxActor, PlayerMailboxIdentity } from './types'

export function accountKey(accountId: string): string {
  return `account:${accountId}`
}

export function diagnosticKey(diagnosticCode: string): string {
  return `diagnostic:${diagnosticCode}`
}

export function accountRevision(accountId: string | null): number | null {
  if (!accountId) return null
  const row = getAccountDatabase().prepare('SELECT revision FROM accounts WHERE id = ?')
    .get(accountId) as { revision: number } | undefined
  return row?.revision ?? null
}

export function ensureAccountStoreAttached(): ReturnType<typeof getPlayerContentDatabase> {
  getAccountDatabase()
  const database = getPlayerContentDatabase()
  const attached = database.pragma('database_list') as Array<{ name: string }>
  if (!attached.some((entry) => entry.name === 'account_store')) {
    database.prepare('ATTACH DATABASE ? AS account_store').run(getAccountDatabasePath())
  }
  return database
}

export function bindDiagnosticMailboxIdentity(
  diagnosticCodeInput: string,
  deviceProvenanceIdInput: string,
  now = Date.now(),
): string | null {
  const diagnosticCode = normalizeDiagnosticPlayerCode(diagnosticCodeInput)
  const deviceProvenanceId = normalizeDeviceProvenanceId(deviceProvenanceIdInput)
  if (!diagnosticCode || !deviceProvenanceId) return null
  const database = getPlayerContentDatabase()
  return database.transaction(() => {
    const deviceOwner = database.prepare(`
      SELECT diagnostic_code FROM diagnostic_mailboxes WHERE device_provenance_id = ?
    `).get(deviceProvenanceId) as { diagnostic_code: string } | undefined
    if (deviceOwner) {
      database.prepare('UPDATE diagnostic_mailboxes SET last_seen_at = ? WHERE diagnostic_code = ?')
        .run(now, deviceOwner.diagnostic_code)
      return deviceOwner.diagnostic_code
    }
    const codeOwner = database.prepare(`
      SELECT device_provenance_id FROM diagnostic_mailboxes WHERE diagnostic_code = ?
    `).get(diagnosticCode) as { device_provenance_id: string | null } | undefined
    if (codeOwner?.device_provenance_id && codeOwner.device_provenance_id !== deviceProvenanceId) {
      return null
    }
    database.prepare(`
      INSERT INTO diagnostic_mailboxes(
        diagnostic_code, device_provenance_id, created_at, last_seen_at
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(diagnostic_code) DO UPDATE SET
        device_provenance_id = excluded.device_provenance_id,
        last_seen_at = excluded.last_seen_at
    `).run(diagnosticCode, deviceProvenanceId, now, now)
    return diagnosticCode
  })()
}

export function reserveDiagnosticMailboxAddress(
  diagnosticCodeInput: string,
  now = Date.now(),
): string {
  const diagnosticCode = normalizeDiagnosticPlayerCode(diagnosticCodeInput)
  if (!diagnosticCode) {
    throw new PlayerContentServiceError('诊断编号格式无效', 400, 'invalid_diagnostic_code')
  }
  getPlayerContentDatabase().prepare(`
    INSERT INTO diagnostic_mailboxes(
      diagnostic_code, device_provenance_id, created_at, last_seen_at
    ) VALUES (?, NULL, ?, ?)
    ON CONFLICT(diagnostic_code) DO NOTHING
  `).run(diagnosticCode, now, now)
  return diagnosticCode
}

export function resolveActor(
  identity: PlayerMailboxIdentity,
  now = Date.now(),
): PlayerMailboxActor {
  const accountId = identity.accountId?.trim() || null
  const username = identity.username?.trim() || null
  const diagnosticCode = identity.diagnosticCode && identity.deviceProvenanceId
    ? bindDiagnosticMailboxIdentity(identity.diagnosticCode, identity.deviceProvenanceId, now)
    : null
  const keys = [
    ...(accountId ? [accountKey(accountId)] : []),
    ...(diagnosticCode ? [diagnosticKey(diagnosticCode)] : []),
  ]
  if (keys.length === 0) {
    throw new PlayerContentServiceError('暂时无法确认邮箱身份', 401, 'mailbox_identity_required')
  }
  return {
    accountId,
    diagnosticCode,
    primaryKey: accountId ? accountKey(accountId) : diagnosticKey(diagnosticCode!),
    primaryLabel: accountId ? (username || '已登录玩家') : diagnosticCode!,
    keys,
  }
}

export function resolveRecipient(recipient: PlayerMailRecipient): { key: string; label: string } {
  if (recipient.type === 'account') {
    const canonical = recipient.value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
    const row = getAccountDatabase().prepare(`
      SELECT id, username FROM accounts WHERE username_canonical = ?
    `).get(canonical) as { id: string; username: string } | undefined
    if (!row) throw new PlayerContentServiceError('收件账号不存在', 404, 'mail_recipient_not_found')
    return { key: accountKey(row.id), label: row.username }
  }
  const diagnosticCode = normalizeDiagnosticPlayerCode(recipient.value)
  if (!diagnosticCode) {
    throw new PlayerContentServiceError('诊断编号格式无效', 400, 'invalid_diagnostic_code')
  }
  const exists = getPlayerContentDatabase().prepare(
    'SELECT 1 FROM diagnostic_mailboxes WHERE diagnostic_code = ?',
  ).get(diagnosticCode)
  if (!exists) throw new PlayerContentServiceError('收件诊断编号不存在', 404, 'mail_recipient_not_found')
  return { key: diagnosticKey(diagnosticCode), label: diagnosticCode }
}

export function parseTalent(raw: string): CloudMythicTalent {
  try {
    return CloudMythicTalentSchema.parse(JSON.parse(raw))
  } catch {
    throw new PlayerContentServiceError('邮件中的轮回天赋无法读取', 500, 'mail_talent_corrupt')
  }
}

export function keyPlaceholders(values: readonly unknown[]): string {
  return values.map(() => '?').join(', ')
}
