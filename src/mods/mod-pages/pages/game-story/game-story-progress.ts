/**
 * Purpose: Resolve story progress labels and advance-control copy from runtime state.
 * Owner: mod-pages/game-story
 * Responsibility: Pure progress presentation rules only.
 */

interface ResolveGameStoryProgressOptions {
  forceBranchNext: boolean
  hasPendingDestinyPatternGrowth: boolean
  hasUnresolvedBranch: boolean
  hasVisiblePendingNarrative: boolean
  isAdvancing: boolean
  isRuntimeReady: boolean
  narrativeError?: string | null
  runtimeBlockedText: string
}

const STORY_PROGRESS_STEPS = [
  { key: 'write', label: '生成正文' },
  { key: 'finalize', label: '完成本轮' },
  { key: 'continue', label: '继续人生' },
]

export function resolveGameStoryProgress({
  forceBranchNext,
  hasPendingDestinyPatternGrowth,
  hasUnresolvedBranch,
  hasVisiblePendingNarrative,
  isAdvancing,
  isRuntimeReady,
  narrativeError,
  runtimeBlockedText,
}: ResolveGameStoryProgressOptions) {
  const storyProgressActiveIndex = !isRuntimeReady
    ? 0
    : isAdvancing
      ? hasVisiblePendingNarrative ? 1 : 0
      : hasUnresolvedBranch || hasPendingDestinyPatternGrowth || narrativeError ? 1 : 2
  const storyProgressLabel = !isRuntimeReady
    ? runtimeBlockedText
    : isAdvancing
      ? hasVisiblePendingNarrative ? '正文已生成，正在完成本轮' : '正在生成下一段'
      : hasUnresolvedBranch
        ? '等待你的选择'
        : hasPendingDestinyPatternGrowth
          ? '等待天赋成长选择'
        : narrativeError
          ? '本轮未完成，可手动重试'
          : forceBranchNext ? '已请求命运分叉' : '岁月流转'
  const narrativeAdvanceText = narrativeError && !hasUnresolvedBranch && !hasPendingDestinyPatternGrowth
      ? hasVisiblePendingNarrative ? '手动重试本轮' : '手动重试，继续此段故事'
    : '轻触，让岁月流转'
  const narrativeAdvanceHint = narrativeError && !hasUnresolvedBranch && !hasPendingDestinyPatternGrowth
    ? hasVisiblePendingNarrative
      ? '正文已保留，可手动再次尝试完成本轮'
      : '本轮未完成，可手动再次尝试'
    : '下一段故事已经准备好'

  return {
    narrativeAdvanceBlockedText: isRuntimeReady
      ? hasPendingDestinyPatternGrowth ? '选择天赋成长后继续' : '完成分支后继续'
      : runtimeBlockedText,
    narrativeAdvanceHint,
    narrativeAdvanceText,
    storyProgressActiveIndex,
    storyProgressLabel,
    storyProgressSteps: STORY_PROGRESS_STEPS,
  }
}
