'use client'

/**
 * @module game-page
 * @description 游戏模拟页 —— 对齐废弃项目：顶栏信息+控制，下方叙事区，隐藏式推进
 * @mod mod-pages
 */

import { useEffect, useMemo, useRef, useState, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'

import { useRouter } from 'next/navigation'
import { clamp } from '@/core/shared'

import { useEngine, useNarrative, useSimulationAdvance, usePreGenQueueStatus } from '@/mods/mod-engine'
import { collectGameSavePayload, formatNarrativeTimeLabel } from '@/mods/mod-engine/engine-api'
import { orchestrator } from '@/mods/mod-engine/engine-api'
import { useEngineStore } from '@/mods/mod-engine'
import { encodeTimeStepKey, decodeTimeStepKey, AVAILABLE_TIME_STEPS } from '@/foundation/constants/time-steps'
import {
  useCharacterStore,
  ATTRIBUTE_NAMES,
  ATTRIBUTE_ICONS,
  ATTR_KEYS,
  RACE_LIFESPAN,
  DESTINY_PATTERN_RARITY_CONFIG,
} from '@/mods/mod-character'
import { resolveDestinyPatternWorldTags } from '@/mods/mod-character/destiny-pattern-access'
import { useWorldStore } from '@/mods/mod-world'
import { usePowerSystemStore } from '@/mods/mod-power-system'
import { useEconomyStore } from '@/mods/mod-economy'
import { usePoliticsStore } from '@/mods/mod-politics'
import { useHistoryDynamicsStore } from '@/mods/mod-history-dynamics'
import { STRATUM_LABELS_DEFAULT } from '@/mods/mod-politics'
import {
  NarrativeTimeline,
  type NarrativeEntry,
  ToastContainer,
  useToastStore,
  SaveDialog,
  MAX_WIDTH,
  NPCRelationshipPanel,
} from '@/mods/mod-ui'

import styles from './GameStory.module.css'

const GENDER_LABELS: Record<string, string> = { male: '男', female: '女' }

import { saveManager } from '@/core/storage/save-manager'
import { cn } from '@/foundation/utils'
import { formatEraYear } from '@/foundation/utils/format-time'

import { useSimulationBranch } from './useSimulationBranch'

type MoreSelectedKey = 'branch' | 'save' | 'settle' | 'main' | 'relation' | null

interface TagSection {
  name: string
  tags: { key: string; value: string }[]
}

function parseWorldTagsToSections(text: string): TagSection[] {
  const sections: TagSection[] = []
  const lines = text.split('\n')
  let currentSection: TagSection | null = null

  for (const line of lines) {
    const sectionMatch = /^【(.+)】/.exec(line.trim())
    if (sectionMatch) {
      if (currentSection && currentSection.tags.length > 0) sections.push(currentSection)
      currentSection = { name: sectionMatch[1], tags: [] }
      continue
    }
    if (currentSection) {
      const pairs = line.trim().split('|')
      for (const pair of pairs) {
        const kv = pair.split('：')
        if (kv.length >= 2) {
          const key = kv[0].trim()
          const value = kv.slice(1).join('：').trim()
          if (key && value) currentSection.tags.push({ key, value })
        }
      }
    }
  }
  if (currentSection && currentSection.tags.length > 0) sections.push(currentSection)
  return sections
}

function AutoSaveIndicator({ lastAutoSaveRound }: { lastAutoSaveRound: number }) {
  const hasAutoSave = lastAutoSaveRound > 0

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--color-text-tertiary)]">
      <span className="flex items-center gap-1">
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${hasAutoSave ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-tertiary)]'}`} />
        实时保存
      </span>
      {hasAutoSave
        ? <span>已保存至第 {lastAutoSaveRound} 轮</span>
        : <span>未保存</span>}
    </div>
  )
}

