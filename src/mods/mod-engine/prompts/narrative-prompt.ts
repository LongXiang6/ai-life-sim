/**
 * @module narrative-prompt.ts
 * @description 主叙事 Prompt 客户端契约 —— 服务端固定资产 + 浏览器三段动态上下文
 * @mod mod-engine
 *
 * 固定提示词由服务端资产注册表编译和注入；浏览器只按“全局信息、记忆、
 * 本轮引导”计算动态消息。第一次调用不接收系统写入契约。
 */

import type { PromptTemplate } from '@/foundation'

/** 世界本质标签的轻量参考；具体世界设定始终优先。 */
export const WORLD_RULES: Record<string, string> = {
  cultivation: '修炼可依赖境界、资源与机缘；只采用世界设定中已成立的体系和术语。',
  wuxia: '力量来自武学、内力与长期训练；江湖秩序、门派和人情后果须符合世界设定。',
  scifi: '技术能力受文明水平、资源与工程条件约束；不得把尚未成立的技术写成既有事实。',
  westernFantasy: '魔法来源、种族与超凡规则以世界设定为准，不套用默认奇幻模板。',
  modern: '默认遵循现实物理与社会因果；除非世界设定明确允许，不引入超自然事实。',
  postApocalyptic: '资源、生存与秩序重建构成主要压力；灾变细节以世界设定为准。',
  mythological: '神灵、信仰与神话力量只按世界设定中已建立的干预边界运行。',
  steampunk: '技术围绕既定机械与能源体系发展，不凭空越过世界的工程上限。',
  materialist: '现象须能在该世界的客观规律内自洽，不以神秘词汇替代因果。',
  materialist_cultivation: '修炼作为可观察的能量或生命现象运行，具体机制以世界设定为准。',
  idealist_cultivation: '修炼可涉及心境、因果与意境，但触发条件和代价必须来自既有设定。',
  darkFantasy: '力量常伴随风险与代价；黑暗氛围不能替代人物选择和可追踪后果。',
}

/** 公开 ID 只用于请求服务端资产；不包含任何固定 Prompt 文本。 */
export const NARRATIVE_SERVER_PROMPT_ASSET_ID = 'mod-engine:narrative:5.8.2'

/**
 * 世界观参考注入函数。
 * @returns 匹配标签的轻量参考；无匹配返回空字符串。
 */
export function getWorldRules(essenceTag?: string): string {
  if (!essenceTag) return ''
  const tags = essenceTag.split('-')
  const rules = tags
    .map((tag) => WORLD_RULES[tag])
    .filter((rule): rule is string => Boolean(rule))
  if (rules.length === 0) return ''
  return `【标签参考；具体世界设定优先】\n${rules.join('\n')}`
}

export const narrativePrompt: PromptTemplate = {
  name: 'narrative',
  version: '5.8.2',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '主叙事用户消息由统一编译器装配为“全局信息、记忆、本轮引导”三段。',
  variables: [],
  outputFormat: 'text',
}
