/**
 * @module mythic-pattern-prompt
 * @description 完整人生结算后的神话词条生成 Prompt
 * @mod mod-character
 */

import { z } from 'zod'

import type { PromptTemplate } from '@/foundation'

const MYTHIC_PATTERN_SYSTEM_PROMPT = `你是人生神话词条的凝结器。根据一名角色完整人生的结构化摘要与关键记录，生成正好3个彼此不同的神话词条候选。

输出且只输出含正好3个对象的紧凑JSON顶层数组，不要对象包装，不要markdown。

每项字段：
- name：2-8字，像从完整人生凝结出的神话称号。
- concept：2-6字，概括唯一核心概念，如“承诺”“铭记”“善意”。
- effect：30-100汉字，描述下一段人生中持续生效的纯概念叙事规则。

硬性规则：
1. finalState、lifeDigests、lifeRecords 与 lifeSummary 共同构成人生事实；神话词条必须能从其中的选择、代价、关系、承诺或回响找到因果来源，不得凭空添加未发生的经历。
2. 词条跨世界可用，不绑定特定地名、科技、法术、种族或专有名词。
3. 只写非数值概念规则；不得出现属性加成、概率百分比、模拟系数、稀有度或极性。
4. 不得自动获胜、取消死亡或代价、覆盖玩家选择、无条件改写世界。规则必须保留不确定性、对抗空间或选择余地。
5. 三项应分别凝结人生中不同的核心主题，名称与 concept 均不得重复或只是同义改写。
6. 若用户消息含 existingMythicPatterns，候选名称不得与总库已有名称重复，核心概念也应优先避开已有概念。`

export const mythicPatternCandidateSchema = z.object({
  name: z.string().min(2).max(8),
  concept: z.string().min(2).max(6),
  effect: z.string().min(30).max(100),
}).strict()

export const mythicPatternOutputSchema = z.array(mythicPatternCandidateSchema).length(3)

type MythicPatternOutput = z.infer<typeof mythicPatternOutputSchema>

export const mythicPatternPrompt: PromptTemplate<MythicPatternOutput> = {
  name: 'mythic-pattern',
  version: '1.0.1',
  mod: 'mod-character',
  systemPrompt: MYTHIC_PATTERN_SYSTEM_PROMPT,
  userPromptTemplate: '',
  variables: [],
  outputFormat: 'json',
  outputSchema: mythicPatternOutputSchema,
}
