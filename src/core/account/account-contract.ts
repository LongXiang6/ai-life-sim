/**
 * Purpose: Define the validated account, session, cloud-save, and settings contracts.
 * Owner: core:account
 * Responsibility: Single account data contract and its inferred TypeScript types only.
 */

import { z } from 'zod'

import {
  isNarrativeWordCountTarget,
  type NarrativeWordCountTarget,
} from '@/foundation'
import { normalizeTheme, type ThemeType } from '@/core/theme/theme-store'

export const ACCOUNT_SESSION_COOKIE = 'ai_life_session'
export const ACCOUNT_RETENTION_DAYS = 30
export const ACCOUNT_MAX_SLOTS = 10
/** 跨世界轮回天赋库的独立容量；与人生记录（ACCOUNT_MAX_SLOTS）互不影响。 */
export const REINCARNATION_LIBRARY_MAX_SLOTS = 36
export const ACCOUNT_MAX_SESSIONS = 5
export const ACCOUNT_SYNC_BODY_LIMIT = 256 * 1024

export const UsernameSchema = z.string()
  .transform((value) => value.normalize('NFKC'))
  .pipe(z.string()
    .trim()
    .min(3, '用户名至少需要 3 个字符')
    .max(24, '用户名最多 24 个字符')
    .regex(/^[\p{Script=Han}A-Za-z0-9_]+$/u, '用户名只能包含中文、英文字母、数字和下划线'))

export const PasswordSchema = z.string()
  .min(8, '密码至少需要 8 个字符')
  .max(128, '密码最多 128 个字符')
  .refine((value) => new TextEncoder().encode(value).byteLength <= 512, '密码内容过长')

export const QqSchema = z.union([
  z.literal(''),
  z.string().regex(/^[1-9][0-9]{4,11}$/u, 'QQ 号应为 5 至 12 位数字'),
]).optional()

const ReasoningEffortSchema = z.union([
  z.enum(['disabled', 'auto', 'high', 'max']),
  z.enum(['level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6']),
]).transform((value) => {
  if (value === 'disabled' || value === 'auto' || value === 'high' || value === 'max') return value
  if (value === 'level-1' || value === 'level-2') return 'auto' as const
  if (value === 'level-6') return 'max' as const
  return 'high' as const
})

const CloudThemeSchema = z.enum([
  'reading',
  'night',
  'white',
  'minimal-white',
  'minimal-black',
  'reading-yellow',
  'dark-cosmos',
  'light-aurora',
  'cyber-neon',
  'colorful',
  'rainbow-reading',
]).transform((value): ThemeType => normalizeTheme(value))

const NarrativeWordCountTargetSchema = z.custom<NarrativeWordCountTarget>(
  isNarrativeWordCountTarget,
  '叙事目标字数必须使用当前固定档位',
)

export const CloudSettingsSchema = z.object({
  provider: z.string().min(1).max(64),
  customUrl: z.string().max(2048),
  customModel: z.string().max(200),
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  reasoningEffort: ReasoningEffortSchema,
  talentThinkingIntensity: ReasoningEffortSchema,
  aiTalentGeneration: z.boolean(),
  preGenerateRounds: z.union([z.literal(0), z.literal(1)]).default(1),
  // Kept as an optional migration field for older cloud snapshots; new clients never write a seed.
  storySeed: z.string().max(128).optional(),
  narrativeStyle: z.enum(['default', 'epic', 'realistic', 'poetic']),
  narrativeStyleText: z.string().default(''),
  narrativeStyleVersion: z.number().int().nonnegative().default(0),
  narrativeAddressing: z.enum(['first-person', 'second-person', 'character-name']).default('second-person'),
  wordCountTarget: NarrativeWordCountTargetSchema,
  streamingMode: z.enum(['off', 'stream']),
  comfortableParagraphs: z.boolean(),
  reduceMotion: z.boolean(),
  theme: CloudThemeSchema,
}).strict()

const CharacterAttributesSchema = z.object({
  physique: z.number().int(),
  mind: z.number().int(),
  talentAptitude: z.number().int(),
  charisma: z.number().int(),
}).strict()

export const CloudCharacterDraftSchema = z.object({
  schemaVersion: z.literal(1),
  name: z.string(),
  gender: z.string(),
  race: z.string(),
  background: z.string(),
  attributes: CharacterAttributesSchema,
  manualLifespan: z.string().regex(/^\d*$/u, '寿命必须是数字'),
  manualStartingAge: z.string().regex(/^\d*$/u, '起始年龄必须是数字'),
  customGenders: z.array(z.string().min(1)),
  customRaces: z.array(z.string().min(1)),
  backgroundPresets: z.record(z.string().min(1), z.string()),
}).strict()

