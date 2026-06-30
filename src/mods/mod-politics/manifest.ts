/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 政治/社会结构系统
 * @mod mod-politics
 *
 * 拆分自 mod-social-civilization（7 个子系统）
 */
import type { ModManifest } from '@/foundation'
import { defineMod } from '@/core'

const manifest: ModManifest = {
  name: 'mod-politics',
  version: '1.0.0',
  description: '政治系统：社会阶层、派系、国家关系、法律、冲突周期、语言命名、社会价值',
  dependencies: ['mod-world', '~mod-economy'],
  provides: [
    'politics',
    'social-stratification',
    'faction',
    'nation-relation',
    'legal',
    'conflict-cycle',
    'language-naming',
    'social-values',
  ],
  consumes: ['economy'],
  subsystems: [
    'SocialStratificationSystem',
    'FactionDynamicsSystem',
    'NationRelationSystem',
    'LegalSystem',
    'ConflictCycleSystem',
    'LanguageNamingSystem',
    'SocialValuesSystem',
  ],
  stores: ['usePoliticsStore'],
  events: {
    emits: [
      'mod-politics:stratum-change',
      'mod-politics:faction-emerged',
      'mod-politics:war-declared',
      'mod-politics:law-enacted',
      'mod-politics:conflict-escalated',
      'mod-politics:language-evolved',
      'mod-politics:value-shift',
    ],
    listens: ['mod-engine:round-complete'],
  },
}

export default defineMod(manifest)
