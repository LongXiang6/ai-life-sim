'use client'

/**
 * @module SettingsHelpTooltip
 * @description 废案同款 ⓘ 帮助提示组件
 * @mod mod-settings
 */

interface SettingsHelpTooltipProps {
  helpKey: string
  helpOpen: Record<string, boolean>
  helpData: Record<string, string>
  toggleHelp: (id: string) => void
  width?: number
}

/** 废案同款 ⓘ 帮助提示组件
 * @param helpKey 帮助标识键
 * @param helpOpen 帮助开启状态映射
 * @param helpData 帮助数据映射
 * @param toggleHelp 切换帮助显示回调
 * @param width 提示框宽度（默认 260）
 */
export function SettingsHelpTooltip({
  helpKey,
  helpOpen,
  helpData,
  toggleHelp,
  width = 260,
}: SettingsHelpTooltipProps) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4 }}>
      <span
        onClick={(e) => { e.stopPropagation(); toggleHelp(helpKey) }}
        style={{
          fontSize: 12, cursor: 'pointer', color: 'var(--color-text-tertiary)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 16, height: 16, borderRadius: '50%',
          border: '1px solid var(--color-border)', lineHeight: 1, userSelect: 'none',
        }}
        title="点击查看说明"
      >
        ⓘ
      </span>
      {helpOpen[helpKey] && (
        <div style={{
          position: 'absolute', left: 'calc(100% + 6px)', top: -8, zIndex: 100,
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 8, padding: '8px 10px', fontSize: 11,
          color: 'var(--color-text-primary)', lineHeight: 1.5,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', width, whiteSpace: 'normal',
        }}>
          {helpData[helpKey]}
        </div>
      )}
    </span>
  )
}
