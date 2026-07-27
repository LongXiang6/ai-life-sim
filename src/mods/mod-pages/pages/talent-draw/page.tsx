/**
 * @module talent-draw-page
 * @description 命格抽取与选择 —— 对齐移动端方案库的十二道命印与双轮回天赋槽
 *   - 单按钮 + 设置控制 AI/预设
 *   - 十二道命印全部归位并完成一秒交接后展开选取
 *   - 真实进度追踪（onProgress 回调）
 *   - 抽12选3 + 可选两项轮回天赋 → 确认 → /attribute-alloc
 * @mod mod-pages
 */

'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import {
  useCharacterStore,
  DESTINY_PATTERN_RARITY_CONFIG,
  DESTINY_PATTERN_SELECT_COUNT,
  DESTINY_PATTERN_DISPLAY_COUNT,
  MYTHIC_PATTERN_SELECT_COUNT,
  DESTINY_PATTERN_FAST_DRAW_THRESHOLD,
  aggregatePatternSystemModifiers,
  formatPatternSystemModifiersForDisplay,
  ATTRIBUTE_NAMES,
  useMythicLibraryStore,
} from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'
import { useSettingsStore } from '@/mods/mod-settings'
import { BottomActionBar, PageErrorBoundary } from '@/mods/mod-ui'
import { cn } from '@/foundation/utils'
import { configStore } from '@/core'
import { DEFAULT_AI_MODEL, isAiCredentialError } from '@/core/ai-service'
import { getDestinyPatternSystem, loadDestinyPatternPool, saveDestinyPatternPool } from '@/mods/mod-character/destiny-pattern-access'

import type { AIModelConfig } from '@/foundation'
import type { DestinyPattern, MythicPattern } from '@/mods/mod-character'

import styles from './TalentDraw.module.css'
import { useCreationStoresHydrated } from '../../hooks/useCreationStoresHydrated'
import { FlowIcon } from './TalentFlowArt'

type PagePhase = 'idle' | 'generating' | 'ready' | 'selecting'

const ATTR_BONUS_KEYS = ['physique', 'mind', 'talentAptitude', 'charisma'] as const

function createSelectedUiSlots(indices: number[]): (number | null)[] {
  return Array.from({ length: DESTINY_PATTERN_SELECT_COUNT }, (_, index) => indices[index] ?? null)
}

function formatPatternAttrSummary(pattern: DestinyPattern): string {
  if (!pattern.attrBonus) return '无属性加成'
  const labels = ATTR_BONUS_KEYS.flatMap((key) => {
    const value = pattern.attrBonus?.[key]
    if (typeof value !== 'number' || value === 0) return []
    return [`${ATTRIBUTE_NAMES[key] ?? key} ${value > 0 ? '+' : ''}${value}`]
  })
  return labels.length > 0 ? labels.join(' · ') : '无属性加成'
}

// ══════════════════════════════════════════════════════
// 缓存（按世界编码隔离，见 destiny-pattern-pool-cache）
// ══════════════════════════════════════════════════════

function isAIGeneratedPattern(pattern: DestinyPattern): boolean {
  return pattern.id.startsWith('ai-') || pattern.id.startsWith('ai_')
}

function patternNameKey(pattern: DestinyPattern): string {
  return pattern.name.trim().toLocaleLowerCase()
}

function uniquePatternsByIdentity(patterns: DestinyPattern[]): DestinyPattern[] {
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  return patterns.filter((pattern) => {
    if (pattern.polarity === 'negative') return false
    const nameKey = patternNameKey(pattern)
    if (seenIds.has(pattern.id) || seenNames.has(nameKey)) return false
    seenIds.add(pattern.id)
    seenNames.add(nameKey)
    return true
  })
}

function loadCachedPool(): DestinyPattern[] {
  return uniquePatternsByIdentity(
    loadDestinyPatternPool(useWorldStore.getState().worldCode).filter(isAIGeneratedPattern),
  )
}

function saveCachedPool(patterns: DestinyPattern[]): void {
  const aiPatterns = uniquePatternsByIdentity(patterns.filter(isAIGeneratedPattern))
  if (aiPatterns.length > 0) {
    saveDestinyPatternPool(useWorldStore.getState().worldCode, aiPatterns)
  }
}

// ══════════════════════════════════════════════════════
// 持久化选取状态（按世界编码隔离）
// ══════════════════════════════════════════════════════

function tdStorageKey(): string {
  const worldCode = useWorldStore.getState().worldCode
  return `talent-draw:${worldCode || 0}`
}

interface SavedTdState {
  phase: 'idle' | 'generating' | 'selecting'
  slots: (DestinyPattern | null)[]
  selectedSlotIndices: number[]
  aiTalentGeneration: boolean
}

function loadTdState(): SavedTdState | null {
  return configStore.get<SavedTdState>('mod-pages', tdStorageKey())
}

function persistTdState(state: SavedTdState): void {
  configStore.set('mod-pages', tdStorageKey(), state)
}

function drawSlotsFromPool(pool: DestinyPattern[]): (DestinyPattern | null)[] {
  const uniquePool = uniquePatternsByIdentity(pool)
  const shuffled = uniquePool.sort(() => Math.random() - 0.5)
  const drawn = shuffled.slice(0, DESTINY_PATTERN_DISPLAY_COUNT)
  const newSlots: (DestinyPattern | null)[] = Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null)
  drawn.forEach((p, i) => { newSlots[i] = p })
  return newSlots
}

function revealSlotsInOrder(patterns: DestinyPattern[]): (DestinyPattern | null)[] {
  const revealed = uniquePatternsByIdentity(patterns).slice(0, DESTINY_PATTERN_DISPLAY_COUNT)
  const nextSlots: (DestinyPattern | null)[] = Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null)
  revealed.forEach((pattern, index) => { nextSlots[index] = pattern })
  return nextSlots
}

