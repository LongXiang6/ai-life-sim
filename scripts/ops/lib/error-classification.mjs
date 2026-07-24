const UPSTREAM_ERROR_PATTERNS = [
  [/unknown server prompt asset|未知服务器 prompt 资产/u, 'unknown_prompt_asset'],
  [/thinking: missing field|thinking.*missing.*type/u, 'invalid_thinking_payload'],
  [/temperature.*less than or equal|temperature.*not less/u, 'invalid_temperature'],
  [/client aborted|客户端中止/u, 'client_aborted'],
  [/timeout|timed out|超时/u, 'timeout'],
  [/missing api key|缺少 api key/u, 'missing_api_key'],
  [/connection failed|fetch failed|network/u, 'upstream_network_error'],
  [/invalid.*json|deserialize|解析/u, 'invalid_upstream_payload'],
]

export function classifyUpstreamError(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined
  const text = value.trim()
  const lower = text.toLocaleLowerCase('en-US')
  for (const [pattern, label] of UPSTREAM_ERROR_PATTERNS) {
    if (pattern.test(lower) || pattern.test(text)) return label
  }
  return 'unclassified_upstream_error'
}
