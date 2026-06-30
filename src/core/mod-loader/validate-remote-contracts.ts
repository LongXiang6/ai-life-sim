/**
 * @module validate-remote-contracts.ts
 * @description Remote API 契约校验 —— 对比 codegen 声明与运行时 remote 注册结果
 * @mod core
 */

import type { ModManifest } from '@/foundation'

import { remote } from '../remote-interface/remote-interface'
import { REMOTE_API_CONTRACTS } from './remote-contracts.generated'

export interface RemoteContractIssue {
  mod: string
  kind: 'missing' | 'extra'
  functionName: string
}

/**
 * 校验各 MOD 的 Remote API 是否与契约一致
 *
 * 优先级：manifest.remoteApi（显式声明）> codegen REMOTE_API_CONTRACTS
 *
 * @param manifests - 已加载 MOD 的 manifest 列表
 * @returns 不一致项列表（空 = 通过）
 */
export function validateRemoteContracts(manifests: ModManifest[]): RemoteContractIssue[] {
  const issues: RemoteContractIssue[] = []

  for (const manifest of manifests) {
    const expected = manifest.remoteApi ?? REMOTE_API_CONTRACTS[manifest.name]
    if (!expected || expected.length === 0) continue

    const actual = new Set(remote.listFunctions(manifest.name))
    const expectedSet = new Set(expected)

    for (const fn of expectedSet) {
      if (!actual.has(fn)) {
        issues.push({ mod: manifest.name, kind: 'missing', functionName: fn })
      }
    }

    for (const fn of actual) {
      if (!expectedSet.has(fn)) {
        issues.push({ mod: manifest.name, kind: 'extra', functionName: fn })
      }
    }
  }

  return issues
}

/**
 * 在开发环境输出 Remote 契约校验结果
 *
 * @param manifests - 已加载 MOD 的 manifest 列表
 * @returns 是否存在不一致
 */
export function reportRemoteContractIssues(manifests: ModManifest[]): boolean {
  const issues = validateRemoteContracts(manifests)
  if (issues.length === 0) return false

  for (const issue of issues) {
    const label = issue.kind === 'missing' ? '未注册' : '未声明'
    console.warn(
      `[RemoteContract] MOD "${issue.mod}" 函数 "${issue.functionName}" ${label}（manifest.remoteApi / codegen 与 remote 不一致）`,
    )
  }
  return true
}
