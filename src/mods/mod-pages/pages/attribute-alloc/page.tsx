'use client'

/**
 * @module attribute-alloc-page
 * @description 四项基础属性分配，确认后进入命运预览。
 * @mod mod-pages
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import {
  DESTINY_PATTERN_SELECT_COUNT,
  useCharacterStore,
} from '@/mods/mod-character'
import type { BaseAttributes } from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'
import { BottomActionBar } from '@/mods/mod-ui'

import { useCreationStoresHydrated } from '../../hooks/useCreationStoresHydrated'
import styles from './AttributeAlloc.module.css'

// The selected mobile flow is the product authority for new-life creation.
// Existing saves may still contain a legacy allocation above this budget; those
// values are preserved and can only be confirmed, never silently rewritten.
const TOTAL_POINTS = 15
const MIN_VALUE = 0
const MAX_VALUE = 10

const ATTRIBUTES: ReadonlyArray<{
  key: keyof BaseAttributes
  name: string
  description: string
}> = [
  { key: 'physique', name: '体魄', description: '体力与恢复' },
  { key: 'mind', name: '心智', description: '学习与谋略' },
  { key: 'talentAptitude', name: '悟性', description: '理解与修炼' },
  { key: 'charisma', name: '魅力', description: '关系与说服' },
]

function normalizeAttributes(value?: Partial<BaseAttributes>): BaseAttributes {
  return {
    physique: value?.physique ?? 0,
    mind: value?.mind ?? 0,
    talentAptitude: value?.talentAptitude ?? 0,
    charisma: value?.charisma ?? 0,
  }
}

function describeAttribute(value: number): string {
  if (value <= 0) return '常人水平'
  if (value < 5) return '渐入佳境'
  if (value < 9) return '天赋出众'
  return '凡俗巅峰'
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function AttributeAllocContent() {
  const router = useRouter()
  const characterBase = useCharacterStore((state) => state.characterBase)
  const selectedPatterns = useCharacterStore((state) => state.destinyPatterns.patterns)
  const setCharacterBase = useCharacterStore((state) => state.setCharacterBase)
  const [initialAttributes] = useState(() => normalizeAttributes(characterBase.base))
  const [attributes, setAttributes] = useState(() => ({ ...initialAttributes }))
  const [showUnusedDialog, setShowUnusedDialog] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  const usedPoints = useMemo(
    () => ATTRIBUTES.reduce((total, attribute) => total + attributes[attribute.key], 0),
    [attributes],
  )
  const remainingPoints = Math.max(0, TOTAL_POINTS - usedPoints)
  const attributeBonuses = useMemo(() => {
    return ATTRIBUTES.reduce((result, attribute) => {
      result[attribute.key] = selectedPatterns.reduce(
        (total, pattern) => total + (pattern.attrBonus?.[attribute.key] ?? 0),
        0,
      )
      return result
    }, {} as Record<keyof BaseAttributes, number>)
  }, [selectedPatterns])

  useEffect(() => {
    if (!showUnusedDialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowUnusedDialog(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previousFocus?.focus()
    }
  }, [showUnusedDialog])

  const updateAttribute = (key: keyof BaseAttributes, delta: number) => {
    setAttributes((current) => {
      const nextValue = current[key] + delta
      if (nextValue < MIN_VALUE || nextValue > MAX_VALUE) return current
      if (delta > 0 && remainingPoints <= 0) return current
      return { ...current, [key]: nextValue }
    })
  }

  const confirm = () => {
    const base = normalizeAttributes(attributes)
    setCharacterBase({
      base,
      current: { ...base },
      modifiers: normalizeAttributes(),
      contextModifiers: {},
    })
    setShowUnusedDialog(false)
    router.push('/fate-preview')
  }

  const handleConfirm = () => {
    if (remainingPoints > 0) setShowUnusedDialog(true)
    else confirm()
  }

  return (
    <>
      <main className={styles.page}>
        <div className={styles.paper}>
          <span className={styles.spine} aria-hidden="true" />
          <header className={styles.header}>
            <div className={styles.runningHead}><span>AI LIFE SIM · 命书</span><span>06 / 08</span></div>
            <div className={styles.titleRow}>
              <div>
                <h1>属性分配</h1>
                <p>塑造这段人生的先天起点。</p>
              </div>
              <span className={styles.titleMark} aria-hidden="true"><span>06</span></span>
            </div>
          </header>

          <section className={`${styles.section} ${styles.budgetSection}`} aria-labelledby="attribute-budget-title">
            <div className={styles.sectionHeading}><strong id="attribute-budget-title">基础点数</strong><small>命格加成不占预算</small></div>
            <div className={styles.budget}>
              <div className={styles.budgetScore}><b>{usedPoints}</b><span>/ {TOTAL_POINTS}</span></div>
              <div className={styles.budgetCopy}>
                <strong>剩余 <span>{remainingPoints}</span> 点</strong>
                <p>四项可在 0 至 10 之间调整。</p>
                <div className={styles.meter} role="progressbar" aria-valuemin={0} aria-valuemax={TOTAL_POINTS} aria-valuenow={usedPoints} aria-label="已使用属性点">
                  {Array.from({ length: TOTAL_POINTS }, (_, index) => (
                    <i key={index} className={index < usedPoints ? styles.activeSegment : ''} />
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className={`${styles.section} ${styles.attributesSection}`} aria-labelledby="attribute-list-title">
            <div className={styles.sectionHeading}><strong id="attribute-list-title">四项基础属性</strong><small>数值越高，倾向越明显</small></div>
            <div className={styles.attributeList}>
            {ATTRIBUTES.map((attribute) => {
              const value = attributes[attribute.key]
              return (
                <article key={attribute.key} className={styles.attributeRow}>
                  <div className={styles.attributeCopy}>
                    <strong>{attribute.name}</strong>
                    <span>{describeAttribute(value)} · {attribute.description}</span>
                    <small>基础值 {formatSigned(value)}{attributeBonuses[attribute.key] ? ` · 命格 ${formatSigned(attributeBonuses[attribute.key])}` : ''}</small>
                  </div>
                  <div className={styles.stepper}>
                    <button type="button" onClick={() => updateAttribute(attribute.key, -1)} disabled={value <= MIN_VALUE} aria-label={`减少${attribute.name}`}>−</button>
                    <output aria-label={`${attribute.name}当前值`}>{formatSigned(value)}</output>
                    <button type="button" onClick={() => updateAttribute(attribute.key, 1)} disabled={value >= MAX_VALUE || remainingPoints <= 0} aria-label={`增加${attribute.name}`}>+</button>
                  </div>
                  <div className={styles.axis} aria-hidden="true">
                    {Array.from({ length: 15 }, (_, index) => {
                      const distance = Math.abs(index - Math.round(value / MAX_VALUE * 14))
                      return <i key={index} className={`${index === Math.round(value / MAX_VALUE * 14) ? styles.axisCurrent : ''} ${distance > 5 ? styles.axisFar : distance > 2 ? styles.axisMid : ''}`} />
                    })}
                  </div>
                </article>
              )
            })}
            </div>

            <div className={styles.tools}>
              <button type="button" onClick={() => setAttributes({ ...initialAttributes })}>重置</button>
              <button type="button" onClick={() => setAttributes({ physique: 4, mind: 4, talentAptitude: 4, charisma: 3 })}>平均分配</button>
            </div>
          </section>
        </div>
      </main>

      <BottomActionBar
        onBack={() => router.push('/talent-draw')}
        backTitle="返回命格选择"
        onConfirm={handleConfirm}
        confirmText="确认属性"
        confirmNumber="07"
        confirmDescription={remainingPoints > 0 ? `保留 ${remainingPoints} 点` : '进入命运预览'}
      />

      {showUnusedDialog ? (
        <div className={styles.dialogBackdrop} role="presentation" onClick={() => setShowUnusedDialog(false)}>
          <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="unused-points-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="unused-points-title">保留剩余点数？</h2>
            <p>未使用的 {remainingPoints} 点不会自动分配。</p>
            <div>
              <button type="button" onClick={() => setShowUnusedDialog(false)}>继续分配</button>
              <button type="button" className={styles.dialogConfirm} onClick={confirm}>确认保留</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default function AttributeAllocPage() {
  const router = useRouter()
  const storesHydrated = useCreationStoresHydrated()
  const worldConfig = useWorldStore((state) => state.worldConfig)
  const worldCode = useWorldStore((state) => state.worldCode)
  const worldInitialized = useWorldStore((state) => state.initialized)
  const characterName = useCharacterStore((state) => state.name)
  const selectedPatternCount = useCharacterStore((state) => state.destinyPatterns.patterns.length)
  const hasWorld = Boolean(worldConfig && worldCode > 0 && worldInitialized)
  const hasCharacter = Boolean(characterName.trim())
  const hasPatterns = selectedPatternCount === DESTINY_PATTERN_SELECT_COUNT

  useEffect(() => {
    if (!storesHydrated) return
    if (!hasWorld) router.replace('/new-game/world-select')
    else if (!hasCharacter) router.replace('/new-game/character-create')
    else if (!hasPatterns) router.replace('/talent-draw')
  }, [hasCharacter, hasPatterns, hasWorld, router, storesHydrated])

  if (!storesHydrated || !hasWorld || !hasCharacter || !hasPatterns) return null
  return <AttributeAllocContent />
}
