---
name: ai-life-sim
description: 所有 AI 人生模拟器任务首先使用；提供项目入口、跨领域事实、权威顺序和按需资料索引。
---

# AI 人生模拟器

## 目标

[核心原则] 为 AI 人生模拟器任务提供唯一项目入口、跨领域事实和按需路由。

## 适用范围

[核心原则] 应用根目录为 `D:\AI\ai-life-sim`，产品是 AI 驱动的叙事人生模拟器。

[核心原则] 依赖方向为 `app -> mods -> core -> foundation`。

[核心原则] 运行时活动子系统以 `src/mods/mod-engine/helpers/mvp-stages-config.default.json` 为准。

[次要规则] 玩家可感知结果同时关注剧情质量、生成速度、操作直觉和低信息压力。

## 执行契约

[核心原则] 任何项目任务先读取 `docs/authority-index.md`，再加载目标命中的活动权威、项目 Skill、reference 和实时源。

[核心原则] 按 `D:\AI\AGENTS.md` 判断是否命中主项目运行代码门槛；命中时按任务溯源规范处理：新任务默认创建入口，只有用户明确点名接手未完成溯源或同一未结束任务轮次的修正、返工和追加才续写原文件。确认后先拆分阶段，再更新所属活动权威并实施正式修改。未命中门槛的文档、Skill、测试和不改变运行行为的整理直接执行。

[核心原则] 活动权威描述应达到的结果、效果、范围和边界。

[核心原则] Skill 描述实现方法、架构选择、执行步骤和验证方式。

[核心原则] 核心模拟委派活动 MOD，MOD 在所属边界内完成业务计算、状态写入和持久化。

[次要规则] 中央登记流程使用声明的阶段、所有者、依赖、顺序、状态码和故障接收者。

[次要规则] 普通函数、页面交互、单次服务调用和测试清单沿用所属模块现有控制流。

## 权威与实时源

| 任务 | 读取 |
|---|---|
| 项目入口与活动权威 | `docs/authority-index.md` |
| 架构、所有权与系统演进 | [项目开发契约](references/project-development.md) |
| 文件、Skill、格式与命名 | [项目标准化契约](references/standardization.md) |
| Prompt、调用、缓存与结构化输出 | [Prompt 工程 Skill](../ai-life-sim-prompt-engineering/SKILL.md) |
| 数据存储、压缩、容量与传递 | [数据完整性](references/data-integrity.md) |
| 修改与交付检查 | [开发检查](references/development-checks.md) |
| 版本与玩家更新记录 | [版本记录](references/release-recording.md) |
| 生产环境与部署 | 对应 `production-*.md` reference |

## 边界

[核心原则] 每项当前运行机制只在所属活动权威保存一份结果契约。

[核心原则] 每项稳定事实只保留一个所有者、一个命名源、一个公开契约和一个验收入口。

[次要规则] 被替代机制的入口、注册、调用、状态所有权和文档测试引用在同一任务完成收口。

[次要规则] 范围外文件、行为和未提交工作保持原状。

## 验收

[核心原则] 修改项目文件时按 [开发检查](references/development-checks.md) 选择检查。

[次要规则] 标准化变化运行 `npm run check:standardization`。

[次要规则] 执行流、生命周期、世界初始化、子系统推进或诊断契约变化运行 `npm run check:execution`。

[辅助说明] 跨领域或持久化交付按本次执行范围运行 `npm run gate-check`。
