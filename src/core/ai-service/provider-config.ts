/**
 * @module provider-config.ts
 * @description AI Provider 配置 —— 6 家厂商预设 + 自定义 Provider 解析
 * @mod core
 *
 * 支持厂商：DeepSeek / 智谱AI / 阿里云 / 字节跳动 / 腾讯云 / 百度智能云
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

// ---- 6 家厂商预设 ----

export const AI_PROVIDERS: Record<string, AIProviderConfig> = {
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