export const DEFAULT_CLOUD_CHARACTER_DRAFT = Object.freeze({
  schemaVersion: 1 as const,
  name: '',
  gender: 'male',
  race: 'human',
  background: '',
  attributes: Object.freeze({
    physique: 0,
    mind: 0,
    talentAptitude: 0,
    charisma: 0,
  }),
  manualLifespan: '',
  manualStartingAge: '',
  customGenders: Object.freeze([] as string[]),
  customRaces: Object.freeze([] as string[]),
  backgroundPresets: Object.freeze({} as Record<string, string>),
})

export const ReincarnationTalentSchema = z.object({
  id: z.string().min(1).max(128),
  lineageId: z.string().min(1).max(200),
  version: z.number().int().min(1),
  name: z.string().min(1).max(100),
  description: z.string().min(1),
  category: z.enum(['battle', 'exploration', 'social', 'production']),
  rarity: z.enum(['common', 'fine', 'rare', 'epic', 'legendary', 'mythic']),
  effect: z.string().min(1),
  attrBonus: z.object({
    physique: z.number().finite().optional(),
    mind: z.number().finite().optional(),
    talentAptitude: z.number().finite().optional(),
    charisma: z.number().finite().optional(),
    luck: z.number().finite().optional(),
  }).strict(),
  strengthenLevel: z.number().int().min(0),
  acquiredAt: z.number().int().nonnegative(),
  source: z.object({
    worldName: z.string().min(1).max(200),
    characterName: z.string().min(1).max(100),
    finalAge: z.number().finite().nonnegative().optional(),
    runId: z.string().min(1).max(200).optional(),
  }).strict(),
}).strict().superRefine((talent, ctx) => {
  if (talent.rarity !== 'mythic' && talent.strengthenLevel !== 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['strengthenLevel'],
      message: '非神话轮回天赋的强化等级必须为 0',
    })
  }
})

export const GameRecordDimensionSchema = z.object({
  id: z.string().min(1).max(100).optional(),
  label: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
  weight: z.number().int().min(1).max(100).optional(),
  value: z.number().finite(),
  comment: z.string().max(500).optional(),
  evidenceIds: z.array(z.string().min(1).max(200)).optional(),
}).strict()

export const GameRecordAchievementSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.literal('choice'),
  title: z.string().min(1),
  detail: z.string().min(1),
  timeLabel: z.string().min(1),
}).strict()

const LegacyGameRecordScoringProfileSchema = z.object({
  profileVersion: z.literal(1),
  worldId: z.string().min(1).max(200),
  dimensions: z.array(z.object({
    id: z.string().min(1).max(100),
    label: z.string().min(1).max(50),
    description: z.string().min(1).max(500),
    weight: z.number().int().min(1).max(100),
    evidenceKinds: z.array(z.enum([
      'attributes',
      'journey',
      'choices',
      'achievements',
      'completion',
    ])).min(1),
    curveId: z.enum(['growth', 'agency', 'journey', 'impact']),
  }).strict()).min(3).max(6),
}).strict()

export const GameRecordEndingReviewSchema = z.object({
  perspective: z.enum(['micro', 'macro']),
  review: z.string().trim().min(1),
  verse: z.string().trim().min(1).optional(),
  evidenceIds: z.array(z.string().min(1).max(200)),
  source: z.enum(['ai', 'local']),
}).strict()

/** 逐轮状态迁移审计快照；用于服务端复算，不包含正文或 Prompt。 */
export const GameRecordTransitionAuditSchema = z.object({
  schemaVersion: z.literal(1),
  round: z.number().int().positive(),
  narrativeId: z.string().min(1).max(200),
  validatedWritePath: z.boolean(),
  interceptorPassed: z.boolean(),
  intentValidationPassed: z.boolean(),
  historicalCommitPassed: z.boolean(),
  structuredDataPresent: z.boolean(),
  structuredDataAccepted: z.boolean(),
  requestedChangeCount: z.number().int().nonnegative(),
  committedChangeCount: z.number().int().nonnegative(),
  rejectedChangeCount: z.number().int().nonnegative(),
  trusted: z.boolean(),
  validationClean: z.boolean(),
  reasons: z.array(z.string()),
}).strict()

/** 结算时固化的完整评分输入；服务端不信任客户端汇总分数。 */
export const GameRecordScoringAuditSchema = z.object({
  schemaVersion: z.literal(1),
  lifeRunId: z.string().min(1).max(200),
  committedRounds: z.number().int().nonnegative(),
  narrativeIds: z.array(z.string().min(1).max(200)),
  resolvedChoiceCount: z.number().int().nonnegative(),
  achievementIds: z.array(z.string().min(1).max(200)),
  completed: z.boolean(),
  terminalCommitted: z.boolean(),
  stateTransitionsTrusted: z.boolean(),
  hasValidationFailure: z.boolean(),
  transitionAudits: z.array(GameRecordTransitionAuditSchema),
}).strict()

