/**
 * @module narrative-prompt-component-types.ts
 * @description 主叙事提示词组件的本地治理契约
 * @mod mod-engine
 */

export type NarrativePromptComponentKind =
  | '目标引导'
  | '写作规则'
  | '硬限制'
  | '输出协议'
  | '流程指令'
  | '示例'
  | '格式修复'

export type NarrativePromptComponentLifecycle =
  | '全局常驻'
  | '本局常驻'
  | '缓慢更新'
  | '每轮更新'
  | '条件触发'
  | '仅修复加载'

export type NarrativePromptAuthority =
  | '世界与协议'
  | '玩家意图'
  | '当前事实'
  | '剧情引导'
  | '文风参考'

export type NarrativePromptAssemblyPosition =
  | '系统固定前缀'
  | '全局信息'
  | '记忆'
  | '本轮引导'
  | '格式修复'

export interface NarrativePromptComponent {
  id: string
  title: string
  kind: NarrativePromptComponentKind
  lifecycle: NarrativePromptComponentLifecycle
  authority: NarrativePromptAuthority
  order: number
  dependsOn: string[]
  assemblyPosition: NarrativePromptAssemblyPosition
  loadWhen: string
  exitWhen: string
  acceptanceEvidence: string
  content: string | string[]
}
