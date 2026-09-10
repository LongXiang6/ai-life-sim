/**
 * Purpose: Convert a main-story response into the engine's published narrative and optional terminal choice.
 * Owner: mod-engine
 * Responsibility: Parse response output only; semantic state and round application stay with their owners.
 *
 * @module narrative-parser-system.ts
 */

import { BaseSubsystem } from '@/core/subsystem-base'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'

import {
  NarrativeRoundMetadataSchema,
  type NarrativeRoundMetadata,
} from '../helpers/narrative-semantic-signals'
import {
  parseNarrativeResponseEnvelope,
  type NarrativeResponseEnvelopeOptions,
} from '../helpers/tagged-meta-envelope'
import type { NarrativeAIAttributeChanges } from '../helpers/narrative-ai-protocol'

export interface ParsedNarrative {
  narrative: string
  endingTitle?: string
  branch?: boolean
  branchTitle?: string
  branchOptions?: string[]
  attributeChanges?: NarrativeAIAttributeChanges
}

export type NarrativeEventCommitData = ParsedNarrative & NarrativeRoundMetadata

/** 校验事件识别元数据与主叙事分支是否满足同一语义契约。 */
export function validateNarrativeEventMetadataForNarrative(
  narrativePart: ParsedNarrative,
  eventMetadata: NarrativeRoundMetadata,
): void {
  NarrativeRoundMetadataSchema.parse({
    ...eventMetadata,
    ...(narrativePart.branch
      ? {
          branch: true,
          branchTitle: narrativePart.branchTitle,
          branchOptions: narrativePart.branchOptions,
        }
      : {}),
  })
}

export class NarrativeParserSystem extends BaseSubsystem {
  readonly id = 'narrative-parser' as const
  readonly mod = 'mod-engine' as const
  readonly label = '叙事解析器' as const
  readonly description = '无损识别完整正文及可选玩家分支；后台分析由独立职责调用提供' as const

  private lastResult: ParsedNarrative | null = null

  parse(content: string, options?: NarrativeResponseEnvelopeOptions): ParsedNarrative {
    const envelope = parseNarrativeResponseEnvelope(content, options)
    const result: ParsedNarrative = {
      narrative: envelope.narrative,
      ...(envelope.ending ? { endingTitle: envelope.ending.四字评语 } : {}),
      ...(envelope.branch
        ? {
            branch: true,
            branchTitle: '由你决定下一步',
            branchOptions: [...envelope.branch.选项],
        }
      : {}),
      ...(envelope.attributeChanges ? { attributeChanges: structuredClone(envelope.attributeChanges) } : {}),
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
