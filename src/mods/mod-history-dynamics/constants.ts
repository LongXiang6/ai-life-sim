/**
 * @module constants.ts
 * @description 历史事件状态机常量；不包含题材预设、随机触发或容量淘汰规则
 * @mod mod-history-dynamics
 */

import type { HistoricalEventStatus } from '@/foundation'

export const HISTORICAL_EVENT_STATUSES = [
  'scheduled',
  'active',
  'occurred',
  'prevented',
  'resolved',
  'void',
] as const satisfies readonly HistoricalEventStatus[]

export const HISTORICAL_EVENT_TRANSITIONS: Readonly<
  Record<HistoricalEventStatus, readonly HistoricalEventStatus[]>
> = {
  scheduled: ['active', 'occurred', 'prevented', 'void'],
  active: ['occurred', 'prevented', 'resolved', 'void'],
  occurred: ['active', 'resolved', 'void'],
  prevented: ['resolved', 'void'],
  resolved: ['void'],
  void: [],
}
