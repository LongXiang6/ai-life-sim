/**
 * @module FateProphecySystem
 * @description 命运预言子系统 —— 预言生命周期管理（生成/排队/应验/打破）+ 因果惩罚 + AI 动态预言生成 + Prompt 格式化
 *   v3: 部分应验（逐步推进 + 阈值预兆事件）+ triggeredBy 因果链追溯
 * @mod mod-base-universe
 */
import { getRoundSequence } from '@/foundation'

import type {
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
} from '@/foundation'
import type {
  FateProphecyState,
  Prophecy,
  ProphecySource,
  ProphecyOmenEvent,
  ProphecyOmenStage,
} from '../types'

import {
  PROPHECY_TEMPLATES,
  PROPHECY_MIN_COUNT,
  PROPHECY_MAX_COUNT,
  PROPHECY_GENERATION_INTERVAL,
  PROPHECY_NATURAL_CHANCE,
  PROPHECY_PENALTY_MAX,
  PROPHECY_BREAK_PENALTY_MULT,
  PROPHECY_PROGRESS_MAX,
  PROPHECY_PROGRESS_STEP,
  PROPHECY_OMEN_THRESHOLDS,
  PROPHECY_OMEN_LABELS,
  PROPHECY_SOURCE_LABELS,
} from '../constants'

export class FateProphecySystem implements ISubSystem {
  readonly id = 'fate-prophecy' as const
  readonly mod = 'mod-base-universe' as const
  readonly label = '命运预言' as const
  readonly description = '管理预言生成、应验、打破和因果惩罚，提供命运叙事驱动' as const

  private _state: FateProphecyState = {
    prophecies: [],
    causalityPenalty: 0,
    activeProphecyCount: 0,
    lastAdvanceQuarter: 0,
    recentFulfilled: [],
    recentBroken: [],
    recentOmens: [],
  }

  private _lastProcessedRound = -1

  /** 当前季度（由 collectState 维护） */
  private _currentQuarter = 0

  // ============================================================
  // ISubSystem 接口
  // ============================================================

