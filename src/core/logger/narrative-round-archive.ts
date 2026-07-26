/**
 * @module narrative-round-archive.ts
 * @description 核心叙事逐存档、逐轮的上游请求与响应原文 TXT 归档
 * @mod core
 */

import 'server-only'

import fs from 'node:fs'
import path from 'node:path'

import { safeLogSegment } from './server-log-safety'
import type { NarrativeRoundOutcomeReport } from './narrative-round-diagnostic'

export interface NarrativeRoundTraceContext {
  lifeRunId: string
  round: number
  callKind: string
  executionKind?: string
  promptVersion?: string
  targetWordCount?: number
  styleSource?: 'default' | 'custom'
  styleText?: string
  styleVersion?: number
}

export interface NarrativeRoundExchange {
  trace: NarrativeRoundTraceContext
  requestId: string
  providerId: string
  model: string
  attempt: number
  status?: number
  requestBody: string
  responseBody: string | Uint8Array
  transportError?: string
  deviceProvenanceId?: string
  accountId?: string
  username?: string
  styleFingerprint?: string
}

export interface NarrativeRoundOutcome {
  report: NarrativeRoundOutcomeReport
  recordedAt?: number
}

declare global {
  var __narrativeRoundArchiveQueues: Map<string, Promise<void>> | undefined
}

const queues = globalThis.__narrativeRoundArchiveQueues ?? new Map<string, Promise<void>>()
globalThis.__narrativeRoundArchiveQueues = queues

export function getNarrativeRoundArchiveRoot(): string {
  const configured = process.env.NARRATIVE_ROUND_LOG_DIR?.trim()
  return configured
    ? path.resolve(configured)
    : path.join(process.cwd(), '.data', 'narrative-rounds')
}

export function getNarrativeRoundArchivePath(
  lifeRunId: string,
  round: number,
): string {
  const saveDirectory = path.join(
    getNarrativeRoundArchiveRoot(),
    safeLogSegment(lifeRunId),
  )
  return path.join(saveDirectory, `round-${Math.max(0, Math.trunc(round)).toString().padStart(6, '0')}.txt`)
}

export function getNarrativeRoundDiagnosticPath(
  lifeRunId: string,
  round: number,
): string {
  return path.join(
    getNarrativeRoundArchiveRoot().replace(/[\\/]narrative-rounds$/u, 'diagnostics'),
    safeLogSegment(lifeRunId),
    `round-${Math.max(0, Math.trunc(round)).toString().padStart(6, '0')}.jsonl`,
  )
}

function line(name: string, value: string | number | undefined): string {
  return `${name}: ${value ?? ''}\n`
}

function buildExchangeBytes(exchange: NarrativeRoundExchange, includeFileHeader: boolean): Buffer {
  const requestBytes = Buffer.from(exchange.requestBody, 'utf8')
  const responseBytes = typeof exchange.responseBody === 'string'
    ? Buffer.from(exchange.responseBody, 'utf8')
    : Buffer.from(exchange.responseBody)
  const prefix = includeFileHeader
    ? Buffer.from([
        'AI LIFE SIM CORE NARRATIVE UPSTREAM ARCHIVE\n',
        'format_version: 1\n',
        line('life_run_id', exchange.trace.lifeRunId),
        line('round', exchange.trace.round),
        line('device_provenance_id', exchange.deviceProvenanceId),
        line('account_id', exchange.accountId),
        line('username', exchange.username),
        'payload_encoding: UTF-8\n',
        '每个 REQUEST/RESPONSE 区段的字节长度是边界依据；区段内部原文未改写。\n',
      ].join(''), 'utf8')
    : Buffer.alloc(0)
  const requestHeader = Buffer.from([
    '\n===== EXCHANGE BEGIN =====\n',
    line('request_id', exchange.requestId),
    line('call_kind', exchange.trace.callKind),
    line('execution_kind', exchange.trace.executionKind),
    line('prompt_version', exchange.trace.promptVersion),
    line('target_word_count', exchange.trace.targetWordCount),
    line('provider', exchange.providerId),
    line('model', exchange.model),
    line('attempt', exchange.attempt),
    line('status', exchange.status),
    line('transport_error', exchange.transportError),
    line('request_utf8_bytes', requestBytes.byteLength),
    line('response_utf8_bytes', responseBytes.byteLength),
    '----- REQUEST BEGIN -----\n',
  ].join(''), 'utf8')
  const between = Buffer.from('\n----- REQUEST END -----\n----- RESPONSE BEGIN -----\n', 'utf8')
  const suffix = Buffer.from('\n----- RESPONSE END -----\n===== EXCHANGE END =====\n', 'utf8')
  return Buffer.concat([prefix, requestHeader, requestBytes, between, responseBytes, suffix])
}

