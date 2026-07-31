/**
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
import { validateChange } from './subsystem-field-registry'
import { getSystemInstructionBlockReason } from './subsystem-prompt-gate'
import { shouldApplyMvpCommit } from './mvp-runtime-policy'

export type RoundCommitSource =
  | 'narrative'
  | 'post-narrative'
  | 'world-direction'
  | 'manual'

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

const SCHEMA_VALIDATED_SOURCES: ReadonlySet<RoundCommitSource> = new Set([
  'narrative',
  'post-narrative',
])

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

function isNpcIdentityCreation(change: SubSystemChanges): boolean {
  return change.id === 'npc-system' && change.operation === 'create-identity'
}

export class RoundCommitBus {
  constructor(
    private readonly resolveSubsystem: (id: string) => ISubSystem | undefined,
    private readonly applyChange: (change: SubSystemChanges, context: RoundContext) => void,
  ) {}

  commit(commit: RoundCommit, context: RoundContext): RoundCommitResult {
    const committed: SubSystemChanges[] = []
    const rejected: RoundCommitRejected[] = []
    const prepared: SubSystemChanges[] = []

    for (const raw of commit.changes) {
      if (!raw.id) {
        rejected.push({ change: raw, reason: '空子系统 id' })
        continue
      }

      if (!shouldApplyMvpCommit(commit.source, raw.id)) {
        if (commit.source === 'narrative') {
          rejected.push({ change: raw, reason: `子系统 "${raw.id}" 不在本轮叙事可写范围` })
        }
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

      let change = raw
      if (SCHEMA_VALIDATED_SOURCES.has(commit.source)) {
        const validated = validateChange(raw, {
          allowUnknownSubsystem: commit.source === 'post-narrative',
        })
        if (!validated) {
          rejected.push({ change: raw, reason: 'schema 校验失败' })
          continue
        }
        change = validated
      }

      change = normalizeEntityAliases(change, context)

      if (commit.source === 'narrative') {
        if (!change.targetObjectId || !change.targetContextId || !change.operation) {
          rejected.push({ change, reason: '系统指令缺少稳定目标对象、目标上下文或标准操作' })
          continue
        }
        if (change.targetContextId !== context.contextId) {
          rejected.push({ change, reason: '系统指令目标上下文不是当前回合上下文' })
          continue
        }
        const blockReason = getSystemInstructionBlockReason(
          change.id,
          change.changes ?? {},
          context,
        )
        if (blockReason) {
          rejected.push({ change, reason: blockReason })
          continue
        }
      }

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

    // 主叙事必须先完成整包预检；任一项失败时，在任何子系统写入前拒绝全部变更。
    if (commit.source === 'narrative' && rejected.length > 0) {
      console.warn(`[RoundCommit] narrative 预检失败，整包拒绝 ${commit.changes.length} 条变更`)
      return { committed: [], rejected }
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
    if (commit.source === 'narrative' && rejected.length > 0) {
      console.warn(`[RoundCommit] 系统指令 owning system 预检失败，整包拒绝 ${commit.changes.length} 条变更`)
      return { committed: [], rejected }
    }

    // 创建身份必须先于同包中依赖该身份的操作；排序是显式契约，
    // 不依赖模型返回数组的自然顺序。
    const applyOrder = [...prepared].sort((left, right) => (
      Number(isNpcIdentityCreation(right)) - Number(isNpcIdentityCreation(left))
    ))

    for (const change of applyOrder) {
      try {
        this.applyChange(change, context)
        committed.push(change)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        rejected.push({ change, reason: msg })
        if (commit.source === 'narrative') break
      }
    }

    if (rejected.length > 0) {
      console.warn(`[RoundCommit] ${commit.source} 拒绝 ${rejected.length} 条变更`)
    }

    return { committed, rejected }
  }
}
