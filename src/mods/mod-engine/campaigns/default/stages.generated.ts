/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

/** 默认 campaign 阶段名（codegen 自 campaigns/default/index.ts） */
export const DEFAULT_CAMPAIGN_STAGE_NAMES = [
  "prepare-round",
  "queue-round",
  "advance-time",
  "subsystem-advance",
  "collect-states",
  "event-lifecycle",
  "assemble-prompt",
  "ai-narration",
  "publish-narrative",
  "ai-data-analysis",
  "ai-basic-attribute-analysis",
  "ai-event-recognition",
  "ai-macro-impact",
  "post-processing",
  "epilogue-check",
  "compress-save"
] as const
