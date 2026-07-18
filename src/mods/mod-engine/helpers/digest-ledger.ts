/**
 * @module digest-ledger.ts
 * @description 摘要账本 —— AI 自述精简 + 0~100 重要性 + 连锁回溯 + 时间衰减
 * @mod mod-engine
 *
 * 设计来源：design-2026-07-06-compression-attributes.md 想法1
 *
 * 职责边界：
 *   本模块是「精确重要性主干」。每轮 AI 在叙事里附带 digest（一句话精简）与
 *   keyEvents（关键事件 + 0~100 重要性），由此拼合成一条按轮次排列的账本。
 *   相较旧的「关键词猜测 + HIGH/NORMAL/LOW 三档」，这是 AI 当场自述，更准。
 *
 *   与 SummaryCompressorSystem（L1–L6 分层压缩）的关系：
 *     - 压缩器仍负责把远期原文压成分层摘要（框架 / 兜底）。
 *     - 本账本负责「保留什么、遗忘什么」的决策：高分逐字保留，
 *       低分合并成一行概略；查询时叠加时间衰减，久远的低分事件淡出。
 *
 * 三个算法：
 *   1. 连锁回溯（reinforceChains）：高分事件出现时，向前回看 AI 标注的共享实体，
 *      低分事件，按 chainFactor 提升其 adjustedImportance（前置事件被"追认"重要）。
 *   2. 时间衰减（effectiveImportance）：查询时按 age 衰减，越低分衰减越快；
 *      ≥ LOCK_THRESHOLD 的事件永不衰减（刻骨铭心）。
 *   3. 剪枝合并（selectForPrompt / foldLowImportance）：注入 prompt 时按有效
 *      重要性排序取 Top-N，低分连续段折叠为一行。
 */

// ============================================================
// 常量（集中可调）
// ============================================================

/** 高于此有效重要性的事件永不衰减（刻骨铭心，无法遗忘） */
export const LOCK_THRESHOLD = 90

/** 触发连锁回溯的事件重要性门槛 */
export const CHAIN_TRIGGER = 70

/** 连锁回溯向前回看的轮次窗口 */
export const CHAIN_LOOKBACK_ROUNDS = 20

/** 连锁传导系数：前置事件被提升到 newEvent.importance × chainFactor */
export const CHAIN_FACTOR = 0.8

/** 时间衰减基础速率（每"轮龄"单位的衰减量，再乘以低分放大项） */
export const DECAY_RATE_PER_AGE = 0.15

/** 低于此有效重要性的事件在注入 prompt 时会被折叠合并 */
export const FOLD_THRESHOLD = 40

/** 账本条目上限（超出后从最旧且有效重要性最低者开始丢弃） */
export const MAX_LEDGER_ENTRIES = 500

/** AI 对整轮叙事的粗粒度重要性。 */
export type DigestImportance = 'HIGH' | 'NORMAL' | 'LOW'

// ============================================================
// 类型
// ============================================================

/** 账本中的单个关键事件 */
export interface LedgerEvent {
  /** 事件精简描述（AI 输出，≤30 字） */
  text: string
  /** AI 标注的人物/地点/物品/组织；是连锁回溯的唯一语义来源 */
  entities?: string[]
  /** AI 原始评分（0~100，永不修改，作审计与重算依据） */
  baseImportance: number
  /** 连锁回溯后的修正值（0~100，衰减基于此值计算） */
  adjustedImportance: number
}

/** 账本中的单轮条目 */
export interface DigestEntry {
  /** 叙事回合序号（对齐 orchestrator.totalRounds，与日历年无关） */
  round: number
  /** AI 对整轮叙事的粗粒度重要性 */
  importance?: DigestImportance
  /** 本轮一句话精简（AI 输出） */
  digest: string
  /** 本轮关键事件列表 */
  events: LedgerEvent[]
}

/** AI 单轮输出的账本原料 */
export interface RoundDigestInput {
  round: number
  importance?: DigestImportance
  digest?: string
  keyEvents?: Array<{ text: string; importance: number; entities?: string[] }>
}

/** 序列化快照（供存档持久化） */
export interface DigestLedgerSnapshot {
  entries: DigestEntry[]
}

// ============================================================
// 工具函数
// ============================================================

const clamp01to100 = (v: number): number => Math.max(0, Math.min(100, v))

/**
 * 从文本中提取可用于连锁匹配的"实体/关键词"。
 * 轻量启发式：中文双字以上词块 + 常见专名后缀，不追求 NLP 精度，
 * 只要能让"救下的孩子"与"当年那个孩子"产生交集即可。
 */
export function extractEntities(text: string): Set<string> {
  const entities = new Set<string>()
  if (!text) return entities

  // 2~6 字中文块（人名/地名/物名/事件名的粗粒度近似）
  const blocks = text.match(/[一-龥]{2,6}/g)
  if (blocks) {
    for (const b of blocks) entities.add(b)
  }
  return entities
}

