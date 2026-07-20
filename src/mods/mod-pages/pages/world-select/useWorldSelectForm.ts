'use client'

/**
 * @module useWorldSelectForm.ts
 * @description 世界选择页共享常量与难度状态
 * @mod mod-pages
 */

import { useState } from 'react'

export type Difficulty = 'normal' | 'hard' | 'nightmare' | 'hell'

export interface DifficultyConfig {
  label: string
  color: string
}

/** 难度配置（使用 semantic token，支持主题切换） */
export const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  normal: { label: '普通', color: 'var(--color-success)' },
  hard: { label: '困难', color: 'var(--color-warning)' },
  nightmare: { label: '噩梦', color: 'var(--color-error)' },
  hell: { label: '地狱', color: 'var(--color-info)' },
}

export const DIFFICULTY_TITLES: Record<Difficulty, string> = {
  normal: '偶有强敌，轻松体验',
  hard: '挑战增强，危机潜伏',
  nightmare: '天道压制，步步惊心',
  hell: '人间地狱，九死一生',
}

export const STORAGE_KEY = 'mod-pages:custom-worlds'

export interface EraEntry {
  name: string
  startAnchorYear: number
}

export interface SavedCustomWorld {
  id: string
  name: string
  description: string
  eraName: string
  eraStartYear: number
  currentEraYear: number
  eraTimeline?: EraEntry[]
  worldview: string
  dynamicAttrTags: string[]
  /** 世界编码（AI 初始化缓存键，对齐废案 worldCode） */
  worldCode: number
}

export function useWorldSelectForm(initialDifficulty: Difficulty = 'normal') {
  const [difficultyOverride, setDifficulty] = useState<Difficulty | null>(null)
  const difficulty = difficultyOverride ?? initialDifficulty
  const [showDifficultyDropdown, setShowDifficultyDropdown] = useState(false)

  return {
    difficulty,
    setDifficulty,
    showDifficultyDropdown,
    setShowDifficultyDropdown,
  }
}
