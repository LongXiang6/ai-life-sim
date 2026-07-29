/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— 文化/个人发展系统
 * @mod mod-culture
 */

// 类型
export type {
  CultureState,
  CulturalValue,
  Custom,
  CustomCategory,
  Festival,
  Ritual,
  Taboo,
  NotableEvent,
  ArtState,
  Artwork,
  ArtForm,
  EducationState,
  EducationQuality,
  EducationSystemType,
  EducationDirection,
  EducationLevel,
  ReputationState,
  ReputationDimension,
  ReputationEntry,
  AchievementState,
  Achievement,
  AchievementRarity,
  WorksState,
  WorksEntry,
  WorkCategory,
  WorkStatus,
  FamilyState,
  FamilyMember,
  FamilyRole,
  SpouseStatus,
  DiscipleState,
  Disciple,
  DiscipleStatus,
  PersonalAbilityState,
  SkillEntry,
  KnowledgeEntry,
  KnowledgeCategory,
  CultureSummary,
} from './types'

// Store
export { useCultureStore } from './store'

// 轻量节日历法上下文（不启动 CultureSystem）
export { buildCultureCalendarNarrativeContext } from './calendar-context'
export type { CultureCalendarNarrativeInput } from './calendar-context'

// Hooks
export {
  useReputation,
  useFamily,
  useEducation,
  useCulture,
  useArt,
  useDisciple,
  usePersonalAbility,
  useAchievements,
  useWorks,
} from './hooks'
