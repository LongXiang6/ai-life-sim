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
  lifespan: CharacterState['lifespanDraft']
  name: string
  race: string
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
  lifespan,
  name,
  race,
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
    })

    const characterId = useCharacterStore.getState().ensureCharacterId()
    useCharacterStore.setState({ age: startingAge })
    if (!ensureOrchestratorContextFromStores()) {
      setStartError('无法建立当前世界与角色的模拟上下文，请返回世界配置重新确认。')
      return
    }
    const targetContextId = useWorldStore.getState().currentContextId
    if (!targetContextId) {
      setStartError('当前世界缺少有效的模拟上下文，请返回世界配置重新确认。')
      return
    }

    const commitResult = orchestrator.applyRoundChanges([
      {
        id: 'character-base',
        description: '角色创建完成，以玩家确认的基础属性和起始年龄进入叙事',
        changes: { startingAge, base: confirmedBase },
      },
      {
        id: 'destiny-pattern',
        description: '角色创建完成，写入玩家确认的命格',
        changes: { patterns: selectedPatterns },
      },
      {
        id: 'lifespan',
        targetObjectId: characterId,
        targetContextId,
        operation: 'set-rule',
        evidenceEventIds: [],
        description: '角色创建完成，写入玩家确认的种族与寿命',
        changes: {
          raceId: race,
          raceDisplayName: lifespan.race.name,
          clockMode: lifespan.race.clockMode,
          baseLifespanDays: Math.round(lifespan.race.baseLifespanYears * 365),
          maximumLifespanDays: Math.round(lifespan.maximumLifespanYears * 365),
          attrBaselines: lifespan.race.attrBaselines ?? {},
        },
      },
    ], 'manual')
    if (commitResult.rejected.length > 0 || commitResult.committed.length !== 3) {
      const rejectedReasons = commitResult.rejected
        .map((item) => `${item.change.id || '未知系统'}：${item.reason}`)
        .join('；')
      setStartError(
        `角色创建状态未能完整提交：${rejectedReasons || `仅完成 ${commitResult.committed.length} / 3 项写入`}`,
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
    lifespan,
    name,
    race,
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
