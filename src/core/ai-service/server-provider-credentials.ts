import 'server-only'

/**
 * 服务端 Provider 凭据读取权威。
 *
 * 只允许服务器路由直接导入；不得从浏览器可见的 ai-service/index.ts 导出。
 * 返回值只可用于即时上游请求，不得写入响应、日志或持久化状态。
 */
const SERVER_API_KEY_ENV: Record<string, string> = {
  managed: 'MANAGED_AI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  zhipu: 'ZHIPU_API_KEY',
  aliyun: 'ALIBUN_API_KEY',
  bytedance: 'BYTEDANCE_API_KEY',
  tencent: 'TENCENT_API_KEY',
  baidu: 'BAIDU_API_KEY',
}

export function readServerProviderApiKey(providerId: string): string {
  const envName = SERVER_API_KEY_ENV[providerId]
  return envName ? process.env[envName] ?? '' : ''
}

export function hasServerProviderApiKey(providerId: string): boolean {
  return Boolean(readServerProviderApiKey(providerId))
}
