/**
 * Purpose: Validate and commit the confirmed creation state before entering the story simulation.
 * Owner: mod-pages/fate-preview
 * Responsibility: Final creation commit, orchestrator handoff, and navigation only.
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useGlobalStore } from '@/core'
import { useCharacterStore } from '@/mods/mod-character'
import { ensureOrchestratorContextFromStores, orchestrator } from '@/mods/mod-engine/engine-api'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import type { DestinyPattern } from '@/mods/mod-character'
import { resolveDisplayName } from './fate-preview-helpers'

type CharacterState = ReturnType<typeof useCharacterStore.getState>
type WorldConfig = ReturnType<typeof useWorldStore.getState>['worldConfig']

interface UseFatePreviewStartOptions {
  aiComplete: boolean
  characterBase: CharacterState['characterBase']
  characterConfirmed: boolean
  destinyPatternsConfirmed: boolean
  gender: string
  name: string
  selectedPatterns: DestinyPattern[]
  startingAge: number
  storySeed: string
  worldConfig: WorldConfig
}

export function useFatePreviewStart({
  aiComplete,
  characterBase,
  characterConfirmed,
  destinyPatternsConfirmed,
  gender,
  name,
  selectedPatterns,
  startingAge,
  storySeed,
  worldConfig,
}: UseFatePreviewStartOptions) {
  const router = useRouter()
  const setGamePhase = useGlobalStore((state) => state.setGamePhase)
  const allModsLoaded = useGlobalStore((state) => state.allModsLoaded)
  const setSettingsStorySeed = useSettingsStore((state) => state.setStorySeed)
  const [startError, setStartError] = useState<string | null>(null)

  const handleStartLife = useCallback(() => {
    if (!characterConfirmed || !destinyPatternsConfirmed || !aiComplete) return
    if (!allModsLoaded) {
      setStartError('核心模拟系统尚未加载完成，请稍候再试。')
      return
    }
    if (!worldConfig) return
    setStartError(null)

    const displayName = resolveDisplayName(name, gender)
    if (displayName !== name.trim()) useCharacterStore.getState().setName(displayName)
    const confirmedBase = { ...characterBase.base }
    useCharacterStore.getState().setCharacterBase({
      base: confirmedBase,
      current: { ...confirmedBase },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
      contextModifiers: {},
      startingAge,
      status: undefined,
    })

    useCharacterStore.getState().ensureCharacterId()
    useCharacterStore.setState({ age: startingAge })
    if (!ensureOrchestratorContextFromStores()) {
      setStartError('无法建立当前世界与角色的模拟上下文，请返回世界配置重新确认。')
      return
    }
    if (!useWorldStore.getState().currentContextId) {
      setStartError('当前世界缺少有效的模拟上下文，请返回世界配置重新确认。')
      return
    }

    const commitResult = orchestrator.applyRoundChanges([
      {
        id: 'destiny-pattern',
        description: '角色创建完成，写入玩家确认的命格',
        changes: { patterns: selectedPatterns },
      },
    ], 'manual')
    if (commitResult.rejected.length > 0 || commitResult.committed.length !== 1) {
      const rejectedReasons = commitResult.rejected
        .map((item) => `${item.change.id || '未知系统'}：${item.reason}`)
        .join('；')
      setStartError(
        `角色创建状态未能完整提交：${rejectedReasons || `仅完成 ${commitResult.committed.length} / 1 项写入`}`,
      )
      return
    }
    setSettingsStorySeed(storySeed)
    setGamePhase('simulation')
    router.push('/game-story')
  }, [
    aiComplete,
    allModsLoaded,
    characterBase.base,
    characterConfirmed,
    destinyPatternsConfirmed,
    gender,
    name,
    router,
    selectedPatterns,
    setGamePhase,
    setSettingsStorySeed,
    startingAge,
    storySeed,
    worldConfig,
  ])

  return { allModsLoaded, handleStartLife, startError }
}
