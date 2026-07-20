/**
 * @module narrative-prompt-components.ts
 * @description 浏览器侧只装配本轮动态提示；固定主叙事资产由服务端拥有。
 * @mod mod-engine
 */

import type { NarrativePromptComponent } from '../helpers/narrative-prompt-component-types'

/** 将一次性格式修复声明为仅修复调用加载的动态组件。 */
export function createNarrativeRepairComponent(content: string): NarrativePromptComponent {
  return {
    id: 'narrative-format-repair',
    title: '格式修复',
    kind: '格式修复',
    lifecycle: '仅修复加载',
    authority: '世界与协议',
    order: 10,
    dependsOn: ['失败原因', '上一版完整输出', '中文输出协议'],
    assemblyPosition: '格式修复',
    loadWhen: '首轮输出未通过协议信封、中文 Schema、命运意图或三段结构门禁',
    exitWhen: '一次完整格式修复调用结束',
    acceptanceEvidence: 'npm run test:narrative-protocol && npm run validate:narrative',
    content,
  }
}

/** 动态组件按权威与顺序装配为紧凑文本；组件元数据只供本地治理，不发送给 AI。 */
export function compileNarrativeDynamicComponents(
  components: readonly NarrativePromptComponent[],
): string | undefined {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const component of [...components].sort((a, b) => a.order - b.order)) {
    if (seen.has(component.id)) {
      throw new Error(`主叙事动态提示词组件重复：${component.id}`)
    }
    seen.add(component.id)
    const content = Array.isArray(component.content)
      ? component.content.join('\n')
      : component.content
    if (content.trim()) parts.push(content.trim())
  }
  return parts.length > 0 ? parts.join('\n') : undefined
}
