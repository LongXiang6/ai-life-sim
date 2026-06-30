/**
 * @module fate-preview-page
 * @description 命运总览页面 —— 对齐废弃项目 FatePreviewDesktop UI 风格
 * @mod mod-pages
 */

'use client'

import { useCallback, useMemo, useState } from 'react'

import { useRouter } from 'next/navigation'

import { useGlobalStore, configStore } from '@/core'

import { buildOrchestratorWorldSetting, orchestrator } from '@/mods/mod-engine/engine-api'
import { useCharacterStore, randomName } from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'
import { BottomActionBar, PageScroll } from '@/mods/mod-ui'

import {
  DESTINY_PATTERN_RARITY_CONFIG,
  DESTINY_PATTERN_POLARITY_CONFIG,
  TALENT_RARITY_CONFIG,
  TALENT_POLARITY_CONFIG,
  ATTRIBUTE_NAMES,
  RACE_LIFESPAN,
} from '@/mods/mod-character'

import styles from './FatePreview.module.css'

const GENDER_LABELS: Record<string, string> = {
  male: '男',
  female: '女',
}

function resolveRandomNameGender(gender: string): string | undefined {
  if (gender === 'male') return '男'
  if (gender === 'female') return '女'
  return undefined
}

function resolveDisplayName(rawName: string, gender: string): string {
  const trimmed = rawName.trim()
  if (trimmed && trimmed !== 'AI命名') return trimmed
  return randomName(resolveRandomNameGender(gender))
}

/** 持久化存储键（按世界编码隔离） */
function fpStorageKey(): string {
  const worldCode = useWorldStore.getState().worldCode
  return `fate-preview:${worldCode || 0}`
}

interface SavedFpState {
  storySeed: string
}

function loadFpState(): SavedFpState | null {
  return configStore.get<SavedFpState>('mod-pages', fpStorageKey())
}

function persistFpState(state: SavedFpState): void {
  configStore.set('mod-pages', fpStorageKey(), state)
}

