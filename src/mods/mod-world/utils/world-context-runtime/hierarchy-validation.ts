/**
 * Purpose: Validate world-context parent references and reject hierarchy cycles.
 * Owner: mod-world / world-context-registry.
 * Responsibility: Hierarchy validation only; no context creation or Store mutation.
 */

import type { WorldContextRecord } from '@/foundation'

export function assertValidWorldContextHierarchy(
  records: Readonly<Record<string, WorldContextRecord>>,
): void {
  for (const [contextId, record] of Object.entries(records)) {
    if (record.id !== contextId) throw new Error(`上下文注册键与记录 ID 不一致：${contextId}`)
    const parentContextId = record.parentContextId
    if (!parentContextId) continue
    if (parentContextId === contextId) throw new Error(`上下文不能以自身为父级：${contextId}`)
    if (!records[parentContextId]) throw new Error(`父上下文不存在：${parentContextId}`)
  }

  const completed = new Set<string>()
  for (const contextId of Object.keys(records)) {
    if (completed.has(contextId)) continue
    const path = new Set<string>()
    let cursor: string | undefined = contextId
    while (cursor) {
      if (path.has(cursor)) throw new Error(`上下文父子关系存在环：${cursor}`)
      if (completed.has(cursor)) break
      path.add(cursor)
      cursor = records[cursor]?.parentContextId
    }
    for (const visited of path) completed.add(visited)
  }
}
