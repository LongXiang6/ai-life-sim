/**
 * @module post-death-epilogue-system.ts
 * @description 死后尾声子系统 —— 角色死亡后继续3~8轮叙事，描述死后世界变化，最终生成墓志铭/生平总结
 * @mod mod-character
 *
 * 设计理念：
 *   角色死亡后不是立即结束，而是继续运行3~8轮叙事。
 *   这些叙事描述死后世界的变化：遗产影响、亲友反应、社会评价等。
 *   最终生成完整的墓志铭/生平总结/传世评价。
 */

import { callAI } from '@/core'

import { estimateTokenBudget } from '@/mods/mod-engine'
import { useSettingsStore } from '@/mods/mod-settings'

import { stringifyPrompt } from '@/foundation'
import type {
  ISubSystem,
  RoundContext,
  SubSystemState,
  SubSystemChanges,
  AIModelConfig,
} from '@/foundation'
import type { PostDeathEpilogueState } from '../types'

// ============================================================
// 常量
// ============================================================

/** 死后叙事轮数范围 */
const MIN_DEATH_ROUNDS = 3
const MAX_DEATH_ROUNDS = 8

/** 死后叙事主题轮换 */
const DEATH_ROUND_THEMES = [
  '离世时刻',       // 第1轮：描述死亡场景、临终遗言
  '亲友反应',       // 第2轮：家人、朋友、敌人的反应
  '遗产分配',       // 第3轮：财产、遗产、遗物的去向
  '社会评价',       // 第4轮：社会、势力、组织的评价
  '历史影响',       // 第5轮：对世界、历史的长远影响
  '后人追忆',       // 第6轮：后人如何追忆、纪念
  '传说流传',       // 第7轮：故事如何流传、演变
  '最终归宿',       // 第8轮：灵魂归宿、最终评价
] as const

// ============================================================
// Prompt 模板
// ============================================================

/** 死后叙事 System Prompt（JSON） */
const DEATH_NARRATIVE_SYSTEM_PROMPT = stringifyPrompt({
  role: '身后叙事引擎。角色已经离世，根据提供的主题和数据生成一段死后世界的叙事。',
  requirements: [
    '第二人称叙事（"你"）',
    '基于主题生成对应内容',
    '自然完整展开死亡后的现场、人物反应与后果；文笔和事实完整优先，不设字符范围',
    '语气庄重、有文学感',
    '基于数据真实描述，可适度虚构细节',
  ],
  outputFormat: '纯文本叙事，不需要JSON包裹',
})

/** 死后尾声 System Prompt（JSON） */
const EPILOGUE_SYSTEM_PROMPT = stringifyPrompt({
  role: '身后叙事引擎。角色已经走完了一生，根据提供的数据生成一篇庄重而富有感情的一生回顾。',
  requirements: [
    '第二人称叙事（"你"）',
    '分为四个部分：生平概述、巅峰时刻、遗产影响、尾声寄语',
    '完整回顾一生的关键因果、关系与遗产；文笔和事实完整优先，不设字符范围',
    '语气庄重、有文学感，但不过分煽情',
    '基于数据真实描述，不虚构重大事件',
  ],
  outputFormat: '纯文本叙事，用"【生平概述】""【巅峰时刻】""【遗产影响】""【尾声寄语】"作为段落标题。不需要JSON包裹。',
})

// ============================================================
// 死后尾声子系统
// ============================================================

export class PostDeathEpilogueSystem implements ISubSystem {
  readonly id = 'post-death-epilogue' as const
  readonly mod = 'mod-character' as const
  readonly label = '死后叙事' as const
  readonly description = '角色死亡后继续3~8轮叙事，描述死后世界变化，最终生成墓志铭/生平总结' as const

  private state: PostDeathEpilogueState = {
    hasEpilogue: false,
    epilogueText: '',
    generatedAt: 0,
    characterName: '',
    finalAge: 0,
    worldName: '',
    deathCause: '',
    gender: undefined,
    race: '',
    background: '',
    eventCount: 0,
  }

  /** 死后叙事轮数 */
  private deathRoundsCount: number = 0

