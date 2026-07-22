export interface AggregatedSseCompletion {
  responseBody: string
  contentChars: number
}

/**
 * 将托管通道的完整 SSE 上游结果聚合为客户端原本期望的非流式 OpenAI 响应。
 * 该适配只改变传输方式，不删减正文；缺少 [DONE]、非法事件或空正文一律失败。
 */
export async function aggregateSseCompletion(
  stream: ReadableStream<Uint8Array>,
): Promise<AggregatedSseCompletion> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let completionId: string | undefined
  let created: number | undefined
  let upstreamModel: string | undefined
  let finishReason: string | null = null
  let usage: unknown
  let completed = false

  const consumeLine = (rawLine: string) => {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data) return
    if (data === '[DONE]') {
      completed = true
      return
    }

    let event: Record<string, unknown>
    try {
      event = JSON.parse(data) as Record<string, unknown>
    } catch {
      throw new Error('托管通道返回了无法解析的 SSE 事件')
    }

    if (typeof event.id === 'string') completionId = event.id
    if (typeof event.created === 'number') created = event.created
    if (typeof event.model === 'string') upstreamModel = event.model
    if (event.usage !== undefined) usage = event.usage

    const choice = Array.isArray(event.choices) ? event.choices[0] : undefined
    if (!choice || typeof choice !== 'object') return
    const choiceRecord = choice as Record<string, unknown>
    const delta = choiceRecord.delta
    if (delta && typeof delta === 'object') {
      const chunk = (delta as Record<string, unknown>).content
      if (typeof chunk === 'string') content += chunk
    }
    if (typeof choiceRecord.finish_reason === 'string') {
      finishReason = choiceRecord.finish_reason
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) consumeLine(line)
  }

  buffer += decoder.decode()
  if (buffer) consumeLine(buffer)
  if (!completed) throw new Error('托管通道 SSE 未返回完整结束标记')
  if (finishReason === 'length') throw new Error('托管通道 SSE 达到 max_tokens，正文可能不完整')
  if (!content) throw new Error('托管通道 SSE 返回空正文')

  const completion: Record<string, unknown> = {
    id: completionId,
    object: 'chat.completion',
    created,
    model: upstreamModel,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: finishReason ?? 'stop',
    }],
  }
  if (usage !== undefined) completion.usage = usage
  return {
    responseBody: JSON.stringify(completion),
    contentChars: content.length,
  }
}
