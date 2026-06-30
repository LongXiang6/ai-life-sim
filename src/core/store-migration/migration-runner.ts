/**
 * @module migration-runner.ts
 * @description 存储迁移执行器 —— PER-MOD 迁移链自动执行
 * @mod core
 *
 * 吸收 Factorio migrations/ 设计。
 *
 * 流程：
 *   1. 读取 localStorage 中的 `{modName}:version`
 *   2. 与 MOD manifest.version 对比
 *   3. 逐级执行迁移链
 *   4. 写入新数据 + 新版本号
 *
 * 版本跳跃自动补全（v1 → v2 → v3，不会跳过 v2）。
 * 迁移失败 → 保留旧数据 + 记录错误日志，不破坏存档。
 */

import { MIGRATION_IMPORTERS } from '../mod-loader/migration-importers.generated'

/** 迁移步骤定义 */
export interface MigrationStep {
  /** 源版本 */
  fromVersion: string
  /** 目标版本 */
  toVersion: string
  /** 迁移函数 */
  migrate: (oldData: unknown) => unknown
  /** 迁移描述 */
  description: string
}

/** 迁移结果 */
export interface MigrationResult {
  success: boolean
  /** 执行的迁移步骤数 */
  stepsExecuted: number
  /** 错误信息 */
  error?: string
}

/**
 * 比较 semver 版本号
 *
 * @returns 0 相等, >0 a > b, <0 a < b
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * 自动迁移执行器
 *
 * @param modName - MOD 名称
 * @param targetVersion - 目标版本（MOD manifest.version）
 * @param chain - 迁移链（按版本顺序排列）
 * @param storageKey - localStorage 中的版本键（默认 `{modName}:version`）
 * @returns 迁移结果
 */
export async function autoMigrate(
  modName: string,
  targetVersion: string,
  chain: MigrationStep[],
  storageKey?: string,
): Promise<MigrationResult> {
  const key = storageKey ?? `${modName}:version`
  const currentVersion = localStorage.getItem(key) ?? '0.0.0'

  // 无需迁移
  const cmp = compareVersions(currentVersion, targetVersion)
  if (cmp >= 0) {
    return { success: true, stepsExecuted: 0 }
  }

  // 按版本排序迁移链
  const sorted = [...chain].sort((a, b) => compareVersions(a.fromVersion, b.fromVersion))

  let stepsExec = 0

  for (const step of sorted) {
    // 跳过不相关的迁移步骤
    if (compareVersions(step.fromVersion, currentVersion) < 0) continue
    if (compareVersions(step.toVersion, targetVersion) > 0) break

    try {
      const oldData = localStorage.getItem(modName)
      const parsed = oldData ? JSON.parse(oldData) : {}
      const newData = step.migrate(parsed)

      // 原子写入：先写备份，再写新数据
      const backup = localStorage.getItem(modName)
      if (backup) {
        localStorage.setItem(`${modName}:backup`, backup)
      }
      localStorage.setItem(modName, JSON.stringify(newData))
      localStorage.setItem(key, step.toVersion)
      stepsExec++

      console.info(
        `[Migration] ${modName}: ${step.fromVersion} → ${step.toVersion} — ${step.description}`,
      )

      // 迁移成功后清理备份（移到 finally 保证）
      localStorage.removeItem(`${modName}:backup`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 恢复备份
      const backup = localStorage.getItem(`${modName}:backup`)
      if (backup) {
        localStorage.setItem(modName, backup)
      }
      return {
        success: false,
        stepsExecuted: stepsExec,
        error: `迁移 ${step.fromVersion} → ${step.toVersion} 失败: ${msg}`,
      }
    }
  }

  return { success: true, stepsExecuted: stepsExec }
}

/**
 * 计算 semver 的下一个版本号（递增最右侧可递增的段）
 *
 * 例：1.0.0 → 1.0.1（patch 递增）
 *     若已追上目标的大版本 → 1.1.0（minor 递增）
 *     若已追上目标的 minor → 2.0.0（major 递增）
 */
function bumpVersion(
  current: { major: number; minor: number; patch: number },
  target: { major: number; minor: number; patch: number },
): { major: number; minor: number; patch: number } {
  const { major, minor, patch } = current
  if (major < target.major) return { major: major + 1, minor: 0, patch: 0 }
  if (minor < target.minor) return { major, minor: minor + 1, patch: 0 }
  return { major, minor, patch: patch + 1 }
}

/**
 * 自动扫描 MOD 的 migrations/ 目录并按约定执行迁移
 *
 * 吸收 Factorio migrations/ 按文件名字典序自动执行设计。
 *
 * 约定：
 *   MOD 的 migrations/ 目录下的每个 .ts 文件导出 { migrate: (old: unknown) => unknown }
 *   文件名格式：{fromVersion}-{toVersion}.ts（如 1.0.0-1.1.0.ts）
 *
 * 由于 TypeScript/Vite 不支持运行时目录扫描，采用"约定式尝试"：
 *   从 currentVersion 逐版本尝试 import，文件不存在时静默跳过（无变更迁移）。
 *
 * @param modName - MOD 名称
 * @param targetVersion - 目标版本（MOD manifest.version）
 * @param storageKey - localStorage 中的版本键（默认 `{modName}:version`）
 * @returns 迁移结果
 */
export async function autoMigrateFromDir(
  modName: string,
  targetVersion: string,
  storageKey?: string,
): Promise<MigrationResult> {
  const key = storageKey ?? `${modName}:version`
  const currentVersion = localStorage.getItem(key) ?? '0.0.0'

  // 无需迁移
  if (compareVersions(currentVersion, targetVersion) >= 0) {
    return { success: true, stepsExecuted: 0 }
  }

  const parseVer = (v: string) => {
    const [major, minor, patch] = v.split('.').map(Number)
    return { major: major || 0, minor: minor || 0, patch: patch || 0 }
  }

  const current = parseVer(currentVersion)
  const target = parseVer(targetVersion)

  let curr = { ...current }
  let stepsExec = 0

  while (compareVersions(`${curr.major}.${curr.minor}.${curr.patch}`, targetVersion) < 0) {
    const next = bumpVersion(curr, target)
    const fromVer = `${curr.major}.${curr.minor}.${curr.patch}`
    const toVer = `${next.major}.${next.minor}.${next.patch}`

    const stepKey = `${fromVer}-${toVer}`
    const importer = MIGRATION_IMPORTERS[modName]?.[stepKey]

    if (importer) {
      try {
        const migration = await importer()

        if (typeof migration.migrate === 'function') {
          const oldData = localStorage.getItem(modName)
          const parsed = oldData ? JSON.parse(oldData) : {}
          const newData = migration.migrate(parsed)

          // 原子写入
          const backup = localStorage.getItem(modName)
          if (backup) localStorage.setItem(`${modName}:backup`, backup)
          localStorage.setItem(modName, JSON.stringify(newData))
          localStorage.setItem(key, toVer)
          stepsExec++

          console.info(`[Migration] ${modName}: ${fromVer} → ${toVer}（自动发现）`)

          localStorage.removeItem(`${modName}:backup`)
        }
      } catch {
        // 迁移文件存在但执行失败 → 保留旧数据，停止链
        return {
          success: false,
          stepsExecuted: stepsExec,
          error: `迁移 ${fromVer} → ${toVer} 执行失败`,
        }
      }
    } else {
      // 该版本步没有迁移文件 → 直接跳过（无变更迁移）
      localStorage.setItem(key, toVer)
    }

    curr = next
  }

  return { success: true, stepsExecuted: stepsExec }
}
