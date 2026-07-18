/**
 * @module narrative-parser-system.ts
 * @description 叙事解析子系统 —— 协调器：串联预处理→解析→后处理全管线
 * @mod mod-engine
 *
 * 架构（重构后）：
 *   ChineseTextProcessor   → 预处理层（引号标准化、段落分段、中文块提取）
 *   DegradationManager     → 解析层（JSON / 正则 / 纯文本策略串联）
 *   FallbackNarrativeBuilder → 后处理层（兜底叙事生成）
 *
 * 解析策略（全防御型 5 层降级管线）：
 *   L0: [NARRATIVE]+[META] 信封解析 —— 主叙事路径
 *   L1: JSON.parse(content) → 段落自动分段 —— 旧格式降级
 *   L2: 正则提取 narrative 字段（多版本文本交叉匹配 + 中文引号标准化）
 *   L3: 提取最长中文字符块 —— 纯文本响应
 *   L4: 返回空 narrative —— 彻底失败，由外部兜底叙事补充
 *
 * P1 优化：
 *   - P1-01: normalizeNarrativeParagraphs 段落自动分段（按句号+长度智能折段）
 *   - P1-02: extractNarrativeField 多版本文本交叉匹配（原始/标准化两个版本取最长）
 *   - P1-03: L2 最小中文字符块阈值提取为类常量 MIN_CHINESE_BLOCK_LENGTH
 *
 * P2 优化（可选增强）：
 *   - P2-01: checkNarrativeQuality 扩展检测项（连贯性评分 + 情感倾向检测）
 *   - P2-02: parsePartial Unicode 转义处理增强（\uXXXX → 实际字符）
 *   - P2-03: 降级统计（degradationStats 计数器，供性能分析）
 *   - P2-04: buildFallbackNarrative i18n 支持（locale 参数）
 */

