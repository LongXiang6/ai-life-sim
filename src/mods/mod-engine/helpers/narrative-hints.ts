/**
 * @module narrative-hints.ts
 * @description 叙事动态提示词生成器 —— 移植自废弃项目 life-sim-narrative.ts + life-sim-lifecycle.ts
 * @mod mod-engine
 *
 * 废弃项目源文件：
 *   - D:\AI\废弃项目\src\lib\prompts\narrative\life-sim-narrative.ts（hint 生成逻辑）
 *   - D:\AI\废弃项目\src\lib\prompts\narrative\life-sim-lifecycle.ts（actionScale / lifespan）
 *
 * 职责：根据当前回合状态生成 mandatory（必遵）与 optional（参考）两类 hint，
 * 由 orchestrator 注入 PromptContext.userInstruction → AI user prompt 的 instruction 字段。
 */

import type { LifeStageId } from '@/mods/mod-character'
import type { TimeStep } from '@/foundation'

// ═══════════════════ 类型定义 ═══════════════════

export interface NarrativeHintInput {
  currentAge: number
  maxAge: number
  startingAge: number
  round: number
  recentEvents: Array<{ narrative?: string; age: number }>
  lastPlayerChoice?: string
  forceBranch: boolean
  branchJustResolved: boolean
  consecutiveSameGoalRounds: number
  /** 当前时间步进（替代旧 timeSkipYears，支持多粒度文本生成） */
  timeStep: TimeStep
  narrativeStyle?: string
  lifeStage: LifeStageId
}

export interface NarrativeHints {
  mandatory: string[]
  optional: string[]
}

// ═══════════════════ 信息优先级常量（注入 worldview rules 或首轮 instruction） ═══════════════════

/**
 * 废弃项目 immutableContext 中的优先级层级，移植为常量。
 * 注入方式：首轮通过 worldRules 或 instruction 注入，后续轮次可选不重复。
 */
export const INFORMATION_PRIORITY_RULE = [
  '【信息优先级】冲突时按此裁决：',
  '1[最高] 世界观逻辑（世界设定 + 世界标签 + 世界法则）= 剧情合理性（因果链、事件连锁反应、人设一致性）',
  '2 基础属性（体魄/心智/悟性/魅力/出身/气运/善恶/健康）',
  '3 生命状态（年龄 + 健康值 + 寿命上限）',
  '4 角色身份/背景',
  '5[最低] 隐藏命格',
  '世界观与剧情合理性同优先级——冲突时优先保证故事张力，但不得违背世界设定的核心规则。',
].join(' > ')

// ═══════════════════ 行动规模分类 ═══════════════════

const SMALL_ACTION_KEYWORDS = [
  '跟踪', '调查', '打探', '传话', '采购', '拜访', '探访', '查看', '巡视',
  '小战斗', '伏击', '偷袭', '抓捕', '审问', '搜捕', '追击', '突袭',
  '约见', '会谈', '送礼', '交易', '购买', '出售', '雇佣', '招募少量',
  '送信', '通知', '邀请', '赴宴', '参加',
  '收拾', '清理', '解决', '处理', '除掉', '根除', '肃清',
]

const LARGE_ACTION_KEYWORDS = [
  '征服', '称霸', '统一', '建立王朝', '改朝换代', '推翻',
  '修仙大成', '飞升', '成神', '证道', '开宗立派',
  '统一天下', '建立帝国', '开创盛世',
  '探索秘境', '破解上古之谜', '寻找传说',
]

const MULTI_STEP_KEYWORDS = [
  '然后', '之后', '接着', '再', '最后', '并', '以及',
  '先', '第一步', '第二步', '最后一步',
]

/** 根据玩家指令关键词分类行动规模（移植自 life-sim-lifecycle.ts） */
export function classifyActionScale(playerChoice: string): 'small' | 'medium' | 'large' {
  if (!playerChoice) return 'medium'

  const isLarge = LARGE_ACTION_KEYWORDS.some(kw => playerChoice.includes(kw))
  if (isLarge) return 'large'

  const isMulti = MULTI_STEP_KEYWORDS.filter(kw => playerChoice.includes(kw)).length
  const verbCount = (playerChoice.match(/[去到闯奔赴访见求拜请]/g) || []).length
  if (isMulti >= 2 || verbCount >= 4 || playerChoice.length > 80) return 'medium'

  const smallMatch = SMALL_ACTION_KEYWORDS.some(kw => playerChoice.includes(kw))
  if (smallMatch) return 'small'

  return 'medium'
}

