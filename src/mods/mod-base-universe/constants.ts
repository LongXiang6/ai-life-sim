import type { ProphecySource } from './types'
export const CELESTIAL_PHASE_LABELS = { normal: '常态', event: '特殊天象' } as const
export const PROPHECY_SOURCE_LABELS: Record<ProphecySource, string> = { celestial: '天象', oracle: '神谕', dream: '梦兆', divine: '神祇', artifact: '遗物' }
