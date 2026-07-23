import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'

import type { CloudGameRecord } from '@/core/account/account-contract'

import {
  CLOUD_MANUAL_SAVE_MAX_COMPRESSED_BYTES,
  CLOUD_MANUAL_SAVE_MAX_UNCOMPRESSED_BYTES,
  CloudGameRecordLeaderboardSchema,
  CloudManualSaveMetadataSchema,
  CloudManualSaveWriteSchema,
  CloudGameSavePayloadSchema,
  isLeaderboardEligible,
  type CloudManualSaveSummary,
  type CloudManualSaveWrite,
  type LeaderboardEntry,
  type LeaderboardProjection,
  type PlayerMailMessage,
} from './player-content-contract'
import { getPlayerContentDatabase } from './player-content-database'
import { removePortraitAssets } from './portrait-asset-store'

interface StoredCloudSaveRow {
  slot: number
  payload_schema_version: number
  name: string
  world_name: string
  character_name: string
  total_rounds: number
  game_version: string
  saved_at: number
  payload_gzip: Buffer
  compressed_bytes: number
  uncompressed_bytes: number
  updated_at: number
}

export class PlayerContentServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'PlayerContentServiceError'
  }
}

function cloudSaveSummary(row: Omit<StoredCloudSaveRow, 'payload_gzip'>): CloudManualSaveSummary {
  const metadata = CloudManualSaveMetadataSchema.parse({
    schemaVersion: row.payload_schema_version,
    slot: row.slot,
    name: row.name,
    worldName: row.world_name,
    characterName: row.character_name,
    totalRounds: row.total_rounds,
    gameVersion: row.game_version,
    savedAt: row.saved_at,
  })
  return {
    ...metadata,
    compressedBytes: row.compressed_bytes,
    uncompressedBytes: row.uncompressed_bytes,
    updatedAt: row.updated_at,
  }
}

export function saveCloudManualSave(accountId: string, input: CloudManualSaveWrite, now = Date.now()): CloudManualSaveSummary {
  const parsed = CloudManualSaveWriteSchema.parse(input)
  const rawPayload = Buffer.from(JSON.stringify(parsed.payload), 'utf8')
  if (rawPayload.byteLength > CLOUD_MANUAL_SAVE_MAX_UNCOMPRESSED_BYTES) {
    throw new PlayerContentServiceError(
      '云端存档完整内容超出当前可保存上限，原云端存档未改动。',
      413,
      'cloud_save_too_large',
    )
  }
  const compressedPayload = gzipSync(rawPayload, { level: 9 })
  if (compressedPayload.byteLength > CLOUD_MANUAL_SAVE_MAX_COMPRESSED_BYTES) {
    throw new PlayerContentServiceError(
      '云端存档压缩后仍超出当前可保存上限，原云端存档未改动。',
      413,
      'cloud_save_too_large',
    )
  }
  const digest = createHash('sha256').update(rawPayload).digest('hex')
  const database = getPlayerContentDatabase()
  database.transaction(() => {
    database.prepare(`
      INSERT INTO cloud_manual_saves(
        account_id, slot, payload_schema_version, name, world_name, character_name,
        total_rounds, game_version, saved_at, payload_gzip, payload_sha256,
        compressed_bytes, uncompressed_bytes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(account_id) DO UPDATE SET
        slot = excluded.slot,
        payload_schema_version = excluded.payload_schema_version,
        name = excluded.name,
        world_name = excluded.world_name,
        character_name = excluded.character_name,
        total_rounds = excluded.total_rounds,
        game_version = excluded.game_version,
        saved_at = excluded.saved_at,
        payload_gzip = excluded.payload_gzip,
        payload_sha256 = excluded.payload_sha256,
        compressed_bytes = excluded.compressed_bytes,
        uncompressed_bytes = excluded.uncompressed_bytes,
        updated_at = excluded.updated_at
    `).run(
      accountId,
      parsed.metadata.slot,
      parsed.metadata.schemaVersion,
      parsed.metadata.name,
      parsed.metadata.worldName,
      parsed.metadata.characterName,
      parsed.metadata.totalRounds,
      parsed.metadata.gameVersion,
      parsed.metadata.savedAt,
      compressedPayload,
      digest,
      compressedPayload.byteLength,
      rawPayload.byteLength,
      now,
    )
  })()
  return {
    ...parsed.metadata,
    compressedBytes: compressedPayload.byteLength,
    uncompressedBytes: rawPayload.byteLength,
    updatedAt: now,
  }
}