export default function GamePage() {
  const router = useRouter()
  const { status, round, totalRounds, lastAutoSaveRound, seasonName, stop } = useEngine()
  const { advanceRound, isAdvancing } = useSimulationAdvance()

  const {
    hasUnresolvedBranch,
    unresolvedBranchIndex,
    branchTitle,
    branchOptions,
    forceBranchNext,
    handleForceBranch,
    handleBranchConfirm,
    handleBranchCancel,
    branchCustomText,
    setBranchCustomText,
    selectedBranchOptionId,
    setSelectedBranchOptionId,
  } = useSimulationBranch({ advanceRound })

  const { narrativeHistory } = useNarrative()
  const preGenStatus = usePreGenQueueStatus()
  const causalPending = useHistoryDynamicsStore((s) => s.causalSimulation.queue.pending)
  const streamingNarrative = useEngineStore((s) => s.streamingNarrative)
  const timeStep = useEngineStore((s) => s.timeStep)
  const activeTimeStepKey = encodeTimeStepKey(timeStep)
  const handleTimeStepChange = useCallback((key: string) => {
    orchestrator.setTimeStep(decodeTimeStepKey(key))
  }, [])
  const timeStepOptions = useMemo(
    () => AVAILABLE_TIME_STEPS.map((s) => ({
      label: s.label,
      value: encodeTimeStepKey(s),
      icon: s.icon,
      experimental: s.experimental,
    })),
    [],
  )
  const health = useCharacterStore((s) => s.health)
  const characterName = useCharacterStore((s) => s.name)
  const characterAge = useCharacterStore((s) => s.age)
  const gender = useCharacterStore((s) => s.gender)
  const race = useCharacterStore((s) => s.race)
  const characterBase = useCharacterStore((s) => s.characterBase)
  const destinyPatterns = useCharacterStore((s) => s.destinyPatterns.patterns)
  const talents = useCharacterStore((s) => s.talents)
  const worldConfig = useWorldStore((s) => s.worldConfig)
  const worldCode = useWorldStore((s) => s.worldCode)
  const worldTags = useWorldStore((s) => s.worldTags)
  const eraStartYear = useWorldStore((s) => s.eraStartYear)
  const worldEraName = useWorldStore((s) => s.eraName)
  const economy = useEconomyStore((s) => s.economy)
  const settlement = useEconomyStore((s) => s.settlement)
  const work = useEconomyStore((s) => s.work)
  const item = useEconomyStore((s) => s.item)
  const population = useEconomyStore((s) => s.population)
  const playerWealth = economy.currency.playerWealth
  const socialStratification = usePoliticsStore((s) => s.socialStratification)
  const faction = usePoliticsStore((s) => s.faction)
  const nationRelation = usePoliticsStore((s) => s.nationRelation)
  const legal = usePoliticsStore((s) => s.legal)
  const conflictCycle = usePoliticsStore((s) => s.conflictCycle)
  const playerStratum = socialStratification.playerStratum
  const stratumLabels = socialStratification.stratumLabels
  const combatPowerState = usePowerSystemStore((s) => s.combatPower)
  const cultivation = usePowerSystemStore((s) => s.cultivation)
  const luck = usePowerSystemStore((s) => s.luck)
  const fortuneEncounter = usePowerSystemStore((s) => s.fortuneEncounter)
  const faith = usePowerSystemStore((s) => s.faith)
  const supremeItem = usePowerSystemStore((s) => s.supremeItem)
  const skills = usePowerSystemStore((s) => s.skills)
  const materials = usePowerSystemStore((s) => s.materials)
  const anomalyZones = usePowerSystemStore((s) => s.anomalyZones)
  const combatPower = combatPowerState.powerValue

  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const [moreSelected, setMoreSelected] = useState<MoreSelectedKey>(null)
  const [causalToast, setCausalToast] = useState<string | null>(null)
  const prevCausalLenRef = useRef(0)
  const [showWorldPanel, setShowWorldPanel] = useState(false)
  const [showRelationshipPanel, setShowRelationshipPanel] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [timeStepOpen, setTimeStepOpen] = useState(false)
  const timeStepBtnRef = useRef<HTMLDivElement>(null)
  const moreBtnRef = useRef<HTMLDivElement>(null)
  const [timeStepMenuRect, setTimeStepMenuRect] = useState<DOMRect | null>(null)
  const [moreMenuRect, setMoreMenuRect] = useState<DOMRect | null>(null)
  const narrativeEndRef = useRef<HTMLDivElement>(null)
  const prevEventsLenRef = useRef(0)
  const toasts = useToastStore((s) => s.toasts)
  const dismissToast = useToastStore((s) => s.dismissToast)

  // 自动滚动到最新叙事（对齐废弃项目）
  useEffect(() => {
    const container = narrativeEndRef.current
    if (!container) return
    if (narrativeHistory.length > prevEventsLenRef.current) {
      const newEventIdx = narrativeHistory.length - 1
      const separatorEl = container.querySelector(`[data-separator-for="${newEventIdx}"]`)
      const headerEl = container.querySelector('[data-narrative-header]')
      const headerHeight = headerEl ? (headerEl as HTMLElement).offsetHeight + 12 : 48
      if (separatorEl) {
        const targetScroll = separatorEl.getBoundingClientRect().top
          - container.getBoundingClientRect().top
          + container.scrollTop
          - headerHeight
          - 8
        container.scrollTo({ top: clamp(targetScroll, 0, Infinity), behavior: 'smooth' })
      } else {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
      }
    }
    prevEventsLenRef.current = narrativeHistory.length
  }, [narrativeHistory.length, streamingNarrative])

  useLayoutEffect(() => {
    if (timeStepOpen) {
      const rect = timeStepBtnRef.current?.getBoundingClientRect()
      setTimeStepMenuRect(rect ?? null)
    }
    if (moreMenuOpen) {
      const rect = moreBtnRef.current?.getBoundingClientRect()
      setMoreMenuRect(rect ?? null)
    }
  }, [timeStepOpen, moreMenuOpen])

  // 因果触发：pending 队列新增事件时显示 Toast
  useEffect(() => {
    const nowLength = causalPending.length
    if (nowLength > prevCausalLenRef.current) {
      const latest = causalPending[nowLength - 1]
      if (latest?.captureDescription) {
        const timer = window.setTimeout(() => {
          setCausalToast(`📜 因果回响：${latest.captureDescription}`)
          window.setTimeout(() => setCausalToast(null), 5000)
        }, 0)
        prevCausalLenRef.current = nowLength
        return () => window.clearTimeout(timer)
      }
    }
    prevCausalLenRef.current = nowLength
  }, [causalPending])

  // 点击外部关闭时间步进 / 更多菜单
  useEffect(() => {
    if (!timeStepOpen && !moreMenuOpen) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (timeStepOpen && timeStepBtnRef.current && !timeStepBtnRef.current.contains(target)) {
        setTimeStepOpen(false)
      }
      if (moreMenuOpen && moreBtnRef.current && !moreBtnRef.current.contains(target)) {
        setMoreMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [timeStepOpen, moreMenuOpen])

  const isComplete = status === 'complete'
  const isDead = health.isDead

  const genderLabel = GENDER_LABELS[gender] ?? gender
  const raceInfo = RACE_LIFESPAN[race] ?? { name: race, baseMaxAge: 100, decayMultiplier: 1 }

  const patternBonus = useMemo(() => {
    const bonus: Record<string, number> = {}
    for (const k of ATTR_KEYS) bonus[k] = 0
    for (const p of destinyPatterns ?? []) {
      if (!p.attrBonus) continue
      for (const [key, val] of Object.entries(p.attrBonus)) {
        if (typeof val === 'number' && key in bonus) bonus[key] += val
      }
    }
    for (const t of talents) {
      for (const [key, val] of Object.entries(t.attrBonus)) {
        if (typeof val === 'number' && key in bonus) bonus[key] += val
      }
    }
    return bonus
  }, [destinyPatterns, talents])

  const displayBaseAttrs = useMemo(() => {
    const base = characterBase?.current ?? characterBase?.base
    const result: Record<string, number> = {}
    for (const k of ATTR_KEYS) {
      const v = (base as unknown as Record<string, number> | undefined)?.[k] ?? 0
      result[k] = v + (patternBonus[k] ?? 0)
    }
    return result
  }, [characterBase, patternBonus])

  const stratumLabel = useMemo(() => {
    if (!playerStratum) return ''
    const labels = { ...STRATUM_LABELS_DEFAULT, ...stratumLabels }
    return labels[playerStratum as keyof typeof labels] ?? playerStratum
  }, [playerStratum, stratumLabels])

  /** 对齐废弃项目：用世界锚定年 + 回合偏移显示纪元。Math.max 防 round.year=0 初始态回退到负年 */
  const headerEraYear = useMemo(() => {
    if (eraStartYear !== 0) return eraStartYear + Math.max(0, round.year - 1)
    return round.eraYear
  }, [eraStartYear, round.year, round.eraYear])

  /** 纪元显示文本：优先使用世界配置的纪元名，缺省时回退引擎自动生成或纯年份 */
  const eraDisplayText = useMemo(() => {
    // 世界配置了自定义纪元名 → 直接使用
    if (worldEraName) return formatEraYear(headerEraYear, worldEraName)
    // 世界配置了自定义起始年但无纪元名 → 纯年份显示
    if (eraStartYear !== 0) return formatEraYear(headerEraYear, '')
    // 无自定义纪元 → 使用引擎自动生成的年号（如"创世纪元"）
    return formatEraYear(headerEraYear, round.eraName)
  }, [headerEraYear, eraStartYear, worldEraName, round.eraName])

  const narrativeTimeLabel = useMemo(
    () => formatNarrativeTimeLabel(timeStep, eraDisplayText, round),
    [timeStep, eraDisplayText, round],
  )

  const worldTagsText = useMemo(
    () => resolveDestinyPatternWorldTags(worldConfig, worldTags),
    [worldConfig, worldTags],
  )

  const worldTagSections = useMemo(
    () => parseWorldTagsToSections(worldTagsText),
    [worldTagsText],
  )

  const handleGoToGameOver = useCallback(() => {
    stop()
    router.push('/game-over')
  }, [router, stop])

  const handleNarrativeAdvance = useCallback(async () => {
    if (isDead || isComplete || isAdvancing || hasUnresolvedBranch) return
    await advanceRound()
  }, [isDead, isComplete, isAdvancing, hasUnresolvedBranch, advanceRound])

  const activeTimeStepLabel = timeStepOptions.find((o) => o.value === activeTimeStepKey)?.label ?? '按年'

  const narrativeEntries: NarrativeEntry[] = useMemo(() =>
    narrativeHistory.map((chunk) => ({
      text: chunk.text,
      timestamp: chunk.timestamp,
      eraLabel: chunk.displayTimeLabel ?? narrativeTimeLabel,
      ageLabel: chunk.displayAge !== undefined ? `${chunk.displayAge} 岁` : `${characterAge} 岁`,
      isBranchPoint: chunk.isBranchPoint,
      branchTitle: chunk.branchTitle,
      // 直接用 chunk 自带的 resolvedChoice：随条目移动，裁剪后不错位。
      // （历史 fallback `resolvedBranches[index]` 用数组下标，裁剪后会指向错误的分支选择）
      resolvedChoice: chunk.resolvedChoice,
      attrChanges: chunk.attrChanges,
    })),
    [narrativeHistory, narrativeTimeLabel, characterAge],
  )

  const streamingHeader = useMemo(() => ({
    eraLabel: narrativeTimeLabel,
    ageLabel: `${characterAge} 岁`,
  }), [narrativeTimeLabel, characterAge])

  // 构建世界信息面板数据
  const worldSurrounding = useMemo(() => {
    const items: Array<{ icon: string; label: string; value: string }> = []
    if (worldConfig) {
      if (worldConfig.name) items.push({ icon: '🌍', label: '世界', value: worldConfig.name })
      if (worldConfig.essenceTag) items.push({ icon: '🏷', label: '本质', value: worldConfig.essenceTag })
      if (worldConfig.powerSystemTag) items.push({ icon: '⚡', label: '体系', value: worldConfig.powerSystemTag })
      if (worldConfig.civilizationStage) items.push({ icon: '🏛️', label: '文明', value: worldConfig.civilizationStage })
      if (worldConfig.spatialForm) items.push({ icon: '🌌', label: '空间', value: worldConfig.spatialForm })
    }
    return items
  }, [worldConfig])

  const worldBasicStatus = useMemo(() => {
    const items: Array<{ icon: string; label: string; value: string }> = []
    items.push({ icon: '📅', label: '纪元', value: `第 ${round.year} 年` })
    items.push({ icon: '🌤', label: '季节', value: seasonName || '?' })
    return items
  }, [round.year, seasonName])

  const worldCharStatus = useMemo(() => {
    const items: Array<{ icon: string; label: string; value: string }> = []
    items.push({ icon: '❤️', label: '生命', value: `${health.hp}/${health.maxHp}` })
    items.push({ icon: '💪', label: '体力', value: String(health.stamina) })
    items.push({ icon: '🧠', label: '精神', value: String(health.spirit) })
    if (health.diseases.length > 0) items.push({ icon: '🤒', label: '疾病', value: String(health.diseases.length) })
    if (health.injuries.length > 0) items.push({ icon: '🩹', label: '伤势', value: String(health.injuries.length) })
    return items
  }, [health])

  const worldEconomyStatus = useMemo(() => {
    const items: Array<{ icon: string; label: string; value: string }> = []
    items.push({ icon: '💰', label: '财富', value: String(Math.round(economy.currency.playerWealth)) })
    items.push({ icon: '📈', label: '市场', value: economy.marketPhase })
    items.push({ icon: '🏷', label: '物价', value: String(Math.round(economy.priceIndex)) })
    items.push({ icon: '👥', label: '人口', value: String(Math.round(population.totalPopulation)) })
    if (settlement.playerSettlement) {
      items.push({ icon: '🏘', label: '定居地', value: settlement.playerSettlement.name })
    }
    if (work.profession) {
      items.push({ icon: '🧰', label: '职业', value: `${work.profession} Lv.${work.professionLevel}` })
    }
    return items
  }, [economy.currency.playerWealth, economy.marketPhase, economy.priceIndex, population.totalPopulation, settlement.playerSettlement, work.profession, work.professionLevel])

  const worldPoliticsStatus = useMemo(() => {
    const items: Array<{ icon: string; label: string; value: string }> = []
    if (stratumLabel) items.push({ icon: '🧭', label: '阶层', value: stratumLabel })
    items.push({ icon: '⚖', label: '流动性', value: String(Math.round(socialStratification.socialMobility)) })
    if (faction.factions.length > 0) items.push({ icon: '🏳', label: '势力', value: `${faction.factions.length} 个` })
    if (nationRelation.relations.length > 0) items.push({ icon: '🕊', label: '国家关系', value: `${nationRelation.relations.length} 组` })
    items.push({ icon: '📜', label: '法律', value: legal.systemType })
    if (conflictCycle.enabled) items.push({ icon: '🔥', label: '冲突', value: `${conflictCycle.currentPhase} ${Math.round(conflictCycle.phaseProgress)}%` })
    return items
  }, [conflictCycle.currentPhase, conflictCycle.enabled, conflictCycle.phaseProgress, faction.factions.length, legal.systemType, nationRelation.relations.length, socialStratification.socialMobility, stratumLabel])

  const worldPowerStatus = useMemo(() => {
    const items: Array<{ icon: string; label: string; value: string }> = []
    items.push({ icon: '⚔', label: '战力', value: `${combatPowerState.mainStage}-${combatPowerState.subStage} / ${Math.round(combatPowerState.powerValue)}` })
    if (cultivation.enabled) items.push({ icon: '🌀', label: '修炼', value: cultivation.realmLabel })
    items.push({ icon: '🍀', label: '气运', value: String(Math.round(luck.luck)) })
    if (fortuneEncounter.totalEncounters > 0) items.push({ icon: '✨', label: '机缘', value: `${fortuneEncounter.totalEncounters} 次` })
    if (faith.faithName) items.push({ icon: '🙏', label: '信仰', value: `${faith.faithName} ${faith.devotionLevel}` })
    if (supremeItem.items.length > 0) items.push({ icon: '🏺', label: '至尊物品', value: `${supremeItem.items.length} 件` })
    if (anomalyZones.length > 0) items.push({ icon: '🕳', label: '异常区', value: `${anomalyZones.length} 处` })
    return items
  }, [anomalyZones.length, combatPowerState.mainStage, combatPowerState.powerValue, combatPowerState.subStage, cultivation.enabled, cultivation.realmLabel, faith.devotionLevel, faith.faithName, fortuneEncounter.totalEncounters, luck.luck, supremeItem.items.length])

  const worldInventoryStatus = useMemo(() => {
    const items: Array<{ icon: string; label: string; value: string }> = []
    items.push({ icon: '🎒', label: '物品', value: `${item.inventory.length}/${item.capacity}` })
    if (skills.length > 0) items.push({ icon: '📘', label: '技能', value: `${skills.length} 个` })
    const discoveredMaterials = materials.filter((m) => m.discovered).length
    if (discoveredMaterials > 0) items.push({ icon: '⛏', label: '材料', value: `${discoveredMaterials} 种` })
    return items
  }, [item.capacity, item.inventory.length, materials, skills.length])

  // 手动存档处理
  const handleManualSave = useCallback(async (slot: number, name: string) => {
    await saveManager.saveToSlot(slot, name, worldConfig?.name ?? '', characterName, collectGameSavePayload())
    setMoreSelected('save')
  }, [characterName, worldConfig?.name])

  const moreButtonLabel = useMemo(() => {
    if (moreSelected === 'branch') return '⚡ 分支'
    if (moreSelected === 'save') return '💾 存档'
    if (moreSelected === 'settle') return '🎬 结算'
    if (moreSelected === 'main') return '🏠 主界面'
    if (moreSelected === 'relation') return '👥 关系'
    return '更多'
  }, [moreSelected])

  const preGenHint = useMemo(() => {
    if (preGenStatus.maxRounds <= 0) return null
    if (preGenStatus.isActive) return '预生成中…'
    if (preGenStatus.queueLength > 0) return `缓存 ${preGenStatus.queueLength} 轮`
    return null
  }, [preGenStatus])

  const flowGuard = useMemo(() => {
    if (!worldConfig || worldCode === 0) {
      return { title: '世界尚未建立', message: '请先完成世界选择与构建，再进入模拟。', action: '/new-game/world-select' }
    }
    if (!characterName.trim()) {
      return { title: '角色尚未创建', message: '请先完成角色创建、天赋和命运预览，再进入模拟。', action: '/new-game/character-create' }
    }
    return null
  }, [characterName, worldCode, worldConfig])

  if (flowGuard) {
    return (
      <div className={styles.root}>
        <div className={styles.guardShell}>
          <div className={styles.guardCard}>
            <div className={styles.guardIcon}>⚠</div>
            <h1 className={styles.guardTitle}>{flowGuard.title}</h1>
            <p className={styles.guardMessage}>{flowGuard.message}</p>
            <button type="button" className={styles.ctrlBtnPrimary} onClick={() => router.replace(flowGuard.action)}>
              返回创建流程
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {/* Toast 通知 */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {causalToast && (
        <div className={styles.causalToast}>
          <span>{causalToast}</span>
        </div>
      )}

      {/* 手动存档弹窗 */}
      <SaveDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleManualSave}
        defaultWorldName={worldConfig?.name}
        defaultCharacterName={characterName}
      />

      {/* 顶部状态栏（对齐废弃项目 GameSimulationDesktop） */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.headerLeft}>
            <div className={styles.headerTopRow}>
              <span className={styles.worldName}>{worldConfig?.name ?? '未知世界'}</span>
              <span className={styles.raceTag}>{raceInfo.name}</span>
              {isDead && <span className={styles.endingTag}>🏁 人生落幕</span>}
            </div>
            <div className={styles.charRow}>
              <span className={styles.charName}>{characterName || '未命名'}</span>
              <span className={styles.charGender}>· {genderLabel}</span>
              {(destinyPatterns ?? []).slice(0, 3).map((p) => {
                const rc = DESTINY_PATTERN_RARITY_CONFIG[p.rarity]
                return (
                  <span
                    key={p.id}
                    className={styles.talentTag}
                    style={{ background: `${rc.color}10`, color: rc.color, border: `1px solid ${rc.color}20` }}
                  >
                    {p.name}
                  </span>
                )
              })}
            </div>
            <div className={styles.attrRow}>
              {ATTR_KEYS.map((k) => {
                const v = displayBaseAttrs[k] ?? 0
                return (
                  <span key={k} className={styles.attrItem}>
                    <span className={styles.attrIcon}>{ATTRIBUTE_ICONS[k]}</span>
                    <span className={styles.attrKey}>{ATTRIBUTE_NAMES[k]}</span>
                    <span className={`${styles.attrVal} ${v > 0 ? styles.attrValPos : v < 0 ? styles.attrValNeg : styles.attrValZero}`}>
                      {v > 0 ? '+' : ''}{v}
                    </span>
                  </span>
                )
              })}
            </div>
            <div className={styles.dynAttrRow}>
              {[
                { label: '财富', value: playerWealth },
                { label: '战力', value: combatPower },
                { label: '生命', value: health.hp },
              ].map(({ label, value }) => (
                <span
                  key={label}
                  className={`${styles.dynAttrItem} ${value > 0 ? styles.dynAttrPos : value < 0 ? styles.dynAttrNeg : styles.dynAttrZero}`}
                >
                  {label} {value > 0 ? '+' : ''}{value}
                </span>
              ))}
              {playerStratum && (
                <span className={`${styles.dynAttrItem} ${styles.dynAttrZero}`}>
                  阶层 {stratumLabel}
                </span>
              )}
            </div>
          </div>
          <div className={styles.headerRight}>
            <span className={styles.eraDisplay}>{narrativeTimeLabel}</span>
            <span className={styles.ageDisplay}>{characterAge}岁</span>
            {preGenHint && (
              <span className={styles.preGenHint}>{preGenHint}</span>
            )}
            <div className={styles.controlRow}>
              <div ref={moreBtnRef}>
                <button
                  type="button"
                  className={cn(styles.ctrlBtn, moreSelected === 'branch' && styles.ctrlBtnActive)}
                  onClick={() => {
                    if (moreSelected) {
                      setMoreSelected(null)
                      if (moreSelected === 'branch') {
                        useEngineStore.getState().setForceBranchNext(false)
                      }
                      setMoreMenuOpen(false)
                      return
                    }
                    setMoreMenuOpen((v) => !v)
                    setTimeStepOpen(false)
                  }}
                >
                  {moreButtonLabel}
                </button>
              </div>
              <div ref={timeStepBtnRef}>
                <button
                  type="button"
                  className={styles.ctrlBtn}
                  onClick={() => setTimeStepOpen((v) => !v)}
                >
                  {activeTimeStepLabel}
                </button>
              </div>
              <button
                type="button"
                className={`${styles.ctrlBtn} ${showWorldPanel ? styles.ctrlBtnWorldActive : ''}`}
                onClick={() => {
                  setShowWorldPanel(!showWorldPanel)
                  setTimeStepOpen(false)
                }}
              >
                📊 世界{showWorldPanel ? '▴' : '▾'}
              </button>
            </div>
            <AutoSaveIndicator lastAutoSaveRound={lastAutoSaveRound} />
          </div>
        </div>
      </header>

      {/* 世界信息面板（可折叠，对齐废弃项目标签布局） */}
      {showWorldPanel && (
        <div className={styles.panel}>
          <div className={styles.panelInner}>
            {worldTagSections.length > 0 && (
              <>
                <h4 className={styles.panelSectionTitle}>📄 世界规则</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {worldTagSections.map((section) => (
                    <div key={section.name}>
                      <div className={styles.panelSectionTitleSm}>{section.name}</div>
                      <div className={styles.tagGrid}>
                        {section.tags.map((tag) => (
                          <span key={`${section.name}-${tag.key}`} className={styles.tagChip}>
                            {tag.key}：{tag.value}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {(worldSurrounding.length > 0 || worldBasicStatus.length > 0 || worldCharStatus.length > 0 || worldEconomyStatus.length > 0 || worldPoliticsStatus.length > 0 || worldPowerStatus.length > 0 || worldInventoryStatus.length > 0) && (
              <>
                {worldSurrounding.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className={styles.panelSectionTitleSm}>📍 你的周边</div>
                    <div className={styles.tagGrid}>
                      {worldSurrounding.map((item) => (
                        <span key={item.label} className={`${styles.tagChip} ${styles.tagChipEnv}`}>
                          {item.icon} {item.label}：{item.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {worldBasicStatus.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className={styles.panelSectionTitleSm}>🔔 基础状态</div>
                    <div className={styles.tagGrid}>
                      {worldBasicStatus.map((item) => (
                        <span key={item.label} className={`${styles.tagChip} ${styles.tagChipEnv}`}>
                          {item.icon} {item.label}：{item.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {worldCharStatus.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className={styles.panelSectionTitleSm}>👁 角色状态</div>
                    <div className={styles.tagGrid}>
                      {worldCharStatus.map((item) => (
                        <span key={item.label} className={`${styles.tagChip} ${styles.tagChipChar}`}>
                          {item.icon} {item.label}：{item.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {worldEconomyStatus.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className={styles.panelSectionTitleSm}>💰 经济与人口</div>
                    <div className={styles.tagGrid}>
                      {worldEconomyStatus.map((item) => (
                        <span key={item.label} className={`${styles.tagChip} ${styles.tagChipEnv}`}>
                          {item.icon} {item.label}：{item.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {worldPoliticsStatus.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className={styles.panelSectionTitleSm}>🏛 社会与势力</div>
                    <div className={styles.tagGrid}>
                      {worldPoliticsStatus.map((item) => (
                        <span key={item.label} className={`${styles.tagChip} ${styles.tagChipEnv}`}>
                          {item.icon} {item.label}：{item.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {worldPowerStatus.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className={styles.panelSectionTitleSm}>⚡ 力量与异常</div>
                    <div className={styles.tagGrid}>
                      {worldPowerStatus.map((item) => (
                        <span key={item.label} className={`${styles.tagChip} ${styles.tagChipChar}`}>
                          {item.icon} {item.label}：{item.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {worldInventoryStatus.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className={styles.panelSectionTitleSm}>🎒 物品与技能</div>
                    <div className={styles.tagGrid}>
                      {worldInventoryStatus.map((item) => (
                        <span key={item.label} className={`${styles.tagChip} ${styles.tagChipChar}`}>
                          {item.icon} {item.label}：{item.value}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
            {worldTagSections.length === 0 && worldSurrounding.length === 0 && worldEconomyStatus.length === 0 && worldPoliticsStatus.length === 0 && worldPowerStatus.length === 0 && worldInventoryStatus.length === 0 && (
              <div className={styles.panelEmpty}>
                <div className={styles.panelEmptyIcon}>🔔</div>
                <p className={styles.panelEmptyText}>正在等待模拟数据，推进第一年后自动加载...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {timeStepOpen && timeStepMenuRect && typeof document !== 'undefined' && createPortal(
        <div
          className={styles.timeStepMenu}
          style={{
            position: 'fixed',
            zIndex: 10000,
            top: timeStepMenuRect.bottom + 4,
            right: document.documentElement.clientWidth - timeStepMenuRect.right,
            background: 'var(--color-bg-card)',
            opacity: 1,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {timeStepOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={cn(styles.timeStepItem, opt.value === activeTimeStepKey && styles.timeStepItemActive)}
              onClick={() => {
                handleTimeStepChange(opt.value)
                setTimeStepOpen(false)
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body,
      )}

      {moreMenuOpen && moreMenuRect && typeof document !== 'undefined' && createPortal(
        <div
          className={styles.moreMenu}
          style={{
            position: 'fixed',
            zIndex: 10000,
            top: moreMenuRect.bottom + 4,
            right: document.documentElement.clientWidth - moreMenuRect.right,
            background: 'var(--color-bg-card)',
            opacity: 1,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={cn(styles.moreMenuItem, forceBranchNext && styles.moreMenuItemActive)}
            onClick={() => {
              setMoreSelected('branch')
              setMoreMenuOpen(false)
              handleForceBranch()
            }}
          >
            ⚡ 分支{forceBranchNext ? '（下轮强制）' : ''}
          </button>
          <button
            type="button"
            className={styles.moreMenuItem}
            onClick={() => {
              setMoreSelected('relation')
              setMoreMenuOpen(false)
              setShowRelationshipPanel(true)
            }}
          >
            👥 关系面板
          </button>
          <button
            type="button"
            className={styles.moreMenuItem}
            onClick={() => {
              setMoreMenuOpen(false)
              setShowSaveDialog(true)
            }}
          >
            💾 存档
          </button>
          {!isDead && (
            <button
              type="button"
              className={styles.moreMenuItem}
              onClick={() => {
                setMoreSelected('settle')
                setMoreMenuOpen(false)
                handleGoToGameOver()
              }}
            >
              🎬 结算
            </button>
          )}
          <button
            type="button"
            className={styles.moreMenuItem}
            onClick={() => {
              setMoreSelected('main')
              setMoreMenuOpen(false)
              router.push('/')
            }}
          >
            🏠 主界面
          </button>
        </div>,
        document.body,
      )}

      {/* NPC 关系面板（可折叠） */}
      {showRelationshipPanel && (
        <div style={{ maxWidth: MAX_WIDTH, margin: '0 auto', padding: '0 16px' }}>
          <NPCRelationshipPanel onClose={() => setShowRelationshipPanel(false)} />
        </div>
      )}

      {/* 主内容区：叙事 + 隐藏式推进 */}
      <div className={styles.mainArea}>
        <NarrativeTimeline
          entries={narrativeEntries}
          streamingText={streamingNarrative}
          scrollContainerRef={narrativeEndRef}
          streamingHeader={streamingHeader}
          turnCount={totalRounds}
          showAdvance={!isDead && !isComplete}
          advanceBlocked={hasUnresolvedBranch}
          advanceBlockedText="✔ 请先选择命运"
          isGenerating={isAdvancing}
          hasEndingEvent={isDead}
          advanceText="轻触，让岁月流转"
          onAdvance={handleNarrativeAdvance}
          onGoToGameOver={handleGoToGameOver}
          unresolvedBranchIndex={unresolvedBranchIndex}
          branchTitle={branchTitle}
          branchOptions={branchOptions}
          selectedBranchOptionId={selectedBranchOptionId}
          branchCustomText={branchCustomText}
          onBranchSelect={setSelectedBranchOptionId}
          onBranchConfirm={handleBranchConfirm}
          onBranchCancel={handleBranchCancel}
          onCustomInputChange={setBranchCustomText}
        />

        {isDead && !streamingNarrative && (
          <div className={styles.statusBanner}>
            <h2 className={styles.statusTitle}>{characterName} 的一生已落幕</h2>
            <p className={styles.statusDesc}>
              模拟已完成。角色在第 {round.year} 年 {seasonName} 离世。
            </p>
          </div>
        )}

        {isComplete && !isDead && !streamingNarrative && narrativeHistory.length === 0 && (
          <div className={styles.statusBanner}>
            <p className={styles.statusDesc}>模拟已结束</p>
          </div>
        )}
      </div>
    </div>
  )
}
