/**
 * @module debug-logger.ts
 * @description 客户端 AI 调试日志工具 —— 按分类发送 AI 调用日志到服务端
 * @mod core
 *
 * 生产环境默认继续采集；公开查看能力由页面与服务端路由独立关闭。
 * 废弃项目参考：src/lib/utils/debug-ai-logger.ts
 */

const LOG_API = '/api/debug-log'

/** 日志分类 */
export type DebugLogCategory =
  | 'narrative-rounds'
  | 'world-init'
  | 'talent-generate'
  | 'epilogue'
  | 'background-events'

/** 日志条目 */
export interface DebugLogEntry {
  category: DebugLogCategory
  timestamp: number
  /** 轮次序号 */
  round?: number
  /** 角色年龄 */
  age?: number
  /** 纪元 */
  era?: string
  /** 完整 prompt（发送给 AI 的内容） */
  prompt?: string
  /** AI 完整响应 */
  response?: string
  /** 代理返回的关联请求 ID */
  requestId?: string
  /** 元信息 */
  meta?: Record<string, unknown>
}

/** 检查是否禁用调试日志 */
function isDisabled(): boolean {
  if (typeof process === 'undefined') return false
  return process.env.NEXT_PUBLIC_DISABLE_DEBUG_LOG_COLLECTION === 'true'
}

function withRequestId(entry: DebugLogEntry): DebugLogEntry {
  const requestId = entry.requestId
    ?? (typeof entry.meta?.requestId === 'string' ? entry.meta.requestId : undefined)
  return requestId ? { ...entry, requestId } : entry
}

/**
 * 发送 AI 调用日志到服务端（异步）
 * @param entry - 日志条目
 * @returns 空 Promise（失败静默忽略）
 */
export async function logAICall(entry: DebugLogEntry): Promise<void> {
  if (isDisabled()) return

  try {
    await fetch(LOG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(withRequestId(entry)),
    })
  } catch {
    // 日志发送失败静默忽略，不阻塞主流程
  }
}

/**
 * 发送 AI 调用日志（异步，等待响应）
 * @param entry - 日志条目
 * @returns 发送成功返回 true，失败返回 false
 */
/** sendBeacon 有效载荷约 64KB，超大日志改用 fetch keepalive */
const SEND_BEACON_MAX_BYTES = 48_000

export async function logAICallFireAndForget(entry: DebugLogEntry): Promise<boolean> {
  if (isDisabled()) return false

  const payload = JSON.stringify(withRequestId(entry))
  const useFetch = payload.length > SEND_BEACON_MAX_BYTES
    || typeof navigator === 'undefined'
    || !navigator.sendBeacon

  if (!useFetch) {
    const blob = new Blob([payload], { type: 'application/json' })
    if (navigator.sendBeacon(LOG_API, blob)) return true
  }

  try {
    const resp = await fetch(LOG_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    })
    return resp.ok
  } catch {
    return false
  }
}

/**
 * 构建叙事轮次日志条目
 * @param round - 轮次序号
 * @param age - 角色年龄
 * @param era - 纪元名称
 * @param prompt - 发送给 AI 的完整 prompt
 * @param response - AI 完整响应
 * @param meta - 可选元信息
 * @returns 日志条目
 */
export function buildNarrativeLog(
  round: number,
  age: number,
  era: string,
  prompt: string,
  response: string,
  meta?: Record<string, unknown>
): DebugLogEntry {
  return {
    category: 'narrative-rounds',
    timestamp: Date.now(),
    round,
    age,
    era,
    prompt,
    response,
    meta,
  }
}
