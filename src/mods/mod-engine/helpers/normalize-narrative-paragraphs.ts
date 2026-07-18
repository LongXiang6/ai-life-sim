/**
 * @module normalize-narrative-paragraphs.ts
 * @description 叙事段落规范化 —— 无损整理为固定三段
 * @mod mod-engine
 */

const COMMON_CJK_VARIANTS: Record<string, string> = {
  '晩': '晚',
}

const NATURAL_BOUNDARY_CHARS = new Set([
  '。', '！', '？', '…', '.', '!', '?',
  '；', ';', '，', ',', '：', ':', '—',
])

function normalizeCommonCjkVariants(text: string): string {
  return text.replace(/[晩]/g, (char) => COMMON_CJK_VARIANTS[char] ?? char)
}

function splitParagraphNearMiddle(text: string): [string, string] | null {
  const chars = Array.from(text)
  if (chars.length < 2) return null

  const middle = chars.length / 2
  const candidates: number[] = []
  for (let i = 1; i < chars.length; i++) {
    if (NATURAL_BOUNDARY_CHARS.has(chars[i - 1]) || /\s/u.test(chars[i - 1])) {
      candidates.push(i)
    }
  }

  const splitAt = candidates.length > 0
    ? candidates.reduce((best, candidate) => (
        Math.abs(candidate - middle) < Math.abs(best - middle) ? candidate : best
      ))
    : Math.floor(middle)

  const left = chars.slice(0, splitAt).join('').trimEnd()
  const right = chars.slice(splitAt).join('').trimStart()
  return left && right ? [left, right] : null
}

function mergeParagraphsToThree(paragraphs: string[]): string[] {
  const baseSize = Math.floor(paragraphs.length / 3)
  const remainder = paragraphs.length % 3
  const merged: string[] = []
  let cursor = 0

  for (let group = 0; group < 3; group++) {
    const size = baseSize + (group < remainder ? 1 : 0)
    merged.push(paragraphs.slice(cursor, cursor + size).join('\n'))
    cursor += size
  }

  return merged
}

/**
 * 将正文无损整理为严格三段。
 *
 * - 多于三段：按原顺序合并相邻段落；
 * - 少于三段：优先在句末/分句/空格附近拆分最长段落；
 * - 不删除不完整尾句，不使用长度上限截断正文。
 */
export function normalizeNarrativeParagraphs(text: string): string {
  const normalized = normalizeCommonCjkVariants(text.trim().replace(/\\n/g, '\n'))
  if (!normalized) return normalized

  let paragraphs = normalized
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  if (paragraphs.length > 3) {
    paragraphs = mergeParagraphsToThree(paragraphs)
  }

  while (paragraphs.length < 3) {
    const candidateIndex = paragraphs.reduce((longestIndex, paragraph, index) => (
      Array.from(paragraph).length > Array.from(paragraphs[longestIndex]).length
        ? index
        : longestIndex
    ), 0)
    const split = splitParagraphNearMiddle(paragraphs[candidateIndex])
    if (!split) break
    paragraphs.splice(candidateIndex, 1, ...split)
  }

  return paragraphs.join('\n\n')
}
