/**
 * @module resolve-seed.ts
 * @description 自定义 Seed 控制 —— 剧情一致性种子
 * @mod core
 *
 * 来源：废弃项目 lib/services/ai/ai-client-base.ts（resolveSeed）
 *
 * 相同 seed + 相同 prompt = 相似剧情走向
 * 用户可输入自定义 seed 或自动生成
 */

/**
 * 生成随机种子
 * 格式：(Date.now() % 1000000) * (random 10-99)
 */
export function generateSeed(): number {
  return (Date.now() % 1000000) * (Math.floor(Math.random() * 90) + 10)
}

/**
 * 解析用户输入的种子
 *
 * @param storySeed 用户输入的种子字符串（可选）
 * @returns 有效的正整数种子
 *
 * 规则：
 *   - 如果用户输入了有效正整数，使用该值
 *   - 否则自动生成随机种子
 */
export function resolveSeed(storySeed?: string): number {
  if (storySeed && storySeed.trim() !== '') {
    const parsed = parseInt(storySeed, 10)
    if (!isNaN(parsed) && parsed > 0) return parsed
  }
  return generateSeed()
}

/**
 * 种子存储键
 */
export const SEED_STORAGE_KEY = 'ai-life-sim:story-seed'

/**
 * 保存种子到 localStorage
 */
export function saveSeed(seed: number): void {
  try {
    localStorage.setItem(SEED_STORAGE_KEY, String(seed))
  } catch {
    // localStorage 不可用时静默忽略
  }
}

/**
 * 从 localStorage 读取种子
 */
export function loadSeed(): number | null {
  try {
    const raw = localStorage.getItem(SEED_STORAGE_KEY)
    if (raw) {
      const parsed = parseInt(raw, 10)
      if (!isNaN(parsed) && parsed > 0) return parsed
    }
  } catch {
    // localStorage 不可用时静默忽略
  }
  return null
}