  collectState(context: RoundContext): SubSystemState {
    // 阳历季节的显示索引以春季为 0、冬季为 3，不能直接当作年内递增季度。
    // 预言生命周期需要的是跨年单调的三个月时间桶：1–2 月冬季、3–5 月春季、
    // 6–8 月夏季、9–11 月秋季、12 月进入下一冬季桶。
    const absoluteMonth = context.round.year * 12 + context.round.month
    this._currentQuarter = Math.floor((absoluteMonth + 2) / 3)

    // 🔴 round-idempotent 守卫
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this._buildSummary(),
        data: structuredClone(this._state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    this._advance()

    return {
      id: this.id,
      summary: this._buildSummary(),
      data: {
        ...(structuredClone(this._state as unknown as Record<string, unknown>)),
        // 暴露最近事件供 orchestrator 消费
        fateFulfilled: this._state.recentFulfilled.length > 0
          ? this._state.recentFulfilled.map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            source: PROPHECY_SOURCE_LABELS[p.source],
          }))
          : undefined,
        fateBroken: this._state.recentBroken.length > 0
          ? this._state.recentBroken.map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            source: PROPHECY_SOURCE_LABELS[p.source],
          }))
          : undefined,
        fateProphecyOmen: this._state.recentOmens.length > 0
          ? this._state.recentOmens.map((o) => ({
            id: o.id,
            prophecyId: o.prophecyId,
            title: o.title,
            stage: o.stage,
            stageLabel: PROPHECY_OMEN_LABELS[o.stage],
            description: o.description,
          }))
          : undefined,
      },
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    // 校验变更顶层结构
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`)
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch: expected ${this.id}, got ${changes.id}`)
    }
    // 校验 changes.changes 结构（必须是 plain object，不能是数组）
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    // 校验变更描述
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`)
    }

    const c = changes.changes

    // AI 接触点：动态预言生成
    if (
      c.adaptationType === 'prophecies'
      && Array.isArray(c.prophecies)
    ) {
      const generated = c.prophecies as Array<Record<string, unknown>>
      // 因果链追溯：最近应验的预言 ID 列表作为触发源
      const recentIds = this._state.recentFulfilled.map((p) => p.id)
      for (const p of generated) {
        if (typeof p.title === 'string' && typeof p.description === 'string') {
          const prophecy: Prophecy = {
            id: `ai-${this._state.prophecies.length}-${Date.now()}`,
            title: p.title,
            description: p.description,
            source: (p.source as ProphecySource) || 'divine',
            mutability: typeof p.mutability === 'number' ? p.mutability : 0.3,
            progressFulfill: 0,
            isBroken: false,
            createdQuarter: this._currentQuarter,
            targetQuarter: typeof p.targetQuarters === 'number'
              ? this._currentQuarter + p.targetQuarters
              : this._currentQuarter + 20,
            relatedEventIds: [],
            // 因果链追溯：记录是哪个预言应验触发的
            triggeredBy: typeof p.triggeredBy === 'string'
              ? p.triggeredBy
              : recentIds.length > 0 ? recentIds[0] : undefined,
          }
          this._state.prophecies.push(prophecy)
        }
      }
    } else if (
      c.adaptationType === 'prophecies'
      && typeof c.worldSetting === 'object'
      && c.worldSetting !== null
    ) {
      // 初始生成（降级路径）
      const ws = c.worldSetting as Record<string, unknown>
      const worldview = typeof ws.worldview === 'string' ? ws.worldview : 'cultivation'
      if (this._state.prophecies.length === 0) {
        this._generateFromTemplates(worldview)
      }
    } else if (typeof c.breakInstruction === 'string') {
      // 打破预言指令
      this._breakProphecy(c.breakInstruction)
    }
  }

  reset(): void {
    this._state = {
      prophecies: [],
      causalityPenalty: 0,
      activeProphecyCount: 0,
      lastAdvanceQuarter: 0,
      recentFulfilled: [],
      recentBroken: [],
      recentOmens: [],
    }
    // 🔴 必须重置 round-idempotent 守卫
    this._lastProcessedRound = -1
    this._currentQuarter = 0
  }

  // ============================================================
  // 领域方法（对 orchestrator 开放的公共 API）
  // ============================================================

  /** 获取最近应验的预言（供 orchestrator 在不重复推进的情况下提取事件） */
  getRecentFulfilledProphecies(): Prophecy[] {
    return [...this._state.recentFulfilled]
  }

  /** 获取最近打破的预言（供 orchestrator 在不重复推进的情况下提取事件） */
  getRecentBrokenProphecies(): Prophecy[] {
    return [...this._state.recentBroken]
  }

  /** 获取最近预兆事件（供 orchestrator 提取进度阈值事件） */
  getRecentOmens(): ProphecyOmenEvent[] {
    return [...this._state.recentOmens]
  }

  /** 获取所有预言（供 UI 可视化） */
  getAllProphecies(): Prophecy[] {
    return [...this._state.prophecies]
  }

  /** 格式化命运预言为 Prompt 可消费文本 */
  formatForPrompt(): string {
    const allProphecies = this._state.prophecies
    if (allProphecies.length === 0) return '当前无活跃预言'

    const parts: string[] = []

    // 1. 活跃预言（未打破 + 未应验），含进度阶段描述
    const active = allProphecies.filter(
      (p) => !p.isBroken && p.progressFulfill < PROPHECY_PROGRESS_MAX,
    )
    if (active.length > 0) {
      parts.push(
        active.map((p) => {
          const source = PROPHECY_SOURCE_LABELS[p.source]
          const stageLabel = this._getProgressStageLabel(p.progressFulfill)
          return `【${source}】${p.title}：${p.description}（应验进度 ${p.progressFulfill}/100${stageLabel}，可变性 ${(p.mutability * 100).toFixed(0)}%）`
        }).join('\n'),
      )
    }

    // 2. 已应验的预言（让 AI 感知历史预言应验，可融入叙事回溯）
    const fulfilled = allProphecies.filter(
      (p) => !p.isBroken && p.progressFulfill >= PROPHECY_PROGRESS_MAX,
    )
    if (fulfilled.length > 0) {
      const fulfilledText = fulfilled.map((p) => {
        const source = PROPHECY_SOURCE_LABELS[p.source]
        return `【${source}】${p.title}：${p.description} —— 已应验`
      }).join('\n')
      parts.push(`\n[已应验的预言]\n${fulfilledText}`)
    }

    // 3. 被打破的预言（命运线断裂记录）
    const broken = allProphecies.filter((p) => p.isBroken)
    if (broken.length > 0) {
      const brokenText = broken.map((p) => {
        const source = PROPHECY_SOURCE_LABELS[p.source]
        return `【${source}】${p.title}：${p.description} —— 已被打破`
      }).join('\n')
      parts.push(`\n[被打破的预言]\n${brokenText}`)
    }

    return parts.join('\n')
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /** 每轮推进：逐步应验（产出预兆事件）+ 完全应验（产出 FATE_FULFILLED）+ 批量自然生成 */
  private _advance(): void {
    // 清空上一回合的事件
    this._state.recentFulfilled = []
    this._state.recentBroken = []
    this._state.recentOmens = []

    // 应验推进：逐步累进 progressFulfill，产出预兆和应验事件
    for (const prophecy of this._state.prophecies) {
      if (prophecy.isBroken) continue
      if (prophecy.progressFulfill >= PROPHECY_PROGRESS_MAX) continue

      // 只有在到达 targetQuarter 后才开始推进进度
      if (this._currentQuarter < prophecy.targetQuarter) continue

      const prevProgress = prophecy.progressFulfill
      prophecy.progressFulfill = Math.min(
        PROPHECY_PROGRESS_MAX,
        prophecy.progressFulfill + PROPHECY_PROGRESS_STEP,
      )

      // 检测阈值跨越：产出一连串预兆事件
      for (const threshold of PROPHECY_OMEN_THRESHOLDS) {
        if (prevProgress < threshold && prophecy.progressFulfill >= threshold) {
          const stage: ProphecyOmenStage = `omen_${threshold}` as ProphecyOmenStage
          this._state.recentOmens.push({
            id: `omen-${prophecy.id}-${stage}-${this._currentQuarter}`,
            prophecyId: prophecy.id,
            title: prophecy.title,
            stage,
            description: `${prophecy.title}：${PROPHECY_OMEN_LABELS[stage]}（进度 ${prophecy.progressFulfill}/${PROPHECY_PROGRESS_MAX}）`,
            quarter: this._currentQuarter,
          })
        }
      }

      // 完全应验
      if (prophecy.progressFulfill >= PROPHECY_PROGRESS_MAX) {
        this._state.recentFulfilled.push({ ...prophecy })
      }
    }

    // 批量推进：支持 timeSkip 场景，循环处理每个生成间隔
    const quartersElapsed = this._currentQuarter - this._state.lastAdvanceQuarter
    if (quartersElapsed >= PROPHECY_GENERATION_INTERVAL) {
      const intervals = Math.floor(quartersElapsed / PROPHECY_GENERATION_INTERVAL)
      for (let i = 0; i < intervals; i++) {
        if (Math.random() < PROPHECY_NATURAL_CHANCE) {
          this._generateFromTemplates('cultivation')
        }
      }
      // 推进 lastAdvanceQuarter 到最近的间隔边界
      this._state.lastAdvanceQuarter += intervals * PROPHECY_GENERATION_INTERVAL
    }

    // 更新活跃计数
    this._state.activeProphecyCount = this._state.prophecies.filter(
      (p) => !p.isBroken && p.progressFulfill < PROPHECY_PROGRESS_MAX,
    ).length
  }

  /** 获取进度的阶段描述文本 */
  private _getProgressStageLabel(progress: number): string {
    if (progress <= 0) return ''
    if (progress < 25) return '，命运开始转动'
    if (progress < 50) return '，预兆初现'
    if (progress < 75) return '，征兆日益明显'
    if (progress < 100) return '，应验在即'
    return ''
  }

  /** 从模板库按世界观筛选并生成预言（降级路径） */
  private _generateFromTemplates(worldview: string): void {
    // 筛选兼容模板
    const compatible = PROPHECY_TEMPLATES.filter(
      (t) => t.compatibleWorldviews.includes(worldview),
    )
    const pool = compatible.length > 0 ? compatible : PROPHECY_TEMPLATES

    // 随机抽取 1~2 个
    const count = PROPHECY_MIN_COUNT + Math.floor(
      Math.random() * (PROPHECY_MAX_COUNT - PROPHECY_MIN_COUNT + 1),
    )
    const available = [...pool]

    for (let i = 0; i < count && available.length > 0; i++) {
      const idx = Math.floor(Math.random() * available.length)
      const template = available.splice(idx, 1)[0]

      const targetQuarters =
        template.targetQuartersMin
        + Math.floor(Math.random() * (template.targetQuartersMax - template.targetQuartersMin + 1))

      const prophecy: Prophecy = {
        id: `tmpl-${template.id}-${this._currentQuarter}-${Math.random().toString(36).slice(2, 8)}`,
        title: template.title,
        description: template.description,
        source: template.source,
        mutability: template.defaultMutability,
        progressFulfill: 0,
        isBroken: false,
        createdQuarter: this._currentQuarter,
        targetQuarter: this._currentQuarter + targetQuarters,
        relatedEventIds: [],
      }

      this._state.prophecies.push(prophecy)
    }
  }

  /** 打破指定预言（产出 FATE_BROKEN 事件） */
  private _breakProphecy(prophecyId: string): void {
    const prophecy = this._state.prophecies.find((p) => p.id === prophecyId)
    if (!prophecy || prophecy.isBroken) return

    prophecy.isBroken = true
    prophecy.progressFulfill = PROPHECY_PROGRESS_MAX
    this._state.causalityPenalty = Math.min(
      PROPHECY_PENALTY_MAX,
      this._state.causalityPenalty + (1 - prophecy.mutability) * PROPHECY_BREAK_PENALTY_MULT,
    )

    // 产出打破事件快照
    this._state.recentBroken.push({ ...prophecy })
  }

  private _buildSummary(): string {
    const active = this._state.prophecies.filter(
      (p) => !p.isBroken && p.progressFulfill < PROPHECY_PROGRESS_MAX,
    )
    const fulfilledCount = this._state.prophecies.filter(
      (p) => !p.isBroken && p.progressFulfill >= PROPHECY_PROGRESS_MAX,
    ).length
    const brokenCount = this._state.prophecies.filter((p) => p.isBroken).length

    let summary = `【命运预言】活跃预言 ${active.length} 条 | 已应验 ${fulfilledCount} 条 | 已打破 ${brokenCount} 条 | 因果惩罚 ${this._state.causalityPenalty}/${PROPHECY_PENALTY_MAX}`
    if (active.length > 0) {
      const first = active[0]
      summary += ` | ${first.title}：应验进度 ${first.progressFulfill}/${PROPHECY_PROGRESS_MAX}`
    }
    return summary
  }
}