export default function FatePreviewPage() {
  const router = useRouter()

  const name = useCharacterStore((s) => s.name)
  const gender = useCharacterStore((s) => s.gender)
  const race = useCharacterStore((s) => s.race)
  const background = useCharacterStore((s) => s.background)
  const characterBase = useCharacterStore((s) => s.characterBase)
  const destinyPatterns = useCharacterStore((s) => s.destinyPatterns)
  const lifespan = useCharacterStore((s) => s.lifespan)
  const talents = useCharacterStore((s) => s.talents)

  const worldConfig = useWorldStore((s) => s.worldConfig)
  const worldInitAIStatus = useWorldStore((s) => s.worldInitAIStatus)
  const setGamePhase = useGlobalStore((s) => s.setGamePhase)

  const genderLabel = GENDER_LABELS[gender] ?? gender
  const savedFp = loadFpState()
  const [storySeed, _setStorySeed] = useState(savedFp?.storySeed ?? '')

  const setStorySeed = useCallback((v: string) => {
    _setStorySeed(v)
    persistFpState({ storySeed: v })
  }, [])

  const selectedPatterns = useMemo(() => destinyPatterns.patterns ?? [], [destinyPatterns.patterns])

  /** 属性加成汇总 */
  const attrBonuses = useMemo(() => {
    const bonuses: Record<string, number> = {}
    for (const p of selectedPatterns) {
      if (p.attrBonus) {
        for (const [key, value] of Object.entries(p.attrBonus)) {
          if (typeof value === 'number') bonuses[key] = (bonuses[key] ?? 0) + value
        }
      }
    }
    for (const t of talents) {
      for (const [key, value] of Object.entries(t.attrBonus)) {
        if (typeof value === 'number') bonuses[key] = (bonuses[key] ?? 0) + value
      }
    }
    return bonuses
  }, [selectedPatterns, talents])

  const raceInfo = useMemo(() =>
    RACE_LIFESPAN[race] ?? { name: '未知', baseMaxAge: 100, decayMultiplier: 1.0 },
  [race])

  /** 开始人生 */
  const handleStartLife = useCallback(() => {
    const displayName = resolveDisplayName(name, gender)
    if (displayName !== name.trim()) {
      useCharacterStore.getState().setName(displayName)
    }
    const eraStartYear = useWorldStore.getState().eraStartYear
    const worldSetting = worldConfig
      ? buildOrchestratorWorldSetting(worldConfig, { eraStartYear: eraStartYear || undefined })
      : { name: '', description: '', era: '', config: {} }

    const patternSummaries = selectedPatterns.map((p) => ({
      name: p.name,
      description: p.description,
      effect: p.effect,
      rarity: p.rarity,
      polarity: p.polarity,
    }))

    orchestrator.setContext(
      worldSetting,
      {
        name: displayName,
        age: 0,
        gender,
        background: useCharacterStore.getState().background || `${displayName}，来自${worldConfig?.name ?? '未知世界'}的穿越者`,
        attributes: characterBase.base as unknown as Record<string, unknown>,
        destinyPatterns: patternSummaries,
      },
    )

    setGamePhase('simulation')
    router.push('/game-story')
  }, [name, gender, characterBase.base, worldConfig, setGamePhase, router, selectedPatterns])

  // 图标映射
  const attrIcons: Record<string, string> = {
    physique: '💪', mind: '🧠', talentAptitude: '💡', charisma: '🎭', resources: '💰',
  }

  const attrKeys = ['physique', 'mind', 'talentAptitude', 'charisma', 'resources'] as const

  const aiComplete = worldInitAIStatus?.status === 'complete'
  const aiIsRunning = worldInitAIStatus?.status === 'running'
  const aiFailed = worldInitAIStatus?.status === 'failed'
  const aiProgress = worldInitAIStatus
    ? [worldInitAIStatus.calibrationGenerated, worldInitAIStatus.tagsGenerated,
       worldInitAIStatus.configGenerated, worldInitAIStatus.timelineGenerated,
       worldInitAIStatus.entitiesGenerated]
      .filter(Boolean).length
    : 0
  const aiStepLabel = worldInitAIStatus?.currentStep
  const showAIStatus = worldInitAIStatus && !aiComplete

  return (
    <>
      <PageScroll>
      <div className={styles.container}>
        <h2 className={styles.headerTitle}>🎘 身世总览</h2>

        <div className={styles.mainCard}>
          {/* 角色头部 */}
          <div className={styles.charHeader}>
            <div className={styles.charIcon}>👤</div>
            <div className={styles.charName}>{name || '未命名'}</div>
            <div className={styles.charMeta}>
              {genderLabel} · {raceInfo.name} · {worldConfig?.name ?? '未知世界'}
            </div>
          </div>

          {/* 基本信息 */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>📋 基本信息</h4>
            <div className={styles.infoGrid}>
              <span className={styles.infoLabel}>姓名：</span>
              <span className={styles.infoValue}>{name || '未命名'}</span>
              <span className={styles.infoLabel}>性别：</span>
              <span className={styles.infoValue}>{genderLabel}</span>
              <span className={styles.infoLabel}>种族：</span>
              <span className={styles.infoValue}>{raceInfo.name}</span>
              <span className={styles.infoLabel}>世界：</span>
              <span className={styles.infoValue}>{worldConfig?.name ?? '未知世界'}</span>
            </div>
          </div>

          {/* 属性 */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>📊 属性（含命格加成）</h4>
            <div className={styles.attrGrid}>
              {attrKeys.map((k) => {
                const base = (characterBase.base as unknown as Record<string, number>)[k] ?? 0
                const bonus = attrBonuses[k] ?? 0
                const v = base + bonus
                return (
                  <div key={k} className={styles.attrItem}>
                    <span>{attrIcons[k]} {ATTRIBUTE_NAMES[k]}</span>
                    <span className={`${styles.attrValue} ${v > 0 ? styles.attrValuePos : v < 0 ? styles.attrValueNeg : styles.attrValueZero}`}>
                      {v > 0 ? '+' : ''}{v}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 命格标签 */}
          {selectedPatterns.length > 0 && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>🌟 命格 ({selectedPatterns.length})</h4>
              <div className={styles.talentRow}>
                {selectedPatterns.map((t) => {
                  const rc = DESTINY_PATTERN_RARITY_CONFIG[t.rarity]
                  const pc = DESTINY_PATTERN_POLARITY_CONFIG[t.polarity]
                  return (
                    <span key={t.id} className={styles.talentPill} style={{ background: `${rc.color}20`, color: rc.color }}>
                      {t.name}
                      {pc && <span style={{ marginLeft: 4, fontSize: 10, color: pc.color }}>{pc.label}</span>}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* 天赋标签 */}
          {talents.length > 0 && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>✨ 天赋 ({talents.length})</h4>
              <div className={styles.talentRow}>
                {talents.map((t) => {
                  const rc = TALENT_RARITY_CONFIG[t.rarity]
                  const pc = TALENT_POLARITY_CONFIG[t.polarity]
                  return (
                    <span key={t.id} className={styles.talentPill} style={{ background: `${rc.color}20`, color: rc.color }}>
                      {t.name}
                      {pc && <span style={{ marginLeft: 4, fontSize: 10, color: pc.color }}>{pc.label}</span>}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {/* 模拟种子 */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>🎲 模拟种子</h4>
            <div className={styles.seedBox}>
              <div className={styles.seedRow}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  value={storySeed}
                  onChange={(e) => setStorySeed(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="留空则随机生成（最多 8 位数字）"
                  className={styles.seedInput}
                />
                <button type="button" onClick={() => setStorySeed(String(Math.floor(Math.random() * 100000000)))} className={styles.seedBtn}>
                  🎲 随机
                </button>
              </div>
              <div className={styles.seedHint}>
                决定本存档剧情模拟的随机性。相同种子 + 相同操作可获得相近的剧情走向。留空则每次随机。
              </div>
            </div>
          </div>

          {/* 背景信息 */}
          {background && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>🏁 背景信息</h4>
              <div className={styles.bgBox}>{background}</div>
            </div>
          )}

          {/* 寿命信息 */}
          <div className={styles.section}>
            <h4 className={styles.sectionTitle}>🕐 寿命信息</h4>
            <div className={styles.lifespanInfo}>
              <span>{raceInfo.name} · 基础寿命 {raceInfo.baseMaxAge} 年</span>
              {lifespan.maxAge > 0 && <span> · 当前最大寿命 {lifespan.maxAge} 年</span>}
              {raceInfo.decayMultiplier > 0 && <span> · 衰减 {raceInfo.decayMultiplier}x</span>}
            </div>
          </div>
        </div>
      </div>

      {/* AI 世界初始化状态指示器 */}
      {showAIStatus && (
        <div className={styles.aiStatusBanner}>
          {aiIsRunning && (
            <span className={styles.aiStatusRunning}>
              ⏳ {aiStepLabel ? `${aiStepLabel}…` : '正在生成世界数据…'}（{aiProgress}/5）
            </span>
          )}
          {aiFailed && (
            <div className={styles.aiStatusFailed}>
              <span>⚠️ 世界生成失败（{aiProgress}/5 成功）</span>
              {worldInitAIStatus?.errors?.map((e, i) => (
                <span key={i} className={styles.aiStatusError}>{e}</span>
              ))}
            </div>
          )}
          {!aiIsRunning && !aiFailed && (
            <span className={styles.aiStatusIdle}>
              📡 等待世界数据初始化...
            </span>
          )}
        </div>
      )}

      </PageScroll>

      <BottomActionBar
        onBack={() => router.push('/attribute-alloc')}
        backTitle="返回重新分配属性"
        onConfirm={handleStartLife}
        confirmText={aiComplete ? '开始人生' : (aiIsRunning ? `正在生成世界数据（${aiProgress}/5）` : '等待世界初始化')}
        confirmDisabled={!aiComplete}
      />
    </>
  )
}
