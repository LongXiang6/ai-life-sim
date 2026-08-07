/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

/** Factorio control.lua 等价 — 窄入口，仅 lifecycle（不含 index barrel） */
export const MOD_CONTROL_IMPORTERS: Record<string, () => Promise<Record<string, unknown>>> = {
  'mod-character': () => import('@/mods/mod-character/_internal/control') as Promise<Record<string, unknown>>,
  'mod-difficulty': () => import('@/mods/mod-difficulty/_internal/control') as Promise<Record<string, unknown>>,
  'mod-engine': () => import('@/mods/mod-engine/_internal/control') as Promise<Record<string, unknown>>,
  'mod-history-dynamics': () => import('@/mods/mod-history-dynamics/_internal/control') as Promise<Record<string, unknown>>,
  'mod-pages': () => import('@/mods/mod-pages/_internal/control') as Promise<Record<string, unknown>>,
  'mod-power-system': () => import('@/mods/mod-power-system/_internal/control') as Promise<Record<string, unknown>>,
  'mod-progression': () => import('@/mods/mod-progression/_internal/control') as Promise<Record<string, unknown>>,
  'mod-settings': () => import('@/mods/mod-settings/_internal/control') as Promise<Record<string, unknown>>,
  'mod-tech-level': () => import('@/mods/mod-tech-level/_internal/control') as Promise<Record<string, unknown>>,
  'mod-ui': () => import('@/mods/mod-ui/_internal/control') as Promise<Record<string, unknown>>,
  'mod-world': () => import('@/mods/mod-world/_internal/control') as Promise<Record<string, unknown>>,
  'mod-world-map': () => import('@/mods/mod-world-map/_internal/control') as Promise<Record<string, unknown>>,
}
