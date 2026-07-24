/**
 * Deterministic safety gate for sexual content involving a minor.
 *
 * A rejected choice or generated result is rejected as a whole. This module
 * never rewrites or truncates story-bearing content.
 */

export const MINOR_SEXUAL_CONTENT_REJECTION_MESSAGE =
  '当前角色未成年，不能提交或生成涉及性化内容的剧情。请改为安全、非性化的发展方向。'

const EXPLICIT_SEXUAL_CONTENT = [
  /(?:性行为|性交|性爱|做爱|发生性关系|性接触|性服务)/iu,
  /(?:性侵|强奸|猥亵|猱亵|诱奸|卖淫|嫖娼)/iu,
  /(?:口交|肛交|自慰|生殖器|私处|裸聊|裸照|色情)/iu,
  /(?:脱光(?:衣服|身上衣物)?|裸露(?:身体|私处))/iu,
] as const

const EXPLICIT_MINOR_REFERENCE = [
  /(?:未成年|幼童|儿童|小学生|初中生|幼儿园)/iu,
  /(?:^|[^0-9])(?:[0-9]|1[0-7])\s*岁(?:[^0-9]|$)/iu,
] as const

function normalizedText(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, '')
}

export function containsExplicitSexualContent(text: string): boolean {
  const source = normalizedText(text)
  return source.length > 0 && EXPLICIT_SEXUAL_CONTENT.some((pattern) => pattern.test(source))
}

export function containsExplicitMinorReference(text: string): boolean {
  const source = normalizedText(text)
  return source.length > 0 && EXPLICIT_MINOR_REFERENCE.some((pattern) => pattern.test(source))
}

export function isMinorAge(age: number): boolean {
  return Number.isFinite(age) && age >= 0 && age < 18
}

/** Blocks explicit sexual content when the protagonist or named subject is a minor. */
export function isDisallowedMinorSexualContent(text: string, protagonistAge: number): boolean {
  if (!containsExplicitSexualContent(text)) return false
  return isMinorAge(protagonistAge) || containsExplicitMinorReference(text)
}

export class NarrativeSafetyRejectedError extends Error {
  constructor() {
    super(MINOR_SEXUAL_CONTENT_REJECTION_MESSAGE)
    this.name = 'NarrativeSafetyRejectedError'
  }
}

export function assertNarrativeMinorSafety(text: string, protagonistAge: number): void {
  if (isDisallowedMinorSexualContent(text, protagonistAge)) {
    throw new NarrativeSafetyRejectedError()
  }
}

export function isNarrativeSafetyRejectedError(error: unknown): error is NarrativeSafetyRejectedError {
  return error instanceof NarrativeSafetyRejectedError
    || (error instanceof Error && error.name === 'NarrativeSafetyRejectedError')
}
