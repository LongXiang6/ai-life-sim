import { BaseSubsystem } from '@/core'
import { multiplyDecimalInteger, type RoundContext, type SubSystemChanges, type SubSystemState } from '@/foundation'
import { getFormulaModifier } from '@/mods/mod-world'
import type { WorkPersistenceState, WorkState, Profession } from '../types'
import { PROFESSION_BASE_INCOME, PROFESSION_LABELS } from '../constants'
import { clone, requiredContextId, scaleForContext } from './economy-runtime'

export class WorkSystem extends BaseSubsystem {
  readonly id = 'work' as const
  readonly mod = 'mod-economy' as const
  readonly label = '职业工作' as const
  readonly description = '拥有职业、工作收入、满意度与晋升进度' as const
  private states: Record<string, WorkState> = {}
  private ensure(context: RoundContext): WorkState { return this.states[requiredContextId(context)] ??= { profession: 'farmer', professionLevel: 1, income: '5', satisfaction: 50, promotionProgress: 0, careerHistory: [] } }
  advance(context: RoundContext): void {
    const state = this.ensure(context)
    const scale = scaleForContext(context)
    const professionBasisPoints = Math.max(1, PROFESSION_BASE_INCOME[state.profession]) * 2_000
    const modifierBasisPoints = Math.max(0, Math.round(
      getFormulaModifier('incomeModifier', 1)
      * getFormulaModifier('industryProductivityModifier', 1)
      * 10_000,
    ))
    const annualIncome = multiplyDecimalInteger(
      scale.subsistenceIncomePerCapita,
      BigInt(professionBasisPoints) * BigInt(modifierBasisPoints) * BigInt(state.professionLevel + 4),
      BigInt(10_000) * BigInt(10_000) * BigInt(5),
    )
    state.income = multiplyDecimalInteger(
      annualIncome,
      BigInt(Math.max(0, context.daysPassed)),
      BigInt(365),
    )
    state.promotionProgress = Math.min(100, state.promotionProgress + Math.max(0, context.daysPassed / 365 * state.satisfaction / 20))
    if (state.promotionProgress >= 100 && state.professionLevel < 10) {
      state.professionLevel += 1
      state.promotionProgress = 0
    }
    state.satisfaction = Math.max(0, Math.min(100, state.satisfaction + context.daysPassed / 365 * (state.professionLevel >= 5 ? 0.2 : -0.05)))
  }
  collectState(context: RoundContext): SubSystemState { const state = this.ensure(context); return { id: this.id, summary: `【工作】${PROFESSION_LABELS[state.profession]} Lv.${state.professionLevel}；收入 ${state.income}`, data: structuredClone(state) } }
  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    const state = this.ensure(context)
    if (typeof changes.changes.profession === 'string' && changes.changes.profession in PROFESSION_LABELS) state.profession = changes.changes.profession as Profession
    if (typeof changes.changes.satisfaction === 'number') state.satisfaction = Math.max(0, Math.min(100, changes.changes.satisfaction))
  }
  capturePersistenceState(): WorkPersistenceState { return { schemaVersion: 1, contexts: clone(this.states) } }
  restorePersistenceState(snapshot: unknown): void { this.states = snapshot ? clone((snapshot as WorkPersistenceState).contexts ?? {}) : {} }
  capturePreviewState(): WorkPersistenceState { return this.capturePersistenceState() }
  restorePreviewState(snapshot: unknown): void { this.restorePersistenceState(snapshot) }
  reset(): void { this.states = {} }
}
export const workSystem = new WorkSystem()
