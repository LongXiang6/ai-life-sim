'use client'

/**
 * @module WelcomeView
 * @description 欢迎页单 DOM 响应式视图 —— 移动端与桌面端共享功能和文案
 * @mod mod-pages
 */

import type { SaveMetadata } from '@/core/storage/save-manager'
import type { CloudManualSaveSummary } from '@/core/player-content/player-content-contract'

import styles from './WelcomeView.module.css'
import WelcomeSaveSheet from './WelcomeSaveSheet'

interface WelcomeViewProps {
  onStartNewGame: () => void
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
      <div className={styles.runningHead} aria-hidden="true">
        <span>AI LIFE SIM · 命书</span>
        <span>00 / 欢迎</span>
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

      <section className={styles.intro} aria-labelledby="welcome-title">
        <p className={styles.brand}>人生序章</p>
        <h1 id="welcome-title" className={styles.title}>
          一生很长，
          <br />
          <span>也只由几次选择组成。</span>
        </h1>
        <p className={styles.subtitle}>选择世界与角色。</p>
      </section>

      <section className={styles.actions} aria-label="开始与辅助操作">
        <p className={styles.routeHeading}>从这里开始</p>
        <button
          type="button"
          className={`${styles.routeAction} ${styles.primaryBtn}`}
          onClick={onStartNewGame}
          title="进入世界选择界面，创建一个全新的人生"
        >
          <span className={styles.routeIndex}>01</span>
          <span className={styles.routeCopy}>
            <strong>开始新人生</strong>
          </span>
          <span className={styles.routeArrow} aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </button>

        {hasAnySave && (
          <WelcomeSaveSheet
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

        <p className={styles.utilityHeading}>辅助入口</p>
        <div className={styles.secondaryActions}>
          <button type="button" className={`${styles.routeAction} ${styles.secondaryBtn}`} onClick={onOpenAccount}>
            <span className={styles.routeIndex}>03</span>
            <span className={styles.routeCopy}><strong>账号与云端</strong></span>
          </button>
          <button type="button" className={`${styles.routeAction} ${styles.secondaryBtn}`} onClick={onOpenSettings}>
            <span className={styles.routeIndex}>04</span>
            <span className={styles.routeCopy}><strong>设置</strong></span>
          </button>
          <button type="button" className={`${styles.routeAction} ${styles.secondaryBtn}`} onClick={onOpenHelp}>
            <span className={styles.routeIndex}>05</span>
            <span className={styles.routeCopy}><strong>游戏说明</strong></span>
          </button>
          <button type="button" className={`${styles.routeAction} ${styles.secondaryBtn}`} onClick={onOpenFeedback}>
            <span className={styles.routeIndex}>06</span>
            <span className={styles.routeCopy}><strong>反馈与建议</strong></span>
          </button>
        </div>
      </section>
    </main>
  )
}
