/**
 * @module talent-draw-page
 * @description 命格抽取页面 —— 对齐废弃项目 talent-draw UI 风格
 *   - 单按钮 + 设置控制 AI/预设
 *   - 缓存池 >= 90 条自动跳过按钮进入选取
 *   - 真实进度追踪（onProgress 回调）
 *   - 抽12选3 → 确认 → /attribute-alloc
 * @mod mod-pages
 */

'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'

import {
  useCharacterStore,
  DESTINY_PATTERN_RARITY_CONFIG,
  DESTINY_PATTERN_POLARITY_CONFIG,
  DESTINY_PATTERN_SELECT_COUNT,
  DEFAULT_DESTINY_PATTERN_COUNT,
  DESTINY_PATTERN_FAST_DRAW_THRESHOLD,
  aggregatePatternSystemModifiers,
  formatPatternSystemModifiersForDisplay,
  ATTRIBUTE_NAMES,
} from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'
import { useSettingsStore } from '@/mods/mod-settings'
import { BottomActionBar, PageScroll } from '@/mods/mod-ui'
import { PageErrorBoundary } from '@/mods/mod-ui'
import { cn } from '@/foundation/utils'
import { configStore } from '@/core'
import { getDestinyPatternSystem, loadDestinyPatternPool, saveDestinyPatternPool } from '@/mods/mod-character/destiny-pattern-access'

import type { AIModelConfig } from '@/foundation'


import type { DestinyPattern, DestinyPatternRarity } from '@/mods/mod-character'

import styles from './TalentDraw.module.css'

type PagePhase = 'idle' | 'generating' | 'selecting'

const SLOT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/** 极性 → 颜色映射 */
const POLARITY_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(DESTINY_PATTERN_POLARITY_CONFIG).map(([k, v]) => [k, v.color]),
)

const ATTR_BONUS_KEYS = ['physique', 'mind', 'talentAptitude', 'charisma', 'resources'] as const

/** 命格卡片：效果概括（模拟向定性描述，与 attrBonus 并存） */
function PatternEffect({ pattern }: { pattern: DestinyPattern }) {
  const text = pattern.effect?.trim()
  if (!text) return null
  return <p className={styles.slotEffect}>{text}</p>
}

/** 命格卡片：基础属性加成 */
function PatternAttrBonus({ pattern }: { pattern: DestinyPattern }) {
  if (!pattern.attrBonus) return null
  const tags = ATTR_BONUS_KEYS
    .map((k) => {
      const v = pattern.attrBonus?.[k as keyof typeof pattern.attrBonus]
      if (typeof v !== 'number' || v === 0) return null
      return `${ATTRIBUTE_NAMES[k] ?? k} ${v > 0 ? '+' : ''}${v}`
    })
    .filter((t): t is string => t !== null)
  if (tags.length === 0) return null
  return (
    <div className={styles.slotAttrBonus}>
      {tags.map((t) => (
        <span key={t} className={styles.slotAttrBonusTag}>{t}</span>
      ))}
    </div>
  )
}

/** 命格卡片底部：模拟系统加成 */
function PatternSystemModifiers({ pattern }: { pattern: DestinyPattern }) {
  const lines = formatPatternSystemModifiersForDisplay(pattern.systemModifiers)
  if (lines.length === 0) return null
  return (
    <div className={styles.slotModifiers}>
      {lines.map((line) => (
        <span key={line} className={styles.slotModifierTag}>{line}</span>
      ))}
    </div>
  )
}

// ══════════════════════════════════════════════════════
// 加载文案（5阶段 × ~18条，对齐废弃项目 talent-draw-messages.ts）
// ══════════════════════════════════════════════════════

