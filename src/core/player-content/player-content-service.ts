import 'server-only'

import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'

import type { CloudGameRecord } from '@/core/account/account-contract'
import { verifyStoredLifeScore } from '@/core/scoring/life-scoring'
import { appendDevelopmentSystemEvents } from '@/core/logger/development-system-diagnostic.server'

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
  type LegendaryEncounterProjection,
  type LeaderboardEntry,
  type LeaderboardProjection,
} from './player-content-contract'
import { getPlayerContentDatabase } from './player-content-database'
import { PlayerContentServiceError } from './player-content-error'
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

function recordScoringVerification(
  record: CloudGameRecord,
  operation: 'leaderboard-projection' | 'portrait-queue',
  verification: ReturnType<typeof verifyStoredLifeScore>,
): void {
  void appendDevelopmentSystemEvents([{
    schemaVersion: 1,
    timestamp: Date.now(),
    system: 'life-scoring',
    event: operation,
    status: verification.valid ? 'ok' : 'error',
    ...(record.scoring?.audit?.lifeRunId
      ? { lifeRunId: record.scoring.audit.lifeRunId }
      : {}),
    ...(record.rounds > 0 ? { round: record.rounds } : {}),
    details: {
      recordId: record.recordId,
      score: record.overallScore,
      verificationReasons: verification.reasons,
    },
  }]).catch((error) => {
    console.error('[player-content] 开发评分诊断写入失败', error)
  })
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
  const record = CloudGameRecordLeaderboardSchema.parse(source)
  const verification = verifyStoredLifeScore(record)
  recordScoringVerification(record, 'leaderboard-projection', verification)
  if (!verification.valid || !isLeaderboardEligible(record)) return null
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
  const portrait = database.prepare(`
    SELECT asset_id FROM player_mail_messages
    WHERE recipient_key = ? AND record_id = ? AND kind = 'portrait'
  `).get(`account:${accountId}`, record.recordId) as { asset_id: string | null } | undefined
  database.prepare(`
    INSERT INTO leaderboard_best_runs(
      account_id, record_id, score, rounds, completed_at, record_json, portrait_asset_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id) DO UPDATE SET
      record_id = excluded.record_id,
      score = excluded.score,
      rounds = excluded.rounds,
      completed_at = excluded.completed_at,
      record_json = excluded.record_json,
      portrait_asset_id = excluded.portrait_asset_id,
      updated_at = excluded.updated_at
  `).run(
    accountId,
    record.recordId,
    record.overallScore,
    record.rounds,
    record.completedAt,
    JSON.stringify(record),
    portrait?.asset_id ?? null,
    now,
  )
  return {
    score: record.overallScore,
    rounds: record.rounds,
    recordId: record.recordId,
    completedAt: record.completedAt,
  }
}

export function queuePortraitMailJob(accountId: string, source: CloudGameRecord, now = Date.now()): boolean {
  const record = CloudGameRecordLeaderboardSchema.parse(source)
  const verification = verifyStoredLifeScore(record)
  recordScoringVerification(record, 'portrait-queue', verification)
  if (!verification.valid
    || !isLeaderboardEligible(record)
    || record.overallScore !== 100
    || record.scoring?.integrity.perfectGatePassed !== true) return false
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
      if (record.overallScore === 100 && record.scoring?.integrity.perfectGatePassed) {
        perfectRecordIds.add(record.recordId)
      }
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
  // 账号同步也可能是游客满分存档第一次被领取的时机；让画像 worker 在进程内异步接管，不阻塞同步响应。
  if (records.some((record) => record.overallScore === 100 && record.scoring?.integrity.perfectGatePassed === true)) {
    void import('./portrait-mail-service')
      .then(({ schedulePortraitMailWorker }) => schedulePortraitMailWorker())
      .catch(() => undefined)
  }
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
    database.prepare('DELETE FROM portrait_assets WHERE account_id = ?').run(accountId)
    database.prepare('DELETE FROM legendary_run_decisions WHERE source_account_id = ? OR target_key = ?')
      .run(accountId, `account:${accountId}`)
    database.prepare('DELETE FROM legendary_target_states WHERE target_key = ?').run(`account:${accountId}`)
  })()
  removePortraitAssets(assets.map((asset) => asset.storage_key))
}

