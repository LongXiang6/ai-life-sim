'use client'

/**
 * @module BranchChoice.tsx
 * @description 分支选择分子组件 —— 叙事分支选项卡片 + 自定义输入
 * @mod mod-ui
 *
 * Apple HIG 设计原则：
 *   - Clarity：选项卡片清晰展示，当前选中高亮
 *   - Depth：卡片式布局营造层次感
 *
 * 来源：废弃项目 pages/game-simulation/useSimulationBranch.ts
 */

import { useState } from 'react'

import { Button } from '../atoms/Button'
import { Input } from '../atoms/Input'

export interface BranchOption {
  /** 选项 ID */
  id: string
  /** 选项标签 */
  label: string
  /** 选项描述 */
  description?: string
}

export interface BranchChoiceProps {
  /** 分支选项列表 */
  options: BranchOption[]
  /** 选中回调 */
  onSelect: (optionId: string) => void
  /** 是否允许自定义输入 */
  allowCustom?: boolean
  /** 自定义输入占位符 */
  customPlaceholder?: string
  /** 自定义输入确认回调 */
  onCustomConfirm?: (text: string) => void
  /** 标题 */
  title?: string
  /** 是否禁用 */
  disabled?: boolean
}

/**
 * 分支选择组件 —— 叙事分支选项卡片 + 自定义输入
 * @param {BranchChoiceProps} props - 组件属性
 */
export function BranchChoice({
  options,
  onSelect,
  allowCustom = true,
  customPlaceholder='输入自定义选择...',
  onCustomConfirm,
  title = '选择你的行动',
  disabled = false,
}: BranchChoiceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [customText, setCustomText] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  const handleSelect = (optionId: string) => {
    if (disabled) return
    setSelectedId(optionId)
    onSelect(optionId)
  }

  const handleCustomConfirm = () => {
    if (disabled || !customText.trim()) return
    onCustomConfirm?.(customText.trim())
    setCustomText('')
    setShowCustom(false)
  }

  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-base font-semibold text-[var(--color-text-primary)] text-center">
          {title}
        </h3>
      )}

      {/* 预设选项 */}
      <div className="space-y-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => handleSelect(option.id)}
            className={[
              'w-full text-left px-4 py-3 rounded-xl border transition-all duration-200',
              selectedId === option.id
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-sm'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50 hover:shadow-sm',
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            <div className="flex items-start gap-3">
              <div
                className={[
                  'flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5',
                  selectedId === option.id
                    ? 'border-[var(--color-primary)]'
                    : 'border-[var(--color-border)]',
                ].join(' ')}
              >
                {selectedId === option.id && (
                  <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-primary)]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div
                  className={[
                    'text-sm font-medium',
                    selectedId === option.id
                      ? 'text-[var(--color-primary)]'
                      : 'text-[var(--color-text-primary)]',
                  ].join(' ')}
                >
                  {option.label}
                </div>
                {option.description && (
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1 leading-relaxed">
                    {option.description}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* 自定义输入 */}
      {allowCustom && (
        <div className="pt-2">
          {!showCustom ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCustom(true)}
              disabled={disabled}
              className="w-full"
            >
              ✏️ 自定义选择...
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                value={customText}
                onChange={setCustomText}
                placeholder={customPlaceholder}
                disabled={disabled}
                className="flex-1"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={handleCustomConfirm}
                disabled={disabled || !customText.trim()}
              >
                确认
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowCustom(false); setCustomText('') }}
                disabled={disabled}
              >
                取消
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
