/**
 * @module compression-gate.ts
 * @description 压缩唯一 AI 闸门：首次失败后恰好发起两路并发重试
 * @mod mod-engine
 */

export interface CompressionGateAttemptContext {
  attempt: 1 | 2 | 3
  signal: AbortSignal
}

export interface CompressionGateResult<TResult> {
  status: 'not-due' | 'succeeded'
  attemptsStarted: number
  retryAttemptsStarted: number
  result?: TResult
}

export class CompressionGateError extends Error {
  readonly attemptsStarted: number
  readonly retryErrors: unknown[]

  constructor(initialError: unknown, retryErrors: unknown[]) {
    super('压缩首次调用及两路并发重试均失败', { cause: initialError })
    this.name = 'CompressionGateError'
    this.attemptsStarted = 3
    this.retryErrors = retryErrors
  }
}

async function firstSuccessful<TResult>(
  attempts: Array<{
    controller: AbortController
    promise: Promise<TResult>
  }>,
): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    const errors: unknown[] = []
    let remaining = attempts.length
    let settled = false

    attempts.forEach((entry, index) => {
      entry.promise.then((result) => {
        if (settled) return
        settled = true
        for (const other of attempts) {
          if (other !== entry) other.controller.abort('compression-retry-lost-race')
        }
        resolve(result)
      }).catch((error) => {
        errors[index] = error
        remaining--
        if (!settled && remaining === 0) reject(errors)
      })
    })
  })
}

export async function runCompressionGate<TResult>(input: {
  due: boolean
  attempt: (context: CompressionGateAttemptContext) => Promise<TResult>
}): Promise<CompressionGateResult<TResult>> {
  if (!input.due) {
    return {
      status: 'not-due',
      attemptsStarted: 0,
      retryAttemptsStarted: 0,
    }
  }

  const initialController = new AbortController()
  try {
    const result = await input.attempt({ attempt: 1, signal: initialController.signal })
    return {
      status: 'succeeded',
      attemptsStarted: 1,
      retryAttemptsStarted: 0,
      result,
    }
  } catch (initialError) {
    const retryControllers = [new AbortController(), new AbortController()]
    const retries = retryControllers.map((controller, index) => ({
      controller,
      promise: input.attempt({
        attempt: (index + 2) as 2 | 3,
        signal: controller.signal,
      }),
    }))
    try {
      const result = await firstSuccessful(retries)
      return {
        status: 'succeeded',
        attemptsStarted: 3,
        retryAttemptsStarted: 2,
        result,
      }
    } catch (retryErrors) {
      throw new CompressionGateError(
        initialError,
        Array.isArray(retryErrors) ? retryErrors : [retryErrors],
      )
    }
  }
}
