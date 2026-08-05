/**
 * Purpose: Classify known upstream AI failures for operational summaries.
 * Owner: operations:ai-observability
 * Responsibility: Diagnostic labels only; HTTP status and product recovery behavior remain with their runtime owners.
 */

const UPSTREAM_ERROR_PATTERNS = [
  [/unknown server prompt asset|未知服务器 prompt 资产/u, 'unknown_prompt_asset'],
  [/thinking: missing field|thinking.*missing.*type/u, 'invalid_thinking_payload'],
  [/temperature.*less than or equal|temperature.*not less/u, 'invalid_temperature'],
  [/client aborted|operation was aborted|aborterror|客户端中止/u, 'client_aborted'],
  [/timeout|timed out|deadline exceeded|超时/u, 'timeout'],
  [/token.*额度不足|额度不足|insufficient.*(?:balance|quota|credit)|quota.*exceeded/u, 'insufficient_quota'],
  [/违规信息|content.*(?:policy|violation)|safety.*filter/u, 'content_policy_rejection'],
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
