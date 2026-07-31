/**
 * @module subsystem.types.ts
 * @description 子系统接口类型定义 —— ISubSystem、状态快照、变更指令、回合上下文
 * @mod foundation
 *
 * 规范来源：mod-specification.md §7 子系统规范
 */

/** 子系统状态快照 */
export interface SubSystemState {
  /** 子系统 ID */
  id: string,
  /** 状态摘要文本（直接注入 Prompt） */
  summary: string,
  /** 结构化状态数据（供其他子系统引用） */
  data: unknown,
}

/** 子系统变更指令 */
export interface SubSystemChanges {
  /** 子系统 ID */
  id: string
  /** Unified system-instruction stable target object. Manual internal commits may omit it. */
  targetObjectId?: string
  /** Unified system-instruction target context. */
  targetContextId?: string
  /** Owning-system operation name. */
  operation?: string
  /** Accepted historical evidence IDs supporting this instruction. */
  evidenceEventIds?: string[]
  /** 变更描述文本 */
  description: string
  /** 结构化变更数据 */
  changes: Record<string, unknown>,
}

/** 时间步长（365 天历法） */
export interface TimeStep {
  /** 步长单位 */
  unit: 'day' | 'month' | 'season' | 'year'
  /** 步长值 */
  value: number,
}

/** 回合上下文 */
export interface RoundContext {
  /** 当前上下文稳定 ID；世界名称和 worldCode 不得替代它 */
  contextId: string,
  /** 当前上下文模拟范围 */
  contextScope: 'active' | 'background' | 'dormant' | 'closed',
  /** @deprecated 当前等同 contextId，仅保留旧子系统字段名兼容 */
  worldId: string,
  /** 当前角色全局稳定实体 ID */
  characterId: string,
  /** 当前回合信息 */
  round: {
    year: number,
    season: number,
    month: number,
  },
  /** 时间步长 */
  timeStep: TimeStep,
  /** 全局难度等级 */
  difficulty: 'normal' | 'hard' | 'nightmare' | 'hell',
  /** 其他子系统的当前状态（按 ID 索引） */
  subsystemStates: Record<string, SubSystemState>,
  /** 引擎累计推进次数（每轮 +1，用于子系统幂等 guard） */
  roundSequence?: number,
  /**
   * 本轮推进天数（自上次推进以来的天数增量，整数，唯一时间增量源）
   * 由 TimeSystem 产出（TimeSystem.getDaysPassed()），子系统只读。
   * 取代旧的 ageYearsDelta / simulationTicks / calendarDaysDelta（已删除）。
   */
  daysPassed: number,
  /** 游戏总天数（整数，唯一权威累计时间源），由 TimeSystem 产出，子系统只读 */
  totalDays: number,
  /** 世界叙事锚定年（如 1991），0 = 未设定 */
  eraStartYear?: number,
  /** 角色出生纪年（默认同 eraStartYear） */
  birthEraYear?: number,
  /** 世界观 essenceTag（供纪元子系统等） */
  essenceTag?: string,
}

/**
 * 子系统标准接口
 *
 * 所有子系统必须实现此接口。
 * 引擎通过 collectState 收集状态快照注入 Prompt，
 * 通过 applyChanges 将 AI 响应解析后的变更应用到子系统。
 *
 * 本地模拟层（advance）：非叙事回合子系统的纯规则推演，
 * 不调 AI，只做数值计算（如人口增长、市场波动、气候变迁等）。
 *
 * 分布式元数据（全部可选，不声明 = 默认行为）：
 *   每个子系统可自行声明自身的行为约束，引擎自动读取，
 *   无需在引擎中维护集中式配置字典。
 */
export interface ISubSystem {
  /** 子系统唯一标识（kebab-case） */
  readonly id: string,
  /** 所属 MOD 名称 */
  readonly mod: string,
  /** 子系统显示名称 */
  readonly label: string,
  /** 子系统描述 */
  readonly description: string,

  // ============================================================
  // 分布式元数据（全部可选，不声明 = 默认行为）
  // ============================================================

  /** 依赖的其他子系统 ID（collectState 执行时需先于自己，用于拓扑排序） */
  dependsOn?: string[]
  /** 数据注入 AI Prompt 的频率（默认 'always'） */
  frequency?: 'always' | 'change' | 3 | 5 | 10
  /** 年龄窗口（角色在此年龄范围内子系统才对 AI 可见） */
  ageWindow?: { min?: number; max?: number }
  /** 可见的社会阶层（角色处于这些阶层时对 AI 可见） */
  socialClasses?: string[]
  /** 可见的势力类型（角色属于这些势力时对 AI 可见） */
  factionTypes?: string[]
  /** 需要的影响力等级（角色力量达到此级别才对 AI 可见，递进式） */
  influenceScope?: 'personal' | 'town' | 'region' | 'continent' | 'world'
  /** 是否始终注入 Prompt（不受任何过滤影响，如 character-base、health） */
  alwaysRelevant?: boolean
  /** 对角色力量值的贡献计算（供 SubsystemRelevanceSystem 调用） */
  powerContribution?: (data: Record<string, unknown>) => number
  /** 世界方向映射：key=方向域, field=影响的字段名, formula=修正公式 */
  worldDirectionMapping?: Record<string, { field: string; formula: string }>

