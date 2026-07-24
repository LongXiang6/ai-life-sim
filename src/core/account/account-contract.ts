import { z } from 'zod'

export const ACCOUNT_SESSION_COOKIE = 'ai_life_session'
export const ACCOUNT_RETENTION_DAYS = 30
export const ACCOUNT_MAX_SLOTS = 10
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

const ReasoningEffortSchema = z.enum([
  'disabled',
  'level-1',
  'level-2',
  'level-3',
  'level-4',
  'level-5',
  'level-6',
])

const CloudThemeSchema = z.enum([
  'minimal-white',
  'minimal-black',
  'reading-yellow',
  'dark-cosmos',
  'light-aurora',
  'cyber-neon',
]).transform(() => 'minimal-white' as const)

export const CloudSettingsSchema = z.object({
  provider: z.string().min(1).max(64),
  customUrl: z.string().max(2048),
  customModel: z.string().max(200),
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  maxTokens: z.number().int().min(256).max(200000),
  reasoningEffort: ReasoningEffortSchema,
  talentThinkingIntensity: ReasoningEffortSchema,
  aiTalentGeneration: z.boolean(),
  preGenerateRounds: z.number().int().min(0).max(3),
  storySeed: z.string().max(128),
  narrativeStyle: z.enum(['default', 'epic', 'realistic', 'poetic']),
  wordCountTarget: z.number().int().min(100).max(5000),
  streamingMode: z.enum(['off', 'stream']),
  comfortableParagraphs: z.boolean(),
  reduceMotion: z.boolean(),
  theme: CloudThemeSchema,
}).strict()

const CharacterAttributesSchema = z.object({
  physique: z.number().int().min(0).max(10),
  mind: z.number().int().min(0).max(10),
  talentAptitude: z.number().int().min(0).max(10),
  charisma: z.number().int().min(0).max(10),
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

export const CloudMythicTalentSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1),
  concept: z.string().min(1),
  effect: z.string().min(1),
  strengthTier: z.enum(['echo', 'deep', 'legacy', 'immortal']).optional(),
  sourceScore: z.number().int().min(0).max(100).optional(),
  acquiredAt: z.number().int().nonnegative(),
  source: z.object({
    worldName: z.string().min(1).max(200),
    characterName: z.string().min(1).max(100),
    finalAge: z.number().finite().nonnegative().optional(),
    runId: z.string().min(1).max(200).optional(),
  }).strict(),
}).strict()

const GameRecordDimensionSchema = z.object({
  label: z.string().min(1).max(50),
  value: z.number().finite(),
  comment: z.string().max(200).optional(),
}).strict()

export const CloudGameRecordSchema = z.object({
  recordId: z.string().min(1).max(200),
  completedAt: z.number().int().nonnegative(),
  characterName: z.string().min(1).max(100),
  worldName: z.string().min(1).max(200),
  finalAge: z.number().finite().nonnegative(),
  rounds: z.number().int().nonnegative().max(1000000),
  died: z.boolean(),
  moralityLabel: z.string().min(1).max(100),
  overallScore: z.number().finite(),
  dimensions: z.array(GameRecordDimensionSchema).max(10),
  destinyNames: z.array(z.string().min(1).max(100)).max(10),
  mythicName: z.string().min(1).max(100).optional(),
  achievements: z.array(z.object({
    id: z.string().min(1).max(200),
    kind: z.enum(['choice', 'breakthrough']),
    title: z.string().min(1),
    detail: z.string().min(1),
    timeLabel: z.string().min(1),
  }).strict()).optional(),
  gameVersion: z.string().min(1).max(32),
}).strict()

export const CloudDataInputSchema = z.object({
  settings: CloudSettingsSchema,
  saveApiKey: z.boolean(),
  apiKey: z.string().max(512).nullable(),
  characterDraft: CloudCharacterDraftSchema,
  mythicTalents: z.array(CloudMythicTalentSchema).max(ACCOUNT_MAX_SLOTS),
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
export type CloudMythicTalent = z.infer<typeof CloudMythicTalentSchema>
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
  mythicTalents: CloudMythicTalent[]
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
