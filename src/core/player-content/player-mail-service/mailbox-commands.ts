/**
 * Purpose: Execute player mailbox read, delete, talent-accept, and send commands.
 * Owner: core:player-content
 * Responsibility: Command transactions and responses only; identity, reads, and cleanup are delegated.
 */

import { ReincarnationTalentSchema, type CloudReincarnationTalent } from '@/core/account/account-contract'

import type { PlayerMailCommandResult, PlayerMailRecipient } from '../player-content-contract'
import { getPlayerContentDatabase, PLAYER_MAIL_RETENTION_MS } from '../player-content-database'
import { PlayerContentServiceError } from '../player-content-error'
import {
  accountRevision,
  ensureAccountStoreAttached,
  parseTalent,
  resolveActor,
  resolveRecipient,
} from './mailbox-identity'
import {
  currentStoredMessageForSender,
  getAccessibleMessage,
  readMessageById,
  stateRecipientKey,
} from './mailbox-read-service'
import { addTalentToAttachedAccount, returnAttachment } from './mailbox-talent-storage'
import type { PlayerMailboxIdentity, StoredAttachmentRow } from './types'

export function markPlayerMailboxMessageRead(input: {
  identity: PlayerMailboxIdentity
  messageId: string
  now?: number
}): PlayerMailCommandResult {
  const now = input.now ?? Date.now()
  const actor = resolveActor(input.identity, now)
  const message = getAccessibleMessage(actor, input.messageId, now)
  const stateKey = stateRecipientKey(actor, message)
  getPlayerContentDatabase().prepare(`
    INSERT INTO player_mail_recipient_states(message_id, recipient_key, read_at)
    VALUES (?, ?, ?)
    ON CONFLICT(message_id, recipient_key) DO UPDATE SET
      read_at = COALESCE(player_mail_recipient_states.read_at, excluded.read_at)
  `).run(input.messageId, stateKey, now)
  return {
    updated: true,
    message: readMessageById(input.messageId, stateKey),
    accountRevision: accountRevision(actor.accountId),
  }
}

export function deletePlayerMailboxMessage(input: {
  identity: PlayerMailboxIdentity
  messageId: string
  now?: number
}): PlayerMailCommandResult {
  const now = input.now ?? Date.now()
  const actor = resolveActor(input.identity, now)
  const message = getAccessibleMessage(actor, input.messageId, now)
  const stateKey = stateRecipientKey(actor, message)
  const database = ensureAccountStoreAttached()
  database.transaction(() => {
    const attachment = database.prepare(`
      SELECT message_id, talent_id, talent_json, sender_key, status,
        accepted_by_key, accepted_at, returned_at
      FROM player_mail_talent_attachments WHERE message_id = ?
    `).get(input.messageId) as StoredAttachmentRow | undefined
    if (attachment) returnAttachment(database, attachment, now)
    database.prepare(`
      INSERT INTO player_mail_recipient_states(message_id, recipient_key, read_at, deleted_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(message_id, recipient_key) DO UPDATE SET
        read_at = COALESCE(player_mail_recipient_states.read_at, excluded.read_at),
        deleted_at = COALESCE(player_mail_recipient_states.deleted_at, excluded.deleted_at)
    `).run(input.messageId, stateKey, now, now)
  })()
  return { updated: true, accountRevision: accountRevision(actor.accountId) }
}

export function acceptPlayerMailboxTalent(input: {
  identity: PlayerMailboxIdentity
  messageId: string
  now?: number
}): PlayerMailCommandResult {
  const now = input.now ?? Date.now()
  const actor = resolveActor(input.identity, now)
  getAccessibleMessage(actor, input.messageId, now)
  const database = ensureAccountStoreAttached()
  let acceptedTalent: CloudReincarnationTalent | undefined
  database.transaction(() => {
    const attachment = database.prepare(`
      SELECT message_id, talent_id, talent_json, sender_key, status,
        accepted_by_key, accepted_at, returned_at
      FROM player_mail_talent_attachments WHERE message_id = ?
    `).get(input.messageId) as StoredAttachmentRow | undefined
    if (!attachment) {
      throw new PlayerContentServiceError('这封邮件没有轮回天赋', 409, 'mail_has_no_talent')
    }
    acceptedTalent = parseTalent(attachment.talent_json)
    if (attachment.status === 'accepted' && attachment.accepted_by_key === actor.primaryKey) return
    if (attachment.status !== 'pending') {
      throw new PlayerContentServiceError('这份轮回天赋已不可领取', 409, 'mail_talent_unavailable')
    }
    if (actor.accountId && !addTalentToAttachedAccount(database, actor.accountId, acceptedTalent, now)) {
      const alreadyOwned = database.prepare(`
        SELECT 1 FROM account_store.account_reincarnation_talents
        WHERE account_id = ? AND talent_id = ?
      `).get(actor.accountId, acceptedTalent.id)
      if (!alreadyOwned) {
        throw new PlayerContentServiceError('轮回天赋栏位已满，请先腾出位置', 409, 'reincarnation_library_full')
      }
    }
    database.prepare(`
      UPDATE player_mail_talent_attachments
      SET status = 'accepted', accepted_by_key = ?, accepted_at = ?
      WHERE message_id = ? AND status = 'pending'
    `).run(actor.primaryKey, now, input.messageId)
    database.prepare(`
      UPDATE player_mail_talent_ownership SET owner_key = ?, updated_at = ? WHERE talent_id = ?
    `).run(actor.primaryKey, now, attachment.talent_id)
    const stateKey = stateRecipientKey(actor, getAccessibleMessage(actor, input.messageId, now))
    database.prepare(`
      INSERT INTO player_mail_recipient_states(message_id, recipient_key, read_at)
      VALUES (?, ?, ?)
      ON CONFLICT(message_id, recipient_key) DO UPDATE SET
        read_at = COALESCE(player_mail_recipient_states.read_at, excluded.read_at)
    `).run(input.messageId, stateKey, now)
  })()
  return { updated: true, acceptedTalent, accountRevision: accountRevision(actor.accountId) }
}

