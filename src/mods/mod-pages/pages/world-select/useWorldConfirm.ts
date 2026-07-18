/**
 * @module useWorldConfirm.ts
 * @description 世界选择确认 —— 本地初始化 + 一致性确认 + 跳转自定义
 * @mod mod-pages
 */

'use client'

import { useCallback } from 'react'

import { useRouter } from 'next/navigation'

import { useGlobalStore, configStore } from '@/core'

import { orchestrator } from '@/mods/mod-engine/engine-api'
import {
  buildWorldConfigFromPreset,
  buildWorldConfigFromCustom,
  useWorldStore,
  formatCalibrationSummary,
  type PresetWorld,
  type WorldConfig,
} from '@/mods/mod-world'
import { commitWorldInitialization, resolvePresetWorldCode } from '@/mods/mod-world/world-init-api'
import { hasAvailableApiConfiguration, isApiConfigured } from '@/mods/mod-settings'

import { useWorldCoherenceConfirm } from '../../hooks/useWorldCoherenceConfirm'

import type { Difficulty } from './useWorldSelectForm'

const WORLDVIEW_ROUTE_MAP: Record<string, 'modern' | 'cultivation' | 'post-apocalyptic'> = {
  materialist: 'modern',
  idealist: 'cultivation',
  survival_horror: 'post-apocalyptic',
}

export { hasAvailableApiConfiguration, isApiConfigured } from '@/mods/mod-settings'

export function useWorldConfirm() {
  const router = useRouter()
  const setWorldviewId = useGlobalStore((s) => s.setWorldviewId)
  const setWorldName = useGlobalStore((s) => s.setWorldName)
  const { requestCoherenceResolve, conflictModal } = useWorldCoherenceConfirm()

  const proceedWithConfig = useCallback(async (
    config: WorldConfig,
    selectedWorld: PresetWorld,
    options?: { worldCode?: number },
  ): Promise<boolean> => {
    const isCustom = selectedWorld.id.startsWith('custom-')
    const mappedWv = WORLDVIEW_ROUTE_MAP[selectedWorld.worldviewId] ?? 'modern'
    setWorldviewId(mappedWv)
    setWorldName(config.name)

    const eraStartYear = typeof selectedWorld.config.eraStartYear === 'number'
      ? selectedWorld.config.eraStartYear
      : undefined

    const worldCode = isCustom
      ? options?.worldCode
      : (options?.worldCode ?? resolvePresetWorldCode(selectedWorld))

    const result = await commitWorldInitialization(
      config,
      worldCode,
      eraStartYear,
    )

    const { calibration } = useWorldStore.getState()

    orchestrator.setContext(
      {
        name: config.name,
        description: config.description,
        era: selectedWorld.era,
        config: {
          ...(config as unknown as Record<string, unknown>),
          _worldTagsText: result.formattedTags,
          _calibration: calibration,
          _calibrationSummary: calibration ? formatCalibrationSummary(calibration) : '',
          _economyModifier: calibration?.formulas?.economyModifier ?? 1.0,
        },
      },
      { name: '', age: 0, gender: '未设定', background: '', attributes: {} },
    )

    if (typeof window !== 'undefined') {
      try {
        configStore.set('mod-power-system', 'power-ceiling', String(config.powerCeiling))
      } catch { /* 存储不可用 */ }
    }

    router.push('/new-game/world-customize')
    return true
  }, [router, setWorldviewId, setWorldName])

  const handleConfirm = useCallback(async (
    selectedWorld: PresetWorld,
    difficulty: Difficulty,
    options?: { worldCode?: number; customWorldview?: string },
  ): Promise<boolean> => {
    if (!await hasAvailableApiConfiguration()) {
      alert(
        '服务器免费体验通道暂不可用：请打开设置 → 模型调用，填写自己的 API Key、接口和模型后继续。',
      )
      return false
    }

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

    return new Promise<boolean>((resolve, reject) => {
      requestCoherenceResolve(
        draft,
        (config) => {
          void proceedWithConfig(config, selectedWorld, { worldCode: options?.worldCode })
            .then(resolve)
            .catch(reject)
        },
        () => resolve(false),
      )
    })
  }, [proceedWithConfig, requestCoherenceResolve])

  return { handleConfirm, isApiConfigured, hasAvailableApiConfiguration, conflictModal }
}
