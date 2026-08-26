/**
 * Purpose: Format local world-event candidates for the main story Prompt.
 * Owner: mod-engine / narrative Prompt projection.
 * Responsibility: Read-only, human-readable projection only; mod-world owns selection.
 */

import type {
  WorldEventCandidateBatch,
  WorldEventCategory,
  WorldEventIntensity,
} from '@/mods/mod-world/world-runtime-api'

const CATEGORY_LABELS: Record<WorldEventCategory, string> = {
  environment: '环境',
  social: '社会',
  economic: '经济',
  political: '政治',
  ecological: '生态',
  technology: '技术',
  migration: '迁徙',
  discovery: '发现',
  hazard: '风险',
  opportunity: '机遇',
}

const INTENSITY_LABELS: Record<WorldEventIntensity, string> = {
  minor: '轻微',
  moderate: '中等',
  major: '重大',
}

/**
 * Candidate text exposes local material without adding a story structure.
 */
export function buildWorldEventCandidatePromptProjection(
  batch: WorldEventCandidateBatch | undefined,
): string | undefined {
  if (!batch || batch.candidates.length === 0) return undefined
  return [
    '【本轮事件材料】',
    '以下材料由本地世界事件库提供，不是已经确认的状态，也不是强制情节；故事可根据整体输入合理采用、改写、略过或延后。',
    ...batch.candidates.map((candidate) => [
      `事件类别：${CATEGORY_LABELS[candidate.category]}`,
      `强度：${INTENSITY_LABELS[candidate.intensity]}`,
      `触发依据：${candidate.trigger.label}`,
      `可见候选：${candidate.fact}`,
      `采用方式：${candidate.adoptionInstruction}`,
    ].join('；')),
    '正文实际写出的内容才交给后续状态提取；未写出的材料不自动成为历史事实。',
  ].join('\n')
}
