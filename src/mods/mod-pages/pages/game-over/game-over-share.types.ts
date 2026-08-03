/**
 * Purpose: Define the public data and result contracts for game-over sharing.
 * Owner: mod-pages/game-over
 * Responsibility: Share-card types only; content and rendering remain separate.
 */

export interface GameOverShareDimension {
  label: string
  value: number
  comment?: string
}

export interface GameOverShareMythic {
  name: string
  concept: string
  effect: string
}

export interface GameOverShareCardData {
  lifeRunId: string
  characterName: string
  worldName: string
  ageLabel: string
  rounds: number
  moralityLabel: string
  overallScore: number
  achievementCount: number
  featuredAchievement?: { title: string; detail: string } | null
  dimensions: readonly GameOverShareDimension[]
  mythic?: GameOverShareMythic | null
  shareUrl?: string
}

export interface GameOverShareFact {
  label: string
  value: string
}

export type GameOverShareOutcome = 'shared' | 'downloaded' | 'cancelled'
