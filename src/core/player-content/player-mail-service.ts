import 'server-only'

import {
  ACCOUNT_MAX_SLOTS,
  CloudMythicTalentSchema,
  type CloudMythicTalent,
} from '@/core/account/account-contract'
import {
  getAccountDatabase,
  getAccountDatabasePath,
} from '@/core/account/account-database'
import { normalizeDiagnosticPlayerCode } from '@/core/logger/diagnostic-player-code'
import { normalizeDeviceProvenanceId } from '@/core/logger/device-provenance'

import type {
  PlayerMailCommandResult,
  PlayerMailFolder,
  PlayerMailMessageView,
  PlayerMailPage,
  PlayerMailRecipient,
} from './player-content-contract'
import {
  getPlayerContentDatabase,
  PLAYER_MAIL_RETENTION_MS,
} from './player-content-database'
import { PlayerContentServiceError } from './player-content-error'

const MAIL_PAGE_SIZE = 30
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

declare global {
  var __aiLifePlayerMailLastCleanupAt: number | undefined
}

export interface PlayerMailboxIdentity {
  accountId?: string
  username?: string
  diagnosticCode?: string
  deviceProvenanceId?: string
}

interface PlayerMailboxActor {
  accountId: string | null
  diagnosticCode: string | null
  primaryKey: string
  primaryLabel: string
  keys: string[]
}

interface StoredMailRow {
  id: string
  kind: 'message' | 'portrait'
  sender_label: string
  recipient_label: string | null
  title: string
  body: string
  record_id: string | null
  asset_id: string | null
  created_at: number
  expires_at: number
  read_at: number | null
  talent_status: 'pending' | 'accepted' | 'returned' | null
  talent_json: string | null
  accepted_at: number | null
  returned_at: number | null
}

interface StoredAttachmentRow {
  message_id: string
  talent_id: string
  talent_json: string
  sender_key: string
  status: 'pending' | 'accepted' | 'returned'
  accepted_by_key: string | null
  accepted_at: number | null
  returned_at: number | null
}

function accountKey(accountId: string): string {
  return `account:${accountId}`
}

function diagnosticKey(diagnosticCode: string): string {
  return `diagnostic:${diagnosticCode}`
}

function accountRevision(accountId: string | null): number | null {
  if (!accountId) return null
  const row = getAccountDatabase().prepare('SELECT revision FROM accounts WHERE id = ?')
    .get(accountId) as { revision: number } | undefined
  return row?.revision ?? null
}

function ensureAccountStoreAttached(): ReturnType<typeof getPlayerContentDatabase> {
  getAccountDatabase()
  const database = getPlayerContentDatabase()
  const attached = database.pragma('database_list') as Array<{ name: string }>
  if (!attached.some((entry) => entry.name === 'account_store')) {
    database.prepare('ATTACH DATABASE ? AS account_store').run(getAccountDatabasePath())
  }
  return database
}

/**
 * A diagnostic address is public, but mailbox access is bound to the server-issued
 * device provenance cookie. A developer-created placeholder is claimed on first use.
 */
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
      database.prepare(`
        UPDATE diagnostic_mailboxes SET last_seen_at = ? WHERE diagnostic_code = ?
      `).run(now, deviceOwner.diagnostic_code)
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

function resolveActor(identity: PlayerMailboxIdentity, now = Date.now()): PlayerMailboxActor {
  const accountId = identity.accountId?.trim() || null
  const username = identity.username?.trim() || null
  let diagnosticCode: string | null = null
  if (identity.diagnosticCode && identity.deviceProvenanceId) {
    diagnosticCode = bindDiagnosticMailboxIdentity(
      identity.diagnosticCode,
      identity.deviceProvenanceId,
      now,
    )
  }
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

function normalizeAccountAddress(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
}

function resolveRecipient(recipient: PlayerMailRecipient): { key: string, label: string } {
  if (recipient.type === 'account') {
    const row = getAccountDatabase().prepare(`
      SELECT id, username FROM accounts WHERE username_canonical = ?
    `).get(normalizeAccountAddress(recipient.value)) as { id: string, username: string } | undefined
    if (!row) throw new PlayerContentServiceError('收件账号不存在', 404, 'mail_recipient_not_found')
    return { key: accountKey(row.id), label: row.username }
  }
  const diagnosticCode = normalizeDiagnosticPlayerCode(recipient.value)
  if (!diagnosticCode) {
    throw new PlayerContentServiceError('诊断编号格式无效', 400, 'invalid_diagnostic_code')
  }
  const exists = getPlayerContentDatabase().prepare(`
    SELECT 1 FROM diagnostic_mailboxes WHERE diagnostic_code = ?
  `).get(diagnosticCode)
  if (!exists) throw new PlayerContentServiceError('收件诊断编号不存在', 404, 'mail_recipient_not_found')
  return { key: diagnosticKey(diagnosticCode), label: diagnosticCode }
}

function parseTalent(raw: string): CloudMythicTalent {
  try {
    return CloudMythicTalentSchema.parse(JSON.parse(raw))
  } catch {
    throw new PlayerContentServiceError('邮件中的轮回天赋无法读取', 500, 'mail_talent_corrupt')
  }
}

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

function decodeCursor(value: string | null): { createdAt: number, id: string } | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const source = parsed as { createdAt?: unknown, id?: unknown }
    if (!Number.isSafeInteger(source.createdAt) || typeof source.id !== 'string' || !source.id) return null
    return { createdAt: source.createdAt as number, id: source.id }
  } catch {
    return null
  }
}

