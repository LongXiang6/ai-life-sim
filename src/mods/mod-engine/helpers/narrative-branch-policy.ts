/**
 * @module narrative-branch-policy.ts
 * @description 叙事分支资格纯函数 —— 主推进与预生成共用同一结构化门禁
 * @mod mod-engine
 */

export interface NarrativeBranchCandidate {
  branch?: unknown
  importance?: unknown
  branchOptions?: unknown
  semanticSignals?: {
    irreversible?: unknown
    narrativeRegister?: unknown
  }
}

export function normalizeNarrativeBranchOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((option) => option.trim())
    .slice(0, 4)
}

/**
 * 命运分叉只接受经 META 自证的不可逆高影响选择。
 *
 * `branch=true` 与选项文本本身不构成业务事实；否则模型把一件日常小事
 * 包装为选项时，主链会错误地把它呈现成玩家的人生抉择。
 */
export function isEligibleNarrativeBranch(candidate: NarrativeBranchCandidate): boolean {
  return candidate.branch === true
    && candidate.importance === 'HIGH'
    && normalizeNarrativeBranchOptions(candidate.branchOptions).length >= 2
    && candidate.semanticSignals?.irreversible === true
    && (candidate.semanticSignals.narrativeRegister === 'fate'
      || candidate.semanticSignals.narrativeRegister === 'legacy')
}
