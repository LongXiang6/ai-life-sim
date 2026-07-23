import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { CloudGameRecordSchema, type CloudGameRecord } from '@/core/account/account-contract'
import { getAccountDatabase } from '@/core/account/account-database'

import { PortraitMailRequestSchema, type PortraitMailRequest } from './player-content-contract'
import { getPlayerContentDatabase } from './player-content-database'
import {
  isPlayerMailboxEnabled,
  isPortraitImageEnabled,
} from './player-content-features'
import { generatePortraitImage, PortraitImageProviderError } from './portrait-image-provider'
import { removePortraitAssets, writePortraitAsset } from './portrait-asset-store'
import { PlayerContentServiceError, queuePortraitMailJob } from './player-content-service'

const activeJobs = new Set<string>()

function readOwnedRecord(accountId: string, recordId: string): CloudGameRecord {
  const row = getAccountDatabase().prepare(`
    SELECT data_json FROM account_game_records
    WHERE account_id = ? AND record_id = ?
  `).get(accountId, recordId) as { data_json: string } | undefined
  if (!row) {
    throw new PlayerContentServiceError('这局人生尚未同步到当前账号', 409, 'record_not_synced')
  }
  try {
    return CloudGameRecordSchema.parse(JSON.parse(row.data_json))
  } catch {
    throw new PlayerContentServiceError('这局人生记录无法读取', 500, 'record_invalid')
  }
}

function buildPortraitPrompt(record: CloudGameRecord, lifeSummary: string): string {
  const achievements = (record.achievements ?? []).map((item) => (
    `${item.timeLabel}，${item.title}：${item.detail}`
  ))
  return [
    '创作一幅单人主角人物画像，画面用于人生模拟游戏的满分彩蛋。',
    `主角：${record.characterName}；世界：${record.worldName}；终年：${record.finalAge}岁。`,
    `人生总结：${lifeSummary}`,
    `重要经历：${achievements.length > 0 ? achievements.join('；') : '没有单独登记的大事，以人生总结为准。'}`,
    `人生特征：${record.destinyNames.join('、') || '未命名'}；道德评价：${record.moralityLabel}。`,
    '人物外貌、服饰、气质与环境线索必须来自上述人生事实，突出这段人生最重要的选择与成就。',
    '画面只出现一位清晰主角，不添加标题、分数、界面、边框、水印或可读文字。',
  ].join('\n')
}

export async function processPortraitMailRequest(
  accountId: string,
  input: PortraitMailRequest,
  options: { now?: number; fetchImplementation?: typeof fetch } = {},
): Promise<{ messageId: string; created: boolean }> {
  if (!isPlayerMailboxEnabled() || !isPortraitImageEnabled()) {
    throw new PlayerContentServiceError('画像邮箱尚未开放', 404, 'feature_disabled')
  }
  const parsed = PortraitMailRequestSchema.parse(input)
  const record = readOwnedRecord(accountId, parsed.recordId)
  if (record.overallScore !== 100) {
    throw new PlayerContentServiceError('只有满分人生可以生成画像', 403, 'portrait_not_eligible')
  }

  const database = getPlayerContentDatabase()
  const existing = database.prepare(`
    SELECT id FROM player_mail_messages
    WHERE account_id = ? AND record_id = ? AND kind = 'portrait'
  `).get(accountId, record.recordId) as { id: string } | undefined
  if (existing) return { messageId: existing.id, created: false }

  const lockKey = `${accountId}:${record.recordId}`
  if (activeJobs.has(lockKey)) {
    throw new PlayerContentServiceError('这幅画像正在生成', 409, 'portrait_processing')
  }
  activeJobs.add(lockKey)
  const now = options.now ?? Date.now()
  const prompt = buildPortraitPrompt(record, parsed.lifeSummary)
  const promptSha256 = createHash('sha256').update(prompt, 'utf8').digest('hex')
  queuePortraitMailJob(accountId, record, now)
  database.prepare(`
    UPDATE portrait_mail_jobs
    SET status = 'processing', prompt_sha256 = ?, attempts = attempts + 1,
      last_error_code = NULL, updated_at = ?
    WHERE account_id = ? AND record_id = ?
  `).run(promptSha256, now, accountId, record.recordId)

  let storageKey: string | null = null
  try {
    const generated = await generatePortraitImage(prompt, options.fetchImplementation)
    const written = await writePortraitAsset(generated.bytes, generated.mimeType, now)
    storageKey = written.storageKey
    const assetId = randomUUID()
    const messageId = randomUUID()
    const digest = createHash('sha256').update(generated.bytes).digest('hex')
    database.transaction(() => {
      database.prepare(`
        INSERT INTO portrait_assets(
          id, account_id, mime_type, byte_length, sha256, storage_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(assetId, accountId, generated.mimeType, generated.bytes.byteLength, digest, storageKey, now)
      database.prepare(`
        INSERT INTO player_mail_messages(
          id, account_id, kind, record_id, title, body, asset_id, created_at
        ) VALUES (?, ?, 'portrait', ?, '满分人生画像', '你走完的满分人生已留下一幅主角画像。', ?, ?)
      `).run(messageId, accountId, record.recordId, assetId, now)
      database.prepare(`
        UPDATE portrait_mail_jobs
        SET status = 'ready', last_error_code = NULL, updated_at = ?
        WHERE account_id = ? AND record_id = ?
      `).run(now, accountId, record.recordId)
    })()
    return { messageId, created: true }
  } catch (error) {
    if (storageKey) removePortraitAssets([storageKey])
    const errorCode = error instanceof PortraitImageProviderError
      ? error.code
      : error instanceof PlayerContentServiceError
        ? error.code
        : 'portrait_generation_failed'
    database.prepare(`
      UPDATE portrait_mail_jobs
      SET status = 'failed', last_error_code = ?, updated_at = ?
      WHERE account_id = ? AND record_id = ?
    `).run(errorCode, Date.now(), accountId, record.recordId)
    if (error instanceof PlayerContentServiceError) throw error
    throw new PlayerContentServiceError('画像生成服务暂时不可用', 502, errorCode)
  } finally {
    activeJobs.delete(lockKey)
  }
}
