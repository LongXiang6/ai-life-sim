/**
 * Purpose: Project world and character state into the main-story AI input view.
 * Owner: mod-engine
 * Responsibility: Read-only narrative projection only; source systems retain state ownership.
 */

import type { CharacterState, WorldSetting } from '@/foundation'
import { getAttrSemantic } from '@/mods/mod-character'

const GENDER_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
  man: '男',
  woman: '女',
  other: '其他',
  unknown: '未设定',
}

export interface NarrativeAIWorldView extends Record<string, unknown> {
  名称: string
  描述: string
  /** Prompt-facing fixed calendar and scope labels; source world state remains elsewhere. */
  当前历法: '统一游戏历法'
  当前上下文类型: string
  当前模拟范围: string
}

export interface NarrativeAICharacterProfileView extends Record<string, unknown> {
  姓名: string
  性别: string
  种族: string
  背景: string
  基础属性: NarrativeAICharacterBaseAttributesView
}

export interface NarrativeAICharacterStatusView extends Record<string, unknown> {
  年龄: number
  属性数值: Record<NarrativeAttributeKey, number>
}

type NarrativeAttributeKey = 'mind' | 'physique' | 'charisma' | 'familyBackground'

export interface NarrativeAICharacterBaseState {
  base: Record<NarrativeAttributeKey, number>
  current: Record<NarrativeAttributeKey, number>
  modifiers: Record<NarrativeAttributeKey, number>
  status?: { fortune?: { value?: number } }
}

export interface NarrativeAIAttributeSemanticSet extends Record<string, unknown> {
  心智: string
  体魄: string
  魅力: string
  家境: string
  气运: string
}

export interface NarrativeAICharacterBaseAttributesView extends Record<string, unknown> {
  开局自带: NarrativeAIAttributeSemanticSet
  天赋加成后?: NarrativeAIAttributeSemanticSet
}

const CHARACTER_ATTRIBUTE_DEFINITIONS: Readonly<Record<
  NarrativeAttributeKey,
  { label: string }
>> = {
  mind: { label: '心智' },
  physique: { label: '体魄' },
  charisma: { label: '魅力' },
  familyBackground: { label: '家境' },
}

function projectCharacterBaseAttributes(
  state: NarrativeAICharacterBaseState,
  projection: {
    openingModifiers?: Partial<Record<NarrativeAttributeKey, number>>
    openingLuckBonus?: number
    currentLuckBonus?: number
    hasInLifeTalentGrowth?: boolean
  } = {},
): NarrativeAICharacterBaseAttributesView {
  const opening: Partial<NarrativeAIAttributeSemanticSet> = {}
  const current: Partial<NarrativeAIAttributeSemanticSet> = {}

  for (const [key, definition] of Object.entries(CHARACTER_ATTRIBUTE_DEFINITIONS) as Array<[
    NarrativeAttributeKey,
    { label: string },
  ]>) {
    const currentValue = state.current?.[key]
    if (!Number.isFinite(currentValue)) {
      throw new Error(`角色基础属性缺少完整的${definition.label}当前值`)
    }
    const baseValue = state.base?.[key]
    if (!Number.isFinite(baseValue)) {
      throw new Error(`角色基础属性缺少完整的${definition.label}开局值`)
    }
    opening[definition.label as keyof NarrativeAIAttributeSemanticSet] = getAttrSemantic(
      key,
      baseValue + Number(projection.openingModifiers?.[key] ?? 0),
    )
    current[definition.label as keyof NarrativeAIAttributeSemanticSet] = getAttrSemantic(
      key,
      currentValue,
    )
  }

  const fortuneValue = Number(state.status?.fortune?.value ?? 0)
  opening.气运 = getAttrSemantic('luck', fortuneValue + Number(projection.openingLuckBonus ?? 0))
  current.气运 = getAttrSemantic('luck', fortuneValue + Number(projection.currentLuckBonus ?? 0))

  return {
    开局自带: opening as NarrativeAIAttributeSemanticSet,
    ...(projection.hasInLifeTalentGrowth
      ? { 天赋加成后: current as NarrativeAIAttributeSemanticSet }
      : {}),
  }
}

export function projectWorldSettingForNarrativeAI(
  worldSetting: WorldSetting,
): NarrativeAIWorldView {
  const contextKindLabels: Record<WorldSetting['contextKind'], string> = {
    'campaign-root': '战役',
    universe: '宇宙',
    galaxy: '星系',
    planet: '行星',
    plane: '位面',
    world: '世界',
    continent: '大陆',
    region: '区域',
    settlement: '聚落',
    scene: '场景',
    vehicle: '载具',
    dream: '梦境',
    digital: '数字空间',
    abstract: '抽象空间',
  }
  const scopeLabels: Record<WorldSetting['simulationScope'], string> = {
    active: '当前完整模拟',
    background: '后台世界模拟',
    dormant: '休眠世界模拟',
    closed: '已关闭世界',
  }
  return {
    名称: worldSetting.name,
    描述: worldSetting.description,
    当前历法: '统一游戏历法',
    当前上下文类型: contextKindLabels[worldSetting.contextKind] ?? '世界',
    当前模拟范围: scopeLabels[worldSetting.simulationScope] ?? '当前完整模拟',
  }
}

export function projectCharacterForNarrativeAI(
  character: CharacterState,
  baseState: NarrativeAICharacterBaseState,
  projection: {
    openingModifiers?: Partial<Record<NarrativeAttributeKey, number>>
    openingLuckBonus?: number
    currentLuckBonus?: number
    hasInLifeTalentGrowth?: boolean
  } = {},
  raceName = '未设定',
): {
  profile: NarrativeAICharacterProfileView
  status: NarrativeAICharacterStatusView
} {
  const rawGender = character.gender?.trim() ?? ''
  return {
    profile: {
      姓名: character.name,
      性别: (GENDER_LABELS[rawGender] ?? rawGender) || '未设定',
      种族: raceName.trim() || '未设定',
      背景: character.background,
      基础属性: projectCharacterBaseAttributes(baseState, projection),
    },
    status: {
      年龄: character.age,
      属性数值: {
        mind: baseState.current.mind,
        physique: baseState.current.physique,
        charisma: baseState.current.charisma,
        familyBackground: baseState.current.familyBackground,
      },
    },
  }
}
