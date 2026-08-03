/**
 * Purpose: Return pending talent attachments and delete expired player mail on a bounded cadence.
 * Owner: core:player-content
 * Responsibility: Mail retention cleanup only; message commands and identity resolution remain separate.
 */

import { ensureAccountStoreAttached } from './mailbox-identity'
import { returnAttachment } from './mailbox-talent-storage'
import type { StoredAttachmentRow } from './types'

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

declare global {
  var __aiLifePlayerMailLastCleanupAt: number | undefined
}

export function cleanupExpiredPlayerMail(
  now = Date.now(),
): { deletedMessages: number; returnedTalents: number } {
  const database = ensureAccountStoreAttached()
  let returnedTalents = 0
  const result = database.transaction(() => {
    const attachments = database.prepare(`
      SELECT attachments.message_id, attachments.talent_id, attachments.talent_json,
        attachments.sender_key, attachments.status, attachments.accepted_by_key,
        attachments.accepted_at, attachments.returned_at
      FROM player_mail_talent_attachments AS attachments
      JOIN player_mail_messages AS messages ON messages.id = attachments.message_id
      WHERE messages.expires_at <= ? AND attachments.status = 'pending'
      ORDER BY messages.expires_at, messages.id
    `).all(now) as StoredAttachmentRow[]
    for (const attachment of attachments) {
      returnAttachment(database, attachment, now)
      returnedTalents += 1
    }
    return database.prepare('DELETE FROM player_mail_messages WHERE expires_at <= ?').run(now)
  })()
  globalThis.__aiLifePlayerMailLastCleanupAt = now
  return { deletedMessages: result.changes, returnedTalents }
}

export function cleanupExpiredPlayerMailIfNeeded(now = Date.now()): void {
  const last = globalThis.__aiLifePlayerMailLastCleanupAt ?? 0
  if (last > now - CLEANUP_INTERVAL_MS) return
  cleanupExpiredPlayerMail(now)
}
