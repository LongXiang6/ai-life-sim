/**
 * @module utils.ts
 * @description mod-culture 工具函数
 * @mod mod-culture
 */

export { ROUND_DECIMALS, round, clamp, pickRandom } from '@/foundation'
// randomInt 已统一到 shared/common-utils.ts，避免各 MOD 重复定义（B-45 要求）
export { randomInt } from '@/core/shared'
