/**
 * Purpose: Keep the shared AI request deadline active until the response body is fully consumed.
 * Owner: core:ai-service
 * Responsibility: Abort-controller and deadline lifecycle only; response parsing belongs to transport components.
 */

export interface DeadlineFetchResult {
  response: Response
  clearDeadline: () => void
}

export async function fetchWithDeadline(
  url: string,
  init: RequestInit,
  deadlineMs: number,
): Promise<DeadlineFetchResult> {
  const controller = new AbortController()
  const externalSignal = init.signal
  const onExternalAbort = () => controller.abort(externalSignal?.reason)
  if (externalSignal?.aborted) controller.abort(externalSignal.reason)
  else externalSignal?.addEventListener('abort', onExternalAbort, { once: true })
  const timeoutId = setTimeout(() => controller.abort(), deadlineMs)
  let cleared = false
  const clearDeadline = () => {
    if (cleared) return
    cleared = true
    clearTimeout(timeoutId)
    externalSignal?.removeEventListener('abort', onExternalAbort)
  }

  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    return { response, clearDeadline }
  } catch (error) {
    clearDeadline()
    throw error
  }
}