import type { SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { BaseSubsystem } from '@/core'
import type { NarrativeSemanticSignals } from '../helpers/narrative-semantic-signals'

import {
  ChineseTextProcessor,
  TaggedMetaParseStrategy,
  JsonParseStrategy,
  RegexExtractStrategy,
  PlainTextStrategy,
  DegradationManager,
  FallbackNarrativeBuilder,
  type DegradationStats,
} from '../helpers/narrative-parser-pipeline'

// Uses pattern matching via patternManager; USE_PATTERN_MANAGER feature flag managed centrally

// ============================================================
// 类型定义
// ============================================================

/** 有序段落段（含完整元数据，对齐旧系统 OrderedNarrativeSegment） */
export interface OrderedSegment {
  order?: number
  narrative: string
  spanYears?: number
  title?: string
  keyEvents?: string[]
  attrChanges?: string
  changes: SubSystemChanges[]
  notableEvents: string[],
}

/** 解析后的回合结果 */
export interface ParsedNarrative {
  narrative: string
  changes: SubSystemChanges[]
  notableEvents: string[]
  /** META 存在但未通过完整 Schema；消费方必须保留正文并整包拒绝 META。 */
  metadataRejected?: boolean
  /**
   * AI 输出的世界方向指令
   * - 字符串格式：简单方向标签（如 "修炼/突破"），用于叙事方向
   * - 对象格式：结构化世界方向（如 {market:{direction:"繁荣",magnitude:0.3}}），可直接应用于子系统数值
   */
  direction?: string | Record<string, { direction?: string; magnitude?: number }>
  /** 有序段落专属：段落序号 */
  order?: number
  /** 有序段落专属：跨越年数 */
  spanYears?: number
  /** 有序段落专属：段落标题 */
  title?: string
  /** 关键事件列表：旧有序段落为 string[]，主叙事路径为结构化对象 */
  keyEvents?: string[] | Array<{ text: string; importance: number; entities?: string[] }>
  /** 有序段落专属：属性变化文本 */
  attrChanges?: string
  /** 命运分叉点 */
  branch?: boolean
  branchTitle?: string
  branchOptions?: string[]
  /** AI 标注的本轮角色创造内容（R-7 结构化判定） */
  creations?: Array<{ name: string; description: string; category: string }>
  /** AI 标注伏笔 */
  foreshadowing?: Array<{ type: string; description: string; priority?: number }>
  /** AI 自评重要性 */
  importance?: 'HIGH' | 'NORMAL' | 'LOW'
  /** 长期记忆摘要 */
  digest?: string
  /** 事件弧状态，用于替代闭环关键词检测 */
  arcStatus?: 'start' | 'ongoing' | 'end'
  /** Schema 校验后的权威叙事语义；缺失时由消费方使用显式中立降级。 */
  semanticSignals?: NarrativeSemanticSignals
}

/** 旧系统有序 JSON 输入项格式（支持紧凑键和完整键双格式） */
interface LegacyOrderedItem {
  o?: number; order?: number
  n?: string; narrative?: string
  s?: number; spanYears?: number
  t?: string; title?: string
  k?: string[]; keyEvents?: string[]
  a?: string; attrChanges?: string
}

// ============================================================
// 主类
// ============================================================

export class NarrativeParserSystem extends BaseSubsystem {
  readonly id = 'narrative-parser' as const
  readonly mod = 'mod-engine' as const
  readonly label = '叙事解析器' as const
  readonly description = '全防御型解析 AI 标签信封输出为结构化回合结果，含多层降级、兜底叙事与段落预处理' as const

  private textProcessor = new ChineseTextProcessor()
  private degradationManager = new DegradationManager([
    new TaggedMetaParseStrategy(),
    new JsonParseStrategy(),
    new RegexExtractStrategy(),
    new PlainTextStrategy(),
  ])
  private fallbackBuilder = new FallbackNarrativeBuilder()

  private lastResult: ParsedNarrative | null = null

  /** P1-03: L2 降级最小中文字符块长度（可配置类常量） */
  static readonly MIN_CHINESE_BLOCK_LENGTH = 30

  // ============================================================
  // 公开方法 —— 核心解析
  // ============================================================

  /**
   * 解析 AI JSON 响应
   *
   * 全防御型 5 层降级管线：
   *   L0: [NARRATIVE]+[META] 信封解析
   *   L1: JSON.parse → 段落自动分段（旧格式降级）
   *   L2: 正则提取 narrative（多版本文本交叉匹配 + 中文引号标准化）
   *   L3: 提取最长中文字符块
   *   L4: 返回空 narrative，由外部兜底叙事补充
   */
  parse(content: string): ParsedNarrative {
    const result = this.degradationManager.parse(content, this.textProcessor)
    this.lastResult = result
    return result
  }

  // ============================================================
  // 公开方法 —— 流式半截提取
  // ============================================================

  /**
   * 流式半截提取
   * P2-02: 增强 Unicode 转义处理（\uXXXX → 实际字符）
   */
  parsePartial(rawText: string): string | null {
    const normalized = this.textProcessor.normalizeQuotes(rawText)

    const tryExtract = (text: string): string | null => {
      // 策略 1："narrative":"部分文本"
      const jsonMatch = text.match(/"narrative"\s*:\s*"((?:[^"\\]|\\.)*)/)
      if (jsonMatch && jsonMatch[1].length >= 20) {
        return this.textProcessor.unescapeJson(jsonMatch[1])
      }
      // 策略 2："n":"部分文本"（紧凑键）
      const compactMatch = text.match(/"n"\s*:\s*"((?:[^"\\]|\\.)*)/)
      if (compactMatch && compactMatch[1].length >= 20) {
        return this.textProcessor.unescapeJson(compactMatch[1])
      }
      return null
    }

    const rawResult = tryExtract(rawText)
    const normResult = rawText !== normalized ? tryExtract(normalized) : null

    let best: string | null = null
    if (rawResult) best = rawResult
    if (normResult) {
      if (!best || normResult.length > best.length) {
        best = normResult
      }
    }
    if (best) return best

    // 策略 3：纯中文块提取
    const chineseBlock = normalized.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]{20,}/g)
    if (chineseBlock) {
      return chineseBlock.join(' ')
    }
    return null
  }

  // ============================================================
  // 公开方法 —— 兜底叙事
  // ============================================================

  /**
   * 按龄兜底叙事（基于生命阶段比例 age/maxAge）
   *
   * 委托给 FallbackNarrativeBuilder 处理。
   *
   * @param age 当前年龄
   * @param maxAge 种族最大寿命（默认 100，人类基准）
   * @param locale 语言（'zh' / 'en'）
   */
  buildFallbackNarrative(age: number, maxAge = 100, locale = 'zh'): string {
    return this.fallbackBuilder.build(age, maxAge, locale)
  }

  getLastResult(): ParsedNarrative | null {
    return this.lastResult
  }

  /** 获取降级统计 */
  getDegradationStats(): Readonly<DegradationStats> {
    return this.degradationManager.getStats()
  }

  // ============================================================
  // P1-01: 段落自动分段（代理到 ChineseTextProcessor）
  // ============================================================

  /**
   * 叙事段落标准化
   * @deprecated 委托给 ChineseTextProcessor.segmentParagraphs，保留以兼容外部调用
   */
  normalizeNarrativeParagraphs(text: string): string {
    return this.textProcessor.segmentParagraphs(text)
  }

  /** 段落分段效果评估（代理） */
  evaluateParagraphs(original: string, segmented: string): {
    originalLength: number
    segmentedLength: number
    paragraphCount: number
    avgParagraphLength: number
  } {
    return this.textProcessor.evaluateParagraphs(original, segmented)
  }

  // ============================================================
  // P3: 有序格式解析
  // ============================================================

  /**
   * 有序多段叙事解析
   * 支持 JSON 数组和纯文本序号两种格式
   *
   * P0-03: 返回前按 order 字段排序
   */
  parseOrderedNarrative(raw: string): ParsedNarrative[] {
    const jsonResult = this.parseOrderedJSON(raw)
    if (jsonResult) {
      // P0-03: 按 order 字段排序
      jsonResult.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      return jsonResult
    }
    return this.parseOrderedText(raw)
  }

  /**
   * 将有序段落合并为带标题的连续文本（向下兼容旧 UI）
   */
  mergeOrderedSegments(segments: ParsedNarrative[]): string {
    return segments
      .map((seg, i) => {
        const title = seg.title ? `【${seg.title}】` : `【第${i + 1}段】`
        const span = seg.spanYears ? `（跨度${seg.spanYears}年）` : ''
        return `${title}${span}\n${seg.narrative}`
      })
      .join('\n\n')
  }

  // ============================================================
  // P2-01: 叙事质量检测（扩展版）
  // ============================================================

  /**
   * 叙事质量检测
   *
   * P2-01 扩展项（原 3 项 + 新增 3 项）：
   *   1. 过短检测（< 20 字）
   *   2. 重复字符检测（10 连以上）
   *   3. 非中文内容检测
   *   4. 叙事连贯性评分（基于句长方差和标点分布）
   *   5. 语义质量由主叙事 AI 的 Schema 字段负责，本地只检查结构与格式
   */
  checkNarrativeQuality(narrative: string): string[] {
    const issues: string[] = []
    if (narrative.length < 20) issues.push('叙事过短（< 20 字）')
    if (/(.)\1{10,}/.test(narrative)) issues.push('检测到重复字符')
    if (/^[a-zA-Z0-9\s\p{P}]+$/u.test(narrative)) issues.push('可能为非中文内容')

    // 连贯性评分
    const sentences = narrative.split(/[。！？!?]/).filter(Boolean)
    if (sentences.length >= 3) {
      const lengths = sentences.map((s) => s.length)
      const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
      const variance = lengths.reduce((sum, l) => sum + (l - avg) ** 2, 0) / lengths.length
      if (variance > avg * 3) issues.push('句长波动过大，叙事连贯性偏低')
    }

    return issues
  }

  // ============================================================
  // 有序格式内部方法（私有）
  // ============================================================

  /**
   * 解析 JSON 数组格式的有序叙事
   *
   * P0-01: 补全旧系统全部字段映射
   *   旧字段 → 新字段：
   *     n/narrative → narrative（文本）
   *     s/spanYears → spanYears（跨越年数）
   *     t/title → title（标题）
   *     k/keyEvents → keyEvents（关键事件列表）
   *     a/attrChanges → attrChanges（属性变化文本 或 对象→字符串）
   *     o/order → order（序号）
   * L-03: 支持 attrChanges 对象格式
   */
  private parseOrderedJSON(raw: string): ParsedNarrative[] | null {
    if (!raw.trim().startsWith('[')) return null
    try {
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr)) return null
      return arr.map((item: LegacyOrderedItem) => {
        const narrative = (typeof item.n === 'string' ? item.n : typeof item.narrative === 'string' ? item.narrative : '') as string
        // L-03: attrChanges 支持对象格式
        const attrChanges: string | undefined = (() => {
          if (typeof item.a === 'string') return item.a
          if (typeof item.attrChanges === 'string') return item.attrChanges
          // 对象格式 → 转为可读字符串
          const obj = (typeof item.a === 'object' && item.a !== null ? item.a : typeof item.attrChanges === 'object' && item.attrChanges !== null ? item.attrChanges : null) as Record<string, unknown> | null
          if (obj) {
            return Object.entries(obj).map(([k, v]) => `${k}:${v}`).join(', ')
          }
          return undefined
        })()
        return {
          narrative,
          order: typeof item.o === 'number' ? item.o : typeof item.order === 'number' ? item.order : undefined,
          spanYears: typeof item.s === 'number' ? item.s : typeof item.spanYears === 'number' ? item.spanYears : undefined,
          title: typeof item.t === 'string' ? item.t : typeof item.title === 'string' ? item.title : undefined,
          keyEvents: Array.isArray(item.k) ? item.k : Array.isArray(item.keyEvents) ? item.keyEvents : undefined,
          attrChanges,
          changes: [],
          notableEvents: [],
        }
      })
    } catch {
      return null
    }
  }

  /** 解析纯文本序号格式的有序叙事 */
  private parseOrderedText(raw: string): ParsedNarrative[] {
    const segments = raw.split(/\n?\s*\d+[\.\、\)]\s*/).filter(Boolean)
    if (segments.length <= 1) return []
    return segments.map((s, i) => ({
      narrative: s.trim(),
      changes: [],
      notableEvents: [],
      order: i + 1,
    }))
  }

  // ============================================================
  // ISubSystem 实现
  // ============================================================

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: this.lastResult
        ? `上次叙事解析成功，提取到 ${this.lastResult.changes.length} 条变更`
        : '尚未解析叙事',
      data: structuredClone({ lastResult: this.lastResult }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`)
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch`)
    }
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`)
    }
    void changes.changes;
  }

  reset(): void {
    this.lastResult = null
    this.degradationManager.reset()
  }
}

/** 单例 */
export const narrativeParser = new NarrativeParserSystem()
