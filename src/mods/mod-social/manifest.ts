import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-social',
  order: 400,
  version: '1.0.0',
  description: '通用有向关系图与追加式关系迁移',
  dependencies: ['mod-engine', 'mod-world', 'mod-history-dynamics'],
  provides: ['social', 'relationship-system'],
  consumes: ['world-entity', 'historical-event-ledger'],
  subsystems: ['RelationshipSystem'],
  secondaryPublicEntries: ['relationship-system-api.ts'],
  stores: ['useRelationshipStore'],
  events: { emits: [], listens: [] },
})
