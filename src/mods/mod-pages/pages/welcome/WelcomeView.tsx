/** Purpose: Render the finalized welcome page. Owner: mod-pages. Responsibility: Welcome composition and public action wiring only. */

'use client'

/**
 * @module WelcomeView
 * @description 欢迎页单 DOM 响应式视图 —— 移动端与桌面端共享功能和文案
 * @mod mod-pages
 */

import type { SaveMetadata } from '@/core/storage/save-manager'
import type { CloudManualSaveSummary } from '@/core/player-content/player-content-contract'
import { FlowRunningHead } from '@/mods/mod-ui'

import styles from './WelcomeView.module.css'
import WelcomeSaveSheet from './WelcomeSaveSheet'

interface WelcomeViewProps {
  onStartNewGame: () => void
  runtimeReady: boolean
  saves: SaveMetadata[]
  cloudSave: CloudManualSaveSummary | null
  selectedSaveId: string | null
  onSelectSave: (saveId: string) => void
  onContinueSave: (slot: number) => Promise<boolean>
  onDeleteSave: (slot: number) => Promise<boolean>
  onContinueCloudSave: () => Promise<boolean>
  onDeleteCloudSave: () => Promise<boolean>
  onOpenSettings: () => void
  onOpenAccount: () => void
  onOpenHelp: () => void
  onOpenFeedback: () => void
  onOpenLeaderboard: () => void
  onOpenMailbox: () => void
}

export default function WelcomeView({
  onStartNewGame,
  runtimeReady,
  saves,
  cloudSave,
  selectedSaveId,
  onSelectSave,
  onContinueSave,
  onDeleteSave,
  onContinueCloudSave,
  onDeleteCloudSave,
  onOpenSettings,
  onOpenAccount,
  onOpenHelp,
  onOpenFeedback,
  onOpenLeaderboard,
  onOpenMailbox,
}: WelcomeViewProps) {
  const hasAnySave = saves.length > 0 || Boolean(cloudSave)

  return (
    <main className={styles.container}>
      <div className={styles.runningHeadSlot}>
        <FlowRunningHead stepLabel="00 / 欢迎" />
      </div>

      <nav className={styles.quickActions} aria-label="排行榜与邮箱">
        <button type="button" onClick={onOpenLeaderboard} aria-label="打开排行榜" title="排行榜">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 4h8v3a4 4 0 0 1-8 0V4Z" />
            <path d="M8 6H5v1a4 4 0 0 0 4 4M16 6h3v1a4 4 0 0 1-4 4M12 11v5M8 20h8M9 16h6v4" />
          </svg>
        </button>
        <button type="button" onClick={onOpenMailbox} aria-label="打开邮箱" title="邮箱">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h16v12H4zM4 7l8 6 8-6" />
          </svg>
        </button>
      </nav>

      <div className={styles.content}>
        <section className={styles.intro} aria-labelledby="welcome-title">
          <p className={styles.brand}>✦ 人生序章</p>
          <h1 id="welcome-title" className={styles.title}>🎮 人生模拟器 ✨</h1>
          <p className={styles.subtitle}>✦ 选择世界与角色。</p>
        </section>

        <section className={styles.actions} aria-label="开始与辅助操作">
          <button
            type="button"
            className={styles.primaryAction}
            onClick={onStartNewGame}
            title="进入世界选择界面，创建一个全新的人生"
          >
            🌱 开始新人生
          </button>

          <div className={styles.routeList}>
            {hasAnySave && (
              <WelcomeSaveSheet
                runtimeReady={runtimeReady}
                saves={saves}
                cloudSave={cloudSave}
                selectedSaveId={selectedSaveId}
                onSelectSave={onSelectSave}
                onContinueSave={onContinueSave}
                onDeleteSave={onDeleteSave}
                onContinueCloudSave={onContinueCloudSave}
                onDeleteCloudSave={onDeleteCloudSave}
              />
            )}
          </div>

          <div className={styles.sectionDivider} role="presentation" />
          <div className={styles.utilityGrid}>
            <button type="button" className={styles.utilityAction} onClick={onOpenAccount}>☁️ 账号与云端</button>
            <button type="button" className={styles.utilityAction} onClick={onOpenSettings}>⚙️ 设置</button>
            <button type="button" className={styles.utilityAction} onClick={onOpenHelp}>📜 游戏说明</button>
            <button type="button" className={styles.utilityAction} onClick={onOpenFeedback}>💬 反馈与建议</button>
          </div>
        </section>
      </div>
    </main>
  )
}
