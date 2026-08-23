/**
 * Purpose: Provide the browser client for player-content and mailbox APIs.
 * Owner: core:player-content
 * Responsibility: HTTP request composition and response parsing only; business state remains server-owned.
 */

'use client'

import type {
  CloudReincarnationTalent,
} from '@/core/account/account-contract'
import type {
  CloudManualSaveSummary,
  CloudManualSaveWrite,
  CloudGameSavePayload,
  LegendaryEncounterProjection,
  LeaderboardEntry,
  PlayerMailCommandResult,
  PlayerMailFolder,
  PlayerMailPage,
  PlayerMailRecipient,
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
): Promise<{ messageId: string | null; created: boolean; status: 'queued' | 'processing' | 'ready' | 'failed' } | null> {
  const response = await fetch('/api/account/mailbox/portrait', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recordId, lifeSummary }),
  })
  if (response.status === 404) return null
  return parseJson<{ messageId: string | null; created: boolean; status: 'queued' | 'processing' | 'ready' | 'failed' }>(response)
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  const response = await fetch('/api/leaderboard', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  return (await parseJson<{ entries: LeaderboardEntry[] }>(response)).entries
}

export async function fetchPlayerMailPage(
  folder: PlayerMailFolder,
  cursor?: string | null,
): Promise<PlayerMailPage> {
  const parameters = new URLSearchParams({ folder })
  if (cursor) parameters.set('cursor', cursor)
  const response = await fetch(`/api/account/mailbox?${parameters.toString()}`, {
    credentials: 'same-origin',
    cache: 'no-store',
  })
  return parseJson<PlayerMailPage>(response)
}

async function postPlayerMailCommand(body: unknown): Promise<PlayerMailCommandResult> {
  const response = await fetch('/api/account/mailbox', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson<PlayerMailCommandResult>(response)
}

export function sendPlayerMailMessage(input: {
  requestId: string
  recipient: PlayerMailRecipient
  title: string
  body: string
  talent?: CloudReincarnationTalent
}): Promise<PlayerMailCommandResult> {
  return postPlayerMailCommand({ action: 'send', ...input })
}

export function markPlayerMailRead(messageId: string): Promise<PlayerMailCommandResult> {
  return postPlayerMailCommand({ action: 'read', messageId })
}

export function deletePlayerMail(messageId: string): Promise<PlayerMailCommandResult> {
  return postPlayerMailCommand({ action: 'delete', messageId })
}

export function acceptPlayerMailTalent(messageId: string): Promise<PlayerMailCommandResult> {
  return postPlayerMailCommand({ action: 'accept-talent', messageId })
}

export function claimPlayerMailReward(messageId: string): Promise<PlayerMailCommandResult> {
  return postPlayerMailCommand({ action: 'claim-reward', messageId })
}

export async function fetchLegendaryEncounter(
  lifeRunId: string,
): Promise<LegendaryEncounterProjection | null> {
  const response = await fetch('/api/legendary-encounter', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'select', lifeRunId }),
  })
  return (await parseJson<{ encounter: LegendaryEncounterProjection | null }>(response)).encounter
}

export async function notifyLegendaryEncounterInjected(
  lifeRunId: string,
  round: number,
): Promise<boolean> {
  const response = await fetch('/api/legendary-encounter', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'injected', lifeRunId, round }),
  })
  return (await parseJson<{ updated: boolean }>(response)).updated
}
