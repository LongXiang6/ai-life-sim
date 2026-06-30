'use client'

/**
 * @module WelcomeContent.tsx
 * @description 欢迎页统一内容（响应式，Desktop/Mobile 合并）
 * @mod mod-pages
 */

import Link from 'next/link'

import { Button, PageScroll } from '@/mods/mod-ui'

import type { SaveMetadata } from '@/core/storage/save-manager'

import styles from './WelcomeContent.module.css'

export interface WelcomeContentProps {
  onStartNewGame: () => void
  onContinue: () => void
  latestSave: SaveMetadata | null
  onOpenSettings: () => void
  onOpenHelp: () => void
}

export function WelcomeContent({
  onStartNewGame,
  onContinue,
  latestSave,
  onOpenSettings,
  onOpenHelp,
}: WelcomeContentProps) {
  return (
    <PageScroll className={styles.pageScroll}>
      <div className={styles.container}>
        <div className={styles.wrapper}>
          <div className={styles.emoji} aria-hidden>🌟</div>

          <h1 className={styles.title}>AI 人生模拟</h1>
          <p className={styles.subtitle}>探索无限可能的人生</p>

          <div className={styles.buttons}>
            <Button
              variant="secondary"
              size="lg"
              className={styles.actionBtn}
              onClick={onStartNewGame}
            >
              🎮 开始模拟
            </Button>

            <Button
              variant="outline"
              size="lg"
              className={styles.actionBtn}
              onClick={onContinue}
              disabled={!latestSave}
            >
              {latestSave
                ? `💾 继续模拟 — ${latestSave.characterName || latestSave.name}`
                : '💾 暂无存档'}
            </Button>

            <Button
              variant="ghost"
              size="md"
              className={styles.actionBtn}
              onClick={onOpenSettings}
            >
              ⚙️ 设置
            </Button>

            <Button
              variant="ghost"
              size="md"
              className={styles.actionBtn}
              onClick={onOpenHelp}
            >
              📖 说明文档
            </Button>
          </div>

          <div className={styles.footer}>
            <Link
              href="https://qm.qq.com/q/6iROwlTqYU"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerLink}
            >
              故事小分队交流群：1097782298
            </Link>
          </div>
        </div>
      </div>
    </PageScroll>
  )
}
