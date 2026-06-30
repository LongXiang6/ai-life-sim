/**
 * @module chinese-text-processor.ts
 * @description 中文文本处理器 —— 引号标准化、段落分段、中文块提取、JSON 转义处理
 * @mod mod-engine
 *
 * 从 NarrativeParserSystem 中提取的纯文本处理工具，职责单一、可独立测试。
 */

/** L2 降级最小中文字符块长度（可配置类常量） */
const MIN_CHINESE_BLOCK_LENGTH = 30

export class ChineseTextProcessor {
  /**
   * 中文引号标准化
   * 将 AI 可能使用的非 ASCII 引号转换为标准 ASCII 引号
   *
   * 处理的引号类型：
   *   - 弯引号：\u201C " → "  /  \u201D " → "
   *   - 全角引号：\u300C 「 → "  /  \u300D 」 → "
   *   - 中文单引号：\u2018 ' → '  /  \u2019 ' → '
   *   - 全角单引号：\u300E 『 → '  /  \u300F 』 → '
   */
  normalizeQuotes(text: string): string {
    return text
      .replace(/\u201C|\u300C/g, '"')
      .replace(/\u201D|\u300D/g, '"')
      .replace(/\u2018|\u300E/g, "'")
      .replace(/\u2019|\u300F/g, "'")
  }

  /**
   * 叙事段落标准化 —— 将 AI 返回的长篇无换行叙事按句号智能分段
   *
   * 算法：
   *   1. 若文本已含 \n\n 分段符号 → 信任 AI 分段，不做二次处理
   *   2. 按句末标点切割句子（。！？…\.!\?）
   *   3. 累计句子，每 5 句或累计超 120 字符折为一段
   *   4. 段落间用 \n\n 分隔（前端据此渲染段落间距）
   */
  segmentParagraphs(text: string): string {
    if (!text || text.length === 0) return text
    if (/\n\s*\n/.test(text)) return text

    const sentences = text.split(/(?<=[。！？…\.!\?])\s*/).filter((s) => s.trim())
    if (sentences.length <= 1 || text.length < 20) return text

    const MAX_SENTENCES = 5
    const MAX_CHARS = 120
    const paragraphs: string[] = []
    let current = ''
    let count = 0

    for (const s of sentences) {
      const trimmed = s.trim()
      if (current && (count >= MAX_SENTENCES || (current + trimmed).length > MAX_CHARS)) {
        paragraphs.push(current.trim())
        current = trimmed
        count = 1
      } else {
        current += trimmed
        count++
      }
    }

    if (current.trim()) paragraphs.push(current.trim())
    return paragraphs.length > 1 ? paragraphs.join('\n\n') : text
  }

  /**
   * 段落分段效果评估 —— 供测试和调试使用
   * @returns 分段前后对比信息
   */
  evaluateParagraphs(original: string, segmented: string): {
    originalLength: number
    segmentedLength: number
    paragraphCount: number
    avgParagraphLength: number
  } {
    const paragraphs = segmented.split(/\n\s*\n/).filter(Boolean)
    return {
      originalLength: original.length,
      segmentedLength: segmented.length,
      paragraphCount: paragraphs.length,
      avgParagraphLength: paragraphs.length > 0
        ? Math.round(paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length)
        : 0,
    }
  }

  /**
   * 从纯文本中提取最长中文字符块
   * @param raw 原始文本
   * @param minLength 最小字符块长度，默认 30
   */
  extractLongestChineseBlock(raw: string, minLength = MIN_CHINESE_BLOCK_LENGTH): string | null {
    const re = new RegExp(
      `[\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef，。！？；：""''、《》【】（）…—\\n]{${minLength},}`,
      'g',
    )
    const matches = raw.match(re)
    if (!matches || matches.length === 0) return null
    return matches.reduce((a, b) => (b.length > a.length ? b : a), '')
  }

  /**
   * JSON 字符串转义增强处理
   * 处理 \\uXXXX Unicode 转义、\\\"、\\n、\\\\ 等
   */
  unescapeJson(s: string): string {
    return s
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\')
  }
}
