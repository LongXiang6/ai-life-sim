/**
 * Purpose: Load and write local or cloud manual saves from the story page.
 * Owner: mod-pages/game-story
 * Responsibility: Save availability, validation, and persistence commands only.
 */

import { useCallback, useEffect, useState } from 'react'

import { useAccountClientStore } from '@/core/account/account-client-store'
import {
  fetchCloudManualSaveSummary,
  putCloudManualSave,
} from '@/core/player-content/player-content-client'
import {
  CloudGameSavePayloadSchema,
  type CloudManualSaveSummary,
} from '@/core/player-content/player-content-contract'
import { ENGINE_VERSION } from '@/core/version'
import {
  collectManualGameSavePayload,
  saveCurrentGameToSlot,
} from '@/mods/mod-engine/engine-api'

interface UseGameStorySaveOptions {
  addToast: (type: 'success' | 'warning', message: string) => void
  characterName: string
  isAdvancing: boolean
  isRuntimeReady: boolean
  runtimeIncomplete: boolean
  totalRounds: number
  worldName: string
}

export function useGameStorySave({
  addToast,
  characterName,
  isAdvancing,
  isRuntimeReady,
  runtimeIncomplete,
  totalRounds,
  worldName,
}: UseGameStorySaveOptions) {
  const accountStatus = useAccountClientStore((state) => state.status)
  const [cloudSave, setCloudSave] = useState<CloudManualSaveSummary | null>(null)
  const [cloudLoading, setCloudLoading] = useState(false)

  useEffect(() => {
    let active = true
    if (accountStatus !== 'authenticated') {
      queueMicrotask(() => {
        if (!active) return
        setCloudSave(null)
        setCloudLoading(false)
      })
      return () => { active = false }
    }
    queueMicrotask(() => { if (active) setCloudLoading(true) })
    void fetchCloudManualSaveSummary()
      .then((summary) => { if (active) setCloudSave(summary) })
      .catch((error) => {
        if (active) addToast('warning', error instanceof Error ? error.message : '云端栏位读取失败')
      })
      .finally(() => { if (active) setCloudLoading(false) })
    return () => { active = false }
  }, [accountStatus, addToast])

  const handleManualSave = useCallback(async (slot: number, name: string) => {
    if (!isRuntimeReady) {
      throw new Error(runtimeIncomplete
        ? '核心模拟系统未完整加载，请刷新页面后重试。'
        : '核心模拟系统仍在初始化，请稍候重试。')
    }
    if (isAdvancing) throw new Error('当前回合仍在生成，完成后才能保存。')
    await saveCurrentGameToSlot(slot, name, worldName, characterName)
    addToast('success', `已保存到槽位 ${slot}`)
  }, [addToast, characterName, isAdvancing, isRuntimeReady, runtimeIncomplete, worldName])

  const handleCloudSave = useCallback(async (name: string) => {
    if (accountStatus !== 'authenticated') throw new Error('登录后才可使用云端栏位')
    if (!isRuntimeReady) {
      throw new Error(runtimeIncomplete
        ? '核心模拟系统未完整加载，请刷新页面后重试。'
        : '核心模拟系统仍在初始化，请稍候重试。')
    }
    if (isAdvancing) throw new Error('当前回合仍在生成，完成后才能保存。')
    const payload = CloudGameSavePayloadSchema.parse(await collectManualGameSavePayload())
    const summary = await putCloudManualSave({
      metadata: {
        schemaVersion: 1,
        slot: 1,
        name,
        worldName,
        characterName,
        totalRounds,
        gameVersion: ENGINE_VERSION,
        savedAt: Date.now(),
      },
      payload,
    })
    setCloudSave(summary)
    addToast('success', '已保存到云端栏位')
  }, [accountStatus, addToast, characterName, isAdvancing, isRuntimeReady, runtimeIncomplete, totalRounds, worldName])

  return {
    accountStatus,
    cloudLoading,
    cloudSave,
    handleCloudSave,
    handleManualSave,
  }
}
