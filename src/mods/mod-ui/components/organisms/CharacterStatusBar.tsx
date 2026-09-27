/**
 * Purpose: Render the sticky character status bar, including all selected talents and rarity styling.
 * Owner: mod-ui
 * Responsibility: Present character identity, attributes, and selected talent projections without owning game state.
 */

'use client'

/**
 * @module CharacterStatusBar
 * @description 角色状态头部栏有机体组件 —— Sticky 顶部栏，展示角色完整状态
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：属性正负三色一眼区分
 *   - Deference：紧凑布局，不抢叙事内容空间
 *   - Depth：多层信息分区，用留白和边框区分层级
 *
 * 布局（桌面端）：
 *   ┌──────────────────────────────────────────────────────┐
 *   │  [角色头像] [角色名] [性别] [天赋1][天赋2]  │
 *   │  [🧠心智+2] [💪体魄+3] [💫魅力+2] [🏠财富-1]  │
 *   │  [💰财富+10] [📢声望+5] [⚔️权力+20] [🔗人脉+8]          │
 *   │                                  [纪元] [岁] [阶段]    │
 *   └──────────────────────────────────────────────────────┘
 */

import { cn } from '@/foundation/utils/cn'

import { AttributeTag } from '../molecules/AttributeTag'
import { TalentBadge, type TalentRarity } from '../molecules/TalentBadge'

// ==================== 类型 ====================

export interface TalentInfo {
  name: string
  rarity: TalentRarity,
}

export interface BaseAttributes {
  mind: number
  physique: number
  charisma: number
  familyBackground: number,
}

export interface DynamicAttributes {
  wealth: number
  fame: number
  power: number
  ability: number
  connections: number,
}

export interface CharacterStatusBarProps {
  characterName: string
  gender?: string
  age: number
  eraName?: string
  lifeStage?: string
  talents?: TalentInfo[]
  base: BaseAttributes
  dynamic: DynamicAttributes
  /** 动态属性的标签（根据世界观自动切换） */
  dynamicLabels?: {
    wealth?: string
    fame?: string
    power?: string
    ability?: string
    connections?: string
  }
  /** 内部内容区最大宽度（header 本身仍为全宽） */
  maxWidth?: string | number
  className?: string,
}

// ==================== 默认标签 ====================

const DEFAULT_DYNAMIC_LABELS = {
  wealth: '财富',
  fame: '声望',
  power: '权力',
  ability: '能力',
  connections: '人脉',
}

// ==================== 组件 ====================

/**
 * 角色状态头部栏组件 —— Sticky 顶部栏，展示角色完整状态
 * @param {CharacterStatusBarProps} props - 组件属性
 */
export function CharacterStatusBar({
  characterName,
  gender,
  age,
  eraName,
  lifeStage,
  talents = [],
  base,
  dynamic,
  dynamicLabels = DEFAULT_DYNAMIC_LABELS,
  maxWidth = '800px',
  className,
}: CharacterStatusBarProps) {
  const labels = { ...DEFAULT_DYNAMIC_LABELS, ...dynamicLabels }

  return (
    <header
      className={cn(
        'shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]',
        className
      )}
    >
      <div style={{ maxWidth, margin: '0 auto' }}>
        {/* 第一行：角色名 + 方向 + 天赋 */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)]/50">
          <div className="flex items-center gap-2 text-sm">
            {/* 角色头像占位 */}
            <div className="w-8 h-8 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-base">
              {characterName ? characterName[0] : '?'}
            </div>
            <span className="font-semibold text-[var(--color-text-primary)]">
              {characterName || '未创建'}
            </span>
            {gender && (
              <span className="text-[var(--color-text-tertiary)]">· {gender}</span>
            )}
          </div>

          {/* 天赋标签 */}
          {talents.length > 0 && (
            <div className="flex items-center gap-1">
              {talents.map((talent) => (
                <TalentBadge
                  key={talent.name}
                  name={talent.name}
                  rarity={talent.rarity}
                />
              ))}
            </div>
          )}

          {/* 时间信息 */}
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
            {eraName && <span>{eraName}</span>}
            <span className="font-semibold text-[var(--color-text-secondary)]">{age} 岁</span>
            {lifeStage && <span>{lifeStage}</span>}
          </div>
        </div>

        {/* 第二行：基础属性标签 */}
        <div className="flex items-center gap-1.5 px-4 py-1.5 flex-wrap">
          <AttributeTag icon="🧠" label="心智" value={base.mind} />
          <AttributeTag icon="💪" label="体魄" value={base.physique} />
          <AttributeTag icon="💫" label="魅力" value={base.charisma} />
          <AttributeTag icon="🏠" label="财富" value={base.familyBackground} />
        </div>

        {/* 第三行：动态属性标签 */}
        <div className="flex items-center gap-1.5 px-4 py-1.5 border-t border-[var(--color-border)]/30 flex-wrap">
          <AttributeTag icon="💰" label={labels.wealth} value={dynamic.wealth} />
          <AttributeTag icon="📢" label={labels.fame} value={dynamic.fame} />
          <AttributeTag icon="⚔️" label={labels.power} value={dynamic.power} />
          <AttributeTag icon="✨" label={labels.ability} value={dynamic.ability} />
          <AttributeTag icon="🔗" label={labels.connections} value={dynamic.connections} />
        </div>
      </div>
    </header>
  )
}