const LOADING_PHASES = [
  [
    '正在寻找最快的API节点...',
    '正在搜索附近的命运服务器...',
    '呼叫总部，请求命格扫描支援...',
    '正在校准量子纠缠通信模块...',
    '正在向命运织布机发送请求...',
    '正在翻阅《命运大百科》第42卷...',
    '正在唤醒沉睡的占卜精灵...',
    '正在点亮水晶球，准备占卜...',
    '命运织布机正在穿针引线...',
    '正在打开传送门，连接异世界...',
    '正在与命运服务器进行三次握手...',
    '正在检测最佳路由路径...',
    'SSL/TLS 证书验证通过，安全链路已就绪...',
    '正在向云端的预言机发起连接请求...',
    'DNS解析完成，正在跳转命运主机...',
    '正在通过六道防火墙的层层审查...',
    '安全令牌验证中，请稍候...',
    '与命运节点的Ping值仅为12ms，连接优秀！',
  ],
  [
    '节点已找到，开始建立TLS加密链路',
    '链路构建中，协商加密参数',
    '链路构建完成，准备发送请求',
    '正在序列化你的输入数据',
    '正在把你的信息打包成命运卷轴...',
    '命运女神正在审阅你的档案...',
    '正在根据你的命盘推演命格...',
    '你的天命正在被一群AI猫头鹰分类中...',
    '数据压缩完成，压缩比高达99.9%...',
    '正在对输入数据进行量子编码...',
    '已开启端到端加密，任何人都无法窃听...',
    'HTTP/3 协议加速中，延迟再降低30%...',
    '正在构建GraphQL查询语句...',
    '请求头已设置，Authorization: Bearer ****...',
    '数据分片完成，共16个分片，并行发送中...',
    '已发送第1批数据包，等待ACK确认...',
    '所有数据包已确认接收，传输零丢包！',
    '正在用摩斯密码复核关键参数...',
  ],
  [
    '模型机房已确认，排队处理中',
    '大模型唤醒，加载你的会话上下文',
    '推理引擎预热，开始生成第一个token',
    '生成中：已经写了 30% ...',
    '正在组织更流畅的表达方式',
    'GPU集群已全部启动，算力拉满...',
    '正在加载角色与世界设定的向量表示...',
    '注意力机制正在扫描你的命运参数...',
    'Transformer层数：96层，参数量：1.8万亿...',
    '温度参数调至0.8，创意与精准兼得...',
    'Top-P采样中，正在筛选最优命格组合...',
    '模型正在进行自回归推理，每步都深思熟虑...',
    '正在进行Beam Search，保留前5条最优路径...',
    '生成速度：每秒128个token，性能强劲...',
    '已生成的内容正在经过RLHF偏好对齐...',
    '模型正在反复推敲命格的合理性与趣味性...',
    '激活函数 ReLU 正在高速运转...',
    '嵌入层正在计算命格与角色间的匹配度...',
  ],
  [
    '生成完毕，开始封装返回数据',
    '数据正在回传，校验完整性',
    '快要成功了，最后一步处理',
    '马上展示结果，请稍等',
    '命运邮件已经寄出，正在派送中...',
    '命格数据正在穿越互联网的大洋...',
    '数据包正在经历九九八十一道校验...',
    '正在对生成结果进行最终美化...',
    '就快好了，深呼吸，准备迎接你的命格吧...',
    '命运之门正在缓缓开启...',
    '最后一层封印即将解除...',
    '等待总是值得的，就像等待流星...',
    '正在召唤幸运女神进行最后加持...',
    '正在确认命格没有被调包...',
    'JSON解析完成，数据结构完整无损...',
    '正在对命格进行最终的去重与排序...',
    'CRC32校验通过，数据完整性100%...',
    '正在将结果渲染为漂亮的卡片样式...',
  ],
  [
    '服务器小哥正在泡咖啡，稍等一下...',
    '客服小精灵说：您的请求正在处理中~',
    '好饭不怕晚，好命格需要耐心...',
    '正在拉取你的前世今生命运线...',
    '一只程序猿正在键盘上疯狂敲打...（开玩笑的，AI在工作）',
    '我们调用了9999个GPU核心，只为让你满意...',
    '量子计算机说：你这命运有点复杂啊...',
    '命运织布机卡线了，正在用牙签捅一捅...',
    '正在询问塔罗牌和易经八卦的一致性...',
    '服务器说：稍等，我喝口水再继续...',
    '你的命运太精彩了，AI都忍不住多看几遍...',
    '占卜精灵打了个喷嚏，我们正在给它递纸巾...',
    '命运线程打结了，织女正在耐心解开...',
    '命格太好，系统正在犹豫要不要藏几个...',
    '一只蝴蝶在服务器机房扇动翅膀，轻微延迟...',
    '你的命格包正在经历宇宙射线的洗礼...',
    '最后一个命格卡在传送带上，正在踹它一脚...',
    '月老路过，顺路帮你检查了一下缘分参数...',
    '太上老君正在炼丹炉旁审核你的命格...',
    '天机不可泄露太多，AI正在帮你打码...',
  ],
]

