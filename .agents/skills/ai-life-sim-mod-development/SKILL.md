---
name: ai-life-sim-mod-development
description: 用于用户要求的 AI 人生模拟器 MOD 清单、注册、生命周期、子系统或公共 API 变更。
---

# AI 人生模拟器 MOD 开发

## 目标

让 MOD 以公司式金字塔中的部门身份承接核心模拟任务，拥有清晰的公共边界、生命周期、子系统职责、业务状态和结果回报。

## 适用范围

- MOD 清单、Manifest、注册、生命周期、子系统、公共 API、依赖和运行时活动成员。
- MOD 行为必须通过声明的公共边界和生命周期到达；要求启用运行时行为时，完成注册并使其进入活动成员表。
- 读取系统树的目标章节；涉及编排、活动子系统或回合提交时追加核心模拟目标章节。

## 执行契约

- MOD 生命周期和可复用运行流程必须遵循全局 `prepare -> ready -> execute -> transition -> finalize` 契约；具体节点、依赖、业务状态码和故障接收者写在所属活动权威与实时源。
- `src/core/execution/execution-flow-registry.ts` 是流程登记唯一所有者；新增或修改 MOD 生命周期、回合、世界初始化或子系统推进时，真实入口必须消费登记项，并通过 `npm run check:execution` 门禁。
- 加载器、代码生成器和公共执行器自动完成注册、接线、拓扑、排队、状态码校验和生命周期收束；自动化不替 MOD 决定业务规则，也不建立第二状态所有者。
- 标识、文件、格式、写法和排序按 [项目标准化契约](../ai-life-sim/references/standardization.md) 执行；生成文件只由声明和生成器维护。

## 权威与实时源

- Manifest：所属 `manifest.ts` 与 `src/foundation/types/mod.types.ts`。
- 依赖解析：`src/core/mod-loader/dependency-resolver.ts`。
- 生命周期：所属 `_internal/control.ts`。
- 活动成员：`src/mods/mod-engine/helpers/mvp-stages-config.default.json`。
- 自动接线：`scripts/codegen/generate-mod-wiring.mjs` 与生成目标。
- 系统层级、标识与命名：`ai-life-sim/docs/authority/system-tree.md`。

## 边界

- 通过已声明的公共入口使用其他 MOD，不新增私有深层导入或第二状态所有者。
- MOD 拥有本部门业务状态和结果；核心模拟只负责跨部门发令、依赖汇合和终态发布，不越权写入 MOD 私有状态。
- 每项职责只保留一个活动所有者；被替代的入口、注册、调用和状态写入必须在同一任务删除，不保留兼容层、旁路或并行真源。
- 现有公共或持久标识没有实际冲突时不做批量重命名；新建或本次修改的标识遵循系统树命名表。

## 验收

- MOD 或 Manifest 变更至少运行 `npm run check:structural` 和 `npm run check:mod`。
- 生命周期、活动成员、执行图或诊断契约变更追加 `npm run check:execution`。
- 完成注册、接线、旧入口清理和测试后，运行 `npm run check:standardization` 确认文件、命名、格式、生成标记和唯一归属符合项目契约。
