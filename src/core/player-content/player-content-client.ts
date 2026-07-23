'use client'

import type {
  CloudManualSaveSummary,
  CloudManualSaveWrite,
  CloudGameSavePayload,
} from './player-content-contract'

interface ErrorBody { error?: string, code?: string }

export class PlayerContentApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message)
    this.name = 'PlayerContentApiError'
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as ErrorBody
  if (!response.ok) throw new PlayerContentApiError(body.error ?? '云端存档请求失败', response.status, body.code)
  return body as T
}

async function gzipJson(value: unknown): Promise<Blob> {
  if (typeof CompressionStream !== 'function') {
    throw new Error('当前浏览器不支持安全的云端存档压缩，请升级浏览器后重试。')
  }
  const input = new Blob([JSON.stringify(value)], { type: 'application/json' })
  const stream = input.stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).blob()
}

export async function fetchCloudManualSaveSummary(): Promise<CloudManualSaveSummary | null> {
  const response = await fetch('/api/account/cloud-save', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  return (await parseJson<{ save: CloudManualSaveSummary | null }>(response)).save
}

export async function fetchCloudManualSave(): Promise<{
  save: CloudManualSaveSummary
  payload: CloudGameSavePayload
} | null> {
  const response = await fetch('/api/account/cloud-save?payload=1', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  const result = await parseJson<{
    save: CloudManualSaveSummary | null
    payload?: CloudGameSavePayload
  }>(response)
  return result.save && result.payload ? { save: result.save, payload: result.payload } : null
}

export async function putCloudManualSave(input: CloudManualSaveWrite): Promise<CloudManualSaveSummary> {
  const response = await fetch('/api/account/cloud-save', {
    method: 'PUT',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/gzip' },
    body: await gzipJson(input),
  })
  return (await parseJson<{ save: CloudManualSaveSummary }>(response)).save
}

export async function removeCloudManualSave(): Promise<boolean> {
  const response = await fetch('/api/account/cloud-save', {
    method: 'DELETE',
    credentials: 'same-origin',
    cache: 'no-store',
  })
  return (await parseJson<{ deleted: boolean }>(response)).deleted
}

export async function requestPortraitMail(
  recordId: string,
  lifeSummary: string,
): Promise<{ messageId: string; created: boolean } | null> {
  if (process.env.NEXT_PUBLIC_PLAYER_MAILBOX_ENABLED !== '1') return null
  const response = await fetch('/api/account/mailbox/portrait', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordId, lifeSummary }),
  })
  if (response.status === 404) return null
  return parseJson<{ messageId: string; created: boolean }>(response)
}
