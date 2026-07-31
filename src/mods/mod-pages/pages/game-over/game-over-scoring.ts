export type GameOverAchievementKind = 'choice' | 'lifespan-adjustment'

export interface GameOverAchievement {
  id: string
  kind: GameOverAchievementKind
  title: string
  detail: string
  timeLabel: string
  weight: number
}

export interface GameOverNarrativeFact {
  id?: string
  branchTitle?: string
  resolvedChoice?: string
  displayTimeLabel?: string
  displayAge?: number
}

export interface GameOverLifespanAdjustmentFact {
  adjustmentId: string
  occurredAtTotalDays: number
  deltaDays: number
  description: string
}

export type ReincarnationStrengthTierId = 'echo' | 'deep' | 'legacy' | 'immortal'

export interface ReincarnationStrengthTier {
  id: ReincarnationStrengthTierId
  label: string
  guidance: string
}

export function buildGameOverAchievements(
  narratives: readonly GameOverNarrativeFact[],
  lifespanAdjustments: readonly GameOverLifespanAdjustmentFact[],
): GameOverAchievement[] {
  const choices = narratives.flatMap((entry, index) => {
    const choice = entry.resolvedChoice?.trim()
    if (!choice) return []
    const title = entry.branchTitle?.trim() || '一次命运抉择'
    const timeLabel = entry.displayTimeLabel?.trim()
      || (entry.displayAge === undefined ? `第 ${index + 1} 轮` : `${entry.displayAge} 岁`)
    return [{
      id: `choice-${entry.id ?? index}`,
      kind: 'choice' as const,
      title,
      detail: `选择了「${choice}」`,
      timeLabel,
      weight: 30,
    }]
  })
  const lifespan = lifespanAdjustments
    .filter((entry) => entry.deltaDays > 0)
    .map((entry) => ({
      id: entry.adjustmentId,
      kind: 'lifespan-adjustment' as const,
      title: entry.description.trim() || '寿命上限延展',
      detail: `延展 ${entry.deltaDays} 天生命上限`,
      timeLabel: `第 ${Math.floor(entry.occurredAtTotalDays / 365)} 年`,
      weight: 50 + Math.max(0, Math.round(entry.deltaDays / 365)),
    }))
  return [...choices, ...lifespan]
}

export function selectFeaturedAchievement(
  achievements: readonly GameOverAchievement[],
): GameOverAchievement | null {
  return achievements.reduce<GameOverAchievement | null>((featured, current) => {
    if (!featured || current.weight > featured.weight) return current
    return featured
  }, null)
}

export function getReincarnationStrengthTier(score: number): ReincarnationStrengthTier {
  if (score >= 95) {
    return {
      id: 'immortal',
      label: '不朽',
      guidance: '可形成影响广泛、跨世界仍有高叙事杠杆的概念规则，但必须保留代价、条件与失败空间。',
    }
  }
  if (score >= 90) {
    return {
      id: 'legacy',
      label: '传世',
      guidance: '可形成稳定而显著的跨世界概念优势，必须由主动选择或明确条件触发。',
    }
  }
  if (score >= 80) {
    return {
      id: 'deep',
      label: '深刻',
      guidance: '形成清晰且有用的概念倾向，作用范围适中，并保留情境限制。',
    }
  }
  return {
    id: 'echo',
    label: '余响',
    guidance: '形成温和、局部、容易理解的概念回响，不提供决定性优势。',
  }
}
