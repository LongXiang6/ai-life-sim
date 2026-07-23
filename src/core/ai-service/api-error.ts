/**
 * @module api-error.ts
 * @description AI API 错误转译层 —— 将上游 HTTP 错误映射为安全、可操作的玩家提示
 * @mod core
 *
 * 原始上游正文由代理和日志系统完整脱敏保存；本模块不得把原始响应直接显示给玩家。
 */

export interface ApiDiagnostic {
  level: 'error' | 'warn' | 'info'
  summary: string
  detail: string
  suggestion: string
}

function matchKeyword(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase()
  return keywords.some(keyword => normalized.includes(keyword.toLowerCase()))
}

function compactSuggestion(suggestion: string): string {
  return suggestion
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('；')
}

/**
 * 根据 HTTP 状态码和错误文本诊断 API 错误。
 * errorText 只用于分类，返回内容不得包含可能携带凭据或供应商内部信息的原始正文。
 */
export function diagnoseApiError(status: number, errorText: string): ApiDiagnostic {
  if (status === 400) {
    // 内容审核拒绝 - 最优先检查
    if (matchKeyword(errorText, ['违规', '敏感', '审核', '内容安全', 'content policy', 'safety', 'inappropriate'])) {
      return {
        level: 'warn',
        summary: '输入内容触发了安全审核',
        detail: 'AI 服务商因内容安全策略拒绝了本次请求。',
        suggestion: '调整输入内容，避免敏感词汇或场景描述\n或在设置中切换到审核较宽松的模型（如 DeepSeek）\n重试不会解决审核问题',
      }
    }
    if (matchKeyword(errorText, ['thinking']) && matchKeyword(errorText, ['type', 'budget_tokens'])) {
      return {
        level: 'error',
        summary: '当前模型不支持所选推理参数',
        detail: '模型拒绝了当前推理强度配置。',
        suggestion: '在设置中关闭或降低推理强度后重试\n若仍失败，将请求 ID 提供给维护者',
      }
    }
    if (matchKeyword(errorText, ['api key', 'apikey'])) {
      return {
        level: 'error',
        summary: 'API Key 尚未配置',
        detail: '当前模型通道没有可用的访问凭据。',
        suggestion: '打开”设置 → 模型调用”填写 Key、接口网址和模型名称\n或恢复服务器免费体验通道',
      }
    }
    if (matchKeyword(errorText, ['model'])) {
      return {
        level: 'error',
        summary: '模型名称或模型参数不正确',
        detail: '当前模型配置未通过接口校验。',
        suggestion: '确认模型名称与接口提供商匹配\n保存设置后重新发起请求',
      }
    }
    return {
      level: 'error',
      summary: '请求参数不正确',
      detail: '请求内容未通过接口参数校验。',
      suggestion: '检查自定义接口网址和模型名称\n若重复出现，将请求 ID 提供给维护者',
    }
  }

  if (status === 401) {
    return {
      level: 'error',
      summary: 'API Key 无效或已过期',
      detail: '接口未接受当前身份凭据。',
      suggestion: '检查或更换 API Key\n确认 Key、接口网址和模型名称属于同一提供商\n也可以恢复服务器免费体验通道',
    }
  }

  if (status === 402) {
    return {
      level: 'error',
      summary: '账户余额或调用额度不足',
      detail: '接口提供商因余额、额度或付费限制拒绝了请求。',
      suggestion: '到接口提供商控制台检查余额和套餐额度\n充值、恢复额度或切换其他可用通道后重试',
    }
  }

  if (status === 403) {
    return {
      level: 'error',
      summary: '当前 Key 没有访问权限',
      detail: '身份已被识别，但无权使用当前接口或模型。',
      suggestion: '确认 Key 已开通当前模型权限\n检查账号、地区或接口访问限制\n也可以更换模型或恢复免费体验通道',
    }
  }

  if (status === 404) {
    const modelMissing = matchKeyword(errorText, ['model'])
    return {
      level: 'error',
      summary: modelMissing ? '找不到所选模型' : '找不到 AI 接口地址',
      detail: modelMissing ? '接口提供商没有找到当前模型。' : '当前接口地址不存在或路径不正确。',
      suggestion: modelMissing
        ? '核对模型名称是否已改名、下线或尚未开通'
        : '核对接口网址及其 /v1 路径\n确认服务商当前接口文档',
    }
  }

  if (status === 408 || status === 504) {
    return {
      level: 'warn',
      summary: 'AI 请求超时',
      detail: 'AI 服务未在允许时间内完成响应。',
      suggestion: '检查网络后重试\n若持续发生，可降低单轮生成长度或更换响应更快的模型',
    }
  }

  if (status === 409) {
    return {
      level: 'warn',
      summary: '请求状态发生冲突',
      detail: '当前操作与服务端已有任务或状态冲突。',
      suggestion: '等待当前任务完成后重试\n避免连续重复提交同一操作',
    }
  }

  if (status === 413) {
    return {
      level: 'error',
      summary: '发送内容过大',
      detail: '请求大小超过了服务器或接口提供商允许的范围。',
      suggestion: '减少本轮附加内容后重试\n若正常游玩仍出现，将请求 ID 提供给维护者',
    }
  }

  if (status === 415) {
    return {
      level: 'error',
      summary: '请求格式不受支持',
      detail: '接口不接受当前请求格式。',
      suggestion: '核对自定义接口是否兼容 OpenAI 格式\n确认接口网址和模型配置正确',
    }
  }

  if (status === 422) {
    return {
      level: 'error',
      summary: '请求内容无法处理',
      detail: '请求格式有效，但其中的参数或内容不被当前模型接受。',
      suggestion: '检查模型名称和推理参数\n若正常游玩仍出现，将请求 ID 提供给维护者',
    }
  }

  if (status === 429) {
    return {
      level: 'warn',
      summary: '请求过于频繁或额度暂时受限',
      detail: '接口触发了频率或并发限制。',
      suggestion: '等待一到两分钟后重试\n检查是否在多个页面或设备同时请求',
    }
  }

  if (status === 499) {
    return {
      level: 'info',
      summary: '请求已被取消',
      detail: '浏览器离开页面、主动取消或连接中断后，服务器停止了本次请求。',
      suggestion: '仍需要本次结果时，请保持当前页面并重新发起操作',
    }
  }

  if (status === 500) {
    return {
      level: 'error',
      summary: '项目或 AI 服务发生内部错误',
      detail: '服务器处理请求时发生了未预期异常。',
      suggestion: '稍后重试\n若再次出现，将请求 ID 提供给维护者以便查询服务器日志',
    }
  }

  if (status === 501) {
    return {
      level: 'error',
      summary: '当前接口不支持这项功能',
      detail: '接口尚未实现本次请求所需的能力。',
      suggestion: '更换兼容的模型或接口\n若使用免费体验通道，将请求 ID 提供给维护者',
    }
  }

  if (status === 502) {
    return {
      level: 'error',
      summary: '无法连接上游 AI 服务',
      detail: '项目服务器未能从 AI 接口获得有效响应。',
      suggestion: '检查自定义接口网址是否可访问\n稍后重试或切换其他可用通道',
    }
  }

  if (status === 503) {
    return {
      level: 'warn',
      summary: 'AI 服务暂时繁忙或维护中',
      detail: '当前服务暂时无法接收请求。',
      suggestion: '等待片刻后重试\n持续不可用时切换其他模型或通道',
    }
  }

  if (status === 507) {
    return {
      level: 'error',
      summary: '服务器存储空间不足',
      detail: '服务器没有足够空间完成本次操作。',
      suggestion: '将请求 ID 提供给维护者处理\n问题修复前请勿反复提交',
    }
  }

  if (status >= 500) {
    return {
      level: 'error',
      summary: 'AI 服务端异常',
      detail: `服务端返回了 HTTP ${status}。`,
      suggestion: '稍后重试\n若重复出现，将请求 ID 提供给维护者',
    }
  }

  if (status >= 400) {
    return {
      level: 'error',
      summary: 'AI 请求被拒绝',
      detail: `接口返回了 HTTP ${status}。`,
      suggestion: '检查模型调用设置后重试\n若重复出现，将请求 ID 提供给维护者',
    }
  }

  return {
    level: 'error',
    summary: 'AI 请求失败',
    detail: `请求返回了非预期状态 HTTP ${status}。`,
    suggestion: '检查网络和模型调用设置后重试',
  }
}

