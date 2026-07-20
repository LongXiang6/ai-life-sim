/**
 * @module narrative-context-scope.ts
 * @description 主叙事读取侧的世界上下文作用域判定；只筛选注入，不删除源故事或记忆
 * @mod mod-engine
 */

export type NarrativeMemoryScope = 'global' | 'context' | 'travel'

export interface NarrativeScopeRecord {
  contextId?: string
  contextIds?: readonly string[]
  /** 新叙事记录使用的显式作用域字段。 */
  memoryScope?: NarrativeMemoryScope
  /** 记忆组件可使用的同义内部字段。 */
  scope?: NarrativeMemoryScope
}

export interface NarrativeScopeView {
  currentContextId?: string
  closedContextIds?: ReadonlySet<string>
}

function getRecordContextIds(record: NarrativeScopeRecord): string[] {
  return [...new Set([
    ...(record.contextIds ?? []),
    ...(record.contextId ? [record.contextId] : []),
  ].filter(Boolean))]
}

export function resolveNarrativeMemoryScope(record: NarrativeScopeRecord): NarrativeMemoryScope {
  if (record.memoryScope) return record.memoryScope
  if (record.scope) return record.scope
  return getRecordContextIds(record).length > 0 ? 'context' : 'global'
}

/**
 * global 随角色全局可见；travel 是明确允许跨上下文携带的记忆；
 * context 只在当前且未关闭的上下文直接注入。未命中的内容仍保存在原存储和摘要索引中。
 */
export function isNarrativeRecordVisible(
  record: NarrativeScopeRecord,
  view: NarrativeScopeView,
): boolean {
  const scope = resolveNarrativeMemoryScope(record)
  if (scope === 'global' || scope === 'travel') return true

  const currentContextId = view.currentContextId
  if (!currentContextId || view.closedContextIds?.has(currentContextId)) return false
  return getRecordContextIds(record).includes(currentContextId)
}

export function filterNarrativeRecordsForPrompt<T extends NarrativeScopeRecord>(
  records: readonly T[],
  view: NarrativeScopeView,
): T[] {
  return records.filter((record) => isNarrativeRecordVisible(record, view))
}
