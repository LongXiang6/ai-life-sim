/**
 * @module worldview.types.ts
 * @description 世界观类型契约 —— 枚举 + 名称 + 描述，供 UI 选世界和 Prompt 注入
 * @mod foundation
 *
 * 注意：Foundation 层仅声明类型+常量+映射，不含计算逻辑。
 */

/** 世界观标识 */
export type WorldviewId =
  | 'cultivation'        // 修仙
  | 'martial-arts'       // 武侠
  | 'sci-fi'             // 科幻
  | 'post-apocalyptic'   // 末世
  | 'dark-fantasy'       // 黑暗奇幻
  | 'western-fantasy'    // 西方奇幻
  | 'modern'             // 现代
  | 'ancient-history'    // 历史古代
  | 'interstellar'       // 星际
  | 'cyberpunk'          // 赛博朋克

/** 世界观 ID 数组 */
export const WORLDVIEW_IDS: readonly WorldviewId[] = [
  'cultivation',
  'martial-arts',
  'sci-fi',
  'post-apocalyptic',
  'dark-fantasy',
  'western-fantasy',
  'modern',
  'ancient-history',
  'interstellar',
  'cyberpunk',
] as const

/** 世界观中文名称 */
export const WORLDVIEW_NAMES: Readonly<Record<WorldviewId, string>> = {
  cultivation: '修仙',
  'martial-arts': '武侠',
  'sci-fi': '科幻',
  'post-apocalyptic': '末世',
  'dark-fantasy': '黑暗奇幻',
  'western-fantasy': '西方奇幻',
  modern: '现代',
  'ancient-history': '历史古代',
  interstellar: '星际',
  cyberpunk: '赛博朋克',
}

/** 世界观简要描述（用于 UI 展示和 Prompt 注入） */
export const WORLDVIEW_DESCRIPTIONS: Readonly<Record<WorldviewId, string>> = {
  cultivation: '灵气复苏、修真问道、飞升成仙的东方仙侠世界',
  'martial-arts': '刀光剑影、快意恩仇、侠之大者的江湖武林',
  'sci-fi': '近未来科技、人工智能、基因改造的科幻世界',
  'post-apocalyptic': '灾难过后、废土求生、文明重建的末世世界',
  'dark-fantasy': '诸神沉默、诅咒蔓延、在黑暗中挣扎求生的奇幻世界',
  'western-fantasy': '魔法剑与龙、种族林立、诸神纷争的西方奇幻世界',
  modern: '当代都市、职场商业、日常生活与现代文明',
  'ancient-history': '王朝更迭、征战讨伐、权谋机变的古代历史世界',
  interstellar: '星际航行、外星文明、银河帝国争霸的太空世界',
  cyberpunk: '高科技低生活、霓虹都市、企业寡头统治的反乌托邦',
}
