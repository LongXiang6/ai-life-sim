/**
 * Purpose: Project character attribute values into stable narrative semantics.
 * Owner: mod-character
 * Responsibility: Read-only semantic mapping only; attribute owners retain calculation and state.
 */

import { clamp } from '@/core/shared'
import { TRANSCENDENT_ATTR_KEYS, TRANSCENDENT_TIER_THRESHOLDS } from '../constants'

type AttrKey = 'mind' | 'physique' | 'charisma' | 'familyBackground' | 'luck' | 'health'

/** 隐藏属性列表（传给 AI 但不展示给用户） */
export const HIDDEN_ATTRS: AttrKey[] = ['luck', 'health']

/** 可见属性 */
export const VISIBLE_ATTR_KEYS: AttrKey[] = ['mind', 'physique', 'charisma', 'familyBackground']

/** 6 项角色属性 × -10..+10 的连续语义描述；索引为属性值 + 10，0 为普通基准。 */
export const ATTR_TIER_DESCRIPTIONS: Record<AttrKey, string[]> = {
  physique: [
    '身体机能严重衰竭，日常活动也需持续照护',
    '极度虚弱，短暂活动就会疲惫或不适',
    '体质很弱，容易生病，恢复明显偏慢',
    '耐力偏低，普通劳作也容易透支',
    '力量与耐力低于常人，需要频繁休息',
    '体能略逊，持续用力时较快疲劳',
    '体质偏弱，但可以完成一般日常活动',
    '略低于普通基准，强度稍高便会吃力',
    '小幅低于常人，偶尔影响耐力和恢复',
    '略有不足，整体仍可正常活动',
    '普通基准，身体按常态运作',
    '略胜普通人，日常活动更稳定',
    '体质结实，耐力和恢复小有优势',
    '体能明显出众，能承担更长时间的劳作',
    '力量与耐力达到良好水平，较少被体力拖慢',
    '训练有素，持续活动和恢复能力显著',
    '达到专业体能水平，在多数人群中属于前列',
    '多项体能接近人类精英水平',
    '身体素质罕见，能稳定完成高强度任务',
    '几乎触及人类综合体能极限',
    '人类物种巅峰：不借助超凡力量，力量、耐力、速度与恢复达到可实现的综合极限',
  ],
  mind: [
    '认知与判断严重受损，难以维持连贯行动',
    '理解和记忆极其困难，需要持续照料或提示',
    '思维迟缓，学习与沟通明显受阻',
    '反应较慢，处理简单信息也容易出错',
    '理解力偏弱，面对复杂说明容易迷失',
    '思考速度略低，判断常需更多时间',
    '心智略弱于常人，但可处理日常问题',
    '分析复杂信息时较容易遗漏关键点',
    '小幅低于普通基准，专注久了容易疲惫',
    '略有不足，基本判断仍能稳定完成',
    '普通基准，按常态理解、记忆与判断',
    '思路较清楚，学习与判断略胜普通人',
    '理解、记忆和推理能力都有稳定优势',
    '能够较快掌握复杂知识并作出可靠判断',
    '分析与规划能力达到专业优秀水平',
    '具备少数杰出学者或战略人才的思维能力',
    '能长期处理高度复杂的信息与多重目标',
    '洞察、推理与创造性思考均接近时代顶尖',
    '在多个心智能力维度上都极其罕见',
    '几乎触及人类心智可训练与发挥的综合极限',
    '人类物种巅峰：不借助超凡力量，理解、记忆、推理、创造与决策达到可实现的综合极限',
  ],
  familyBackground: [
    '家庭资源极度匮乏，基本生活与照料都难以稳定维持',
    '成长环境极差，长期缺少可靠的生活支持',
    '家中负担沉重，日常资源经常无法满足需要',
    '家庭条件明显拮据，许多机会会被现实开支挡住',
    '可用资源偏少，遇到额外支出便容易陷入被动',
    '家中支持有限，重要事情往往需要自己想办法',
    '家庭条件略逊于常态，但基本生活仍能维持',
    '可获得的帮助不多，起步时需要更谨慎地安排',
    '资源略少，偶尔会因家境错过便利条件',
    '家中支持稍弱，整体仍能按常态生活',
    '普通家庭条件，生活资源与支持按常态提供',
    '家庭支持较稳，遇到日常困难时较容易得到帮助',
    '家中资源较充足，学习与生活安排更从容',
    '家庭条件良好，能提供稳定的教育、关系或物质支持',
    '起步资源明显优于常态，许多选择拥有更宽余的余地',
    '家族支持强，关键阶段常能提供专业或人脉帮助',
    '家庭资源优厚，成长路径拥有罕见的试错空间',
    '家族势力与财富都很突出，能持续改变你的起点条件',
    '家境极其显赫，社会资源会主动向你聚拢',
    '几乎触及当前社会结构下家庭资源的综合极限',
    '家族资源达到当前世界尺度的上限，仍受时代、关系与个人选择制约',
  ],
  charisma: [
    '外在与表达容易引起明显排斥，难以建立基本信任',
    '互动常使他人不适，几乎无法主动融入群体',
    '存在感很低，表达和仪态容易被忽略',
    '不善表达，初见时常给人冷淡或笨拙印象',
    '社交反应偏弱，常错过合适的回应时机',
    '表达和仪态略显生硬，需要更多熟悉时间',
    '魅力略低于常人，但能维持基本交往',
    '在人群中不太醒目，影响他人意愿较小',
    '小幅低于普通基准，熟人关系会更有帮助',
    '略有不足，正常相处仍可留下中性印象',
    '普通基准，外貌、气质与表达按常态发挥',
    '仪表与表达略有亲和力，容易留下尚可印象',
    '外貌、气质或谈吐中有稳定的吸引力',
    '在人群中较为醒目，社交表达自然有说服力',
    '形象与感染力达到专业优秀水平',
    '具备少数公众人物才有的综合吸引力',
    '能在多数社交场景中形成强烈而自然的存在感',
    '外貌、气质、表达与领导感染力均接近顶尖',
    '综合魅力极其罕见，常能成为群体注意中心',
    '几乎触及人类审美表现与社会感染力的综合极限',
    '人类物种巅峰：不借助超凡力量，外貌表现、气质、表达与社会感染力达到可实现的综合极限',
  ],
  luck: [
    '不利巧合极多，机会常在关键处错开；行动仍受现实因果约束',
    '坏时机频繁出现，计划容易被偶然阻碍；并非所有结果都注定失败',
    '不顺的偶然事件明显偏多，获得帮助和资源更困难',
    '事情常在临门处出现小阻碍，需要更多准备才能稳住结果',
    '好机会较少，坏消息略多，但谨慎行动仍可改善处境',
    '偶然结果略偏不利，通常需要多试几次才能遇到顺手时机',
    '气运略低于常态，机会质量与出现时机偶尔受影响',
    '随机结果稍逊于普通基准，谨慎安排可部分抵消',
    '小幅偏低，偶尔错过便利机会，但不改变行动的基本作用',
    '略有不足，整体仍按既有因果自然发展',
    '普通基准，机会与阻碍按环境、行动和关系自然出现',
    '偶尔遇到顺手时机，合理行动更容易得到小幅助力',
    '较常出现可利用的机会，但仍需要准备和行动承接',
    '关键时刻较容易遇到合适线索、援手或转机',
    '有利巧合明显增多，合理计划更容易避开次要阻碍',
    '常能在准备充分时遇到重要机会，但不会替代能力和选择',
    '机会倾向很好，资源、线索或援手更容易在合理位置出现',
    '重大机会较常以符合因果的方式出现，代价与风险仍然存在',
    '连续处境中更容易碰到转机，但错误判断仍可能带来损失',
    '气运极佳，合理行动常获得强力助势，却不能保证心想事成',
    '机缘倾向达到当前尺度的上限：机会密度很高，但世界仍按自身因果运转',
  ],
  health: [
    '生命状态极危，随时可能失去行动能力，需要紧急救治',
    '重病或重伤，日常活动大受限制，恢复需持续照护',
    '病情严重，体力和精神明显下降，短期内难以自理',
    '健康问题反复出现，已经影响正常生活与行动',
    '容易疲劳或受伤，小病不断，需要规律休养',
    '恢复速度偏慢，较难承受连续劳累或轻微伤病',
    '健康略低于常态，日常活动可以维持但余力有限',
    '小幅低于普通基准，环境变化时更容易不适',
    '略有不足，偶尔影响精力与恢复，整体仍可生活',
    '体况稍弱，需要比常人更注意休息和照护',
    '普通基准，生命状态按常态维持',
    '体况稳定，精力和恢复能力略胜普通人',
    '身体健康，较少生病，普通劳累后恢复较快',
    '体魄强健，抵抗力与伤病恢复能力都较好',
    '健康水平明显出众，能稳定承受较高强度生活',
    '生机充足，恢复速度在同类中属于前列',
    '很少受到常见小病干扰，连续劳作后的恢复也较稳',
    '生命活力罕见，常见伤病的恢复时间明显缩短',
    '健康状态接近当前物种的优良上限，但仍受伤势和环境影响',
    '体况极佳，长期行动与恢复都很稳定，不等于不会受伤或生病',
    '生命活力达到当前凡人尺度上限：恢复很快，但仍遵守实际伤势与医疗条件',
  ],
}

