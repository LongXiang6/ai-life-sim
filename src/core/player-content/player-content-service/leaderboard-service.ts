/**
 * Purpose: Project verified records into leaderboard and portrait-job views and read leaderboard results.
 * Owner: core:player-content
 * Responsibility: Leaderboard projection and reads only; cloud saves and legendary encounters stay separate.
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

export function projectLeaderboardRecord(
  accountId: string,
  source: CloudGameRecord,
  now = Date.now(),
): LeaderboardProjection | null {
  const record = CloudGameRecordLeaderboardSchema.parse(source)
  const verification = verifyStoredLifeScore(record)
  recordScoringVerification(record, 'leaderboard-projection', verification)
  if (!verification.valid || !isLeaderboardEligible(record)) return null
  const database = getPlayerContentDatabase()
  const current = database.prepare(`
    SELECT score, rounds, record_id, completed_at
    FROM leaderboard_best_runs WHERE account_id = ?
  `).get(accountId) as { score: number; rounds: number; record_id: string; completed_at: number } | undefined
  const isBetter = !current
    || record.overallScore > current.score
    || (record.overallScore === current.score && record.rounds > current.rounds)
    || (record.overallScore === current.score
      && record.rounds === current.rounds
      && record.completedAt < current.completed_at)
  if (!isBetter) {
    return current ? {
      score: current.score,
      rounds: current.rounds,
      recordId: current.record_id,
      completedAt: current.completed_at,
    } : null
  }
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

export function queuePortraitMailJob(
  accountId: string,
  source: CloudGameRecord,
  now = Date.now(),
): boolean {
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

export function projectStructuredGameRecords(
  accountId: string,
  records: readonly CloudGameRecord[],
  now = Date.now(),
): void {
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
    const removeJob = database.prepare(
      'DELETE FROM portrait_mail_jobs WHERE account_id = ? AND record_id = ?',
    )
    for (const job of removableJobs) {
      if (!perfectRecordIds.has(job.record_id)) removeJob.run(accountId, job.record_id)
    }
  })()
  if (records.some((record) => (
    record.overallScore === 100 && record.scoring?.integrity.perfectGatePassed === true
  ))) {
    void import('../portrait-mail-service')
      .then(({ schedulePortraitMailWorker }) => schedulePortraitMailWorker())
      .catch(() => undefined)
  }
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
