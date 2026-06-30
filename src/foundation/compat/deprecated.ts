/**
 * @module compat/deprecated.ts
 * @description API 弃用兼容层 —— 旧 API 保留警告期，首次调用 warn 提示迁移
 * @mod foundation
 *
 * 吸收 Factorio global→storage 重命名经验：
 *   首次调用输出 console.warn，后续静默执行。
 */

const warned = new Set<string>();

/**
 * 弃用包装器
 *
 * 包装已弃用的函数，在首次调用时输出迁移警告。
 * 后续调用静默执行，避免日志泛滥。
 *
 * @param oldName - 旧名称（用于警告信息）
 * @param newName - 新名称（提示迁移目标）
 * @param fn - 被包装的函数
 * @returns 包装后的函数（类型不变）
 *
 * @example
 * export const oldLoadMods = deprecated('loadMods', 'loadModsV2', loadModsV2);
 */
export function deprecated<T extends (...args: unknown[]) => unknown>(
  oldName: string,
  newName: string,
  fn: T,
): T {
  return ((...args: unknown[]) => {
    const key = `${oldName}→${newName}`;
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[deprecated] "${oldName}" 已弃用，请迁移到 "${newName}"`);
    }
    return fn(...args);
  }) as unknown as T;
}

/**
 * 弃用属性包装器
 *
 * 用于包装对象的已弃用属性访问。
 *
 * @param oldName - 旧属性名
 * @param newName - 新属性名
 * @param getter - 替代的 getter 函数
 *
 * @example
 * Object.defineProperty(obj, 'loadOrder', deprecatedProp('loadOrder', '（自动计算）', () => computedOrder));
 */
export function deprecatedProp(
  oldName: string,
  newName: string,
  getter: () => unknown,
): PropertyDescriptor {
  return {
    get() {
      const key = `${oldName}→${newName}`;
      if (!warned.has(key)) {
        warned.add(key);
        console.warn(`[deprecated] 属性 "${oldName}" 已弃用，请迁移到 "${newName}"`);
      }
      return getter();
    },
    enumerable: true,
    configurable: true,
  };
}