/** 可见属性沿用同一套 -10..+10 语义，保留旧导出名供现有调用方使用。 */
export const VISIBLE_ATTR_VALUE_DESCRIPTIONS: Readonly<Record<
  'mind' | 'physique' | 'charisma' | 'familyBackground',
  readonly string[]
>> = {
  physique: ATTR_TIER_DESCRIPTIONS.physique,
  mind: ATTR_TIER_DESCRIPTIONS.mind,
  familyBackground: ATTR_TIER_DESCRIPTIONS.familyBackground,
  charisma: ATTR_TIER_DESCRIPTIONS.charisma,
}

/**
 * 获取属性有效值对应的档位索引
 * @param value 有效值（基础值 + 修正），钳制 [-10, 10]
 * @returns 0~20 的档位索引（索引 = [-10..+10] 值 + 10）
 */
export function getAttrTierIndex(value: number): number {
  const clamped = clamp(Math.round(value), -10, 10)
  return clamped + 10
}

/** 各可超凡属性的「领域」名词（用于拼接超凡档位描述） */
const TRANSCENDENT_DOMAIN_LABELS: Record<string, { noun: string; highAdj: string; lowAdj: string }> = {
  physique:       { noun: '肉身', highAdj: '', lowAdj: '' },
  mind:           { noun: '心神', highAdj: '', lowAdj: '' },
  familyBackground: { noun: '家势', highAdj: '', lowAdj: '' },
  charisma:       { noun: '威仪', highAdj: '', lowAdj: '' },
}

