import 'server-only'

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

function assetRoot(): string {
  const configured = process.env.PORTRAIT_ASSET_ROOT?.trim()
  if (configured) return path.resolve(configured)
  return process.env.NODE_ENV === 'production'
    ? '/var/lib/ai-life-sim/portrait-assets'
    : path.join(process.cwd(), '.data', 'portrait-assets')
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/webp') return '.webp'
  throw new Error('画像资产类型无效')
}

function resolveStoragePath(storageKey: string): string {
  const root = assetRoot()
  const resolved = path.resolve(root, storageKey)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error('画像资产路径无效')
  }
  return resolved
}

export async function writePortraitAsset(
  bytes: Buffer,
  mimeType: string,
  now = Date.now(),
): Promise<{ storageKey: string; path: string }> {
  const date = new Date(now)
  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  const storageKey = `${month}/${randomUUID()}${extensionFor(mimeType)}`
  const target = resolveStoragePath(storageKey)
  const temporary = `${target}.${randomUUID()}.tmp`
  await fs.promises.mkdir(path.dirname(target), { recursive: true, mode: 0o700 })
  try {
    await fs.promises.writeFile(temporary, bytes, { mode: 0o600, flag: 'wx' })
    await fs.promises.rename(temporary, target)
    if (process.platform !== 'win32') await fs.promises.chmod(target, 0o600)
    return { storageKey, path: target }
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

export function readPortraitAsset(storageKey: string): Buffer {
  return fs.readFileSync(resolveStoragePath(storageKey))
}

export function removePortraitAssets(storageKeys: readonly string[]): void {
  for (const storageKey of storageKeys) {
    try {
      fs.rmSync(resolveStoragePath(storageKey), { force: true })
    } catch {
      // Database cleanup remains authoritative; the daily reconciler can retry orphan files.
    }
  }
}
