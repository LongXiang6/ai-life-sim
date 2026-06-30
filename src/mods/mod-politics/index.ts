/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— 政治/社会结构系统
 * @mod mod-politics
 */

export type {
  SocialStratum,
  NobleHouse,
  SocialClassState,
  SocialStratificationState,
  FactionStatus,
  FactionRank,
  Faction,
  FactionState,
  DiplomaticStance,
  NationRelationEntry,
  NationRelationState,
  LawCategory,
  LawEntry,
  LegalSystemType,
  LegalState,
  ConflictPhase,
  AntagonistStatus,
  AntagonistProfile,
  ConflictEvent,
  ConflictCycleState,
  LanguageProfile,
  LanguageNamingState,
  SocialValue,
  SocialValuesState,
  PoliticsSummary,
} from './types'

export { usePoliticsStore } from './store'

export {
  useSocialStratification,
  useFaction,
  useNationRelation,
  useLegal,
  useConflictCycle,
  useLanguageNaming,
  useSocialValues,
} from './hooks'

export { STRATUM_LABELS_DEFAULT } from './constants'
