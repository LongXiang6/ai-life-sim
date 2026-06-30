/**
 * @module defines/index.ts
 * @description 全局领域常量集中管理（吸收 Factorio defines.* 设计）
 * @mod foundation
 *
 * 所有事件名、阶段名、世界观类型等字符串标识符集中定义于此。
 * 禁止在其他文件中硬编码这些字符串。
 */

/** 全局事件名 */
export const Events = {
  core: {
    /** 所有 MOD 加载完成 */
    allModsLoaded: 'core:all-mods-loaded',
    /** MOD 配置变更（增删/版本变化/设置变更） */
    configurationChanged: 'core:configuration-changed',
  },
  modEngine: {
    /** 回合开始 */
    roundStart: 'mod-engine:round-start',
    /** 回合完成 */
    roundComplete: 'mod-engine:round-complete',
  },
  modCharacter: {
    /** 角色死亡 */
    death: 'mod-character:death',
    /** 角色出生 */
    birth: 'mod-character:birth',
  },
} as const;

/** 回合阶段 */
export const RoundPhase = {
  idle: 'idle',
  running: 'running',
  collecting: 'collecting',
  narrating: 'narrating',
  applying: 'applying',
} as const;

/** 世界观类型 */
export const WorldviewType = {
  xianxia: 'xianxia',
  scifi: 'scifi',
  westernFantasy: 'western-fantasy',
} as const;

/** 依赖前缀（解析 manifest dependencies 时使用） */
export const DependencyPrefix = {
  /** 硬依赖（必须加载，必须优先） */
  required: '',
  /** 可选依赖（不存在不报错） */
  optional: '? ',
  /** 冲突声明（同时存在报错） */
  incompatible: '! ',
  /** 软引用（引用但不强制加载顺序） */
  soft: '~ ',
} as const;

/** 事件名联合类型 */
export type EventName =
  | typeof Events.core.allModsLoaded
  | typeof Events.core.configurationChanged
  | typeof Events.modEngine.roundStart
  | typeof Events.modEngine.roundComplete
  | typeof Events.modCharacter.death
  | typeof Events.modCharacter.birth
  | (string & {});

/** 回合阶段联合类型 */
export type RoundPhaseType = (typeof RoundPhase)[keyof typeof RoundPhase];

/** 世界观类型联合类型 */
export type WorldviewTypeValue = (typeof WorldviewType)[keyof typeof WorldviewType];
