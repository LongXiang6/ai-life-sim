'use client'

import type {
  AccountSessionPayload,
  CloudSyncRequest,
  GuestSessionPayload,
  LoginRequest,
  RegisterRequest,
} from './account-contract'

interface AccountApiErrorPayload {
  error?: string
  code?: string
}

export class AccountApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'AccountApiError'
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as AccountApiErrorPayload
  if (!response.ok) {
    throw new AccountApiError(body.error ?? '账号请求失败', response.status, body.code)
  }
  return body as T
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
  })
  return parseResponse<T>(response)
}

export function fetchAccountSession(): Promise<AccountSessionPayload | GuestSessionPayload> {
  return request('/api/account')
}

export function registerCloudAccount(input: RegisterRequest): Promise<AccountSessionPayload> {
  return request('/api/account/register', { method: 'POST', body: JSON.stringify(input) })
}

export function loginCloudAccount(input: LoginRequest): Promise<AccountSessionPayload> {
  return request('/api/account/login', { method: 'POST', body: JSON.stringify(input) })
}

export function pushCloudAccount(input: CloudSyncRequest): Promise<AccountSessionPayload> {
  return request('/api/account/sync', { method: 'PUT', body: JSON.stringify(input) })
}

export function createCloudQqLinkCode(): Promise<{ code: string; expiresAt: number }> {
  return request('/api/account/qq-link', { method: 'POST' })
}

export function unlinkCloudQq(): Promise<AccountSessionPayload> {
  return request('/api/account/qq-link', { method: 'DELETE' })
}

export async function logoutCloudAccount(): Promise<void> {
  await request('/api/account/logout', { method: 'POST' })
}

export async function deleteCloudAccount(password: string): Promise<void> {
  await request('/api/account', { method: 'DELETE', body: JSON.stringify({ password }) })
}
