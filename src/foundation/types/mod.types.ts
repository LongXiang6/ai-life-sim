/**
 * @module mod.types.ts
 * @description MOD 接口类型定义 —— Manifest、路由、事件、生命周期
 * @mod foundation
 *
 * 规范来源：mod-specification.md §4 Manifest 规范 / §5 MOD 注册与加载机制
 */

/** MOD 路由注册 */
export interface ModRoute {
  /** URL 路径 */
  path: string
  /** 页面组件路径（相对于 MOD 根目录） */
  page: string,
}

/** MOD 事件映射 */
export interface ModEvents {
  /** 本 MOD 发出的事件 */
  emits: string[],
  /** 本 MOD 监听的事件 */
  listens: string[],
}

/** Campaign 管线阶段声明（引擎 MOD 专用，须与 campaigns 实现一致） */
export interface ModCampaignHooks {
  /** 默认 campaign 阶段名列表（声明即契约，codegen 校验与实现一致） */
  stages: string[]
}

/** MOD 身份与能力声明 */
export interface ModManifest {
  /** MOD 名称，必须匹配目录名 mod-{kebab-case} */
  name: string
  /** 同一依赖层的显式执行顺序；相同值按 name 的 ASCII 升序决胜。 */
  order: number
  /** 语义化版本号 */
  version: string
  /** 一句话功能描述 */
  description: string
  /**
   * 依赖的 MOD 名称列表
   *
   * 支持前缀格式（V2）：
   *   'mod-world'       — 硬依赖（必须加载，必须优先）
   *   '? mod-culture'   — 可选依赖（不存在不报错）
   *   '! mod-politics'  — 冲突声明（同时存在报错）
   *   '~ mod-economy'   — 软引用（推荐写法，不强制加载顺序）
   *   '~mod-economy'    — 软引用（紧凑写法，与上一行等价）
   */
  dependencies: string[]
  /** 本 MOD 提供的能力标识列表 */
  provides: string[]
  /** 本 MOD 使用的其他 MOD 能力列表 */
  consumes: string[]
  /** 子系统名称列表（引擎类 MOD 专用） */
  subsystems?: string[]
  /** 路由注册列表（页面类 MOD 专用） */
  routes?: ModRoute[]
  /** Zustand Store 名称列表 */
  stores?: string[]
  /** 事件映射（本 MOD 发出和监听的事件） */
  events?: ModEvents
  /** Prompt 模板名称列表（AI 类 MOD 专用） */
  prompts?: string[]
  /**
   * Remote API 函数名 allowlist（可选，覆盖 index.ts 与 secondary 入口的自动推导）
   * 未声明时由 codegen `remote-contracts.generated.ts` 自动推导；空数组显式禁用 Remote API
   */
  remoteApi?: string[]
  /**
   * 除 index.ts 外的额外公共入口（重 API / 与轻量 barrel 分离）
   * 例：['world-init-api.ts'] — 须在 architecture-rules.json allowedSecondaryPublicImports 中登记
   */
  secondaryPublicEntries?: string[]
  /**
   * 仅允许服务端模块导入的公共入口；不得进入 Remote API、浏览器 wiring 或客户端 bundle。
   * 入口文件必须使用 `server-only` 硬门禁，并在架构规则中单独登记。
   */
  serverOnlyPublicEntries?: string[]
  /** 世界观叙事规则（可选，注入 AI Prompt 的额外规则文本） */
  worldRules?: string
  /** Campaign 叙事阶段声明（mod-engine 专用，codegen 与 campaigns/default 交叉校验） */
  campaignHooks?: ModCampaignHooks
  /** 功能开关（V2 新增，声明所需引擎能力） */
  featureFlags?: ModFeatureFlags
}

/** 解析后的依赖项 */
export interface ModDependency {
  /** 目标 MOD 名称 */
  name: string
  /** 依赖类型 */
  type: 'required' | 'optional' | 'incompatible' | 'soft'
  /** 是否影响加载顺序（required = true，其余 = false） */
  affectsLoadOrder: boolean
}

/** MOD 功能开关（声明所需引擎能力） */
export interface ModFeatureFlags {
  /** 需要 AI 叙事能力 */
  aiNarrative?: boolean
  /** 需要事件总线 */
  eventBus?: boolean
  /** 需要持久化存储 */
  persistStore?: boolean
  /** 扩展键 */
  [key: string]: boolean | undefined
}

/** MOD 身份与能力声明 V2 */
export interface ModManifestV2 extends ModManifest {
  /** 功能开关 */
  featureFlags?: ModFeatureFlags
}

/** 配置变更数据（onConfigurationChanged 接收） */
export interface ConfigurationChangedData {
  /** 变更原因 */
  reason: 'mod_added' | 'mod_removed' | 'mod_version_changed' | 'setting_changed'
  /** 新增的 MOD 名称列表 */
  addedMods?: string[]
  /** 移除的 MOD 名称列表 */
  removedMods?: string[]
  /** MOD 版本变更映射 */
  modChanges?: Record<string, { oldVersion: string; newVersion: string }>
}

/** MOD 生命周期钩子 V1 */
export interface ModLifecycle {
  /** MOD 初始化（所有依赖已加载） */
  onInit?: (context: ModContext) => void | Promise<void>,
  /** MOD 销毁 */
  onDestroy?: () => void,
}

/**
 * MOD 生命周期钩子 V2
 *
 * 吸收 Factorio on_configuration_changed + on_load 设计。
 */
