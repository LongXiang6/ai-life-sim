/**
 * @module parse-strategies.ts
 * @description 解析策略 —— 接口定义 + JSON/正则/纯文本三种策略实现
 * @mod mod-engine
 *
 * 每种策略独立封装，通过 DegradationManager 按优先级串联。
 */

import type { SubSystemChanges } from '@/foundation'
import type { ParsedNarrative } from '../subsystems/narrative-parser-system'
import type { ChineseTextProcessor } from './chinese-text-processor'
import { mapRawNarrativeChanges } from './narrative-change-bundle'
import { normalizeNarrativeBranchOptions } from './narrative-branch-policy'
import { extractTaggedMetaEnvelope } from './tagged-meta-envelope'
import {
  NarrativeResponseSchema,
  normalizeNarrativeResponseMetadata,
  type NarrativeSemanticSignals,
} from './narrative-semantic-signals'

/** AI META 段与旧 JSON 降级格式共用的结构 */
interface RawAIResponse {
  narrative?: string
  changes?: Array<{
    id?: string
    description?: string
    changes?: Record<string, unknown>
  }>
  notableEvents?: string[]
  digest?: string
  keyEvents?: Array<{
    text?: string
    importance?: number
    entities?: string[]
  }>
  importance?: 'HIGH' | 'NORMAL' | 'LOW'
  arcStatus?: 'start' | 'ongoing' | 'end'
  semanticSignals?: NarrativeSemanticSignals
  branch?: boolean
  branchTitle?: string
  branchOptions?: string[]
  /** 世界方向指令（结构化格式），如 {"market":{"direction":"繁荣","magnitude":0.3},"population":{"direction":"繁荣","magnitude":0.3}} */
  direction?: string | Record<string, { direction?: string; magnitude?: number }>
  /** AI 标注的创造内容（原创保护） */
  creations?: Array<{ name: string; description: string; category: string }>
  /** AI 标注的伏笔 */
  foreshadowing?: Array<{ type: string; description: string; priority?: number }>
}

/** 清理 AI 在降级/嵌套输出时残留到正文里的信封标签，避免 UI 直接显示协议标记。 */
function stripNarrativeEnvelopeArtifacts(text: string): string {
  return text
    .replace(/\[META\][\s\S]*$/i, '')
    .replace(/\[\/?NARRATIVE\]/gi, '')
    .replace(/\[\/META\]/gi, '')
    .trim()
}

function parseRawAIResponse(
  raw: RawAIResponse,
  processor: ChineseTextProcessor,
  narrativeOverride?: string,
): ParsedNarrative {
  // 防御处理：JSON.parse 将 \\n 转为字面量 \n（两个字符），需替换为真实换行符
  if (raw.narrative && typeof raw.narrative === 'string' && raw.narrative.includes('\\n')) {
    raw.narrative = raw.narrative.replace(/\\n/g, '\n')
  }

  const narrativeSource = stripNarrativeEnvelopeArtifacts(narrativeOverride ?? raw.narrative ?? '')
  const narrative = processor.segmentParagraphs(narrativeSource)
  const {
    narrative: _protocolNarrative,
    direction: _legacyDirection,
    ...metadataCandidate
  } = raw
  const hasMetadata = Object.keys(metadataCandidate).length > 0
  const metadataResult = hasMetadata
    ? NarrativeResponseSchema.safeParse(metadataCandidate)
    : undefined
  const metadata = metadataResult?.success ? metadataResult.data : undefined

  // 提取 direction 字段（支持字符串和结构化对象两种格式）
  let direction: ParsedNarrative['direction']
  if (typeof raw.direction === 'string') {
    direction = raw.direction
  } else if (typeof raw.direction === 'object' && raw.direction !== null) {
    const wd: Record<string, { direction?: string; magnitude?: number }> = {}
    for (const [key, val] of Object.entries(raw.direction)) {
      if (val && typeof val === 'object' && 'direction' in val) {
        wd[key] = { direction: String(val.direction), magnitude: Number(val.magnitude ?? 0.3) }
      }
    }
    direction = Object.keys(wd).length > 0 ? wd : undefined
  }

  return {
    narrative,
    // 解析阶段只做结构映射。完整数组必须原样进入整包拦截器，禁止先删非法项后部分提交。
    changes: mapRawNarrativeChanges(raw.changes),
    notableEvents: metadata?.notableEvents ?? [],
    metadataRejected: Boolean(metadataResult && !metadataResult.success),
    direction,
    creations: metadata?.creations?.length ? metadata.creations : undefined,
    foreshadowing: metadata?.foreshadowing?.length ? metadata.foreshadowing : undefined,
    importance: metadata?.importance,
    digest: metadata?.digest,
    keyEvents: metadata?.keyEvents,
    arcStatus: metadata?.arcStatus,
    semanticSignals: metadata?.semanticSignals,
    branch: metadata?.branch === true,
    branchTitle: metadata?.branchTitle,
    branchOptions: normalizeNarrativeBranchOptions(metadata?.branchOptions),
  }
}

