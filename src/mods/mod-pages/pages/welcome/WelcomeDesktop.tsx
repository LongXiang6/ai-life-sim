'use client'

/**
 * @module WelcomeDesktop
 * @description 欢迎页桌面端渲染组件（>768px）
 * @mod mod-pages
 */

import React from 'react'
import styles from './WelcomeDesktop.module.css'
import type { SaveMetadata } from '@/core/storage/save-manager'

interface WelcomeDesktopProps {
  onStartNewGame: () => void
  onContinue: () => void
  latestSave: SaveMetadata | null
  onOpenSettings: () => void
  onOpenHelp: () => void
}

export default function WelcomeDesktop({
  onStartNewGame,
  onContinue,
  latestSave,
  onOpenSettings,
  onOpenHelp,
}: WelcomeDesktopProps) {
  return (
    <div className={styles.container}>
      <div className={styles.wrapper}>
        <div className={styles.emoji}>🌟</div>

        <h1 className={styles.title}>AI 人生模拟</h1>

        <p className={styles.subtitle}>探索无限可能的人生</p>

        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.primaryBtn}
            onClick={onStartNewGame}
            title="进入世界选择界面，创建一个全新的人生"
          >
            🎮 开始新模拟
          </button>

          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onContinue}
            disabled={!latestSave}
            title={latestSave ? '读取之前保存的模拟进度继续游玩' : '当前没有任何存档记录'}
          >
            {latestSave
              ? `💾 继续模拟 — ${latestSave.characterName || latestSave.name}`
              : '💾 暂无存档'}
          </button>

          <button
            type="button"
            className={styles.ghostBtn}
            onClick={onOpenSettings}
            title="配置 AI 接口密钥和选择界面主题"
          >
            ⚙️ 设置
          </button>

          <button
            type="button"
            className={styles.ghostBtn}
            onClick={onOpenHelp}
            title="查看各界面功能的详细说明文档"
          >
            📖 说明文档
          </button>
        </div>

        <div className={styles.footer}>
          <a
            href="https://qm.qq.com/q/6iROwlTqYU"
            target="_blank"
            rel="noopener noreferrer"
            className={styles.footerLink}
          >
            故事小分队交流群：1097782298
          </a>
        </div>
      </div>
    </div>
  )
}
