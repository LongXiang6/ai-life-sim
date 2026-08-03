/**
 * Purpose: Persist, validate, decode, summarize, and delete one account cloud manual save.
 * Owner: core:player-content
 * Responsibility: Cloud manual-save lifecycle only; leaderboard and mailbox content remain separate.
 */

import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'

import {
  CLOUD_MANUAL_SAVE_MAX_COMPRESSED_BYTES,
  CLOUD_MANUAL_SAVE_MAX_UNCOMPRESSED_BYTES,
  CloudGameSavePayloadSchema,
  CloudManualSaveMetadataSchema,
  CloudManualSaveWriteSchema,
  type CloudManualSaveSummary,
  type CloudManualSaveWrite,
} from '../player-content-contract'
import { getPlayerContentDatabase } from '../player-content-database'
import { PlayerContentServiceError } from '../player-content-error'

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

export function saveCloudManualSave(
  accountId: string,
  input: CloudManualSaveWrite,
  now = Date.now(),
): CloudManualSaveSummary {
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

export function readCloudManualSavePayload(
  accountId: string,
): { summary: CloudManualSaveSummary; gzip: Buffer } | null {
  const row = getPlayerContentDatabase().prepare(`
    SELECT slot, payload_schema_version, name, world_name, character_name, total_rounds,
      game_version, saved_at, payload_gzip, compressed_bytes, uncompressed_bytes, updated_at
    FROM cloud_manual_saves WHERE account_id = ?
  `).get(accountId) as StoredCloudSaveRow | undefined
  return row ? { summary: cloudSaveSummary(row), gzip: row.payload_gzip } : null
}

export function decodeCloudManualSave(
  accountId: string,
): { summary: CloudManualSaveSummary; payload: unknown } | null {
  const row = getPlayerContentDatabase().prepare(`
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
  if (createHash('sha256').update(raw).digest('hex') !== row.payload_sha256) {
    throw new PlayerContentServiceError('云端存档完整性校验失败。', 500, 'cloud_save_corrupt')
  }
  try {
    const payload = CloudGameSavePayloadSchema.parse(JSON.parse(raw.toString('utf8')))
    return { summary: cloudSaveSummary(row), payload }
  } catch {
    throw new PlayerContentServiceError('云端存档结构校验失败。', 500, 'cloud_save_corrupt')
  }
}

export function deleteCloudManualSave(accountId: string): boolean {
  return getPlayerContentDatabase().prepare('DELETE FROM cloud_manual_saves WHERE account_id = ?')
    .run(accountId).changes > 0
}