// ============================================================
// 解析策略接口
// ============================================================

export interface ParseStrategy {
  /** 策略名称（用于日志和统计） */
  readonly name: string
  /**
   * 尝试解析 AI 响应
   * @param content 原始 AI 响应文本
   * @param processor 中文文本处理器
   * @returns 解析成功返回 ParsedNarrative，失败返回 null
   */
  parse(content: string, processor: ChineseTextProcessor): ParsedNarrative | null
}

// ============================================================
// L0: [NARRATIVE] + [META] 信封解析策略
// ============================================================

export class TaggedMetaParseStrategy implements ParseStrategy {
  readonly name = 'tagged-meta-parse'

  parse(content: string, processor: ChineseTextProcessor): ParsedNarrative | null {
    const envelope = extractTaggedMetaEnvelope(content)
    if (!envelope) return null

    try {
      const raw = normalizeNarrativeResponseMetadata(JSON.parse(envelope.metaJson)) as RawAIResponse
      return parseRawAIResponse(raw, processor, envelope.narrative)
    } catch {
      return null
    }
  }
}

// ============================================================
// L1: JSON 解析策略（旧格式降级）
// ============================================================

export class JsonParseStrategy implements ParseStrategy {
  readonly name = 'json-parse'

  parse(content: string, processor: ChineseTextProcessor): ParsedNarrative | null {
    try {
      const raw = normalizeNarrativeResponseMetadata(JSON.parse(content)) as RawAIResponse
      return parseRawAIResponse(raw, processor)
    } catch {
      return null
    }
  }
}

// ============================================================
// L1: 正则提取策略
// ============================================================

export class RegexExtractStrategy implements ParseStrategy {
  readonly name = 'regex-extract'

  parse(content: string, processor: ChineseTextProcessor): ParsedNarrative | null {
    const extracted = this.extractNarrativeField(content, processor)
    if (!extracted) return null
    return { narrative: extracted, changes: [], notableEvents: [] }
  }

  /**
   * L1 降级：从残缺 JSON 中提取 narrative 字段
   * 包含中文引号标准化 + 多版本文本交叉匹配
   */
  private extractNarrativeField(raw: string, processor: ChineseTextProcessor): string | null {
    // 纯文本快捷判断 —— 不以 { 或 [ 开头则全文当叙事返回
    const trimmed = raw.trimStart()
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return raw.length >= 20 ? raw : null
    }

    const normalized = processor.normalizeQuotes(raw)

    // 中文上下文中的引号转义：将 中文"某词"中文 → 中文\"某词\"中文
    const chineseAware = normalized
      .replace(/([\u4e00-\u9fff])"([\u4e00-\u9fff])/g, '$1\\"$2')
      .replace(/([\u4e00-\u9fff])'([\u4e00-\u9fff])/g, "$1\\'$2")

    const patterns = [
      /"narrative"\s*:\s*"((?:[^"\\]|\\.)*)"/,
      /"叙事"\s*:\s*"((?:[^"\\]|\\.)*)"/,
      /"n"\s*:\s*"((?:[^"\\]|\\.)*)"/,
    ]

    let best: string | null = null

    // 对原始 / 标准化 / 中文感知三个版本分别匹配，取最长结果
    for (const version of [raw, normalized, chineseAware]) {
      for (const re of patterns) {
        const m = version.match(re)
        if (m && m[1]) {
          const text = processor.unescapeJson(m[1])
          if (!best || text.length > best.length) {
            best = text
          }
        }
      }
    }

    return best
  }
}

// ============================================================
// L2: 纯文本策略
// ============================================================

export class PlainTextStrategy implements ParseStrategy {
  readonly name = 'plain-text'

  parse(content: string, processor: ChineseTextProcessor): ParsedNarrative | null {
    const chineseBlock = processor.extractLongestChineseBlock(content)
    if (!chineseBlock) return null
    return { narrative: chineseBlock, changes: [] as SubSystemChanges[], notableEvents: [] }
  }
}
