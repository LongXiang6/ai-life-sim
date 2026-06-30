/**
 * @module stream-handler.ts
 * @description 流式响应处理器 —— SSE 解析
 * @mod core
 */

/**
 * 处理流式响应（通过 ReadableStream）
 *
 * @param response fetch 响应
 * @param onChunk 逐 chunk 回调
 * @returns 完整文本（取消时返回已接收的部分文本）
 */
export async function handleStream(response: Response, onChunk: (text: string) => void): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder()
  let fullText = ''
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data: ')) continue

        const jsonStr = trimmed.slice(6)
        if (jsonStr === '[DONE]') continue

        try {
          const parsed = JSON.parse(jsonStr)
          const content = parsed?.choices?.[0]?.delta?.content
          if (content) {
            fullText += content
            onChunk(content)
          }
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      // 用户主动取消，返回已接收文本（反模式 E-06）
      return fullText
    }
    throw err
  } finally {
    reader.releaseLock()
  }

  return fullText
}
