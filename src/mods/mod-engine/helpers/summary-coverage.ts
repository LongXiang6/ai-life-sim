/** 摘要完成标记只用于确认模型输出没有在技术预算处被截断。 */
export const SUMMARY_COMPLETION_MARKER = '[SUMMARY_COMPLETE]'

/**
 * 只有带完成标记且正文非空的摘要才能建立覆盖节点。
 * 缺标记或空结果必须显式失败，让调用方保留原文/低层叶子。
 */
export function requireCompletedSummaryContent(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.endsWith(SUMMARY_COMPLETION_MARKER)) {
    throw new Error('摘要缺少完整覆盖标记，拒绝建立覆盖节点')
  }
  const content = trimmed
    .replace(/\n?\[SUMMARY_COMPLETE\]\s*$/, '')
    .trim()
  if (!content) {
    throw new Error('摘要正文为空，拒绝建立覆盖节点')
  }
  return content
}
