/**
 * Purpose: Own mailbox talent escrow, account attachment, return, and sync reconciliation state.
 * Owner: core:player-content
 * Responsibility: Talent ownership persistence only; message access and command responses stay separate.
 */

import {
  REINCARNATION_LIBRARY_MAX_SLOTS,
  ReincarnationTalentSchema,
  type CloudReincarnationTalent,
} from '@/core/account/account-contract'

import { getPlayerContentDatabase } from '../player-content-database'
import {
  accountKey,
  bindDiagnosticMailboxIdentity,
  diagnosticKey,
  keyPlaceholders,
  parseTalent,
} from './mailbox-identity'
import type { StoredAttachmentRow } from './types'

export function addTalentToAttachedAccount(
  database: ReturnType<typeof getPlayerContentDatabase>,
  accountId: string,
  talent: CloudReincarnationTalent,
  now: number,
): boolean {
  const existing = database.prepare(`
    SELECT 1 FROM account_store.account_reincarnation_talents
    WHERE account_id = ? AND talent_id = ?
  `).get(accountId, talent.id)
  if (existing) return false
  const slots = database.prepare(`
    SELECT slot FROM account_store.account_reincarnation_talents
    WHERE account_id = ? ORDER BY slot
  `).all(accountId) as Array<{ slot: number }>
  const occupied = new Set(slots.map((row) => row.slot))
  let slot = 1
  while (occupied.has(slot) && slot <= REINCARNATION_LIBRARY_MAX_SLOTS) slot += 1
  if (slot > REINCARNATION_LIBRARY_MAX_SLOTS) return false
  database.prepare(`
    INSERT INTO account_store.account_reincarnation_talents(
      account_id, slot, talent_id, data_json, updated_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(accountId, slot, talent.id, JSON.stringify(talent), now)
  database.prepare(`
    UPDATE account_store.accounts SET revision = revision + 1, last_active_at = ? WHERE id = ?
  `).run(now, accountId)
  return true
}

export function returnAttachment(
  database: ReturnType<typeof getPlayerContentDatabase>,
  attachment: StoredAttachmentRow,
  now: number,
): void {
  if (attachment.status !== 'pending') return
  const talent = parseTalent(attachment.talent_json)
  database.prepare(`
    UPDATE player_mail_talent_attachments
    SET status = 'returned', returned_at = ?
    WHERE message_id = ? AND status = 'pending'
  `).run(now, attachment.message_id)
  database.prepare(`
    UPDATE player_mail_talent_ownership
    SET owner_key = ?, talent_json = ?, updated_at = ? WHERE talent_id = ?
  `).run(attachment.sender_key, attachment.talent_json, now, attachment.talent_id)
  if (attachment.sender_key.startsWith('account:')) {
    addTalentToAttachedAccount(
      database,
      attachment.sender_key.slice('account:'.length),
      talent,
      now,
    )
  }
}

export function reconcileAccountMailTalents(input: {
  accountId: string
  talents: readonly CloudReincarnationTalent[]
  diagnosticCode?: string
  deviceProvenanceId?: string
  now?: number
}): CloudReincarnationTalent[] {
  const now = input.now ?? Date.now()
  const database = getPlayerContentDatabase()
  const verifiedDiagnostic = input.diagnosticCode && input.deviceProvenanceId
    ? bindDiagnosticMailboxIdentity(input.diagnosticCode, input.deviceProvenanceId, now)
    : null
  if (verifiedDiagnostic) {
    const ids = input.talents.map((talent) => talent.id)
    if (ids.length > 0) {
      database.prepare(`
        UPDATE player_mail_talent_ownership
        SET owner_key = ?, updated_at = ?
        WHERE owner_key = ? AND talent_id IN (${keyPlaceholders(ids)})
      `).run(accountKey(input.accountId), now, diagnosticKey(verifiedDiagnostic), ...ids)
    }
  }
  const incomingTalentIds = input.talents.map((talent) => talent.id)
  const registryRows = database.prepare(`
    SELECT talent_id, owner_key, talent_json, updated_at
    FROM player_mail_talent_ownership
    WHERE owner_key = ?
      ${incomingTalentIds.length > 0 ? `OR talent_id IN (${keyPlaceholders(incomingTalentIds)})` : ''}
    ORDER BY updated_at ASC, talent_id ASC
  `).all(accountKey(input.accountId), ...incomingTalentIds) as Array<{
    talent_id: string
    owner_key: string
    talent_json: string
    updated_at: number
  }>
  const registry = new Map(registryRows.map((row) => [row.talent_id, row]))
  const result: CloudReincarnationTalent[] = []
  const included = new Set<string>()
  for (const talent of input.talents) {
    const owner = registry.get(talent.id)?.owner_key
    if (owner && owner !== accountKey(input.accountId)) continue
    if (included.has(talent.id)) continue
    result.push(ReincarnationTalentSchema.parse(talent))
    included.add(talent.id)
  }
  for (const row of registryRows) {
    if (row.owner_key !== accountKey(input.accountId) || included.has(row.talent_id)) continue
    if (result.length >= REINCARNATION_LIBRARY_MAX_SLOTS) break
    result.push(parseTalent(row.talent_json))
    included.add(row.talent_id)
  }
  return result
}
