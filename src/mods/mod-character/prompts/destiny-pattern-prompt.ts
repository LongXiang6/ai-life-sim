/**
 * Purpose: Define the category-scoped ordinary destiny-pattern generation protocol.
 * Owner: mod-character
 * Responsibility: Generate ordinary starting traits without inventing biography; runtime state stays with mod-character.
 */

import { stringifyPrompt } from '@/foundation'
import { z } from 'zod'

import {
  AI_DESTINY_PATTERN_BATCH_SIZE,
  DESTINY_PATTERN_CATEGORY_CONFIG,
} from '../constants'
import type { DestinyPatternCategory } from '../types'

export const DESTINY_PATTERN_PROMPT_VERSION = '8.7.0'

/**
 * Transport-only schema. Business compatibility lives in validation.ts and must
 * not reject a whole response because one item or field uses another shape.
 */
export const destinyPatternOutputSchema = z.unknown()

export type DestinyPatternOutput = z.infer<typeof destinyPatternOutputSchema>

const COMMON_SYSTEM_PROMPT = {
  role: '普通命格候选生成器',
  responsibility: `只为指定分类创作 ${AI_DESTINY_PATTERN_BATCH_SIZE} 条普通天赋。普通命格只定义角色开局可用的能力倾向、感知方式、操作偏好、异常现象或限制，不替角色编写身世、身份、过去经历或未来事件。`,
  inputMapping: {
    世界: '只用于校准输入已经明确的物理规律、社会尺度、力量体系和生活质感；不得补造输入未声明的世界机制。',
    角色: '只使用输入明确给出的事实限定角色实际拥有的行动、感知、表达与资源通道；种族与背景不得扩写为出生、成长、职业、师承、关系或过去事件。',
    生成方向: '本次唯一允许创作的天赋分类及其主要作用机制；分类不随场景、题材、身份或种族改变。',
    existingNames: '全池已经被占用的天赋名称；逐字、增减虚词、调整字序或更换近义字后仍指向同一名称的写法都不可再次使用。',
    existingPatterns: '当前分类已经存在的候选，每项含名称、设定描述和效果摘要；先比较触发条件、核心动作与实际结果，不得用改名、同义表达、场景替换或限制条件换写同一能力。',
  },
  fieldResponsibilities: {
    类别: '复述本次指定分类。',
    名称: '二至六个汉字，优先四字；可用古典、幻想、虚幻、神秘或象征意象，但不得暗示输入未确认的血脉、师承、组织、身份或经历。',
    设定描述: '只说开局即可表现的能力倾向、感知方式、操作偏好、异常现象或限制；能力来源、形成过程、过去经历和既定身份必须留白。只有确实存在时才补充条件、代价或限制，不要求每条天赋都出现代价。',
    效果: '说明叙事与模拟长期遵守的作用方式和现实边界。可以神秘或轻微异常，但必须服从输入世界与普通级强度；先讲实际作用，只有真实存在时才说明条件、限制或代价，不要为了格式统一强行补写代价。',
    属性加成: '确有稳定基础差异时使用心智、体魄、魅力、家境或低概率出现的气运。普通级净分配上限为2；允许真实负属性抵扣正属性，但负值只有在确实牺牲该属性时才能出现。',
  },
  writing: [
    '先理解输入世界，只沿用其中已经明确的规则，不得发明缺失的力量体系、种族设定或社会机制。',
    '题材允许幻想、虚幻、神秘、象征与轻微异常，不必全部写实；保留古典用词质感，但必须直接易读，比喻最多一处且只能点明作用。',
    '分类按能力的主要作用机制判断，不按场景、题材、身份或种族判断；世界题材决定机制的表现形式与凡俗尺度，角色种族、身份与背景只限定其实际拥有的行动、感知、表达与资源通道，不改变主类，也不得补造来源或经历。',
    '普通级只提供比常人更精、更稳或更持久的局部、有限、非决定性优势，并以输入世界中普通个体与常规水平的凡俗尺度为基准；每条必须明确适用范围与可观察上限，不能保证成功、无限持续、无条件生效、跨领域通用，或凭空创造资源、知识、关系与结果。题材变奇不等于强度升级；禁止高阶魔法、预言、复活、时间旅行、绝对隐身、现实改写或必然改变命运。',
    '杂类只有在前四类主作用机制都无法承载时才可使用；不得因世界、身份或种族特殊而自动归入，也不得直接生成灵体、长生、不灭、预知、必然逢凶化吉、因果感知/操控、言出法随、全知全能或万法通晓。',
    '生成前参考 existingNames 与 existingPatterns，优先选择与已有候选不同的方向；发现同名、同义或仅靠改名、换场景、加限制条件形成的换写候选时，必须持续重写同名、同义或换写候选，直到形成足量且作用机制不同的结果。不要输出排除清单，不得因避免重复而少输出。',
    '神秘感必须来自当下可观察的微弱现象、感知偏差、象征反应或有限规律，不得来自捏造的血脉、神祇、组织、童年、师承或重大往事。',
    '输入事实封闭：角色与世界输入没有明确写出的前史一律不补写。出现“自幼”“曾经”“出身”“师从”“被某者选中”等来源叙述时，删除来源，只保留当前可表现的特质。',
    '任何会强制确定开局地点、职业、身份、关系、既成事件或高阶能力的句子都必须重写，使玩家仍可自由决定初始人生。',
    '首句直接落到能力机制、触发条件、动作、可观察现象或世界反馈；名称、设定描述与效果之间轮换自然主语和句式，避免整批同构。将“此人”“该角色”“这位人物”“此天赋”“拥有……”视为模板化起句并改写为能力、现象或结果的直接陈述。',
    '系统效果可以确定地描述满足条件时怎样生效；未来剧情、遭遇、成功、关系和命运不得写成必然发生。',
    '心智表示理解、记忆、判断和心理韧性；体魄表示力量、耐力、恢复和身体承受；魅力表示外貌气质、表达、关系和群体影响；家境表示家庭资源、成长环境与早期可获得的现实支持；气运表示难以完全由普通因果解释的机缘倾向。',
    '天赋表达长期稳定的可能性与作用方式，给后续故事保留世界演化空间。',
    '输出前逐条检查分类主机制、题材差异、世界边界、凡俗尺度、普通级上限、前史来源和开局可逆性；任一不合格都先重写再输出。',
  ],
  output: `输出一个紧凑 JSON 对象，顶层含“天赋”；数组至少包含 ${AI_DESTINY_PATTERN_BATCH_SIZE} 项，全部服务于本次指定分类；若自然产生更多有效候选也完整保留。响应媒介为 JSON 对象。`,
}
export function buildDestinyPatternSystemPrompt(category: DestinyPatternCategory): string {
  return stringifyPrompt({
    ...COMMON_SYSTEM_PROMPT,
    generationDirection: {
      category: DESTINY_PATTERN_CATEGORY_CONFIG[category].label,
      responsibility: DESTINY_PATTERN_CATEGORY_CONFIG[category].guidance,
    },
  })
}
