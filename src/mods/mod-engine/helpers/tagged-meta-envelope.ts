/**
 * Purpose: Normalize one main-story response into a publishable narrative with optional branch or ending.
 * Owner: mod-engine
 * Responsibility: Recover usable response shapes without inventing narrative facts or owning round state.
 *
 * @module tagged-meta-envelope.ts
 */

import type {
  NarrativeAIBranch,
  NarrativeAIEnding,
} from './narrative-ai-protocol'
import { parseAIJSON, parseAIJSONCandidates } from '@/core/ai-service/parse-ai-json'

export interface NarrativeResponseEnvelope {
  narrative: string
  branch?: NarrativeAIBranch
  ending?: NarrativeAIEnding
}

export interface NarrativeResponseEnvelopeOptions {
  /** 只用于补全已在本轮引导中明确封闭的终态，绝不从普通正文猜测结局。 */
  terminalGuidance?: string
}

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined
}

function normalizedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

function normalizedKey(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, '').toLocaleLowerCase()
}

function normalizeNarrative(value: unknown): string | undefined {
  const text = normalizedText(value)
  if (!text) return undefined
  return text.replace(/^```(?:json|text|markdown)?\s*/iu, '').replace(/\s*```$/u, '').trim() || undefined
}

function normalizeOptionalJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (!text || /^null$/iu.test(text)) return undefined
  if (!/^[{[]/u.test(text)) return value
  return parseAIJSON(text) ?? value
}

function extractCompleteJsonStringField(source: string, field: string): string | undefined {
  const escapedField = field.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const pattern = new RegExp(`"${escapedField}"\\s*:\\s*"`, 'gu')
  const matches = [...source.matchAll(pattern)]
  if (matches.length !== 1) return undefined

  const match = matches[0]
  const quoteIndex = (match.index ?? 0) + match[0].length - 1
  let escaped = false
  for (let index = quoteIndex + 1; index < source.length; index += 1) {
    const character = source[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === '\\') {
      escaped = true
      continue
    }
    if (character !== '"') continue
    try {
      const parsed = JSON.parse(source.slice(quoteIndex, index + 1))
      return typeof parsed === 'string' && parsed.trim() ? parsed : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

function normalizeBranch(value: unknown): NarrativeAIBranch | undefined {
  const normalized = normalizeOptionalJsonValue(value)
  const record = asRecord(normalized)
  const source = Array.isArray(normalized) ? normalized : record?.选项
  if (!Array.isArray(source)) return undefined

  const known = new Set<string>()
  const options: string[] = []
  for (const item of source) {
    const text = normalizedText(item)?.replace(/^\s*(?:[-*]|\d+[.、])\s*/u, '')
    if (!text) continue
    const key = normalizedKey(text)
    if (known.has(key)) continue
    known.add(key)
    options.push(text)
    if (options.length === 4) break
  }
  return options.length >= 2 ? { 选项: options } : undefined
}

function normalizeEnding(value: unknown): NarrativeAIEnding | undefined {
  const normalized = normalizeOptionalJsonValue(value)
  const record = asRecord(normalized)
  const title = normalizedText(record?.四字评语 ?? normalized)?.replace(/\s+/gu, '')
  return title && Array.from(title).length === 4 ? { 四字评语: title } : undefined
}

function parseJsonRecord(source: string): JsonRecord | undefined {
  const candidates = parseAIJSONCandidates<unknown>(source, {
    recoverUnclosedString: {
      field: '正文',
      followingTopLevelFields: ['正文', '分支', '结局'],
    },
  })
  const records = candidates.map((candidate) => asRecord(candidate.value)).filter((value): value is JsonRecord => Boolean(value))
  return records.find((record) => Object.keys(record).some((key) => ['正文', '故事', '内容', 'narrative', 'story'].includes(normalizedKey(key))))
    ?? records[0]
}

function pickEnvelopeField(record: JsonRecord | undefined, keys: readonly string[]): unknown {
  if (!record) return undefined
  const normalized = new Map(Object.entries(record).map(([key, value]) => [normalizedKey(key), value]))
  for (const key of keys) {
    const value = normalized.get(normalizedKey(key))
    if (value !== undefined) return value
  }
  return undefined
}

function extractTaggedFields(source: string): {
  narrative?: string
  branch?: unknown
  ending?: unknown
} {
  const matches = [...source.matchAll(/⟦(正文|分支|结局)⟧/gu)]
  if (matches.length === 0) return {}

  let narrative: string | undefined
  let branch: unknown
  let ending: unknown
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const next = matches[index + 1]
    const start = (match.index ?? 0) + match[0].length
    const section = source.slice(start, next?.index).trim()
    if (!section) continue
    if (match[1] === '正文' && !narrative) narrative = normalizeNarrative(section)
    if (match[1] === '分支' && branch === undefined) branch = parseAIJSON(section) ?? section
    if (match[1] === '结局' && ending === undefined) ending = parseAIJSON(section) ?? section
  }
  return { narrative, branch, ending }
}

function isExplicitPermanentNoAgency(guidance: string | undefined): boolean {
  if (!guidance) return false
  const text = guidance.replace(/\s+/gu, '')
  const permanent = /永久|不可逆|无法逆转|不可恢复|永不恢复/u.test(text)
  const noAgency = /(?:无|没有|失去|丧失|不再拥有)[^。；\n]{0,36}意识[^。；\n]{0,18}感知[^。；\n]{0,18}决定[^。；\n]{0,18}行动/u.test(text)
    || /意识[^。；\n]{0,18}感知[^。；\n]{0,18}决定[^。；\n]{0,18}行动[^。；\n]{0,24}(?:消失|丧失|不复存在)/u.test(text)
  return permanent && noAgency
}

function hasCompletedTerminalNarrative(narrative: string): boolean {
  const tail = narrative.slice(-600)
  return /晶化|晶核|死亡|死去|身亡|化作|化为|永眠|意识[^。；\n]{0,24}(?:消失|熄灭|抽离)|再没有(?:任何)?意识|不再醒来/u.test(tail)
}

/**
 * 主故事优先发布同次响应中可可靠识别的正文。JSON 是首选媒介；旧标签与普通正文
 * 是同一玩家结果的兼容输入。只有完全找不到正文时才拒绝，绝不补写故事正文。
 */
export function parseNarrativeResponseEnvelope(
  content: string,
  options: NarrativeResponseEnvelopeOptions = {},
): NarrativeResponseEnvelope {
  const source = content.trim()
  if (!source) throw new Error('主故事响应为空，无法提取正文')

  const json = parseJsonRecord(source)
  const tagged = json ? {} : extractTaggedFields(source)
  const recoveredJsonNarrative = json ? undefined : normalizeNarrative(extractCompleteJsonStringField(source, '正文'))
  const looksLikeJsonProtocol = /^[{[]/u.test(source)
  const narrative = normalizeNarrative(pickEnvelopeField(json, ['正文', '故事', '内容', 'narrative', 'story']))
    ?? tagged.narrative
    ?? recoveredJsonNarrative
    ?? (json || looksLikeJsonProtocol ? undefined : normalizeNarrative(source))
  if (!narrative) throw new Error('主故事响应缺少可用正文')

  const directEnding = normalizeEnding(pickEnvelopeField(json, ['结局', '终局', 'ending']) ?? tagged.ending)
  const inferredEnding = !directEnding
    && isExplicitPermanentNoAgency(options.terminalGuidance)
    && hasCompletedTerminalNarrative(narrative)
    ? { 四字评语: '此生已尽' }
    : undefined
  const ending = directEnding ?? inferredEnding
  const branch = ending ? undefined : normalizeBranch(pickEnvelopeField(json, ['分支', '选择', '选项', 'branch', 'branches']) ?? tagged.branch)

  return {
    narrative,
    ...(branch ? { branch } : {}),
    ...(ending ? { ending } : {}),
  }
}
