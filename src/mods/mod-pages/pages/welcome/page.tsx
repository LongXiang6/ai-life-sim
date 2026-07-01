'use client'

/**
 * @module welcome-page
 * @description 欢迎首页 —— 星空背景即时渲染，弹层延迟加载
 * @mod mod-pages
 */

import { useState, useEffect, useCallback, useRef } from 'react'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'

import { useIsMobile } from '@/foundation'
import { useGlobalStore } from '@/core/global-store'
import { saveManager } from '@/core/storage/save-manager'
import { applyGameSave } from '@/mods/mod-engine/engine-api'
import { isApiConfigured } from '@/mods/mod-settings'
import {
  StarfieldBackground,
  isDisclaimerAccepted,
  acceptDisclaimer,
  useToastStore,
} from '@/mods/mod-ui'

import WelcomeDesktop from './WelcomeDesktop'
import WelcomeMobile from './WelcomeMobile'

import type { SaveMetadata } from '@/core/storage/save-manager'

const WelcomeModals = dynamic(() => import('./WelcomeModals'), { ssr: false })

export default function WelcomePage() {
  const router = useRouter()
  const setGamePhase = useGlobalStore((s) => s.setGamePhase)
  const [latestSave, setLatestSave] = useState<SaveMetadata | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'model-call'>('appearance')
  const [showHelp, setShowHelp] = useState(false)
  const [showDisclaimer, setShowDisclaimer] = useState(false)
  const { toasts, addToast, dismissToast } = useToastStore()
  const isMobile = useIsMobile()
  const pendingActionRef = useRef<'start-new-game' | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLatestSave(saveManager.listSaves()[0] ?? null)
    if (!isDisclaimerAccepted()) {
      setShowDisclaimer(true)
    }
  }, [])

  const handleStartNewGame = useCallback(() => {
    if (!isDisclaimerAccepted()) {
      pendingActionRef.current = 'start-new-game'
      setShowDisclaimer(true)
      return
    }
    if (!isApiConfigured()) {
      addToast('warning', '请先配置 API Key，填入 Key 后点击「保存配置」即可开始模拟', 5000)
      setSettingsTab('model-call')
      setShowSettings(true)
      return
    }
    pendingActionRef.current = null
    setGamePhase('world_build')
    router.push('/new-game')
  }, [router, setGamePhase, addToast])

  const handleContinue = useCallback(async () => {
    if (!latestSave) return
    try {
      const data = await saveManager.loadSave(latestSave.slot)
      if (data) {
        applyGameSave(data)
      }
      router.push('/game-story')
    } catch (err) {
      // 核心存档恢复失败：留在欢迎页并提示，避免进入半加载的损坏游戏态
      console.error('[welcome] 继续游戏加载失败:', err)
      addToast('error', `存档加载失败：${err instanceof Error ? err.message : '未知错误'}`, 5000)
    }
  }, [latestSave, router, addToast])

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
      <StarfieldBackground count={300} speed={0.5} enableOrbits={false} />

      {isMobile ? (
        <WelcomeMobile
          onStartNewGame={handleStartNewGame}
          onContinue={handleContinue}
          latestSave={latestSave}
          onOpenSettings={() => { setSettingsTab('appearance'); setShowSettings(true) }}
          onOpenHelp={() => setShowHelp(true)}
        />
      ) : (
        <WelcomeDesktop
          onStartNewGame={handleStartNewGame}
          onContinue={handleContinue}
          latestSave={latestSave}
          onOpenSettings={() => { setSettingsTab('appearance'); setShowSettings(true) }}
          onOpenHelp={() => setShowHelp(true)}
        />
      )}

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
