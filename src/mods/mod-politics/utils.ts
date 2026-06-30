/**
 * @module utils.ts
 * @description mod-politics 工具函数（统一提升自 foundation）
 * @mod mod-politics
 */

export { ROUND_DECIMALS, round, clamp, pickRandom } from '@/foundation'
// randomInt 已统一到 shared/common-utils.ts，避免各 MOD 重复定义（B-45 要求）
export { randomInt } from '@/core/shared'
