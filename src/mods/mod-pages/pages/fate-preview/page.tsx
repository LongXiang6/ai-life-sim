/**
 * @module fate-preview-page
 * @description 命运预览页面 —— 统一白纸创建流
 * @mod mod-pages
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

import { useRouter } from 'next/navigation'

import { useGlobalStore, configStore } from '@/core'

import { buildOrchestratorWorldSetting, orchestrator } from '@/mods/mod-engine/engine-api'
import { useCharacterStore, randomName } from '@/mods/mod-character'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'
import type { WorldInitAIStatus } from '@/mods/mod-world'
import { BottomActionBar } from '@/mods/mod-ui'

import {
  DESTINY_PATTERN_RARITY_CONFIG,
  DESTINY_PATTERN_POLARITY_CONFIG,
  DESTINY_PATTERN_SELECT_COUNT,
  TALENT_RARITY_CONFIG,
  TALENT_POLARITY_CONFIG,
  ATTRIBUTE_NAMES,
  RACE_LIFESPAN,
} from '@/mods/mod-character'
import type { LifespanState, RaceLifespanConfig } from '@/mods/mod-character'

import styles from './FatePreview.module.css'
import { resolveWorldDimensionLabels } from '../../helpers/world-dimension-labels'
import { useCreationStoresHydrated } from '../../hooks/useCreationStoresHydrated'

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

function resolvePreviewRaceInfo(race: string, lifespan: LifespanState): RaceLifespanConfig {
  const catalogRace = RACE_LIFESPAN[race]
  if (catalogRace) return catalogRace
  if (lifespan.race?.name === race) return lifespan.race

  const fallbackRace = lifespan.race ?? RACE_LIFESPAN.human!
  return {
    ...fallbackRace,
    name: race.trim() || fallbackRace.name || '未知',
    baseMaxAge: lifespan.maxAge > 0 ? lifespan.maxAge : fallbackRace.baseMaxAge,
  }
}

function hasConfirmedCharacter(
  name: string,
  race: string,
  startingAge: number,
  lifespan: LifespanState,
): boolean {
  const expectedRaceName = RACE_LIFESPAN[race]?.name ?? race.trim()
  return Boolean(
    name.trim()
    && expectedRaceName
    && lifespan.race?.name === expectedRaceName
    && Number.isFinite(lifespan.maxAge)
    && lifespan.maxAge > 0
    && Number.isFinite(lifespan.baseMaxAge)
    && lifespan.baseMaxAge > 0
    && Number.isFinite(startingAge)
    && startingAge >= 0
    && startingAge < lifespan.maxAge
  )
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

/**
 * 世界初始化步骤定义
 * 每个步骤映射到 WorldInitAIStatus 中的一个完成标志位
 */
const WORLD_INIT_STEPS = [
  {
    id: 'calibration',
    label: '维度推断与校准',
    shortLabel: '校准',
    icon: '01',
    description: 'AI 推断世界观维度与规则体系',
    doneFlag: (s: WorldInitAIStatus) => s.calibrationGenerated,
  },
  {
    id: 'tags',
    label: '标签生成',
    shortLabel: '标签',
    icon: '02',
    description: '生成力量体系/文明阶段等标签',
    doneFlag: (s: WorldInitAIStatus) => s.tagsGenerated,
  },
  {
    id: 'config',
    label: '规则配置',
    shortLabel: '参数',
    icon: '03',
    description: '整理世界规则与运行参数',
    doneFlag: (s: WorldInitAIStatus) => s.configGenerated,
  },
  {
    id: 'entities',
    label: '实体生成',
    shortLabel: '实体',
    icon: '04',
    description: '生成地理/文化/组织实体',
    doneFlag: (s: WorldInitAIStatus) => s.entitiesGenerated,
  },
] as const

