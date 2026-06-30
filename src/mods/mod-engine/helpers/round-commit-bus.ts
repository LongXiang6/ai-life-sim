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
import { validateCrossDomainChange } from './cross-domain-change-validator'
import { getNarrativeChangeBlockReason } from './subsystem-prompt-gate'

export type RoundCommitSource =
  | 'narrative'
  | 'cross-domain'
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

export class RoundCommitBus {
  constructor(
    private readonly resolveSubsystem: (id: string) => ISubSystem | undefined,
    private readonly applyChange: (change: SubSystemChanges, context: RoundContext) => void,
  ) {}

  commit(commit: RoundCommit, context: RoundContext): RoundCommitResult {
    const committed: SubSystemChanges[] = []
    const rejected: RoundCommitRejected[] = []

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

      let change = raw
      if (commit.source === 'cross-domain') {
        const validated = validateCrossDomainChange(raw)
        if (!validated) {
          rejected.push({ change: raw, reason: 'cross-domain schema 校验失败' })
          continue
        }
        change = validated
      } else if (SCHEMA_VALIDATED_SOURCES.has(commit.source)) {
        const validated = validateChange(raw, {
          allowUnknownSubsystem: commit.source === 'post-narrative',
        })
        if (!validated) {
          rejected.push({ change: raw, reason: 'schema 校验失败' })
          continue
        }
        change = validated
      }

      if (commit.source === 'narrative') {
        const blockReason = getNarrativeChangeBlockReason(
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

      try {
        this.applyChange(safeChange, context)
        committed.push(safeChange)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        rejected.push({ change: safeChange, reason: msg })
      }
    }

    if (rejected.length > 0) {
      console.warn(`[RoundCommit] ${commit.source} 拒绝 ${rejected.length} 条变更`)
    }

    return { committed, rejected }
  }
}
