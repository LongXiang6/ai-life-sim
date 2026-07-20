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
  /** 仅公开厂商可在浏览器暴露地址；服务器托管通道必须留空。 */
  baseUrl?: string
  models: ProviderModel[]
  notes?: string
  /** 是否支持 thinking/reasoning 参数 */
  supportsThinking: boolean,
}

// ---- 默认通道 ----

/** 默认使用 LongCat 服务器托管通道；浏览器只持有 Provider ID 与模型名。 */
export const DEFAULT_AI_PROVIDER_ID = 'managed'
export const DEFAULT_AI_MODEL = 'LongCat-2.0'

/** 原免费体验通道继续作为玩家可选项保留。 */
export const LEGACY_MANAGED_AI_PROVIDER_ID = 'managed-a6'
export const LEGACY_MANAGED_AI_MODEL = 'gpt-5.6-luna'
/** 原通道主模型发生可重试失败时使用的同接口服务端备用模型。 */
export const LEGACY_MANAGED_AI_FALLBACK_MODEL = 'gpt-5.6-terra'

const MANAGED_PROVIDER_FALLBACK_MODELS: Record<string, readonly string[]> = {
  [DEFAULT_AI_PROVIDER_ID]: [],
  [LEGACY_MANAGED_AI_PROVIDER_ID]: [LEGACY_MANAGED_AI_FALLBACK_MODEL],
}

/** 服务器托管 Provider 使用固定接口、模型白名单和服务端环境凭据。 */
export function isServerManagedProvider(providerId: string): boolean {
  return MANAGED_PROVIDER_FALLBACK_MODELS[providerId] !== undefined
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

/** 浏览器只认识公开厂商地址；托管私有目标由服务端单独校验。 */
export function isRegisteredProviderBaseUrl(baseUrl: string): boolean {
  const normalized = normalizeProviderBaseUrl(baseUrl)
  if (!normalized) return false
  return Object.values(AI_PROVIDERS).some(
    (provider) => provider.baseUrl
      ? normalizeProviderBaseUrl(provider.baseUrl) === normalized
      : false,
  )
}

/** 仅原 a6api 通道需要把浏览器非流式请求转换为上游 SSE 后完整聚合。 */
export function shouldAggregateManagedNonStream(providerId: string): boolean {
  return providerId === LEGACY_MANAGED_AI_PROVIDER_ID
}

/** 浏览器只请求各托管通道公开模型；内部备用模型只由服务端在同一固定接口内选择。 */
export function getProviderModelCandidates(providerId: string, requestedModel: string): string[] {
  if (!isServerManagedProvider(providerId)) return [requestedModel]
  const provider = AI_PROVIDERS[providerId]
  if (!provider?.models.some((candidate) => candidate.name === requestedModel)) return []
  return [requestedModel, ...(MANAGED_PROVIDER_FALLBACK_MODELS[providerId] ?? [])]
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
    name: '免费体验（龙猫）',
    icon: '猫',
    supportsThinking: true,
    models: [{
      name: DEFAULT_AI_MODEL,
      label: 'LongCat 2.0（龙猫）',
      notes: '当前默认免费体验模型。支持 1M 上下文、128K 最大输出与流式响应。',
    }],
    notes: '由项目服务器安全托管目标与凭据；使用自己的 API 时请切换到自定义配置。',
  },
  [LEGACY_MANAGED_AI_PROVIDER_ID]: {
    id: LEGACY_MANAGED_AI_PROVIDER_ID,
    name: '免费体验（原通道）',
    icon: '免',
    supportsThinking: false,
    models: [{
      name: LEGACY_MANAGED_AI_MODEL,
      label: 'GPT 5.6 Luna',
      notes: '保留的原免费体验模型；主模型不可用时服务端自动切换 GPT 5.6 Terra。',
    }],
    notes: '原 a6api 免费通道继续保留，玩家可随时切换回来。',
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
    baseUrl: provider.baseUrl ?? '',
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

