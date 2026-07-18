/**
 * @module life-stage-archetypes.ts
 * @description 叙事类型引导系统 —— 从废弃项目 life-sim-lifecycle.ts 移植
 * @mod mod-engine
 *
 * 核心设计：
 *   - 每个生命阶段有对应的允许叙事类型池（STAGE_ARCHETYPES），限制 AI 不越界
 *   - 权重随机选取叙事类型（generateArchetypeHint），避免千篇一律
 *   - 寿命提醒（buildLifespanReminder），告知 AI 角色的寿命阶段约束
 *   - 连续冲突保护：消费 PlotStructureSystem 的结构化冲突轮数，5 轮后强制回日常
 *
 * 调用链：
 *   orchestrator-system → buildLifeStageNarrativeHint + generateArchetypeHint + buildLifespanReminder
 *   → PromptContext → narrative-prompt.ts 模板
 */

import type { LifeStageId } from '@/mods/mod-character'

// ============================================================
// 叙事类型定义（8 种）
// ============================================================

/** 叙事类型 ID */
export type NarrativeArchetype = 'routine' | 'danger' | 'opportunity' | 'social' | 'punch_down' | 'exploration' | 'rumor' | 'mystery'

/** 叙事类型 → 中文提示标签 */
const ARC_LABELS: Record<NarrativeArchetype, string> = {
  routine:      '日常：描写一段平凡但有温度的生活片段（如修炼日常、社交互动、技艺精进）',
  danger:       '危机：遭遇有难度的威胁或意外冲突，需要智慧与策略应对。主角经过努力可以化解，也可以通过外交/计谋等方式规避，结局不一定失败',
  opportunity:  '机遇：发现宝藏/遗迹/传承/名师/特殊事件，但需要付出代价或冒险才能获得',
  social:       '社交：与周围人物的深度互动——结识新友、化解旧怨、势力博弈、人情冷暖',
  punch_down:   '碾压：遭遇远弱于主角的挑衅者/恶霸/不开眼的角色，主角可以选择展现实力震慑或低调处理',
  exploration:  '探索：发现未知区域/秘境/异空间/古人遗迹，扩展世界观，途中可能遇到低阶生物或环境挑战',
  rumor:        '传闻：听到关于远方战争/王朝更迭/秘境出世/妖兽作乱等背景信息，不直接涉及主角但暗示世界在运转',
  mystery:      '谜团：发现可疑线索/古老预言/身世之谜/种族传承——为后续剧情埋下伏笔，不要求立即解决',
}

// ============================================================
// 按生命阶段限制叙事类型（废弃项目 STAGE_ARCHETYPES）
// ============================================================

/**
 * 每个阶段允许的叙事类型列表。
 * infant 和 child 严格受限 → 禁止战斗/探险/权斗等成人内容。
 * elder 回归日常+社交，避免外放行为。
 */
export const STAGE_ARCHETYPES: Record<LifeStageId, NarrativeArchetype[]> = {
  infant:       ['routine'],                                          // 婴儿：仅日常，通过感官认知世界
  child:        ['routine', 'social'],                                // 儿童：日常 + 社交
  teenager:     ['routine', 'social', 'exploration', 'mystery'],      // 少年：+ 探索 + 谜团
  young_adult:  ['routine', 'danger', 'opportunity', 'social',        // 青年：全部 8 种
                 'punch_down', 'exploration', 'rumor', 'mystery'],
  adult:        ['routine', 'danger', 'opportunity', 'social',        // 成年：全部 8 种
                 'punch_down', 'exploration', 'rumor', 'mystery'],
  middle_age:   ['routine', 'social', 'exploration', 'mystery'],      // 中年：4 种
  elder:        ['routine', 'social'],                                // 老年：日常 + 社交
  deceased:     [],                                                    // 已故：无可选类型
}

// ============================================================
// 叙事类型权重随机选取（废弃项目 generateArchetypeHint）
// ============================================================

/** 冲突类叙事类型（需要连续轮次检测） */
const CONFLICT_ARCHETYPES: NarrativeArchetype[] = ['danger', 'punch_down']

/** 判断是否为冲突类型 */
function isConflictArchetype(a: NarrativeArchetype): boolean {
  return CONFLICT_ARCHETYPES.includes(a)
}

/**
 * 权重随机选取叙事类型 + 阶段限制过滤
 * 
 * @param lifeStage       - 当前生命阶段
 * @param difficulty      - 游戏难度（normal / hard / nightmare / hell），影响危机权重
 * @param consecutiveConflictRounds - 当前已连续冲突的轮数
 */
