import type { SubSystemChanges } from '@/foundation'

export interface RawNarrativeChange {
  id?: string
  targetObjectId?: string
  targetContextId?: string
  operation?: string
  evidenceEventIds?: string[]
  description?: string
  changes?: Record<string, unknown>
}

/**
 * 解析阶段只做无损结构映射；不得在整包校验之前过滤任何变更项。
 */
export function mapRawNarrativeChanges(
  changes: RawNarrativeChange[] | undefined,
): SubSystemChanges[] {
  return (changes ?? []).map((change) => ({
    id: change.id ?? '',
    targetObjectId: change.targetObjectId,
    targetContextId: change.targetContextId,
    operation: change.operation,
    evidenceEventIds: change.evidenceEventIds ? [...change.evidenceEventIds] : undefined,
    description: change.description ?? '',
    changes: change.changes ?? {},
  }))
}
