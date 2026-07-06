/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

/** 子系统按文件 import（registerAllSubsystems 专用，不经过 subsystems/index barrel） */
export const MOD_SUBSYSTEM_IMPORTERS: Record<string, () => Promise<Record<string, unknown>>> = {
  'mod-base-universe': async () => {
    const [m0, m1, m2, m3, m4] = await Promise.all([
    import('@/mods/mod-base-universe/subsystems/celestial-system'),
    import('@/mods/mod-base-universe/subsystems/era-system'),
    import('@/mods/mod-base-universe/subsystems/world-map-system'),
    import('@/mods/mod-base-universe/subsystems/fate-prophecy-system'),
    import('@/mods/mod-base-universe/subsystems/divine-creation-system'),
    ])
    return { ...m0, ...m1, ...m2, ...m3, ...m4 }
  },
  'mod-character': async () => {
    const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = await Promise.all([
    import('@/mods/mod-character/subsystems/character-base-system'),
    import('@/mods/mod-character/subsystems/destiny-pattern-system'),
    import('@/mods/mod-character/subsystems/health-system'),
    import('@/mods/mod-character/subsystems/lifespan-system'),
    import('@/mods/mod-character/subsystems/life-stage-system'),
    import('@/mods/mod-character/subsystems/attribute-decay-system'),
    import('@/mods/mod-character/subsystems/morality-system'),
    import('@/mods/mod-character/subsystems/luck-system'),
    import('@/mods/mod-character/subsystems/post-death-epilogue-system'),
    ])
    return { ...m0, ...m1, ...m2, ...m3, ...m4, ...m5, ...m6, ...m7, ...m8 }
  },
  'mod-culture': async () => {
    const [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9] = await Promise.all([
    import('@/mods/mod-culture/subsystems/culture-system'),
    import('@/mods/mod-culture/subsystems/art-system'),
    import('@/mods/mod-culture/subsystems/education-system'),
    import('@/mods/mod-culture/subsystems/reputation-system'),
    import('@/mods/mod-culture/subsystems/achievement-system'),
    import('@/mods/mod-culture/subsystems/works-system'),
    import('@/mods/mod-culture/subsystems/relationship-system'),
    import('@/mods/mod-culture/subsystems/family-system'),
    import('@/mods/mod-culture/subsystems/disciple-system'),
    import('@/mods/mod-culture/subsystems/personal-ability-system'),
    ])
    return { ...m0, ...m1, ...m2, ...m3, ...m4, ...m5, ...m6, ...m7, ...m8, ...m9 }
  },
  'mod-economy': async () => {
    const [m0, m1, m2, m3, m4] = await Promise.all([
    import('@/mods/mod-economy/subsystems/economy-system'),
    import('@/mods/mod-economy/subsystems/work-system'),
    import('@/mods/mod-economy/subsystems/item-system'),
    import('@/mods/mod-economy/subsystems/settlement-system'),
    import('@/mods/mod-economy/subsystems/population-system'),
    ])
    return { ...m0, ...m1, ...m2, ...m3, ...m4 }
  },
  'mod-environment-ecology': async () => {
    const [m0, m1, m2, m3, m4] = await Promise.all([
    import('@/mods/mod-environment-ecology/subsystems/climate-system'),
    import('@/mods/mod-environment-ecology/subsystems/geography-system'),
    import('@/mods/mod-environment-ecology/subsystems/ecology-system'),
    import('@/mods/mod-environment-ecology/subsystems/natural-resource-system'),
    import('@/mods/mod-environment-ecology/subsystems/pollution-system'),
    ])
    return { ...m0, ...m1, ...m2, ...m3, ...m4 }
  },
  'mod-golden-finger': async () => {
    const [m0] = await Promise.all([
    import('@/mods/mod-golden-finger/subsystems/golden-finger-system'),
    ])
    return { ...m0 }
  },
  'mod-history-dynamics': async () => {
    const [m0, m1] = await Promise.all([
    import('@/mods/mod-history-dynamics/subsystems/event-pool-system'),
    import('@/mods/mod-history-dynamics/subsystems/causal-simulation-system'),
    ])
    return { ...m0, ...m1 }
  },
  'mod-npc': async () => {
    const [m0, m1, m2] = await Promise.all([
    import('@/mods/mod-npc/subsystems/npc-attribute-system'),
    import('@/mods/mod-npc/subsystems/npc-behavior-system'),
    import('@/mods/mod-npc/subsystems/npc-memory-system'),
    ])
    return { ...m0, ...m1, ...m2 }
  },
  'mod-politics': async () => {
    const [m0, m1, m2, m3, m4, m5, m6] = await Promise.all([
    import('@/mods/mod-politics/subsystems/social-stratification-system'),
    import('@/mods/mod-politics/subsystems/faction-dynamics-system'),
    import('@/mods/mod-politics/subsystems/nation-relation-system'),
    import('@/mods/mod-politics/subsystems/legal-system'),
    import('@/mods/mod-politics/subsystems/conflict-cycle-system'),
    import('@/mods/mod-politics/subsystems/language-naming-system'),
    import('@/mods/mod-politics/subsystems/social-values-system'),
    ])
    return { ...m0, ...m1, ...m2, ...m3, ...m4, ...m5, ...m6 }
  },
  'mod-power-system': async () => {
    const [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9] = await Promise.all([
    import('@/mods/mod-power-system/subsystems/combat-power-system'),
    import('@/mods/mod-power-system/subsystems/cultivation-system'),
    import('@/mods/mod-power-system/subsystems/monster-system'),
    import('@/mods/mod-power-system/subsystems/fortune-encounter-system'),
    import('@/mods/mod-power-system/subsystems/faith-system'),
    import('@/mods/mod-power-system/subsystems/supreme-item-system'),
    import('@/mods/mod-power-system/subsystems/divine-intervention-system'),
    import('@/mods/mod-power-system/subsystems/anomaly-phenomena-system'),
    import('@/mods/mod-power-system/subsystems/special-material-system'),
    import('@/mods/mod-power-system/subsystems/skill-system'),
    ])
    return { ...m0, ...m1, ...m2, ...m3, ...m4, ...m5, ...m6, ...m7, ...m8, ...m9 }
  },
  'mod-tech-level': async () => {
    const [m0, m1] = await Promise.all([
    import('@/mods/mod-tech-level/subsystems/industry-system'),
    import('@/mods/mod-tech-level/subsystems/culture-tech-system'),
    ])
    return { ...m0, ...m1 }
  },
  'mod-world': async () => {
    const [m0, m1] = await Promise.all([
    import('@/mods/mod-world/subsystems/world-init-system'),
    import('@/mods/mod-world/subsystems/world-entity-system'),
    ])
    return { ...m0, ...m1 }
  },
}
