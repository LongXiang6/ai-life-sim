import { Dropdown } from '@/mods/mod-ui'

import { type EditableField, type FieldMode } from './world-customize.types'

import styles from './WorldCustomizeMobile.module.css'

const MODES: FieldMode[] = ['ai', 'adaptive', 'custom']
const MODE_LABELS: Record<FieldMode, string> = { ai: 'AI', adaptive: '选择', custom: '自定' }

export function WorldCustomizeDimensionCard({ field, onModeChange, onValueChange, onCustomChange }: {
  field: EditableField
  onModeChange: (mode: FieldMode) => void
  onValueChange: (value: string) => void
  onCustomChange: (value: string) => void
}) {
  return (
    <li className={styles.dimensionCard}>
      <div className={styles.dimensionHeader}>
        <div className={styles.dimensionCopy}>
          <h3><span className="semantic-emoji" data-semantic-emoji aria-hidden="true">{field.icon}</span>{field.label}</h3>
          <p>{field.description}</p>
        </div>
        <div className={styles.modeControl} aria-label={`${field.label}设定方式`}>
          {MODES.map((mode) => (
            <button key={mode} type="button" className={field.mode === mode ? styles.modeActive : ''} onClick={() => onModeChange(mode)} aria-pressed={field.mode === mode}>
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.currentValue}>
        <span>{field.mode === 'adaptive' ? '当前选择' : field.mode === 'custom' ? '自定义规则' : '当前结果'}</span>
        {field.mode === 'ai' && <strong>由 AI 根据世界描述判断</strong>}
        {field.mode === 'adaptive' && <Dropdown value={field.playerValue} options={field.options} onChange={onValueChange} placeholder="请选择" className={styles.valueDropdown} />}
        {field.mode === 'custom' && (
          <textarea
            value={field.customValue}
            rows={2}
            placeholder="输入自定义内容…"
            onChange={(event) => onCustomChange(event.target.value)}
          />
        )}
      </div>
    </li>
  )
}
