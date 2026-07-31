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
  order: 460,
  version: '2.0.0',
  description: '按上下文运行的政治实体关系、法律规范、社会结构和冲突状态机',
  dependencies: ['mod-world', 'mod-history-dynamics', '~mod-economy'],
  provides: [
    'politics',
    'social-stratification',
    'faction',
    'legal',
    'conflict-cycle',
  ],
  consumes: ['economy'],
  subsystems: [
    'SocialStratificationSystem',
    'FactionDynamicsSystem',
    'LegalSystem',
    'ConflictCycleSystem',
  ],
  stores: ['usePoliticsStore'],
  events: {
    emits: [
      'mod-politics:stratum-change',
      'mod-politics:faction-emerged',
      'mod-politics:conflict-transitioned',
      'mod-politics:law-enacted',
      'mod-politics:conflict-escalated',
    ],
    listens: ['mod-engine:round-complete'],
  },
}

export default defineMod(manifest)
