/**
 * Purpose: Define narrative difficulty labels, guidance, and relative event weights.
 * Owner: foundation:types
 * Responsibility: Shared difficulty contract only; simulation outcomes remain with mod-engine.
 */

export type DifficultyLevel = 'casual' | 'relaxed' | 'normal' | 'hard' | 'nightmare'

export const DIFFICULTY_ORDER: readonly DifficultyLevel[] = [
  'casual',
  'relaxed',
  'normal',
  'hard',
  'nightmare',
] as const

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  casual: '休闲',
  relaxed: '轻松',
  normal: '正常',
  hard: '困难',
  nightmare: '噩梦',
}

export const DIFFICULTY_DESCRIPTIONS: Record<DifficultyLevel, string> = {
  casual: '命运明显偏向主角，机缘、援手与逢凶化吉更常见',
  relaxed: '整体略有顺风，机会与援助较容易出现',
  normal: '中性基线，不保底、不针对，按世界因果自然发展',
  hard: '逆境更常出现并累积，风险与代价更难化解',
  nightmare: '长期高压与高危，完整人生以九死一生为评测目标',
}

/** 隐藏的叙事裁决倾向；不是角色属性、天赋、命运保证或玩家可见的数值。 */
export const DIFFICULTY_NARRATIVE_GUIDANCE: Record<DifficultyLevel, string> = {
  casual: '显著偏向主角的顺风人生：更常出现符合世界因果的机缘、贵人、预警、援助与逢凶化吉；危险仍可发生，玩家行动也不保证成功。',
  relaxed: '温和偏向主角的顺风人生：机会、援助与可行转机较正常更常见，失败与代价仍可能发生。',
  normal: '保持中性基线：不额外赐予主角光环，也不针对主角；完整允许平静、顺利、受挫、严重危险与致命事件，按世界规则、行动和因果裁决。',
  hard: '让逆境、损失、受阻和危险相对更容易进入并累积；求助与化解机会较少，风险可升级，但不得脱离因果任意惩罚。',
  nightmare: '营造长期高压且极危险的人生，逆境更容易连续或累积，帮助与脱险机会稀少，死亡风险显著升高；九死一生是完整人生评测目标，不是每轮死亡率，也不得随机强杀。',
}