function mergeSlotsWithPatterns(
  currentSlots: (DestinyPattern | null)[],
  patterns: DestinyPattern[],
): (DestinyPattern | null)[] {
  const nextSlots = currentSlots.length === DESTINY_PATTERN_DISPLAY_COUNT
    ? [...currentSlots]
    : Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null) as (DestinyPattern | null)[]
  const visibleIds = new Set(nextSlots.flatMap((pattern) => pattern ? [pattern.id] : []))
  const visibleNames = new Set(nextSlots.flatMap((pattern) => pattern ? [patternNameKey(pattern)] : []))
  for (const pattern of uniquePatternsByIdentity(patterns)) {
    if (visibleIds.has(pattern.id) || visibleNames.has(patternNameKey(pattern))) continue
    const emptyIndex = nextSlots.findIndex((slot) => slot === null)
    if (emptyIndex < 0) break
    nextSlots[emptyIndex] = pattern
    visibleIds.add(pattern.id)
    visibleNames.add(patternNameKey(pattern))
  }
  return nextSlots
}

function buildDestinyPatternContext() {
  return {
    worldConfig: useWorldStore.getState().worldConfig,
    calibration: undefined,
    worldTags: undefined,
    character: {
      name: useCharacterStore.getState().name,
      race: useCharacterStore.getState().race,
      gender: useCharacterStore.getState().gender,
      background: useCharacterStore.getState().background,
      startingAge: useCharacterStore.getState().characterBase?.startingAge ?? 0,
      attributes: useCharacterStore.getState().characterBase?.base as unknown as Record<string, number>,
    },
    existingNames: [],
  }
}

function configureDestinyPatternAIService(): void {
  getDestinyPatternSystem().setAIService(async (systemPrompt: string, userPrompt: string, options?: unknown) => {
    const { callAI, callAIStream } = await import('@/core')
    const { estimateDestinyPatternTokenBudget } = await import('@/mods/mod-character/destiny-pattern-access')
    const opts = options as {
      pool?: string
      sessionId?: string
      userSegments?: string[]
      stablePrefixChars?: number
      jsonMode?: boolean
      stream?: boolean
      onChunk?: (text: string) => void
      signal?: AbortSignal
      maxTokensOverride?: number
      storySeed?: number
      outputSchema?: Parameters<typeof callAI>[2]['outputSchema']
    }
    const useStream = opts?.stream === true
    const {
      provider,
      customKey,
      customUrl,
      customModel,
      talentThinkingIntensity,
    } = useSettingsStore.getState()
    const model = customModel || DEFAULT_AI_MODEL
    const maxTokens = opts?.maxTokensOverride
      ?? estimateDestinyPatternTokenBudget(systemPrompt.length + userPrompt.length)
    const defaultConfig: AIModelConfig = {
      model,
      temperature: 0.8,
      maxTokens,
      stream: useStream,
      reasoningEffort: talentThinkingIntensity,
    }

    const callOptions = {
      config: defaultConfig,
      pool: (opts?.pool ?? 'fate') as 'narrative' | 'summary' | 'worldInit' | 'fate' | 'lowFrequency',
      sessionId: opts?.sessionId,
      userSegments: opts?.userSegments,
      jsonMode: opts?.jsonMode,
      onChunk: opts?.onChunk,
      signal: opts?.signal,
      providerId: provider,
      apiKey: customKey || undefined,
      customBaseUrl: customUrl || undefined,
      customModel: model,
      reasoningEffort: talentThinkingIntensity,
      overrideMaxTokens: maxTokens,
      storySeed: opts?.storySeed,
      outputSchema: opts?.outputSchema,
      strictSchema: !useStream && Boolean(opts?.outputSchema),
      logCategory: 'talent-generate' as const,
      logContext: {
        callKind: useStream ? 'talent-generate-stream' : 'talent-generate-batch',
        pool: 'fate',
        model,
        sessionId: opts?.sessionId,
      },
      logMeta: {
        userId: opts?.sessionId ? `fate-${opts.sessionId}` : undefined,
        stablePrefixChars: opts?.stablePrefixChars,
      },
    }

    // 不设页面级超时；单次调用由 ai-client 兜底，池填充由 DestinyPatternSystem 负责续跑和持久化。
    if (useStream) {
      return await callAIStream(systemPrompt, userPrompt, callOptions)
    }
    return await callAI(systemPrompt, userPrompt, callOptions)
  })
}

// ══════════════════════════════════════════════════════
// 组件
// ══════════════════════════════════════════════════════

function normalizeSavedPhase(phase?: SavedTdState['phase']): PagePhase {
  if (phase === 'selecting') return 'selecting'
  return 'idle'
}

interface InitialTalentDrawState {
  phase: PagePhase
  slots: (DestinyPattern | null)[]
  selectedSlotIndices: number[]
  localPoolSize: number
  pool: DestinyPattern[]
}

