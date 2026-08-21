/**
 * Purpose: Declare the client contract for the protected main narrative Prompt asset.
 * Owner: mod-engine
 * Responsibility: Bind the asset ID, version, and three-message dynamic input contract only.
 *
 * @module narrative-prompt.ts
 * @description 主叙事 Prompt 客户端契约 —— 服务端固定资产 + 浏览器三段动态上下文
 * @mod mod-engine
 *
 * 固定提示词由服务端资产注册表编译和注入；浏览器只按“世界、历史与角色、
 * 本轮引导”计算动态消息。第一次调用不接收系统写入契约。
 */

import type { PromptTemplate } from '@/foundation'

/** 世界本质标签的轻量参考；具体世界设定始终优先。 */
export const WORLD_RULES: Record<string, string> = {
  cultivation: '修炼可依赖境界、资源与机缘；只采用世界设定中已成立的体系和术语。',
  wuxia: '力量来自武学、内力与长期训练；江湖秩序、门派和人情后果须符合世界设定。',
  scifi: '技术能力沿着已经成立的文明水平、资源与工程条件展开。',
  westernFantasy: '魔法来源、种族与超凡规则从当前世界设定中生长。',
  modern: '现实物理与社会因果构成默认基础，超自然事实以世界设定的明确许可为成立条件。',
  postApocalyptic: '资源、生存与秩序重建构成主要压力；灾变细节以世界设定为准。',
  mythological: '神灵、信仰与神话力量只按世界设定中已建立的干预边界运行。',
  steampunk: '技术围绕既定机械、能源体系与当前工程上限发展。',
  materialist: '现象沿着该世界的客观规律形成可追踪因果。',
  materialist_cultivation: '修炼作为可观察的能量或生命现象运行，具体机制以世界设定为准。',
  idealist_cultivation: '修炼可涉及心境、因果与意境，但触发条件和代价必须来自既有设定。',
  darkFantasy: '力量伴随风险与代价，黑暗氛围由人物选择和可追踪后果共同承载。',
}

/** 公开 ID 只用于请求服务端资产；不包含任何固定 Prompt 文本。 */
export const NARRATIVE_SERVER_PROMPT_ASSET_ID = 'mod-engine:narrative:7.2.0'

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
  return rules.join('\n')
}

export const narrativePrompt: PromptTemplate = {
  name: 'narrative',
  version: '7.2.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '主叙事用户消息由统一编译器装配为世界、历史与角色、本轮引导三条标准 JSON。',
  variables: [],
  outputFormat: 'text',
}
