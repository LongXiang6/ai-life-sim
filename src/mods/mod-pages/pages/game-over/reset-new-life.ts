import { useGlobalStore } from '@/core/global-store'
import { configStore } from '@/core/storage'
import { useCharacterStore } from '@/mods/mod-character'
import { useCultureStore } from '@/mods/mod-culture'
import { useEconomyStore } from '@/mods/mod-economy'
import { getPreGenQueueStatus, useEngineStore } from '@/mods/mod-engine'
import { clearPreGenQueue, orchestrator } from '@/mods/mod-engine/engine-api'
import { useEnvironmentEcologyStore } from '@/mods/mod-environment-ecology'
import { usePoliticsStore } from '@/mods/mod-politics'
import { usePowerSystemStore } from '@/mods/mod-power-system'
import { useWorldStore } from '@/mods/mod-world'

import { clearCharacterCreateDrafts } from '../character-create/useCharacterCreateForm'
import { clearWorldCustomizeDraft } from '../world-customize/useWorldCustomize'

function clearPerLifeCreationDrafts(): void {
  const prefixes = ['talent-draw:', 'attribute-alloc:', 'fate-preview:']
  for (const key of configStore.keys('mod-pages')) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      configStore.remove('mod-pages', key)
    }
  }
}

/**
 * 与欢迎页“开始新人生”保持同一重置语义。
 * 该函数只清理当前人生的运行态与创建草稿，不触碰设置或存档。
 */
export async function resetForNewLife(): Promise<void> {
  if (getPreGenQueueStatus().isActive) {
    throw new Error('下一段故事仍在后台准备，请稍候再开启新人生。')
  }
  await orchestrator.waitForBackgroundCompression()
  if (getPreGenQueueStatus().isActive) {
    throw new Error('下一段故事仍在后台准备，请稍候再开启新人生。')
  }
  clearPreGenQueue()
  orchestrator.reset()
  clearCharacterCreateDrafts()
  clearWorldCustomizeDraft()
  clearPerLifeCreationDrafts()
  useCharacterStore.getState().reset()
  useWorldStore.getState().reset()
  useEngineStore.getState().reset()
  useEconomyStore.getState().reset()
  usePoliticsStore.getState().reset()
  usePowerSystemStore.getState().reset()
  useCultureStore.getState().reset()
  useEnvironmentEcologyStore.getState().reset()
  useGlobalStore.getState().setGamePhase('world_build')
}
