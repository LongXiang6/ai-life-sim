/**
 * Purpose: Commit a selected world and route the player into character creation.
 * Owner: mod-pages / world-select
 * Responsibility: UI command orchestration only; world state remains owned by mod-world.
 *
 * @module useWorldConfirm.ts
 * @description 世界选择确认 —— 本地初始化 + 一致性确认 + 跳转角色创建
 * @mod mod-pages
 */

'use client'

import { useCallback, useRef } from 'react'

import { useRouter } from 'next/navigation'

import { useGlobalStore } from '@/core'

import { buildOrchestratorWorldSetting, orchestrator } from '@/mods/mod-engine/engine-api'
import { useCharacterStore } from '@/mods/mod-character'
import {
  buildWorldConfigFromPreset,
  buildWorldConfigFromCustom,
  useWorldStore,
  formatCalibrationSummary,
  type PresetWorld,
  type WorldConfig,
} from '@/mods/mod-world'
import { commitWorldInitialization, resolvePresetWorldCode } from '@/mods/mod-world/world-init-api'

import { prepareNewLifeWorldCommit } from '../../helpers/new-life-reset'

import type { Difficulty } from './useWorldSelectForm'

const WORLDVIEW_ROUTE_MAP: Record<string, 'modern' | 'cultivation' | 'post-apocalyptic'> = {
  materialist: 'modern',
  idealist: 'cultivation',
  survival_horror: 'post-apocalyptic',
}

export function useWorldConfirm() {
  const router = useRouter()
  const setWorldviewId = useGlobalStore((s) => s.setWorldviewId)
  const setWorldName = useGlobalStore((s) => s.setWorldName)
  const confirmingRef = useRef(false)

  const proceedWithConfig = useCallback(async (
    config: WorldConfig,
    selectedWorld: PresetWorld,
    options?: { worldCode?: number },
  ): Promise<boolean> => {
    const isCustom = selectedWorld.id.startsWith('custom-')
    const mappedWv = WORLDVIEW_ROUTE_MAP[selectedWorld.worldviewId] ?? 'modern'

    const eraStartYear = typeof selectedWorld.config.eraStartYear === 'number'
      ? selectedWorld.config.eraStartYear
      : undefined

    const worldCode = isCustom
      ? options?.worldCode
      : (options?.worldCode ?? resolvePresetWorldCode(selectedWorld))
    await prepareNewLifeWorldCommit(worldCode)
    setWorldviewId(mappedWv)
    setWorldName(config.name)
    const hasExistingContext = Object.keys(useWorldStore.getState().contexts).length > 0

    const result = await commitWorldInitialization(
      config,
      worldCode,
      eraStartYear,
      hasExistingContext
        ? { globalTotalBasePoints: orchestrator.getState().round.totalBasePoints }
        : undefined,
    )

    const { calibration } = useWorldStore.getState()

    orchestrator.setContext(
      buildOrchestratorWorldSetting(result.config, {
        eraStartYear,
        extraConfig: {
          _worldTagsText: result.formattedTags,
          _calibration: calibration,
          _calibrationSummary: calibration ? formatCalibrationSummary(calibration) : '',
          _economyModifier: calibration?.formulas?.economyModifier ?? 1.0,
        },
      }),
      {
        characterId: useCharacterStore.getState().ensureCharacterId(),
        name: '', age: 0, gender: '未设定', background: '', attributes: {},
      },
    )

    router.push('/new-game/character-create')
    return true
  }, [router, setWorldviewId, setWorldName])

  const handleConfirm = useCallback(async (
    selectedWorld: PresetWorld,
    difficulty: Difficulty,
    options?: { worldCode?: number; customWorldview?: string },
  ): Promise<boolean> => {
    if (confirmingRef.current) return false
    confirmingRef.current = true
    try {
      const isCustom = selectedWorld.id.startsWith('custom-')
      const draft = isCustom
        ? buildWorldConfigFromCustom(
            {
              name: selectedWorld.name,
              description: selectedWorld.description,
              worldview: options?.customWorldview ?? 'auto',
            },
            difficulty,
          )
        : buildWorldConfigFromPreset(selectedWorld, difficulty)

      return await proceedWithConfig(draft, selectedWorld, { worldCode: options?.worldCode })
    } finally {
      confirmingRef.current = false
    }
  }, [proceedWithConfig])

  return { handleConfirm }
}
