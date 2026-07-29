import 'server-only'

import { ZodError } from 'zod'

import { accountErrorResponse, jsonNoStore } from '@/core/account/account-http'

import { PlayerContentServiceError } from './player-content-error'

export function playerContentErrorResponse(error: unknown): Response {
  if (error instanceof PlayerContentServiceError) {
    return jsonNoStore({ error: error.message, code: error.code }, { status: error.status })
  }
  if (error instanceof ZodError) {
    return jsonNoStore({ error: '请求内容不符合要求', code: 'invalid_player_content' }, { status: 400 })
  }
  if (error instanceof SyntaxError) {
    return jsonNoStore({ error: '请求内容不是有效 JSON', code: 'invalid_json' }, { status: 400 })
  }
  return accountErrorResponse(error)
}

export async function readBoundedRequestBody(request: Request, limit: number): Promise<Buffer> {
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new PlayerContentServiceError('请求内容过大', 413, 'player_content_too_large')
  }
  if (!request.body) return Buffer.alloc(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel()
        throw new PlayerContentServiceError('请求内容过大', 413, 'player_content_too_large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, total)
}
