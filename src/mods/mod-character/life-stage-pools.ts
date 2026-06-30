/**
 * @module life-stage-pools.ts
 * @description 生命阶段世界观分层事件池 —— 从废弃项目移植，对齐新 WorldviewId
 * @mod mod-character
 *
 * 数据来源：废弃项目 life-stage-config.ts
 * 7 套世界观 × 8 个阶段 × 2（推荐池 + 规避池），约 250+ 条事件关键词
 * 支持 getLifeStagePoolForWorldview(worldview) 查询，未匹配回退到 ANCIENT_POOLS
 */

import type { WorldviewId } from '@/foundation'
import { resolveStaticPoolWorldviewKey } from '@/mods/mod-world'
import type { LifeStageId } from './types'

/** 单阶段事件池 */
export interface StagePoolEntry {
  pool: string[]
  avoid: string[],
}

/** 8 阶段事件池 */
export type LifeStagePools = Record<LifeStageId, StagePoolEntry>

// ============================================================
// 5 套世界观基础事件池（从废弃项目移植）
// ============================================================

const ANCIENT_POOLS: LifeStagePools = {
  infant: { pool: ['启蒙', '家庭', '玩伴', '体弱多病'], avoid: ['婚姻', '从政', '征战', '远游'] },
  child: { pool: ['启蒙', '友谊', '少年立志', '家学'], avoid: ['婚姻', '征战', '权斗'] },
  teenager: { pool: ['初恋', '叛逆', '拜师', '奇遇', '游学'], avoid: ['辞官', '隐退', '送终'] },
  young_adult: { pool: ['婚姻', '建业', '征战', '科举', '游侠', '探索'], avoid: ['垂老', '送终'] },
  adult: { pool: ['事业巅峰', '权斗', '抚养子女', '门徒', '著作'], avoid: ['启蒙', '初恋'] },
  middle_age: { pool: ['传承', '内省', '隐疾', '中年危机', '家族变故'], avoid: ['初恋', '征战远行'] },
  elder: { pool: ['寿宴', '晚辈', '回忆', '病重', '遗嘱', '传位'], avoid: ['创业', '征战', '远游'] },
  deceased: { pool: [], avoid: [] },
}

const XIANXIA_POOLS: LifeStagePools = {
  infant: { pool: ['灵根觉醒', '家族护持', '体弱多病', '异象降生'], avoid: ['渡劫', '宗门大典', '远游历劫'] },
  child: { pool: ['启蒙练气', '玩伴', '初识灵兽', '入门考验'], avoid: ['婚配', '渡劫', '宗门权斗'] },
  teenager: { pool: ['拜入宗门', '初恋', '叛逆', '秘境奇遇', '功法选择'], avoid: ['闭死关', '飞升', '送终'] },
  young_adult: { pool: ['筑基突破', '历练', '宗门任务', '道侣初遇', '夺宝', '游历'], avoid: ['垂老', '送终'] },
  adult: { pool: ['金丹元婴', '建立洞府', '收徒', '法宝炼制', '权斗', '抚养后辈'], avoid: ['启蒙', '初恋'] },
  middle_age: { pool: ['境界瓶颈', '心魔劫', '隐疾', '世仇', '宗门变故'], avoid: ['初恋', '历练远游'] },
  elder: { pool: ['坐关闭死', '渡劫飞升', '回忆道途', '传授衣钵', '陨落预兆'], avoid: ['筑基', '历练'] },
  deceased: { pool: [], avoid: [] },
}

const MODERN_POOLS: LifeStagePools = {
  infant: { pool: ['家庭', '早教', '体弱多病'], avoid: ['恋爱', '职场', '移民'] },
  child: { pool: ['入学', '友谊', '兴趣班', '校园'], avoid: ['恋爱', '创业', '参军'] },
  teenager: { pool: ['高考', '初恋', '叛逆', '社团', '竞赛'], avoid: ['辞职', '退休', '婚变'] },
  young_adult: { pool: ['大学', '求职', '恋爱', '创业', '旅行'], avoid: ['退休', '养老'] },
  adult: { pool: ['职场晋升', '婚姻', '育儿', '购房', '投资'], avoid: ['高考', '入学'] },
  middle_age: { pool: ['中年危机', '转行', '子女教育', '赡养父母', '亚健康'], avoid: ['入学', '初恋'] },
  elder: { pool: ['退休', '养老', '病痛', '回忆录', '遗产', '孙辈'], avoid: ['创业', '求职'] },
  deceased: { pool: [], avoid: [] },
}

