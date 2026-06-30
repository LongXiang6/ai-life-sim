'use client'

/**
 * @module SettingsParamCard.tsx
 * @description 废案同款参数卡片 —— 带启用/默认开关、推荐标签、滑块、描述
 * @mod mod-settings
 */

import { SettingsHelpTooltip } from './SettingsHelpTooltip'

interface SettingsParamCardProps {
  title: string
  helpKey: string
  helpOpen: Record<string, boolean>
  helpData: Record<string, string>
  toggleHelp: (id: string) => void
  enabled: boolean
  onToggle: () => void
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

/** 废案同款参数卡片 —— 带启用/默认开关、推荐标签、滑块、描述
 * @param title 参数标题
 * @param helpKey 帮助标识键
 * @param helpOpen 帮助开启状态映射
 * @param helpData 帮助数据映射
 * @param toggleHelp 切换帮助显示回调
 * @param enabled 是否启用
 * @param onToggle 切换启用状态回调
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
  enabled, onToggle, value, onValueChange,
  min, max, step, isInteger,
  recommendEnabled, recommendText, recommendDescription,
  enabledDescription, footerText, helpWidth,
}: SettingsParamCardProps) {
  const displayValue = isInteger ? String(value) : value.toFixed(2)
  const badgeBg = recommendEnabled ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)'
  const badgeColor = recommendEnabled ? 'var(--color-success)' : 'var(--color-warning)'

  return (
    <div style={{
      background: 'var(--color-surface)', borderRadius: 12, overflow: 'hidden',
      marginBottom: 20, border: '1px solid var(--color-border)',
    }}>
      <div style={{
        padding: '14px 16px 12px',
        fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', letterSpacing: '-0.2px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>{title}
          <SettingsHelpTooltip helpKey={helpKey} helpOpen={helpOpen} helpData={helpData} toggleHelp={toggleHelp} width={helpWidth} />
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 400, color: 'var(--color-text-tertiary)' }}>
          <span style={{ color: enabled ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontWeight: enabled ? 600 : 400 }}>
            {enabled ? '已启用' : '默认'}
          </span>
          <div
            onClick={onToggle}
            style={{
              position: 'relative', width: 36, height: 20, borderRadius: 10,
              background: enabled ? 'var(--color-success)' : 'var(--color-bg)',
              transition: 'all 0.2s ease', cursor: 'pointer',
              border: enabled ? 'none' : '1px solid var(--color-border)',
            }}
          >
            <div style={{
              position: 'absolute', top: enabled ? 2 : 1, width: 16, height: 16, borderRadius: '50%',
              background: 'white', transition: 'all 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              left: enabled ? 18 : 1,
            }} />
          </div>
        </label>
      </div>
      <div style={{
        padding: '0 16px 12px', fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.6,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: badgeBg, color: badgeColor, fontWeight: 600, lineHeight: '18px' }}>
          {recommendText}
        </span>
        {recommendDescription}
      </div>
      {enabled && (
        <div style={{ padding: '12px 16px 16px' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: '0 0 10px', lineHeight: 1.5 }}>
            {enabledDescription}
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={e => onValueChange(isInteger ? parseInt(e.target.value) : parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--color-primary)' }}
            />
            <span style={{ fontSize: 12, fontWeight: 600, minWidth: isInteger ? 48 : 32, textAlign: 'right', color: 'var(--color-text-primary)' }}>
              {displayValue}
            </span>
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 6 }}>{footerText}</p>
        </div>
      )}
    </div>
  )
}
