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
import { applyGameSave, orchestrator } from '@/mods/mod-engine/engine-api'
import { hasAvailableApiConfiguration } from '@/mods/mod-settings'
import {
  isDisclaimerAccepted,
  acceptDisclaimer,
  useToastStore,
} from '@/mods/mod-ui'

import WelcomeView from './WelcomeView'
import { resetForNewLife } from '../game-over/reset-new-life'

import type { SaveMetadata } from '@/core/storage/save-manager'

const WelcomeModals = dynamic(() => import('./WelcomeModals'), { ssr: false })

export default function WelcomePage() {
  const router = useRouter()
  const [saves, setSaves] = useState<SaveMetadata[]>([])
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'model-call'>('appearance')
  const [showHelp, setShowHelp] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const { toasts, addToast, dismissToast } = useToastStore()
  const pendingActionRef = useRef<'start-new-game' | null>(null)

  useEffect(() => {
    const availableSaves = saveManager.listSaves()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaves(availableSaves)
    setSelectedSlot(availableSaves[0]?.slot ?? null)
    if (!isDisclaimerAccepted()) {
      setShowDisclaimer(true)
    }
  }, [])

  const handleStartNewGame = useCallback(async () => {
    if (!isDisclaimerAccepted()) {
      pendingActionRef.current = 'start-new-game'
      setShowDisclaimer(true)
      return
    }
    if (!await hasAvailableApiConfiguration()) {
      addToast('warning', '服务器免费体验通道暂不可用：可在“模型调用”中填写自己的 Key、接口和模型', 5000)
      setSettingsTab('model-call')
      setShowSettings(true)
      return
    }
    try {
      await resetForNewLife()
    } catch (error) {
      addToast('warning', error instanceof Error ? error.message : '当前后台任务尚未结束，请稍候重试')
      return
    }
    pendingActionRef.current = null
    router.push('/new-game')
  }, [router, addToast])

  const handleContinue = useCallback(async (slot: number): Promise<boolean> => {
    try {
      const data = await saveManager.loadSave(slot)
      if (!data) throw new Error(`槽位 ${slot} 不存在或存档内容已丢失`)
      await orchestrator.waitForBackgroundCompression()
      applyGameSave(data)
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
      setSelectedSlot((current) => current === slot ? null : current)
      addToast('success', '存档已删除')
      return true
    } catch (err) {
      console.error('[welcome] 删除存档失败:', err)
      addToast('error', `删除存档失败：${err instanceof Error ? err.message : '未知错误'}`, 5000)
      return false
    }
  }, [addToast])

  const handleDisclaimerAccept = useCallback(() => {
    acceptDisclaimer()
    setShowDisclaimer(false)
    if (pendingActionRef.current === 'start-new-game') {
      pendingActionRef.current = null
      handleStartNewGame()
    }
  }, [handleStartNewGame])

  return (
    <>
      <WelcomeView
        onStartNewGame={handleStartNewGame}
        saves={saves}
        selectedSlot={selectedSlot}
        onSelectSave={setSelectedSlot}
        onContinueSave={handleContinue}
        onDeleteSave={handleDeleteSave}
        onOpenSettings={() => { setSettingsTab('appearance'); setShowSettings(true) }}
        onOpenHelp={() => setShowHelp(true)}
      />

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
    </>
  )
}
