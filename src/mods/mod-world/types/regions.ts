/**
 * Purpose: Define compact narrative region records used by world initialization and spatial-graph.
 * Owner: mod-world / spatial-graph.
 * Responsibility: Region data shapes only; graph mutation and persistence stay in owning modules.
 */

import type { RegionNarrativeProfile } from '@/foundation'

export interface RegionData extends Omit<RegionNarrativeProfile, 'regionId'> {
  id: string
  localId?: string
  contextId?: string
  templateType: string
  terrainTag: string
}

export type GenerationStrategy = 'climateLatitude' | 'concentricRings' | 'discrete' | 'cosmic' | 'abstract'

export interface MapTemplateConfig {
  label: string
  regionCount: number
  description: string
  generationStrategy: GenerationStrategy
}
