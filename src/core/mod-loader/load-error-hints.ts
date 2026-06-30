/**
 * @module load-error-hints.ts
 * @description MOD 加载错误 → 修复提示映射
 * @mod core
 */

/** 带修复提示的加载错误 */
export interface ModLoadErrorWithHint {
  message: string,
  hint?: string,
}

/**
 * 为加载器错误附加可读修复提示
 * @param message - 原始错误消息
 * @returns 带修复提示的加载错误
 */
export function enrichModLoadError(message: string): ModLoadErrorWithHint {
  const consumeMatch = message.match(/消费的能力 "([^"]+)" 没有 MOD 提供/)
  if (consumeMatch) {
    const cap = consumeMatch[1]
    return {
      message,
      hint: `检查是否有 MOD 在 provides 中声明 "${cap}"；若由其他 MOD 提供，请在 dependencies 中添加该 MOD 或软依赖 "~ mod-xxx"`,
    }
  }

  if (message.includes('循环依赖检测')) {
    return {
      message,
      hint: '检查 dependencies 中是否存在双向硬依赖；互引用应改用软依赖 "~ mod-xxx"（或紧凑写法 "~mod-xxx"）',
    }
  }

  const depMissingMatch = message.match(/依赖 MOD "([^"]+)" 不存在/)
  if (depMissingMatch) {
    const dep = depMissingMatch[1]
    return {
      message,
      hint: `依赖 "${dep}" 可能写错或前缀未解析（软依赖用 "~ ${dep.replace(/^~/, '')}" 而非 "${dep}"）`,
    }
  }

  return { message }
}