function keyPlaceholders(keys: readonly string[]): string {
  return keys.map(() => '?').join(', ')
}

function readMailRows(
  actor: PlayerMailboxActor,
  folder: PlayerMailFolder,
  cursorValue: string | null,
  now: number,
): { rows: StoredMailRow[], nextCursor: string | null } {
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
    `).all(
      actor.primaryKey,
      now,
      ...actor.keys,
      ...cursorValues,
      MAIL_PAGE_SIZE + 1,
    ) as StoredMailRow[]
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
    `).all(
      now,
      ...actor.keys,
      ...cursorValues,
      MAIL_PAGE_SIZE + 1,
    ) as StoredMailRow[]
  }
  const hasMore = rows.length > MAIL_PAGE_SIZE
  if (hasMore) rows = rows.slice(0, MAIL_PAGE_SIZE)
  const last = rows.at(-1)
  return {
    rows,
    nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null,
  }
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

function getAccessibleMessage(
  actor: PlayerMailboxActor,
  messageId: string,
  now: number,
): { id: string, audience: 'direct' | 'broadcast', recipient_key: string | null } {
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

function stateRecipientKey(
  actor: PlayerMailboxActor,
  message: { audience: 'direct' | 'broadcast', recipient_key: string | null },
): string {
  return message.audience === 'broadcast' ? actor.primaryKey : message.recipient_key!
}

function readMessageById(messageId: string, stateKey: string): PlayerMailMessageView {
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

function addTalentToAttachedAccount(
  database: ReturnType<typeof getPlayerContentDatabase>,
  accountId: string,
  talent: CloudMythicTalent,
  now: number,
): boolean {
  const existing = database.prepare(`
    SELECT 1 FROM account_store.account_mythic_talents
    WHERE account_id = ? AND talent_id = ?
  `).get(accountId, talent.id)
  if (existing) return false
  const slots = database.prepare(`
    SELECT slot FROM account_store.account_mythic_talents
    WHERE account_id = ? ORDER BY slot
  `).all(accountId) as Array<{ slot: number }>
  const occupied = new Set(slots.map((row) => row.slot))
  let slot = 1
  while (occupied.has(slot) && slot <= ACCOUNT_MAX_SLOTS) slot += 1
  if (slot > ACCOUNT_MAX_SLOTS) return false
  database.prepare(`
    INSERT INTO account_store.account_mythic_talents(
      account_id, slot, talent_id, data_json, updated_at
    ) VALUES (?, ?, ?, ?, ?)
  `).run(accountId, slot, talent.id, JSON.stringify(talent), now)
  database.prepare(`
    UPDATE account_store.accounts SET revision = revision + 1, last_active_at = ? WHERE id = ?
  `).run(now, accountId)
  return true
}

function returnAttachment(
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
    SET owner_key = ?, talent_json = ?, updated_at = ?
    WHERE talent_id = ?
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
  let acceptedTalent: CloudMythicTalent | undefined
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
        SELECT 1 FROM account_store.account_mythic_talents
        WHERE account_id = ? AND talent_id = ?
      `).get(actor.accountId, acceptedTalent.id)
      if (!alreadyOwned) {
        throw new PlayerContentServiceError('轮回天赋栏位已满，请先腾出位置', 409, 'mythic_library_full')
      }
    }
    database.prepare(`
      UPDATE player_mail_talent_attachments
      SET status = 'accepted', accepted_by_key = ?, accepted_at = ?
      WHERE message_id = ? AND status = 'pending'
    `).run(actor.primaryKey, now, input.messageId)
    database.prepare(`
      UPDATE player_mail_talent_ownership
      SET owner_key = ?, updated_at = ? WHERE talent_id = ?
    `).run(actor.primaryKey, now, attachment.talent_id)
    const stateKey = stateRecipientKey(actor, getAccessibleMessage(actor, input.messageId, now))
    database.prepare(`
      INSERT INTO player_mail_recipient_states(message_id, recipient_key, read_at)
      VALUES (?, ?, ?)
      ON CONFLICT(message_id, recipient_key) DO UPDATE SET
        read_at = COALESCE(player_mail_recipient_states.read_at, excluded.read_at)
    `).run(input.messageId, stateKey, now)
  })()
  return {
    updated: true,
    acceptedTalent,
    accountRevision: accountRevision(actor.accountId),
  }
}

function currentStoredMessageForSender(
  actor: PlayerMailboxActor,
  messageId: string,
): PlayerMailMessageView | null {
  const row = getPlayerContentDatabase().prepare(`
    SELECT recipient_key FROM player_mail_messages WHERE id = ? AND sender_key = ?
  `).get(messageId, actor.primaryKey) as { recipient_key: string | null } | undefined
  if (!row) return null
  return readMessageById(messageId, row.recipient_key ?? actor.primaryKey)
}

export function sendPlayerMail(input: {
  identity: PlayerMailboxIdentity
  requestId: string
  recipient: PlayerMailRecipient
  title: string
  body: string
  talent?: CloudMythicTalent
  now?: number
}): PlayerMailCommandResult {
  const now = input.now ?? Date.now()
  const actor = resolveActor(input.identity, now)
  const duplicate = currentStoredMessageForSender(actor, input.requestId)
  if (duplicate) {
    return {
      updated: false,
      message: duplicate,
      accountRevision: accountRevision(actor.accountId),
    }
  }
  const recipient = resolveRecipient(input.recipient)
  const database = ensureAccountStoreAttached()
  let sentTalent: CloudMythicTalent | undefined
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
    const requestedTalent = CloudMythicTalentSchema.parse(input.talent)
    const existingOwnership = database.prepare(`
      SELECT owner_key, talent_json FROM player_mail_talent_ownership WHERE talent_id = ?
    `).get(requestedTalent.id) as { owner_key: string, talent_json: string } | undefined
    if (existingOwnership && existingOwnership.owner_key !== actor.primaryKey) {
      throw new PlayerContentServiceError('这份轮回天赋已属于其他玩家或正在托管中', 409, 'mail_talent_not_owned')
    }
    if (actor.accountId) {
      const stored = database.prepare(`
        SELECT data_json FROM account_store.account_mythic_talents
        WHERE account_id = ? AND talent_id = ?
      `).get(actor.accountId, requestedTalent.id) as { data_json: string } | undefined
      if (!stored) {
        throw new PlayerContentServiceError('这份轮回天赋不在你的库中', 409, 'mail_talent_not_owned')
      }
      sentTalent = parseTalent(stored.data_json)
      database.prepare(`
        DELETE FROM account_store.account_mythic_talents
        WHERE account_id = ? AND talent_id = ?
      `).run(actor.accountId, requestedTalent.id)
      database.prepare(`
        UPDATE account_store.accounts SET revision = revision + 1, last_active_at = ? WHERE id = ?
      `).run(now, actor.accountId)
    } else {
      const accountOwner = database.prepare(`
        SELECT account_id FROM account_store.account_mythic_talents WHERE talent_id = ? LIMIT 1
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
): { mimeType: string, storageKey: string } | null {
  const actor = resolveActor(identity, now)
  const row = getPlayerContentDatabase().prepare(`
    SELECT assets.mime_type, assets.storage_key
    FROM player_mail_messages AS messages
    JOIN portrait_assets AS assets ON assets.id = messages.asset_id
    LEFT JOIN player_mail_recipient_states AS states
      ON states.message_id = messages.id
     AND states.recipient_key = messages.recipient_key
    WHERE messages.asset_id = ? AND messages.expires_at > ?
      AND messages.recipient_key IN (${keyPlaceholders(actor.keys)})
      AND states.deleted_at IS NULL
  `).get(assetId, now, ...actor.keys) as { mime_type: string, storage_key: string } | undefined
  return row ? { mimeType: row.mime_type, storageKey: row.storage_key } : null
}

export function cleanupExpiredPlayerMail(now = Date.now()): { deletedMessages: number, returnedTalents: number } {
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

/**
 * Account sync remains client-driven for ordinary talents, while mail-touched
 * talents are reconciled against the server ownership registry.
 */
export function reconcileAccountMailTalents(input: {
  accountId: string
  talents: readonly CloudMythicTalent[]
  diagnosticCode?: string
  deviceProvenanceId?: string
  now?: number
}): CloudMythicTalent[] {
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
  `).all(
    accountKey(input.accountId),
    ...incomingTalentIds,
  ) as Array<{ talent_id: string, owner_key: string, talent_json: string, updated_at: number }>
  const registry = new Map(registryRows.map((row) => [row.talent_id, row]))
  const result: CloudMythicTalent[] = []
  const included = new Set<string>()
  for (const talent of input.talents) {
    const owner = registry.get(talent.id)?.owner_key
    if (owner && owner !== accountKey(input.accountId)) continue
    if (included.has(talent.id)) continue
    result.push(CloudMythicTalentSchema.parse(talent))
    included.add(talent.id)
  }
  for (const row of registryRows) {
    if (row.owner_key !== accountKey(input.accountId) || included.has(row.talent_id)) continue
    if (result.length >= ACCOUNT_MAX_SLOTS) break
    result.push(parseTalent(row.talent_json))
    included.add(row.talent_id)
  }
  return result
}
