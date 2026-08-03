/**
 * Purpose: Read mailbox pages and individual accessible message projections.
 * Owner: core:player-content
 * Responsibility: Pagination, unread counts, access checks, and public message mapping only.
 */

import type {
  PlayerMailFolder,
  PlayerMailMessageView,
  PlayerMailPage,
} from '../player-content-contract'
import { getPlayerContentDatabase } from '../player-content-database'
import { PlayerContentServiceError } from '../player-content-error'
import { cleanupExpiredPlayerMailIfNeeded } from './mailbox-cleanup'
import {
  accountRevision,
  keyPlaceholders,
  parseTalent,
  resolveActor,
} from './mailbox-identity'
import type { PlayerMailboxActor, PlayerMailboxIdentity, StoredMailRow } from './types'

const MAIL_PAGE_SIZE = 30

function mapMailRow(row: StoredMailRow): PlayerMailMessageView {
  return {
    id: row.id,
    kind: row.kind,
    senderLabel: row.sender_label,
    recipientLabel: row.recipient_label ?? '全体用户',
    title: row.title,
    body: row.body,
    recordId: row.record_id,
    assetId: row.asset_id,
    assetUrl: row.asset_id
      ? `/api/account/mailbox/assets/${encodeURIComponent(row.asset_id)}`
      : null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    readAt: row.read_at,
    talent: row.talent_json && row.talent_status ? {
      status: row.talent_status,
      talent: parseTalent(row.talent_json),
      acceptedAt: row.accepted_at,
      returnedAt: row.returned_at,
    } : null,
  }
}

function encodeCursor(createdAt: number, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt, id }), 'utf8').toString('base64url')
}

function decodeCursor(value: string | null): { createdAt: number; id: string } | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const source = parsed as { createdAt?: unknown; id?: unknown }
    if (!Number.isSafeInteger(source.createdAt) || typeof source.id !== 'string' || !source.id) return null
    return { createdAt: source.createdAt as number, id: source.id }
  } catch {
    return null
  }
}

function readMailRows(
  actor: PlayerMailboxActor,
  folder: PlayerMailFolder,
  cursorValue: string | null,
  now: number,
): { rows: StoredMailRow[]; nextCursor: string | null } {
  const database = getPlayerContentDatabase()
  const cursor = decodeCursor(cursorValue)
  if (cursorValue && !cursor) {
    throw new PlayerContentServiceError('邮件分页位置无效', 400, 'invalid_mail_cursor')
  }
  const cursorClause = cursor
    ? 'AND (messages.created_at < ? OR (messages.created_at = ? AND messages.id > ?))'
    : ''
  const cursorValues = cursor ? [cursor.createdAt, cursor.createdAt, cursor.id] : []
  const commonSelect = `
    SELECT messages.id, messages.kind, messages.sender_label, messages.recipient_label,
      messages.title, messages.body, messages.record_id, messages.asset_id,
      messages.created_at, messages.expires_at, states.read_at,
      attachments.status AS talent_status, attachments.talent_json,
      attachments.accepted_at, attachments.returned_at
    FROM player_mail_messages AS messages
  `
  let rows: StoredMailRow[]
  if (folder === 'inbox') {
    rows = database.prepare(`${commonSelect}
      LEFT JOIN player_mail_recipient_states AS states
        ON states.message_id = messages.id
       AND states.recipient_key = CASE
         WHEN messages.audience = 'broadcast' THEN ? ELSE messages.recipient_key END
      LEFT JOIN player_mail_talent_attachments AS attachments
        ON attachments.message_id = messages.id
      WHERE messages.expires_at > ?
        AND (messages.audience = 'broadcast' OR messages.recipient_key IN (${keyPlaceholders(actor.keys)}))
        AND states.deleted_at IS NULL
        ${cursorClause}
      ORDER BY messages.created_at DESC, messages.id ASC
      LIMIT ?
    `).all(actor.primaryKey, now, ...actor.keys, ...cursorValues, MAIL_PAGE_SIZE + 1) as StoredMailRow[]
  } else {
    rows = database.prepare(`${commonSelect}
      LEFT JOIN player_mail_recipient_states AS states
        ON states.message_id = messages.id AND states.recipient_key = messages.recipient_key
      LEFT JOIN player_mail_talent_attachments AS attachments
        ON attachments.message_id = messages.id
      WHERE messages.expires_at > ?
        AND messages.audience = 'direct'
        AND messages.sender_key IN (${keyPlaceholders(actor.keys)})
        ${cursorClause}
      ORDER BY messages.created_at DESC, messages.id ASC
      LIMIT ?
    `).all(now, ...actor.keys, ...cursorValues, MAIL_PAGE_SIZE + 1) as StoredMailRow[]
  }
  const hasMore = rows.length > MAIL_PAGE_SIZE
  if (hasMore) rows = rows.slice(0, MAIL_PAGE_SIZE)
  const last = rows.at(-1)
  return { rows, nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null }
}

