/**
 * Purpose: Validate the confirmed creation state and hand it to the story simulation.
 * Owner: mod-pages/fate-preview
 * Responsibility: Final creation validation, orchestrator context handoff, and navigation only.
 */

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'

import { useGlobalStore } from '@/core'
import { useCharacterStore } from '@/mods/mod-character'
import { ensureOrchestratorContextFromStores } from '@/mods/mod-engine/engine-api'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import { resolveDisplayName } from './fate-preview-helpers'

type CharacterState = ReturnType<typeof useCharacterStore.getState>
type WorldConfig = ReturnType<typeof useWorldStore.getState>['worldConfig']

interface UseFatePreviewStartOptions {
  worldReady: boolean
  characterBase: CharacterState['characterBase']
  characterConfirmed: boolean
  patternLoadoutConfirmed: boolean
  gender: string
  name: string
  startingAge: number
  storySeed: string
  worldConfig: WorldConfig
}

export function useFatePreviewStart({
  worldReady,
  characterBase,
  characterConfirmed,
  patternLoadoutConfirmed,
  gender,
  name,
  startingAge,
  storySeed,
  worldConfig,
}: UseFatePreviewStartOptions) {
  const router = useRouter()
  const setGamePhase = useGlobalStore((state) => state.setGamePhase)
  const allModsLoaded = useGlobalStore((state) => state.allModsLoaded)
  const setSettingsStorySeed = useSettingsStore((state) => state.setStorySeed)
  const [startError, setStartError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)

  const handleStartLife = useCallback(async () => {
    if (isStarting || !characterConfirmed || !patternLoadoutConfirmed || !worldReady) return
    setIsStarting(true)
    setStartError(null)

    try {
      if (!worldConfig) return
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

      const runtimeState = useGlobalStore.getState()
      if (!runtimeState.allModsLoaded) {
        setStartError('核心模拟系统尚未加载完成')
        return
      }
      if (!ensureOrchestratorContextFromStores()) {
        setStartError('当前世界与角色的模拟上下文尚未准备完成')
        return
      }
      if (!useWorldStore.getState().currentContextId) {
        setStartError('当前世界缺少有效的模拟上下文')
        return
      }

      setSettingsStorySeed(storySeed)
      setGamePhase('simulation')
      router.push('/game-story')
    } finally {
      setIsStarting(false)
    }
  }, [
    characterBase.base,
    characterConfirmed,
    patternLoadoutConfirmed,
    gender,
    name,
    router,
    setGamePhase,
    setSettingsStorySeed,
    startingAge,
    storySeed,
    worldConfig,
    worldReady,
    isStarting,
  ])

  return { allModsLoaded, handleStartLife, isStarting, startError }
}
