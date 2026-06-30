'use client'

/**
 * @module SettingsModal.tsx
 * @description 设置弹窗容器 —— 参照废弃项目：🎨个性化 → 🤖模型设置 → 🔌模型调用
 * @mod mod-settings
 */

import { useState, useCallback } from 'react'

import { SettingsTabTheme } from './SettingsTabTheme'
import { SettingsTabModel } from './SettingsTabModel'
import { SettingsTabPresets } from './SettingsTabPresets'
import { SettingsTabPrompt } from './SettingsTabPrompt'

import styles from './SettingsModal.module.css'

type TabId = 'appearance' | 'ai' | 'model-call' | 'prompt'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'appearance', label: '个性化', icon: '🎨' },
  { id: 'ai', label: '模型设置', icon: '🤖' },
  { id: 'model-call', label: '模型调用', icon: '🔌' },
  { id: 'prompt', label: 'Prompt', icon: '📝' },
]

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  /** 初始激活的标签页，默认 'appearance'（个性化） */
  initialTab?: TabId
}

/** 设置弹窗容器 —— 参照废弃项目：🎨个性化 → 🤖模型设置 → 🔌模型调用
 * @param open 是否打开弹窗
 * @param onClose 关闭回调
 * @param initialTab 初始激活的标签页（默认 'appearance'）
 */
export function SettingsModal({ open, onClose, initialTab }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'appearance')

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  if (!open) return null

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label="设置"
    >
      <div
        className={styles.modalFrame}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className={styles.header}>
          <h2 className={styles.title}>⚙️ 设置</h2>
          <button onClick={onClose} className={styles.closeBtn}>
            关闭
          </button>
        </div>

        {/* Tab 栏 */}
        <div className={styles.tabBar}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab 内容 */}
        <div className={styles.tabContent}>
          {activeTab === 'appearance' && <SettingsTabTheme />}
          {activeTab === 'ai' && <SettingsTabModel />}
          {activeTab === 'model-call' && <SettingsTabPresets />}
          {activeTab === 'prompt' && <SettingsTabPrompt />}
        </div>
      </div>
    </div>
  )
}

export { useSettingsStore } from '../store'
