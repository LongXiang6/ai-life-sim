import 'server-only'

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'

const SCRYPT_N = 32768
const SCRYPT_R = 8
const SCRYPT_P = 1
const SCRYPT_KEY_LENGTH = 64

function base64Url(buffer: Buffer): string {
  return buffer.toString('base64url')
}

function derivePasswordKey(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: 64 * 1024 * 1024,
    }, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey)
    })
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await derivePasswordKey(password, salt, SCRYPT_KEY_LENGTH)
  return `scrypt$v1$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${base64Url(salt)}$${base64Url(derived)}`
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, version, nRaw, rRaw, pRaw, saltRaw, hashRaw] = encoded.split('$')
  if (algorithm !== 'scrypt' || version !== 'v1' || !saltRaw || !hashRaw) return false
  const N = Number(nRaw)
  const r = Number(rRaw)
  const p = Number(pRaw)
  if (N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false
  const expected = Buffer.from(hashRaw, 'base64url')
  const actual = await derivePasswordKey(password, Buffer.from(saltRaw, 'base64url'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function createSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function getEncryptionKey(): Buffer {
  const raw = process.env.ACCOUNT_DATA_ENCRYPTION_KEY?.trim()
  if (!raw) throw new Error('服务器未配置账号数据加密密钥')
  const key = /^[a-f0-9]{64}$/iu.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('ACCOUNT_DATA_ENCRYPTION_KEY 必须是 32 字节密钥')
  return key
}

export function encryptApiKey(apiKey: string, accountId: string): string {
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), nonce)
  cipher.setAAD(Buffer.from(accountId, 'utf8'))
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  return ['v1', base64Url(nonce), base64Url(cipher.getAuthTag()), base64Url(ciphertext)].join(':')
}

export function decryptApiKey(encoded: string, accountId: string): string {
  const [version, nonceRaw, tagRaw, cipherRaw] = encoded.split(':')
  if (version !== 'v1' || !nonceRaw || !tagRaw || !cipherRaw) {
    throw new Error('账号 API Key 密文格式无效')
  }
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(nonceRaw, 'base64url'))
  decipher.setAAD(Buffer.from(accountId, 'utf8'))
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(cipherRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
