#!/usr/bin/env node
/**
 * 服务器 API Key 验证工具
 * 用于诊断 managed provider 配置问题
 *
 * 使用方法：
 *   node scripts/ops/verify-api-keys.mjs
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const PROVIDER_CONFIGS = [
  {
    id: 'managed',
    name: 'LongCat 免费体验',
    keyEnv: 'LONGCAT_API_KEY',
    baseUrlEnv: 'LONGCAT_BASE_URL',
    testModel: 'LongCat-2.0',
  },
  {
    id: 'managed-a6',
    name: '原免费体验通道',
    keyEnv: 'MANAGED_AI_API_KEY',
    baseUrlEnv: 'MANAGED_A6_BASE_URL',
    testModel: 'gpt-5.6-luna',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    keyEnv: 'DEEPSEEK_API_KEY',
    baseUrlEnv: null,
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    testModel: 'deepseek-v4-flash',
  },
]

function loadEnvFile(envPath) {
  try {
    const content = readFileSync(envPath, 'utf-8')
    const env = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()
        // 移除引号
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        env[key] = value
      }
    }
    return env
  } catch (error) {
    return null
  }
}

async function testApiKey(provider, apiKey, baseUrl) {
  console.log(`\n测试 ${provider.name} (${provider.id})...`)
  console.log(`  Base URL: ${baseUrl}`)
  console.log(`  API Key: ${apiKey ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}` : '(未配置)'}`)

  if (!apiKey) {
    console.log(`  ❌ API Key 未配置`)
    return false
  }

  if (!baseUrl) {
    console.log(`  ❌ Base URL 未配置`)
    return false
  }

  try {
    const url = `${baseUrl}/chat/completions`
    console.log(`  发送测试请求到: ${url}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: provider.testModel,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(10000),
    })

    console.log(`  响应状态: ${response.status}`)

    if (response.ok) {
      console.log(`  ✅ API Key 有效，连接正常`)
      return true
    } else {
      const errorText = await response.text().catch(() => '(无法读取响应)')
      console.log(`  ❌ 请求失败: ${response.status}`)
      console.log(`  错误信息: ${errorText.slice(0, 200)}`)

      if (response.status === 401) {
        console.log(`  🔑 API Key 无效、已过期或格式不正确`)
      } else if (response.status === 402) {
        console.log(`  💰 账户余额不足或额度已用完`)
      } else if (response.status === 403) {
        console.log(`  🚫 API Key 无权访问该模型`)
      } else if (response.status === 404) {
        console.log(`  🔍 模型不存在或 Base URL 不正确`)
      } else if (response.status === 429) {
        console.log(`  ⏱️  请求频率受限，但 Key 可能有效`)
      }

      return false
    }
  } catch (error) {
    console.log(`  ❌ 连接失败: ${error.message}`)
    if (error.name === 'AbortError') {
      console.log(`  ⏰ 请求超时，可能是网络问题或 Base URL 不可达`)
    }
    return false
  }
}

async function main() {
  console.log('='.repeat(60))
  console.log('AI Provider API Key 验证工具')
  console.log('='.repeat(60))

  // 检查是否在服务器上运行
  const isServer = process.platform === 'linux' && process.env.HOME === '/root'
  const envPath = isServer
    ? '/root/ai-life-sim/.env'
    : join(process.cwd(), '.env.local')

  console.log(`\n环境: ${isServer ? '生产服务器' : '本地开发'}`)
  console.log(`配置文件: ${envPath}`)

  const env = loadEnvFile(envPath)
  if (!env) {
    console.log(`\n❌ 无法读取配置文件: ${envPath}`)
    console.log(`请确认文件存在且有读取权限`)
    process.exit(1)
  }

  console.log(`✅ 成功加载配置文件`)

  const results = []

  for (const provider of PROVIDER_CONFIGS) {
    const apiKey = env[provider.keyEnv]
    const baseUrl = provider.baseUrlEnv
      ? env[provider.baseUrlEnv]
      : provider.defaultBaseUrl

    const success = await testApiKey(provider, apiKey, baseUrl)
    results.push({ provider: provider.name, success })
  }

  console.log('\n' + '='.repeat(60))
  console.log('验证结果汇总')
  console.log('='.repeat(60))

  for (const result of results) {
    const status = result.success ? '✅ 正常' : '❌ 失败'
    console.log(`  ${result.provider}: ${status}`)
  }

  const allSuccess = results.every(r => r.success)
  const anySuccess = results.some(r => r.success)

  if (allSuccess) {
    console.log(`\n🎉 所有 Provider 配置正常！`)
    process.exit(0)
  } else if (anySuccess) {
    console.log(`\n⚠️  部分 Provider 配置有问题，请检查失败项`)
    process.exit(1)
  } else {
    console.log(`\n🚨 所有 Provider 都无法使用，游戏将无法正常运行`)
    process.exit(1)
  }
}

main().catch(error => {
  console.error(`\n💥 脚本执行失败: ${error.message}`)
  console.error(error.stack)
  process.exit(1)
})
