/**
 * @module attr-tiers.ts
 * @description 属性语义映射表，将属性数值转换为自然语言描述（对齐废弃项目 attr-tiers.ts）
 * @mod mod-character
 */

import { clamp } from '@/core/shared'
import { TRANSCENDENT_ATTR_KEYS, TRANSCENDENT_TIER_THRESHOLDS } from '../constants'

type AttrKey = 'physique' | 'mind' | 'talentAptitude' | 'charisma' | 'luck' | 'morality' | 'health'

/** 隐藏属性列表（传给 AI 但不展示给用户） */
export const HIDDEN_ATTRS: AttrKey[] = ['luck', 'morality', 'health']

/** 可见属性 */
export const VISIBLE_ATTR_KEYS: AttrKey[] = ['physique', 'mind', 'talentAptitude', 'charisma']

/** 7项角色属性 × 11档语义描述（索引0最差，5平平无奇，10最好） */
export const ATTR_TIER_DESCRIPTIONS: Record<AttrKey, string[]> = {
  physique: [
    '瘫痪在床，命悬一线，随时可能死去',
    '极度虚弱，常年抱病，风一吹就倒',
    '体弱多病，弱不禁风，走几步就喘',
    '体质偏弱，精力不足，容易疲惫',
    '有点虚，容易疲劳，干不了重活',
    '平平无奇',
    '身体匀称，健康活力，精力充沛',
    '强壮有力，耐力出众，以一当十',
    '筋骨强健，远胜常人，肉身如铁',
    '天赋异禀，万人难敌，肉身成圣之姿',
    '超凡脱俗，宛如神明，肉身不朽不灭',
  ],
  mind: [
    '神志不清，浑浑噩噩，如同行尸走肉',
    '智力低下，难以沟通，基本认知障碍',
    '思维迟钝，学习困难，理解能力极差',
    '不太聪明，反应稍慢，脑子转不过弯',
    '脑袋不太灵光，容易被人忽悠',
    '平平无奇',
    '头脑灵活，思路清晰，反应机敏',
    '聪明过人，善于谋略，洞察人心',
    '智慧超群，算无遗策，运筹帷幄',
    '天资聪颖，举一反三，智计百出',
    '算尽天机，智近乎妖，未卜先知',
  ],
  talentAptitude: [
    '朽木不可雕，扶不上墙的烂泥',
    '不开窍，学什么都很慢，教都教不会',
    '悟性较差，需加倍努力才能勉强跟上',
    '资质平庸，中规中矩，没有亮点',
    '学东西比较慢，需要比别人多花时间',
    '平平无奇',
    '有点悟性，一点就通，学东西很快',
    '悟性不错，举一反三，触类旁通',
    '悟性极佳，人中龙凤，天生吃这碗饭',
    '百年一遇的奇才，妖孽般的学习能力',
    '万中无一的绝世悟性，闻一知十，无师自通',
  ],
  charisma: [
    '面目可憎，令人作呕，靠近就让人不适',
    '其貌不扬，毫无存在感，被人无视',
    '长相普通，不引人注目，过目就忘',
    '不太起眼，丢进人群就找不到',
    '有点不起眼，没什么存在感',
    '平平无奇',
    '五官端正，看着舒服，第一印象不错',
    '相貌出众，颇有魅力，容易获得好感',
    '俊朗不凡，引人注目，走到哪都是焦点',
    '倾国倾城，一见难忘，让人心甘情愿追随',
    '绝世容颜，颠倒众生，一颦一笑牵动人心',
  ],
  luck: [
    '天厌之人，整个世界都在与你为敌，万物都在想方设法让你毁灭',
    '霉运缠身，喝凉水都塞牙，走在路上都怕被雷劈',
    '运气极差，诸事不顺，努力了也白费',
    '运气较差，常有小灾小难，做啥啥不成',
    '运气略差，好事轮不到你，坏事躲不掉',
    '平平无奇',
    '运气尚可，小有福缘，偶尔捡个漏',
    '运气不错，常有惊喜，关键时刻总有人拉一把',
    '鸿运当头，逢凶化吉，绝处逢生',
    '气运加身，遇难成祥，天上掉馅饼的好事总能碰上',
    '天命之子，心想事成，整个世界的运转都在为你铺路',
  ],
  morality: [
    '十恶不赦，人神共愤，天下人人得而诛之',
    '恶贯满盈，丧尽天良，走到哪都被唾弃',
    '心狠手辣，无恶不作，周围人敢怒不敢言',
    '自私自利，不择手段，为了目的什么都干得出来',
    '有点自私，偶尔占点小便宜，不算好人也不算坏人',
    '平平无奇',
    '心地善良，乐于助人，会顺手帮一把',
    '为人正直，行侠仗义，路见不平一声吼',
    '大善之人，仁心济世，名声响亮受人敬重',
    '万家生佛，救苦救难，走到哪都有人感恩戴德',
    '圣人出世，感化众生，天地为之动容',
  ],
  health: [
    '濒临死亡，命悬一线，器官全面衰竭，随时可能死去',
    '病入膏肓，卧床不起，生机微弱，需要持续治疗',
    '重病缠身，行动困难，元气大伤，不治疗会持续恶化',
    '身体抱恙，时常生病，精力不济，影响正常生活',
    '亚健康状态，容易疲劳，小病不断，需要休养',
    '平平无奇，体格一般，无病无痛也无特别强健',
    '身体健康，精力充沛，很少生病',
    '体魄强健，抵抗力好，伤病恢复快',
    '非常健康，耐力十足，极少患病，伤口愈合迅速',
    '生机旺盛，百病不侵，恢复力惊人',
    '生命活力充沛，近乎不坏之身，伤病转瞬即愈',
  ],
}

/**
 * 获取属性有效值对应的档位索引
 * @param value 有效值（基础值 + 修正），钳制 [-10, 10]
 * @returns 0~10 的档位索引
 */
export function getAttrTierIndex(value: number): number {
  const clamped = clamp(Math.round(value), -10, 10)
  if (clamped >= 9) return 10
  if (clamped >= 7) return 9
  if (clamped >= 5) return 8
  if (clamped >= 3) return 7
  if (clamped >= 1) return 6
  if (clamped === 0) return 5
  if (clamped >= -1) return 4
  if (clamped >= -3) return 3
  if (clamped >= -5) return 2
  if (clamped >= -7) return 1
  return 0
}

/** 各可超凡属性的「领域」名词（用于拼接超凡档位描述） */
const TRANSCENDENT_DOMAIN_LABELS: Record<string, { noun: string; highAdj: string; lowAdj: string }> = {
  physique:       { noun: '肉身', highAdj: '', lowAdj: '' },
  mind:           { noun: '心神', highAdj: '', lowAdj: '' },
  talentAptitude: { noun: '道基', highAdj: '', lowAdj: '' },
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
 * 凡人区间（|v|≤10）沿用 11 档 ATTR_TIER_DESCRIPTIONS；
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
