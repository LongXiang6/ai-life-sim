/**
 * @module mod-validator.ts
 * @description MOD 结构校验器 V2 —— 验证目录名、manifest、types、index、循环依赖、Feature Flags
 * @mod core
 *
 * 规范来源：mod-specification.md §14 校验规则
 */

import type { ModManifest, ModManifestV2, ModFeatureFlags } from '@/foundation'

import { parseDependency } from './dependency-resolver'

/** 校验结果 */
export interface ValidationResult {
  valid: boolean,
  errors: string[],
}

/**
 * 校验 MOD 目录名格式
 * 规则：必须匹配 mod-{kebab-case} 格式
 * @param dirName - 目录名
 * @returns 校验结果
 */
export function validateDirectoryName(dirName: string): ValidationResult {
  const errors: string[] = []
  if (!/^mod-[a-z]+(-[a-z0-9]+)*$/.test(dirName)) {
    errors.push(`目录名 "${dirName}" 不匹配 mod-{kebab-case} 格式`)
  }
  return { valid: errors.length === 0, errors }
}

/**
 * 校验 manifest 完整性 V2
 *
 * 与 v1 相比：
 *   - 不再校验 loadOrder 范围（加载器已忽略此字段）
 *   - 支持 `~/?/!` 依赖前缀
 *   - 新增 Feature Flags 校验（如有）
 *
 * @param manifest - MOD manifest
 * @param dirName - 目录名
 * @param availableMods - 可用 MOD 名称列表
 * @param availableCapabilities - 当前 MOD 集合中已声明的 provides（全量预扫描，非按序增量）
 * @returns 校验结果
 */
export function validateManifest(
  manifest: ModManifest | ModManifestV2,
  dirName: string,
  availableMods: string[],
  availableCapabilities: Map<string, string>,
): ValidationResult {
  const errors: string[] = []

  // 名称与目录名一致
  if (manifest.name !== dirName) {
    errors.push(`manifest.name "${manifest.name}" 与目录名 "${dirName}" 不一致`)
  }

  // semver 格式
  if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push(`manifest.version "${manifest.version}" 不符合 semver 格式`)
  }

  // 依赖检查（与 parseDependency 共用前缀解析逻辑）
  for (const depStr of manifest.dependencies) {
    const dep = parseDependency(depStr)

    // 可选依赖：不存在不报错
    if (dep.type === 'optional' && !availableMods.includes(dep.name)) {
      console.info(`[${manifest.name}] 可选依赖 "${dep.name}" 不存在，跳过`)
      continue
    }

    // 冲突声明：同时存在报错
    if (dep.type === 'incompatible' && availableMods.includes(dep.name)) {
      errors.push(`"${manifest.name}" 与 "${dep.name}" 冲突，无法同时加载`)
      continue
    }

    // 硬依赖和软引用：需要存在
    if (dep.type !== 'optional' && dep.type !== 'incompatible' && !availableMods.includes(dep.name)) {
      errors.push(`依赖 MOD "${dep.name}" 不存在`)
    }
  }

  // 能力消费检查
  for (const capability of manifest.consumes) {
    if (!availableCapabilities.has(capability)) {
      errors.push(`消费的能力 "${capability}" 没有 MOD 提供`)
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 校验 MOD 结构（types.ts / index.ts 必须存在）
 * @param _dirName - 目录名（预留）
 * @param hasTypes - 是否存在 types.ts
 * @param hasIndex - 是否存在 index.ts
 * @returns 校验结果
 */
export function validateStructure(
  _dirName: string,
  hasTypes: boolean,
  hasIndex: boolean,
): ValidationResult {
  const errors: string[] = []

  if (!hasTypes) {
    errors.push('缺少 types.ts 文件')
  }
  if (!hasIndex) {
    errors.push('缺少 index.ts 文件')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * 校验 Feature Flags
 *
 * 检查 MOD 声明的功能开关是否被当前引擎支持。
 *
 * @param manifest - MOD manifest（V2 格式）
 * @param engineCaps - 引擎当前支持的能力
 * @returns 错误列表（空数组表示全部通过）
 */
export function validateFeatureFlags(
  manifest: ModManifestV2,
  engineCaps: ModFeatureFlags,
): string[] {
  const errs: string[] = []
  for (const [flag, required] of Object.entries(manifest.featureFlags ?? {})) {
    if (required && !engineCaps[flag]) {
      errs.push(`${manifest.name} 需要引擎能力 "${flag}"，但当前引擎不支持`)
    }
  }
  return errs
}
