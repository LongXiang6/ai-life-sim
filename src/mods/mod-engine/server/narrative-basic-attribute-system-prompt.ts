/**
 * @module narrative-basic-attribute-system-prompt.ts
 * @description 基础属性分析的服务端固定 Prompt 资产
 * @mod mod-engine
 */

import { getNarrativeAISubsystemContract } from '../helpers/subsystem-field-registry'
import { VISIBLE_ATTR_VALUE_DESCRIPTIONS } from '@/mods/mod-character'

const ATTRIBUTE_SCALE_LABELS = {
  physique: '体魄',
  mind: '心智',
  talentAptitude: '悟性',
  charisma: '魅力',
} as const

function buildCanonicalAttributeScale(): Record<string, Record<string, string>> {
  return Object.fromEntries(Object.entries(VISIBLE_ATTR_VALUE_DESCRIPTIONS).map(([key, values]) => [
    ATTRIBUTE_SCALE_LABELS[key as keyof typeof ATTRIBUTE_SCALE_LABELS],
    Object.fromEntries(values.map((description, value) => [String(value), description])),
  ]))
}

export function buildNarrativeBasicAttributeContractLine(): string {
  const contract = getNarrativeAISubsystemContract('character-base')
  return `⟦基础属性契约⟧${JSON.stringify({
    系统: contract.aiName,
    目标对象: 'player:current',
    操作: contract.operations,
    字段规则: Object.fromEntries(
      Object.values(contract.fields).map((field) => [field.aiName, field.description]),
    ),
  })}`
}

export function buildNarrativeBasicAttributeStandardExample(): string {
  return JSON.stringify({ 系统操作: [] })
}

export const COMPILED_NARRATIVE_BASIC_ATTRIBUTE_SYSTEM_PROMPT = [
  '你是人生模拟器的基础属性分析器。只判断本轮故事是否已经建立体魄、心智、悟性或魅力的持久基础变化；不续写故事，不分析其他系统。',
  '基础值一般不变。只有最近故事明确建立跨时间持续、已经稳定形成且属于角色自身的基础改变时才能提交增量；改变可以增加或降低。一时疲劳、情绪、装备、伤病、种族、命格、生命周期和上下文效果都属于修正或其他所有者，不得改写基础值。',
  '必须完整读取角色画像中的身份、背景、命格、物种或生命形态、生命周期阶段、基础值、当前值、聚合修正、上下文修正、起始年龄和当前语义，并用最近故事区分持久改变与临时状态。',
  '属性标尺以基础属性系统为唯一解释：0 是平平无奇，10 是不借助超凡力量的人类物种巅峰，只有实际值大于 10 才属于超凡。不得因种族、命格、生命周期、伤病、装备或临时表现把修正误写为基础值。',
  `⟦基础属性完整标尺⟧${JSON.stringify(buildCanonicalAttributeScale())}`,
  '有变化时只输出一条基础属性增量操作，变更字段只能是体魄变化、心智变化、悟性变化、魅力变化中的非零整数。无持久变化时返回空系统操作数组。',
  '输出只能是一个合法 JSON 对象，根对象只含“系统操作”数组。禁止代码块、标签、标题、解释和结束标记。',
  buildNarrativeBasicAttributeContractLine(),
  '中性格式示例；空数组只展示无持久变化时的合法结构，实际内容必须由本轮事实决定：',
  buildNarrativeBasicAttributeStandardExample(),
].join('\n')
