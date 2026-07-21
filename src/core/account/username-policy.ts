import 'server-only'

import fs from 'node:fs'

import { UsernameSchema } from './account-contract'

const RESERVED_NAMES = new Set([
  'admin',
  'administrator',
  'root',
  'system',
  'official',
  'moderator',
  'support',
  '管理员',
  '官方',
  '客服',
  '系统',
])

const DEFAULT_BLOCKED_FRAGMENTS = [
  '习近平',
  '毛泽东',
  '共产党',
  '法轮功',
  '台独',
  '港独',
  '藏独',
  '纳粹',
  '恐怖组织',
]

function normalizeForPolicy(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')
}
function loadConfiguredFragments(): string[] {
  const values = [process.env.ACCOUNT_USERNAME_BLOCKLIST ?? '']
  const file = process.env.ACCOUNT_USERNAME_BLOCKLIST_PATH?.trim()
  if (file) {
    try {
      values.push(fs.readFileSync(file, 'utf8'))
    } catch (error) {
      console.error('[account] 无法读取用户名违禁词文件:', error)
    }
  }
  return values
    .flatMap((value) => value.split(/[\r\n,，]+/u))
    .map(normalizeForPolicy)
    .filter(Boolean)
}

export interface ValidatedUsername {
  display: string
  canonical: string
}

export function validateUsernamePolicy(input: string): ValidatedUsername {
  const parsed = UsernameSchema.parse(input.normalize('NFKC'))
  const display = parsed.trim()
  const canonical = normalizeForPolicy(display)
  const compact = canonical.replaceAll('_', '')
  if (RESERVED_NAMES.has(canonical) || RESERVED_NAMES.has(compact)) {
    throw new Error('该用户名为系统保留名称')
  }
  const blocked = [...DEFAULT_BLOCKED_FRAGMENTS, ...loadConfiguredFragments()]
  if (blocked.some((fragment) => compact.includes(fragment.replaceAll('_', '')))) {
    throw new Error('用户名包含不允许使用的内容')
  }
  return { display, canonical }
}