function countUnread(actor: PlayerMailboxActor, now: number): number {
  const row = getPlayerContentDatabase().prepare(`
    SELECT COUNT(*) AS count
    FROM player_mail_messages AS messages
    LEFT JOIN player_mail_recipient_states AS states
      ON states.message_id = messages.id
     AND states.recipient_key = CASE
       WHEN messages.audience = 'broadcast' THEN ? ELSE messages.recipient_key END
    WHERE messages.expires_at > ?
      AND (messages.audience = 'broadcast' OR messages.recipient_key IN (${keyPlaceholders(actor.keys)}))
      AND states.deleted_at IS NULL
      AND states.read_at IS NULL
  `).get(actor.primaryKey, now, ...actor.keys) as { count: number }
  return row.count
}

function talentReconciliation(actor: PlayerMailboxActor): PlayerMailPage['talentReconciliation'] {
  const database = getPlayerContentDatabase()
  const removed = database.prepare(`
    SELECT DISTINCT talent_id FROM player_mail_talent_attachments
    WHERE sender_key IN (${keyPlaceholders(actor.keys)}) AND status IN ('pending', 'accepted')
    ORDER BY talent_id
  `).all(...actor.keys) as Array<{ talent_id: string }>
  const owned = database.prepare(`
    SELECT talent_json FROM player_mail_talent_ownership
    WHERE owner_key IN (${keyPlaceholders(actor.keys)})
    ORDER BY updated_at ASC, talent_id ASC
  `).all(...actor.keys) as Array<{ talent_json: string }>
  return {
    removeTalentIds: removed.map((row) => row.talent_id),
    ownedTalents: owned.map((row) => parseTalent(row.talent_json)),
  }
}

export function readPlayerMailboxPage(input: {
  identity: PlayerMailboxIdentity
  folder: PlayerMailFolder
  cursor?: string | null
  now?: number
}): PlayerMailPage {
  const now = input.now ?? Date.now()
  cleanupExpiredPlayerMailIfNeeded(now)
  const actor = resolveActor(input.identity, now)
  const page = readMailRows(actor, input.folder, input.cursor ?? null, now)
  return {
    messages: page.rows.map(mapMailRow),
    nextCursor: page.nextCursor,
    unreadCount: countUnread(actor, now),
    diagnosticCode: actor.diagnosticCode ?? '',
    accountRevision: accountRevision(actor.accountId),
    talentReconciliation: talentReconciliation(actor),
  }
}

export function getAccessibleMessage(
  actor: PlayerMailboxActor,
  messageId: string,
  now: number,
): { id: string; audience: 'direct' | 'broadcast'; recipient_key: string | null } {
  const row = getPlayerContentDatabase().prepare(`
    SELECT id, audience, recipient_key FROM player_mail_messages
    WHERE id = ? AND expires_at > ?
      AND (audience = 'broadcast' OR recipient_key IN (${keyPlaceholders(actor.keys)}))
  `).get(messageId, now, ...actor.keys) as {
    id: string
    audience: 'direct' | 'broadcast'
    recipient_key: string | null
  } | undefined
  if (!row) throw new PlayerContentServiceError('邮件不存在或已到期', 404, 'mail_not_found')
  return row
}

export function stateRecipientKey(
  actor: PlayerMailboxActor,
  message: { audience: 'direct' | 'broadcast'; recipient_key: string | null },
): string {
  return message.audience === 'broadcast' ? actor.primaryKey : message.recipient_key!
}

export function readMessageById(messageId: string, stateKey: string): PlayerMailMessageView {
  const row = getPlayerContentDatabase().prepare(`
    SELECT messages.id, messages.kind, messages.sender_label, messages.recipient_label,
      messages.title, messages.body, messages.record_id, messages.asset_id,
      messages.created_at, messages.expires_at, states.read_at,
      attachments.status AS talent_status, attachments.talent_json,
      attachments.accepted_at, attachments.returned_at
    FROM player_mail_messages AS messages
    LEFT JOIN player_mail_recipient_states AS states
      ON states.message_id = messages.id AND states.recipient_key = ?
    LEFT JOIN player_mail_talent_attachments AS attachments
      ON attachments.message_id = messages.id
    WHERE messages.id = ?
  `).get(stateKey, messageId) as StoredMailRow | undefined
  if (!row) throw new PlayerContentServiceError('邮件不存在', 404, 'mail_not_found')
  return mapMailRow(row)
}

export function currentStoredMessageForSender(
  actor: PlayerMailboxActor,
  messageId: string,
): PlayerMailMessageView | null {
  const row = getPlayerContentDatabase().prepare(`
    SELECT recipient_key FROM player_mail_messages WHERE id = ? AND sender_key = ?
  `).get(messageId, actor.primaryKey) as { recipient_key: string | null } | undefined
  return row ? readMessageById(messageId, row.recipient_key ?? actor.primaryKey) : null
}