export function readLeaderboardEntries(
  usernames: ReadonlyMap<string, string>,
  limit = 100,
): LeaderboardEntry[] {
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)))
  const rows = getPlayerContentDatabase().prepare(`
    SELECT account_id, record_id, score, rounds, completed_at, record_json, portrait_asset_id
    FROM leaderboard_best_runs
    ORDER BY score DESC, rounds DESC, completed_at ASC, record_id ASC
    LIMIT ?
  `).all(safeLimit) as Array<{
    account_id: string
    record_id: string
    score: number
    rounds: number
    completed_at: number
    record_json: string
    portrait_asset_id: string | null
  }>
  const entries: LeaderboardEntry[] = []
  for (const row of rows) {
    const username = usernames.get(row.account_id)
    if (!username) continue
    let record: CloudGameRecord
    try {
      record = CloudGameRecordLeaderboardSchema.parse(JSON.parse(row.record_json))
    } catch {
      continue
    }
    if (!verifyStoredLifeScore(record).valid || !isLeaderboardEligible(record)) continue
    entries.push({
      rank: entries.length + 1,
      username,
      score: row.score,
      rounds: row.rounds,
      recordId: row.record_id,
      completedAt: row.completed_at,
      characterName: record.characterName,
      worldName: record.worldName,
      finalAge: record.finalAge,
      dimensions: record.dimensions,
      endingReview: record.endingReview!,
      achievements: record.achievements ?? [],
      portraitAssetId: row.portrait_asset_id,
      portraitAssetUrl: row.portrait_asset_id
        ? `/api/leaderboard/assets/${encodeURIComponent(row.portrait_asset_id)}`
        : null,
    })
  }
  return entries
}

export function readLeaderboardPortraitAsset(
  assetId: string,
): { mimeType: string; storageKey: string } | null {
  const row = getPlayerContentDatabase().prepare(`
    SELECT assets.mime_type, assets.storage_key
    FROM leaderboard_best_runs AS leaderboard
    JOIN portrait_assets AS assets ON assets.id = leaderboard.portrait_asset_id
    WHERE leaderboard.portrait_asset_id = ?
  `).get(assetId) as { mime_type: string; storage_key: string } | undefined
  return row ? { mimeType: row.mime_type, storageKey: row.storage_key } : null
}

interface LegendaryTargetStateRow {
  completed_run_decisions: number
  cooldown_remaining: number
  seen_record_ids_json: string
}

function parseSeenLegendIds(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return []
    return [...new Set(value)]
  } catch {
    return []
  }
}

function deterministicLegendNumber(...parts: Array<string | number>): number {
  return createHash('sha256').update(parts.join('\u0000')).digest().readUInt32BE(0)
}

function parseLegendProjection(raw: string | null): LegendaryEncounterProjection | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as LegendaryEncounterProjection
    return value
      && typeof value.sourceRecordId === 'string'
      && typeof value.characterName === 'string'
      && typeof value.worldName === 'string'
      && typeof value.endingReview === 'string'
      && Array.isArray(value.achievements)
      && Number.isInteger(value.selectedAt)
      ? value
      : null
  } catch {
    return null
  }
}

