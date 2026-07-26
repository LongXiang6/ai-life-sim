/**
 * @module narrative-ai-input-view.ts
 * @description 将内部世界与角色对象投影为主叙事 AI 所需的精简中文视图
 * @mod mod-engine
 */

import type { CharacterState, WorldSetting } from '@/foundation'

const GENDER_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
  man: '男',
  woman: '女',
  other: '其他',
  unknown: '未设定',
}

const CONTEXT_KIND_LABELS: Record<string, string> = {
  'campaign-root': '存档根',
  world: '世界',
  universe: '宇宙',
  plane: '位面',
  galaxy: '星系',
  planet: '星球',
  continent: '大陆',
  region: '区域',
  settlement: '聚落',
  scene: '场景',
  vehicle: '载具',
  dream: '梦境',
  digital: '数字空间',
  abstract: '抽象空间',
}

const SCOPE_LABELS: Record<string, string> = {
  active: '当前完整模拟',
  background: '后台聚合',
  dormant: '休眠冻结',
  closed: '关闭',
}

const CAPABILITY_LABELS: Record<string, string> = {
  life: '生命',
  space: '空间',
  npc: '个体角色',
  economy: '经济',
  politics: '政治',
  technology: '科技',
  supernatural: '超凡',
}

export interface NarrativeAIWorldView extends Record<string, unknown> {
  当前上下文类型: string
  当前模拟范围: string
  当前世界能力: string[]
  世界名称: string
  世界描述: string
  当前历法: string
}

export interface NarrativeAICharacterProfileView extends Record<string, unknown> {
  姓名: string
  性别: string
  背景: string
}

export interface NarrativeAICharacterStatusView extends Record<string, unknown> {
  年龄: number
}

export function projectWorldSettingForNarrativeAI(
  worldSetting: WorldSetting,
  narrativeTime?: {
    calendarName: string
    eraLabel: string
    month: number
    seasonName: string
  },
): NarrativeAIWorldView {
  return {
    当前上下文类型: CONTEXT_KIND_LABELS[worldSetting.contextKind] ?? '世界',
    当前模拟范围: SCOPE_LABELS[worldSetting.simulationScope] ?? '当前完整模拟',
    当前世界能力: (worldSetting.capabilityProfile?.capabilities ?? []).map(
      (capability) => CAPABILITY_LABELS[capability] ?? '其他',
    ),
    世界名称: worldSetting.name,
    世界描述: worldSetting.description,
    当前历法: narrativeTime?.calendarName ?? '当地历法',
  }
}

export function projectCharacterForNarrativeAI(
  character: CharacterState,
): {
  profile: NarrativeAICharacterProfileView
  status: NarrativeAICharacterStatusView
} {
  const rawGender = character.gender?.trim() ?? ''
  return {
    profile: {
      姓名: character.name,
      性别: (GENDER_LABELS[rawGender] ?? rawGender) || '未设定',
      背景: character.background,
    },
    status: {
      年龄: character.age,
    },
  }
}
