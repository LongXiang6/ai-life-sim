import type { SubSystemChanges } from '@/foundation'

export interface RawNarrativeChange {
  id?: string
  description?: string
  changes?: Record<string, unknown>
}

/**
 * 解析阶段只做无损结构映射；不得在整包拦截器之前过滤任何变更项。
 */
export function mapRawNarrativeChanges(
  changes: RawNarrativeChange[] | undefined,
): SubSystemChanges[] {
  return (changes ?? []).map((change) => ({
    id: change.id ?? '',
    description: change.description ?? '',
    changes: change.changes ?? {},
  }))
}
