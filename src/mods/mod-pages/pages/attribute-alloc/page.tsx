'use client'

/**
 * @file attribute-alloc/page.tsx
 * @description 属性分配页面 —— 完全对齐废弃项目 attribute-alloc/desktop/AttributeAllocDesktop.tsx（含持久化，按世界编码隔离）
 * @mod mod-pages
 *
 * 参照废弃项目完整移植：
 *   - 卡片式属性列表（图标 + 名称 + 描述 + 天赋加成）
 *   - +/- 按钮控制
 *   - 剩余点数显示
 *   - 重置 / 均分 更多菜单
 *   - 确认弹窗（点数未分配完时）
 *   - BottomActionBar（← 返回 / 更多 / 确认）
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

import { configStore } from '@/core'
import { useCharacterStore } from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'
import { BottomActionBar } from '@/mods/mod-ui'

import styles from './AttributeAlloc.module.css'

// ============================================================
// 常量（对齐废弃项目 attribute-config.ts）
// ============================================================

const TOTAL_POINTS = 30
const MIN_VALUE = 0
const MAX_VALUE = 10

interface AttrDef {
  key: string
  name: string
  icon: string
  desc: string
}

const ATTR_DEFS: AttrDef[] = [
  { key: 'physique', name: '体魄', icon: '💪', desc: '体魄和力量基础' },
  { key: 'mind', name: '心智', icon: '🧠', desc: '智力和精神力基础' },
  { key: 'talentAptitude', name: '悟性', icon: '⭐', desc: '悟性，学习和理解能力' },
  { key: 'charisma', name: '魅力', icon: '💫', desc: '魅力和社交能力' },
  { key: 'resources', name: '出身', icon: '🏠', desc: '财富和资源积累' },
]

/** 持久化存储键（按世界编码隔离） */
function attrStorageKey(): string {
  const worldCode = useWorldStore.getState().worldCode
  return `attribute-alloc:${worldCode || 0}`
}

function loadAttrState(): Record<string, number> | null {
  return configStore.get<Record<string, number>>('mod-pages', attrStorageKey())
}

function persistAttrState(attrs: Record<string, number>): void {
  configStore.set('mod-pages', attrStorageKey(), attrs)
}

// ============================================================
// 组件
// ============================================================

