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

function appliedKey(modName: string): string {
  return `${modName}:migrations-applied`
}

function readAppliedSteps(modName: string): Set<string> {
  try {
    const raw = localStorage.getItem(appliedKey(modName))
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function writeAppliedSteps(modName: string, applied: Set<string>): void {
  localStorage.setItem(appliedKey(modName), JSON.stringify([...applied]))
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
  // 随迁移推进的运行版本（而非用固定的 currentVersion 过滤，避免版本断层时漏迁移）
  let runningVersion = currentVersion

  for (const step of sorted) {
    // 已越过的步骤（toVersion <= 当前进度）跳过
    if (compareVersions(step.toVersion, runningVersion) <= 0) continue
    // 不越过目标版本
    if (compareVersions(step.toVersion, targetVersion) > 0) break
    // 步骤起点必须能从当前进度衔接，否则存在断层，停止链（保留已迁移进度）
    if (compareVersions(step.fromVersion, runningVersion) > 0) {
      console.warn(
        `[Migration] ${modName}: 版本链断层，无法从 ${runningVersion} 衔接到 ${step.fromVersion}，停止`,
      )
      break
    }

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
      runningVersion = step.toVersion

      console.info(
        `[Migration] ${modName}: ${step.fromVersion} → ${step.toVersion} — ${step.description}`,
      )

      // 迁移成功后清理备份
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
 * 自动执行 MOD 注册的迁移链（来自 MIGRATION_IMPORTERS）。
 *
 * 吸收 Factorio migrations/ 设计：每个迁移以 `{fromVersion}-{toVersion}` 为键注册，
 * 导出 { migrate: (old: unknown) => unknown }。
 *
 * 关键：遍历**实际注册**的迁移步骤（而非用 semver 自增去猜测每一步），
 * 只执行尚未记录在 applied-set 中、且适用于当前目标版本的步骤。
 * 这样可正确处理任意步长（patch / minor / major）以及非连续的版本跳跃，
 * 且不会因「某段无迁移文件」而把版本号永久推过，导致日后补加的迁移被跳过。
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

  // 即使当前版本已达到 target，也继续检查未记录的注册迁移，支持后补迁移执行。

  // 解析该 MOD 注册的全部迁移步骤，按 fromVersion 升序排列
  const registered = MIGRATION_IMPORTERS[modName] ?? {}
  const steps = Object.entries(registered)
    .map(([stepKey, importer]) => {
      const dash = stepKey.indexOf('-')
      return {
        stepKey,
        fromVersion: dash >= 0 ? stepKey.slice(0, dash) : stepKey,
        toVersion: dash >= 0 ? stepKey.slice(dash + 1) : stepKey,
        importer,
      }
    })
    .sort((a, b) => compareVersions(a.fromVersion, b.fromVersion))

  const applied = readAppliedSteps(modName)

  // 无任何注册迁移：不推进高水位版本，避免日后补加迁移时被永久跳过。
  if (steps.length === 0) {
    return { success: true, stepsExecuted: 0 }
  }

  let runningVersion = currentVersion
  let stepsExec = 0

  for (const step of steps) {
    // 已明确执行过的步骤跳过；未记录的后补迁移即使 fromVersion 已低于当前高水位也仍可执行。
    if (applied.has(step.stepKey)) continue
    // 不越过目标版本
    if (compareVersions(step.toVersion, targetVersion) > 0) break
    // 只执行适用于当前进度之前或当前位置的步骤；未来步骤等待后续版本。
    if (compareVersions(step.fromVersion, runningVersion) > 0) {
      console.warn(
        `[Migration] ${modName}: 版本链断层，无法从 ${runningVersion} 衔接到 ${step.fromVersion}，停止`,
      )
      break
    }

    try {
      const migration = await step.importer()
      if (typeof migration.migrate === 'function') {
        const oldData = localStorage.getItem(modName)
        const parsed = oldData ? JSON.parse(oldData) : {}
        const newData = migration.migrate(parsed)

        // 原子写入：先备份，写新数据 + 新版本号，成功后清理备份
        const backup = localStorage.getItem(modName)
        if (backup) localStorage.setItem(`${modName}:backup`, backup)
        localStorage.setItem(modName, JSON.stringify(newData))
        localStorage.setItem(key, step.toVersion)
        applied.add(step.stepKey)
        writeAppliedSteps(modName, applied)
        stepsExec++
        console.info(`[Migration] ${modName}: ${step.fromVersion} → ${step.toVersion}（自动发现）`)
        localStorage.removeItem(`${modName}:backup`)
      } else {
        // 注册了但无 migrate 函数：仅记录该步骤已处理，不把未执行步骤伪装成已迁移数据。
        applied.add(step.stepKey)
        writeAppliedSteps(modName, applied)
      }
      runningVersion = step.toVersion
    } catch {
      // 执行失败 → 恢复备份，停止链，保留已迁移进度
      const backup = localStorage.getItem(`${modName}:backup`)
      if (backup) localStorage.setItem(modName, backup)
      return {
        success: false,
        stepsExecuted: stepsExec,
        error: `迁移 ${step.fromVersion} → ${step.toVersion} 执行失败`,
      }
    }
  }

  // 不再为缺失迁移直接对齐版本号；只记录已实际处理的 step。
  return { success: true, stepsExecuted: stepsExec }
}
