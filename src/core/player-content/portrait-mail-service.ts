/**
 * Purpose: Process persisted portrait-mail jobs and their operational lifecycle.
 * Owner: core:player-content
 * Responsibility: Portrait job execution only; feature eligibility remains in player-content features.
 */

import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

import { CloudGameRecordSchema, type CloudGameRecord } from '@/core/account/account-contract'
import { getAccountDatabase } from '@/core/account/account-database'
import { verifyStoredLifeScore } from '@/core/scoring/life-scoring'
import { appendDevelopmentSystemEvents } from '@/core/logger/development-system-diagnostic.server'

import { PortraitMailRequestSchema, type PortraitMailRequest } from './player-content-contract'
import { getPlayerContentDatabase } from './player-content-database'
import { isPortraitImageEnabled } from './player-content-features'
import { createPortraitPlayerMail } from './player-mail-service'
import { generatePortraitImage, PortraitImageProviderError } from './portrait-image-provider'
import { removePortraitAssets, writePortraitAsset } from './portrait-asset-store'
import { PlayerContentServiceError } from './player-content-error'
import { queuePortraitMailJob } from './player-content-service'

const MAX_JOB_ATTEMPTS = 3
const STALE_PROCESSING_MS = 10 * 60 * 1000
const RETRY_DELAYS_MS = [0, 1_000, 5_000] as const
const activeJobs = new Set<string>()

function recordPortraitDiagnostic(input: {
  accountId: string
  recordId: string
  event: string
  status: 'ok' | 'warning' | 'error' | 'skipped'
  details?: Record<string, unknown>
  error?: unknown
}): void {
  void appendDevelopmentSystemEvents([{
    schemaVersion: 1,
    timestamp: Date.now(),
    system: 'portrait-worker',
    event: input.event,
    status: input.status,
    details: {
      accountId: input.accountId,
      recordId: input.recordId,
      ...(input.details ?? {}),
    },
    ...(input.error !== undefined ? {
      error: input.error instanceof Error
        ? { name: input.error.name, message: input.error.message, stack: input.error.stack }
        : { message: String(input.error) },
    } : {}),
  }]).catch((error) => {
    console.error('[portrait-worker] 开发诊断写入失败', error)
  })
}

declare global {
  var __aiLifePortraitWorkerPromise: Promise<void> | undefined
}

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
    `人生总结：${record.endingReview?.review ?? lifeSummary}`,
    `重要经历：${achievements.length > 0 ? achievements.join('；') : '没有单独登记的大事，以人生总结为准。'}`,
    `世界适配维度：${record.dimensions.map((item) => `${item.label}${Math.round(item.value)}分`).join('、') || '未登记'}。`,
    `人生特征：${record.destinyNames.join('、') || '未命名'}。`,
    '人物外貌、服饰、气质与环境线索必须来自上述人生事实，突出这段人生最重要的选择与成就。',
    '画面只出现一位清晰主角，不添加标题、分数、界面、边框、水印或可读文字。',
  ].join('\n')
}

export async function processPortraitMailRequest(
  accountId: string,
  input: PortraitMailRequest,
  options: { now?: number; fetchImplementation?: typeof fetch } = {},
): Promise<{ messageId: string | null; created: boolean; status: 'queued' | 'processing' | 'ready' | 'failed' }> {
  if (!isPortraitImageEnabled()) {
    throw new PlayerContentServiceError('满分人生画像尚未开放', 404, 'feature_disabled')
  }
  const parsed = PortraitMailRequestSchema.parse(input)
  const record = readOwnedRecord(accountId, parsed.recordId)
  if (record.overallScore !== 100
    || !verifyStoredLifeScore(record).valid
    || record.scoring?.version !== 2
    || record.scoring.integrity.passed !== true
    || !record.endingReview?.review.trim()) {
    throw new PlayerContentServiceError('只有满分人生可以生成画像', 403, 'portrait_not_eligible')
  }

  const database = getPlayerContentDatabase()
  const existing = database.prepare(`
    SELECT id FROM player_mail_messages
    WHERE recipient_key = ? AND record_id = ? AND kind = 'portrait'
  `).get(`account:${accountId}`, record.recordId) as { id: string } | undefined
  if (existing) return { messageId: existing.id, created: false, status: 'ready' }
  const now = options.now ?? Date.now()
  const created = queuePortraitMailJob(accountId, record, now)
  schedulePortraitMailWorker()
  const job = database.prepare(`
    SELECT status FROM portrait_mail_jobs WHERE account_id = ? AND record_id = ?
  `).get(accountId, record.recordId) as { status: 'awaiting_brief' | 'processing' | 'ready' | 'failed' } | undefined
  return {
    messageId: null,
    created,
    status: job?.status === 'failed' ? 'failed' : job?.status === 'ready' ? 'ready' : job?.status === 'processing' ? 'processing' : 'queued',
  }
}

function readPendingJobs(now: number): Array<{ account_id: string; record_id: string; attempts: number; status: string }> {
  const database = getPlayerContentDatabase()
  database.prepare(`
    UPDATE portrait_mail_jobs
    SET status = 'awaiting_brief', updated_at = ?
    WHERE status = 'processing' AND updated_at < ?
  `).run(now, now - STALE_PROCESSING_MS)
  return database.prepare(`
    SELECT account_id, record_id, attempts, status
    FROM portrait_mail_jobs
    WHERE (status = 'awaiting_brief' OR status = 'failed') AND attempts < ?
    ORDER BY updated_at ASC, account_id ASC, record_id ASC
  `).all(MAX_JOB_ATTEMPTS) as Array<{ account_id: string; record_id: string; attempts: number; status: string }>
}

