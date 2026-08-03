/**
 * Purpose: Send one server-side world initialization request to the player-configured provider.
 * Owner: app:api
 * Responsibility: Validate provider coordinates, perform transport, and return response text only.
 */

const AI_TIMEOUT_MS = 120_000

export interface PipelineOptions {
  apiKey?: string
  baseUrl?: string
  model?: string
}

export interface DirectProviderOptions extends PipelineOptions {
  temperature?: number
  jsonMode?: boolean
}

export async function callProviderDirect(
  systemPrompt: string,
  userPrompt: string,
  options: DirectProviderOptions,
): Promise<string> {
  const apiKey = options.apiKey?.trim() || ''
  const baseUrl = options.baseUrl?.trim().replace(/\/+$/u, '') || ''
  const model = options.model?.trim() || ''
  if (!apiKey || !baseUrl || !model) throw new Error('玩家 API Key、接口或模型未完整配置')

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: options.temperature ?? 0.3,
    stream: false,
  }
  if (options.jsonMode) body.response_format = { type: 'json_object' }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  })
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`玩家 API ${response.status}: ${errorText.slice(0, 500)}`)
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = data.choices?.[0]?.message?.content
  if (!content || content.trim() === '') throw new Error(`${model} 返回空内容`)
  return content
}
