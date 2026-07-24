'use client'

import { useState, useRef, useEffect } from 'react'
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
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (option: string) => {
    onValueChange(option)
    setIsOpen(false)
  }

  return (
    <li className={styles.dimensionCard}>
      <div className={styles.dimensionCopy}>
        <h3><span className="semantic-emoji" aria-hidden="true">{field.icon}</span>{field.label}</h3>
        <p>{field.description}</p>
      </div>

      <div className={styles.modeControl} aria-label={`${field.label}设定方式`}>
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            className={field.mode === mode ? styles.modeActive : ''}
            onClick={() => onModeChange(mode)}
            aria-pressed={field.mode === mode}
          >
            {MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      <div className={styles.currentValue}>
        {field.mode === 'ai' && (
          <input
            className={styles.fieldInput}
            value="由 AI 判断"
            aria-label={`${field.label} AI 结果`}
            disabled
          />
        )}
        {field.mode === 'adaptive' && (
          <>
            <button
              ref={triggerRef}
              className={styles.selectTrigger}
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              aria-haspopup="listbox"
              aria-expanded={isOpen}
            >
              <span>{field.playerValue || '请选择'}</span>
              <span className={styles.chevron} aria-hidden="true" />
            </button>
            {isOpen && (
              <div ref={dialogRef} className={styles.choiceDialog}>
                <div className={styles.choiceSheet}>
                  <div className={styles.choiceOptions} role="listbox">
                    {field.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        role="option"
                        className={styles.choiceOption}
                        aria-selected={option === field.playerValue}
                        onClick={() => handleSelect(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {field.mode === 'custom' && (
          <textarea
            value={field.customValue}
            rows={2}
            placeholder="输入自定义内容..."
            onChange={(event) => onCustomChange(event.target.value)}
            aria-label={`${field.label}自定义设定`}
          />
        )}
      </div>
    </li>
  )
}
