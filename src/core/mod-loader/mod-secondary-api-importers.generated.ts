/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

/** manifest.secondaryPublicEntries — Remote API 注册补充（与 index.ts 合并） */
export const MOD_SECONDARY_API_IMPORTERS: Record<string, readonly (() => Promise<Record<string, unknown>>)[]> = {
  'mod-character': [
    () => import('@/mods/mod-character/destiny-pattern-access') as Promise<Record<string, unknown>>,
    () => import('@/mods/mod-character/reincarnation-talent-access') as Promise<Record<string, unknown>>,
  ],
  'mod-engine': [
    () => import('@/mods/mod-engine/engine-api') as Promise<Record<string, unknown>>,
  ],
  'mod-history-dynamics': [
    () => import('@/mods/mod-history-dynamics/historical-event-api') as Promise<Record<string, unknown>>,
  ],
  'mod-settings': [
    () => import('@/mods/mod-settings/settings-runtime-api') as Promise<Record<string, unknown>>,
  ],
  'mod-world': [
    () => import('@/mods/mod-world/world-init-api') as Promise<Record<string, unknown>>,
    () => import('@/mods/mod-world/world-context-api') as Promise<Record<string, unknown>>,
    () => import('@/mods/mod-world/world-runtime-api') as Promise<Record<string, unknown>>,
  ],
}