export function selectLegendaryEncounter(input: {
  targetKey: string
  targetAccountId?: string
  targetLifeRunId: string
  now?: number
}): LegendaryEncounterProjection | null {
  const database = getPlayerContentDatabase()
  const now = input.now ?? Date.now()
  return database.transaction(() => {
    const existing = database.prepare(`
      SELECT status, projection_json FROM legendary_run_decisions
      WHERE target_life_run_id = ? AND target_key = ?
    `).get(input.targetLifeRunId, input.targetKey) as {
      status: 'none' | 'selected' | 'injected'
      projection_json: string | null
    } | undefined
    if (existing) return existing.status === 'none' ? null : parseLegendProjection(existing.projection_json)

    const state = database.prepare(`
      SELECT completed_run_decisions, cooldown_remaining, seen_record_ids_json
      FROM legendary_target_states WHERE target_key = ?
    `).get(input.targetKey) as LegendaryTargetStateRow | undefined
    const decisionNumber = (state?.completed_run_decisions ?? 0) + 1
    let cooldownRemaining = state?.cooldown_remaining ?? 0
    const seenIds = parseSeenLegendIds(state?.seen_record_ids_json ?? '[]')
    let selected: {
      accountId: string
      record: CloudGameRecord
      projection: LegendaryEncounterProjection
    } | null = null

    if (cooldownRemaining > 0) {
      cooldownRemaining -= 1
    } else {
      const draw = deterministicLegendNumber(input.targetKey, input.targetLifeRunId, decisionNumber, 'gate') / 0x1_0000_0000
      if (draw < 0.2) {
        const rows = database.prepare(`
          SELECT account_id, record_json FROM leaderboard_best_runs
          WHERE score = 100
          ORDER BY completed_at ASC, record_id ASC
        `).all() as Array<{ account_id: string; record_json: string }>
        const candidates = rows.flatMap((row) => {
          if (row.account_id === input.targetAccountId) return []
          try {
            const record = CloudGameRecordLeaderboardSchema.parse(JSON.parse(row.record_json))
            if (record.overallScore !== 100
              || !verifyStoredLifeScore(record).valid
              || !isLeaderboardEligible(record)
              || seenIds.includes(record.recordId)) return []
            return [{ accountId: row.account_id, record }]
          } catch {
            return []
          }
        })
        if (candidates.length > 0) {
          const index = deterministicLegendNumber(input.targetKey, input.targetLifeRunId, decisionNumber, 'source') % candidates.length
          const candidate = candidates[index]!
          selected = {
            accountId: candidate.accountId,
            record: candidate.record,
            projection: {
              sourceRecordId: candidate.record.recordId,
              characterName: candidate.record.characterName,
              worldName: candidate.record.worldName,
              endingReview: candidate.record.endingReview!.review,
              achievements: candidate.record.achievements ?? [],
              selectedAt: now,
            },
          }
          seenIds.push(candidate.record.recordId)
          cooldownRemaining = 3
        }
      }
    }

    database.prepare(`
      INSERT INTO legendary_run_decisions(
        target_life_run_id, target_key, source_account_id, source_record_id,
        status, projection_json, selected_at, injected_round, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(
      input.targetLifeRunId,
      input.targetKey,
      selected?.accountId ?? null,
      selected?.record.recordId ?? null,
      selected ? 'selected' : 'none',
      selected ? JSON.stringify(selected.projection) : null,
      now,
      now,
    )
    database.prepare(`
      INSERT INTO legendary_target_states(
        target_key, completed_run_decisions, cooldown_remaining, seen_record_ids_json, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(target_key) DO UPDATE SET
        completed_run_decisions = excluded.completed_run_decisions,
        cooldown_remaining = excluded.cooldown_remaining,
        seen_record_ids_json = excluded.seen_record_ids_json,
        updated_at = excluded.updated_at
    `).run(input.targetKey, decisionNumber, cooldownRemaining, JSON.stringify(seenIds), now)
    return selected?.projection ?? null
  })()
}

export function markLegendaryEncounterInjected(input: {
  targetKey: string
  targetLifeRunId: string
  round: number
  now?: number
}): boolean {
  const now = input.now ?? Date.now()
  return getPlayerContentDatabase().prepare(`
    UPDATE legendary_run_decisions
    SET status = 'injected', injected_round = COALESCE(injected_round, ?), updated_at = ?
    WHERE target_key = ? AND target_life_run_id = ? AND status IN ('selected', 'injected')
  `).run(Math.max(1, Math.trunc(input.round)), now, input.targetKey, input.targetLifeRunId).changes > 0
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
  const mail = database.prepare(`
    SELECT COUNT(*) AS count FROM player_mail_messages WHERE kind = 'portrait'
  `).get() as { count: number }
  return {
    cloudSaves: cloudSaves.count,
    eligibleLeaderboardAccounts: leaderboard.count,
    queuedPortraitJobs: portraitJobs.count,
    readyPortraitMail: mail.count,
  }
}
