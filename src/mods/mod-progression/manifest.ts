import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-progression',
  order: 420,
  version: '1.0.0',
  description: '通用技能与能力成长',
  dependencies: ['mod-engine', 'mod-world', 'mod-history-dynamics'],
  provides: ['progression', 'growth-system'],
  consumes: ['historical-event-ledger'],
  subsystems: ['GrowthSystem'],
  secondaryPublicEntries: ['progression-api.ts'],
  stores: [],
  prompts: [],
  events: { emits: [], listens: [] },
})