const LegacyGameRecordScoringSchema = z.object({
  version: z.literal(1),
  profile: LegacyGameRecordScoringProfileSchema,
  rawScore: z.number().finite().min(0).max(100),
  validCompletedLife: z.boolean(),
  evidence: z.object({
    attributes: z.number().int().min(0).max(100),
    journey: z.number().int().min(0).max(100),
    choices: z.number().int().min(0).max(100),
    achievements: z.number().int().min(0).max(100),
    completion: z.number().int().min(0).max(100),
  }).strict(),
  integrity: z.object({
    passed: z.boolean(),
    perfectGatePassed: z.boolean(),
    checks: z.record(z.string(), z.boolean()),
    reasons: z.array(z.string()),
  }).strict(),
  audit: GameRecordScoringAuditSchema.optional(),
}).strict()

const GameRecordAIScoringDimensionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(50),
  description: z.string().trim().min(1).max(500),
  value: z.number().int().min(0).max(100),
  comment: z.string().trim().min(1).max(500),
  evidenceIds: z.array(z.string().trim().min(1).max(200)).min(1),
}).strict()

export const GameRecordAIScoringSchema = z.object({
  version: z.literal(2),
  source: z.literal('ai'),
  score: z.number().int().min(0).max(100),
  dimensions: z.array(GameRecordAIScoringDimensionSchema).length(5),
  evidenceIds: z.array(z.string().trim().min(1).max(200)).min(1),
  integrity: z.object({
    passed: z.boolean(),
    checks: z.record(z.string(), z.boolean()),
    reasons: z.array(z.string()),
  }).strict(),
  audit: GameRecordScoringAuditSchema,
}).strict()

export const GameRecordScoringSchema = z.union([
  LegacyGameRecordScoringSchema,
  GameRecordAIScoringSchema,
])

export const CloudGameRecordSchema = z.object({
  recordId: z.string().min(1).max(200),
  completedAt: z.number().int().nonnegative(),
  characterName: z.string().min(1).max(100),
  worldName: z.string().min(1).max(200),
  finalAge: z.number().finite().nonnegative(),
  rounds: z.number().int().nonnegative().max(1000000),
  died: z.boolean(),
  overallScore: z.number().finite(),
  attributes: z.object({
    physique: z.number().finite(),
    mind: z.number().finite(),
    talentAptitude: z.number().finite(),
    charisma: z.number().finite(),
  }).strict().optional(),
  dimensions: z.array(GameRecordDimensionSchema).max(10),
  destinyNames: z.array(z.string().min(1).max(100)).max(10),
  reincarnationName: z.string().min(1).max(100).optional(),
  achievements: z.array(GameRecordAchievementSchema).optional(),
  scoring: GameRecordScoringSchema.optional(),
  endingReview: GameRecordEndingReviewSchema.optional(),
  gameVersion: z.string().min(1).max(32),
}).strict()

export const CloudDataInputSchema = z.object({
  settings: CloudSettingsSchema,
  saveApiKey: z.boolean(),
  apiKey: z.string().max(512).nullable(),
  characterDraft: CloudCharacterDraftSchema,
  reincarnationTalents: z.array(ReincarnationTalentSchema).max(REINCARNATION_LIBRARY_MAX_SLOTS),
  gameRecords: z.array(CloudGameRecordSchema).max(ACCOUNT_MAX_SLOTS),
}).strict()

export const CloudSyncRequestSchema = CloudDataInputSchema.extend({
  baseRevision: z.number().int().nonnegative(),
}).strict()

export const RegisterRequestSchema = z.object({
  username: UsernameSchema,
  qq: QqSchema,
  password: PasswordSchema,
  confirmPassword: PasswordSchema,
  initialData: CloudDataInputSchema,
}).strict().refine(
  (value) => value.password === value.confirmPassword,
  { message: '两次输入的密码不一致', path: ['confirmPassword'] },
)

export const LoginRequestSchema = z.object({
  username: UsernameSchema,
  password: PasswordSchema,
}).strict()

export const DeleteAccountRequestSchema = z.object({
  password: PasswordSchema,
}).strict()

export type CloudSettings = z.infer<typeof CloudSettingsSchema>
export type CloudCharacterDraft = z.infer<typeof CloudCharacterDraftSchema>
export type CloudReincarnationTalent = z.infer<typeof ReincarnationTalentSchema>
export type CloudGameRecord = z.infer<typeof CloudGameRecordSchema>
export type CloudSyncRequest = z.infer<typeof CloudSyncRequestSchema>
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>
export type LoginRequest = z.infer<typeof LoginRequestSchema>

export interface CloudAccountSnapshot {
  revision: number
  settings: CloudSettings
  saveApiKey: boolean
  apiKey: string | null
  characterDraft: CloudCharacterDraft
  reincarnationTalents: CloudReincarnationTalent[]
  gameRecords: CloudGameRecord[]
}

export interface AccountProfile {
  username: string
  qq: string | null
  linkedQq: string | null
  pointsBalance: number
  createdAt: number
  lastActiveAt: number
}

export interface AccountSessionPayload {
  authenticated: true
  account: AccountProfile
  snapshot: CloudAccountSnapshot
}

export interface GuestSessionPayload {
  authenticated: false
}
