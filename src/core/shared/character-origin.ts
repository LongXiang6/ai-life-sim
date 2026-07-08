/**
 * @module character-origin.ts
 * @description 角色来源判定公共纯函数，供创建页与角色子系统共享
 * @mod core/shared
 */

/** 穿越者检测关键词（对齐废弃项目 TRANSMIGRATOR_KEYWORDS，13 个）。 */
export const TRANSMIGRATOR_KEYWORDS: readonly string[] = [
  '穿越',
  '魂穿',
  '重生',
  '转世',
  '夺舍',
  '附身',
  '觉醒',
  '系统',
  '绑定',
  '降临',
  '投影',
  '异世界',
  '魂越',
]

/**
 * 判断背景文本是否描述穿越者/转生者身份。
 *
 * @param background - 角色背景文本
 * @returns 命中任一穿越者关键词时返回 true
 *
 * @example
 * ```ts
 * detectTransmigrator('主角穿越到异世界') // true
 * ```
 */
export function detectTransmigrator(background: string): boolean {
  if (!background) return false
  return TRANSMIGRATOR_KEYWORDS.some((keyword) => background.includes(keyword))
}

/**
 * 推断角色起始年龄。
 *
 * 用途：角色创建页预览与 CharacterBaseSystem 落地都走同一函数，避免穿越者关键词表
 * 和魂穿婴儿特例在 UI / 子系统之间漂移。
 *
 * @param background - 角色背景文本
 * @returns 穿越者默认 18 岁；魂穿/魂越到婴儿、出生、降生等场景为 0；原生者为 0
 *
 * @example
 * ```ts
 * detectStartingAge('穿越到修仙世界') // 18
 * detectStartingAge('魂穿成刚出生的婴儿') // 0
 * ```
 */
export function detectStartingAge(background: string): number {
  if (!background) return 0
  if (!detectTransmigrator(background)) return 0

  if (background.includes('魂穿') || background.includes('魂越')) {
    const infantMatch = background.match(/(?:魂穿|魂越).*?(?:婴儿|幼|0岁|出生|降生|转生)/)
    if (infantMatch) return 0
  }

  return 18
}