// ═══════════════════ 7 个 hint 子函数 ═══════════════════

// --- 1. 强制分叉 ---
function hintForceBranch(input: NarrativeHintInput): string[] {
  const hints: string[] = []
  if (input.forceBranch) hints.push('必须生成分叉点(branch=true)')
  if (input.currentAge === 3 && input.startingAge === 0) {
    hints.push('必须触发分叉点')
  }
  if (input.round > 0 && input.round % 15 === 0 && !input.branchJustResolved) {
    hints.push(
      `已推进${input.round}轮，建议生成一个重要的命运分叉点(branch=true)——提供2-4个各有特色的选项，每个选项指向大相径庭的人生方向`,
    )
  }
  return hints
}

// --- 2. 结婚年龄提示 ---
function hintMarriageAge(input: NarrativeHintInput): string[] {
  const hints: string[] = []
  if (
    input.maxAge < 150 &&
    input.currentAge >= 22 &&
    input.currentAge <= 28 &&
    input.startingAge >= 18
  ) {
    const recentNarratives = input.recentEvents
      .slice(-3)
      .map(e => e.narrative || '')
      .join(' ')
    const marriageKeywords = /结婚|成婚|娶了|嫁给|迎娶|嫁给了|结为夫妻|成亲/g
    if (!marriageKeywords.test(recentNarratives)) {
      hints.push(
        '人生步入谈婚论嫁的年龄，可考虑涉及婚姻/婚恋话题。若角色处境自然导向即可，不必强制分叉',
      )
    }
  }
  return hints
}

// --- 3. 奇遇/秘境频率控制 ---
function hintAdventureFrequency(input: NarrativeHintInput): string[] {
  const hints: string[] = []
  if (input.recentEvents.length >= 2) {
    const recentNarratives = input.recentEvents
      .slice(-6)
      .map(e => e.narrative || '')
    const sideQuestPatterns =
      /秘境|遗迹|密藏|远古|上古|传承|奇遇|山洞|地宫|宝藏|遗物|石室/g
    const sideQuestCount = recentNarratives.filter(n =>
      sideQuestPatterns.test(n),
    ).length
    if (sideQuestCount >= 3) {
      hints.push(
        `最近已有${sideQuestCount}次秘境/遗迹/奇遇类事件，建议本轮转向社会活动/人际互动/日常成长等其他方向`,
      )
    }
  }
  return hints
}

// --- 4. 疾病/重伤延续 ---
function hintDiseaseContinuity(input: NarrativeHintInput): string[] {
  const hints: string[] = []
  const lastEvent = input.recentEvents.length > 0
    ? input.recentEvents[input.recentEvents.length - 1]
    : null
  if (lastEvent) {
    const lastNarrative = lastEvent.narrative || ''
    const hasDisease =
      /重病|重伤|生病|病倒|病危|病重|染病|中毒|绝症|伤势加重|病情恶化|病入膏肓|命悬一线|奄奄一息|卧病|卧床/.test(
        lastNarrative,
      )
    if (hasDisease) {
      hints.push(
        '上轮角色患重病/受重伤，本轮应自然延续病情发展（恶化、并发症或恢复过程），不视为重复事件',
      )
    }
  }
  return hints
}

// --- 5. 分支解决 + 行动规模 ---
function hintBranchResolved(input: NarrativeHintInput): string[] {
  const hints: string[] = []
  if (input.branchJustResolved) {
    hints.push(
      '上轮玩家做出重要选择。叙事不应违背该方向。但成功与否由角色实力/环境/运气决定——允许失败/意外转折/付出代价',
    )
  }
  if (input.lastPlayerChoice) {
    const scale = classifyActionScale(input.lastPlayerChoice)
    const choiceLabel =
      input.currentAge < 6
        ? `家庭层面选择"${input.lastPlayerChoice}"`
        : `玩家选择了"${input.lastPlayerChoice}"`
    if (input.branchJustResolved) {
      if (scale === 'small') {
        hints.push(
          `${choiceLabel}（小规模行动）——本轮聚焦这次行动最关键的一幕，写清行动、阻力与结果，一轮完成`,
        )
      } else if (scale === 'large') {
        hints.push(
          `${choiceLabel}（宏大目标）——本轮适合呈现一个代表性阻力、准备行动或阶段性结果，可花费数年至数十年逐步实现`,
        )
      } else {
        hints.push(
          `${choiceLabel}（中型目标）——可先判断目标在当前世界中的关键阻力，再写本轮最具体的一次推进；可花费数轮完成，每轮尽量有实质后果`,
        )
      }
    } else if (!input.branchJustResolved) {
      const progressLabel =
        input.currentAge < 6
          ? `家庭持续推进：${input.lastPlayerChoice}`
          : `持续推进：${input.lastPlayerChoice}`
      hints.push(
        `${progressLabel}。进展不必一帆风顺，可描写遇到的具体问题/意外收获/人际关系变化`,
      )
    }
  }
  return hints
}