/**
 * 生成可直接展示给玩家的安全错误信息：发生了什么、如何解决、如何按请求 ID 定位。
 */
export function formatApiErrorForUser(
  status: number,
  errorText: string,
  requestId?: string,
): string {
  const diagnostic = diagnoseApiError(status, errorText)
  const requestHint = requestId ? ` 请求 ID：${requestId}。` : ''
  return `HTTP ${status}：${diagnostic.summary}。解决办法：${compactSuggestion(diagnostic.suggestion)}。${requestHint}`.trim()
}

/** 根据无状态码的代理消息诊断；同样不把秘密或原始上游正文扩散到 UI。 */
export function diagnoseProxyError(errorMessage: string): ApiDiagnostic {
  if (errorMessage.includes('API Key 未配置') || errorMessage.includes('未配置 API Key')) {
    return diagnoseApiError(400, 'api key')
  }
  if (errorMessage.includes('无效')) return diagnoseApiError(401, '')
  if (errorMessage.includes('权限不足')) return diagnoseApiError(403, '')
  if (errorMessage.includes('余额') || errorMessage.includes('额度')) return diagnoseApiError(402, '')
  if (errorMessage.includes('频繁')) return diagnoseApiError(429, '')
  if (errorMessage.includes('超时')) return diagnoseApiError(504, '')

  return {
    level: 'error',
    summary: 'AI 服务异常',
    detail: '模型调用没有正常完成。',
    suggestion: '检查模型调用设置后重试\n若重复出现，将相关操作时间提供给维护者',
  }
}