/** 两个实体集合是否有交集（连锁判定） */
function hasEntityOverlap(a: Set<string>, b: Set<string>): boolean {
  // 遍历较小的集合以减少比较次数
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const item of small) {
    // 只在长度 ≥2 的实体上判交集，避免噪声
    if (item.length >= 2 && large.has(item)) return true
  }
  return false
}

// ============================================================
// DigestLedger
// ============================================================

export class DigestLedger {
  private entries: DigestEntry[] = []

  /** 每条事件预计算的实体集合缓存（key = `${round}#${eventIndex}`） */
  private entityCache = new Map<string, Set<string>>()

  // ---- 录入 ----

  /**
   * 记录一轮 AI 输出。digest / keyEvents 缺失时静默降级：
   *   - 无 keyEvents：本轮不产生可衰减事件，只留 digest（若有）。
   *   - 无 digest 且无 keyEvents：不写入账本（本轮无长期记忆价值）。
   *
   * 返回是否实际写入。
   */
  record(input: RoundDigestInput): boolean {
    const digest = (input.digest ?? '').trim()
    const rawEvents = Array.isArray(input.keyEvents) ? input.keyEvents : []

    const events: LedgerEvent[] = rawEvents
      .filter((e) => e && typeof e.text === 'string' && e.text.trim() !== '')
      .map((e) => {
        const base = clamp01to100(Math.round(Number(e.importance) || 0))
        const entities = Array.isArray(e.entities)
          ? e.entities.map((x) => x.trim()).filter(Boolean)
          : undefined
        return { text: e.text.trim(), entities, baseImportance: base, adjustedImportance: base }
      })

    if (!digest && events.length === 0) return false

    // 同轮去重：若该轮已存在条目则覆盖（重算/重放场景）
    const existingIdx = this.entries.findIndex((en) => en.round === input.round)
    const entry: DigestEntry = {
      round: input.round,
      importance: input.importance,
      digest,
      events,
    }
    if (existingIdx >= 0) {
      this.entries[existingIdx] = entry
    } else {
      this.entries.push(entry)
    }

    // 新事件入账后执行连锁回溯
    this.reinforceChains(entry)

    this.enforceCapacity()
    return true
  }

  // ---- 连锁回溯 ----

  /**
   * 以 newEntry 中的高分事件为触发源，向前回看 CHAIN_LOOKBACK_ROUNDS 轮，
   * 对共享实体的低分事件做重要性提升（前置事件被"追认"重要）。
   *
   * 只提升 adjustedImportance，baseImportance 保持不变。
   */
  private reinforceChains(newEntry: DigestEntry): void {
    const triggers = newEntry.events.filter((e) => e.adjustedImportance >= CHAIN_TRIGGER)
    if (triggers.length === 0) return

    const minRound = newEntry.round - CHAIN_LOOKBACK_ROUNDS

    for (const trigger of triggers) {
      const triggerEntities = this.getEntities(newEntry.round, trigger)
      const propagated = clamp01to100(Math.round(trigger.adjustedImportance * CHAIN_FACTOR))

      for (const entry of this.entries) {
        if (entry.round >= newEntry.round) continue
        if (entry.round < minRound) continue

        for (const ev of entry.events) {
          // 只提升更低分的前置事件，且需共享实体
          if (ev.adjustedImportance >= propagated) continue
          const evEntities = this.getEntities(entry.round, ev)
          if (hasEntityOverlap(triggerEntities, evEntities)) {
            ev.adjustedImportance = propagated
          }
        }
      }
    }
  }

  /** 取（并缓存）某条事件的实体集合 */
  private getEntities(round: number, ev: LedgerEvent): Set<string> {
    // 用 round + text 作为稳定 key
    const key = `${round}#${ev.text}`
    let set = this.entityCache.get(key)
    if (!set) {
      set = new Set(ev.entities ?? [])
      this.entityCache.set(key, set)
    }
    return set
  }

  // ---- 时间衰减 ----

  /**
   * 计算某事件在给定当前轮次下的「有效重要性」。
   *   - adjustedImportance ≥ LOCK_THRESHOLD → 不衰减
   *   - 否则 effective = adjusted − age × DECAY_RATE_PER_AGE × (1 − adjusted/100)
   *     其中 (1 − adjusted/100) 让低分衰减更快、高分衰减更慢。
   *
   * age 以轮次差近似（越久远 age 越大）。结果 clamp 到 [0, 100]。
   */
  effectiveImportance(ev: LedgerEvent, currentRound: number, entryRound: number): number {
    if (ev.adjustedImportance >= LOCK_THRESHOLD) return ev.adjustedImportance
    const age = Math.max(0, currentRound - entryRound)
    const lowBoost = 1 - ev.adjustedImportance / 100
    const decayed = ev.adjustedImportance - age * DECAY_RATE_PER_AGE * lowBoost
    return clamp01to100(Math.round(decayed))
  }

