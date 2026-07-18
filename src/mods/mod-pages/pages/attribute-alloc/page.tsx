'use client'

/**
 * @file attribute-alloc/page.tsx
 * @description 属性分配页面 —— 统一白纸创建流（含持久化，按世界编码隔离）
 * @mod mod-pages
 *
 * 四项基础属性沿用现有 0..10 与 30 点预算契约，只重构呈现层。
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { configStore } from '@/core'
import { useCharacterStore } from '@/mods/mod-character'
import type { BaseAttributes } from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'
import { BottomActionBar } from '@/mods/mod-ui'

import { useCreationStoresHydrated } from '../../hooks/useCreationStoresHydrated'
import styles from './AttributeAlloc.module.css'

// ============================================================
// 常量（对齐废弃项目 attribute-config.ts）
// ============================================================

const TOTAL_POINTS = 30
const MIN_VALUE = 0
const MAX_VALUE = 10

interface AttrDef {
  key: keyof BaseAttributes
  name: string
  mark: string
  desc: string
}

const ATTR_DEFS: AttrDef[] = [
  { key: 'physique', name: '体魄', mark: '体', desc: '影响体力、恢复与抗病能力' },
  { key: 'mind', name: '心智', mark: '心', desc: '影响学习、谋略与精神韧性' },
  { key: 'talentAptitude', name: '悟性', mark: '悟', desc: '影响理解、修炼与顿悟机会' },
  { key: 'charisma', name: '魅力', mark: '魅', desc: '影响社交、关系与说服能力' },
]

const AXIS_SEGMENTS = 15

function normalizeAttributes(source?: Partial<Record<keyof BaseAttributes, number>>): BaseAttributes {
  return {
    physique: source?.physique ?? 0,
    mind: source?.mind ?? 0,
    talentAptitude: source?.talentAptitude ?? 0,
    charisma: source?.charisma ?? 0,
  }
}

function describeAttribute(value: number): string {
  if (value === 0) return '尚未投入'
  if (value <= 3) return '稳步起步'
  if (value <= 6) return '明显擅长'
  if (value <= 8) return '天赋出众'
  return '凡俗巅峰'
}

/** 持久化存储键（按世界编码隔离） */
function attrStorageKey(): string {
  const worldCode = useWorldStore.getState().worldCode
  return `attribute-alloc:${worldCode || 0}`
}

function loadAttrState(): Partial<Record<keyof BaseAttributes, number>> | null {
  return configStore.get<Partial<Record<keyof BaseAttributes, number>>>('mod-pages', attrStorageKey())
}

function persistAttrState(attrs: BaseAttributes): void {
  configStore.set('mod-pages', attrStorageKey(), attrs)
}

// ============================================================
// 组件
// ============================================================