export default function AttributeAllocPage() {
  const router = useRouter()

  const characterBase = useCharacterStore((s) => s.characterBase)
  const destinyPatterns = useCharacterStore((s) => s.destinyPatterns)
  const talents = useCharacterStore((s) => s.talents)
  const setCharacterBase = useCharacterStore((s) => s.setCharacterBase)

  // 从 store 读取当前属性值（优先使用已持久化的本地编辑）
  const [attrs, setAttrs] = useState<Record<string, number>>(() => {
    const saved = loadAttrState()
    if (saved) return saved
    const initial: Record<string, number> = {}
    for (const def of ATTR_DEFS) {
      initial[def.key] = (characterBase?.base as unknown as Record<string, number>)?.[def.key] ?? 0
    }
    return initial
  })

  // 天赋加成计算
  const talentBonus = useMemo(() => {
    const bonus: Record<string, number> = {}
    for (const def of ATTR_DEFS) {
      bonus[def.key] = 0
    }
    // 从已选命格计算加成
    if (destinyPatterns?.patterns) {
      for (const p of destinyPatterns.patterns) {
        if (p.attrBonus) {
          for (const [key, val] of Object.entries(p.attrBonus)) {
            if (bonus[key] !== undefined && typeof val === 'number') bonus[key] += val
          }
        }
      }
    }
    // 从已选天赋计算加成
    if (talents && talents.length > 0) {
      for (const t of talents) {
        if (t.attrBonus) {
          for (const [key, val] of Object.entries(t.attrBonus)) {
            if (bonus[key] !== undefined && typeof val === 'number') bonus[key] += val
          }
        }
      }
    }
    return bonus
  }, [destinyPatterns, talents])

  const usedPoints = useMemo(() => Object.values(attrs).reduce((s, v) => s + v, 0), [attrs])
  const remainingPoints = TOTAL_POINTS - usedPoints

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

  // ============================================================
  // 操作
  // ============================================================

  const handleIncrease = (key: string, e: React.MouseEvent) => {
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

  const handleDecrease = (key: string, e: React.MouseEvent) => {
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
    const reset: Record<string, number> = {}
    for (const def of ATTR_DEFS) reset[def.key] = 0
    setAttrs(reset)
    persistAttrState(reset)
  }

  const handleAverage = () => {
    const avg = Math.floor(TOTAL_POINTS / ATTR_DEFS.length)
    const remainder = TOTAL_POINTS - avg * ATTR_DEFS.length
    const distributed: Record<string, number> = {}
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
    setCharacterBase({
      base: { ...attrs } as Record<string, number> & { physique: number; mind: number; talentAptitude: number; charisma: number; resources: number },
      current: { ...attrs } as Record<string, number> & { physique: number; mind: number; talentAptitude: number; charisma: number; resources: number },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0 },
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
  const getDisplayValue = (key: string) => {
    const base = attrs[key] ?? 0
    const bonus = talentBonus[key] ?? 0
    return { base, bonus, total: base + bonus }
  }

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <>
      <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--color-bg)', padding: '24px 32px 120px' }}>
        <div className={styles.inner}>
          {/* Header */}
          <div className={styles.header}>
            <h2 className={styles.headerTitle}>属性分配</h2>
          </div>

          {/* 剩余点数 */}
          <div className={styles.stats}>
            剩余 <span className={styles.statsValue}>{remainingPoints}</span> 点
            {patternNames.length > 0 && (
              <span className={styles.statsPatterns}>
                {' '}· 命格: {patternNames.slice(0, 3).join(' · ')}
              </span>
            )}
          </div>

          {/* 属性卡片列表 */}
          <div className={styles.cardList}>
            {ATTR_DEFS.map((def) => {
              const { base, bonus, total } = getDisplayValue(def.key)
              return (
                <div key={def.key} className={styles.card}>
                  {/* 左侧：图标 + 信息 */}
                  <div className={styles.cardLeft}>
                    <span className={styles.cardIcon}>{def.icon}</span>
                    <div className={styles.cardInfo}>
                      <div className={styles.cardName}>{def.name}</div>
                      <div className={styles.cardDesc}>{def.desc}</div>
                    </div>
                    {bonus !== 0 && (
                      <span className={styles.cardBonus}>{bonus > 0 ? `+${bonus}` : bonus}</span>
                    )}
                  </div>

                  {/* 右侧：+/- 控件 */}
                  <div className={styles.controls}>
                    <button
                      type="button"
                      className={`${styles.ctrlBtn} ${base <= MIN_VALUE ? styles.ctrlBtnDisabled : ''}`}
                      onClick={(e) => handleDecrease(def.key, e)}
                      disabled={base <= MIN_VALUE}
                    >−</button>
                    <span className={`${styles.ctrlValue} ${total > 0 ? styles.ctrlValuePos : total < 0 ? styles.ctrlValueNeg : styles.ctrlValueZero}`}>
                      {total}
                    </span>
                    <button
                      type="button"
                      className={`${styles.ctrlBtn} ${remainingPoints <= 0 || base >= MAX_VALUE ? styles.ctrlBtnDisabled : ''}`}
                      onClick={(e) => handleIncrease(def.key, e)}
                      disabled={remainingPoints <= 0 || base >= MAX_VALUE}
                    >+</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <BottomActionBar
        onBack={handleBack}
        backTitle="返回命格抽取"
        onConfirm={handleConfirm}
        confirmText="确认"
        moreLabel="更多"
        moreItems={[
          { label: '🔄 重置', onClick: handleReset, title: '将所有属性重置为默认值' },
          { label: '📊 均分', onClick: handleAverage, title: '将点数平均分配给所有属性' },
        ]}
      />

      {/* 确认弹窗（点数未分配完） */}
      {showConfirm && (
        <div className={styles.confirmOverlay} onClick={() => setShowConfirm(false)}>
          <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.confirmIcon}>⚠️</div>
            <p className={styles.confirmText}>
              还有 <b>{remainingPoints}</b> 点未分配。确认跳过分配进入下一界面？
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmCancelBtn} onClick={() => setShowConfirm(false)}>
                继续分配
              </button>
              <button className={styles.confirmOkBtn} onClick={doConfirm}>
                确认进入
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
