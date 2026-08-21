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

const MAX_CREATION_COMMIT_ATTEMPTS = 3
const CREATION_COMMIT_RETRY_DELAY_MS = 150

function waitForCreationCommitRetry(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, CREATION_COMMIT_RETRY_DELAY_MS))
}

function isTransientCreationCommitReason(reason: string): boolean {
  return /未注册|RuntimeRegistry|上下文|回合|未就绪|尚未初始化|尚未加载/iu.test(reason)
}

interface UseFatePreviewStartOptions {
  worldReady: boolean
  characterBase: CharacterState['characterBase']
  characterConfirmed: boolean
  patternLoadoutConfirmed: boolean
  gender: string
  name: string
  selectedPatterns: DestinyPattern[]
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

      let lastReason = '仅完成 0 / 1 项写入'
      for (let attempt = 1; attempt <= MAX_CREATION_COMMIT_ATTEMPTS; attempt += 1) {
        const runtimeState = useGlobalStore.getState()
        const bindingsReady = orchestrator.getSubsystemBindings().some(({ id }) => id === 'destiny-pattern')
        if (!runtimeState.allModsLoaded) {
          lastReason = '核心模拟系统尚未加载完成'
        } else if (!bindingsReady) {
          lastReason = '命格系统尚未准备完成'
        } else if (!ensureOrchestratorContextFromStores()) {
          lastReason = '当前世界与角色的模拟上下文尚未准备完成'
        } else if (!useWorldStore.getState().currentContextId) {
          lastReason = '当前世界缺少有效的模拟上下文'
        } else {
          const commitResult = orchestrator.applyRoundChanges([
            {
              id: 'destiny-pattern',
              description: '角色创建完成，写入玩家确认的命格',
              changes: { patterns: selectedPatterns },
            },
          ], 'manual')
          if (commitResult.rejected.length === 0 && commitResult.committed.length === 1) {
            setSettingsStorySeed(storySeed)
            setGamePhase('simulation')
            router.push('/game-story')
            return
          }
          const rejectedReasons = commitResult.rejected
            .map((item) => `${item.change.id || '未知系统'}：${item.reason}`)
            .join('；')
          lastReason = rejectedReasons || `仅完成 ${commitResult.committed.length} / 1 项写入`
          if (rejectedReasons && !commitResult.rejected.every((item) => isTransientCreationCommitReason(item.reason))) {
            break
          }
        }
        if (attempt < MAX_CREATION_COMMIT_ATTEMPTS) await waitForCreationCommitRetry()
      }
      setStartError(
        `角色创建状态未能完整提交：${lastReason}。已自动重试 ${MAX_CREATION_COMMIT_ATTEMPTS - 1} 次，请稍后再试。`,
      )
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
    selectedPatterns,
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