export function sendPlayerMail(input: {
  identity: PlayerMailboxIdentity
  requestId: string
  recipient: PlayerMailRecipient
  title: string
  body: string
  talent?: CloudReincarnationTalent
  now?: number
}): PlayerMailCommandResult {
  const now = input.now ?? Date.now()
  const actor = resolveActor(input.identity, now)
  const duplicate = currentStoredMessageForSender(actor, input.requestId)
  if (duplicate) {
    return { updated: false, message: duplicate, accountRevision: accountRevision(actor.accountId) }
  }
  const recipient = resolveRecipient(input.recipient)
  const database = ensureAccountStoreAttached()
  database.transaction(() => {
    database.prepare(`
      INSERT INTO player_mail_messages(
        id, audience, kind, sender_key, sender_label, recipient_key, recipient_label,
        title, body, record_id, asset_id, created_at, expires_at
      ) VALUES (?, 'direct', 'message', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
    `).run(
      input.requestId,
      actor.primaryKey,
      actor.primaryLabel,
      recipient.key,
      recipient.label,
      input.title,
      input.body,
      now,
      now + PLAYER_MAIL_RETENTION_MS,
    )
    if (!input.talent) return
    const requestedTalent = ReincarnationTalentSchema.parse(input.talent)
    const existingOwnership = database.prepare(`
      SELECT owner_key, talent_json FROM player_mail_talent_ownership WHERE talent_id = ?
    `).get(requestedTalent.id) as { owner_key: string; talent_json: string } | undefined
    if (existingOwnership && existingOwnership.owner_key !== actor.primaryKey) {
      throw new PlayerContentServiceError(
        '这份轮回天赋已属于其他玩家或正在托管中',
        409,
        'mail_talent_not_owned',
      )
    }
    let sentTalent: CloudReincarnationTalent
    if (actor.accountId) {
      const stored = database.prepare(`
        SELECT data_json FROM account_store.account_reincarnation_talents
        WHERE account_id = ? AND talent_id = ?
      `).get(actor.accountId, requestedTalent.id) as { data_json: string } | undefined
      if (!stored) {
        throw new PlayerContentServiceError('这份轮回天赋不在你的库中', 409, 'mail_talent_not_owned')
      }
      sentTalent = parseTalent(stored.data_json)
      database.prepare(`
        DELETE FROM account_store.account_reincarnation_talents WHERE account_id = ? AND talent_id = ?
      `).run(actor.accountId, requestedTalent.id)
      database.prepare(`
        UPDATE account_store.accounts SET revision = revision + 1, last_active_at = ? WHERE id = ?
      `).run(now, actor.accountId)
    } else {
      const accountOwner = database.prepare(`
        SELECT account_id FROM account_store.account_reincarnation_talents WHERE talent_id = ? LIMIT 1
      `).get(requestedTalent.id)
      if (accountOwner) {
        throw new PlayerContentServiceError('这份轮回天赋已属于其他玩家', 409, 'mail_talent_not_owned')
      }
      sentTalent = requestedTalent
    }
    const talentJson = JSON.stringify(sentTalent)
    database.prepare(`
      INSERT INTO player_mail_talent_ownership(
        talent_id, owner_key, talent_json, source_message_id, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(talent_id) DO UPDATE SET
        owner_key = excluded.owner_key,
        talent_json = excluded.talent_json,
        source_message_id = excluded.source_message_id,
        updated_at = excluded.updated_at
    `).run(sentTalent.id, `escrow:${input.requestId}`, talentJson, input.requestId, now)
    database.prepare(`
      INSERT INTO player_mail_talent_attachments(
        message_id, talent_id, talent_json, sender_key, status
      ) VALUES (?, ?, ?, ?, 'pending')
    `).run(input.requestId, sentTalent.id, talentJson, actor.primaryKey)
  })()
  return {
    updated: true,
    message: readMessageById(input.requestId, recipient.key),
    accountRevision: accountRevision(actor.accountId),
  }
}
