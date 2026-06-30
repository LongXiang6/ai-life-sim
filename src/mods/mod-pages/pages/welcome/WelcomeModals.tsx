'use client'

/**
 * @module WelcomeModals
 * @description 欢迎页弹层 —— 延迟加载，不阻塞首屏
 * @mod mod-pages
 */

import {
  HelpModal,
  DisclaimerModal,
  ToastContainer,
} from '@/mods/mod-ui'
import { SettingsModal } from '@/mods/mod-settings'

import type { ToastItem } from '@/mods/mod-ui'

export interface WelcomeModalsProps {
  toasts: ToastItem[]
  onDismissToast: (id: string) => void
  showDisclaimer: boolean
  onDisclaimerAccept: () => void
  onDisclaimerClose: () => void
  showHelp: boolean
  onHelpClose: () => void
  showSettings: boolean
  onSettingsClose: () => void
  settingsTab: 'appearance' | 'model-call'
}

export default function WelcomeModals({
  toasts,
  onDismissToast,
  showDisclaimer,
  onDisclaimerAccept,
  onDisclaimerClose,
  showHelp,
  onHelpClose,
  showSettings,
  onSettingsClose,
  settingsTab,
}: WelcomeModalsProps) {
  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={onDismissToast} />

      <DisclaimerModal
        visible={showDisclaimer}
        onAccept={onDisclaimerAccept}
        onClose={onDisclaimerClose}
      />

      <HelpModal visible={showHelp} onClose={onHelpClose} />

      <SettingsModal
        key={settingsTab}
        open={showSettings}
        onClose={onSettingsClose}
        initialTab={settingsTab}
      />
    </>
  )
}
