/**
 * @module persist/type-registry.ts
 * @description 类型注册表 —— JSON 反序列化后自动还原 class 原型链
 * @mod foundation
 *
 * 问题：JSON.parse() 后 class 实例的原型链丢失，方法无法调用。
 * 方案：注册每个类型的构造函数，revive() 递归还原原型链。
 */

/** 构造函数类型 */
type Ctor<T = unknown> = (data: unknown) => T;

/** 类型注册表 */
export const TypeRegistry = {
  /** 类型名 → 构造函数映射 */
  ctors: new Map<string, Ctor>(),

  /**
   * 注册类型构造函数
   *
   * @param name - 类型名（建议使用 `ClassName.name`）
   * @param ctor - 构造函数，接收反序列化的数据，返回类型实例
   */
  register<T>(name: string, ctor: (data: unknown) => T): void {
    if (this.ctors.has(name)) {
      console.warn(`[TypeRegistry] 类型 "${name}" 已注册，将被覆盖`);
    }
    this.ctors.set(name, ctor as Ctor);
  },

  /**
   * 递归还原序列化对象的原型链
   *
   * 遍历对象树，对每个带有 `__type` 标记的对象调用注册的构造函数还原。
   *
   * @param data - 反序列化后的原始数据
   * @returns 原型链已还原的对象
   */
  revive<T>(data: unknown): T {
    if (data === null || data === undefined) return data as T;

    if (Array.isArray(data)) {
      return data.map((item) => this.revive(item)) as unknown as T;
    }

    if (typeof data === 'object') {
      const obj = data as Record<string, unknown>;

      // 递归处理所有属性
      const revived: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        revived[key] = this.revive(value);
      }

      // 如果对象带有类型标记，调用注册的构造函数还原
      if ('__type' in revived && typeof revived.__type === 'string') {
        const ctor = this.ctors.get(revived.__type);
        if (ctor) {
          const instance = ctor(revived);
          // 保留 __type 标记以便后续处理
          if (typeof instance === 'object' && instance !== null) {
            (instance as Record<string, unknown>).__type = revived.__type;
          }
          return instance as T;
        }
      }

      return revived as T;
    }

    return data as T;
  },

  /**
   * 检查类型是否已注册
   */
  has(name: string): boolean {
    return this.ctors.has(name);
  },

  /**
   * 获取已注册的类型列表
   */
  list(): string[] {
    return Array.from(this.ctors.keys());
  },
};

/**
 * 类型标记辅助函数
 *
 * 在序列化时为对象添加 __type 标记，反序列化时 TypeRegistry.revive() 据此还原类型。
 *
 * @example
 * class MyClass {
 *   __type = 'MyClass';
 *   value: number;
 * }
 * // 序列化时 JSON.stringify 会包含 __type 字段
 * // 反序列化时 TypeRegistry.revive() 自动还原为 MyClass 实例
 */
export function tagType<T extends Record<string, unknown>>(obj: T, typeName: string): T & { __type: string } {
  return { ...obj, __type: typeName };
}