export interface ModLifecycleV2 extends ModLifecycle {
  /**
   * 配置变更时触发
   *
   * 当其他 MOD 被添加、移除、版本变更或设置变更时调用。
   * 最佳实践：在 onInit 和 onConfigurationChanged 中同时调用相同的跨 MOD 发现逻辑。
   */
  onConfigurationChanged?: (data: ConfigurationChangedData) => void | Promise<void>

  /**
   * 存档加载完成钩子（吸收 Factorio on_load 设计）
   *
   * 在 TypeRegistry.revive() 还原所有对象原型链之后调用。
   * MOD 可在此重建运行时状态：
   *   - 重建内部缓存
   *   - 重新注册事件监听器（EventBus 在反序列化后需要重新 on()）
   *   - 刷新 UI 引用
   *
   * 重要约束（与 Factorio 一致）：
   *   - 不得修改持久化存储（storage 已恢复，写入可能导致不一致）
   *   - 只能做内存重建操作
   */
  onLoad?: (context: ModContext) => void | Promise<void>
}

/**
 * MOD 生命周期钩子 V3
 *
 * 吸收 Factorio Settings 阶段（settings.lua → settings-updates → settings-final-fixes）设计。
 */
export interface ModLifecycleV3 extends ModLifecycleV2 {
  /**
   * Settings Round 1: 声明本 MOD 的配置项（吸收 Factorio settings.lua）
   *
   * 返回本 MOD 需要的配置项声明列表。
   * 所有 MOD 此方法完成后，引擎构建全局配置声明表。
   */
  declareSettings?: () => ModSettingDeclaration[]

  /**
   * Settings Round 2: 基于其他 MOD 的配置交叉修正（吸收 Factorio settings-updates.lua）
   *
   * 此时 allSettings 包含所有 MOD 的配置声明。
   * 例如：MOD A 的难度等级影响 MOD B 的经验倍率默认值。
   *
   * 返回修正后的设置值（只能修改本 MOD 的设置）。
   */
  updateSettings?: (allSettings: Record<string, ModSettingDeclaration[]>) => Record<string, unknown>

  /**
   * Settings Round 3: 全局一致性校验（吸收 Factorio settings-final-fixes.lua）
   *
   * 检测到冲突 → throw Error（阻塞启动）。
   * 例如：MOD A 要求 difficulty=hard，MOD B 要求 difficulty=easy。
   */
  validateSettings?: (allSettings: Record<string, ModSettingDeclaration[]>) => void | Promise<void>
}

/** 设置项声明（吸收 Factorio settings.lua） */
export interface ModSettingDeclaration {
  /** 设置键名 */
  key: string
  /** 默认值 */
  defaultValue: unknown
  /** 值类型 */
  type: 'string' | 'number' | 'boolean' | 'enum'
  /** 枚举可选值（type=enum 时） */
  enumValues?: string[]
  /** 数值范围（type=number 时） */
  min?: number
  max?: number
  /** 描述 */
  description: string
}

/** 事件总线接口 */
export interface IEventBus {
  emit(event: string, data?: unknown): void
  on(event: string, handler: (data: unknown) => void): () => void
  off(event: string, handler: (data: unknown) => void): void
}

/** 全局 Store 类型（各 MOD Store 分片通过加载器注入） */
export type GlobalStore = Record<string, unknown>

/** AI 服务接口 */
export interface IAIService {
  callAI: (config: import('./api.types').AIModelConfig, messages: unknown[]) => Promise<unknown>
  callAIStream: (config: import('./api.types').AIModelConfig, messages: unknown[]) => AsyncGenerator<string>,
}

/** 存储服务接口 */
export interface IStorageService {
  getItem(key: string): string | null,
  setItem(key: string, value: string): void,
  removeItem(key: string): void,
  /** 可选：枚举所有键（用于命名空间 getAll 隔离扫描） */
  keys?(): string[],
}

/** MOD 预扫描信息（Phase 0 构建） */
export interface ModScanEntry {
  /** MOD 版本号 */
  version: string
  /** 依赖列表（原始字符串格式） */
  dependencies: string[]
  /** MOD 描述 */
  description: string
}

/** 隔离的存储命名空间（吸收 Factorio per-MOD storage 隔离设计） */
export interface StorageNamespace<T extends Record<string, unknown> = Record<string, unknown>> {
  /** 读取键 */
  get<K extends keyof T>(key: K): T[K] | undefined
  /** 写入键 */
  set<K extends keyof T>(key: K, value: T[K]): void
  /** 删除键 */
  delete(key: keyof T): void
  /** 获取所有键值 */
  getAll(): Partial<T>
}

/** MOD 上下文（加载器注入） */
export interface ModContext {
  /** 事件总线实例 */
  eventBus: IEventBus
  /** 全局 Store */
  globalStore: GlobalStore
  /** AI 服务 */
  aiService: IAIService
  /** 存储服务 */
  storage: IStorageService
  /** 获取已加载 MOD 的公共 API */
  getMod: <T>(name: string) => T,
  /**
   * MOD 预扫描表（Phase 0 构建）
   *
   * 在 onInit 中即可查询其他 MOD 是否存在：
   *   if (context.mods?.has('mod-politics')) { ... }
   */
  mods?: Map<string, ModScanEntry>
  /**
   * 获取本 MOD 的隔离存储命名空间（吸收 Factorio per-MOD storage 设计）
   *
   * 引擎保证：MOD 只能访问自己的存储分区。
   * 所有读写自动前缀 MOD 名称键，防止跨 MOD 数据污染。
   */
  getStorage?: <T extends Record<string, unknown> = Record<string, unknown>>() => StorageNamespace<T>
}

