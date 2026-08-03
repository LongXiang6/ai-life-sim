/**
 * Purpose: Select and commit deterministic legendary encounters from verified perfect runs.
 * Owner: core:player-content
 * Responsibility: Legendary decision state only; leaderboard projection and narrative injection stay separate.
 */

import { createHash } from 'node:crypto'

import type { CloudGameRecord } from '@/core/account/account-contract'
import { verifyStoredLifeScore } from '@/core/scoring/life-scoring'

import {
  CloudGameRecordLeaderboardSchema,
  isLeaderboardEligible,
  type LegendaryEncounterProjection,
} from '../player-content-contract'
import { getPlayerContentDatabase } from '../player-content-database'

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
      const draw = deterministicLegendNumber(
        input.targetKey,
        input.targetLifeRunId,
        decisionNumber,
        'gate',
      ) / 0x1_0000_0000
      if (draw < 0.2) {
        const rows = database.prepare(`
          SELECT account_id, record_json FROM leaderboard_best_runs
          WHERE score = 100 ORDER BY completed_at ASC, record_id ASC
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
          const index = deterministicLegendNumber(
            input.targetKey,
            input.targetLifeRunId,
            decisionNumber,
            'source',
          ) % candidates.length
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
  `).run(
    Math.max(1, Math.trunc(input.round)),
    now,
    input.targetKey,
    input.targetLifeRunId,
  ).changes > 0
}
