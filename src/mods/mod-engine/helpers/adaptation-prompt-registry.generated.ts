/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

import type { PromptTemplate } from '@/foundation'

import { adaptationDivineCreationPrompt } from '@/mods/mod-base-universe/prompts/adaptation-divine-creation-prompt'
import { adaptationGoldenFingerPrompt } from '@/mods/mod-golden-finger/prompts/adaptation-golden-finger-prompt'
import { adaptationAntagonistPrompt } from '@/mods/mod-npc/prompts/adaptation-antagonist-prompt'
import { adaptationCombatPowerPrompt } from '@/mods/mod-power-system/prompts/adaptation-combat-power-prompt'
import { adaptationCultivationPrompt } from '@/mods/mod-power-system/prompts/adaptation-cultivation-prompt'
import { adaptationMonsterPrompt } from '@/mods/mod-power-system/prompts/adaptation-monster-prompt'
import { adaptationLuckPrompt } from '@/mods/mod-power-system/prompts/adaptation-luck-prompt'
import { adaptationFortuneEncounterPrompt } from '@/mods/mod-power-system/prompts/adaptation-fortune-encounter-prompt'
import { adaptationFaithPrompt } from '@/mods/mod-power-system/prompts/adaptation-faith-prompt'
import { adaptationSupremeItemPrompt } from '@/mods/mod-power-system/prompts/adaptation-supreme-item-prompt'
import { adaptationDivineInterventionPrompt } from '@/mods/mod-power-system/prompts/adaptation-divine-intervention-prompt'
import { adaptationAnomalyPhenomenaPrompt } from '@/mods/mod-power-system/prompts/adaptation-anomaly-phenomena-prompt'
import { adaptationSpecialMaterialPrompt } from '@/mods/mod-power-system/prompts/adaptation-special-material-prompt'

/** 子系统 ID → adaptation PromptTemplate 映射（由 manifest.prompts 自动生成，勿手动编辑） */
export const ADAPTATION_PROMPT_MAP: Record<string, PromptTemplate> = {
  'divine-creation': adaptationDivineCreationPrompt,
  'golden-finger': adaptationGoldenFingerPrompt,
  'antagonist': adaptationAntagonistPrompt,
  'combat-power': adaptationCombatPowerPrompt,
  'cultivation': adaptationCultivationPrompt,
  'monster': adaptationMonsterPrompt,
  'luck': adaptationLuckPrompt,
  'fortune-encounter': adaptationFortuneEncounterPrompt,
  'faith': adaptationFaithPrompt,
  'supreme-item': adaptationSupremeItemPrompt,
  'divine-intervention': adaptationDivineInterventionPrompt,
  'anomaly-phenomena': adaptationAnomalyPhenomenaPrompt,
  'special-material': adaptationSpecialMaterialPrompt
}
