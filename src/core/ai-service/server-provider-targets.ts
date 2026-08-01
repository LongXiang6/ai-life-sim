import 'server-only'

import {
  DEFAULT_AI_PROVIDER_ID,
  isRegisteredProviderBaseUrl,
} from './provider-config'

/** 受保护 Prompt 的目标校验只在服务端执行。 */
export function isRegisteredServerProviderBaseUrl(baseUrl: string): boolean {
  return isRegisteredProviderBaseUrl(baseUrl)
}

export function isTrustedServerPromptTarget(providerId: string, baseUrl: string): boolean {
  return providerId === DEFAULT_AI_PROVIDER_ID
    && isRegisteredServerProviderBaseUrl(baseUrl)
}
