/**
 * Purpose: Define the conditional narrative control-plane contracts.
 * Owner: foundation:types
 * Responsibility: Shared shapes only; generation, selection, and persistence stay in mod-engine.
 */

import type { DifficultyLevel } from './difficulty'

export interface NarrativeBirthProfile {
  出生地点: string
  家庭结构: string
  照料者: string
  家庭资源: string
  社会处境: string
  机会: string[]
  限制: string[]
  /** 可直接阅读的出生开场，只覆盖出生与早期处境，不写未来剧情。 */
  叙事背景: string
  /** 起始年龄大于零时，记录出生后至玩家介入时点的既往人生。 */
  介入前史?: string
  sourceFingerprint: string
}

export interface NarrativeLifePlan {
  阶段标识: string
  当前阶段: string
  阶段目标: string
  未解决目标: string[]
  关系与资源变化: string[]
  下一阶段入口: string[]
  阶段转移条件: string[]
  sourceFingerprint: string
}

/**
 * 抽象事件卡：一个可以被写成完全不同剧情的世界可能。
 * 只有名称进入主叙事投影；正负、权重与指纹只留在本地校验与消费扣卡。
 */
export interface NarrativeEventCard {
  id: string
  /** 抽象事件名，2–8 个字符，不含剧情、后果与玩法。 */
  名称: string
  正负: '正' | '负' | '双面'
  /** 1–5，只作为本地标签，不参与抽取。 */
  权重: number
  sourceFingerprint: string
}

/** 赋予剧情戏剧张力与命运无常感的命运转折调性（第四维） */
export type FateDramaticBias =
  | 'blessing_curse_twist' // 福祸相依
  | 'dramatic_irony'       // 阴差阳错
  | 'backfire_cost'        // 代价反噬
  | 'comic_deflation'      // 滑稽落空
  | 'perilous_opening'     // 危局寻隙

export const FATE_DRAMATIC_BIAS_LABELS: Record<FateDramaticBias, string> = {
  blessing_curse_twist: '福祸相依',
  dramatic_irony: '阴差阳错',
  backfire_cost: '代价反噬',
  comic_deflation: '滑稽落空',
  perilous_opening: '危局寻隙',
}

export const FATE_DRAMATIC_BIASES: readonly FateDramaticBias[] = [
  'blessing_curse_twist',
  'dramatic_irony',
  'backfire_cost',
  'comic_deflation',
  'perilous_opening',
] as const

export interface NarrativeWorldTimelineCommitment {
  id: string
  事件名称: string
  目标年龄: number
  影响范围: string
  因果前提: string
  玩家关联条件: string
  触发状态: 'scheduled' | 'due' | 'consumed' | 'invalidated'
  sourceFingerprint: string
}

export interface NarrativeControlPlaneView {
  /** 本轮叙事难度与仅供叙述核心使用的隐藏命运偏向。 */
  difficulty?: DifficultyLevel
  difficultyGuidance?: string
  birthProfile?: NarrativeBirthProfile
  lifePlan?: NarrativeLifePlan
  /** 当前可用事件卡池：按指纹与合龄过滤后的整池，交由主故事自行判断是否/何时消费。 */
  eventCards: NarrativeEventCard[]
  dueWorldEvents: NarrativeWorldTimelineCommitment[]
  /** 本轮命运转折调性（第四维） */
  dramaticBias?: FateDramaticBias
  /** 命运转折调性中文标签 */
  dramaticBiasLabel?: string
}