function pickMessage(phases: string[][], elapsedSec: number): string {
  const phaseIdx = Math.min(Math.floor(elapsedSec / 9), phases.length - 1)
  const pool = phases[phaseIdx]
  return pool[Math.floor(Math.random() * pool.length)]
}

// ══════════════════════════════════════════════════════
// 缓存（按世界编码隔离，见 destiny-pattern-pool-cache）
// ══════════════════════════════════════════════════════

function loadCachedPool(): DestinyPattern[] {
  return loadDestinyPatternPool(useWorldStore.getState().worldCode)
}

function saveCachedPool(patterns: DestinyPattern[]): void {
  saveDestinyPatternPool(useWorldStore.getState().worldCode, patterns)
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

  if (saved?.phase === 'selecting' && saved.slots?.length === 12) {
    // 若 AI 开关已变更，旧 session 不再有效，跳过恢复
    if (saved.aiTalentGeneration !== aiTalentGeneration) {
      // 回退到 idle，由用户重新点击按钮触发对应模式
      return {
        phase: 'idle',
        slots: Array(12).fill(null),
        selectedSlotIndices: [],
        localPoolSize: cached.length,
        pool: cached,
      }
    }
    return {
      phase: 'selecting',
      slots: saved.slots,
      selectedSlotIndices: saved.selectedSlotIndices ?? [],
      localPoolSize: Math.max(cached.length, saved.slots.filter(Boolean).length),
      pool: cached.length > 0 ? cached : saved.slots.filter((p): p is DestinyPattern => p !== null),
    }
  }

  if (cached.length >= DESTINY_PATTERN_FAST_DRAW_THRESHOLD) {
    const shuffled = [...cached].sort(() => Math.random() - 0.5)
    const drawn = shuffled.slice(0, DEFAULT_DESTINY_PATTERN_COUNT)
    const newSlots: (DestinyPattern | null)[] = Array(12).fill(null)
    drawn.forEach((p, i) => { newSlots[i] = p })
    useCharacterStore.getState().setDestinyPatterns({ candidates: cached })
    return {
      phase: 'selecting',
      slots: newSlots,
      selectedSlotIndices: [],
      localPoolSize: cached.length,
      pool: cached,
    }
  }

  return {
    phase: normalizeSavedPhase(saved?.phase),
    slots: saved?.slots?.length === 12 ? saved.slots : Array(12).fill(null),
    selectedSlotIndices: saved?.selectedSlotIndices ?? [],
    localPoolSize: cached.length,
    pool: cached,
  }
}

