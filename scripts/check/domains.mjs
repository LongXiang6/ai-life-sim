/**
 * @module domains.mjs
 * @description 检测域注册表 —— 按功能领域树形分组
 *
 * Profile 定义 → profiles.mjs
 * 规则元数据 → rules/registry.json
 */

/** @typedef {{ cmd: string, args?: string[], cwd?: string, env?: Record<string,string> }} CheckStep */

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
      },
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
      'src/mods/mod-engine/prompts/',
    ],
    steps: [
      { cmd: 'node', args: ['scripts/check/domains/narrative/validate-narrative-wiring.mjs'] },
      { cmd: 'node', args: ['scripts/check/domains/narrative/time-step-resolver-smoke.mjs'] },
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
