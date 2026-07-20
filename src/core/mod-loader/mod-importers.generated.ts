/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

/** 全部 MOD index.ts import — Remote API 注册专用（非 lifecycle / 非子系统注册） */
export const MOD_API_IMPORTERS: Record<string, () => Promise<Record<string, unknown>>> = {
  'mod-base-universe': () => import('@/mods/mod-base-universe') as Promise<Record<string, unknown>>,
  'mod-character': () => import('@/mods/mod-character') as Promise<Record<string, unknown>>,
  'mod-culture': () => import('@/mods/mod-culture') as Promise<Record<string, unknown>>,
  'mod-difficulty': () => import('@/mods/mod-difficulty') as Promise<Record<string, unknown>>,
  'mod-economy': () => import('@/mods/mod-economy') as Promise<Record<string, unknown>>,
  'mod-engine': () => import('@/mods/mod-engine') as Promise<Record<string, unknown>>,
  'mod-environment-ecology': () => import('@/mods/mod-environment-ecology') as Promise<Record<string, unknown>>,
  'mod-history-dynamics': () => import('@/mods/mod-history-dynamics') as Promise<Record<string, unknown>>,
  'mod-npc': () => import('@/mods/mod-npc') as Promise<Record<string, unknown>>,
  'mod-pages': () => import('@/mods/mod-pages') as Promise<Record<string, unknown>>,
  'mod-politics': () => import('@/mods/mod-politics') as Promise<Record<string, unknown>>,
  'mod-power-system': () => import('@/mods/mod-power-system') as Promise<Record<string, unknown>>,
  'mod-settings': () => import('@/mods/mod-settings') as Promise<Record<string, unknown>>,
  'mod-tech-level': () => import('@/mods/mod-tech-level') as Promise<Record<string, unknown>>,
  'mod-ui': () => import('@/mods/mod-ui') as Promise<Record<string, unknown>>,
  'mod-world': () => import('@/mods/mod-world') as Promise<Record<string, unknown>>,
  'mod-world-map': () => import('@/mods/mod-world-map') as Promise<Record<string, unknown>>,
}

/** @deprecated 使用 MOD_CONTROL_IMPORTERS（lifecycle）或 MOD_API_IMPORTERS（Remote） */
export const MOD_IMPORTERS = MOD_API_IMPORTERS