export function readCloudManualSaveSummary(accountId: string): CloudManualSaveSummary | null {
  const row = getPlayerContentDatabase().prepare(`
    SELECT slot, payload_schema_version, name, world_name, character_name, total_rounds,
      game_version, saved_at, compressed_bytes, uncompressed_bytes, updated_at
    FROM cloud_manual_saves WHERE account_id = ?
  `).get(accountId) as Omit<StoredCloudSaveRow, 'payload_gzip'> | undefined
  return row ? cloudSaveSummary(row) : null
}

export function readCloudManualSavePayload(accountId: string): { summary: CloudManualSaveSummary, gzip: Buffer } | null {
  const row = getPlayerContentDatabase().prepare(`
    SELECT slot, payload_schema_version, name, world_name, character_name, total_rounds,
      game_version, saved_at, payload_gzip, compressed_bytes, uncompressed_bytes, updated_at
    FROM cloud_manual_saves WHERE account_id = ?
  `).get(accountId) as StoredCloudSaveRow | undefined
  return row ? { summary: cloudSaveSummary(row), gzip: row.payload_gzip } : null
}

export function decodeCloudManualSave(accountId: string): { summary: CloudManualSaveSummary, payload: unknown } | null {
  const database = getPlayerContentDatabase()
  const row = database.prepare(`
    SELECT slot, payload_schema_version, name, world_name, character_name, total_rounds,
      game_version, saved_at, payload_gzip, payload_sha256, compressed_bytes,
      uncompressed_bytes, updated_at
    FROM cloud_manual_saves WHERE account_id = ?
  `).get(accountId) as StoredCloudSaveRow & { payload_sha256: string } | undefined
  if (!row) return null
  if (row.compressed_bytes !== row.payload_gzip.byteLength) {
    throw new PlayerContentServiceError('云端存档压缩长度校验失败。', 500, 'cloud_save_corrupt')
  }
  let raw: Buffer
  try {
    raw = gunzipSync(row.payload_gzip, { maxOutputLength: CLOUD_MANUAL_SAVE_MAX_UNCOMPRESSED_BYTES })
  } catch {
    throw new PlayerContentServiceError('云端存档解压校验失败。', 500, 'cloud_save_corrupt')
  }
  if (raw.byteLength !== row.uncompressed_bytes) {
    throw new PlayerContentServiceError('云端存档原始长度校验失败。', 500, 'cloud_save_corrupt')
  }
  const digest = createHash('sha256').update(raw).digest('hex')
  if (digest !== row.payload_sha256) {
    throw new PlayerContentServiceError('云端存档完整性校验失败。', 500, 'cloud_save_corrupt')
  }
  let payload: unknown
  try {
    payload = CloudGameSavePayloadSchema.parse(JSON.parse(raw.toString('utf8')))
  } catch {
    throw new PlayerContentServiceError('云端存档结构校验失败。', 500, 'cloud_save_corrupt')
  }
  return { summary: cloudSaveSummary(row), payload }
}

export function deleteCloudManualSave(accountId: string): boolean {
  return getPlayerContentDatabase().prepare(`
    DELETE FROM cloud_manual_saves WHERE account_id = ?
  `).run(accountId).changes > 0
}

