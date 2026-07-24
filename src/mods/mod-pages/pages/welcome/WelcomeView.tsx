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
}: WelcomeViewProps) {
  const hasAnySave = saves.length > 0 || Boolean(cloudSave)

  return (
    <main className={styles.container}>
      <div className={styles.runningHead} aria-hidden="true">
        <span>AI LIFE SIM · 命书</span>
        <span>00 / 欢迎</span>
      </div>

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
            <span className={styles.routeArrow} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </button>
          <button type="button" className={`${styles.routeAction} ${styles.secondaryBtn}`} onClick={onOpenSettings}>
            <span className={styles.routeIndex}>04</span>
            <span className={styles.routeCopy}><strong>设置</strong></span>
            <span className={styles.routeArrow} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </button>
          <button type="button" className={`${styles.routeAction} ${styles.secondaryBtn}`} onClick={onOpenHelp}>
            <span className={styles.routeIndex}>05</span>
            <span className={styles.routeCopy}><strong>游戏说明</strong></span>
            <span className={styles.routeArrow} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </button>
          <button type="button" className={`${styles.routeAction} ${styles.secondaryBtn} ${styles.feedbackAction}`} onClick={onOpenFeedback}>
            <span className={styles.routeIndex}>06</span>
            <span className={styles.routeCopy}><strong>反馈与建议</strong></span>
            <span className={styles.routeArrow} aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          </button>
        </div>

        <a
          href="https://qm.qq.com/q/6iROwlTqYU"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.footerLink}
        >
          故事小分队 · 1097782298
        </a>
      </section>
    </main>
  )
}
