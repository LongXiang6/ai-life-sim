'use client'

/**
 * @module GameBottomBar
 * @description 底部操作栏 —— 时间步进（foundation PRIMARY_TIME_STEPS）+ 控制按钮
 * @mod mod-ui
 */

import { cn } from '@/foundation/utils/cn'
import { PRIMARY_TIME_STEPS, encodeTimeStepKey } from '@/foundation/constants/time-steps'
import { MAX_WIDTH } from '../../tokens'

export interface TimeStepOption {
  label: string
  value: string
  icon?: string
  experimental?: boolean
}

export interface GameBottomBarProps {
  timeStepOptions?: TimeStepOption[]
  activeTimeStep?: string
  onTimeStepChange?: (value: string) => void
  controls?: Array<{
    label: string
    onClick: () => void
    variant?: 'primary' | 'secondary' | 'outline'
    disabled?: boolean
    icon?: string
  }>
  autoSaveIndicator?: React.ReactNode
  extraActions?: React.ReactNode
  maxWidth?: string
  className?: string
}

/** 默认步进：年正式档位（月/日/季为 experimental，不在此列表） */
export const DEFAULT_TIME_STEPS: TimeStepOption[] = PRIMARY_TIME_STEPS.map((s) => ({
  label: s.label,
  value: encodeTimeStepKey(s),
  icon: s.icon,
}))

export function GameBottomBar({
  timeStepOptions = DEFAULT_TIME_STEPS,
  activeTimeStep = encodeTimeStepKey({ unit: 'year', value: 1 }),
  onTimeStepChange,
  controls = [],
  autoSaveIndicator,
  extraActions,
  maxWidth = MAX_WIDTH,
  className,
}: GameBottomBarProps) {
  return (
    <div
      className={cn(
        'shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]/90 backdrop-blur-lg',
        className,
      )}
    >
      <div style={{ maxWidth, margin: '0 auto', width: '100%' }}>
        {timeStepOptions.length > 0 && (
          <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--color-border)]/50 overflow-x-auto">
            {timeStepOptions.map((step) => (
              <button
                key={step.value}
                type="button"
                onClick={() => onTimeStepChange?.(step.value)}
                className={cn(
                  'flex-1 min-w-[40px] px-2 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 cursor-pointer',
                  activeTimeStep === step.value
                    ? 'bg-[var(--color-primary)] text-white border border-[var(--color-primary)] shadow-sm shadow-[var(--color-primary)]/20'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]',
                )}
              >
                {step.icon && <span className="mr-0.5">{step.icon}</span>}
                {step.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 px-4 py-2">
          {controls.map((ctrl, idx) => (
            <button
              key={idx}
              type="button"
              onClick={ctrl.onClick}
              disabled={ctrl.disabled}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                ctrl.variant === 'primary' && 'bg-[var(--color-primary)] text-white hover:opacity-90 active:scale-[0.98]',
                ctrl.variant === 'secondary' && 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:bg-[var(--color-bg-secondary)]',
                ctrl.variant === 'outline' && 'bg-transparent text-[var(--color-primary)] border border-[var(--color-primary)] hover:bg-[var(--color-primary)]/10',
                !ctrl.variant && 'bg-[var(--color-primary)] text-white hover:opacity-90',
              )}
            >
              {ctrl.icon && <span className="mr-1">{ctrl.icon}</span>}
              {ctrl.label}
            </button>
          ))}

          <div className="flex-1" />
          {autoSaveIndicator}
          {extraActions}
        </div>
      </div>
    </div>
  )
}
