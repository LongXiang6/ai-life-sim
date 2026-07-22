/**
 * @module stream-timeout.ts
 * @description AI 流式读取的空闲超时，防止首字节后无限等待。
 * @mod core
 */

export const AI_STREAM_IDLE_TIMEOUT_MS = 45_000

export class AIStreamIdleTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`AI 流式响应超过 ${timeoutMs}ms 未产生新数据`)
    this.name = 'AIStreamIdleTimeoutError'
  }
}

export async function readStreamWithIdleTimeout<T>(
  reader: Pick<ReadableStreamDefaultReader<T>, 'read'>,
  timeoutMs = AI_STREAM_IDLE_TIMEOUT_MS,
): Promise<ReadableStreamReadResult<T>> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return reader.read()

  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      reader.read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new AIStreamIdleTimeoutError(timeoutMs)), timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
