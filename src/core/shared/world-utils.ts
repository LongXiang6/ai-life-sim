/**
 * 世界观相关跨 MOD 公共函数
 *
 * 使用场景：mod-world、mod-base-universe、mod-environment-ecology 等需要处理世界数据的 MOD
 *
 * 规则：
 * - 所有函数必须是纯函数
 * - 被 2 个以上 MOD 调用的函数放这里
 * - **每个导出函数必须有详细中文注释（@param/@returns/@example）** — B-46 要求
 *
 * @mod core/shared
 */

/**
 * 世界观类型枚举映射（标签字符串 → 内部枚举值）
 * 
 * 确保各 MOD 对世界观类型的判断一致。
 * 支持中英文别名（修仙/仙侠/xiuzhen → xianxia）。
 * 
 * @example
 * ```ts
 * normalizeWorldviewType('修仙')  // "xianxia"
 * normalizeWorldviewType('sci-fi')  // "scifi"
 * normalizeWorldviewType('unknown') // "unknown"（未匹配时原样返回）
 * ```
 */
export const WORLDVIEW_TYPE_MAP: Record<string, string> = {
  xianxia: 'xianxia',
  xiuzhen: 'xianxia',
  修仙: 'xianxia',
  仙侠: 'xianxia',
  scifi: 'scifi',
  sci_fi: 'scifi',
  科幻: 'scifi',
  星际: 'scifi',
  westernFantasy: 'westernFantasy',
  'western-fantasy': 'westernFantasy',
  fantasy: 'westernFantasy',
  奇幻: 'westernFantasy',
  西幻: 'westernFantasy',
}

/**
 * 标准化世界观类型字符串
 * 
 * 将用户输入或 AI 输出的各类世界观标签映射为统一枚举值。
 * 未匹配的输入原样返回。
 * 
 * @param input - 输入的世界观标签（中英文均可）
 * @returns 标准化后的类型枚举值，未匹配时原样返回
 *
 * @example
 * ```ts
 * normalizeWorldviewType('修仙')  // "xianxia"
 * normalizeWorldviewType('scifi') // "scifi"
 * normalizeWorldviewType('自定义')  // "自定义"
 * ```
 */
export function normalizeWorldviewType(input: string): string {
  return WORLDVIEW_TYPE_MAP[input] ?? input
}

/**
 * 地形类型 → 宜居度映射
 * 
 * 用于 mod-environment-ecology 和 mod-world 的一致性计算。
 * 1.0 为完全宜居，0 为完全不宜居。
 * 
 * 典型使用场景：资源产出计算、人口上限推算、事件触发概率调整。
 */
export const TERRAIN_HABITABILITY: Record<string, number> = {
  plains: 1.0,     // 平原：完全宜居
  forest: 0.9,     // 森林
  hills: 0.8,      // 丘陵
  mountains: 0.5,  // 山地：半数宜居
  desert: 0.3,     // 沙漠
  tundra: 0.2,     // 冻土
  ocean: 0,         // 海洋：不宜居
}

/**
 * 获取地形宜居度
 * 
 * 查表返回，未注册地形返回 0.5（中性默认值）。
 * 
 * @param terrain - 地形类型字符串（如 "plains"、"desert"）
 * @returns 宜居度系数 0-1
 *
 * @example
 * ```ts
 * getTerrainHabitability('plains')   // 1.0
 * getTerrainHabitability('desert')   // 0.3
 * getTerrainHabitability('unknown')  // 0.5
 * ```
 */
export function getTerrainHabitability(terrain: string): number {
  return TERRAIN_HABITABILITY[terrain] ?? 0.5
}

/**
 * 资源丰度系数计算
 * 
 * 综合地形宜居度（40% 权重）和生态健康度（60% 权重）计算。
 * 数值越高表示该区域的资源产出越多。
 * 
 * @param terrain       - 地形类型
 * @param ecologyHealth - 生态健康度，范围 0-100
 * @returns 资源产出系数，保留 2 位小数
 *
 * @example
 * ```ts
 * calcResourceAbundance('plains', 80)   // 约 0.88
 * calcResourceAbundance('desert', 20)   // 约 0.24
 * ```
 */
export function calcResourceAbundance(
  terrain: string,
  ecologyHealth: number,
): number {
  const terrainFactor = getTerrainHabitability(terrain)
  const ecologyFactor = ecologyHealth / 100
  return Math.round((terrainFactor * 0.4 + ecologyFactor * 0.6) * 100) / 100
}
