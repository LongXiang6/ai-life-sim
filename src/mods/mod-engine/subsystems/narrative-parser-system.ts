/**
 * @module narrative-parser-system.ts
 * @description 第一次叙事调用的完整正文与可选分支解析子系统
 * @mod mod-engine
 */

import { BaseSubsystem } from '@/core/subsystem-base'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'

import {
  NarrativeResponseSchema,
  type NarrativeDeferredCausality,
  type NarrativeIntentResolution,
  type NarrativeSemanticSignals,
} from '../helpers/narrative-semantic-signals'
import type { NarrativeAISettlement } from '../helpers/narrative-ai-protocol'
import { parseNarrativeResponseEnvelope } from '../helpers/tagged-meta-envelope'

export interface ParsedNarrative {
  narrative: string
  changes: SubSystemChanges[]
  notableEvents: string[]
  branch?: boolean
  branchTitle?: string
  branchOptions?: string[]
  creations?: Array<{ name: string; description: string; category: string }>
  foreshadowing?: Array<{ type: string; description: string; priority?: number }>
  importance?: 'HIGH' | 'NORMAL' | 'LOW'
  digest?: string
  keyEvents?: Array<{ text: string; importance: number; entities?: string[] }>
  arcStatus?: 'start' | 'ongoing' | 'end'
  semanticSignals?: NarrativeSemanticSignals
  intentResolution?: NarrativeIntentResolution
  deferredCausality?: NarrativeDeferredCausality[]
}

/** 将两次调用的结果合并为唯一提交候选，并统一校验条件字段。 */
export function combineNarrativeAndSettlement(
  narrativePart: ParsedNarrative,
  settlement: NarrativeAISettlement,
): ParsedNarrative {
  const combined = NarrativeResponseSchema.parse({
    ...settlement,
    ...(narrativePart.branch
      ? {
          branch: true,
          branchTitle: narrativePart.branchTitle,
          branchOptions: narrativePart.branchOptions,
        }
      : {}),
  })

  return {
    narrative: narrativePart.narrative,
    ...combined,
    notableEvents: combined.notableEvents ?? [],
  }
}

export class NarrativeParserSystem extends BaseSubsystem {
  readonly id = 'narrative-parser' as const
  readonly mod = 'mod-engine' as const
  readonly label = '叙事解析器' as const
  readonly description = '无损识别完整正文及可选玩家分支；系统结算由独立第二次调用提供' as const

  private lastResult: ParsedNarrative | null = null

  parse(content: string): ParsedNarrative {
    const envelope = parseNarrativeResponseEnvelope(content)
    const result: ParsedNarrative = {
      narrative: envelope.narrative,
      changes: [],
      notableEvents: [],
      ...(envelope.branch
        ? {
            branch: true,
            branchTitle: envelope.branch.标题,
            branchOptions: [...envelope.branch.选项],
          }
        : {}),
    }
    this.lastResult = result
    return result
  }

  getLastResult(): ParsedNarrative | null {
    return this.lastResult ? structuredClone(this.lastResult) : null
  }

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: this.lastResult ? '上次叙事分段解析成功' : '尚未解析叙事',
      data: structuredClone({ lastResult: this.lastResult }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    if (!changes.description?.trim()) throw new Error(`[${this.id}] Missing changes.description`)
  }

  reset(): void {
    this.lastResult = null
  }
}

export const narrativeParser = new NarrativeParserSystem()
