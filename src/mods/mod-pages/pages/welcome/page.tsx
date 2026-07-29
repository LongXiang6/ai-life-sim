'use client'

/**
 * @module welcome-page
 * @description 欢迎首页 —— 统一书页式响应布局，弹层延迟加载
 * @mod mod-pages
 */

import { useState, useEffect, useCallback, useRef } from 'react'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'

import { useEngineStore } from '@/mods/mod-engine'
import { saveManager } from '@/core/storage/save-manager'
import { applyGameSave } from '@/mods/mod-engine/engine-api'
import { useAccountClientStore } from '@/core/account/account-client-store'
import {
  fetchCloudManualSave,
  fetchCloudManualSaveSummary,
  removeCloudManualSave,
} from '@/core/player-content/player-content-client'
import type { CloudManualSaveSummary } from '@/core/player-content/player-content-contract'
import { hasAvailableApiConfiguration } from '@/mods/mod-settings'
import { reportDiagnosticSessionEnvironment } from '@/core/logger/client-logger'
import {
  isDisclaimerAccepted,
  acceptDisclaimer,
  useToastStore,
} from '@/mods/mod-ui'

import WelcomeView from './WelcomeView'
import type { SaveMetadata } from '@/core/storage/save-manager'

const WelcomeModals = dynamic(() => import('./WelcomeModals'), { ssr: false })

export default function WelcomePage() {
  const router = useRouter()
  const [saves, setSaves] = useState<SaveMetadata[]>([])
  const [cloudSave, setCloudSave] = useState<CloudManualSaveSummary | null>(null)
  const [selectedSaveId, setSelectedSaveId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'model-call'>('appearance')
  const [showHelp, setShowHelp] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const { toasts, addToast, dismissToast } = useToastStore()
  const accountStatus = useAccountClientStore((state) => state.status)
  const pendingActionRef = useRef<'start-new-game' | null>(null)

  useEffect(() => {
    const availableSaves = saveManager.listSaves()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaves(availableSaves)
    if (!isDisclaimerAccepted()) {
      setShowDisclaimer(true)
    }
  }, [])

  useEffect(() => {
    let active = true
    if (accountStatus !== 'authenticated') {
      queueMicrotask(() => { if (active) setCloudSave(null) })
      return () => { active = false }
    }
    void fetchCloudManualSaveSummary()
      .then((summary) => {
        if (!active) return
        setCloudSave(summary)
      })
      .catch((error) => {
        if (active) addToast('warning', error instanceof Error ? error.message : '云端栏位读取失败', 5000)
      })
    return () => { active = false }
  }, [accountStatus, addToast])

  const handleStartNewGame = useCallback(async () => {
    if (!isDisclaimerAccepted()) {
      pendingActionRef.current = 'start-new-game'
      setShowDisclaimer(true)
      return
    }
    if (!await hasAvailableApiConfiguration()) {
      addToast('warning', '当前主叙事模型不可用：请在“模型调用”选择官方厂商预设，可继续填写自己的 API Key', 5000)
      setSettingsTab('model-call')
      setShowSettings(true)
      return
    }
    pendingActionRef.current = null
    router.push('/new-game')
  }, [router, addToast])

  const handleContinue = useCallback(async (slot: number): Promise<boolean> => {
    try {
      const data = await saveManager.loadSave(slot)
      if (!data) throw new Error(`槽位 ${slot} 不存在或存档内容已丢失`)
      await applyGameSave(data)
      router.push(useEngineStore.getState().status === 'complete' ? '/game-over' : '/game-story')
      return true
    } catch (err) {
      // 核心存档恢复失败：留在欢迎页并提示，避免进入半加载的损坏游戏态
      console.error('[welcome] 继续游戏加载失败:', err)
      addToast('error', `存档加载失败：${err instanceof Error ? err.message : '未知错误'}`, 5000)
      return false
    }
  }, [router, addToast])

  const handleDeleteSave = useCallback(async (slot: number): Promise<boolean> => {
    try {
      await saveManager.deleteSave(slot)
      setSaves((previous) => previous.filter((save) => save.slot !== slot))
      setSelectedSaveId((current) => current === `local:${slot}` ? null : current)
      addToast('success', '存档已删除')
      return true
    } catch (err) {
      console.error('[welcome] 删除存档失败:', err)
      addToast('error', `删除存档失败：${err instanceof Error ? err.message : '未知错误'}`, 5000)
      return false
    }
  }, [addToast])

  const handleContinueCloudSave = useCallback(async (): Promise<boolean> => {
    try {
      const cloud = await fetchCloudManualSave()
      if (!cloud) throw new Error('云端栏位不存在或存档内容已丢失')
      await applyGameSave(cloud.payload)
      router.push(useEngineStore.getState().status === 'complete' ? '/game-over' : '/game-story')
      return true
    } catch (error) {
      console.error('[welcome] 云端人生加载失败:', error)
      addToast('error', `云端存档加载失败：${error instanceof Error ? error.message : '未知错误'}`, 5000)
      return false
    }
  }, [addToast, router])

  const handleDeleteCloudSave = useCallback(async (): Promise<boolean> => {
    try {
      const deleted = await removeCloudManualSave()
      setCloudSave(null)
      setSelectedSaveId((current) => current === 'cloud' ? null : current)
      addToast('success', deleted ? '云端存档已删除' : '云端栏位已经为空')
      return true
    } catch (error) {
      console.error('[welcome] 云端人生删除失败:', error)
      addToast('error', `云端存档删除失败：${error instanceof Error ? error.message : '未知错误'}`, 5000)
      return false
    }
  }, [addToast])

  const handleDisclaimerAccept = useCallback(() => {
    acceptDisclaimer()
    void reportDiagnosticSessionEnvironment()
    setShowDisclaimer(false)
    if (pendingActionRef.current === 'start-new-game') {
      pendingActionRef.current = null
      handleStartNewGame()
    }
  }, [handleStartNewGame])

  return (
    <div className="final-flow-frame">
      <div className="flow-responsive-viewport">
        <div className="flow-responsive-layout">
          <WelcomeView
            onStartNewGame={handleStartNewGame}
            saves={saves}
            cloudSave={cloudSave}
            selectedSaveId={selectedSaveId}
            onSelectSave={setSelectedSaveId}
            onContinueSave={handleContinue}
            onDeleteSave={handleDeleteSave}
            onContinueCloudSave={handleContinueCloudSave}
            onDeleteCloudSave={handleDeleteCloudSave}
            onOpenSettings={() => router.push('/settings')}
            onOpenAccount={() => router.push('/account')}
            onOpenHelp={() => router.push('/help')}
            onOpenFeedback={() => router.push('/feedback')}
            onOpenLeaderboard={() => router.push('/leaderboard')}
            onOpenMailbox={() => router.push('/mailbox')}
          />
        </div>
      </div>

      <WelcomeModals
        toasts={toasts}
        onDismissToast={dismissToast}
        showDisclaimer={showDisclaimer}
        onDisclaimerAccept={handleDisclaimerAccept}
        onDisclaimerClose={() => { setShowDisclaimer(false); pendingActionRef.current = null }}
        showHelp={showHelp}
        onHelpClose={() => setShowHelp(false)}
        showSettings={showSettings}
        onSettingsClose={() => setShowSettings(false)}
        settingsTab={settingsTab}
      />
    </div>
  )
}
