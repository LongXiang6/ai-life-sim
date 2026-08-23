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
import { getAccountDatabase } from '@/core/account/account-database'
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

function rewardClaimStatus(
  row: StoredMailRow,
  actor: PlayerMailboxActor,
  now: number,
): NonNullable<PlayerMailMessageView['reward']>['claimStatus'] {
  if (!row.reward_id || !row.reward_eligibility_mode || row.reward_starts_at === null || row.reward_ends_at === null) {
    throw new PlayerContentServiceError('礼包奖励数据不完整', 500, 'mail_reward_corrupt')
  }
  if (!actor.accountId) return 'login-required'
  if (row.reward_claimed_at !== null) return 'claimed'
  if (now < row.reward_starts_at) return 'not-started'
  if (now >= row.reward_ends_at) return 'expired'
  const account = getAccountDatabase().prepare(`
    SELECT created_at, last_active_at FROM accounts WHERE id = ?
  `).get(actor.accountId) as { created_at: number; last_active_at: number } | undefined
  if (!account) return 'login-required'
  if (row.reward_eligibility_mode === 'login-window') {
    if (account.last_active_at < row.reward_starts_at || account.last_active_at > now) return 'not-eligible'
  } else if (account.created_at > row.reward_ends_at) {
    return 'not-eligible'
  }
  return 'available'
}

function mapMailRow(row: StoredMailRow, actor: PlayerMailboxActor, now: number): PlayerMailMessageView {
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
    reward: row.reward_id && row.reward_talent_json && row.reward_eligibility_mode
      && row.reward_starts_at !== null && row.reward_ends_at !== null
      ? {
          rewardId: row.reward_id,
          eligibilityMode: row.reward_eligibility_mode,
          startsAt: row.reward_starts_at,
          endsAt: row.reward_ends_at,
          talent: parseTalent(row.reward_talent_json),
          claimStatus: rewardClaimStatus(row, actor, now),
          claimedAt: row.reward_claimed_at,
        }
      : null,
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
      attachments.accepted_at, attachments.returned_at,
      reward_campaigns.reward_id,
      reward_campaigns.talent_id AS reward_talent_id,
      reward_campaigns.talent_json AS reward_talent_json,
      reward_campaigns.eligibility_mode AS reward_eligibility_mode,
      reward_campaigns.starts_at AS reward_starts_at,
      reward_campaigns.ends_at AS reward_ends_at,
      reward_claims.claimed_at AS reward_claimed_at,
      reward_targets.recipient_kind AS reward_target_kind
    FROM player_mail_messages AS messages
    LEFT JOIN player_mail_reward_targets AS reward_targets
      ON reward_targets.message_id = messages.id
    LEFT JOIN player_mail_reward_campaigns AS reward_campaigns
      ON reward_campaigns.reward_id = reward_targets.reward_id
    LEFT JOIN player_mail_reward_claims AS reward_claims
      ON reward_claims.reward_id = reward_campaigns.reward_id AND reward_claims.account_id = ?
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
        AND (? IS NOT NULL OR reward_campaigns.reward_id IS NULL)
        ${cursorClause}
      ORDER BY messages.created_at DESC, messages.id ASC
      LIMIT ?
    `).all(actor.accountId, actor.primaryKey, now, ...actor.keys, actor.accountId, ...cursorValues, MAIL_PAGE_SIZE + 1) as StoredMailRow[]
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
    `).all(actor.accountId, now, ...actor.keys, ...cursorValues, MAIL_PAGE_SIZE + 1) as StoredMailRow[]
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
    LEFT JOIN player_mail_reward_targets AS reward_targets
      ON reward_targets.message_id = messages.id
    LEFT JOIN player_mail_reward_campaigns AS reward_campaigns
      ON reward_campaigns.reward_id = reward_targets.reward_id
    LEFT JOIN player_mail_recipient_states AS states
      ON states.message_id = messages.id
     AND states.recipient_key = CASE
       WHEN messages.audience = 'broadcast' THEN ? ELSE messages.recipient_key END
    WHERE messages.expires_at > ?
      AND (messages.audience = 'broadcast' OR messages.recipient_key IN (${keyPlaceholders(actor.keys)}))
      AND states.deleted_at IS NULL
      AND states.read_at IS NULL
      AND (? IS NOT NULL OR reward_campaigns.reward_id IS NULL)
  `).get(actor.primaryKey, now, ...actor.keys, actor.accountId) as { count: number }
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
    messages: page.rows.map((row) => mapMailRow(row, actor, now)),
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
      AND (? IS NOT NULL OR NOT EXISTS (
        SELECT 1 FROM player_mail_reward_targets AS reward_targets
        WHERE reward_targets.message_id = player_mail_messages.id
      ))
  `).get(messageId, now, ...actor.keys, actor.accountId) as {
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
      attachments.accepted_at, attachments.returned_at,
      reward_campaigns.reward_id,
      reward_campaigns.talent_id AS reward_talent_id,
      reward_campaigns.talent_json AS reward_talent_json,
      reward_campaigns.eligibility_mode AS reward_eligibility_mode,
      reward_campaigns.starts_at AS reward_starts_at,
      reward_campaigns.ends_at AS reward_ends_at,
      reward_claims.claimed_at AS reward_claimed_at,
      reward_targets.recipient_kind AS reward_target_kind
    FROM player_mail_messages AS messages
    LEFT JOIN player_mail_recipient_states AS states
      ON states.message_id = messages.id AND states.recipient_key = ?
    LEFT JOIN player_mail_talent_attachments AS attachments
      ON attachments.message_id = messages.id
    LEFT JOIN player_mail_reward_targets AS reward_targets
      ON reward_targets.message_id = messages.id
    LEFT JOIN player_mail_reward_campaigns AS reward_campaigns
      ON reward_campaigns.reward_id = reward_targets.reward_id
    LEFT JOIN player_mail_reward_claims AS reward_claims
      ON reward_claims.reward_id = reward_campaigns.reward_id
     AND reward_claims.account_id = CASE
       WHEN ? LIKE 'account:%' THEN substr(?, 9) ELSE NULL END
    WHERE messages.id = ?
  `).get(stateKey, stateKey, stateKey, messageId) as StoredMailRow | undefined
  if (!row) throw new PlayerContentServiceError('邮件不存在', 404, 'mail_not_found')
  const actor: PlayerMailboxActor = stateKey.startsWith('account:')
    ? {
        accountId: stateKey.slice('account:'.length),
        diagnosticCode: null,
        primaryKey: stateKey,
        primaryLabel: '已登录玩家',
        keys: [stateKey],
      }
    : {
        accountId: null,
        diagnosticCode: stateKey.slice('diagnostic:'.length),
        primaryKey: stateKey,
        primaryLabel: stateKey.slice('diagnostic:'.length),
        keys: [stateKey],
      }
  return mapMailRow(row, actor, Date.now())
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
