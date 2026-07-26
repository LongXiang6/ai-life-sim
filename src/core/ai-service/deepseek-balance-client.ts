'use client'

export interface DeepSeekBalanceInfo {
  currency: string
  totalBalance: string
  grantedBalance: string
  toppedUpBalance: string
}

export interface DeepSeekBalanceSnapshot {
  isAvailable: boolean
  balances: DeepSeekBalanceInfo[]
  fetchedAt: number
}

interface BalanceResponse {
  error?: string
  code?: string
  isAvailable?: boolean
  balances?: DeepSeekBalanceInfo[]
  fetchedAt?: number
}

export async function fetchDeepSeekBalance(input: {
  apiKey: string
  baseUrl: string
  forceRefresh?: boolean
}): Promise<DeepSeekBalanceSnapshot> {
  const response = await fetch('/api/ai-usage/deepseek-balance', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await response.json().catch(() => ({})) as BalanceResponse
  if (!response.ok) throw new Error(body.error ?? 'DeepSeek 余额查询失败')
  return {
    isAvailable: body.isAvailable === true,
    balances: body.balances ?? [],
    fetchedAt: body.fetchedAt ?? Date.now(),
  }
}
