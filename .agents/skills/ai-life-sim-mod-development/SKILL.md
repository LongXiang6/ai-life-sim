---
name: ai-life-sim-mod-development
description: 用于用户要求的 AI 人生模拟器 MOD 清单、注册、生命周期、子系统、核心模拟编排或公共 API 变更。
---

# AI 人生模拟器 MOD 开发

## 目标

[核心原则] 让 MOD 以明确公共边界、生命周期、子系统职责、业务状态和结果契约承接核心模拟任务。

## 适用范围

[核心原则] MOD 清单、Manifest、注册、生命周期、子系统、公共 API、依赖和运行时活动成员由本 Skill 负责。

[次要规则] 编排、活动子系统和回合提交同时读取核心模拟活动权威。

## 执行契约

[核心原则] 先读取系统树与目标机制的活动权威，再定位 Manifest、活动成员、公共入口和所属状态所有者。

[核心原则] 中央登记流程消费 `src/core/execution/execution-flow-registry.ts` 的唯一登记项。

[核心原则] 加载器、生成器和公共执行器负责注册、接线、拓扑、排队、状态校验和生命周期收束。

[核心原则] MOD 负责所属业务规则、业务状态、持久化和公开结果。

[核心原则] 核心模拟负责跨 MOD 发令、依赖汇合、独立发布边界和流程终态。

[次要规则] 标识、文件、格式、写法和排序按 [项目标准化契约](../ai-life-sim/references/standardization.md) 执行。

[次要规则] 被替代入口、注册、调用、状态写入和测试引用在同一任务完成收口。

## 权威与实时源

[核心原则] 系统层级、标识与命名读取 `docs/authority/system-tree.md`。

[核心原则] 核心回合结果读取 `docs/authority/core-simulation.md` 及其机制导航。

[核心原则] Manifest 读取所属 `manifest.ts` 与 `src/foundation/types/mod.types.ts`。

[核心原则] 活动成员读取 `src/mods/mod-engine/helpers/mvp-stages-config.default.json`。

[次要规则] 自动接线读取 `scripts/codegen/generate-mod-wiring.mjs` 与生成目标。

## 边界

[核心原则] 跨 MOD 协作使用已声明公共入口和公开状态契约。

[核心原则] 每项业务状态保留一个所属所有者。

[次要规则] 公共或持久旧标识在真实冲突出现时进入专门迁移范围。

[辅助说明] 新建或本次修改的标识遵循系统树命名表。

## 验收

[核心原则] MOD 或 Manifest 变化运行 `npm run check:structural` 和 `npm run check:mod`。

[次要规则] 生命周期、活动成员、执行图或诊断契约变化运行 `npm run check:execution`。

[次要规则] 文件、命名、格式和生成物变化运行 `npm run check:standardization`。
