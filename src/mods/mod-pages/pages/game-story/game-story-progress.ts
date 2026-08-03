/**
 * Purpose: Resolve story progress labels and advance-control copy from runtime state.
 * Owner: mod-pages/game-story
 * Responsibility: Pure progress presentation rules only.
 */

interface ResolveGameStoryProgressOptions {
  autoRetryPending: boolean
  forceBranchNext: boolean
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
  autoRetryPending,
  forceBranchNext,
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
      : hasUnresolvedBranch || narrativeError ? 1 : 2
  const storyProgressLabel = !isRuntimeReady
    ? runtimeBlockedText
    : isAdvancing
      ? hasVisiblePendingNarrative ? '正文已生成，正在完成本轮' : '正在生成下一段'
      : hasUnresolvedBranch
        ? '等待你的选择'
        : narrativeError
          ? '本轮未完成，可重试'
          : forceBranchNext ? '已请求命运分叉' : '岁月流转'
  const narrativeAdvanceText = narrativeError && !hasUnresolvedBranch
    ? hasVisiblePendingNarrative ? '重新尝试本轮' : '立即重试，继续此段故事'
    : '轻触，让岁月流转'
  const narrativeAdvanceHint = narrativeError && !hasUnresolvedBranch
    ? hasVisiblePendingNarrative
      ? autoRetryPending
        ? '正文已保留，正在自动重新尝试'
        : '正文已保留，可再次尝试完成本轮'
      : autoRetryPending
        ? '正在自动重新尝试；轻触可立即重试'
        : '自动重试未恢复；轻触可再次尝试'
    : '下一段故事已经准备好'

  return {
    narrativeAdvanceBlockedText: isRuntimeReady ? '完成分支后继续' : runtimeBlockedText,
    narrativeAdvanceHint,
    narrativeAdvanceText,
    storyProgressActiveIndex,
    storyProgressLabel,
    storyProgressSteps: STORY_PROGRESS_STEPS,
  }
}
