'use client'

/**
 * @module WelcomeView
 * @description 欢迎页单 DOM 响应式视图 —— 移动端与桌面端共享功能和文案
 * @mod mod-pages
 */

import type { SaveMetadata } from '@/core/storage/save-manager'

import styles from './WelcomeView.module.css'
import WelcomeSaveSheet from './WelcomeSaveSheet'

interface WelcomeViewProps {
  onStartNewGame: () => void
  saves: SaveMetadata[]
  selectedSlot: number | null
  onSelectSave: (slot: number) => void
  onContinueSave: (slot: number) => Promise<boolean>
  onDeleteSave: (slot: number) => Promise<boolean>
  onOpenSettings: () => void
  onOpenAccount: () => void
  onOpenHelp: () => void
  onOpenFeedback: () => void
}

export default function WelcomeView({
  onStartNewGame,
  saves,
  selectedSlot,
  onSelectSave,
  onContinueSave,
  onDeleteSave,
  onOpenSettings,
  onOpenAccount,
  onOpenHelp,
  onOpenFeedback,
}: WelcomeViewProps) {
  const latestSave = saves[0] ?? null

  return (
    <main className={styles.container}>
      <div className={styles.runningHead} aria-hidden="true">
        <span>AI LIFE SIM · 命书</span>
        <span>00 / 欢迎</span>
      </div>
      <span className={styles.spine} aria-hidden="true" />
      <span className={styles.verticalBrand} aria-hidden="true">AI LIFE SIM</span>
      <svg
        className={styles.trajectory}
        viewBox="0 0 390 844"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path
          className={styles.trajectoryPath}
          d="M338 22 C218 122 374 230 272 338 S125 518 244 614 S354 728 290 850"
        />
        <circle className={styles.trajectoryStart} cx="338" cy="22" r="5" />
        <circle className={styles.trajectoryNode} cx="272" cy="338" r="4" />
        <circle className={styles.trajectoryNode} cx="244" cy="614" r="4" />
        <circle className={styles.trajectoryNode} cx="290" cy="850" r="4" />
      </svg>

      <section className={styles.intro} aria-labelledby="welcome-title">
        <p className={styles.brand}>人生序章</p>
        <h1 id="welcome-title" className={styles.title}>
          一生很长，
          <span>也只由几次选择组成。</span>
        </h1>
        <p className={styles.subtitle}>选择世界与角色，走过关系、机会、代价和告别。</p>
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
            <small>创建世界与角色，写下新的命书</small>
          </span>
          <span className={styles.routeArrow} aria-hidden="true">→</span>
        </button>

        {latestSave && (
          <WelcomeSaveSheet
            saves={saves}
            selectedSlot={selectedSlot}
            onSelectSave={onSelectSave}
            onContinueSave={onContinueSave}
            onDeleteSave={onDeleteSave}
          />
        )}

        <p className={styles.utilityHeading}>辅助入口</p>
        <div className={styles.secondaryActions}>
          <button type="button" className={`${styles.routeAction} ${styles.secondaryBtn}`} onClick={onOpenAccount}>
            <span className={styles.routeIndex}>03</span>
            <span className={styles.routeCopy}><strong>账号与云端</strong><small>登录、同步与栏位管理</small></span>
            <span className={styles.routeArrow} aria-hidden="true">→</span>
          </button>
          <button type="button" className={`${styles.routeAction} ${styles.secondaryBtn}`} onClick={onOpenSettings}>
            <span className={styles.routeIndex}>04</span>
            <span className={styles.routeCopy}><strong>设置</strong><small>模型、叙事与界面偏好</small></span>
            <span className={styles.routeArrow} aria-hidden="true">→</span>
          </button>
          <button type="button" className={`${styles.routeAction} ${styles.secondaryBtn}`} onClick={onOpenHelp}>
            <span className={styles.routeIndex}>05</span>
            <span className={styles.routeCopy}><strong>游戏说明</strong><small>规则、版本与操作说明</small></span>
            <span className={styles.routeArrow} aria-hidden="true">→</span>
          </button>
          <button type="button" className={`${styles.routeAction} ${styles.secondaryBtn} ${styles.feedbackAction}`} onClick={onOpenFeedback}>
            <span className={styles.routeIndex}>06</span>
            <span className={styles.routeCopy}><strong>反馈与建议</strong><small>提交问题并打包上传诊断日志</small></span>
            <span className={styles.routeArrow} aria-hidden="true">→</span>
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
