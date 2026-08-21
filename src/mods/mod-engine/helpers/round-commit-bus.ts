/**
 * Purpose: Validate and apply locally owned subsystem changes for one frozen round context.
 * Owner: mod-engine
 * Responsibility: Prepare manual change packages and commit them only to their original round identity.
 *
 * @module round-commit-bus.ts
 * @description 回合提交总线 —— 子系统状态写入的唯一通道
 * @mod mod-engine
 *
 * 叙事解析与状态提交硬分离：
 *   parse / intercept → RoundCommitBus.commit → subsystem.applyChanges
 */

import { runtimeRegistry } from '@/core'
import type { ISubSystem, SubSystemChanges, RoundContext } from '@/foundation'

import { deepSanitize } from './system-safety'
export type RoundCommitSource = 'manual'

export interface RoundCommit {
  source: RoundCommitSource
  changes: SubSystemChanges[]
  roundSequence?: number
}

export interface RoundCommitRejected {
  change: SubSystemChanges
  reason: string
}

export interface RoundCommitResult {
  committed: SubSystemChanges[]
  rejected: RoundCommitRejected[]
}

export interface PreparedRoundCommit {
  readonly source: RoundCommitSource
  readonly roundSequence?: number
  readonly contextIdentity: {
    readonly contextId: string
    readonly characterId: string
    readonly roundSequence?: number
    readonly totalDays: number
  }
  readonly changes: readonly SubSystemChanges[]
}

export interface RoundCommitPreparationResult {
  prepared?: PreparedRoundCommit
  rejected: RoundCommitRejected[]
}

const ENTITY_ID_FIELDS: ReadonlySet<string> = new Set([
  'entityId',
  'npcId',
  'characterId',
  'targetEntityId',
  'toEntityId',
  'fromEntityId',
])

const ENTITY_ID_LIST_FIELDS: ReadonlySet<string> = new Set([
  'targetEntityIds',
  'relatedEntityIds',
])

function resolvePlayerEntityAlias(value: unknown, context: RoundContext): unknown {
  return value === 'player:current' && context.characterId ? context.characterId : value
}

/** 将 Prompt 层唯一允许的当前玩家别名收口到真实稳定实体 ID。 */
function normalizeEntityAliases(
  change: SubSystemChanges,
  context: RoundContext,
): SubSystemChanges {
  const payload = { ...(change.changes ?? {}) }
  for (const [key, value] of Object.entries(payload)) {
    if (ENTITY_ID_FIELDS.has(key)) {
      payload[key] = resolvePlayerEntityAlias(value, context)
    } else if (ENTITY_ID_LIST_FIELDS.has(key) && Array.isArray(value)) {
      payload[key] = value.map((item) => resolvePlayerEntityAlias(item, context))
    }
  }
  return {
    ...change,
    targetObjectId: resolvePlayerEntityAlias(change.targetObjectId, context) as string | undefined,
    changes: payload,
  }
}

export class RoundCommitBus {
  constructor(
    private readonly resolveSubsystem: (id: string) => ISubSystem | undefined,
    private readonly applyChange: (change: SubSystemChanges, context: RoundContext) => void,
  ) {}

  prepare(commit: RoundCommit, context: RoundContext): RoundCommitPreparationResult {
    const rejected: RoundCommitRejected[] = []
    const prepared: SubSystemChanges[] = []

    for (const raw of commit.changes) {
      if (!raw.id) {
        rejected.push({ change: raw, reason: '空子系统 id' })
        continue
      }

      if (runtimeRegistry.isFrozen() && !runtimeRegistry.hasSubsystem(raw.id)) {
        rejected.push({ change: raw, reason: `RuntimeRegistry 中无子系统 "${raw.id}"` })
        continue
      }

      const sub = this.resolveSubsystem(raw.id)
      if (!sub) {
        rejected.push({ change: raw, reason: `子系统 "${raw.id}" 未注册` })
        continue
      }

      const change = normalizeEntityAliases(raw, context)

      const sanitized = deepSanitize(change.changes, `commit.${change.id}`)
      if (!sanitized.report.passed) {
        console.warn(`[RoundCommit] ${change.id} 安全清洗:`, sanitized.report.errors)
      }

      const safeChange: SubSystemChanges = {
        ...change,
        changes: sanitized.result as Record<string, unknown>,
      }

      prepared.push(safeChange)
    }

    // Owning systems preflight the complete instruction package before any write.
    for (const change of prepared) {
      const subsystem = this.resolveSubsystem(change.id) as ISubSystem & {
        preflightChanges?: (
          value: SubSystemChanges,
          valueContext: RoundContext,
          packageChanges?: readonly SubSystemChanges[],
        ) => void
      }
      if (!subsystem.preflightChanges) continue
      try {
        subsystem.preflightChanges(change, context, prepared)
      } catch (error) {
        rejected.push({
          change,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return {
      prepared: {
        source: commit.source,
        roundSequence: commit.roundSequence,
        contextIdentity: {
          contextId: context.contextId,
          characterId: context.characterId,
          roundSequence: context.roundSequence,
          totalDays: context.totalDays,
        },
        changes: structuredClone(prepared),
      },
      rejected,
    }
  }

  commitPrepared(
    preparedCommit: PreparedRoundCommit,
    context: RoundContext,
  ): RoundCommitResult {
    const committed: SubSystemChanges[] = []
    const rejected: RoundCommitRejected[] = []
    const identity = preparedCommit.contextIdentity
    if (
      identity.contextId !== context.contextId
      || identity.characterId !== context.characterId
      || identity.roundSequence !== context.roundSequence
      || identity.totalDays !== context.totalDays
    ) {
      return {
        committed,
        rejected: preparedCommit.changes.map((change) => ({
          change,
          reason: '已预检提交包不属于当前回合上下文',
        })),
      }
    }

    for (const change of preparedCommit.changes) {
      try {
        this.applyChange(change, context)
        committed.push(change)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        rejected.push({ change, reason: msg })
      }
    }

    if (rejected.length > 0) {
      console.warn(`[RoundCommit] ${preparedCommit.source} 拒绝 ${rejected.length} 条变更`)
    }

    return { committed, rejected }
  }

  commit(commit: RoundCommit, context: RoundContext): RoundCommitResult {
    const preparation = this.prepare(commit, context)
    if (!preparation.prepared) return { committed: [], rejected: preparation.rejected }
    return this.commitPrepared(preparation.prepared, context)
  }
}
