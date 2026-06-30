'use client'

/**
 * @module EventCard.tsx
 * @description 事件卡牌有机体组件 —— 叙事文本 + 分支选项，支持玩家交互选择
 * @mod mod-ui
 *
 * 创意 #5：事件卡牌化
 * 将叙事事件转化为卡牌格式，提供 2-4 个玩家可选分支。
 * 玩家选择后触发 Orchestrator 的下一轮 Prompt 注入。
 */

import { BranchChoice } from '../molecules/BranchChoice'
import type { BranchOption } from '../molecules/BranchChoice'

export interface EventCardChoice {
  /** 选项 ID */
  id: string
  /** 选项标签（简短） */
  label: string
  /** 选项提示（描述可能的后果） */
  hint?: string
}

export interface EventCardProps {
  /** 叙事文本 */
  narrative: string
  /** 分支选项（2-4 个） */
  choices: EventCardChoice[]
  /** 选择回调 */
  onSelect: (choiceId: string) => void
  /** 卡牌标题 */
  title?: string
  /** 是否禁用交互（如已选择后） */
  disabled?: boolean
  /** 已选中的选项 ID */
  selectedId?: string | null
}

/**
 * 将 EventCardChoice[] 映射为 BranchOption[]
 */
function toBranchOptions(choices: EventCardChoice[]): BranchOption[] {
  return choices.map((c) => ({
    id: c.id,
    label: c.label,
    description: c.hint,
  }))
}

/**
 * 事件卡牌组件 —— 叙事文本 + 分支选项，支持玩家交互选择
 * @param {EventCardProps} props - 组件属性
 */
export function EventCard({
  narrative,
  choices,
  onSelect,
  title = '命运的分岔路',
  disabled = false,
  selectedId,
}: EventCardProps) {
  if (choices.length === 0) return null

  return (
    <div
      className="my-4 mx-auto max-w-[680px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-lg"
      style={{ transition: 'all 0.3s ease' }}
    >
      {/* 叙事文本 */}
      <div className="mb-4 text-sm leading-relaxed text-[var(--color-text-primary)] whitespace-pre-wrap">
        {narrative}
      </div>

      {/* 分隔线 */}
      <div className="mb-4 border-t border-[var(--color-border)]" />

      {/* 分支选择 */}
      <BranchChoice
        options={toBranchOptions(choices)}
        onSelect={onSelect}
        allowCustom={false}
        title={title}
        disabled={disabled}
      />

      {/* 已选择提示 */}
      {selectedId && (
        <div className="mt-3 text-center text-xs text-[var(--color-text-tertiary)]">
          已选择：{choices.find((c) => c.id === selectedId)?.label ?? selectedId}
        </div>
      )}
    </div>
  )
}