function resolveInitialTalentDrawState(): InitialTalentDrawState {
  const saved = loadTdState()
  const cached = loadCachedPool()
  const { aiTalentGeneration } = useSettingsStore.getState()
  const savedPatterns = saved?.slots?.filter((pattern): pattern is DestinyPattern => pattern !== null) ?? []

  const savedSlotsMatchMode = saved?.slots?.length === DESTINY_PATTERN_DISPLAY_COUNT
    && savedPatterns.length >= DESTINY_PATTERN_DISPLAY_COUNT
    && (saved?.phase !== 'selecting' || savedPatterns.length >= DESTINY_PATTERN_DISPLAY_COUNT)
    && uniquePatternsByIdentity(savedPatterns).length === savedPatterns.length
    && (!aiTalentGeneration || savedPatterns.every(isAIGeneratedPattern))
  const usableSaved = savedSlotsMatchMode ? saved : null

  if (usableSaved?.phase === 'selecting') {
    // 若 AI 开关已变更，旧 session 不再有效，跳过恢复
    if (usableSaved.aiTalentGeneration !== aiTalentGeneration) {
      // 回退到 idle，由用户重新点击按钮触发对应模式
      return {
        phase: 'idle',
        slots: Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null),
        selectedSlotIndices: [],
        localPoolSize: cached.length,
        pool: cached,
      }
    }
    return {
      phase: 'selecting',
      slots: usableSaved.slots,
      selectedSlotIndices: usableSaved.selectedSlotIndices ?? [],
      localPoolSize: Math.max(cached.length, usableSaved.slots.filter(Boolean).length),
      pool: cached.length > 0 ? cached : usableSaved.slots.filter((p): p is DestinyPattern => p !== null),
    }
  }

  if (aiTalentGeneration && cached.length >= DESTINY_PATTERN_DISPLAY_COUNT) {
    const newSlots = drawSlotsFromPool(cached)
    useCharacterStore.getState().setDestinyPatterns({ candidates: cached })
    return {
      phase: 'ready',
      slots: newSlots,
      selectedSlotIndices: [],
      localPoolSize: cached.length,
      pool: cached,
    }
  }

  return {
    phase: normalizeSavedPhase(usableSaved?.phase),
    slots: usableSaved?.slots?.length === DESTINY_PATTERN_DISPLAY_COUNT
      ? usableSaved.slots
      : Array(DESTINY_PATTERN_DISPLAY_COUNT).fill(null),
    selectedSlotIndices: usableSaved?.selectedSlotIndices ?? [],
    localPoolSize: cached.length,
    pool: cached,
  }
}

