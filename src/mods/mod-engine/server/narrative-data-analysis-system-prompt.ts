/**
 * @module narrative-data-analysis-system-prompt.ts
 * @description 非基础属性系统数据分析的服务端固定 Prompt 资产
 * @mod mod-engine
 */

import { MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS } from '../helpers/mvp-runtime-policy'
import { getNarrativeAISubsystemContracts } from '../helpers/subsystem-field-registry'

const TARGET_RULES: Readonly<Record<string, string>> = {
  lifespan: '使用输入中的当前人物稳定实体 ID',
  health: '调整生命状态或新增伤病时使用人物稳定实体 ID；解决伤病时使用输入状态中的伤病 ID',
  morality: 'player:current',
  'growth-system': '学习技能或获得能力时使用人物稳定实体 ID；练习技能或调整能力时使用输入状态中的技能或能力 ID',
  reputation: '使用被评价人物的稳定实体 ID；当前玩家使用输入中的角色实体 ID',
  'npc-system': '使用输入状态中已有的稳定 NPC 实体 ID；创建身份时可提交本轮新建稳定 NPC 实体 ID 和显示名',
  'relationship-system': '建立关系时使用起点实体 ID；调整、解除或变更作用域时使用输入状态中的关系 ID',
}

const DATA_ANALYSIS_SUBSYSTEM_IDS = [...MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS]
  .filter((id) => id !== 'character-base')

export function buildNarrativeDataAnalysisSystemContractLines(): string[] {
  return getNarrativeAISubsystemContracts(DATA_ANALYSIS_SUBSYSTEM_IDS).map((contract) => {
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
  '你是人生模拟器的系统数据分析器。只根据输入中非基础属性系统的完整状态、回合上下文和最近故事，提出故事已经成立的系统源变化；不续写故事。',
  '不得分析或输出基础属性，不得输出摘要、事件、伏笔、原创内容、语义信号、命运意图判定或待触发候选。',
  '每条系统操作只含系统、目标对象、目标上下文、操作、说明、变更、依据事件七个字段。没有变化的系统省略整段，不输出空系统片段、零变化或全量当前状态。只有通用关系系统的解除操作使用空变更对象。',
  '只可使用输入中实际出现的可写系统、稳定目标和当前上下文。依据事件只能使用回合上下文提供的 ID；没有时使用空数组。',
  '输出只能是一个合法 JSON 对象，根对象只含“系统操作”数组；无变化时输出空数组。禁止代码块、标签、标题、解释和结束标记。',
  ...buildNarrativeDataAnalysisSystemContractLines(),
  '中性格式示例；空数组只展示无变化时的合法结构，实际内容必须由本轮事实决定：',
  buildNarrativeDataAnalysisStandardExample(),
].join('\n')
