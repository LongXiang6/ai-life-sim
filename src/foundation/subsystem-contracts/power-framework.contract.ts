export type PowerFrameworkProgression = 'bounded' | 'open'

export type PowerFrameworkSource = 'world-default' | 'world-custom' | 'world-ai'

export interface PowerRankDefinition {
  id: string
  index: number
  label: string
  description: string
}

/** A world's immutable comparison scale. Runtime character progress belongs to P8. */
export interface PowerFrameworkDefinition {
  id: string
  label: string
  enabled: boolean
  progression: PowerFrameworkProgression
  ranks: PowerRankDefinition[]
  source: PowerFrameworkSource
}

/** AI and UI may propose semantics, while mod-world creates all machine identifiers. */
export interface PowerFrameworkProposal {
  label: string
  progression: PowerFrameworkProgression
  ranks: Array<Pick<PowerRankDefinition, 'label' | 'description'>>
}
