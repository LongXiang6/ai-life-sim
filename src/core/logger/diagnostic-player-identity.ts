/**
 * @module diagnostic-player-identity.ts
 * @description 服务端原子分配不依赖设备特征的六位玩家诊断编号
 * @mod core
 */

import 'server-only'

import { randomBytes } from 'crypto'

import {
  DIAGNOSTIC_PLAYER_CODE_LENGTH,
  normalizeDiagnosticPlayerCode,
} from './diagnostic-player-code'
import { reserveServerLogFile } from './server-log-store'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const MAX_ALLOCATION_ATTEMPTS = 128

function generateCandidate(): string {
  for (;;) {
    const bytes = randomBytes(DIAGNOSTIC_PLAYER_CODE_LENGTH)
    let code = ''
    for (const byte of bytes) code += CODE_ALPHABET[byte & 31]
    if (normalizeDiagnosticPlayerCode(code)) return code
  }
}

async function reserveCode(code: string): Promise<'created' | 'exists' | 'failed'> {
  return reserveServerLogFile(`diagnostic-identities/codes/${code}.json`, {
    diagnosticCode: code,
    issuedAt: Date.now(),
    formatVersion: 1,
  })
}

/**
 * 保留已有 Cookie 编号，或原子分配一个从未被占用的新编号。
 * 编号只用于日志定位，不是账号、鉴权凭据或设备指纹。
 */
export async function ensureDiagnosticPlayerCode(existingCode?: string): Promise<string | null> {
  const normalizedExisting = normalizeDiagnosticPlayerCode(existingCode)
  if (normalizedExisting) {
    const result = await reserveCode(normalizedExisting)
    return result === 'failed' ? null : normalizedExisting
  }

  for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt++) {
    const candidate = generateCandidate()
    const result = await reserveCode(candidate)
    if (result === 'created') return candidate
    if (result === 'failed') return null
  }
  return null
}

