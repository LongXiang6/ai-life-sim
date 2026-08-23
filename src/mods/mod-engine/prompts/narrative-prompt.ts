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
  easternFantasy: '灵气、宗门、妖族或神话力量只按当前世界已经确立的来源、代价与边界运行。',
  modern: '现实物理与社会因果构成默认基础，超自然事实以世界设定的明确许可为成立条件。',
  postApocalyptic: '资源、生存与秩序重建构成主要压力；灾变细节以世界设定为准。',
  survivalHorror: '生存、信息不足与持续风险构成主要压力；未知威胁依据已建立的迹象和代价逐步显现。',
  mythological: '神灵、信仰与神话力量只按世界设定中已建立的干预边界运行。',
  steampunk: '技术围绕既定机械、能源体系与当前工程上限发展。',
  materialist: '现象沿着该世界的客观规律形成可追踪因果。',
  materialist_cultivation: '修炼作为可观察的能量或生命现象运行，具体机制以世界设定为准。',
  idealist_cultivation: '修炼可涉及心境、因果与意境，触发条件和代价以既有设定为依据。',
  darkFantasy: '力量伴随风险与代价，黑暗氛围由人物选择和可追踪后果共同承载。',
  lovecraftian: '未知与不可理解的力量不凭空替代因果；其影响通过已成立的迹象、接触条件与代价呈现。',
  historical: '制度、技术、交通与信息传播遵守已成立的时代条件，人物行动受真实资源和社会关系约束。',
  mixed: '多种世界规则可以并存，每种力量、技术或社会机制各有明确来源、适用范围与相互边界。',
}

const WORLD_RULE_TAG_ALIASES: Readonly<Record<string, string>> = {
  'western-fantasy': 'westernFantasy',
  western_fantasy: 'westernFantasy',
  'eastern-fantasy': 'easternFantasy',
  eastern_fantasy: 'easternFantasy',
  'post-apocalyptic': 'postApocalyptic',
  post_apocalyptic: 'postApocalyptic',
  'survival-horror': 'survivalHorror',
  survival_horror: 'survivalHorror',
  'dark-fantasy': 'darkFantasy',
  dark_fantasy: 'darkFantasy',
  'materialist-cultivation': 'materialist_cultivation',
  'idealist-cultivation': 'idealist_cultivation',
}

/** 公开 ID 只用于请求服务端资产；不包含任何固定 Prompt 文本。 */
export const NARRATIVE_SERVER_PROMPT_ASSET_ID = 'mod-engine:narrative:7.4.0'

/**
 * 世界观参考注入函数。
 * @returns 匹配标签的轻量参考；无匹配返回空字符串。
 */
export function getWorldRules(essenceTag?: string): string {
  if (!essenceTag) return ''
  const tags = essenceTag
    .split(/[+,|]/u)
    .map((tag) => tag.trim())
    .filter(Boolean)
  const normalizedTags = tags.flatMap((tag) => {
    const directKey = WORLD_RULE_TAG_ALIASES[tag] ?? tag
    if (WORLD_RULES[directKey]) return [directKey]
    return tag.split('-').map((part) => part.trim()).filter(Boolean)
  })
  const rules = normalizedTags
    .map((tag) => WORLD_RULES[WORLD_RULE_TAG_ALIASES[tag] ?? tag])
    .filter((rule): rule is string => Boolean(rule))
  return [...new Set(rules)].join('\n')
}

export const narrativePrompt: PromptTemplate = {
  name: 'narrative',
  version: '7.4.0',
  mod: 'mod-engine',
  systemPrompt: '',
  serverPromptAssetId: NARRATIVE_SERVER_PROMPT_ASSET_ID,
  userPromptTemplate: '主叙事用户消息由统一编译器装配为世界、历史与角色、本轮引导三条标准 JSON。',
  variables: [],
  outputFormat: 'text',
}