  /** 当前死后叙事轮次 */
  private currentDeathRound: number = 0

  /** 死后叙事历史 */
  private deathNarratives: string[] = []

  /** 是否正在死后叙事模式 */
  private isInDeathMode: boolean = false

  // ============================================================
  // ISubSystem 实现
  // ============================================================

  collectState(_context: RoundContext): SubSystemState {
    const s = this.state
    return {
      id: this.id,
      summary: this.isInDeathMode
        ? `【${this.label}】死后叙事第${this.currentDeathRound}/${this.deathRoundsCount}轮`
        : s.hasEpilogue
          ? `【${this.label}】已生成：${s.characterName}，享年 ${s.finalAge} 岁`
          : `【${this.label}】未触发`,
      data: structuredClone({
        ...s,
        deathRoundsCount: this.deathRoundsCount,
        currentDeathRound: this.currentDeathRound,
        deathNarratives: this.deathNarratives,
        isInDeathMode: this.isInDeathMode,
      }) as unknown as Record<string, unknown>,
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return

    const ch = changes.changes
    const desc = changes.description ?? '';
    void desc;
    if (typeof ch.epilogueText === 'string' && ch.epilogueText.trim()) {
      this.state.epilogueText = ch.epilogueText as string
      this.state.hasEpilogue = true
      this.state.generatedAt = Date.now()
    }
  }

  reset(): void {
    this.state = {
      hasEpilogue: false,
      epilogueText: '',
      generatedAt: 0,
      characterName: '',
      finalAge: 0,
      worldName: '',
      deathCause: '',
      gender: undefined,
      race: '',
      background: '',
      eventCount: 0,
    }
    this.deathRoundsCount = 0
    this.currentDeathRound = 0
    this.deathNarratives = []
    this.isInDeathMode = false
  }

  // ============================================================
  // 公共方法
  // ============================================================

  /** 获取当前尾声状态 */
  getState(): PostDeathEpilogueState {
    return { ...this.state }
  }

  /** 是否已生成尾声 */
  hasEpilogue(): boolean {
    return this.state.hasEpilogue
  }

  /** 是否正在死后叙事模式 */
  isInDeathNarrativeMode(): boolean {
    return this.isInDeathMode
  }

  /** 获取当前死后叙事轮次 */
  getCurrentDeathRound(): number {
    return this.currentDeathRound
  }

  /** 获取死后叙事总数 */
  getDeathRoundsCount(): number {
    return this.deathRoundsCount
  }

  /** 获取死后叙事历史 */
  getDeathNarratives(): string[] {
    return [...this.deathNarratives]
  }

  /**
   * 启动死后叙事模式
   *
   * @param context 回合上下文
   * @returns 死后叙事轮数（3~8轮）
   */
  startDeathNarrativeMode(context: RoundContext): number {
    // 随机确定死后叙事轮数（3~8轮）
    this.deathRoundsCount = MIN_DEATH_ROUNDS + Math.floor(Math.random() * (MAX_DEATH_ROUNDS - MIN_DEATH_ROUNDS + 1))
    this.currentDeathRound = 0
    this.deathNarratives = []
    this.isInDeathMode = true

    // 存储基本信息
    this.state.characterName = context.characterId || '无名者'
    this.state.finalAge = context.round.year
    this.state.worldName = context.worldId || '未知世界'

    // 从 health subsystem 提取死因
    const health = context.subsystemStates['health']
    if (health?.data) {
      const hData = health.data as { deathCause?: string }
      if (hData.deathCause) this.state.deathCause = hData.deathCause
    }

    // console.log(`[PostDeathEpilogue] 启动死后叙事模式，共${this.deathRoundsCount}轮`)
    return this.deathRoundsCount
  }

  /**
   * 生成一轮死后叙事
   *
   * @param context 回合上下文
   * @param aiConfig AI 模型配置
   * @param narrativeHistory 角色一生的叙事历史
   * @param sessionId 会话 ID
   * @param storySeed 剧情一致性种子
   * @returns 死后叙事文本
   */
  async generateDeathRoundNarrative(
    context: RoundContext,
    aiConfig: AIModelConfig,
    narrativeHistory: string[],
    sessionId?: string,
    storySeed?: string,
  ): Promise<string> {
    if (!this.isInDeathMode) {
      throw new Error('[PostDeathEpilogue] 未在死后叙事模式')
    }

    this.currentDeathRound++

    // 获取当前主题
    const themeIndex = Math.min(this.currentDeathRound - 1, DEATH_ROUND_THEMES.length - 1)
    const theme = DEATH_ROUND_THEMES[themeIndex]

    // 构建 User Prompt
    const userPrompt = this.buildDeathRoundUserPrompt(context, narrativeHistory, theme)

    // AI 调用
    let narrative = ''
    try {
      const { customKey, provider, customUrl, customModel } = useSettingsStore.getState()
      const model = customModel || aiConfig.model
      narrative = await callAI(
        DEATH_NARRATIVE_SYSTEM_PROMPT.replace('{theme}', theme),
        userPrompt,
        {
          config: { ...aiConfig, model },
          pool: 'lowFrequency',
          sessionId,
          providerId: provider,
          customBaseUrl: customUrl || undefined,
          customModel: model,
          apiKey: customKey || undefined,
          overrideTemperature: 0.8,
          overrideMaxTokens: estimateTokenBudget(DEATH_NARRATIVE_SYSTEM_PROMPT, userPrompt, 800),
          storySeed,
        },
      )

      // console.log(`[PostDeathEpilogue] 死后叙事第${this.currentDeathRound}轮成功，主题：${theme}`)
    } catch (_e) {
      // console.error(`[PostDeathEpilogue] 死后叙事第${this.currentDeathRound}轮失败:`, e)
      // 降级：生成简易叙事
      narrative = this.buildFallbackDeathNarrative(context, theme)
    }

    // 存入历史
    this.deathNarratives.push(narrative)

    // 检查是否完成所有轮次
    if (this.currentDeathRound >= this.deathRoundsCount) {
      this.isInDeathMode = false
      // console.log(`[PostDeathEpilogue] 死后叙事完成，共${this.deathRoundsCount}轮`)
    }

    return narrative
  }

  /**
   * 异步生成死后尾声（最终总结）
   *
   * 收集角色一生的关键数据（叙事历史、子系统状态叠影），
   * 调用 AI 生成墓志铭/生平总结/传世评价。
   *
   * @param context      回合上下文（含所有子系统状态）
   * @param aiConfig     AI 模型配置
   * @param narrativeHistory  角色一生的叙事历史
   * @param sessionId    会话 ID（用于 KV Cache 隔离）
   * @param storySeed    剧情一致性种子
   * @param gender       角色性别（从 UI 选择传入）
   * @param background   角色背景（从 UI 选择传入）
   * @param worldDescription  世界描述（从世界配置传入）
   * @param eventCount   一生事件总数（供导出页脚统计）
   * @returns AI 生成的尾声文本
   */
  async generateEpilogue(
    context: RoundContext,
    aiConfig: AIModelConfig,
    narrativeHistory: string[],
    sessionId?: string,
    storySeed?: string,
    gender?: string,
    background?: string,
    worldDescription?: string,
    eventCount?: number,
  ): Promise<string> {
    const characterName = context.characterId || '无名者'
    const finalAge = context.round.year
    const worldName = context.worldId || '未知世界'

    // 从 health subsystem 提取死因
    let deathCause = ''
    const health = context.subsystemStates['health']
    if (health?.data) {
      const hData = health.data as { deathCause?: string }
      if (hData.deathCause) deathCause = hData.deathCause
    }

    // 从 lifespan subsystem 提取种族
    let race = ''
    const lifespan = context.subsystemStates['lifespan']
    if (lifespan?.data) {
      const lsData = lifespan.data as { race?: { name?: string } }
      if (lsData.race?.name) race = lsData.race.name
    }

    // 构建 User Prompt（包含死后叙事历史）
    const userPrompt = this.buildUserPrompt(
      context,
      narrativeHistory,
      { gender, background, worldDescription },
      this.deathNarratives,
    )

    // AI 调用日志 —— 记录完整调用上下文（对齐废弃项目 logAICallFireAndForget）
    const _logMeta = {
      taskType: 'epilogue-afterlife',
      worldName,
      characterName,
      eventsCount: narrativeHistory.length,
      deathNarrativesCount: this.deathNarratives.length,
      hasSystemPrompt: true,
      pool: 'lowFrequency' as const,
    }
    // console.log('[PostDeathEpilogue] AI 调用开始:', logMeta)

    // 调用 AI（低频任务，使用 lowFrequency 缓存池）
    let epilogueText = ''
    try {
      const { customKey: epKey, provider: epPv, customUrl: epCu, customModel: epCm } = useSettingsStore.getState()
      const epModel = epCm || aiConfig.model
      epilogueText = await callAI(EPILOGUE_SYSTEM_PROMPT, userPrompt, {
        config: { ...aiConfig, model: epModel },
        pool: 'lowFrequency',
        logCategory: 'epilogue',
        sessionId,
        providerId: epPv,
        customBaseUrl: epCu || undefined,
        customModel: epModel,
        apiKey: epKey || undefined,
        overrideTemperature: 0.8,
        overrideMaxTokens: estimateTokenBudget(EPILOGUE_SYSTEM_PROMPT, userPrompt, 3000),
        storySeed,
        logContext: {
          round: context.round.year,
          age: context.round.year,
          callKind: 'epilogue-afterlife',
          pool: 'lowFrequency',
          model: epModel,
          sessionId,
        },
      })

      // console.log('[PostDeathEpilogue] AI 调用成功:', {
      //   ..._logMeta,
      //   responseLength: epilogueText.length,
      // })
    } catch (_e) {
      // console.error('[PostDeathEpilogue] AI 调用失败:', _e, _logMeta)
      // 降级：使用本地构建的简易悼文
      epilogueText = this.buildFallbackEpilogue(context, narrativeHistory)
      // console.log('[PostDeathEpilogue] 已降级为本地悼文，长度:', epilogueText.length)
    }

    // 存入状态
    this.state.epilogueText = epilogueText
    this.state.hasEpilogue = true
    this.state.generatedAt = Date.now()
    this.state.characterName = characterName
    this.state.finalAge = finalAge
    this.state.worldName = worldName
    this.state.deathCause = deathCause
    this.state.gender = gender
    this.state.race = race
    this.state.background = background
    this.state.eventCount = eventCount ?? narrativeHistory.length

    return epilogueText
  }

  /**
   * 格式化尾声为导出文本（带装饰边框 + 页脚）
   *
   * 对齐废弃项目 formatEpilogueForExport：
   *   ╔══════════════════════════════════╗
   *   ║        《世界名》                ║
   *   ║    角色名的一生                  ║
   *   ║    享年 X 岁                     ║
   *   ║    死因：XXX                     ║
   *   ╚══════════════════════════════════╝
   *   AI 生成文本
   */
  formatForExport(): string {
    const s = this.state
    if (!s.hasEpilogue || !s.epilogueText) {
      return ''
    }

    const worldTitle = `《${s.worldName || '未知世界'}》`
    const deathCause = s.deathCause || '未知'
    const genderText = s.gender === 'male' ? '男' : s.gender === 'female' ? '女' : '未知'
    const raceText = s.race || '未知'

    const lines: string[] = [
      '',
      '╔══════════════════════════════════╗',
      `║        ${worldTitle}          ║`,
      `║    ${s.characterName}的一生       ║`,
      `║    享年 ${s.finalAge} 岁            ║`,
      `║    死因：${deathCause}            ║`,
      '╚══════════════════════════════════╝',
      '',
      // 死后叙事历史
      ...this.deathNarratives.map((n, i) => `【死后第${i + 1}轮】${n}`),
      '',
      // 最终总结
      s.epilogueText,
      '',
      '---',
      '由 AI-Life-Sim 生成',
      `角色：${s.characterName}（${genderText}，${raceText}）`,
      `世界：${s.worldName || '未知世界'}`,
      `一生事件数：${s.eventCount ?? '?'} 件`,
      `死后叙事轮数：${this.deathRoundsCount} 轮`,
    ]

    return lines.join('\n')
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * 构建死后叙事轮次的 User Prompt
   */
  private buildDeathRoundUserPrompt(
    context: RoundContext,
    narrativeHistory: string[],
    theme: string,
  ): string {
    const data: Record<string, unknown> = {
      character: context.characterId || '无名者',
      finalAge: context.round.year,
      world: context.worldId || '未知世界',
      theme,
    }

    if (narrativeHistory.length > 0) {
      data.beforeDeath = [...narrativeHistory]
    }

    if (this.deathNarratives.length > 0) {
      data.existingDeathNarratives = this.deathNarratives.map((n, i) => ({ round: i + 1, narrative: n }))
    }

    const states = context.subsystemStates
    const morality = states['morality']
    if (morality?.data) {
      const mData = morality.data as { value?: number }
      if (mData.value !== undefined) {
        const moralDesc = mData.value > 30 ? '大善之人' : mData.value > 10 ? '行善者' : mData.value > 0 ? '良善' : mData.value > -10 ? '中庸' : mData.value > -30 ? '偏恶' : '大恶之人'
        data.morality = { value: mData.value, description: moralDesc }
      }
    }

    const charBase = states['character-base']
    if (charBase?.data) {
      const cur = (charBase.data as Record<string, unknown>).current as Record<string, number> | undefined
      if (cur) {
        data.finalAttributes = { physique: cur.physique ?? 0, mind: cur.mind ?? 0, charisma: cur.charisma ?? 0 }
      }
    }

    return stringifyPrompt(data)
  }

  /**
   * 死后叙事降级生成
   */
  private buildFallbackDeathNarrative(context: RoundContext, theme: string): string {
    const name = context.characterId || '无名者'
    const age = context.round.year

    const templates: Record<string, string> = {
      '离世时刻': `${name}在${age}岁时离世，临终时平静安详。`,
      '亲友反应': `${name}的离世让亲友们悲痛不已，纷纷前来吊唁。`,
      '遗产分配': `${name}的遗产按照遗嘱进行了分配，各方对此反应不一。`,
      '社会评价': `社会对${name}的评价褒贬不一，有人称赞其贡献，有人批评其过失。`,
      '历史影响': `${name}的一生对这个世界产生了深远的影响，后人将铭记其事迹。`,
      '后人追忆': `后人时常追忆${name}的事迹，将其故事代代相传。`,
      '传说流传': `${name}的故事逐渐演变成传说，在民间广为流传。`,
      '最终归宿': `${name}的灵魂最终归于平静，其一生已载入历史。`,
    }

    return templates[theme] || `${name}的故事在这一刻画上了句号。`
  }

  /**
   * 构建 User Prompt
   *
   * 从 RoundContext 的子系统状态中提取角色一生的关键数据，
   * 拼接为 AI 可消费的生平上下文。
   */
  private buildUserPrompt(
    context: RoundContext,
    narrativeHistory: string[],
    extra?: { gender?: string; background?: string; worldDescription?: string },
    deathNarratives?: string[],
  ): string {
    const states = context.subsystemStates
    const data: Record<string, unknown> = {
      character: context.characterId || '无名者',
      gender: extra?.gender === 'male' ? '男' : extra?.gender === 'female' ? '女' : undefined,
      finalAge: context.round.year,
      world: context.worldId || '未知世界',
      worldDescription: extra?.worldDescription,
      background: extra?.background,
    }

    // 命格
    const destiny = states['destiny-pattern']
    if (destiny?.data) {
      const dpData = destiny.data as { patterns?: Array<{ name: string; rarity: string; polarity: string; effect: string }> }
      if (dpData.patterns?.length) {
        data.destinyPatterns = dpData.patterns.map((p) => ({
          name: p.name,
          rarity: p.rarity,
          polarity: p.polarity === 'positive' ? '吉' : p.polarity === 'negative' ? '凶' : '混合',
          effect: p.effect,
        }))
      }
    }

    // 基础属性
    const charBase = states['character-base']
    if (charBase?.data) {
      const cur = (charBase.data as Record<string, unknown>).current as Record<string, number> | undefined
      if (cur) {
        data.attributes = {
          physique: cur.physique,
          mind: cur.mind,
          talentAptitude: cur.talentAptitude,
          charisma: cur.charisma,
        }
      }
    }

    // 气运
    const luck = states['luck']
    if (luck?.data) {
      const lData = luck.data as { luck?: number }
      if (lData.luck !== undefined && data.attributes) {
        (data.attributes as Record<string, unknown>).luck = lData.luck
      }
    }

    // 善恶
    const morality = states['morality']
    if (morality?.data) {
      const mData = morality.data as { value?: number; level?: string }
      if (mData.value !== undefined) {
        const moralDesc = mData.value > 30 ? '大善之人' : mData.value > 10 ? '行善者' : mData.value > 0 ? '良善' : mData.value > -10 ? '中庸' : mData.value > -30 ? '偏恶' : '大恶之人'
        data.morality = { value: mData.value, description: moralDesc }
      }
    }

    // 健康与死因
    const health = states['health']
    if (health?.data) {
      const hData = health.data as { isDead?: boolean; deathCause?: string; diseases?: Array<{ name: string }>; injuries?: Array<{ name: string }> }
      if (hData.isDead) {
        data.death = { cause: hData.deathCause || '未知' }
        if (hData.diseases?.length) data.diseases = hData.diseases.map((d) => d.name)
        if (hData.injuries?.length) data.injuries = hData.injuries.map((i) => i.name)
      }
    }

    // 寿命
    const lifespan = states['lifespan']
    if (lifespan?.data) {
      const lsData = lifespan.data as { maxAge?: number; baseMaxAge?: number; race?: { name?: string } }
      if (lsData.maxAge !== undefined) {
        data.lifespan = { lived: context.round.year, expectedMax: lsData.maxAge, race: lsData.race?.name, baseMaxAge: lsData.baseMaxAge }
      }
    }

    // 生命阶段
    const lifeStage = states['life-stage']
    if (lifeStage?.data) {
      const lgData = lifeStage.data as { currentStage?: string }
      if (lgData.currentStage) {
        data.finalLifeStage = lgData.currentStage
      }
    }

    // 一生叙事
    if (narrativeHistory.length > 0) {
      data.lifeEvents = [...narrativeHistory]
      data.lifeEventCount = narrativeHistory.length
    }

    // 死后叙事
    if (deathNarratives?.length) {
      data.deathNarratives = deathNarratives.map((n, i) => ({ round: i + 1, narrative: n }))
    }

    return stringifyPrompt(data)
  }

  /**
   * AI 调用失败时的本地降级悼文
   *
   * 基于叙事历史摘要拼接简易悼文，确保无论如何角色死亡后都有尾声记录。
   */
  private buildFallbackEpilogue(context: RoundContext, narrativeHistory: string[]): string {
    const name = context.characterId || '无名者'
    const age = context.round.year
    const worldName = context.worldId || '未知世界'

    // 提取善恶评价
    let moralText = ''
    const morality = context.subsystemStates['morality']
    if (morality?.data) {
      const mData = morality.data as { value?: number }
      if (mData.value !== undefined) {
        moralText = mData.value > 0
          ? '其一生向善，留下美名。'
          : mData.value < 0
            ? '其一生多行不义，为人不齿。'
            : '其一生中庸平凡，无大善大恶。'
      }
    }

    // 提取死因
    let deathText = '寿终正寝'
    const health = context.subsystemStates['health']
    if (health?.data) {
      const hData = health.data as { deathCause?: string }
      if (hData.deathCause) {
        deathText = hData.deathCause
      }
    }

    // 提取关键事件摘要
    let eventSummary = ''
    if (narrativeHistory.length > 0) {
      eventSummary = `\n一生历经：${narrativeHistory.join('；')}。`
    }

    // 死后叙事摘要
    let deathSummary = ''
    if (this.deathNarratives.length > 0) {
      deathSummary = `\n死后世界：${this.deathNarratives.join('；')}。`
    }

    return `${name}，${worldName}的一位平凡过客，享年 ${age} 岁。${moralText}因${deathText}而逝。${eventSummary}${deathSummary}\n其生平已载入${worldName}的历史长卷，后人或有评说。`
  }
}
