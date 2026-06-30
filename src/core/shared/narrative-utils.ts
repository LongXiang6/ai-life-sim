/**
 * 叙事相关跨 MOD 公共函数
 *
 * 使用场景：mod-engine、mod-settings 等需要处理 AI Prompt 和叙事数据的 MOD
 *
 * 规则：
 * - 所有函数必须是纯函数
 * - 被 2 个以上 MOD 调用的函数放这里
 * - **每个导出函数必须有详细中文注释（@param/@returns/@example）** — B-46 要求
 *
 * @mod core/shared
 */

/**
 * 叙事 Prompt 的常量 KEY 前缀
 * 
 * 确保各 MOD 注入的 Prompt 字段命名一致。
 * 用于构建结构化的 Prompt 上下文对象，避免各 MOD 用不同 key 名导致冲突。
 * 
 * 使用场景：orchestrator 拼装最终 Prompt 时用这些 key 索引各子系统注入的 Prompt 片段
 *
 * @example
 * ```ts
 * const promptContext = {
 *   [NARRATIVE_PROMPT_KEYS.WORLD_SETTING]: "这是一个修仙世界",
 *   [NARRATIVE_PROMPT_KEYS.CHARACTER_STATE]: "角色：张三，25岁，剑修",
 * }
 * ```
 */
export const NARRATIVE_PROMPT_KEYS = {
  WORLD_SETTING: 'world_setting',           // 世界观设定
  CHARACTER_STATE: 'character_state',       // 角色当前状态
  SYSTEM_CONTEXT: 'system_context',         // 系统层面上下文
  RECENT_EVENTS: 'recent_events',           // 近期事件链
  LONG_TERM_MEMORY: 'long_term_memory',     // 长期记忆/关键事件
  NARRATIVE_DIRECTION: 'narrative_direction', // 叙事方向/玩家选择
  SAFETY_GUIDE: 'safety_guide',             // 安全约束/禁止内容
  TIMELINE_CONTEXT: 'timeline_context',     // 时间线/历史事件
} as const

/** 叙事 Prompt Key 类型 */
export type NarrativePromptKey =
  (typeof NARRATIVE_PROMPT_KEYS)[keyof typeof NARRATIVE_PROMPT_KEYS]

/**
 * 标签匹配度评分
 * 
 * 判断某个标签组合与目标标签的匹配程度。
 * 匹配度 = 命中目标标签数 / 目标标签总数，范围 0-1。
 * 
 * 用于：世界观标签匹配、事件池筛选、角色背景与世界观兼容性判断等场景。
 * 
 * @param tags       - 待评估的标签数组
 * @param targetTags - 目标标签数组
 * @returns 匹配度分数，0-1。目标标签为空时返回 1（完全匹配）
 *
 * @example
 * ```ts
 * calcTagMatchScore(['修仙','古代'], ['修仙','古代','灵气'])  // 0.67
 * calcTagMatchScore(['科幻'], ['修仙'])                        // 0
 * calcTagMatchScore([], [])                                    // 1
 * ```
 */
export function calcTagMatchScore(
  tags: string[],
  targetTags: string[],
): number {
  if (targetTags.length === 0) return 1
  const matched = targetTags.filter((t) => tags.includes(t)).length
  return matched / targetTags.length
}
