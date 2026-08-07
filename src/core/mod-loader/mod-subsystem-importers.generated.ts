/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

/** 子系统按文件 import（registerAllSubsystems 专用，不经过 subsystems/index barrel） */
export const MOD_SUBSYSTEM_IMPORTERS: Record<string, () => Promise<Record<string, unknown>>> = {
  'mod-character': async () => {
    const [m0, m1] = await Promise.all([
    import('@/mods/mod-character/subsystems/character-base-system'),
    import('@/mods/mod-character/subsystems/destiny-pattern-system'),
    ])
    return { ...m0, ...m1 }
  },
  'mod-history-dynamics': async () => {
    const [m0] = await Promise.all([
    import('@/mods/mod-history-dynamics/subsystems/historical-event-ledger-system'),
    ])
    return { ...m0 }
  },
  'mod-power-system': async () => {
    const [m0, m1] = await Promise.all([
    import('@/mods/mod-power-system/subsystems/combat-power-system'),
    import('@/mods/mod-power-system/subsystems/cultivation-system'),
    ])
    return { ...m0, ...m1 }
  },
  'mod-progression': async () => {
    const [m0] = await Promise.all([
    import('@/mods/mod-progression/subsystems/growth-system'),
    ])
    return { ...m0 }
  },
  'mod-tech-level': async () => {
    const [m0] = await Promise.all([
    import('@/mods/mod-tech-level/subsystems/culture-tech-system'),
    ])
    return { ...m0 }
  },
  'mod-world': async () => {
    const [m0, m1, m2, m3, m4, m5] = await Promise.all([
    import('@/mods/mod-world/subsystems/world-context-registry-system'),
    import('@/mods/mod-world/subsystems/contextual-capability-profile-system'),
    import('@/mods/mod-world/subsystems/spatial-graph-system'),
    import('@/mods/mod-world/subsystems/context-transition-system'),
    import('@/mods/mod-world/subsystems/simulation-scope-policy-system'),
    import('@/mods/mod-world/subsystems/world-init-system'),
    ])
    return { ...m0, ...m1, ...m2, ...m3, ...m4, ...m5 }
  },
}
