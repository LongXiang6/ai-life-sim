/**
 * @module api-error.ts
 * @description AI API 代理错误诊断工具 —— 将 HTTP 状态码和错误文本映射为用户友好的诊断消息
 * @mod core
 *
 * 废弃项目参考：src/lib/utils/api-error.ts
 */

export interface ApiDiagnostic {
  level: 'error' | 'warn' | 'info'
  summary: string
  detail: string
  suggestion: string
}

function matchKeyword(text: string, keywords: string[]): boolean {
  return keywords.some(kw => text.toLowerCase().includes(kw.toLowerCase()))
}

/**
 * 根据 HTTP 状态码和错误文本诊断 API 错误
 * @param status - HTTP 状态码
 * @param errorText - 错误响应文本
 * @returns 诊断结果（包含级别、摘要、详情和建议）
 */
export function diagnoseApiError(status: number, errorText: string): ApiDiagnostic {
  if (status === 400) {
    if (matchKeyword(errorText, ['api key', 'apikey'])) {
      return {
        level: 'error',
        summary: 'API Key 未配置',
        detail: '服务端未检测到有效的 API Key。请在设置面板中填入你的 API Key、URL 和模型名。',
        suggestion: '→ 打开设置 → 模型调用 → 在自定义 AI 模型中填入 API Key、网址和模型名称后保存',
      }
    }
    if (matchKeyword(errorText, ['model'])) {
      return {
        level: 'error',
        summary: 'AI 模型配置错误',
        detail: `模型名称可能无效或不存在：${errorText.slice(0, 200)}`,
        suggestion: '→ 请在设置面板中确认模型名称与 API 提供商匹配',
      }
    }
    return {
      level: 'error',
      summary: '请求参数错误',
      detail: `代理返回 400：${errorText.slice(0, 300)}`,
      suggestion: '→ 请检查设置面板中 API 地址（URL）是否正确\n→ 确认请求参数是否在 API 允许范围内',
    }
  }

  if (status === 401 || status === 403) {
    return {
      level: 'error',
      summary: 'API Key 无效或权限不足',
      detail: `认证失败（${status}）：${errorText.slice(0, 200)}`,
      suggestion: '→ 检查 API Key 是否过期或被撤销\n→ 确认该 API Key 有权限访问指定的模型\n→ 如使用自定义模式，检查 Key/URL/模型名三者是否匹配',
    }
  }

  if (status === 429) {
    return {
      level: 'warn',
      summary: '请求过于频繁',
      detail: 'API 触发了频率限制，请稍后再试',
      suggestion: '→ 等待 1-2 分钟后重试\n→ 检查是否多个请求在短时间内同时发出',
    }
  }

  if (status === 502) {
    return {
      level: 'error',
      summary: 'AI 服务网关错误',
      detail: 'AI API 服务器返回 502 Bad Gateway，通常为上游服务暂时不可用',
      suggestion: '→ 检查 AI_BASE_URL 地址是否正确\n→ 稍后重试，可能是 API 提供商临时故障',
    }
  }

  if (status === 504) {
    return {
      level: 'warn',
      summary: 'AI 请求超时',
      detail: 'AI API 在指定时间内未完成响应',
      suggestion: '→ 检查网络连接稳定性\n→ 确认 API 地址是否正确\n→ 简化请求内容后重试',
    }
  }

  if (status >= 500) {
    return {
      level: 'error',
      summary: 'AI 服务端错误',
      detail: `AI API 服务器返回 ${status}：${errorText.slice(0, 300)}`,
      suggestion: '→ 稍后重试，可能是 API 提供商临时故障\n→ 检查 AI_BASE_URL 配置是否正确',
    }
  }

  return {
    level: 'error',
    summary: 'API 请求失败',
    detail: `HTTP ${status}：${errorText.slice(0, 300)}`,
    suggestion: '→ 检查网络连接\n→ 确认 API 配置是否正确\n→ 稍后重试',
  }
}

/**
 * 根据错误消息文本诊断（无状态码时使用）
 * @param errorMessage - 错误消息文本
 * @returns 诊断结果
 */
export function diagnoseProxyError(errorMessage: string): ApiDiagnostic {
  if (errorMessage.includes('API Key 未配置') || errorMessage.includes('未配置 API Key')) {
    return {
      level: 'error',
      summary: 'API Key 未配置',
      detail: '服务端未检测到有效的 API Key。',
      suggestion: '→ 打开设置 → 模型调用 → 填入 API Key、网址和模型名称后保存',
    }
  }
  if (errorMessage.includes('无效') || errorMessage.includes('权限不足')) {
    return {
      level: 'error',
      summary: 'API Key 无效',
      detail: errorMessage,
      suggestion: '→ 检查 API Key 是否正确\n→ 确认 API Key 有权限访问指定模型',
    }
  }
  if (errorMessage.includes('频繁')) {
    return {
      level: 'warn',
      summary: '请求过于频繁',
      detail: errorMessage,
      suggestion: '→ 等待 1-2 分钟后重试',
    }
  }
  if (errorMessage.includes('超时')) {
    return {
      level: 'warn',
      summary: 'AI 请求超时',
      detail: errorMessage,
      suggestion: '→ 检查网络连接\n→ 确认 API 地址是否正确',
    }
  }

  return {
    level: 'error',
    summary: 'AI 服务异常',
    detail: errorMessage,
    suggestion: '→ 检查 API 配置是否正确\n→ 稍后重试',
  }
}
