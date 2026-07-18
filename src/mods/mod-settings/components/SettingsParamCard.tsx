'use client'

/**
 * @module SettingsParamCard.tsx
 * @description 模型参数卡片 —— 带启用状态、推荐提示、滑块与说明
 * @mod mod-settings
 */

import { SettingsHelpTooltip } from './SettingsHelpTooltip'

import styles from './SettingsTabModel.module.css'

interface SettingsParamCardProps {
  title: string
  helpKey: string
  helpOpen: Record<string, boolean>
  helpData: Record<string, string>
  toggleHelp: (id: string) => void
  enabled: boolean
  onToggle?: () => void
  toggleable?: boolean
  activeLabel?: string
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  step: number
  isInteger: boolean
  recommendEnabled: boolean
  recommendText: string
  recommendDescription: string
  enabledDescription: string
  footerText: string
  helpWidth?: number
}

/** 模型参数卡片 —— 带启用状态、推荐提示、滑块与说明
 * @param title 参数标题
 * @param helpKey 帮助标识键
 * @param helpOpen 帮助开启状态映射
 * @param helpData 帮助数据映射
 * @param toggleHelp 切换帮助显示回调
 * @param enabled 是否启用
 * @param onToggle 切换启用状态回调
 * @param toggleable 是否允许切换启用状态
 * @param activeLabel 不可切换时展示的真实生效状态
 * @param value 当前数值
 * @param onValueChange 数值变更回调
 * @param min 最小值
 * @param max 最大值
 * @param step 步长
 * @param isInteger 是否为整数
 * @param recommendEnabled 推荐标签是否激活
 * @param recommendText 推荐标签文本
 * @param recommendDescription 推荐描述
 * @param enabledDescription 启用时描述
 * @param footerText 底部文本
 * @param helpWidth 帮助提示宽度
 */
export function SettingsParamCard({
  title, helpKey, helpOpen, helpData, toggleHelp,
  enabled, onToggle, toggleable = true, activeLabel = '始终生效', value, onValueChange,
  min, max, step, isInteger,
  recommendEnabled, recommendText, recommendDescription,
  enabledDescription, footerText, helpWidth,
}: SettingsParamCardProps) {
  const displayValue = isInteger ? String(value) : value.toFixed(2)

  return (
    <div className={styles.paramCard}>
      <div className={styles.paramHeader}>
        <span className={styles.paramTitle}>{title}
          <SettingsHelpTooltip helpKey={helpKey} helpOpen={helpOpen} helpData={helpData} toggleHelp={toggleHelp} width={helpWidth} />
        </span>
        <div className={styles.paramState}>
          <span className={styles.paramStatus} data-enabled={enabled}>
            {toggleable ? (enabled ? '已启用' : '默认') : activeLabel}
          </span>
          {toggleable && (
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`${title}${enabled ? '已启用' : '使用默认值'}`}
              onClick={onToggle}
              className={styles.toggleSwitch}
            >
              <span className={styles.toggleSwitchThumb} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className={styles.recommendationRow}>
        <span className={styles.recommendationBadge} data-recommended={recommendEnabled}>
          {recommendText}
        </span>
        <span>{recommendDescription}</span>
      </div>
      {enabled && (
        <div className={styles.paramBody}>
          <p className={styles.paramDescription}>{enabledDescription}</p>
          <div className={styles.rangeRow}>
            <input
              type="range"
              aria-label={title}
              min={min}
              max={max}
              step={step}
              value={value}
              className={styles.rangeInput}
              onChange={(event) => onValueChange(
                isInteger
                  ? Number.parseInt(event.target.value, 10)
                  : Number.parseFloat(event.target.value),
              )}
            />
            <span className={styles.paramValue} data-integer={isInteger}>
              {displayValue}
            </span>
          </div>
          <p className={styles.paramFooter}>{footerText}</p>
        </div>
      )}
    </div>
  )
}