  // ---- 容量控制 ----

  /** 超出上限时，从有效重要性最低（近似用 adjusted）且最旧的条目里裁剪事件 */
  private enforceCapacity(): void {
    let total = this.entries.reduce((sum, e) => sum + Math.max(1, e.events.length), 0)
    if (total <= MAX_LEDGER_ENTRIES) return

    // 优先丢弃最旧条目里 adjustedImportance 最低的事件
    const sortedOldFirst = [...this.entries].sort((a, b) => a.round - b.round)
    for (const entry of sortedOldFirst) {
      if (total <= MAX_LEDGER_ENTRIES) break
      if (entry.events.length === 0) continue
      // 按 adjusted 升序，从最不重要的开始丢
      entry.events.sort((a, b) => a.adjustedImportance - b.adjustedImportance)
      while (entry.events.length > 0 && total > MAX_LEDGER_ENTRIES) {
        // 保护锁定级事件
        if (entry.events[0].adjustedImportance >= LOCK_THRESHOLD) break
        entry.events.shift()
        total--
      }
    }

    // 清掉既无 digest 又无 events 的空壳条目
    this.entries = this.entries.filter((e) => e.digest || e.events.length > 0)
  }

  // ---- 查询 / 注入 ----

  /**
   * 计算 [startRound, endRound] 区间内所有账本事件的 adjustedImportance 均值（归一化到 0~1）。
   * 区间内无账本条目时返回 null，调用方使用固定中性值。
   */
  averageAdjustedImportance(startRound: number, endRound: number): number | null {
    const scores: number[] = []
    for (const entry of this.entries) {
      if (entry.round < startRound || entry.round > endRound) continue
      for (const ev of entry.events) {
        scores.push(ev.adjustedImportance / 100)
      }
    }
    if (scores.length === 0) return null
    return scores.reduce((a, b) => a + b, 0) / scores.length
  }

  /**
   * 为 prompt 注入挑选记忆：
   *   1. 计算每条事件的有效重要性。
   *   2. 有效重要性 ≥ FOLD_THRESHOLD 的事件逐条保留（附轮次）。
   *   3. 低于阈值的连续事件按轮次段折叠为一行概略。
   *   4. 高分优先，最终不超过 limit 条。
   */
  selectForPrompt(currentRound: number, limit = 24): string[] {
    if (this.entries.length === 0) return []

    interface Scored {
      round: number
      text: string
      effective: number
    }
    const scored: Scored[] = []
    for (const entry of this.entries) {
      for (const ev of entry.events) {
        scored.push({
          round: entry.round,
          text: ev.text,
          effective: this.effectiveImportance(ev, currentRound, entry.round),
        })
      }
    }

    const kept = scored.filter((s) => s.effective >= FOLD_THRESHOLD)
    const folded = scored.filter((s) => s.effective < FOLD_THRESHOLD)

    // 高分逐条：按有效重要性降序，取前 limit-? 个
    kept.sort((a, b) => b.effective - a.effective)
    const keptLines = kept
      .slice(0, Math.max(0, limit - 1))
      .sort((a, b) => a.round - b.round)
      .map((s) => `[${s.round}轮·${s.effective}] ${s.text}`)

    const lines = [...keptLines]

    // 低分折叠：合并为一行概略（只保留文本，丢弃精确分值）
    if (folded.length > 0) {
      folded.sort((a, b) => a.round - b.round)
      const foldedText = folded.map((s) => s.text).join('；')
      const first = folded[0].round
      const last = folded[folded.length - 1].round
      const rangeLabel = first === last ? `${first}轮` : `${first}~${last}轮`
      lines.push(`[${rangeLabel}·概略] ${foldedText}`)
    }

    return lines
  }

  /** 拼合近 N 轮 digest 为一段（供"近期精简"注入） */
  recentDigests(count = 10): string[] {
    return [...this.entries]
      .sort((a, b) => a.round - b.round)
      .slice(-count)
      .filter((e) => e.digest)
      .map((e) => `${e.round}轮：${e.digest}`)
  }

  // ---- 存取 ----

  getEntries(): DigestEntry[] {
    return structuredClone(this.entries)
  }

  toSnapshot(): DigestLedgerSnapshot {
    return { entries: structuredClone(this.entries) }
  }

  loadSnapshot(snapshot: DigestLedgerSnapshot | undefined | null): void {
    this.entryCache_clear()
    this.entries = snapshot?.entries ? structuredClone(snapshot.entries) : []
  }

  private entryCache_clear(): void {
    this.entityCache.clear()
  }

  reset(): void {
    this.entries = []
    this.entityCache.clear()
  }
}

/** 全局单例（与 memoryLifecycle / summaryCompressor 同级） */
export const digestLedger = new DigestLedger()
