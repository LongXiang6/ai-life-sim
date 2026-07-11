/**
 * @module narrative-branch-policy.ts
 * @description 叙事分支资格纯函数 —— 主推进与预生成共用同一结构化门禁
 * @mod mod-engine
 */

export interface NarrativeBranchCandidate {
  branch?: unknown
  importance?: unknown
  branchOptions?: unknown
}

export function normalizeNarrativeBranchOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((option) => option.trim())
    .slice(0, 4)
}

/** 普通分支只有达到 HIGH 且提供至少两个有效选项时才进入交互链路。 */
export function isEligibleNarrativeBranch(candidate: NarrativeBranchCandidate): boolean {
  return candidate.branch === true
    && candidate.importance === 'HIGH'
    && normalizeNarrativeBranchOptions(candidate.branchOptions).length >= 2
}