// --- 6. 场景跳跃（根据 timeStep.unit 生成粒度匹配的跳转提示） ---
function hintSceneJump(input: NarrativeHintInput): string[] {
  const hints: string[] = []
  const prevEvent = input.recentEvents[input.recentEvents.length - 1]
  if (
    prevEvent?.age !== undefined &&
    input.currentAge > prevEvent.age
  ) {
    hints.push(
      `距上次事件已过${input.currentAge - prevEvent.age}年，优先体现新阶段的社会压力或关系变化，再选择一个新的剧情节点，避免延续上次事件的同一场景`,
    )
  }

  const { unit, value } = input.timeStep
  const amount = value || 1 // 防御 value=0 的异常情况（旧版 timeSkipYears > 0 等价守卫）

  // 根据时间粒度生成不同的跳转提示，防止 AI 输出与粒度不匹配的内容
  switch (unit) {
    case 'day':
      hints.push(
        `推进${amount}天。近景/现场视角：写当天的一次具体行动、对话或突发状况，强调即时反馈；收尾优先给出直接结果或新的小问题`,
      )
      break
    case 'month':
      hints.push(
        `推进${amount}个月。中近景视角：先点出本月压力、机会或关系变化，再落到一件代表性小事件；这件事尽量包含角色行动、具体阻力、可见后果或新线索，少写月度清单和纯心理余味`,
      )
      break
    case 'season':
      hints.push(
        `推进${amount}个季度。中景视角：体现这一季${amount > 1 ? '内' : ''}的环境、制度或人际变化，再写一个改变关系、目标或处境的关键节点；结尾优先落到阶段性后果`,
      )
      break
    case 'year':
    default:
      hints.push(
        `时间跳过${amount}年。远景选材 + 近景落点：先判断世界大势和人生阶段的主要压力，再落到一到两个代表性场景，尽量让场景承担行动、阻力与后果，少写年度报告或多年流水账`,
      )
      break
  }

  return hints
}

// --- 7. 寿命提醒 ---
function hintLifespanReminder(input: NarrativeHintInput): string[] {
  const hints: string[] = []
  const maxAge = input.maxAge
  const currentAge = input.currentAge
  if (maxAge <= 0) return hints
  const pct = currentAge / maxAge

  if (pct >= 0.85) {
    hints.push(
      `【寿命警告】角色逼近寿命上限(${maxAge}岁)，当前${currentAge}岁，步入暮年后健康每况愈下。若健康值极低（重病/重伤缠身），叙事可自然走向生命终点——衰老本身不强制结局，但严重疾病足以致命。`,
    )
  } else if (pct >= 0.5) {
    hints.push(
      `【寿命提醒】角色预期寿命${maxAge}岁，当前${currentAge}岁，距老年尚早。除非遭遇致命危机或健康值严重下降，不得以年迈为由结束生命。`,
    )
  } else if (pct < 0.1 && currentAge <= 3 && currentAge > 0) {
    hints.push(
      `【寿命提醒】角色预期寿命${maxAge}岁，当前${currentAge}岁，非常年轻，严禁以年龄为由触发结局。`,
    )
  }
  return hints
}

// ═══════════════════ 主入口 ═══════════════════

/** 构建本轮叙事动态 hints（mandatory + optional 两类） */
export function buildNarrativeHints(input: NarrativeHintInput): NarrativeHints {
  return {
    mandatory: [
      ...hintForceBranch(input),
      ...hintAdventureFrequency(input),
      ...hintDiseaseContinuity(input),
      ...hintLifespanReminder(input),
    ],
    optional: [
      ...hintMarriageAge(input),
      ...hintBranchResolved(input),
      ...hintSceneJump(input),
    ],
  }
}
