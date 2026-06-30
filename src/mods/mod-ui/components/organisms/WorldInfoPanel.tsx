'use client'

/**
 * @module WorldInfoPanel
 * @description 世界信息面板有机体组件 —— 3 色彩分区展示世界状态
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：3 色彩分区一眼区分信息类型
 *   - Deference：可折叠，不抢叙事空间
 *   - Depth：卡片 + 阴影 + 标签化展示
 *
 * 布局：
 *   ┌─ 你的周边（蓝色）──────────────────────────┐
 *   │  📍 定居地 · 📍 势力 · 📍 国家 · 📍 人口      │
 *   └────────────────────────────────────────────┘
 *   ┌─ 基础状态（绿色）──────────────────────────┐
 *   │  🎵 季节 · 📓 气候 · 📆 纪元 · 🎲 方向       │
 *   └────────────────────────────────────────────┘
 *   ┌─ 角色状态（橙色）──────────────────────────┐
 *   │  ❌ 健康 · 👨‍👩‍👧 家庭 · 🔁 关系 · 📈 声望       │
 *   └────────────────────────────────────────────┘
 */

import { cn } from '@/foundation/utils/cn'

// ==================== 类型 ====================

interface InfoItem {
  icon: string
  label: string
  value: string,
}

export interface WorldInfoPanelProps {
  /** 你的周边 */
  surrounding?: InfoItem[]
  /** 基础状态 */
  basicStatus?: InfoItem[]
  /** 角色状态 */
  characterStatus?: InfoItem[]
  className?: string,
}

// ==================== 分区配置 ====================

interface SectionConfig {
  title: string
  bgClass: string
  borderClass: string
  iconColorClass: string,
}

const SECTIONS: Record<'surrounding' | 'basicStatus' | 'characterStatus', SectionConfig> = {
  surrounding: {
    title: '你的周边',
    bgClass: 'bg-sky-500/[0.06]',
    borderClass: 'border-sky-500/20',
    iconColorClass: 'text-sky-400',
  },
  basicStatus: {
    title: '基础状态',
    bgClass: 'bg-emerald-500/[0.06]',
    borderClass: 'border-emerald-500/20',
    iconColorClass: 'text-emerald-400',
  },
  characterStatus: {
    title: '角色状态',
    bgClass: 'bg-amber-500/[0.06]',
    borderClass: 'border-amber-500/20',
    iconColorClass: 'text-amber-400',
  },
}

// ==================== 子组件 ====================

function InfoSection({
  title,
  items,
  config,
}: {
  title: string
  items: InfoItem[]
  config: SectionConfig
}) {
  if (items.length === 0) return null

  return (
    <div className={cn('rounded-xl border p-3', config.bgClass, config.borderClass)}>
      <h4 className={cn('text-xs font-semibold mb-2', config.iconColorClass)}>
        {title}
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item.label}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-[var(--color-bg-primary)]/80 border border-[var(--color-border)]/50"
            title={item.value}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span className="text-[var(--color-text-tertiary)]">{item.label}:</span>
            <span className="text-[var(--color-text-secondary)] font-medium max-w-[120px] truncate">
              {item.value || '—'}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ==================== 主组件 ====================

/**
 * 世界信息面板组件 —— 3 色彩分区展示世界状态
 * @param {WorldInfoPanelProps} props - 组件属性
 */
export function WorldInfoPanel({
  surrounding = [],
  basicStatus = [],
  characterStatus = [],
  className,
}: WorldInfoPanelProps) {
  const hasData = surrounding.length > 0 || basicStatus.length > 0 || characterStatus.length > 0

  if (!hasData) return null

  return (
    <div className={cn('flex flex-col gap-2 p-3 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]', className)}>
      <InfoSection title={SECTIONS.surrounding.title} items={surrounding} config={SECTIONS.surrounding} />
      <InfoSection title={SECTIONS.basicStatus.title} items={basicStatus} config={SECTIONS.basicStatus} />
      <InfoSection title={SECTIONS.characterStatus.title} items={characterStatus} config={SECTIONS.characterStatus} />
    </div>
  )
}