function selectArchetype(
  lifeStage: LifeStageId,
  difficulty: string = 'normal',
  consecutiveConflictRounds: number = 0,
): NarrativeArchetype | null {
  const allowed = STAGE_ARCHETYPES[lifeStage]
  if (!allowed || allowed.length === 0) return null

  // 难度 → 危机权重倍数
  const diffMult: Record<string, number> = { normal: 1, hard: 2.5, nightmare: 4, hell: 8 }
  const baseDangerChance = 3
  const dangerChance = Math.min(Math.round(baseDangerChance * (diffMult[difficulty] || 1)), 25)
  const routineChance = 53 - (dangerChance - 3)

  // 构建权重表（按废弃项目原权重值）
  const typeWeights: { type: NarrativeArchetype; weight: number }[] = [
    { type: 'danger',      weight: dangerChance },
    { type: 'opportunity', weight: 7 },
    { type: 'social',      weight: 15 },
    { type: 'exploration', weight: 6 },
    { type: 'rumor',       weight: 7 },
    { type: 'mystery',     weight: 7 },
    { type: 'punch_down',  weight: 3 },
    { type: 'routine',     weight: routineChance },
  ]

  // Fisher-Yates 打乱权重顺序，避免固定区间导致可预测性
  for (let i = typeWeights.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[typeWeights[i]!, typeWeights[j]!] = [typeWeights[j]!, typeWeights[i]!]
  }

  // 按打乱后的权重随机选取
  const rand = Math.random() * 100
  let cumulative = 0
  let archetype: NarrativeArchetype = 'routine'
  for (const w of typeWeights) {
    cumulative += w.weight
    if (rand < cumulative) {
      archetype = w.type
      break
    }
  }

  // 阶段限制检查：选中的类型不在允许列表中 → 随机换一个允许的
  if (!allowed.includes(archetype)) {
    archetype = allowed[Math.floor(Math.random() * allowed.length)]!
  }

  // 连续冲突保护：连续 5 轮战斗 → 强制切换回日常
  if (isConflictArchetype(archetype) && consecutiveConflictRounds >= 5) {
    archetype = 'routine'
  }

  return archetype
}

/**
 * 生成叙事类型引导提示文本 —— 注入到 Prompt 中引导 AI 选择叙事方向
 *
 * @param lifeStage         当前生命阶段
 * @param difficulty        游戏难度
 * @param consecutiveConflictRounds 连续冲突轮数
 * @returns Prompt 注入文本，无可用类型时返回空字符串
 */
export function generateArchetypeHint(
  lifeStage: LifeStageId,
  difficulty: string = 'normal',
  consecutiveConflictRounds: number = 0,
): string {
  const archetype = selectArchetype(lifeStage, difficulty, consecutiveConflictRounds)
  if (!archetype) return ''
  const label = ARC_LABELS[archetype]
  return ` 【叙事引导】本回合参考风格：${label}。`
}

// ============================================================
// 寿命提醒（废弃项目 buildLifespanReminder）
// ============================================================

/**
 * 寿命进度提醒 —— 告知 AI 角色当前的寿命阶段约束
 *
 * @param maxAge     最大寿命
 * @param currentAge 当前年龄
 * @returns Prompt 注入文本，无需提醒时返回空字符串
 */
export function buildLifespanReminder(maxAge: number, currentAge: number): string {
  const pct = maxAge > 0 ? currentAge / maxAge : 0

  // 寿命 ≥ 85%：暮年警告
  if (pct >= 0.85 && currentAge > 0) {
    return `【寿命警告】角色逼近寿命上限(${maxAge}岁)，当前${currentAge}岁，步入暮年后健康每况愈下。若健康值极低（重病/重伤缠身），叙事可自然走向生命终点——衰老本身不强制结局，但严重疾病足以致命。`
  }

  // 寿命 50%-85%：中年提醒
  if (pct >= 0.5 && currentAge > 0) {
    return `【寿命提醒】角色预期寿命${maxAge}岁，当前${currentAge}岁，距老年尚早。除非遭遇致命危机或健康值严重下降，不得以年迈为由结束生命。若染上重病/受到重伤，应描写疾病的持续影响与恶化过程。`
  }

  // 寿命 < 10% 且年龄 ≤ 3：婴儿保护
  if (pct < 0.1 && currentAge <= 3 && currentAge > 0) {
    return `【寿命提醒】角色预期寿命${maxAge}岁，当前${currentAge}岁，非常年轻，严禁以年龄为由触发结局。`
  }

  return ''
}