export function projectLeaderboardRecord(accountId: string, source: CloudGameRecord, now = Date.now()): LeaderboardProjection | null {
  const record = CloudGameRecordLeaderboardSchema.parse({
    recordId: source.recordId,
    completedAt: source.completedAt,
    characterName: source.characterName,
    worldName: source.worldName,
    finalAge: source.finalAge,
    rounds: source.rounds,
    overallScore: source.overallScore,
  })
  if (!isLeaderboardEligible(record)) return null
  const database = getPlayerContentDatabase()
  const current = database.prepare(`
    SELECT score, rounds, record_id, completed_at
    FROM leaderboard_best_runs WHERE account_id = ?
  `).get(accountId) as { score: number, rounds: number, record_id: string, completed_at: number } | undefined
  const isBetter = !current
    || record.overallScore > current.score
    || (record.overallScore === current.score && record.rounds > current.rounds)
    || (record.overallScore === current.score && record.rounds === current.rounds && record.completedAt < current.completed_at)
  if (!isBetter) return current ? {
    score: current.score,
    rounds: current.rounds,
    recordId: current.record_id,
    completedAt: current.completed_at,
  } : null
  database.prepare(`
    INSERT INTO leaderboard_best_runs(account_id, record_id, score, rounds, completed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      record_id = excluded.record_id,
      score = excluded.score,
      rounds = excluded.rounds,
      completed_at = excluded.completed_at,
      updated_at = excluded.updated_at
  `).run(accountId, record.recordId, record.overallScore, record.rounds, record.completedAt, now)
  return {
    score: record.overallScore,
    rounds: record.rounds,
    recordId: record.recordId,
    completedAt: record.completedAt,
  }
}

export function queuePortraitMailJob(accountId: string, source: CloudGameRecord, now = Date.now()): boolean {
  const record = CloudGameRecordLeaderboardSchema.parse({
    recordId: source.recordId,
    completedAt: source.completedAt,
    characterName: source.characterName,
    worldName: source.worldName,
    finalAge: source.finalAge,
    rounds: source.rounds,
    overallScore: source.overallScore,
  })
  if (record.overallScore !== 100) return false
  return getPlayerContentDatabase().prepare(`
    INSERT INTO portrait_mail_jobs(account_id, record_id, status, created_at, updated_at)
    VALUES (?, ?, 'awaiting_brief', ?, ?)
    ON CONFLICT(account_id, record_id) DO NOTHING
  `).run(accountId, record.recordId, now, now).changes > 0
}

export function projectStructuredGameRecords(accountId: string, records: readonly CloudGameRecord[], now = Date.now()): void {
  const database = getPlayerContentDatabase()
  database.transaction(() => {
    database.prepare('DELETE FROM leaderboard_best_runs WHERE account_id = ?').run(accountId)
    const perfectRecordIds = new Set<string>()
    for (const record of records) {
      projectLeaderboardRecord(accountId, record, now)
      if (record.overallScore === 100) perfectRecordIds.add(record.recordId)
      queuePortraitMailJob(accountId, record, now)
    }
    const removableJobs = database.prepare(`
      SELECT record_id FROM portrait_mail_jobs
      WHERE account_id = ? AND status IN ('awaiting_brief', 'failed')
    `).all(accountId) as Array<{ record_id: string }>
    const removeJob = database.prepare(`
      DELETE FROM portrait_mail_jobs WHERE account_id = ? AND record_id = ?
    `)
    for (const job of removableJobs) {
      if (!perfectRecordIds.has(job.record_id)) removeJob.run(accountId, job.record_id)
    }
  })()
}

export function deletePlayerContentForAccount(accountId: string): void {
  const database = getPlayerContentDatabase()
  const assets = database.prepare(`
    SELECT storage_key FROM portrait_assets WHERE account_id = ?
  `).all(accountId) as Array<{ storage_key: string }>
  database.transaction(() => {
    database.prepare('DELETE FROM cloud_manual_saves WHERE account_id = ?').run(accountId)
    database.prepare('DELETE FROM leaderboard_best_runs WHERE account_id = ?').run(accountId)
    database.prepare('DELETE FROM portrait_mail_jobs WHERE account_id = ?').run(accountId)
    database.prepare('DELETE FROM player_mail_messages WHERE account_id = ?').run(accountId)
    database.prepare('DELETE FROM portrait_assets WHERE account_id = ?').run(accountId)
  })()
  removePortraitAssets(assets.map((asset) => asset.storage_key))
}

