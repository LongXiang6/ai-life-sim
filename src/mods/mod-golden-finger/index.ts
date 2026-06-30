/**
 * @module index
 * @description mod-golden-finger 公共 API 导出
 * @mod mod-golden-finger
 */

export type {
  PanelType,
  NonPanelType,
  GoldenFingerKind,
  GoldenFingerTier,
  GoldenFingerMode,
  NarrativePersona,
  GoldenFingerTemplate,
  QuestEntry,
  GoldenFingerState,
  GoldenFingerBoosts,
  PanelActionResult,
} from './types'

export {
  GOLDEN_FINGER_TEMPLATES,
  WORLDVIEW_WEIGHTS,
  TYPE_LABELS,
  TIER_LABELS,
} from './constants'

export {
  getTemplateById,
  getTemplatesByKind,
} from './utils'

export { useGoldenFingerStore } from './store'
export { useGoldenFinger } from './hooks'
