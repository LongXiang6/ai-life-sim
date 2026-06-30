/**
 * @module route.ts
 * @description 客户端错误日志 API 路由 —— POST 接收客户端日志
 * @mod app
 *
 * 功能：
 *   - 按日期写入 logs/client-errors-YYYY-MM-DD.log
 *   - 如有 raw 字段，额外保存完整原文到 logs/raw-responses/
 *   - 受 NEXT_PUBLIC_DISABLE_DEBUG_LOGS 环境变量控制
 */

import { z } from 'zod'

/** 日志文件最大大小 50MB */
const MAX_LOG_SIZE = 50 * 1024 * 1024

/** 请求体 Zod 校验 */
const ClientLogSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  module: z.string(),
  message: z.string(),
  timestamp: z.number(),
  args: z.array(z.unknown()).optional(),
  raw: z.string().optional(),
  error: z.string().optional(),
})

type ClientLogEntry = z.infer<typeof ClientLogSchema>

/** 检查是否禁用 */
function isDisabled(): boolean {
  return process.env.NEXT_PUBLIC_DISABLE_DEBUG_LOGS === 'true'
}

/** 写入日志（异步） */
async function writeLogAsync(entry: ClientLogEntry): Promise<void> {
  const fs = await import('fs/promises')
  const path = await import('path')

  const dateStr = new Date(entry.timestamp).toISOString().slice(0, 10)
  const logFile = `logs/client-errors-${dateStr}.log`
  const fullPath = path.join(process.cwd(), logFile)

  // 确保目录存在
  const dir = path.dirname(fullPath)
  await fs.mkdir(dir, { recursive: true }).catch(() => {})

  // 检查文件大小
  try {
    const stat = await fs.stat(fullPath)
    if (stat.size > MAX_LOG_SIZE) {
      const backupPath = fullPath.replace('.log', `-${Date.now()}.log`)
      await fs.rename(fullPath, backupPath)
    }
  } catch {
    // 文件不存在，首次写入
  }

  // 格式化日志行
  const time = new Date(entry.timestamp).toISOString()
  const argsStr = entry.args ? ` | args: ${JSON.stringify(entry.args).slice(0, 500)}` : ''
  const errorStr = entry.error ? ` | error: ${entry.error}` : ''
  const line = `[${time}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}${argsStr}${errorStr}\n`

  await fs.appendFile(fullPath, line)

  // 如果有 raw 字段，额外保存完整原文
  if (entry.raw) {
    const rawDir = path.join(process.cwd(), 'logs', 'raw-responses')
    await fs.mkdir(rawDir, { recursive: true }).catch(() => {})
    const timestamp = new Date(entry.timestamp).toISOString().replace(/[:.]/g, '-')
    const rawFile = `${entry.module}-${entry.level}-${timestamp}.txt`
    const rawContent = [
      `Timestamp: ${time}`,
      `Module: ${entry.module}`,
      `Level: ${entry.level}`,
      `Message: ${entry.message}`,
      '',
      '--- Raw Content ---',
      entry.raw,
    ].join('\n')
    await fs.writeFile(path.join(rawDir, rawFile), rawContent)
  }
}

/** 同步包装 */
function writeLog(entry: ClientLogEntry): void {
  void writeLogAsync(entry)
}

/**
 * 接收客户端错误日志
 * @param request - HTTP 请求
 * @returns 操作结果
 */
export async function POST(request: Request): Promise<Response> {
  if (isDisabled()) {
    return Response.json({ error: '日志已禁用' }, { status: 403 })
  }

  const bodyText = await request.text().catch(() => null)
  if (!bodyText) {
    return Response.json({ error: '请求体为空' }, { status: 400 })
  }

  try {
    const raw = JSON.parse(bodyText)
    const entry = ClientLogSchema.parse(raw)
    writeLog(entry)
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: '请求体格式不正确' }, { status: 400 })
  }
}
