/**
 * @module normalize-narrative-paragraphs.ts
 * @description 叙事正文规范化 —— 保留模型给出的自然段落
 * @mod mod-engine
 */

const COMMON_CJK_VARIANTS: Record<string, string> = {
  '晩': '晚',
}

function normalizeCommonCjkVariants(text: string): string {
  return text.replace(/[晩]/g, (char) => COMMON_CJK_VARIANTS[char] ?? char)
}

/**
 * 只处理模型偶发的转义换行与常见异体字，不合并、拆分或删减段落。
 */
export function normalizeNarrativeParagraphs(text: string): string {
  return normalizeCommonCjkVariants(text.trim().replace(/\\n/g, '\n'))
}
