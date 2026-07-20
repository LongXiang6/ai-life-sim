import 'server-only'

import {
  AI_PROVIDERS,
  isServerManagedProvider,
} from './provider-config'

/**
 * 服务器托管目标地址权威。
 *
 * 托管通道只从服务器私有环境读取，不得经 ai-service/index.ts 导出，
 * 也不得写入浏览器状态、构建产物、响应或日志。
 */
const SERVER_PROVIDER_TARGET_ENV: Record<string, string> = {
  managed: 'LONGCAT_BASE_URL',
  'managed-a6': 'MANAGED_A6_BASE_URL',
}

function normalizeProviderBaseUrl(baseUrl: string): string | undefined {
  try {
    const parsed = new URL(baseUrl)
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      return undefined
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/u, '')}`
  } catch {
    return undefined
  }
}

export function readServerProviderBaseUrl(providerId: string): string {
  const envName = SERVER_PROVIDER_TARGET_ENV[providerId]
  const configured = envName ? process.env[envName]?.trim() : AI_PROVIDERS[providerId]?.baseUrl?.trim()
  return configured ? normalizeProviderBaseUrl(configured) ?? '' : ''
}

export function hasServerProviderTarget(providerId: string): boolean {
  return Boolean(readServerProviderBaseUrl(providerId))
}

/** 受保护 Prompt 的自定义目标校验只在服务端执行，不向浏览器返回目标清单。 */
export function isRegisteredServerProviderBaseUrl(baseUrl: string): boolean {
  const normalized = normalizeProviderBaseUrl(baseUrl)
  if (!normalized) return false
  return Object.keys(AI_PROVIDERS).some((providerId) => (
    normalizeProviderBaseUrl(readServerProviderBaseUrl(providerId)) === normalized
  ))
}

export function isTrustedServerPromptTarget(providerId: string, baseUrl: string): boolean {
  if (providerId === 'custom') return isRegisteredServerProviderBaseUrl(baseUrl)
  if (!AI_PROVIDERS[providerId]) return false
  if (isServerManagedProvider(providerId)) return hasServerProviderTarget(providerId)
  return normalizeProviderBaseUrl(readServerProviderBaseUrl(providerId))
    === normalizeProviderBaseUrl(baseUrl)
}