export default function TalentDrawPage() {
  const router = useRouter()

  const [initialDraw] = useState(() => resolveInitialTalentDrawState())

  const [phase, setPhase] = useState<PagePhase>(initialDraw.phase)
  const [slots, setSlots] = useState<(DestinyPattern | null)[]>(initialDraw.slots)
  const [selectedSlotIndices, setSelectedSlotIndices] = useState<number[]>(initialDraw.selectedSlotIndices)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isTimedOut, setIsTimedOut] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [streamCount, setStreamCount] = useState(0)
  const [generatingBatch, setGeneratingBatch] = useState(-1)
  const [loadingMessage, setLoadingMessage] = useState(LOADING_PHASES[0][0])
  const [localPoolSize, setLocalPoolSize] = useState(initialDraw.localPoolSize)
  const [errorMsg, setErrorMsg] = useState('')

  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const msgTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const fullPoolRef = useRef<DestinyPattern[]>(initialDraw.pool)
  const abortRef = useRef(false)

  // 持久化选取状态（phase / slots / selectedSlotIndices）
  useEffect(() => {
    if (phase !== 'generating') {
      const { aiTalentGeneration } = useSettingsStore.getState()
      persistTdState({ phase, slots, selectedSlotIndices, aiTalentGeneration })
    }
  }, [phase, slots, selectedSlotIndices])

  // ══════════ 组件卸载时中止 AI 调用 ══════════
  useEffect(() => {
    return () => {
      abortRef.current = true
      getDestinyPatternSystem().abortPoolFill()
    }
  }, [])

  // ══════════ 已选数据 ══════════
  const selectedData = useMemo(
    () => selectedSlotIndices.map((i) => slots[i]).filter((p): p is DestinyPattern => p !== null),
    [slots, selectedSlotIndices],
  )

  const isFull = selectedData.length >= DESTINY_PATTERN_SELECT_COUNT

  // ══════════ 进度文案（早进选取阈值 = DEFAULT_DESTINY_PATTERN_COUNT = 12） ══════════
  const progressTarget = DEFAULT_DESTINY_PATTERN_COUNT
  const displayStreamCount = Math.min(streamCount, progressTarget)

  const progressText = streamCount > 0
    ? `${displayStreamCount}/${progressTarget}`
    : generatingBatch >= 0
      ? `第 ${generatingBatch + 1} 批请求中...`
      : '等待 AI 响应...'

  const progressPercent = useMemo(
    () => Math.min((displayStreamCount / progressTarget) * 100, 100),
    [displayStreamCount, progressTarget],
  )

  const formatElapsed = (sec: number) => {
    const s = Math.floor(sec)
    const m = Math.floor(s / 60)
    const rs = s % 60
    return `${m}:${String(rs).padStart(2, '0')}`
  }

  // ══════════ 挂载时恢复命格库 + 定时同步池大小 ══════════
  useEffect(() => {
    const syncPoolSize = () => {
      const cached = loadCachedPool()
      const candidates = useCharacterStore.getState().destinyPatterns.candidates
      const best = cached.length >= candidates.length ? cached : candidates
      if (best.length > 0) {
        fullPoolRef.current = best
        setLocalPoolSize(best.length)
      }
    }
    syncPoolSize()
    const iv = setInterval(syncPoolSize, phase === 'selecting' ? 1000 : 3000)
    return () => clearInterval(iv)
  }, [phase])

  // ══════════ 加载文案动画 + 超时 ══════════
  // 注：派生显示值——非 generating 阶段自然归零，避免在 effect 中同步 setState
  const displayElapsed = phase === 'generating' ? elapsedSeconds : 0
  const displayTimedOut = phase === 'generating' ? isTimedOut : false

  useEffect(() => {
    if (phase !== 'generating') return // 离开生成阶段时仅清理 timer，不 setState

    // 计时器：每秒 +1
    const elapsedTimer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)
    elapsedTimerRef.current = elapsedTimer

    // 文案切换：每 2s 根据当前耗时随机选一条
    msgTimerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => {
        setLoadingMessage(pickMessage(LOADING_PHASES, prev))
        return prev
      })
    }, 2000)

    const timeoutTimer = setTimeout(() => setIsTimedOut(true), 60000)

    return () => {
      clearInterval(msgTimerRef.current as ReturnType<typeof setInterval>)
      clearInterval(elapsedTimer)
      clearTimeout(timeoutTimer)
    }
  }, [phase])

  // ══════════ 单按钮抽取（由设置决定 AI/预设） ══════════
  const doGenerate = useCallback(async () => {
    const { aiTalentGeneration } = useSettingsStore.getState()

    if (!aiTalentGeneration) {
      // 预设模式
      const patterns = getDestinyPatternSystem().generateFromPresets(100)
      fullPoolRef.current = patterns
      const shuffled = [...patterns].sort(() => Math.random() - 0.5)
      const drawn = shuffled.slice(0, DEFAULT_DESTINY_PATTERN_COUNT)
      const newSlots: (DestinyPattern | null)[] = Array(12).fill(null)
      drawn.forEach((p, i) => { newSlots[i] = p })
      setSlots(newSlots)
      setSelectedSlotIndices([])
      setPhase('selecting')
      return
    }

    // AI 模式
    setPhase('generating')
    setStreamCount(0)
    setGeneratingBatch(-1)
    setElapsedSeconds(0)
    setIsTimedOut(false)
    setErrorMsg('')
    setSelectedSlotIndices([])
    abortRef.current = false

    const worldConfig = useWorldStore.getState().worldConfig
    if (!worldConfig) {
      setErrorMsg('世界配置未就绪，请返回选择世界')
      return
    }

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
      }
      const useStream = opts?.stream === true
      const {
        provider,
        customKey,
        customUrl,
        customModel,
      } = useSettingsStore.getState()
      const model = customModel || 'deepseek-v4-flash'
      const maxTokens = opts?.maxTokensOverride
        ?? estimateDestinyPatternTokenBudget(systemPrompt.length + userPrompt.length)
      const defaultConfig: AIModelConfig = {
        model,
        temperature: 0.8,
        maxTokens,
        stream: useStream,
        responseFormat: useStream ? undefined : undefined,
        reasoningEffort: 'disabled',
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
        reasoningEffort: 'disabled',
        overrideMaxTokens: maxTokens,
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

      // 120秒总体超时，超时后中止并降级预设池
      const timeoutController = new AbortController()
      const timeoutId = setTimeout(() => timeoutController.abort(), 120_000)
      const signal = opts?.signal ?? timeoutController.signal

      try {
        if (useStream) {
          return await callAIStream(systemPrompt, userPrompt, { ...callOptions, signal })
        }
        return await callAI(systemPrompt, userPrompt, { ...callOptions, signal })
      } finally {
        clearTimeout(timeoutId)
      }
    })

    // ══════════ 10次重试 + 渐进式延迟 ══════════
    const MAX_ATTEMPTS = 10
    let attemptCount = 0
    let earlyReady = false

    const attemptCall = async (): Promise<DestinyPattern[]> => {
      if (abortRef.current) return []
      const firstFailTime = Date.now()

      try {
        const result = await getDestinyPatternSystem().generateWithAI(
          {
            worldConfig: useWorldStore.getState().worldConfig,
            calibration: useWorldStore.getState().calibration,
            worldTags: useWorldStore.getState().worldTags,
            character: {
              name: useCharacterStore.getState().name,
              race: useCharacterStore.getState().race,
              gender: useCharacterStore.getState().gender,
              background: useCharacterStore.getState().background,
              startingAge: useCharacterStore.getState().characterBase?.startingAge ?? 0,
              attributes: useCharacterStore.getState().characterBase?.base as unknown as Record<string, number>,
            },
            existingNames: [],
          },
          (count, patterns) => {
            setStreamCount(count)
            fullPoolRef.current = patterns
            setLocalPoolSize(patterns.length)
            if (patterns.length > 0) {
              saveCachedPool(patterns)
              useCharacterStore.getState().setDestinyPatterns({ candidates: patterns })
            }
          },
          (patterns) => {
            if (earlyReady || abortRef.current) return
            earlyReady = true
            fullPoolRef.current = patterns
            saveCachedPool(patterns)
            setStreamCount(patterns.length)
            setLocalPoolSize(patterns.length)
            setGeneratingBatch(-1)
            if (msgTimerRef.current) clearInterval(msgTimerRef.current)
            const shuffled = [...patterns].sort(() => Math.random() - 0.5)
            const drawn = shuffled.slice(0, DEFAULT_DESTINY_PATTERN_COUNT)
            const newSlots: (DestinyPattern | null)[] = Array(12).fill(null)
            drawn.forEach((p, i) => { newSlots[i] = p })
            setSlots(newSlots)
            setSelectedSlotIndices([])
            setPhase('selecting')
          },
          (batchIndex) => {
            if (!earlyReady) setGeneratingBatch(batchIndex)
          },
        )
        return result
      } catch {
        if (abortRef.current) return []
        attemptCount++
        if (attemptCount >= MAX_ATTEMPTS) throw new Error('max retries exceeded')

        const elapsed = Date.now() - firstFailTime
        let delay: number
        if (elapsed < 1000) delay = 1000
        else if (elapsed < 10000) delay = 10000
        else throw new Error('timeout retry exceeded')

        await new Promise((resolve) => setTimeout(resolve, delay))
        if (!abortRef.current) return attemptCall()
        return []
      }
    }

    try {
      const result = await attemptCall()

      // 兜底：如果 onEarlyReady 没触发
      if (!earlyReady && !abortRef.current) {
        fullPoolRef.current = result
        const shuffled = [...result].sort(() => Math.random() - 0.5)
        const drawn = shuffled.slice(0, DEFAULT_DESTINY_PATTERN_COUNT)
        const newSlots: (DestinyPattern | null)[] = Array(12).fill(null)
        drawn.forEach((p, i) => { newSlots[i] = p })
        setSlots(newSlots)
        setSelectedSlotIndices([])
        setPhase('selecting')
      }

      if (result.length > 0) {
        saveCachedPool(result)
        setLocalPoolSize(result.length)
        setStreamCount(result.length)
      }
    } catch {
      // 全部重试失败，降级预设池
      setErrorMsg('AI 生成失败，已降级使用预设池')
      const fallback = getDestinyPatternSystem().generateFromPresets(100)
      fullPoolRef.current = fallback
      const shuffled = [...fallback].sort(() => Math.random() - 0.5)
      const drawn = shuffled.slice(0, DEFAULT_DESTINY_PATTERN_COUNT)
      const newSlots: (DestinyPattern | null)[] = Array(12).fill(null)
      drawn.forEach((p, i) => { newSlots[i] = p })
      setSlots(newSlots)
      setSelectedSlotIndices([])
      setPhase('selecting')
    }
  }, [])

  // ══════════ 槽位交互 ══════════
  const handleSlotClick = useCallback((idx: number) => {
    if (selectedSlotIndices.length >= DESTINY_PATTERN_SELECT_COUNT) return
    setSelectedSlotIndices((prev) => [...prev, idx])
  }, [selectedSlotIndices])

  const handleDeselect = useCallback((id: string) => {
    setSelectedSlotIndices((prev) => prev.filter((i) => slots[i]?.id !== id))
  }, [slots])

  // ══════════ 确认选择 → 跳转 ══════════
  const handleConfirm = useCallback(() => {
    if (selectedData.length !== DESTINY_PATTERN_SELECT_COUNT) return

    try {
      const selectedIds = selectedSlotIndices
        .map((i) => slots[i])
        .filter((p): p is DestinyPattern => p !== null)
        .map((p) => p.id)

      const poolById = new Map<string, DestinyPattern>()
      for (const p of fullPoolRef.current) poolById.set(p.id, p)
      for (const p of slots) {
        if (p) poolById.set(p.id, p)
      }
      getDestinyPatternSystem().selectPatterns(selectedIds, [...poolById.values()])

      const selectedPatterns = getDestinyPatternSystem().getPatterns()
      useWorldStore.getState().setDestinyPatternModifiers(
        aggregatePatternSystemModifiers(selectedPatterns),
      )

      const store = useCharacterStore.getState()
      store.setDestinyPatterns({
        candidates: fullPoolRef.current,
        patterns: selectedPatterns,
        rarityCount: getDestinyPatternSystem().getRarityCount(),
      })

      // 保留 selecting 持久化，以便从属性分配页返回时恢复选取界面
      router.push('/attribute-alloc')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '选择无效，请重试')
    }
  }, [selectedData, selectedSlotIndices, slots, router])

  // ══════════ 重新抽取（从未选槽位逐槽从本地池重抽） ══════════
  const handleRedraw = useCallback(() => {
    const cached = loadCachedPool()
    const pool = cached.length > 0 ? cached : fullPoolRef.current
    if (pool.length < 5) return

    setIsRegenerating(true)
    const newSlots = [...slots]
    const currentSelected = [...selectedSlotIndices]

    // 仅锁定已选槽位 ID；未选槽先清空再重抽，避免小池子下 usedIds 过早耗尽
    const usedIds = new Set<string>()
    for (const idx of currentSelected) {
      const s = newSlots[idx]
      if (s?.id) usedIds.add(s.id)
    }

    for (let i = 0; i < 12; i++) {
      if (!currentSelected.includes(i)) {
        newSlots[i] = null
        const available = pool.filter((p) => !usedIds.has(p.id))
        if (available.length === 0) continue
        const pick = available[Math.floor(Math.random() * available.length)]
        usedIds.add(pick.id)
        newSlots[i] = pick
      }
    }

    setSlots(newSlots)
    setIsRegenerating(false)
  }, [slots, selectedSlotIndices])

  const reDrawDisabled = isRegenerating || localPoolSize <= DEFAULT_DESTINY_PATTERN_COUNT

  // ══════════ 稀有度光效 ══════════
  const getGlowClass = useCallback((rarity: string) => {
    const rc = DESTINY_PATTERN_RARITY_CONFIG[rarity as DestinyPatternRarity]
    if (!rc) return ''
    return `glow-${rarity}`
  }, [])

  // ══════════ 返回阶段 ══════════
  const handleBack = useCallback(() => {
    router.push('/new-game/character-create')
  }, [router])

  // ============================================================
  // 渲染
  // ============================================================

  return (
    <PageErrorBoundary message="命格抽取页面出现错误">
      <>
      {/* ═══════════════ Idle ═══════════════ */}
      {phase === 'idle' && (
        <div className={styles.initCenter}>
          <div className={styles.initHeader}>
            <div className={styles.initIcon}>✨</div>
            <h2 className={styles.initTitle}>命格抽取</h2>
            <p className={styles.initSubtitle}>命运将为你揭示命格</p>
            <button onClick={doGenerate} className={styles.genBtn}>
              ✓ 抽取命格
            </button>
            <div className={styles.backBtnMargin}>
              <button onClick={handleBack} className={styles.outlineBtn}>← 返回</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ Generating ═══════════════ */}
      {phase === 'generating' && (
        <div className={styles.initCenter}>
          <div className={styles.initHeader}>
            <div className={styles.initIcon}>✨</div>
            <h2 className={styles.initTitle}>命格抽取</h2>
            <p className={styles.initSubtitle}>命运将为你揭示命格</p>
            <div className={styles.loadingBar}>
              <div className={styles.loadingMsgRow}>
                <span className={styles.loadingSpinner146} />
                <span className={styles.loadingMsg}>{loadingMessage}</span>
              </div>
              <div className={styles.progressRow}>
                <span className={styles.loadingSpinner30} />
                <div className={styles.progressTrack}>
                  <div
                    className={cn(
                      styles.progressFill,
                      streamCount > 0 && styles.progressFillActive,
                    )}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <span className={styles.progressText}>{progressText}</span>
                <span className={styles.elapsedText}>{formatElapsed(displayElapsed)}</span>
              </div>
              {displayTimedOut && <div className={styles.timeoutWarn}>网络不佳</div>}
            </div>
            <div className={styles.backBtnMarginLoading}>
              <button onClick={handleBack} className={styles.outlineBtn}>← 返回</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ Selecting ═══════════════ */}
      {phase === 'selecting' && (
        <PageScroll>
          <div className={styles.container}>
            <div className={styles.screenHeader}>
              <div className={styles.headerIcon}>✨</div>
              <h2 className={styles.headerTitle}>命格抽取</h2>
              <p className={styles.headerStats}>
                已选择{' '}
                <span className={isFull ? styles.headerStatsCountFull : styles.headerStatsCount}>
                  {selectedData.length}/{DESTINY_PATTERN_SELECT_COUNT}
                </span>
                <span className={styles.headerStatsPool}> · 命格库：{localPoolSize}条</span>
              </p>
            </div>

            {/* 已选择的命格 */}
            <div className={styles.selectedSection}>
              <h4 className={styles.selectedTitle}>已选择的命格</h4>
              <div className={styles.talentGrid}>
                {Array.from({ length: DESTINY_PATTERN_SELECT_COUNT }).map((_, i) => {
                  const p = selectedData[i]
                  if (p) {
                    const rc = DESTINY_PATTERN_RARITY_CONFIG[p.rarity]
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleDeselect(p.id)}
                        className={cn(getGlowClass(p.rarity), styles.slot, styles.slotAvailable)}
                        style={{
                          border: `2px solid ${rc.color}`,
                          '--glow-delay': `${i * 0.35}s`,
                        } as React.CSSProperties}
                      >
                        <div className={styles.slotHeader}>
                          <span className={styles.slotNum} style={{ color: POLARITY_COLORS[p.polarity] || 'var(--color-text-primary)' }}>
                            {p.name}
                          </span>
                          <span className={styles.slotRarity} style={{ background: `${rc.color}20`, color: rc.color }}>
                            {rc.label}
                          </span>
                        </div>
                        <div className={styles.slotBody}>
                          <p className={cn(styles.slotDesc, styles.slotDescNormal)}>{p.description}</p>
                          <PatternEffect pattern={p} />
                          <PatternAttrBonus pattern={p} />
                          <PatternSystemModifiers pattern={p} />
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={`empty-${i}`} className={cn(styles.slot, styles.slotEmpty, styles.selectedSlotPlaceholder)}>
                      <span className={styles.slotEmptyNum}>?</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 未选命格网格 */}
            <div className={styles.gridSection}>
              <h4 className={styles.gridTitle}>
                未选命格
                {isRegenerating && <span className={styles.regeneratingHint}>刷新中...</span>}
              </h4>
              <div className={cn(styles.talentGrid, isRegenerating && styles.talentGridLoading)}>
                {SLOT_NUMBERS.map((slotNum, idx) => {
                  const pattern = slots[idx]
                  const isSlotSelected = selectedSlotIndices.includes(idx)
                  if (!pattern) {
                    return (
                      <div key={`empty-slot-${idx}`} className={cn(styles.slot, styles.slotEmpty)}>
                        <span className={styles.slotEmptyNum}>#{slotNum}</span>
                      </div>
                    )
                  }
                  const rc = DESTINY_PATTERN_RARITY_CONFIG[pattern.rarity]
                  const canClick = !isSlotSelected && !isFull
                  return (
                    <div
                      key={pattern.id}
                      onClick={() => canClick && handleSlotClick(idx)}
                      className={cn(
                        getGlowClass(pattern.rarity),
                        styles.slot,
                        isSlotSelected ? styles.slotSelected : '',
                        isFull && !isSlotSelected ? styles.slotFull : styles.slotAvailable,
                      )}
                      style={{
                        border: isSlotSelected ? undefined : `1px solid ${rc.color}40`,
                        '--glow-delay': `${idx * 0.2}s`,
                      } as React.CSSProperties}
                    >
                      <div className={styles.slotHeader}>
                        <span className={cn(styles.slotNum, isSlotSelected && styles.slotNumMuted)} style={{ color: isSlotSelected ? undefined : (POLARITY_COLORS[pattern.polarity] || 'var(--color-text-primary)') }}>
                          #{slotNum} {pattern.name}
                        </span>
                        {isSlotSelected ? (
                          <span className={styles.slotStatus}>已选</span>
                        ) : (
                          <span className={styles.slotRarity} style={{ background: `${rc.color}20`, color: rc.color }}>{rc.label}</span>
                        )}
                      </div>
                      <div className={styles.slotBody}>
                        <p className={cn(styles.slotDesc, isSlotSelected ? styles.slotDescMuted : styles.slotDescNormal)}>
                          {pattern.description}
                        </p>
                        {!isSlotSelected && <PatternEffect pattern={pattern} />}
                        {!isSlotSelected && <PatternAttrBonus pattern={pattern} />}
                        {!isSlotSelected && <PatternSystemModifiers pattern={pattern} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {errorMsg && <p className={styles.validationMsg}>{errorMsg}</p>}
          </div>

          <BottomActionBar
            onBack={handleBack}
            backTitle="返回"
            onConfirm={handleConfirm}
            confirmDisabled={selectedData.length !== DESTINY_PATTERN_SELECT_COUNT}
            confirmTitle={selectedData.length === DESTINY_PATTERN_SELECT_COUNT
              ? `确认选择 ${DESTINY_PATTERN_SELECT_COUNT} 个命格`
              : `请选择 ${DESTINY_PATTERN_SELECT_COUNT} 个命格`}
            confirmText="确认命格 →"
            moreLabel="更多"
            moreItems={[
              {
                label: '🔄 重新抽取',
                disabled: reDrawDisabled,
                title: reDrawDisabled
                  ? `本地命格库不足 ${DEFAULT_DESTINY_PATTERN_COUNT + 1} 条（当前${localPoolSize}条），请等待后台填充`
                  : '从未选槽位依次单独从本地命格库重新抽取',
                onClick: handleRedraw,
              },
            ]}
          />
        </PageScroll>
      )}
    </>
    </PageErrorBoundary>
  )
}
