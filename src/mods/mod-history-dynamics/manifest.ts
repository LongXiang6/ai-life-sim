/**
 * @module manifest.ts
 * @description MOD 身份声明 —— P1 历史事件账本
 * @mod mod-history-dynamics
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-history-dynamics',
  version: '2.0.0',
  description: '跨世界历史事件、证据、候选审计与因果图的唯一事实账本',
  dependencies: ['mod-engine', 'mod-world'],
  provides: ['history-dynamics', 'historical-event-ledger'],
  consumes: [],
  subsystems: ['HistoricalEventLedgerSystem'],
  stores: ['useHistoryDynamicsStore'],
  secondaryPublicEntries: ['historical-event-api.ts'],
})
