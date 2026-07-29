/** 主叙事正文允许的固定字数目标。 */
export const NARRATIVE_WORD_COUNT_TARGETS = [
  50,
  100,
  150,
  200,
  250,
  300,
  400,
  500,
  600,
  700,
  800,
  1000,
  1200,
  1500,
  1800,
  2000,
] as const

export type NarrativeWordCountTarget = (typeof NARRATIVE_WORD_COUNT_TARGETS)[number]

export const DEFAULT_WORD_COUNT_TARGET: NarrativeWordCountTarget = 200

const NARRATIVE_WORD_COUNT_TARGET_SET = new Set<number>(NARRATIVE_WORD_COUNT_TARGETS)

export function isNarrativeWordCountTarget(value: unknown): value is NarrativeWordCountTarget {
  return typeof value === 'number'
    && Number.isInteger(value)
    && NARRATIVE_WORD_COUNT_TARGET_SET.has(value)
}

/** 非当前契约值不进入运行态。 */
export function resolveNarrativeWordCountTarget(value: unknown): NarrativeWordCountTarget {
  return isNarrativeWordCountTarget(value) ? value : DEFAULT_WORD_COUNT_TARGET
}
