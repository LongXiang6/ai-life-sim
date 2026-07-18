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

export interface NarrativeAIWorldView extends Record<string, unknown> {
  世界名称: string
  世界描述: string
  当前纪年: string
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
): NarrativeAIWorldView {
  return {
    世界名称: worldSetting.name,
    世界描述: worldSetting.description,
    当前纪年: worldSetting.era,
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
