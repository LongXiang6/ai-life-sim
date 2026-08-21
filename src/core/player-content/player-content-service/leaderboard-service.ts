/**
 * Purpose: Project verified completed runs into the bounded public leaderboard.
 * Owner: core:player-content
 * Responsibility: Per-run leaderboard projection, global retention, reads, and portrait lookup only.
 */

import type { CloudGameRecord } from '@/core/account/account-contract'
import { verifyStoredLifeScore } from '@/core/scoring/life-scoring'

import {
  CloudGameRecordLeaderboardSchema,
  isLeaderboardEligible,
  type LeaderboardEntry,
  type LeaderboardProjection,
} from '../player-content-contract'
import { getPlayerContentDatabase } from '../player-content-database'
import { recordScoringVerification } from './scoring-diagnostic'

export const LEADERBOARD_RECORD_LIMIT = 50

function trimLeaderboardRecords(): void {
  getPlayerContentDatabase().prepare(`
    DELETE FROM leaderboard_best_runs
    WHERE rowid IN (
      SELECT rowid FROM leaderboard_best_runs
      ORDER BY score DESC, rounds DESC, completed_at ASC, record_id ASC, account_id ASC
      LIMIT -1 OFFSET ?
    )
  `).run(LEADERBOARD_RECORD_LIMIT)
}

export function projectLeaderboardRecord(
  accountId: string,
  source: CloudGameRecord,
  now = Date.now(),
): LeaderboardProjection | null {
  const record = CloudGameRecordLeaderboardSchema.parse(source)
  const verification = verifyStoredLifeScore(record)
  recordScoringVerification(record, 'leaderboard-projection', verification)
  const database = getPlayerContentDatabase()
  const scoring = record.scoring
  if (!verification.valid || !isLeaderboardEligible(record) || scoring?.version !== 2) {
    database.prepare(`
      DELETE FROM leaderboard_best_runs WHERE account_id = ? AND record_id = ?
    `).run(accountId, record.recordId)
    return null
  }
  const portrait = database.prepare(`
    SELECT asset_id FROM player_mail_messages
    WHERE recipient_key = ? AND record_id = ? AND kind = 'portrait'
  `).get(`account:${accountId}`, record.recordId) as { asset_id: string | null } | undefined
  database.prepare(`
    INSERT INTO leaderboard_best_runs(
      account_id, record_id, score, rounds, completed_at, record_json, portrait_asset_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(account_id, record_id) DO UPDATE SET
      score = excluded.score,
      rounds = excluded.rounds,
      completed_at = excluded.completed_at,
      record_json = excluded.record_json,
      portrait_asset_id = excluded.portrait_asset_id,
      updated_at = excluded.updated_at
  `).run(
    accountId,
    record.recordId,
    scoring.score,
    record.rounds,
    record.completedAt,
    JSON.stringify(record),
    portrait?.asset_id ?? null,
    now,
  )
  trimLeaderboardRecords()
  return {
    score: scoring.score,
    rounds: record.rounds,
    recordId: record.recordId,
    completedAt: record.completedAt,
  }
}

export function queuePortraitMailJob(
  _accountId: string,
  _source: CloudGameRecord,
  _now = Date.now(),
): boolean {
  return false
}

export function projectStructuredGameRecords(
  accountId: string,
  records: readonly CloudGameRecord[],
  now = Date.now(),
): void {
  const database = getPlayerContentDatabase()
  database.transaction(() => {
    for (const record of records) projectLeaderboardRecord(accountId, record, now)
    trimLeaderboardRecords()
  })()
}

export function readLeaderboardEntries(
  usernames: ReadonlyMap<string, string>,
  limit = LEADERBOARD_RECORD_LIMIT,
): LeaderboardEntry[] {
  const safeLimit = Math.max(1, Math.min(LEADERBOARD_RECORD_LIMIT, Math.trunc(limit)))
  const rows = getPlayerContentDatabase().prepare(`
    SELECT account_id, record_id, score, rounds, completed_at, record_json, portrait_asset_id
    FROM leaderboard_best_runs
    ORDER BY score DESC, rounds DESC, completed_at ASC, record_id ASC, account_id ASC
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
    const scoring = record.scoring
    if (scoring?.version !== 2) continue
    const endingReview = record.endingReview!
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
      dimensions: scoring.dimensions,
      endingReview: { ...endingReview, verse: endingReview.verse! },
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
