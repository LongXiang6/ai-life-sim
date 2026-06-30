/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

/** MOD 存储迁移静态 import 映射（Next.js 需静态可分析路径） */
export const MIGRATION_IMPORTERS: Record<string, Record<string, () => Promise<{ migrate?: (old: unknown) => unknown }>>> = {}
