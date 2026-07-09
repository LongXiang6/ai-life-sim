/**
 * @module normalize-narrative-paragraphs.ts
 * @description 叙事段落规范化 —— AI 未输出换行时在句号处拆段
 * @mod mod-engine
 */

const COMMON_CJK_VARIANTS: Record<string, string> = {
  '晩': '晚',
}

const COMPLETE_SENTENCE_END_RE = /[。！？…」”）】]$/
const SENTENCE_ENDINGS = ['。', '！', '？', '…']

function normalizeCommonCjkVariants(text: string): string {
  return text.replace(/[晩]/g, (char) => COMMON_CJK_VARIANTS[char] ?? char)
}

function trimDanglingNarrativeTail(text: string): string {
  const trimmed = text.trim()
  if (!trimmed || COMPLETE_SENTENCE_END_RE.test(trimmed)) return trimmed

  const lastSentenceEnd = Math.max(
    ...SENTENCE_ENDINGS.map((mark) => trimmed.lastIndexOf(mark)),
  )
  if (lastSentenceEnd < 0) return trimmed

  const danglingLength = trimmed.length - lastSentenceEnd - 1
  if (danglingLength > 80) return trimmed

  return trimmed.slice(0, lastSentenceEnd + 1).trim()
}

function normalizeParagraphStarts(text: string): string {
  return text
    .split(/(\n\s*\n)/)
    .map((part) => {
      if (/^\n\s*\n$/.test(part)) return part
      return part.replace(/^\s*[。！？；，、：]+/, '').trimStart()
    })
    .join('')
    .trim()
}

/** 单段过长且无换行时，按句号拆成 2–3 段 */
export function normalizeNarrativeParagraphs(text: string): string {
  const trimmed = trimDanglingNarrativeTail(
    normalizeParagraphStarts(normalizeCommonCjkVariants(text.trim())),
  )
  if (!trimmed || /\n\s*\n/.test(trimmed)) return trimmed

  const sentences = trimmed.split(/(?<=[。！？；])\s*/).filter(Boolean)
  if (sentences.length <= 2) return trimmed

  const chunkSize = Math.max(2, Math.ceil(sentences.length / 3))
  const paragraphs: string[] = []
  for (let i = 0; i < sentences.length; i += chunkSize) {
    paragraphs.push(sentences.slice(i, i + chunkSize).join(''))
  }
  return paragraphs.join('\n\n')
}
