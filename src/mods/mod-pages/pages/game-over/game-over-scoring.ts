export type GameOverAchievementKind = 'choice' | 'breakthrough'

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

export interface GameOverBreakthroughFact {
  pathway: string
  year: number
  yearsGained: number
  description: string
}

export interface GameOverScoreInput {
  dimensionValues: readonly number[]
  rounds: number
  resolvedChoiceCount: number
  breakthroughCount: number
  completed: boolean
}

export interface GameOverScoreResult {
  score: number
  rawScore: number
  components: {
    attributes: number
    journey: number
    choices: number
    breakthroughs: number
    completion: number
  }
}

export type ReincarnationStrengthTierId = 'echo' | 'deep' | 'legacy' | 'immortal'

export interface ReincarnationStrengthTier {
  id: ReincarnationStrengthTierId
  label: string
  guidance: string
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value))
}

export function normalizeAchievementScore(rawScore: number): number {
  const raw = clampScore(rawScore)
  if (raw >= 95) return Math.round(raw)
  return Math.min(94, Math.round(72 + 23 * Math.sqrt(raw / 95)))
}

export function calculateGameOverScore(input: GameOverScoreInput): GameOverScoreResult {
  const attributes = input.dimensionValues.length > 0
    ? clampScore(input.dimensionValues.reduce((sum, value) => sum + clampScore(value), 0) / input.dimensionValues.length)
    : 0
  const journey = clampScore((1 - Math.exp(-Math.max(0, input.rounds) / 16)) * 100)
  const choices = clampScore(Math.max(0, input.resolvedChoiceCount) * 25)
  const breakthroughs = clampScore(Math.max(0, input.breakthroughCount) * 40)
  const completion = input.completed ? 100 : 0
  const rawScore = clampScore(
    attributes * 0.20
    + journey * 0.35
    + choices * 0.25
    + breakthroughs * 0.15
    + completion * 0.05,
  )
  return {
    score: normalizeAchievementScore(rawScore),
    rawScore: Math.round(rawScore * 10) / 10,
    components: {
      attributes: Math.round(attributes),
      journey: Math.round(journey),
      choices: Math.round(choices),
      breakthroughs: Math.round(breakthroughs),
      completion,
    },
  }
}

export function buildGameOverAchievements(
  narratives: readonly GameOverNarrativeFact[],
  breakthroughs: readonly GameOverBreakthroughFact[],
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
  const lifespan = breakthroughs.map((entry, index) => ({
    id: `breakthrough-${entry.pathway}-${entry.year}-${index}`,
    kind: 'breakthrough' as const,
    title: entry.description.trim() || '寿命突破',
    detail: `延展 ${entry.yearsGained} 年生命上限`,
    timeLabel: `第 ${entry.year} 年`,
    weight: 50 + Math.max(0, entry.yearsGained),
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
