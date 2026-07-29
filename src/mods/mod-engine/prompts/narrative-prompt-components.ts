/**
 * @module narrative-prompt-components.ts
 * @description 浏览器侧只装配本轮动态提示；固定主叙事资产由服务端拥有。
 * @mod mod-engine
 */

import type { NarrativePromptComponent } from '../helpers/narrative-prompt-component-types'

/** 动态组件按权威与顺序装配为紧凑文本；组件元数据只供本地治理，不发送给 AI。 */
export function compileNarrativeDynamicComponents(
  components: readonly NarrativePromptComponent[],
): string | undefined {
  const seenIds = new Set<string>()
  const seenContent = new Set<string>()
  const parts: string[] = []
  for (const component of [...components].sort((a, b) => a.order - b.order)) {
    if (seenIds.has(component.id)) {
      throw new Error(`主叙事动态提示词组件重复：${component.id}`)
    }
    seenIds.add(component.id)
    const content = Array.isArray(component.content)
      ? component.content.join('\n')
      : component.content
    const normalized = content.replace(/\r\n?/gu, '\n').trim()
    if (normalized && !seenContent.has(normalized)) {
      seenContent.add(normalized)
      parts.push(normalized)
    }
  }
  return parts.length > 0 ? parts.join('\n') : undefined
}
