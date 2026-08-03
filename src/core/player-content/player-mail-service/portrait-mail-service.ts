/**
 * Purpose: Create portrait mailbox messages and authorize portrait asset reads.
 * Owner: core:player-content
 * Responsibility: Portrait-mail message and asset projection only.
 */

import { getPlayerContentDatabase, PLAYER_MAIL_RETENTION_MS } from '../player-content-database'
import { accountKey, keyPlaceholders, resolveActor } from './mailbox-identity'
import type { PlayerMailboxIdentity } from './types'

export function createPortraitPlayerMail(input: {
  accountId: string
  recordId: string
  assetId: string
  now?: number
}): string {
  const now = input.now ?? Date.now()
  const id = crypto.randomUUID()
  const database = getPlayerContentDatabase()
  database.prepare(`
    INSERT INTO player_mail_messages(
      id, audience, kind, sender_key, sender_label, recipient_key, recipient_label,
      title, body, record_id, asset_id, created_at, expires_at
    ) VALUES (
      ?, 'direct', 'portrait', 'system:portrait', '人生画像', ?, '当前账号',
      '满分人生画像', '你走完的满分人生已留下一幅主角画像。', ?, ?, ?, ?
    )
    ON CONFLICT(recipient_key, record_id) WHERE kind = 'portrait' DO NOTHING
  `).run(
    id,
    accountKey(input.accountId),
    input.recordId,
    input.assetId,
    now,
    now + PLAYER_MAIL_RETENTION_MS,
  )
  const row = database.prepare(`
    SELECT id FROM player_mail_messages
    WHERE recipient_key = ? AND record_id = ? AND kind = 'portrait'
  `).get(accountKey(input.accountId), input.recordId) as { id: string }
  return row.id
}

export function readMailboxPortraitAsset(
  identity: PlayerMailboxIdentity,
  assetId: string,
  now = Date.now(),
): { mimeType: string; storageKey: string } | null {
  const actor = resolveActor(identity, now)
  const row = getPlayerContentDatabase().prepare(`
    SELECT assets.mime_type, assets.storage_key
    FROM player_mail_messages AS messages
    JOIN portrait_assets AS assets ON assets.id = messages.asset_id
    LEFT JOIN player_mail_recipient_states AS states
      ON states.message_id = messages.id AND states.recipient_key = messages.recipient_key
    WHERE messages.asset_id = ? AND messages.expires_at > ?
      AND messages.recipient_key IN (${keyPlaceholders(actor.keys)})
      AND states.deleted_at IS NULL
  `).get(assetId, now, ...actor.keys) as { mime_type: string; storage_key: string } | undefined
  return row ? { mimeType: row.mime_type, storageKey: row.storage_key } : null
}