function TalentDrawContent() {
  const router = useRouter()
  const mythicLibrary = useMythicLibraryStore((state) => state.patterns)
  const equippedMythicPatterns = useCharacterStore((state) => state.equippedMythicPatterns)
  const setEquippedMythicPatterns = useCharacterStore((state) => state.setEquippedMythicPatterns)

  const [initialDraw] = useState(() => resolveInitialTalentDrawState())

  const [phase, setPhase] = useState<PagePhase>(initialDraw.phase)
  const [slots, setSlots] = useState<(DestinyPattern | null)[]>(initialDraw.slots)
  const [selectedUiSlots, setSelectedUiSlots] = useState<(number | null)[]>(
    () => createSelectedUiSlots(initialDraw.selectedSlotIndices),
  )
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [streamCount, setStreamCount] = useState(0)
  const [localPoolSize, setLocalPoolSize] = useState(initialDraw.localPoolSize)
  const [errorMsg, setErrorMsg] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [activeMythicSlot, setActiveMythicSlot] = useState(0)
  const [toastMessage, setToastMessage] = useState('')
  const [isConfirming, setIsConfirming] = useState(false)

  const fullPoolRef = useRef<DestinyPattern[]>(initialDraw.pool)
  const abortRef = useRef(false)
  const librarySheetRef = useRef<HTMLElement | null>(null)
  const libraryTriggerRef = useRef<HTMLButtonElement | null>(null)
  const libraryCloseRef = useRef<HTMLButtonElement | null>(null)
  const toastTimerRef = useRef<number | null>(null)
  const completionTimerRef = useRef<number | null>(null)
  const navigationFallbackTimerRef = useRef<number | null>(null)
  const completionScheduledRef = useRef(false)
  const confirmationRef = useRef(false)

  const selectedSlotIndices = useMemo(
    () => selectedUiSlots.filter((index): index is number => index !== null),
    [selectedUiSlots],
  )

  const notify = useCallback((message: string) => {
    setToastMessage(message)
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage('')
      toastTimerRef.current = null
    }, 1450)
  }, [])

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current)
    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current)
    if (navigationFallbackTimerRef.current !== null) window.clearTimeout(navigationFallbackTimerRef.current)
  }, [])

  // 持久化稳定状态（ready 是不落盘的视觉交接态，刷新后由缓存重新构建）
  useEffect(() => {
    if (phase === 'idle' || phase === 'selecting') {
      const { aiTalentGeneration } = useSettingsStore.getState()
      persistTdState({ phase, slots, selectedSlotIndices, aiTalentGeneration })
    }
  }, [phase, slots, selectedSlotIndices])

  // ══════════ 组件卸载：离开命格流程即中止页面不再需要的补池请求 ══════════
  useEffect(() => {
    return () => {
      abortRef.current = true
      const destinySystem = getDestinyPatternSystem()
      const status = destinySystem.getPoolFillStatus()
      if (status.inProgress) {
        destinySystem.abortPoolFill()
      }
    }
  }, [])

  // ══════════ 已选数据 ══════════
  const selectedData = useMemo(
    () => selectedSlotIndices.map((i) => slots[i]).filter((p): p is DestinyPattern => p !== null),
    [slots, selectedSlotIndices],
  )

  useEffect(() => {
    if (!libraryOpen) return
    const trigger = libraryTriggerRef.current
    const focusFrame = window.requestAnimationFrame(() => libraryCloseRef.current?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      const sheet = librarySheetRef.current
      if (!sheet) return
      if (event.key === 'Escape') {
        event.preventDefault()
        setLibraryOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter((element) => element.getClientRects().length > 0)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
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
      trigger?.focus()
    }
  }, [libraryOpen])

  const completeFullDraw = useCallback((patterns: DestinyPattern[]): boolean => {
    const visiblePatterns = uniquePatternsByIdentity(patterns)
    if (
      visiblePatterns.length < DESTINY_PATTERN_DISPLAY_COUNT
      || abortRef.current
      || completionScheduledRef.current
    ) {
      return false
    }

    completionScheduledRef.current = true
    fullPoolRef.current = visiblePatterns
    saveCachedPool(visiblePatterns)
    useCharacterStore.getState().setDestinyPatterns({ candidates: visiblePatterns })
    setSlots(revealSlotsInOrder(visiblePatterns))
    setStreamCount(DESTINY_PATTERN_DISPLAY_COUNT)
    setLocalPoolSize(visiblePatterns.length)

    if (completionTimerRef.current !== null) window.clearTimeout(completionTimerRef.current)
    completionTimerRef.current = window.setTimeout(() => {
      completionTimerRef.current = null
      if (abortRef.current) return
      setPhase('ready')
    }, 1000)
    return true
  }, [])

  useEffect(() => {
    if (phase === 'selecting') router.prefetch('/attribute-alloc')
  }, [phase, router])

  // ══════════ 进度文案（12 条命印全部归位后才进入交接态） ══════════
  const progressTarget = DESTINY_PATTERN_DISPLAY_COUNT
  const displayStreamCount = Math.min(streamCount, DESTINY_PATTERN_DISPLAY_COUNT)
  const latestStreamPattern = displayStreamCount > 0 ? slots[displayStreamCount - 1] : null
  const generationMessage = latestStreamPattern
      ? displayStreamCount < progressTarget
        ? `${latestStreamPattern.name}已显现，正在生成第 ${displayStreamCount + 1} 条有效命格。`
        : `${latestStreamPattern.name}已显现，正在等待其余命印归位。`
    : '正在生成第 1 条有效命格。'

  // ══════════ 挂载时恢复命格库 + 定时同步池大小 ══════════
  useEffect(() => {
    const syncPoolSize = () => {
      const candidates = useCharacterStore.getState().destinyPatterns.candidates
      const { aiTalentGeneration } = useSettingsStore.getState()
      const cached = aiTalentGeneration ? loadCachedPool() : []
      const usableCandidates = aiTalentGeneration
        ? candidates.filter(isAIGeneratedPattern)
        : candidates
      const uniqueCandidates = uniquePatternsByIdentity(usableCandidates)
      const best = cached.length >= uniqueCandidates.length ? cached : uniqueCandidates
      if (best.length > 0) {
        fullPoolRef.current = best
        setLocalPoolSize(best.length)
        if (phase !== 'idle') setSlots((current) => mergeSlotsWithPatterns(current, best))
        if (phase === 'generating' && best.length >= DESTINY_PATTERN_DISPLAY_COUNT) {
          completeFullDraw(best)
        }
      }
    }
    syncPoolSize()
    const iv = setInterval(syncPoolSize, phase === 'selecting' ? 1000 : 3000)
    return () => clearInterval(iv)
  }, [completeFullDraw, phase])

  useEffect(() => {
    if (phase !== 'generating') return
    const startedAt = performance.now()
    const iv = window.setInterval(() => {
      const status = getDestinyPatternSystem().getPoolFillStatus()
      const current = uniquePatternsByIdentity([
        ...fullPoolRef.current,
        ...useCharacterStore.getState().destinyPatterns.candidates,
        ...loadCachedPool(),
      ])
      if (current.length >= DESTINY_PATTERN_DISPLAY_COUNT) {
        completeFullDraw(current)
      } else if (!status.inProgress && status.count > 0 && performance.now() - startedAt >= 3000) {
        setErrorMsg(`命格池当前只有 ${current.length} 条，需完整生成 ${DESTINY_PATTERN_DISPLAY_COUNT} 条后才能继续。`)
        setPhase('idle')
      }
    }, 1000)
    return () => window.clearInterval(iv)
  }, [completeFullDraw, phase])

  useEffect(() => {
    if (phase !== 'selecting') return
    const { aiTalentGeneration } = useSettingsStore.getState()
    const destinySystem = getDestinyPatternSystem()
    const cachedPoolSize = loadCachedPool().length
    const runtimePoolSize = destinySystem.getPoolFillStatus().count
    if (!aiTalentGeneration || Math.max(cachedPoolSize, runtimePoolSize) >= DESTINY_PATTERN_FAST_DRAW_THRESHOLD) return

    const cached = loadCachedPool()
    if (
      cached.length < DESTINY_PATTERN_DISPLAY_COUNT
      || cached.length >= DESTINY_PATTERN_FAST_DRAW_THRESHOLD
      || destinySystem.getPoolFillStatus().inProgress
    ) {
      return
    }

    let cancelled = false
    configureDestinyPatternAIService()

    // 选取页已经具备十二条候选；这里继续扩充本世界缓存池，供后续快速重抽与复用。
    void destinySystem.generateWithAI(
      buildDestinyPatternContext(),
      (_count, patterns) => {
        const uniquePatterns = uniquePatternsByIdentity(patterns)
        if (uniquePatterns.length > 0) {
          fullPoolRef.current = uniquePatterns
          saveCachedPool(uniquePatterns)
          useCharacterStore.getState().setDestinyPatterns({ candidates: uniquePatterns })
        }
        if (!cancelled) setLocalPoolSize(uniquePatterns.length)
      },
      undefined,
      undefined,
      { initialPatterns: cached },
    ).then((patterns) => {
      const uniquePatterns = uniquePatternsByIdentity(patterns)
      if (uniquePatterns.length > 0) {
        fullPoolRef.current = uniquePatterns
        saveCachedPool(uniquePatterns)
        useCharacterStore.getState().setDestinyPatterns({ candidates: uniquePatterns })
      }
      if (!cancelled) setLocalPoolSize(uniquePatterns.length)
    }).catch(() => {
      /* 静默补池失败不阻断玩家继续选择，下一次进入页面会按缓存继续补。 */
    })

    return () => {
      cancelled = true
      if (destinySystem.getPoolFillStatus().inProgress) {
        destinySystem.abortPoolFill()
      }
    }
  }, [phase])

  // ══════════ 单按钮抽取（由设置决定 AI/预设） ══════════
  const doGenerate = useCallback(async () => {
    const { aiTalentGeneration } = useSettingsStore.getState()

    abortRef.current = false
    completionScheduledRef.current = false
    confirmationRef.current = false
    setIsConfirming(false)
    setPhase('generating')
    setErrorMsg('')
    setSelectedUiSlots(createSelectedUiSlots([]))
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current)
      completionTimerRef.current = null
    }

    if (!aiTalentGeneration) {
      // 预设模式
      const patterns = uniquePatternsByIdentity(getDestinyPatternSystem().generateFromPresets(100))
      fullPoolRef.current = patterns
      useCharacterStore.getState().setDestinyPatterns({ candidates: patterns })
      setSlots(drawSlotsFromPool(patterns))
      setLocalPoolSize(patterns.length)
      setStreamCount(DESTINY_PATTERN_DISPLAY_COUNT)
      completeFullDraw(patterns)
      return
    }

    // AI 模式
    const initialPatterns = loadCachedPool()
    setStreamCount(Math.min(initialPatterns.length, DESTINY_PATTERN_DISPLAY_COUNT))
    setSlots(revealSlotsInOrder(initialPatterns))
    fullPoolRef.current = initialPatterns
    if (initialPatterns.length >= DESTINY_PATTERN_DISPLAY_COUNT) {
      completeFullDraw(initialPatterns)
      return
    }

    const worldConfig = useWorldStore.getState().worldConfig
    if (!worldConfig) {
      setErrorMsg('世界配置未就绪，请返回选择世界')
      setPhase('idle')
      return
    }

    configureDestinyPatternAIService()

    const revealPatterns = (patterns: DestinyPattern[], persist = true): void => {
      const visiblePatterns = uniquePatternsByIdentity(patterns)
      if (abortRef.current || visiblePatterns.length === 0) return
      fullPoolRef.current = visiblePatterns
      if (persist) saveCachedPool(visiblePatterns)
      useCharacterStore.getState().setDestinyPatterns({ candidates: visiblePatterns })
      setStreamCount(Math.min(visiblePatterns.length, DESTINY_PATTERN_DISPLAY_COUNT))
      setLocalPoolSize(visiblePatterns.length)
      setSlots(revealSlotsInOrder(visiblePatterns))
      completeFullDraw(visiblePatterns)
    }

    try {
      const result = await getDestinyPatternSystem().generateWithAI(
        buildDestinyPatternContext(),
        (_count, patterns) => {
          if (abortRef.current) return
          const uniquePatterns = uniquePatternsByIdentity(patterns)
          revealPatterns(uniquePatterns)
        },
        (patterns) => {
          revealPatterns(patterns)
        },
        undefined,
        { initialPatterns },
      )

      if (result.length > 0) {
        const uniqueResult = uniquePatternsByIdentity(result)
        revealPatterns(uniqueResult)
      }
    } catch (error) {
      if (!completionScheduledRef.current) {
        if (isAiCredentialError(error)) {
          const hasPlayerKey = Boolean(useSettingsStore.getState().customKey.trim())
          setErrorMsg(hasPlayerKey
            ? '当前自定义 API Key 无效或权限不足。请在设置中清空 Key 并恢复免费默认配置，或更换有效 Key 后重试。'
            : '服务器免费体验通道鉴权失败，已停止重复请求。请稍后重试；若仍失败，请反馈给维护者。')
        } else {
          setErrorMsg('AI 命格生成失败，请检查网络后重试')
        }
        setPhase('idle')
      }
    }
  }, [completeFullDraw])

  const handleEnterSelection = useCallback(() => {
    if (slots.filter(Boolean).length < DESTINY_PATTERN_DISPLAY_COUNT) return
    setPhase('selecting')
  }, [slots])

  // ══════════ 槽位交互 ══════════
  const handleSlotClick = useCallback((idx: number) => {
    if (selectedSlotIndices.includes(idx)) {
      const pattern = slots[idx]
      if (pattern) notify(`${pattern.name}已在星契中`)
      return
    }
    const targetSlot = selectedUiSlots.findIndex((index) => index === null)
    if (targetSlot < 0) {
      notify('三个普通命格槽已满')
      return
    }
    setSelectedUiSlots((current) => current.map((value, index) => index === targetSlot ? idx : value))
  }, [notify, selectedSlotIndices, selectedUiSlots, slots])

  const handleCandidateClick = useCallback((index: number) => {
    if (!slots[index] || selectedSlotIndices.includes(index)) return
    handleSlotClick(index)
  }, [handleSlotClick, selectedSlotIndices, slots])

  const handleDeselect = useCallback((uiSlotIndex: number) => {
    const patternIndex = selectedUiSlots[uiSlotIndex]
    const pattern = patternIndex === null ? null : slots[patternIndex]
    if (patternIndex === null || !pattern) return
    setSelectedUiSlots((current) => current.map((value, index) => index === uiSlotIndex ? null : value))
    notify(`已移除${pattern.name}`)
  }, [notify, selectedUiSlots, slots])

  const handleToggleMythic = useCallback((pattern: MythicPattern | null) => {
    if (!pattern) {
      setEquippedMythicPatterns([])
      setLibraryOpen(false)
      notify('已清空轮回天赋槽')
      return
    }

    const current = equippedMythicPatterns
    const existingIndex = current.findIndex((item) => item.id === pattern.id)
    if (existingIndex >= 0) {
      setEquippedMythicPatterns(current.filter((_, index) => index !== existingIndex))
      notify(`已移除${pattern.name}`)
      return
    }
    if (current.length >= MYTHIC_PATTERN_SELECT_COUNT) {
      notify(`最多携带 ${MYTHIC_PATTERN_SELECT_COUNT} 项轮回天赋`)
      return
    }
    const insertionIndex = Math.min(activeMythicSlot, current.length)
    setEquippedMythicPatterns([
      ...current.slice(0, insertionIndex),
      pattern,
      ...current.slice(insertionIndex),
    ])
    setLibraryOpen(false)
    notify(`轮回天赋 · ${pattern.name}`)
  }, [activeMythicSlot, equippedMythicPatterns, notify, setEquippedMythicPatterns])

  const handleOpenMythicSlot = useCallback((slotIndex: number) => {
    setActiveMythicSlot(slotIndex)
    setLibraryOpen(true)
  }, [])

  // ══════════ 确认选择 → 跳转 ══════════
  const handleConfirm = useCallback(() => {
    if (confirmationRef.current || selectedData.length !== DESTINY_PATTERN_SELECT_COUNT) return

    confirmationRef.current = true
    setIsConfirming(true)
    setErrorMsg('')

    try {
      const destinySystem = getDestinyPatternSystem()

      const selectedIds = selectedSlotIndices
        .map((i) => slots[i])
        .filter((p): p is DestinyPattern => p !== null)
        .map((p) => p.id)

      const poolById = new Map<string, DestinyPattern>()
      for (const p of fullPoolRef.current) poolById.set(p.id, p)
      for (const p of slots) {
        if (p) poolById.set(p.id, p)
      }
      const committedPool = [...poolById.values()]
      destinySystem.selectPatterns(selectedIds, committedPool)

      const selectedPatterns = destinySystem.getPatterns()
      useWorldStore.getState().setDestinyPatternModifiers(
        aggregatePatternSystemModifiers(selectedPatterns),
      )

      const store = useCharacterStore.getState()
      store.setDestinyPatterns({
        candidates: committedPool,
        patterns: selectedPatterns,
        rarityCount: destinySystem.getRarityCount(),
      })
      if (useCharacterStore.getState().destinyPatterns.patterns.length !== DESTINY_PATTERN_SELECT_COUNT) {
        throw new Error('命格状态提交失败，请重试')
      }

      // 保留 selecting 持久化，以便从命运预览返回时恢复选取界面。
      persistTdState({
        phase: 'selecting',
        slots,
        selectedSlotIndices,
        aiTalentGeneration: useSettingsStore.getState().aiTalentGeneration,
      })

      abortRef.current = true
      router.push('/attribute-alloc')
      navigationFallbackTimerRef.current = window.setTimeout(() => {
        navigationFallbackTimerRef.current = null
        const stillOnTalentFlow = window.location.pathname.endsWith('/talent-draw')
          || window.location.pathname.endsWith('/mythic-inheritance')
        if (!stillOnTalentFlow) return
        if (useCharacterStore.getState().destinyPatterns.patterns.length === DESTINY_PATTERN_SELECT_COUNT) {
          window.location.assign('/attribute-alloc')
          return
        }
        abortRef.current = false
        confirmationRef.current = false
        setIsConfirming(false)
        setErrorMsg('命格状态未能保存，请重新确认')
      }, 450)
    } catch (err) {
      if (navigationFallbackTimerRef.current !== null) {
        window.clearTimeout(navigationFallbackTimerRef.current)
        navigationFallbackTimerRef.current = null
      }
      abortRef.current = false
      confirmationRef.current = false
      setIsConfirming(false)
      setErrorMsg(err instanceof Error ? err.message : '选择无效，请重试')
    }
  }, [selectedData, selectedSlotIndices, slots, router])

  // ══════════ 重新抽取（从未选槽位逐槽从本地池重抽） ══════════
  const handleRedraw = useCallback(() => {
    const { aiTalentGeneration } = useSettingsStore.getState()
    const cached = aiTalentGeneration ? loadCachedPool() : []
    const pool = cached.length > 0 ? cached : fullPoolRef.current
    if (pool.length < DESTINY_PATTERN_DISPLAY_COUNT) return

    setIsRegenerating(true)
    const newSlots = [...slots]
    const currentSelected = [...selectedSlotIndices]

    // 仅锁定已选槽位 ID；未选槽先清空再重抽，避免小池子下 usedIds 过早耗尽
    const usedIds = new Set<string>()
    const usedNames = new Set<string>()
    for (const idx of currentSelected) {
      const s = newSlots[idx]
      if (!s) continue
      usedIds.add(s.id)
      usedNames.add(patternNameKey(s))
    }

    for (let i = 0; i < DESTINY_PATTERN_DISPLAY_COUNT; i++) {
      if (!currentSelected.includes(i)) {
        newSlots[i] = null
        const available = pool.filter((p) => (
          !usedIds.has(p.id) && !usedNames.has(patternNameKey(p))
        ))
        if (available.length === 0) continue
        const pick = available[Math.floor(Math.random() * available.length)]
        usedIds.add(pick.id)
        usedNames.add(patternNameKey(pick))
        newSlots[i] = pick
      }
    }

    setSlots(newSlots)
    notify(currentSelected.length > 0
      ? `已保留${currentSelected.length}条星契，重新抽取其余命格`
      : '十二条普通命格已重新抽取')
    window.requestAnimationFrame(() => setIsRegenerating(false))
  }, [notify, slots, selectedSlotIndices])

  const reDrawDisabled = isRegenerating || localPoolSize <= DESTINY_PATTERN_DISPLAY_COUNT

  // ══════════ 返回阶段 ══════════
  const handleBack = useCallback(() => {
    if (phase === 'selecting') {
      setLibraryOpen(false)
      setPhase('ready')
      return
    }
    abortRef.current = true
    router.push('/new-game/character-create')
  }, [phase, router])

  const footerDisabled = isConfirming
    || phase === 'generating'
    || (phase === 'ready' && slots.filter(Boolean).length < DESTINY_PATTERN_DISPLAY_COUNT)
    || (phase === 'selecting' && selectedData.length !== DESTINY_PATTERN_SELECT_COUNT)
  const footerTitle = isConfirming
    ? '正在确认'
    : phase === 'idle'
    ? '开始抽取'
    : phase === 'generating'
      ? '正在生成'
      : phase === 'ready'
        ? '进入命格选择'
        : '确认命格'
  const footerCopy = isConfirming
    ? '正在进入属性分配'
    : phase === 'idle'
    ? '十二道命印 · 准备就绪'
    : phase === 'generating'
      ? latestStreamPattern
        ? `已完成 ${displayStreamCount} / ${DESTINY_PATTERN_DISPLAY_COUNT} · ${latestStreamPattern.name}`
        : `已完成 0 / ${DESTINY_PATTERN_DISPLAY_COUNT} · 正在连接命盘`
      : phase === 'ready'
        ? '十二道命印已归位'
        : selectedData.length === DESTINY_PATTERN_SELECT_COUNT
          ? '三条普通命格已选择 · 进入属性分配'
          : `还需选择 ${DESTINY_PATTERN_SELECT_COUNT - selectedData.length} 条普通命格`

  const handleFooterAction = () => {
    if (phase === 'idle') void doGenerate()
    else if (phase === 'ready') handleEnterSelection()
    else if (phase === 'selecting') handleConfirm()
  }

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <PageErrorBoundary message="命格抽取页面出现错误">
      <div className="final-flow-frame">
        <div className="final-flow-design-fit">
          <div className="final-flow-design-canvas">
            <main className={styles.page} data-phase={phase}>
            <article className={styles.book} aria-labelledby="talent-page-title">
          <div className={cn(styles.screen, phase !== 'selecting' && styles.screenDraw, 'final-flow-page-surface')}>
            <header className={styles.header}>
              <div className={styles.meta} aria-hidden="true">
                <span>AI LIFE SIM · 命书</span>
                <span>{phase === 'selecting' ? '05' : '04'} / 08</span>
              </div>
              <div className={styles.titleRow}>
                <div className={styles.titleCopy}>
                  <h1 id="talent-page-title">{phase === 'selecting' ? '选择命格' : '命格抽取'}</h1>
                  <p>{phase === 'selecting'
                    ? `从十二个候选中选满三条，可携带 ${MYTHIC_PATTERN_SELECT_COUNT} 项轮回天赋。`
                    : '十二条候选准备完成后，进入命格选择。'}</p>
                </div>
              </div>
            </header>

            {phase !== 'selecting' ? (
              <section className={cn(styles.drawStage, phase === 'generating' && styles.drawStageDrawing, phase === 'ready' && styles.drawStageComplete)} aria-busy={phase === 'generating'}>
                <div className={styles.aura} aria-hidden="true">
                  {Array.from({ length: 6 }, (_, index) => (
                    <i
                      key={index}
                      className={styles.wave}
                      style={{ animationDelay: `${index * (phase === 'ready' ? 1.4 : 0.8)}s` }}
                    />
                  ))}
                  <div className={styles.sun}>
                    <i className={styles.layerFive} />
                    <i className={styles.layerFour} />
                    <i className={styles.layerThree} />
                    <i className={styles.layerTwo} />
                    <i className={styles.layerOne} />
                    <b>命</b>
                  </div>
                </div>
                <div className={styles.ritualCopy}>
                  <strong>{phase === 'idle' ? '让命运揭示你的命格' : phase === 'generating' ? '命格正在归位' : '十二道命印已归位'}</strong>
                  <p>{phase === 'idle'
                    ? '准备就绪后开始抽取，十二条命格会依次归位。'
                    : phase === 'generating'
                      ? generationMessage
                      : '十二道命印已全部归位。'}</p>
                </div>
                <div className={styles.sealWrap}>
                  <div className={styles.sealHead}><span>十二道命印</span><span>{displayStreamCount} / {DESTINY_PATTERN_DISPLAY_COUNT}</span></div>
                  <div className={styles.seals} aria-label="十二道命印">
                    {slots.map((pattern, index) => (
                      <span key={pattern?.id ?? `seal-${index}`} className={cn(styles.seal, pattern && styles.sealLit)} data-rarity={pattern ? DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity].label : undefined}>
                        <i>{String(index + 1).padStart(2, '0')}</i>
                        <b>{pattern ? DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity].label : '待定'}</b>
                      </span>
                    ))}
                  </div>
                </div>
                {errorMsg ? <p className={styles.validationMsg} role="alert">{errorMsg}</p> : null}
              </section>
            ) : (
              <section className={styles.selectionView} aria-label="命格选择">
                <div className={styles.rebirthHeading}><span>轮回 · 可选</span><span>{equippedMythicPatterns.length} / {MYTHIC_PATTERN_SELECT_COUNT}</span></div>
                <div className={styles.rebirthSlots} aria-label="已选择的轮回天赋">
                  {Array.from({ length: MYTHIC_PATTERN_SELECT_COUNT }, (_, slotIndex) => {
                    const pattern = equippedMythicPatterns[slotIndex]
                    return (
                      <button
                        type="button"
                        key={`rebirth-slot-${slotIndex}`}
                        ref={slotIndex === activeMythicSlot ? libraryTriggerRef : undefined}
                        className={cn(styles.rebirthSlot, pattern && styles.rebirthSlotFilled)}
                        onClick={() => pattern ? handleToggleMythic(pattern) : handleOpenMythicSlot(slotIndex)}
                        aria-label={pattern ? `移除轮回天赋：${pattern.name}` : `轮回天赋槽${slotIndex + 1}，打开天赋库`}
                      >
                        <strong>{pattern?.name ?? '+'}</strong>
                      </button>
                    )
                  })}
                </div>
                <div className={styles.slotHeading}><span>普通命格</span><span>{selectedData.length} / {DESTINY_PATTERN_SELECT_COUNT}</span></div>
                <div className={styles.selectedSlots} aria-label="已选普通命格">
                  {selectedUiSlots.map((patternIndex, uiSlotIndex) => {
                    const pattern = patternIndex === null ? null : slots[patternIndex]
                    const rarityLabel = pattern ? DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity].label : undefined
                    return (
                      <button
                        type="button"
                        key={`selected-ui-slot-${uiSlotIndex}`}
                        className={cn(styles.selectedSlot, pattern && styles.selectedSlotFilled)}
                        data-rarity={rarityLabel}
                        onClick={() => handleDeselect(uiSlotIndex)}
                        aria-label={pattern ? `移除普通命格：${pattern.name}` : `普通命格槽${uiSlotIndex + 1}，空`}
                      >
                        <strong>{pattern?.name ?? '+'}</strong>
                      </button>
                    )
                  })}
                </div>
                <div className={styles.candidateHead}>
                  <strong>普通命格候选 <small>{slots.filter(Boolean).length} / {DESTINY_PATTERN_DISPLAY_COUNT} 条</small></strong>
                  <button type="button" className={styles.reroll} onClick={handleRedraw} disabled={reDrawDisabled} aria-label="重新抽取未选择的普通命格">
                    <FlowIcon name="shuffle" /><span>{isRegenerating ? '刷新中…' : '重抽未选'}</span>
                  </button>
                </div>
                <div className={styles.candidateList} aria-label="普通命格候选">
                  {slots.map((pattern, index) => {
                    const selected = selectedSlotIndices.includes(index)
                    const rarity = pattern ? DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity].label : undefined
                    const systemEffects = pattern ? formatPatternSystemModifiersForDisplay(pattern.systemModifiers).map((item) => item.display) : []
                    return (
                      <button
                        type="button"
                        key={pattern?.id ?? `candidate-pending-${index}`}
                        className={cn(styles.candidateCard, selected && styles.candidateCardSelected, !pattern && styles.candidateCardPending)}
                        data-rarity={rarity}
                        disabled={!pattern}
                        onClick={() => handleCandidateClick(index)}
                        aria-pressed={selected}
                        aria-label={pattern ? `${pattern.name}${selected ? '，已选择' : '，选择普通命格'}` : `普通命格候选 ${index + 1} 正在生成`}
                      >
                        {pattern ? (
                          <>
                            <span className={styles.candidateCopy}>
                              <strong>{pattern.name}</strong>
                              <span>{pattern.description}</span>
                              {pattern.effect ? <i>{pattern.effect}</i> : null}
                            </span>
                            <small className={styles.candidateRarity}>{rarity}</small>
                            <span className={styles.candidateEffects}>
                              {formatPatternAttrSummary(pattern) !== '无属性加成' ? <i>{formatPatternAttrSummary(pattern)}</i> : null}
                              {systemEffects.map((effect) => <i key={effect} className={styles.systemEffect}>{effect}</i>)}
                            </span>
                          </>
                        ) : <span className={styles.candidatePendingCopy}>候选 {String(index + 1).padStart(2, '0')} · 后台生成中</span>}
                      </button>
                    )
                  })}
                </div>
                {errorMsg ? <p className={styles.validationMsg} role="alert">{errorMsg}</p> : null}
              </section>
            )}
          </div>

          {libraryOpen ? (
            <section id="mythic-library-sheet" ref={librarySheetRef} className={styles.librarySheet} role="dialog" aria-modal="true" aria-labelledby="mythic-library-title">
              <button className={styles.libraryBackdrop} type="button" onClick={() => setLibraryOpen(false)} aria-label="关闭轮回天赋选择" />
              <div className={styles.libraryPanel}>
                <header className={styles.libraryHead}>
                  <div><small>轮回天赋</small><strong id="mythic-library-title">选择轮回 {String(activeMythicSlot + 1).padStart(2, '0')}</strong></div>
                  <button ref={libraryCloseRef} type="button" onClick={() => setLibraryOpen(false)} aria-label="关闭轮回天赋库"><FlowIcon name="close" /></button>
                </header>
                <div className={styles.libraryList}>
                  <button type="button" className={`${styles.libraryItem} ${equippedMythicPatterns.length === 0 ? styles.libraryItemActive : ''}`} onClick={() => handleToggleMythic(null)} aria-pressed={equippedMythicPatterns.length === 0}>
                    <strong>清空轮回槽</strong><span>轮回天赋独立于三个普通命格，可留空。</span>
                  </button>
                  {mythicLibrary.map((pattern) => (
                    <button type="button" key={pattern.id} className={`${styles.libraryItem} ${equippedMythicPatterns.some((item) => item.id === pattern.id) ? styles.libraryItemActive : ''}`} onClick={() => handleToggleMythic(pattern)} aria-pressed={equippedMythicPatterns.some((item) => item.id === pattern.id)}>
                      <strong>{pattern.name}</strong><span>{pattern.effect || pattern.concept}</span>
                    </button>
                  ))}
                  {mythicLibrary.length === 0 ? <p className={styles.libraryEmpty}>尚未在人生结算中封存轮回天赋。</p> : null}
                </div>
              </div>
            </section>
          ) : null}

          <BottomActionBar
            onBack={handleBack}
            backTitle={phase === 'selecting' ? '返回命格抽取' : '返回角色创建'}
            backDisabled={isConfirming}
            onConfirm={handleFooterAction}
            confirmNumber={phase === 'selecting' ? '06' : '05'}
            confirmText={footerTitle}
            confirmDescription={footerCopy}
            confirmDisabled={footerDisabled}
          />
          <div className={cn(styles.toast, toastMessage && styles.toastVisible)} role="status" aria-live="polite">{toastMessage}</div>
            </article>
            </main>
          </div>
        </div>
      </div>
    </PageErrorBoundary>
  )
}

export default function TalentDrawPage() {
  const router = useRouter()
  const storesHydrated = useCreationStoresHydrated()
  const worldConfig = useWorldStore((state) => state.worldConfig)
  const worldCode = useWorldStore((state) => state.worldCode)
  const worldInitialized = useWorldStore((state) => state.initialized)
  const characterName = useCharacterStore((state) => state.name)
  const hasWorld = Boolean(worldConfig && worldCode > 0 && worldInitialized)
  const hasCharacter = Boolean(characterName.trim())

  useEffect(() => {
    if (!storesHydrated) return
    if (!hasWorld) router.replace('/new-game/world-select')
    else if (!hasCharacter) router.replace('/new-game/character-create')
  }, [hasCharacter, hasWorld, router, storesHydrated])

  if (!storesHydrated || !hasWorld || !hasCharacter) return null
  return <TalentDrawContent />
}
