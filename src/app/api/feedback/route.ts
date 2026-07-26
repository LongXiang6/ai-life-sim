/**
 * @module feedback/route.ts
 * @description 玩家反馈上传入口
 * @mod app
 */

import { PlayerFeedbackEnvelopeSchema } from '@/core/logger/feedback-contract'
import { storePlayerFeedback } from '@/core/logger/player-feedback-store'
import { getServerRequestSource } from '@/core/logger/server-log-store'

const MAX_BODY_SIZE = 16 * 1024 * 1024
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_COUNT = 6
const recentSubmissions = new Map<string, number[]>()

function isDisabled(): boolean {
  return process.env.AI_DIAGNOSTIC_LOGS_ENABLED === 'false'
}

function isRateLimited(sourceId: string, now: number): boolean {
  const cutoff = now - RATE_LIMIT_WINDOW_MS
  const recent = (recentSubmissions.get(sourceId) ?? []).filter((value) => value >= cutoff)
  if (recent.length >= RATE_LIMIT_COUNT) {
    recentSubmissions.set(sourceId, recent)
    return true
  }
  recent.push(now)
  recentSubmissions.set(sourceId, recent)
  return false
}

export async function POST(request: Request): Promise<Response> {
  if (isDisabled()) {
    return Response.json({ error: '反馈服务当前不可用' }, { status: 503 })
  }

  const source = getServerRequestSource(request)
  if (isRateLimited(source.sourceId, Date.now())) {
    return Response.json({ error: '提交过于频繁，请稍后再试' }, { status: 429 })
  }

  const bodyText = await request.text().catch(() => null)
  if (!bodyText) return Response.json({ error: '反馈内容为空' }, { status: 400 })
  if (Buffer.byteLength(bodyText) > MAX_BODY_SIZE) {
    return Response.json({ error: '反馈内容过大，未保存任何内容' }, { status: 413 })
  }

  try {
    const envelope = PlayerFeedbackEnvelopeSchema.parse(JSON.parse(bodyText))
    const stored = await storePlayerFeedback(envelope, source)
    if (!stored) {
      return Response.json({ error: '服务器未能完整保存反馈，请稍后重试' }, { status: 500 })
    }
    return Response.json({ ok: true, ...stored })
  } catch {
    return Response.json({ error: '反馈格式不正确' }, { status: 400 })
  }
}