function AttributeAllocContent() {
  const router = useRouter()

  const characterBase = useCharacterStore((s) => s.characterBase)
  const destinyPatterns = useCharacterStore((s) => s.destinyPatterns)
  const talents = useCharacterStore((s) => s.talents)
  const setCharacterBase = useCharacterStore((s) => s.setCharacterBase)

  // 记录进入页面时的权威快照；“重置”应回到该快照，而不是把所有值静默清零。
  const [initialAttrs] = useState<BaseAttributes>(() => {
    const saved = loadAttrState()
    return normalizeAttributes(saved ?? characterBase?.base)
  })

  // 从 store 读取当前属性值（优先使用已持久化的本地编辑）
  const [attrs, setAttrs] = useState<BaseAttributes>(() => ({ ...initialAttrs }))
  const confirmDialogRef = useRef<HTMLDivElement>(null)

  // 天赋加成计算
  const talentBonus = useMemo(() => {
    const bonus = normalizeAttributes()
    // 从已选命格计算加成
    if (destinyPatterns?.patterns) {
      for (const p of destinyPatterns.patterns) {
        if (p.attrBonus) {
          for (const [key, val] of Object.entries(p.attrBonus)) {
            if (Object.hasOwn(bonus, key) && typeof val === 'number') bonus[key as keyof BaseAttributes] += val
          }
        }
      }
    }
    // 从已选天赋计算加成
    if (talents && talents.length > 0) {
      for (const t of talents) {
        if (t.attrBonus) {
          for (const [key, val] of Object.entries(t.attrBonus)) {
            if (Object.hasOwn(bonus, key) && typeof val === 'number') bonus[key as keyof BaseAttributes] += val
          }
        }
      }
    }
    return bonus
  }, [destinyPatterns, talents])

  const usedPoints = useMemo(() => ATTR_DEFS.reduce((sum, def) => sum + attrs[def.key], 0), [attrs])
  const remainingPoints = TOTAL_POINTS - usedPoints
  const meteredPoints = Math.max(0, Math.min(TOTAL_POINTS, usedPoints))

  // Tooltip
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showTooltip = useCallback((text: string, e: React.MouseEvent) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current)
    setTooltip({ text, x: e.clientX, y: e.clientY })
    tooltipTimer.current = setTimeout(() => setTooltip(null), 1500)
  }, [])

  useEffect(() => {
    return () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current) }
  }, [])

  // 确认弹窗
  const [showConfirm, setShowConfirm] = useState(false)

  useEffect(() => {
    if (!showConfirm) return
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const focusFrame = window.requestAnimationFrame(() => {
      confirmDialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setShowConfirm(false)
        return
      }
      if (event.key !== 'Tab') return
      const buttons = Array.from(
        confirmDialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [],
      )
      const first = buttons[0]
      const last = buttons.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [showConfirm])

  // ============================================================
  // 操作
  // ============================================================

  const handleIncrease = (key: keyof BaseAttributes, e: React.MouseEvent) => {
    if (remainingPoints <= 0) {
      showTooltip('点数不足', e)
      return
    }
    if (attrs[key] >= MAX_VALUE) {
      showTooltip('已达上限', e)
      return
    }
    setAttrs((prev) => {
      const next = { ...prev, [key]: prev[key] + 1 }
      persistAttrState(next)
      return next
    })
  }

  const handleDecrease = (key: keyof BaseAttributes, e: React.MouseEvent) => {
    if (attrs[key] <= MIN_VALUE) {
      showTooltip('已达下限', e)
      return
    }
    setAttrs((prev) => {
      const next = { ...prev, [key]: prev[key] - 1 }
      persistAttrState(next)
      return next
    })
  }

  const handleReset = () => {
    const reset = { ...initialAttrs }
    setAttrs(reset)
    persistAttrState(reset)
  }

  const handleAverage = () => {
    const avg = Math.floor(TOTAL_POINTS / ATTR_DEFS.length)
    const remainder = TOTAL_POINTS - avg * ATTR_DEFS.length
    const distributed = normalizeAttributes()
    ATTR_DEFS.forEach((def, i) => {
      distributed[def.key] = avg + (i < remainder ? 1 : 0)
    })
    setAttrs(distributed)
    persistAttrState(distributed)
  }

  const handleConfirm = () => {
    if (remainingPoints > 0) {
      setShowConfirm(true)
      return
    }
    doConfirm()
  }

  const doConfirm = () => {
    // 保存属性到 store
    const confirmedBase = normalizeAttributes(attrs)
    setCharacterBase({
      base: confirmedBase,
      current: { ...confirmedBase },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
    })
    // 只清除属性页编辑态；命格选取态按 worldCode 保留，保证从属性页返回时仍显示已选完成界面。
    configStore.remove('mod-pages', attrStorageKey())
    setShowConfirm(false)
    router.push('/fate-preview')
  }

  const handleBack = () => {
    router.push('/talent-draw')
  }

  // 已选命格名称
  const patternNames = useMemo(() => {
    if (!destinyPatterns?.patterns) return []
    return destinyPatterns.patterns.map((p) => p.name)
  }, [destinyPatterns])

  // 显示值 = 基础值 + 天赋加成
  const getDisplayValue = (key: keyof BaseAttributes) => {
    const base = attrs[key] ?? 0
    const bonus = talentBonus[key] ?? 0
    return { base, bonus, total: base + bonus }
  }

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <>
      <main className={styles.page}>
        <div className={styles.paper}>
          <span className={styles.spine} aria-hidden="true" />
          <header className={styles.header}>
            <div className={styles.runningHead}><span>AI LIFE SIM · 命书</span><span>07 / 08</span></div>
            <div className={styles.titleRow}>
              <div>
                <h1 className={styles.headerTitle}>分配属性</h1>
                <p className={styles.headerSubtitle}>塑造这段人生的先天起点。</p>
              </div>
              <span className={styles.titleMark} aria-hidden="true"><span>07</span></span>
            </div>
          </header>

          <section className={`${styles.section} ${styles.budgetSection}`} aria-labelledby="attribute-budget-title">
            <div className={styles.sectionHeading}>
              <strong id="attribute-budget-title">自由属性预算</strong>
              <span>命格加成不占预算</span>
            </div>
            <div className={styles.budget}>
              <div className={styles.budgetScore}>
                <div><b>{usedPoints}</b><span>/ {TOTAL_POINTS}</span></div>
              </div>
              <div className={styles.budgetCopy}>
                <strong>剩余 <span>{remainingPoints}</span> 点</strong>
                <p>四项自由属性可在 {MIN_VALUE} 至 {MAX_VALUE} 之间调整。</p>
                <div
                  className={styles.meter}
                  role="progressbar"
                  aria-label="已使用属性点"
                  aria-valuemin={0}
                  aria-valuemax={TOTAL_POINTS}
                  aria-valuenow={meteredPoints}
                  aria-valuetext={`已使用 ${usedPoints} 点，剩余 ${remainingPoints} 点`}
                >
                  {Array.from({ length: AXIS_SEGMENTS }, (_, index) => (
                    <i key={index} className={index < Math.round(meteredPoints / TOTAL_POINTS * AXIS_SEGMENTS) ? styles.segmentActive : ''} />
                  ))}
                </div>
              </div>
            </div>
            {patternNames.length > 0 && <p className={styles.patternSummary}>命格加成 · {patternNames.slice(0, 3).join(' · ')}</p>}
          </section>

          <section className={`${styles.section} ${styles.attributeSection}`} aria-labelledby="attribute-list-title">
            <div className={styles.sectionHeading}>
              <strong id="attribute-list-title">四项自由属性</strong>
              <span>数值越高，倾向越明显</span>
            </div>
            <ol className={styles.cardList}>
              {ATTR_DEFS.map((def) => {
                const { base, bonus, total } = getDisplayValue(def.key)
                const axisPosition = Math.round((base - MIN_VALUE) / (MAX_VALUE - MIN_VALUE) * (AXIS_SEGMENTS - 1))
                return (
                  <li key={def.key} className={styles.card}>
                    <span className={styles.cardIcon} aria-hidden="true">{def.mark}</span>
                    <div className={styles.cardInfo}>
                      <div className={styles.cardHeading}>
                        <strong className={styles.cardName}>{def.name}</strong>
                        <span className={styles.cardTotal}>合计 {total > 0 ? '+' : ''}{total}</span>
                      </div>
                      <span className={styles.cardDesc}>{describeAttribute(base)} · {def.desc}</span>
                      <span className={styles.cardBase}>自由属性 {base > 0 ? '+' : ''}{base}{bonus !== 0 ? ` · 命格 ${bonus > 0 ? '+' : ''}${bonus}` : ''}</span>
                    </div>
                    <div className={styles.controls}>
                      <button
                        type="button"
                        aria-label={`减少${def.name}`}
                        className={styles.ctrlBtn}
                        onClick={(event) => handleDecrease(def.key, event)}
                        disabled={base <= MIN_VALUE}
                      >−</button>
                      <b className={styles.ctrlValue}>{base > 0 ? '+' : ''}{base}</b>
                      <button
                        type="button"
                        aria-label={`增加${def.name}`}
                        className={styles.ctrlBtn}
                        onClick={(event) => handleIncrease(def.key, event)}
                        disabled={remainingPoints <= 0 || base >= MAX_VALUE}
                      >＋</button>
                    </div>
                    <div className={styles.axis} aria-hidden="true">
                      {Array.from({ length: AXIS_SEGMENTS }, (_, index) => (
                        <i
                          key={index}
                          className={`${Math.abs(index - axisPosition) > 5 ? styles.axisFar : Math.abs(index - axisPosition) > 2 ? styles.axisMid : ''} ${index === axisPosition ? styles.axisActive : ''}`}
                        />
                      ))}
                    </div>
                  </li>
                )
              })}
            </ol>
            <div className={styles.tools}>
              <button type="button" onClick={handleReset}>重置</button>
              <button type="button" onClick={handleAverage}>平均分配</button>
            </div>
          </section>
        </div>
      </main>

      <BottomActionBar
        onBack={handleBack}
        backTitle="返回命格抽取"
        onConfirm={handleConfirm}
        confirmText="确认属性"
        confirmNumber="08"
        confirmDescription={remainingPoints > 0 ? `尚余 ${remainingPoints} 点 · 下一步核对命运` : '属性已分配 · 下一步核对命运'}
        confirmTitle={remainingPoints > 0 ? `尚余 ${remainingPoints} 点，可确认后保留` : '确认属性并进入命运预览'}
      />

      {/* 确认弹窗（点数未分配完） */}
      {showConfirm && (
        <div className={styles.confirmOverlay} role="presentation" onClick={() => setShowConfirm(false)}>
          <div ref={confirmDialogRef} className={styles.confirmModal} role="dialog" aria-modal="true" aria-labelledby="unused-points-title" tabIndex={-1} onClick={(event) => event.stopPropagation()}>
            <div className={styles.confirmIcon} aria-hidden="true">未完</div>
            <h2 id="unused-points-title">仍有属性点未使用</h2>
            <p className={styles.confirmText}>
              剩余 <b>{remainingPoints}</b> 点不会自动分配。你可以继续调整，也可以保留当前配置进入命运预览。
            </p>
            <div className={styles.confirmActions}>
              <button type="button" onClick={() => setShowConfirm(false)}>
                继续分配
              </button>
              <button type="button" className={styles.confirmOkBtn} onClick={doConfirm}>
                仍然确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className={styles.tooltip}
          style={{ left: tooltip.x + 12, top: tooltip.y - 32 }}
        >
          {tooltip.text}
        </div>
      )}
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
  const hasPatterns = selectedPatternCount === 3

  useEffect(() => {
    if (!storesHydrated) return
    if (!hasWorld) router.replace('/new-game/world-select')
    else if (!hasCharacter) router.replace('/new-game/character-create')
    else if (!hasPatterns) router.replace('/talent-draw')
  }, [hasCharacter, hasPatterns, hasWorld, router, storesHydrated])

  if (!storesHydrated || !hasWorld || !hasCharacter || !hasPatterns) return null
  return <AttributeAllocContent />
}
