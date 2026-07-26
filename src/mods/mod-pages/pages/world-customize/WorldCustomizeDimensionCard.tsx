'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type EditableField, type FieldMode } from './world-customize.types'

import styles from './WorldCustomizeMobile.module.css'

const MODES: FieldMode[] = ['ai', 'adaptive', 'custom']
const MODE_LABELS: Record<FieldMode, string> = { ai: 'AI', adaptive: '选择', custom: '自定' }

interface ChoiceLayout {
  portalRoot: HTMLElement
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

export function WorldCustomizeDimensionCard({ field, onModeChange, onValueChange, onCustomChange }: {
  field: EditableField
  onModeChange: (mode: FieldMode) => void
  onValueChange: (value: string) => void
  onCustomChange: (value: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const [choiceLayout, setChoiceLayout] = useState<ChoiceLayout | null>(null)
  const choiceListId = useId()

  const measureChoiceLayout = useCallback((): ChoiceLayout | null => {
    const trigger = triggerRef.current
    const canvas = trigger?.closest<HTMLElement>('.final-flow-design-canvas')
    if (!trigger || !canvas) return null

    const canvasRect = canvas.getBoundingClientRect()
    const triggerRect = trigger.getBoundingClientRect()
    const scale = canvasRect.width / canvas.clientWidth
    if (!Number.isFinite(scale) || scale <= 0) return null

    const toCanvasUnit = (value: number) => value / scale
    const triggerTop = toCanvasUnit(triggerRect.top - canvasRect.top)
    const triggerBottom = toCanvasUnit(triggerRect.bottom - canvasRect.top)
    const left = toCanvasUnit(triggerRect.left - canvasRect.left)
    const width = toCanvasUnit(triggerRect.width)
    const bottomBar = canvas.querySelector<HTMLElement>('[data-flow-bottom-bar]')
    const bottomBarTop = bottomBar
      ? toCanvasUnit(bottomBar.getBoundingClientRect().top - canvasRect.top)
      : canvas.clientHeight - 12
    const topBoundary = 12
    const bottomBoundary = Math.max(topBoundary + 72, bottomBarTop - 8)
    const gap = 4
    const availableAbove = Math.max(72, triggerTop - topBoundary - gap)
    const availableBelow = Math.max(72, bottomBoundary - triggerBottom - gap)
    const openUpward = availableAbove > availableBelow

    return {
      portalRoot: canvas,
      left,
      width,
      maxHeight: Math.floor(openUpward ? availableAbove : availableBelow),
      ...(openUpward
        ? { bottom: Math.floor(canvas.clientHeight - triggerTop + gap) }
        : { top: Math.floor(triggerBottom + gap) }),
    }
  }, [])

  const updateChoiceLayout = useCallback(() => {
    const nextLayout = measureChoiceLayout()
    if (nextLayout) setChoiceLayout(nextLayout)
  }, [measureChoiceLayout])

  useEffect(() => {
    function handlePointerDownOutside(event: PointerEvent) {
      if (dialogRef.current && !dialogRef.current.contains(event.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setIsOpen(false)
        triggerRef.current?.focus()
      }
    }

    function handleScroll(event: Event) {
      if (dialogRef.current?.contains(event.target as Node)) return
      setIsOpen(false)
    }

    if (isOpen) {
      document.addEventListener('pointerdown', handlePointerDownOutside)
      document.addEventListener('keydown', handleKeyDown)
      document.addEventListener('scroll', handleScroll, true)
      window.addEventListener('resize', updateChoiceLayout)
      return () => {
        document.removeEventListener('pointerdown', handlePointerDownOutside)
        document.removeEventListener('keydown', handleKeyDown)
        document.removeEventListener('scroll', handleScroll, true)
        window.removeEventListener('resize', updateChoiceLayout)
      }
    }
  }, [isOpen, updateChoiceLayout])

  const handleSelect = (option: string) => {
    onValueChange(option)
    setIsOpen(false)
  }

  const handleTriggerClick = () => {
    if (isOpen) {
      setIsOpen(false)
      return
    }

    const nextLayout = measureChoiceLayout()
    if (!nextLayout) return
    setChoiceLayout(nextLayout)
    setIsOpen(true)
  }

  const selectedOption = field.optionDetails?.[field.playerValue]
  const selectedLabel = selectedOption?.title ?? (field.playerValue || '请选择')

  const choiceDialog = isOpen && choiceLayout && createPortal(
    <div
      ref={dialogRef}
      className={styles.choiceDialog}
      style={{
        left: choiceLayout.left,
        width: choiceLayout.width,
        maxHeight: choiceLayout.maxHeight,
        top: choiceLayout.top,
        bottom: choiceLayout.bottom,
      }}
    >
      <div className={styles.choiceSheet}>
        <div id={choiceListId} className={styles.choiceOptions} role="listbox" aria-label={`${field.label}选项`}>
          {field.options.map((option) => {
            const detail = field.optionDetails?.[option]
            const optionLabel = detail?.title ?? option
            return (
              <button
                key={option}
                type="button"
                role="option"
                className={styles.choiceOption}
                aria-selected={option === field.playerValue}
                aria-label={detail ? `${detail.title}：${detail.description}` : option}
                onClick={() => handleSelect(option)}
              >
                <span className={styles.choiceOptionCopy}>
                  <strong>{optionLabel}</strong>
                  {detail?.description && <small>{detail.description}</small>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    choiceLayout.portalRoot,
  )

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
              onClick={handleTriggerClick}
              aria-haspopup="listbox"
              aria-expanded={isOpen}
              aria-controls={isOpen ? choiceListId : undefined}
            >
              <span>{selectedLabel}</span>
              <span className={styles.chevron} aria-hidden="true" />
            </button>
            {choiceDialog}
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
