/**
 * @module conversation-messages.ts
 * @description S3 多轮 assistant 滑动窗口消息构建（Phase 7 / 6D-5）
 * @mod core
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ConversationBuildOptions {
  systemPrompt: string
  /** 与 S1 相同的 stable + slow JSON 前缀 */
  stableUserJson: string
  /** 保留最近 N 对 user/assistant（默认 KV_CONVERSATION_WINDOW） */
  slidingWindow: number
  /** 本轮速变 JSON（不含 narrativeHistory） */
  currentUserJson: string
  /** 历史叙事全文（orchestrator narrativeHistory） */
  narrativeHistory: string[]
}

/** 固定 assistant 确认 —— 稳定前缀的一部分，利于 KV 命中 */
const STABLE_ACK =
  '已读取全局信息，将按中文协议生成三段正文、摘要与按需数据。'

/**
 * S3 消息链：
 * system → user(stable) → assistant(ack) → [user/assistant × N] → user(current)
 */
export function buildConversationMessages(opts: ConversationBuildOptions): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: 'system', content: opts.systemPrompt },
    { role: 'user', content: opts.stableUserJson },
    { role: 'assistant', content: STABLE_ACK },
  ]

  const window = opts.narrativeHistory.slice(-Math.max(0, opts.slidingWindow))
  for (let i = 0; i < window.length; i++) {
    messages.push({
      role: 'user',
      content: JSON.stringify({ 继续: true, 此前轮次: i + 1 }),
    })
    messages.push({
      role: 'assistant',
      content: window[i],
    })
  }

  messages.push({ role: 'user', content: opts.currentUserJson })
  return messages
}
