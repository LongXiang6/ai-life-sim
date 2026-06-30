'use client'

/**
 * @module TalentBadge
 * @description 天赋稀有度徽章分子组件 —— 5 档稀有度发光效果
 * @mod mod-ui
 *
 * Apple HIG Depth 原则：用阴影和发光传达稀有度层级
 */

import { cn } from '@/foundation/utils/cn'

/** 天赋稀有度 */
export type TalentRarity = 'common' | 'fine' | 'rare' | 'epic' | 'legendary'

export interface TalentBadgeProps {
  name: string
  rarity: TalentRarity
  className?: string
}

const RARITY_CONFIG: Record<TalentRarity, { label: string; bgClass: string; textClass: string; glowClass: string }> = {
  common: {
    label: '凡品',
    bgClass: 'bg-gray-500/10 border-gray-500/20',
    textClass: 'text-gray-400',
    glowClass: '',
  },
  fine: {
    label: '良品',
    bgClass: 'bg-green-500/10 border-green-500/20',
    textClass: 'text-green-400',
    glowClass: 'shadow-[0_0_8px_rgba(34,197,94,0.3)]',
  },
  rare: {
    label: '珍品',
    bgClass: 'bg-blue-500/10 border-blue-500/20',
    textClass: 'text-blue-400',
    glowClass: 'shadow-[0_0_8px_rgba(59,130,246,0.3)]',
  },
  epic: {
    label: '极品',
    bgClass: 'bg-purple-500/10 border-purple-500/20',
    textClass: 'text-purple-400',
    glowClass: 'shadow-[0_0_10px_rgba(168,85,247,0.4)]',
  },
  legendary: {
    label: '仙品',
    bgClass: 'bg-amber-500/10 border-amber-500/20',
    textClass: 'text-amber-400',
    glowClass: 'shadow-[0_0_12px_rgba(245,158,11,0.5)] animate-pulse',
  },
}

/**
 * 天赋稀有度徽章组件 —— 5 档稀有度发光效果
 * @param {TalentBadgeProps} props - 组件属性
 */
export function TalentBadge({ name, rarity, className }: TalentBadgeProps) {
  const config = RARITY_CONFIG[rarity]

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
        config.bgClass,
        config.textClass,
        config.glowClass,
        className
      )}
      title={`${name}（${config.label}）`}
    >
      <span className="truncate max-w-[60px]">{name}</span>
    </span>
  )
}
