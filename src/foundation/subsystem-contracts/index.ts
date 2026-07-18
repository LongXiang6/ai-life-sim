/**
 * @module index.ts
 * @description Foundation 跨域数据契约聚合导出 —— 子系统间通过 BaseSubsystem.readSubsystem<T>() 类型安全读取彼此数据
 * @mod foundation
 *
 * 背景：模拟系统全面重写梯队一（`ai-life-sim/docs/simulation-rewrite-architecture.md` §三、
 * `.agents/skills/ai-life-sim-mod-development/references/mod-spec-subsystem-contracts.md`）。
 *
 * 使用约定：
 * - 每个会被其他子系统引用的子系统，在此目录下建一个 `{子系统id}.contract.ts` 文件，
 *   导出该子系统对外暴露的数据结构接口（纯类型，不含运行时逻辑）
 * - 契约文件仅由编写该子系统的一方维护，消费方只读不写
 * - 契约是 TypeScript 编译期约束，运行时不做 schema 校验——区别于 AI 响应用 Zod 强校验
 *
 * 契约生成时机：清空代码时不需创建所有契约，只创建第一梯队会用到的；
 * 恢复每个子系统时同步创建它的契约文件（此文件目前为空聚合入口，随恢复进度追加 export）。
 */

export {}
