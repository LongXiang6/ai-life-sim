/**
 * @module provider-config.ts
 * @description AI Provider 配置 —— 服务器托管默认通道、厂商预设与自定义 Provider 解析
 * @mod core
 *
 * 支持：服务器托管免费体验通道、DeepSeek 与自定义 OpenAI 兼容接口
 * 废弃项目参考：ai-models.ts MODEL_PRESETS
 */

// ---- 类型定义 ----

export interface ProviderModel {
  name: string
  label: string
  notes?: string
}

export interface AIProviderConfig {
  id: string
  name: string
  icon: string
  baseUrl: string
  models: ProviderModel[]
  notes?: string
  /** 是否支持 thinking/reasoning 参数 */
  supportsThinking: boolean,
}

// ---- 默认通道 ----

/** 默认使用服务器托管通道；公开接口与模型可以进入客户端，凭据绝不能进入。 */
export const DEFAULT_AI_PROVIDER_ID = 'managed'
export const DEFAULT_AI_BASE_URL = 'https://a6.a6api.com/v1'
export const DEFAULT_AI_MODEL = 'gpt-5.6-luna'
/** 托管主模型在连接、上游状态或完整响应校验失败时使用的服务端备用模型。 */
export const DEFAULT_AI_FALLBACK_MODEL = 'gpt-5.6-terra'

/** 浏览器只请求公开主模型；备用模型只由服务端在同一固定接口内选择。 */
export function getProviderModelCandidates(providerId: string, requestedModel: string): string[] {
  if (providerId !== DEFAULT_AI_PROVIDER_ID) return [requestedModel]
  if (requestedModel !== DEFAULT_AI_MODEL) return []
  return [DEFAULT_AI_MODEL, DEFAULT_AI_FALLBACK_MODEL]
}

/** 仅对可能由模型可用性或临时上游故障造成的失败切换备用模型。 */
export function shouldTryManagedFallback(status?: number): boolean {
  if (status === undefined) return true
  return status === 404
    || status === 408
    || status === 409
    || status === 425
    || status === 429
    || status >= 500
}

// ---- Provider 预设 ----

export const AI_PROVIDERS: Record<string, AIProviderConfig> = {
  managed: {
    id: DEFAULT_AI_PROVIDER_ID,
    name: '免费体验通道',
    icon: '免',
    baseUrl: DEFAULT_AI_BASE_URL,
    supportsThinking: false,
    models: [{
      name: DEFAULT_AI_MODEL,
      label: 'GPT 5.6 Luna',
      notes: '由项目服务器安全托管体验凭据；主模型不可用时自动切换 GPT 5.6 Terra。',
    }],
    notes: '默认体验通道。可直接使用，也可在下方填写自己的 Key、接口与模型覆盖。',
  },
  deepseek: {
    id: 'deepseek',
    name: '深度求索 (DeepSeek)',
    icon: '🔍',
    baseUrl: 'https://api.deepseek.com/v1',
    supportsThinking: true,
    models: [
      {
        name: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        notes: '旗舰模型 | 1.6T参数(MoE) · 49B激活/次\n'
          + '输入 ¥3/百万tokens · 输出 ¥6/百万tokens · 缓存命中 ¥0.025\n'
          + '擅长：复杂推理、代码生成、长文档分析、Agent任务\n'
          + 'SWE-bench 80.6% · 高峰期可能排队',
      },
      {
        name: 'deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        notes: '性价比首选 | 284B参数(MoE) · 13B激活/次\n'
          + '输入 ¥1/百万tokens · 输出 ¥2/百万tokens · 缓存命中 ¥0.02\n'
          + '擅长：日常对话、内容生成、批量任务、低成本场景\n'
          + 'SWE-bench 79.0% · 响应稳定、无排队',
      },
    ],
    notes: 'V4 系列：最大输入 1M tokens（约100万字），最大输出 384K tokens（约38.4万字），兼容 OpenAI API。',
  },
}

// ---- 推理强度 budget_tokens 映射 ----

/** 推理强度 → thinking.budget_tokens 映射（DeepSeek 风格） */
export const REASONING_BUDGET_MAP: Record<string, number> = {
  disabled: 0,
  'level-1': 1024,
  'level-2': 2048,
  'level-3': 4096,
  'level-4': 8192,
  'level-5': 16384,
  'level-6': 32768,
}

/** 推理强度选项（用于 UI 下拉） */
export const REASONING_EFFORT_OPTIONS = [
  { value: 'disabled', label: '关闭', description: '不使用推理/思考', tokens: 0, },
  { value: 'level-1', label: 'Level 1', description: '轻量推理', tokens: 1024, },
  { value: 'level-2', label: 'Level 2', description: '标准推理', tokens: 2048, },
  { value: 'level-3', label: 'Level 3', description: '深度推理', tokens: 4096, },
  { value: 'level-4', label: 'Level 4', description: '高级推理', tokens: 8192, },
  { value: 'level-5', label: 'Level 5', description: '专家推理', tokens: 16384, },
  { value: 'level-6', label: 'Level 6', description: '最大推理', tokens: 32768, },
] as const

// ---- 自定义 Provider 配置 ----

export interface CustomProviderConfig {
  baseUrl: string
  apiKey: string
  model: string,
}

// ---- 解析函数 ----

export interface ResolvedProvider {
  baseUrl: string
  model: string
  apiKey: string
  supportsThinking: boolean,
}

/**
 * 解析 Provider 配置
 * @param providerId - Provider ID（如 'deepseek'、'custom'）
 * @param options - 可选的自定义配置和 API Key 覆盖
 */
export function resolveProvider(
  providerId: string,
  options?: {
    customConfig?: CustomProviderConfig
    apiKeyOverride?: string
    modelOverride?: string
  },
): ResolvedProvider {
  // 自定义 Provider
  if (providerId === 'custom') {
    if (!options?.customConfig) {
      throw new Error('自定义 Provider 需要提供 customConfig',)
    }
    return {
      baseUrl: options.customConfig.baseUrl,
      model: options.customConfig.model,
      apiKey: options.customConfig.apiKey,
      supportsThinking: false,
    }
  }

  const provider = AI_PROVIDERS[providerId]
  if (!provider) {
    throw new Error(`未知的 Provider: ${providerId}`,)
  }

  return {
    baseUrl: provider.baseUrl,
    model: options?.modelOverride ?? provider.models[0]?.name ?? '',
    apiKey: options?.apiKeyOverride ?? '',
    supportsThinking: provider.supportsThinking,
  }
}

/**
 * 获取所有 Provider ID 列表
 * @returns Provider ID 数组
 */
export function getProviderIds(): string[] {
  return Object.keys(AI_PROVIDERS,)
}

/**
 * 根据 Provider ID 获取可用模型列表
 * @param providerId - Provider ID
 * @returns 模型列表
 */
export function getProviderModels(providerId: string,): ProviderModel[] {
  if (providerId === 'custom') return []
  return AI_PROVIDERS[providerId]?.models ?? []
}

