import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-progression',
  order: 420,
  version: '1.0.0',
  description: '通用成长、历史事实成就与分域声望',
  dependencies: ['mod-engine', 'mod-world', 'mod-history-dynamics'],
  provides: ['progression', 'growth-system', 'achievement', 'reputation'],
  consumes: ['world-entity', 'historical-event-ledger'],
  subsystems: ['GrowthSystem', 'AchievementSystem', 'ReputationSystem'],
  secondaryPublicEntries: ['progression-api.ts'],
  stores: [],
  prompts: [],
  events: { emits: [], listens: [] },
})