export function readOwnedPortraitAsset(
  accountId: string,
  assetId: string,
): { mimeType: string; storageKey: string } | null {
  const row = getPlayerContentDatabase().prepare(`
    SELECT mime_type, storage_key FROM portrait_assets
    WHERE id = ? AND account_id = ?
  `).get(assetId, accountId) as { mime_type: string; storage_key: string } | undefined
  return row ? { mimeType: row.mime_type, storageKey: row.storage_key } : null
}

export function readLeaderboardEntries(
  usernames: ReadonlyMap<string, string>,
  limit = 100,
): LeaderboardEntry[] {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
  const rows = getPlayerContentDatabase().prepare(`
    SELECT account_id, record_id, score, rounds, completed_at
    FROM leaderboard_best_runs
    ORDER BY score DESC, rounds DESC, completed_at ASC, account_id ASC
    LIMIT ?
  `).all(safeLimit) as Array<{
    account_id: string
    record_id: string
    score: number
    rounds: number
    completed_at: number
  }>
  return rows
    .filter((row) => usernames.has(row.account_id))
    .map((row, index) => ({
      rank: index + 1,
      username: usernames.get(row.account_id)!,
      score: row.score,
      rounds: row.rounds,
      recordId: row.record_id,
      completedAt: row.completed_at,
    }))
}

export function readPlayerMail(accountId: string): PlayerMailMessage[] {
  const rows = getPlayerContentDatabase().prepare(`
    SELECT id, kind, record_id, title, body, asset_id, created_at, read_at
    FROM player_mail_messages
    WHERE account_id = ?
    ORDER BY created_at DESC, id ASC
  `).all(accountId) as Array<{
    id: string
    kind: 'portrait'
    record_id: string
    title: string
    body: string
    asset_id: string | null
    created_at: number
    read_at: number | null
  }>
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    recordId: row.record_id,
    title: row.title,
    body: row.body,
    assetId: row.asset_id,
    createdAt: row.created_at,
    readAt: row.read_at,
  }))
}

export function markPlayerMailRead(accountId: string, messageId: string, now = Date.now()): boolean {
  return getPlayerContentDatabase().prepare(`
    UPDATE player_mail_messages
    SET read_at = COALESCE(read_at, ?)
    WHERE account_id = ? AND id = ?
  `).run(now, accountId, messageId).changes > 0
}

export function createPlayerMailMessage(input: {
  accountId: string
  recordId: string
  assetId: string
  now?: number
}): string {
  const id = randomUUID()
  const now = input.now ?? Date.now()
  getPlayerContentDatabase().prepare(`
    INSERT INTO player_mail_messages(id, account_id, kind, record_id, title, body, asset_id, created_at)
    VALUES (?, ?, 'portrait', ?, '满分人生画像', '你走完的满分人生已留下一幅主角画像。', ?, ?)
    ON CONFLICT(account_id, record_id, kind) DO NOTHING
  `).run(id, input.accountId, input.recordId, input.assetId, now)
  const row = getPlayerContentDatabase().prepare(`
    SELECT id FROM player_mail_messages
    WHERE account_id = ? AND record_id = ? AND kind = 'portrait'
  `).get(input.accountId, input.recordId) as { id: string }
  return row.id
}

export function getPlayerContentAggregateCounts(): {
  cloudSaves: number
  eligibleLeaderboardAccounts: number
  queuedPortraitJobs: number
  readyPortraitMail: number
} {
  const database = getPlayerContentDatabase()
  const cloudSaves = database.prepare('SELECT COUNT(*) AS count FROM cloud_manual_saves').get() as { count: number }
  const leaderboard = database.prepare('SELECT COUNT(*) AS count FROM leaderboard_best_runs').get() as { count: number }
  const portraitJobs = database.prepare(`
    SELECT COUNT(*) AS count FROM portrait_mail_jobs
    WHERE status IN ('awaiting_brief', 'processing')
  `).get() as { count: number }
  const mail = database.prepare('SELECT COUNT(*) AS count FROM player_mail_messages').get() as { count: number }
  return {
    cloudSaves: cloudSaves.count,
    eligibleLeaderboardAccounts: leaderboard.count,
    queuedPortraitJobs: portraitJobs.count,
    readyPortraitMail: mail.count,
  }
}
