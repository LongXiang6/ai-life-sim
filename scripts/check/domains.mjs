/**
 * @module domains.mjs
 * @description 检测域注册表 —— 按功能领域树形分组
 *
 * Profile 定义 → profiles.mjs
 * 规则元数据 → rules/registry.json
 */

/** @typedef {{ cmd: string, args?: string[], cwd?: string, env?: Record<string,string>, platforms?: string[] }} CheckStep */

/** @type {Record<string, { label: string, group: string, atceTier: string, ruleIds: string[], steps: CheckStep[], triggers: string[] }>} */
export const DOMAINS = {
  wiring: {
    label: '接线 / codegen',
    group: 'structural',
    atceTier: 'structural',
    ruleIds: ['A-01', 'A-02', 'A-13', 'A-14', 'A-15', 'A-16', 'A-17', 'D-07'],
    triggers: [
      'scripts/check/domains/structural',
      'scripts/codegen/generate-mod-wiring',
      'scripts/check/rules/registry.json',
      'scripts/check/rules/architecture-rules.json',
      'src/mods/registry.generated',
      'src/core/mod-loader/',
      'src/mods/mod-engine/bootstrap/',
      'manifest.ts',
      '/index.ts',
      '.generated.ts',
      'src/core/storage/',
      'persist',
      'localStorage.getItem',
    ],
    steps: [
      { cmd: 'node', args: ['scripts/codegen/generate-mod-wiring.mjs', '--check'] },
      { cmd: 'node', args: ['scripts/check/domains/structural/scan-typescript-wiring.mjs', '--quiet'] },
      { cmd: 'node', args: ['scripts/check/domains/structural/scan-mod-public-boundary.mjs', '--quiet'] },
      { cmd: 'node', args: ['scripts/check/domains/structural/scan-file-import-graph.mjs', '--quiet'] },
      { cmd: 'node', args: ['scripts/check/domains/structural/scan-persist-format.mjs', '--quiet'] },
    ],
  },
  loader: {
    label: 'MOD 加载器',
    group: 'structural',
    atceTier: 'structural',
    ruleIds: ['A-13'],
    triggers: [
      'scripts/check/domains/structural/test-mod-loader',
      'src/core/mod-loader/',
      'src/mods/registry.generated',
    ],
    steps: [{ cmd: 'node', args: ['scripts/check/domains/structural/test-mod-loader.mjs'] }],
  },
  mod: {
    label: 'MOD 架构扫描',
    group: 'mod-arch',
    atceTier: 'quality',
    ruleIds: ['A-05'],
    triggers: [
      'src/mods/',
      'scripts/check/domains/mod/',
      'scripts/check/check-format.ps1',
    ],
    steps: [
      {
        cmd: 'powershell',
        args: ['-File', 'scripts/check/domains/mod/run-mod-scanners.ps1', '-ErrorOnly'],
        env: { CHECK_QUIET: '1' },
        platforms: ['win32'],
      },
    ],
  },
  ui: {
    label: 'UI / CSS',
    group: 'ui',
    atceTier: 'cosmetic',
    ruleIds: [],
    triggers: [
      'src/app/',
      'src/mods/mod-pages/',
      'src/mods/mod-ui/',
      '.css',
      'scripts/check/domains/ui/',
    ],
    steps: [
      {
        cmd: 'powershell',
        args: ['-File', 'scripts/check/domains/ui/run-ui-scanners.ps1', '-ErrorOnly'],
        env: { CHECK_QUIET: '1' },
        platforms: ['win32'],
      },
      { cmd: 'node', args: ['scripts/check/domains/ui/mobile-ui-regression.mjs'] },
    ],
  },
  narrative: {
    label: '叙事 / Prompt',
    group: 'narrative',
    atceTier: 'quality',
    ruleIds: [],
    triggers: [
      'prompts/',
      'scripts/check/domains/narrative/',
      'src/mods/mod-engine/campaigns/',
      'src/mods/mod-engine/helpers/narrative-semantic-signals.ts',
      'src/mods/mod-engine/helpers/narrative-hints.ts',
      'src/mods/mod-engine/helpers/life-stage-archetypes.ts',
      'src/mods/mod-engine/helpers/life-stage-narrative.ts',
      'src/mods/mod-engine/helpers/digest-ledger.ts',
      'src/mods/mod-engine/helpers/save-restore.ts',
      'src/mods/mod-engine/store.ts',
      'src/mods/mod-engine/prompts/',
      'src/mods/mod-engine/subsystems/',
      'src/mods/mod-engine/subsystems/orchestrator-system.ts',
      'src/app/api/proxy/',
      'src/core/ai-service/',
      'src/mods/mod-settings/store.ts',
      'src/mods/mod-settings/components/SettingsTabPresets.tsx',
      'src/mods/mod-character/subsystems/post-death-epilogue-system.ts',
      'src/mods/mod-character/subsystems/lifespan-system.ts',
      'src/mods/mod-character/subsystems/character-base-system.ts',
      'src/mods/mod-pages/pages/character-create/useCharacterCreateLogic.ts',
      'src/mods/mod-pages/pages/character-create/CharacterBackgroundSection.tsx',
      'src/mods/mod-pages/pages/world-customize/',
      'src/mods/mod-pages/pages/world-select/WorldSelectCustomForm.tsx',
      'src/mods/mod-pages/pages/fate-preview/',
      'src/mods/mod-world/store.ts',
      'src/mods/mod-world/utils/calibration-clamp.ts',
      'src/mods/mod-world/utils/world-init-prompt-vars.ts',
      'src/mods/mod-world/utils/world-state-migration.ts',
      'docs/product-decisions.md',
      'docs/ui-prototypes/mobile/world-customize/final-wc-rf2-1.html',
      'docs/ui-prototypes/mobile/character-create/final-cc-rf9-1.html',
    ],
    steps: [
      { cmd: 'node', args: ['scripts/check/domains/narrative/validate-narrative-wiring.mjs'] },
      { cmd: 'node', args: ['--no-warnings=ExperimentalWarning', '--loader', './scripts/check/lib/typescript-loader.mjs', 'scripts/check/domains/narrative/semantic-authority-audit.mjs'] },
      { cmd: 'node', args: ['scripts/check/domains/narrative/time-step-resolver-smoke.mjs'] },
      { cmd: 'node', args: ['--no-warnings=ExperimentalWarning', '--loader', './scripts/check/lib/typescript-loader.mjs', 'scripts/check/domains/narrative/playtest-quality-regression.mjs'] },
      { cmd: 'node', args: ['--no-warnings=ExperimentalWarning', '--loader', './scripts/check/lib/typescript-loader.mjs', 'scripts/check/domains/narrative/branch-intent-resolution-smoke.mjs'] },
      { cmd: 'node', args: ['--no-warnings=ExperimentalWarning', '--loader', './scripts/check/lib/typescript-loader.mjs', 'scripts/check/domains/narrative/narrative-chinese-protocol-regression.mjs'] },
      { cmd: 'node', args: ['scripts/check/domains/narrative/starting-age-authority-regression.mjs'] },
      { cmd: 'node', args: ['scripts/check/domains/narrative/runtime-subsystem-state-regression.mjs'] },
      { cmd: 'node', args: ['--no-warnings=ExperimentalWarning', '--loader', './scripts/check/lib/typescript-loader.mjs', 'scripts/check/domains/narrative/compression-runtime-smoke.mjs'] },
      { cmd: 'node', args: ['--no-warnings=ExperimentalWarning', '--loader', './scripts/check/lib/typescript-loader.mjs', 'scripts/check/domains/narrative/no-hard-truncation-audit.mjs'] },
      { cmd: 'node', args: ['scripts/check/domains/narrative/managed-ai-default-regression.mjs'] },
      { cmd: 'node', args: ['--no-warnings=ExperimentalWarning', '--loader', './scripts/check/lib/typescript-loader.mjs', 'scripts/check/domains/narrative/managed-sse-aggregation-smoke.mjs'] },
      { cmd: 'node', args: ['--no-warnings=ExperimentalWarning', '--loader', './scripts/check/lib/typescript-loader.mjs', 'scripts/check/domains/narrative/ai-error-translation-smoke.mjs'] },
      { cmd: 'node', args: ['scripts/check/domains/narrative/narrative-regression-seed.mjs'] },
    ],
  },
  calibration: {
    label: '世界校准',
    group: 'calibration',
    atceTier: 'quality',
    ruleIds: [],
    triggers: [
      'calibration',
      'scripts/check/domains/calibration/',
      'mod-world/utils/calibration',
    ],
    steps: [
      { cmd: 'node', args: ['scripts/check/domains/calibration/world-calibration-acceptance.mjs'] },
      { cmd: 'node', args: ['scripts/check/domains/calibration/d37-config-override.mjs'] },
    ],
  },
}

export { PROFILES, resolveProfile } from './profiles.mjs'
