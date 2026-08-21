/**
 * Purpose: Build the textual facts, fallback copy, and filename for a game-over share card.
 * Owner: mod-pages/game-over
 * Responsibility: Share content projection only; canvas drawing and browser delivery remain separate.
 */

import type {
  GameOverShareCardData,
  GameOverShareDimension,
  GameOverShareFact,
} from './game-over-share.types'

export function getStrongestShareDimension(
  dimensions: readonly GameOverShareDimension[],
): GameOverShareDimension | null {
  if (dimensions.length === 0) return null
  return dimensions.reduce((strongest, current) => (
    current.value > strongest.value ? current : strongest
  ))
}

export function getDimensionComment(dimension: GameOverShareDimension): string {
  return dimension.comment?.trim() || '未记录'
}

export function buildGameOverShareFacts(data: GameOverShareCardData): GameOverShareFact[] {
  const strongest = getStrongestShareDimension(data.dimensions)
  return [
    { label: '此生行程', value: `${data.rounds} 轮世事` },
    { label: '此生年岁', value: data.ageLabel },
    { label: '此生里程碑', value: `${data.achievementCount} 项已确认大事` },
    ...(data.featuredAchievement
      ? [{ label: '代表大事', value: `${data.featuredAchievement.title} · ${data.featuredAchievement.detail}` }]
      : []),
    {
      label: '最鲜明力量',
      value: strongest
        ? `${strongest.label} ${strongest.value} · ${getDimensionComment(strongest)}`
        : '尚无四维记录',
    },
  ]
}

export function buildGameOverShareText(data: GameOverShareCardData): string {
  const strongest = getStrongestShareDimension(data.dimensions)
  return [
    `${data.characterName || '无名之辈'}在「${data.worldName}」走完了一生。`,
    `${data.rounds} 轮世事 · ${data.ageLabel} · 人生评分 ${data.overallScore}`,
    `${data.achievementCount} 项已确认大事`,
    data.featuredAchievement
      ? `代表大事：${data.featuredAchievement.title} · ${data.featuredAchievement.detail}`
      : '',
    strongest ? `最鲜明的力量：${strongest.label} ${strongest.value}（${getDimensionComment(strongest)}）` : '',
    data.reincarnation ? `此生留下的轮回天赋：${data.reincarnation.name} · ${data.reincarnation.description}` : '',
    '#AI人生模拟器',
    data.shareUrl?.trim() ?? '',
  ].filter(Boolean).join('\n')
}

export function buildGameOverShareFileName(data: Pick<GameOverShareCardData, 'lifeRunId'>): string {
  const safeRunId = data.lifeRunId.replace(/[^a-zA-Z0-9_-]/g, '-') || 'life'
  return `ai-life-sim-${safeRunId}.png`
}