async function processPortraitMailJob(
  accountId: string,
  recordId: string,
  options: { now?: number; fetchImplementation?: typeof fetch } = {},
): Promise<void> {
  const lockKey = `${accountId}:${recordId}`
  if (activeJobs.has(lockKey)) return
  const database = getPlayerContentDatabase()
  const current = database.prepare(`
    SELECT status, attempts FROM portrait_mail_jobs WHERE account_id = ? AND record_id = ?
  `).get(accountId, recordId) as { status: string; attempts: number } | undefined
  if (!current || current.status === 'ready' || current.attempts >= MAX_JOB_ATTEMPTS) return
  const now = options.now ?? Date.now()
  const claimed = database.prepare(`
    UPDATE portrait_mail_jobs
    SET status = 'processing', attempts = attempts + 1,
      last_error_code = NULL, updated_at = ?
    WHERE account_id = ? AND record_id = ?
      AND status IN ('awaiting_brief', 'failed') AND attempts < ?
  `).run(now, accountId, recordId, MAX_JOB_ATTEMPTS)
  if (claimed.changes === 0) return
  activeJobs.add(lockKey)
  recordPortraitDiagnostic({
    accountId,
    recordId,
    event: 'job-claimed',
    status: 'ok',
    details: { attempt: current.attempts + 1 },
  })
  let storageKey: string | null = null
  try {
    const record = readOwnedRecord(accountId, recordId)
    if (record.overallScore !== 100
      || !verifyStoredLifeScore(record).valid
      || record.scoring?.version !== 2
      || record.scoring.integrity.passed !== true
      || !record.endingReview?.review.trim()) {
      throw new PlayerContentServiceError('只有满分人生可以生成画像', 403, 'portrait_not_eligible')
    }
    const prompt = buildPortraitPrompt(record, record.endingReview.review)
    const promptSha256 = createHash('sha256').update(prompt, 'utf8').digest('hex')
    database.prepare(`
      UPDATE portrait_mail_jobs SET prompt_sha256 = ? WHERE account_id = ? AND record_id = ?
    `).run(promptSha256, accountId, recordId)
    const generated = await generatePortraitImage(prompt, options.fetchImplementation)
    const written = await writePortraitAsset(generated.bytes, generated.mimeType, now)
    storageKey = written.storageKey
    const assetId = randomUUID()
    const digest = createHash('sha256').update(generated.bytes).digest('hex')
    database.transaction(() => {
      database.prepare(`
        INSERT INTO portrait_assets(
          id, account_id, mime_type, byte_length, sha256, storage_key, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(assetId, accountId, generated.mimeType, generated.bytes.byteLength, digest, storageKey, now)
      createPortraitPlayerMail({ accountId, recordId, assetId, now })
      database.prepare(`
        UPDATE portrait_mail_jobs
        SET status = 'ready', last_error_code = NULL, updated_at = ?
        WHERE account_id = ? AND record_id = ?
      `).run(now, accountId, recordId)
      database.prepare(`
        UPDATE leaderboard_best_runs
        SET portrait_asset_id = COALESCE(portrait_asset_id, ?), updated_at = ?
        WHERE account_id = ? AND record_id = ?
      `).run(assetId, now, accountId, recordId)
    })()
    recordPortraitDiagnostic({
      accountId,
      recordId,
      event: 'job-completed',
      status: 'ok',
      details: {
        attempt: current.attempts + 1,
        assetId,
        mimeType: generated.mimeType,
        byteLength: generated.bytes.byteLength,
      },
    })
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
    `).run(errorCode, Date.now(), accountId, recordId)
    recordPortraitDiagnostic({
      accountId,
      recordId,
      event: 'job-failed',
      status: 'error',
      details: { attempt: current.attempts + 1, errorCode },
      error,
    })
  } finally {
    activeJobs.delete(lockKey)
  }
}

async function drainPortraitMailJobs(
  fetchImplementation?: typeof fetch,
): Promise<void> {
  for (const job of readPendingJobs(Date.now())) {
    if (job.attempts > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[Math.min(job.attempts, RETRY_DELAYS_MS.length - 1)]))
    }
    await processPortraitMailJob(job.account_id, job.record_id, { fetchImplementation })
  }
}

/** 启动单进程后台画像 worker；重复调用只复用当前 drain。 */
export function schedulePortraitMailWorker(): void {
  if (globalThis.__aiLifePortraitWorkerPromise) return
  const worker = drainPortraitMailJobs()
  globalThis.__aiLifePortraitWorkerPromise = worker.finally(() => {
    globalThis.__aiLifePortraitWorkerPromise = undefined
  })
}

/** 测试与运维可注入 Provider，验证队列消费和失败重试，不改变生产入口。 */
export async function processPortraitMailJobForTests(
  accountId: string,
  recordId: string,
  fetchImplementation: typeof fetch,
): Promise<void> {
  await processPortraitMailJob(accountId, recordId, { fetchImplementation })
}