/** 正向超凡分层描述（凡人上限之上） */
function transcendentPositive(key: string, value: number): string {
  const t = TRANSCENDENT_TIER_THRESHOLDS
  const noun = TRANSCENDENT_DOMAIN_LABELS[key]?.noun ?? '存在'
  if (value <= t.sage) {
    return `超凡入圣，已越人类极限，${noun}半步登神，凡俗武力再多也无法撼动`
  }
  if (value <= t.divine) {
    return `神性显化，${noun}脱离血肉桎梏，言出法随，寻常超凡者仰望而不可及`
  }
  if (value <= t.divineKing) {
    return `神王之姿，${noun}执掌一方法则，举手投足动摇山河，万灵俯首`
  }
  // 概念级：公式化生成（越高越接近"不可名状"），对齐 power-system generateNextStage 思路
  const overflow = value - t.divineKing
  const rank = Math.floor(overflow / 40) + 1
  return `概念级·第${rank}重，${noun}已升华为世界的一部分，其存在本身即是法则，凡人语言无从描述`
}

/** 负向超凡分层描述（凡人下限之下，极端残缺/衰败） */
function transcendentNegative(key: string, value: number): string {
  const noun = TRANSCENDENT_DOMAIN_LABELS[key]?.noun ?? '存在'
  const abs = Math.abs(value)
  const t = TRANSCENDENT_TIER_THRESHOLDS
  if (abs <= t.sage) {
    return `${noun}残破到凡人无法存活的地步，全靠某种超凡之力续命`
  }
  if (abs <= t.divine) {
    return `${noun}如同被诅咒的深渊，衰败到反噬周遭，接近者亦受牵累`
  }
  return `${noun}已跌入不可名状的负极，成为一种反世界的存在`
}

/**
 * 获取属性的语义描述
 * @param key 属性键名
 * @param effectiveValue 有效值
 * @returns 语义描述字符串
 *
 * 凡人区间（|v|≤10）使用 21 个等粒度语义档位；
 * 可超凡属性（TRANSCENDENT_ATTR_KEYS）超出 ±10 时走分层/公式化超凡描述。
 */
export function getAttrSemantic(key: string, effectiveValue: number): string {
  const tiers = ATTR_TIER_DESCRIPTIONS[key as AttrKey]
  if (!tiers) return '未知'

  const isTranscendent = (TRANSCENDENT_ATTR_KEYS as readonly string[]).includes(key)
  if (isTranscendent && effectiveValue > TRANSCENDENT_TIER_THRESHOLDS.mortalCap) {
    return transcendentPositive(key, effectiveValue)
  }
  if (isTranscendent && effectiveValue < -TRANSCENDENT_TIER_THRESHOLDS.mortalCap) {
    return transcendentNegative(key, effectiveValue)
  }

  const idx = getAttrTierIndex(effectiveValue)
  return tiers[idx]
}

/**
 * 获取所有属性的语义描述映射（用于构建 AI 上下文）
 * @param effectiveValues 属性键值对
 * @returns 语义描述映射
 */
export function getAllAttrSemantics(effectiveValues: Record<string, number>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(effectiveValues)) {
    result[key] = getAttrSemantic(key, value)
  }
  return result
}