function FatePreviewContent() {
  const router = useRouter()

  const name = useCharacterStore((s) => s.name)
  const gender = useCharacterStore((s) => s.gender)
  const race = useCharacterStore((s) => s.race)
  const background = useCharacterStore((s) => s.background)
  const characterBase = useCharacterStore((s) => s.characterBase)
  const destinyPatterns = useCharacterStore((s) => s.destinyPatterns)
  const equippedMythicPatterns = useCharacterStore((s) => s.equippedMythicPatterns)
  const lifespan = useCharacterStore((s) => s.lifespan)
  const talents = useCharacterStore((s) => s.talents)

  const worldConfig = useWorldStore((s) => s.worldConfig)
  const worldCode = useWorldStore((s) => s.worldCode)
  const worldInitialized = useWorldStore((s) => s.initialized)
  const worldInitAIStatus = useWorldStore((s) => s.worldInitAIStatus)
  const setGamePhase = useGlobalStore((s) => s.setGamePhase)

  const genderLabel = GENDER_LABELS[gender] ?? gender
  const startingAge = characterBase.startingAge
  const savedFp = loadFpState()
  const settingsStorySeed = useSettingsStore((s) => s.storySeed)
  const setSettingsStorySeed = useSettingsStore((s) => s.setStorySeed)
  const [storySeed, _setStorySeed] = useState(savedFp?.storySeed ?? settingsStorySeed ?? '')

  const setStorySeed = useCallback((v: string) => {
    _setStorySeed(v)
    persistFpState({ storySeed: v })
    setSettingsStorySeed(v)
  }, [setSettingsStorySeed])

  const selectedPatterns = useMemo(() => destinyPatterns.patterns ?? [], [destinyPatterns.patterns])
  const characterConfirmed = hasConfirmedCharacter(name, race, startingAge, lifespan)
  const destinyPatternsConfirmed = selectedPatterns.length === DESTINY_PATTERN_SELECT_COUNT
  const creationGateReason = !characterConfirmed
    ? '角色资料尚未确认，请返回角色创建完成确认。'
    : !destinyPatternsConfirmed
      ? `当前已确认 ${selectedPatterns.length} 条命格；开始人生前必须恰好确认 ${DESTINY_PATTERN_SELECT_COUNT} 条。`
      : null
  const localWorldReady = worldInitialized && !!worldConfig && worldCode > 0
  const initStepsComplete = Boolean(
    worldInitAIStatus
    && WORLD_INIT_STEPS.every((step) => step.doneFlag(worldInitAIStatus)),
  )
  const aiComplete = localWorldReady
    && worldInitAIStatus?.status === 'complete'
    && initStepsComplete
  const aiIsRunning = worldInitAIStatus?.status === 'running'
  const aiFailed = worldInitAIStatus?.status === 'failed'
  const aiProgress = worldInitAIStatus
    ? WORLD_INIT_STEPS.filter((step) => step.doneFlag(worldInitAIStatus)).length
    : 0
  const aiStepLabel = worldInitAIStatus?.currentStep

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

  const raceInfo = useMemo(() => resolvePreviewRaceInfo(race, lifespan), [race, lifespan])

  /** 开始人生 */
  const handleStartLife = useCallback(() => {
    if (!characterConfirmed || !destinyPatternsConfirmed || !aiComplete) return
    if (!worldConfig) return

    const displayName = resolveDisplayName(name, gender)
    if (displayName !== name.trim()) {
      useCharacterStore.getState().setName(displayName)
    }
    const eraStartYear = useWorldStore.getState().eraStartYear
    const worldSetting = buildOrchestratorWorldSetting(worldConfig, { eraStartYear: eraStartYear || undefined })

    const confirmedBase = { ...characterBase.base }
    useCharacterStore.getState().setCharacterBase({
      base: confirmedBase,
      current: { ...confirmedBase },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
      contextModifiers: {},
    })

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
        characterId: useCharacterStore.getState().ensureCharacterId(),
        name: displayName,
        age: startingAge,
        gender,
        background: useCharacterStore.getState().background || `${displayName}，来自${worldConfig?.name ?? '未知世界'}的穿越者`,
        attributes: confirmedBase as unknown as Record<string, unknown>,
        destinyPatterns: patternSummaries,
      },
    )

    // 首轮叙事会从 character-base 子系统派生年龄；经编排器提交总线同步同一个创建结果，避免首轮回写旧年龄。
    orchestrator.applyRoundChanges([
      {
        id: 'character-base',
        description: '角色创建完成，以玩家确认的基础属性和起始年龄进入叙事',
        changes: { startingAge, base: confirmedBase },
      },
      {
        id: 'destiny-pattern',
        description: '角色创建完成，写入玩家确认的命格',
        changes: { patterns: selectedPatterns },
      },
      {
        id: 'lifespan',
        description: '角色创建完成，写入玩家确认的种族与寿命',
        changes: {
          raceId: race,
          worldName: worldConfig?.name ?? '',
          maxAge: lifespan.maxAge,
        },
      },
    ], 'manual')

    // 角色创建写入的 startingAge 是开局年龄单一来源；这里只同步当前年龄，不重新推导或覆盖。
    useCharacterStore.setState({ age: startingAge })
    setSettingsStorySeed(storySeed)

    setGamePhase('simulation')
    router.push('/game-story')
  }, [aiComplete, characterBase.base, characterConfirmed, destinyPatternsConfirmed, name, gender, race, startingAge, lifespan.maxAge, worldConfig, setGamePhase, router, selectedPatterns, setSettingsStorySeed, storySeed])

  const attrKeys = ['physique', 'mind', 'talentAptitude', 'charisma'] as const

  const worldDimensionLabels = worldConfig ? resolveWorldDimensionLabels(worldConfig) : null

  // ── 步骤计时器（时间戳由 Pipeline 直接写入 store，UI 只读 + 每秒刷新展示）──
  const [now, setNow] = useState(() => Date.now())

  // 每秒 tick 以刷新计时显示
  useEffect(() => {
    if (!worldInitAIStatus) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [worldInitAIStatus])

  /** 计算单步显示的秒数（实时更新的步骤返回当前耗时；已完成返回结束时耗时；未开始返回 null） */
  const getStepSeconds = (stepLabel: string): number | null => {
    const timer = worldInitAIStatus?.stepTimers?.[stepLabel]
    if (!timer) return null
    const end = timer.end ?? now
    return Math.max(0, Math.floor((end - timer.start) / 1000))
  }

  return (
    <>
      <main className={styles.page}>
        <div className={styles.paper}>
          <span className={styles.spine} aria-hidden="true" />
          <header className={styles.header}>
            <div className={styles.runningHead}><span>AI LIFE SIM · 命书</span><span>08 / 08</span></div>
            <div className={styles.titleRow}>
              <div>
                <h1 className={styles.headerTitle}>核对命书</h1>
                <p className={styles.headerSubtitle}>确认所有起点，然后开启人生。</p>
              </div>
              <span className={styles.titleMark} aria-hidden="true"><span>07</span></span>
            </div>
          </header>

          <section className={`${styles.section} ${styles.worldSection}`} aria-labelledby="world-character-title">
            <div className={styles.sectionHeading}>
              <strong id="world-character-title">世界与角色</strong>
              <span>最终核对</span>
            </div>
            <div className={styles.reviewWorld}>
              <span className={styles.worldSource}>{worldConfig ? '已确认世界 · 描述原文' : '世界资料待确认'}</span>
              <h2>{worldConfig?.name ?? '尚未建立世界'}</h2>
              <p>{worldConfig?.description || '返回创建流程完成世界选择与规则确认。'}</p>
              <div className={styles.reviewIdentity}>
                <strong>{name || '未命名'} · {genderLabel || '未设定'} · {raceInfo.name}</strong>
                <span className={styles.startingAge}><span>起始年龄：</span><span>{startingAge} 岁</span></span>
              </div>
            </div>
            <div className={styles.stats}>
              <div><b>{lifespan.maxAge > 0 ? lifespan.maxAge : raceInfo.baseMaxAge} 年</b><span>预期寿命</span></div>
              <div><b>{worldDimensionLabels?.powerSystem ?? '待确认'}</b><span>力量体系</span></div>
              <div><b>{worldDimensionLabels?.spatialForm ?? '待确认'}</b><span>世界空间</span></div>
            </div>
            {background && <p className={styles.backgroundExcerpt}><b>人生背景</b>{background}</p>}
          </section>

          <section className={`${styles.section} ${styles.attributesSection}`} aria-labelledby="attributes-patterns-title">
            <div className={styles.sectionHeading}>
              <strong id="attributes-patterns-title">属性与命格</strong>
              <span>四项属性 · {selectedPatterns.length} 条命格</span>
            </div>
            <div className={styles.attrGrid}>
              {attrKeys.map((key) => {
                const bonus = attrBonuses[key] ?? 0
                const value = (characterBase.base[key] ?? 0) + bonus
                return (
                  <div key={key} className={styles.attrItem}>
                    <span>{ATTRIBUTE_NAMES[key]}</span>
                    <b className={`${styles.attrValue} ${value > 0 ? styles.attrValuePos : value < 0 ? styles.attrValueNeg : styles.attrValueZero}`}>
                      {value > 0 ? '+' : ''}{value}
                    </b>
                  </div>
                )
              })}
            </div>
            <div className={styles.talentRow}>
              {selectedPatterns.length > 0 ? selectedPatterns.map((pattern) => {
                const rarity = DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity]
                const polarity = DESTINY_PATTERN_POLARITY_CONFIG[pattern.polarity]
                return (
                  <div key={pattern.id} className={styles.patternRow}>
                    <div className={styles.patternHeading}>
                      <strong>{pattern.name}</strong>
                      <small>{rarity.label}{polarity ? ` · ${polarity.label}` : ''}</small>
                    </div>
                    <span>{pattern.description}</span>
                  </div>
                )
              }) : <p className={styles.emptyText}>尚未确认命格。</p>}
            </div>
            <div className={styles.mythicSlot} aria-label="本局转世天赋">
              <div>
                <small>转世天赋 · 最多 2 项</small>
                {equippedMythicPatterns.length > 0
                  ? equippedMythicPatterns.map((pattern) => <strong key={pattern.id}>{pattern.name}</strong>)
                  : <strong>本局不携带</strong>}
              </div>
              <div>
                {equippedMythicPatterns.length > 0
                  ? equippedMythicPatterns.map((pattern) => <p key={pattern.id}>{pattern.concept}：{pattern.effect}</p>)
                  : <p>不占三个普通命格；可返回命格选择页从跨局总库装备。</p>}
              </div>
            </div>
            {talents.length > 0 && (
              <div className={styles.talentPills} aria-label="角色天赋">
                {talents.map((talent) => {
                  const rarity = TALENT_RARITY_CONFIG[talent.rarity]
                  const polarity = TALENT_POLARITY_CONFIG[talent.polarity]
                  return <span key={talent.id} className={styles.talentPill}>{talent.name}<small>{rarity.label}{polarity ? ` · ${polarity.label}` : ''}</small></span>
                })}
              </div>
            )}
          </section>

          <section className={`${styles.section} ${styles.seedSection}`} aria-labelledby="seed-title">
            <div className={styles.sectionHeading}>
              <strong id="seed-title">模拟种子</strong>
              <span>留空则每次随机</span>
            </div>
            <div className={styles.seedRow}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                value={storySeed}
                onChange={(event) => setStorySeed(event.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="最多 8 位数字"
                className={styles.seedInput}
                aria-label="自定义模拟种子"
              />
              <button type="button" onClick={() => setStorySeed(String(Math.floor(Math.random() * 100000000)))} className={styles.seedBtn}>随机</button>
            </div>
            <p className={styles.seedHint}>相同种子与相同操作会得到相近的剧情走向。</p>
          </section>

          <section className={`${styles.section} ${styles.initSection}`} aria-labelledby="world-init-title">
            <div className={styles.sectionHeading}>
              <strong id="world-init-title">世界初始化</strong>
              <span aria-live="polite">{aiProgress} / 4 完成</span>
            </div>
            {creationGateReason && <p className={styles.gateNotice} role="alert">{creationGateReason}</p>}
            <div className={styles.initStepList}>
              {WORLD_INIT_STEPS.map((step) => {
                const done = worldInitAIStatus ? step.doneFlag(worldInitAIStatus) : false
                const isCurrent = !done && aiIsRunning && aiStepLabel === step.label
                const failed = aiFailed && !done && aiStepLabel === step.label
                const seconds = getStepSeconds(step.label)
                return (
                  <div
                    key={step.id}
                    className={`${styles.initStepRow} ${done ? styles.initStepDone : ''} ${isCurrent ? styles.initStepCurrent : ''} ${failed ? styles.initStepFailed : ''}`}
                    title={step.description}
                  >
                    <i className={styles.initStepIcon}>{failed ? '×' : done ? '✓' : isCurrent ? <span className={styles.loading149} /> : step.icon}</i>
                    <strong className={styles.initStepLabel}>{step.shortLabel}</strong>
                    <span className={styles.initStepTimer}>{done ? `${seconds ?? 0}s` : seconds !== null ? `${seconds}s` : isCurrent ? '调用中' : '等待'}</span>
                  </div>
                )
              })}
            </div>
            <p className={styles.initCaption}>
              {aiComplete ? '世界初始化完成，可以开启这段人生。' : aiFailed ? '初始化出现错误，请检查下方信息。' : aiIsRunning ? '四项任务正在执行，完成后统一解锁开局。' : '等待世界初始化任务开始。'}
            </p>
            {aiFailed && worldInitAIStatus?.errors?.length ? (
              <div className={styles.initPanelErrors}>
                {worldInitAIStatus.errors.map((error, index) => <p key={`${index}-${error}`} className={styles.initPanelErrorItem}>{error}</p>)}
              </div>
            ) : null}
          </section>
        </div>
      </main>

      <BottomActionBar
        onBack={() => router.push(!characterConfirmed ? '/new-game/character-create' : '/attribute-alloc')}
        backTitle={!characterConfirmed ? '返回确认角色' : '返回确认属性'}
        onConfirm={handleStartLife}
        confirmText={creationGateReason ? '创建信息未完成' : aiComplete ? '开始人生' : aiFailed ? '初始化失败' : (aiIsRunning ? '请等待…' : '等待世界初始化')}
        confirmNumber="完成"
        confirmDescription={creationGateReason ?? (aiComplete ? '所有起点已确认 · 开启人生' : aiFailed ? '请返回世界配置重新确认' : aiIsRunning ? `世界初始化 ${aiProgress} / 4` : '等待世界初始化完成')}
        confirmDisabled={Boolean(creationGateReason) || !aiComplete}
        confirmTitle={creationGateReason ?? (!aiComplete ? aiFailed ? '世界初始化失败，请返回世界配置重新确认' : '等待世界初始化完成' : '开始人生')}
      />
    </>
  )
}

export default function FatePreviewPage() {
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
  return <FatePreviewContent />
}
