/**
 * Purpose: Define player-owned API defaults and validate compatible provider targets.
 * Owner: core / ai-service
 * Responsibility: Provider identifiers, presets, and base-URL classification only.
 */

import { normalizeOpenAiCompatibleBasePath } from '@/core/shared/openai-compatible-endpoint'

export const DEFAULT_AI_PROVIDER_ID = 'custom'
export const DEEPSEEK_PRESET_BASE_URL = 'https://api.deepseek.com/v1'
export const DEEPSEEK_PRESET_MODEL = 'deepseek-flash'
export const DEFAULT_AI_BASE_URL = DEEPSEEK_PRESET_BASE_URL
export const DEFAULT_AI_MODEL = DEEPSEEK_PRESET_MODEL

export const DEEPSEEK_API_PRESET = {
  providerId: DEFAULT_AI_PROVIDER_ID,
  baseUrl: DEEPSEEK_PRESET_BASE_URL,
  model: DEEPSEEK_PRESET_MODEL,
} as const

function normalizeProviderBaseUrl(baseUrl: string): string | undefined {
  try {
    const parsed = new URL(baseUrl.trim())
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      return undefined
    }
    return normalizeOpenAiCompatibleBasePath(baseUrl)
  } catch {
    return undefined
  }
}

/**
 * 玩家自有 API 的目标必须是无凭据、无查询参数的 HTTPS 基地址。
 * 受保护 Prompt 也沿用同一目标校验，避免核心模拟绕过玩家配置。
 */
export function isRegisteredProviderBaseUrl(baseUrl: string): boolean {
  const normalized = normalizeProviderBaseUrl(baseUrl)
  return normalized !== undefined
}

/** 只有官方 DeepSeek 目标需要切换到其 beta 工具端点。 */
export function isDeepSeekOfficialBaseUrl(baseUrl: string): boolean {
  const normalized = normalizeProviderBaseUrl(baseUrl)
  return normalized !== undefined
    && normalized === normalizeProviderBaseUrl(DEEPSEEK_PRESET_BASE_URL)
}

/** 推理模式选项（用于 UI 下拉）。 */
export const REASONING_EFFORT_OPTIONS = [
  { value: 'disabled', label: '关闭', description: '不启用推理模式' },
  { value: 'auto', label: '自动', description: '由模型选择合适的推理深度' },
  { value: 'high', label: '深入', description: '要求高强度推理' },
  { value: 'max', label: '最大', description: '要求最大强度推理' },
] as const