  // ============================================================
  // 生命周期方法
  // ============================================================

  /**
   * 本地模拟推进（非叙事回合的纯规则计算）
   *
   * 当引擎处于本地回合（非 AI 叙事回合）时调用，
   * 子系统在此方法中执行纯数值计算，不调 AI。
   * 如果不实现此方法，子系统只在 AI 叙事回合响应 collectState/applyChanges。
   */
  advance?(context: RoundContext): void,

  /** 收集当前状态快照（供 Prompt 组装） */
  collectState(context: RoundContext): SubSystemState,
  /** 应用回合变更（解析 AI 响应后） */
  applyChanges(changes: SubSystemChanges, context: RoundContext): void,
  /** 重置为初始状态 */
  reset(): void,
}

// ============================================================
// V2: 三回合加载（吸收 Factorio data.lua → data-updates.lua → data-final-fixes.lua 设计）
// ============================================================

/**
 * 子系统标准接口 V2
 *
 * 新增两个可选收集阶段，兼容 V1 子系统（V2 方法全部可选）。
 *
 * 三回合加载流程：
 *   Round 1 (data.lua)           → collectState()      — 各子系统独立收集初始状态
 *   Round 2 (data-updates.lua)   → collectStateUpdate() — 基于 Round 1 结果跨系统修正
 *   Round 3 (data-final-fixes)   → collectStateFinalFix() — 全局一致性修复（总人口≥0 等）
 */
export interface ISubSystemV2 extends ISubSystem {
  /**
   * Round 2 收集（可选实现）
   *
   * 在第一轮所有子系统 collectState 完成后执行。
   * 此时 context.subsystemStates 包含 Round 1 的全部结果，
   * 子系统可以基于其他子系统的初始状态修正自身数据。
   *
   * 返回 null 表示本轮无需修改（大多数子系统的默认情况）。
   *
   * 吸收 Factorio data-updates.lua 设计。
   */
  collectStateUpdate?(context: RoundContext): SubSystemState | null

  /**
   * Round 3 收集（可选实现）
   *
   * 在 Round 2 完成后执行，用于全局一致性修复。
   * 如总人口不为负、资产总值与分项之和一致等。
   *
   * 吸收 Factorio data-final-fixes.lua 设计。
   */
  collectStateFinalFix?(context: RoundContext): SubSystemState | null
}

// ============================================================
// V3 阶段边界类型约束（编译期防止副作用越界）
// ============================================================

/**
 * 只读回合上下文 — collectState 专用
 *
 * 所有字段为 readonly，编译器禁止在收集阶段修改上下文。
 * 吸收 Factorio data 阶段和 runtime 阶段的 API 隔离设计。
 */
export interface ReadonlyRoundContext {
  readonly contextId: string
  readonly contextScope: 'active' | 'background' | 'dormant' | 'closed'
  readonly worldId: string
  readonly characterId: string
  readonly round: {
    readonly year: number
    readonly season: number
    readonly month: number
  }
  readonly timeStep: TimeStep
  readonly difficulty: 'normal' | 'hard' | 'nightmare' | 'hell'
  readonly subsystemStates: Readonly<Record<string, SubSystemState>>
}

/**
 * 可写回合上下文 — applyChanges 专用
 *
 * 额外提供 submitChange() 方法，明确表达"此处可写"的语义。
 */
export interface WritableRoundContext extends ReadonlyRoundContext {
  /** 待提交的变更列表 */
  pendingChanges: SubSystemChanges[]
  /** 提交一个变更到管线 */
  submitChange(change: SubSystemChanges): void
}

/**
 * 子系统 V3 — 泛型约束阶段边界（编译期防止副作用越界）
 *
 * 吸收 Factorio data 阶段 vs runtime 阶段的环境隔离设计：
 *   - Factorio: data 阶段只能访问 data.raw 等 prototype API，
 *               control 阶段才能访问 game 对象
 *   - 本项目: 通过泛型参数限制 collectState 预期接收只读上下文，
 *             applyChanges 预期接收可写上下文
 *
 * 泛型参数为类型级文档标记，不影响 ISubSystemV2 的签名兼容性。
 * V1/V2 子系统可通过 ISubSystemV2 类型无缝兼容。
 *
 * 使用示例：
 *   class MySystem implements ISubSystemV3<ReadonlyRoundContext, WritableRoundContext> {
 *     collectState(context: ReadonlyRoundContext): SubSystemState { ... }
 *     applyChanges(changes: SubSystemChanges, context: WritableRoundContext): void { ... }
 *   }
 *
 * @typeParam CollectCtx - collectState 预期接收的上下文类型（默认 ReadonlyRoundContext）
 * @typeParam ApplyCtx   - applyChanges 预期接收的上下文类型（默认 WritableRoundContext）
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ISubSystemV3<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CollectCtx extends ReadonlyRoundContext = ReadonlyRoundContext,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ApplyCtx extends WritableRoundContext = WritableRoundContext,
> extends ISubSystemV2 {
  // 方法签名继承自 ISubSystemV2，泛型参数仅作为类型级文档标记
  // 子系统实现时可以显式标注更具体的上下文类型
}

