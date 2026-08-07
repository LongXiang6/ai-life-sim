/**
 * Purpose: Compile the protected fixed Prompt for non-basic narrative data analysis.
 * Owner: mod-engine
 * Responsibility: Describe allowed system operations without applying simulation changes.
 *
 * @module narrative-data-analysis-system-prompt.ts
 * @description 非基础属性系统数据分析的服务端固定 Prompt 资产
 * @mod mod-engine
 */

import { MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS } from '../helpers/mvp-runtime-policy'
import { getNarrativeAISubsystemContracts } from '../helpers/subsystem-field-registry'

const TARGET_RULES: Readonly<Record<string, string>> = {
  'character-base': '使用输入中的当前人物稳定实体 ID',
  'growth-system': '学习技能或获得能力时使用人物稳定实体 ID；练习技能或调整能力时使用输入状态中的技能或能力 ID',
}

const DATA_ANALYSIS_SUBSYSTEM_IDS = [...MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS]
const DATA_ANALYSIS_OPERATIONS = { 'character-base': ['update-status'] } as const

export function buildNarrativeDataAnalysisSystemContractLines(): string[] {
  return getNarrativeAISubsystemContracts(DATA_ANALYSIS_SUBSYSTEM_IDS, DATA_ANALYSIS_OPERATIONS).map((contract) => {
    const operations = Object.fromEntries(
      Object.entries(contract.operations).map(([internalOperation, aiOperation]) => [
        aiOperation,
        contract.operationFields[internalOperation] ?? Object.keys(contract.fields),
      ]),
    )
    const fields = Object.fromEntries(
      Object.values(contract.fields).map((field) => [field.aiName, field.description]),
    )
    return `⟦可写系统:${contract.aiName}⟧${JSON.stringify({
      系统: contract.aiName,
      目标对象: TARGET_RULES[contract.internalId],
      操作与变更字段: operations,
      字段规则: fields,
    })}`
  })
}

export function buildNarrativeDataAnalysisStandardExample(): string {
  return JSON.stringify({ 系统操作: [] })
}

export const COMPILED_NARRATIVE_DATA_ANALYSIS_SYSTEM_PROMPT = [
  '你是人生模拟器的角色状态与成长数据分析器。只根据输入中的完整状态、回合上下文和最近故事，提出故事已经成立的系统源变化；不续写故事。',
  '角色状态只允许更新健康、气运、道德和故事已明确确认的死亡；不得调整体魄、心智、悟性或魅力基础值。不得输出摘要、事件、伏笔、原创内容、语义信号或待触发候选。',
  '每条系统操作只含系统、目标对象、目标上下文、操作、说明、变更、依据事件七个字段。没有变化的系统省略整段，不输出空系统片段、零变化或全量当前状态。只有通用关系系统的解除操作使用空变更对象。',
  '只可使用输入中实际出现的可写系统、稳定目标和当前上下文。依据事件只能使用回合上下文提供的 ID；没有时使用空数组。',
  '输出只能是一个合法 JSON 对象，根对象只含“系统操作”数组；无变化时输出空数组。禁止代码块、标签、标题、解释和结束标记。',
  ...buildNarrativeDataAnalysisSystemContractLines(),
  '中性格式示例；空数组只展示无变化时的合法结构，实际内容必须由本轮事实决定：',
  buildNarrativeDataAnalysisStandardExample(),
].join('\n')