function buildStyleSnapshotBytes(exchange: NarrativeRoundExchange): Buffer {
  if (
    exchange.trace.callKind !== 'narrative-main'
    || exchange.trace.executionKind === 'preview'
    || exchange.trace.styleText === undefined
  ) return Buffer.alloc(0)

  const styleBytes = Buffer.from(exchange.trace.styleText, 'utf8')
  return Buffer.concat([
    Buffer.from([
      '\n===== STYLE SNAPSHOT BEGIN =====\n',
      line('style_source', exchange.trace.styleSource),
      line('style_version', exchange.trace.styleVersion),
      line('style_protocol_version', 'narrative-style-v1'),
      line('style_fingerprint_sha256', exchange.styleFingerprint),
      line('style_utf8_bytes', styleBytes.byteLength),
      '----- STYLE TEXT BEGIN -----\n',
    ].join(''), 'utf8'),
    styleBytes,
    Buffer.from('\n----- STYLE TEXT END -----\n===== STYLE SNAPSHOT END =====\n', 'utf8'),
  ])
}

/**
 * 将一次真实上游尝试作为单个原子追加块写入该轮 TXT。
 * 请求体和响应体均直接使用 fetch 的字符串/收到的字节，不重新序列化。
 */
export async function appendNarrativeRoundExchange(
  exchange: NarrativeRoundExchange,
): Promise<void> {
  const filePath = getNarrativeRoundArchivePath(
    exchange.trace.lifeRunId,
    exchange.trace.round,
  )
  const previous = queues.get(filePath) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(async () => {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    const includeFileHeader = !fs.existsSync(filePath)
    let includeStyleSnapshot = false
    if (exchange.trace.callKind === 'narrative-main' && exchange.trace.executionKind !== 'preview') {
      const existing = includeFileHeader
        ? ''
        : await fs.promises.readFile(filePath, 'utf8').catch(() => '')
      includeStyleSnapshot = !existing.includes('===== STYLE SNAPSHOT BEGIN =====')
    }
    await fs.promises.appendFile(
      filePath,
      Buffer.concat([
        buildExchangeBytes(exchange, includeFileHeader),
        ...(includeStyleSnapshot ? [buildStyleSnapshotBytes(exchange)] : []),
      ]),
    )
  })
  queues.set(filePath, next)
  try {
    await next
  } finally {
    if (queues.get(filePath) === next) queues.delete(filePath)
  }
}

function buildOutcomeBytes(outcome: NarrativeRoundOutcome): Buffer {
  return Buffer.from([
    '\n===== ROUND OUTCOME BEGIN =====\n',
    `recorded_at: ${outcome.recordedAt ?? Date.now()}\n`,
    'outcome_json_utf8_bytes: ',
    String(Buffer.byteLength(JSON.stringify(outcome.report, null, 2), 'utf8')),
    '\n----- OUTCOME JSON BEGIN -----\n',
    JSON.stringify(outcome.report, null, 2),
    '\n----- OUTCOME JSON END -----\n===== ROUND OUTCOME END =====\n',
  ].join(''), 'utf8')
}

/** 将解析、提交和质量结果追加到该轮 TXT；不改写任何请求/响应字节。 */
export async function appendNarrativeRoundOutcome(
  outcome: NarrativeRoundOutcome,
): Promise<void> {
  const report = outcome.report
  const filePath = getNarrativeRoundArchivePath(report.lifeRunId, report.round)
  const previous = queues.get(filePath) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(async () => {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
    const existing = await fs.promises.readFile(filePath, 'utf8').catch(() => '')
    if (!existing.includes('===== ROUND OUTCOME BEGIN =====')) {
      await fs.promises.appendFile(filePath, buildOutcomeBytes(outcome))
    }
    if (process.env.NODE_ENV === 'development') {
      const diagnosticPath = getNarrativeRoundDiagnosticPath(report.lifeRunId, report.round)
      await fs.promises.mkdir(path.dirname(diagnosticPath), { recursive: true })
      const existingDiagnostic = await fs.promises.readFile(diagnosticPath, 'utf8').catch(() => '')
      if (!existingDiagnostic.trim()) {
        await fs.promises.appendFile(
          diagnosticPath,
          `${JSON.stringify({ ...report, recordedAt: outcome.recordedAt ?? Date.now() })}\n`,
          'utf8',
        )
      }
    }
  })
  queues.set(filePath, next)
  try {
    await next
  } finally {
    if (queues.get(filePath) === next) queues.delete(filePath)
  }
}
