/**
 * @module normalize-narrative-paragraphs.ts
 * @description 叙事段落规范化 —— AI 未输出换行时在句号处拆段
 * @mod mod-engine
 */

/** 单段过长且无换行时，按句号拆成 2–3 段 */
export function normalizeNarrativeParagraphs(text: string): string {
  const trimmed = text.trim()
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