const SCIFI_POOLS: LifeStagePools = {
  infant: { pool: ['基因优化', 'AI保姆', '家庭', '先天缺陷'], avoid: ['义体改造', '星舰指挥'] },
  child: { pool: ['全息教育', '友谊', 'AI玩伴', '天赋检测'], avoid: ['义体改造', '星际探险'] },
  teenager: { pool: ['初恋', '叛逆', '技能植入', '赛博竞赛', '黑客入门'], avoid: ['退休', '养老'] },
  young_adult: { pool: ['大学', '义体改造', '恋爱', '创业', '星际探险'], avoid: ['退休', '养老'] },
  adult: { pool: ['职场晋升', '星舰舰长', '婚姻', '基因后代', '跨星系贸易'], avoid: ['入学', '高考'] },
  middle_age: { pool: ['意识备份', '中年危机', '义体老化', '子女教育', '文明探索'], avoid: ['入学', '初恋'] },
  elder: { pool: ['意识上传', '退休', '回忆录', '遗产分配', '冷冻休眠'], avoid: ['创业', '军校'] },
  deceased: { pool: [], avoid: [] },
}

const POST_APOCALYPTIC_POOLS: LifeStagePools = {
  infant: { pool: ['辐射防护', '家庭庇护', '营养匮乏', '变异风险'], avoid: ['探险', '战斗'] },
  child: { pool: ['生存训练', '友谊', '避难所教育', '拾荒入门'], avoid: ['恋爱', '政权'] },
  teenager: { pool: ['初恋', '叛逆', '狩猎训练', '废土竞赛', '帮派入门'], avoid: ['衰老', '养老'] },
  young_adult: { pool: ['探索废土', '恋爱', '建立据点', '战斗训练', '远行商队'], avoid: ['退休', '养老'] },
  adult: { pool: ['据点领袖', '婚姻', '育儿', '废土贸易', '变异觉醒'], avoid: ['入学', '高考'] },
  middle_age: { pool: ['旧伤复发', '中年危机', '子女独立', '传承', '据点扩建'], avoid: ['入学', '初恋'] },
  elder: { pool: ['传承', '病痛', '回忆录', '遗言', '教导后人'], avoid: ['创业', '远行'] },
  deceased: { pool: [], avoid: [] },
}

// ============================================================
// 世界观 → 事件池映射（对齐新系统 WorldviewId）
// ============================================================

/**
 * 废案世界观 → 新系统 WorldviewId 语义匹配：
 * - cultivation（修仙）      → XIANXIA_POOLS
 * - martial-arts（武侠）     → ANCIENT_POOLS（江湖人生阶段接近古代）
 * - sci-fi（科幻）           → SCIFI_POOLS
 * - post-apocalyptic（末世）  → POST_APOCALYPTIC_POOLS
 * - dark-fantasy（黑暗奇幻）  → ANCIENT_POOLS
 * - western-fantasy（西方奇幻）→ ANCIENT_POOLS
 * - modern（现代）           → MODERN_POOLS
 * - ancient-history（历史古代）→ ANCIENT_POOLS
 * - interstellar（星际）     → SCIFI_POOLS
 * - cyberpunk（赛博朋克）    → SCIFI_POOLS
 */
export const LIFE_STAGE_POOLS_BY_WORLDVIEW: Record<WorldviewId, LifeStagePools> = {
  cultivation: XIANXIA_POOLS,
  'martial-arts': ANCIENT_POOLS,
  'sci-fi': SCIFI_POOLS,
  'post-apocalyptic': POST_APOCALYPTIC_POOLS,
  'dark-fantasy': ANCIENT_POOLS,
  'western-fantasy': ANCIENT_POOLS,
  modern: MODERN_POOLS,
  'ancient-history': ANCIENT_POOLS,
  interstellar: SCIFI_POOLS,
  cyberpunk: SCIFI_POOLS,
}

/** 未匹配世界观时的回退池 */
export const FALLBACK_POOLS: LifeStagePools = ANCIENT_POOLS

/**
 * 根据世界观查询对应的事件池
 * @param worldview 世界观 ID（可空，空时回退到 ANCIENT_POOLS）
 */
export function getLifeStagePoolForWorldview(worldview?: WorldviewId | string): LifeStagePools {
  if (!worldview) return FALLBACK_POOLS
  const key = resolveStaticPoolWorldviewKey(worldview)
  if (key === 'default') return FALLBACK_POOLS
  return (LIFE_STAGE_POOLS_BY_WORLDVIEW as Record<string, LifeStagePools>)[key] || FALLBACK_POOLS
}

/**
 * 为指定阶段生成易触发/规避事件的格式化文本（对齐废弃项目 formatLifeStageForPrompt）
 */
export function formatStageEventsForPrompt(stage: LifeStageId, pools?: LifeStagePools): string {
  const entry = pools?.[stage]
  if (!entry || !entry.pool.length) return ''
  const parts: string[] = []
  if (entry.pool.length) parts.push(`易触发事件 ${entry.pool.join('/')}`)
  if (entry.avoid.length) parts.push(`不宜触发 ${entry.avoid.join('/')}`)
  return parts.join('；')
}

