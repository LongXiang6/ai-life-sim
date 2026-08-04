---
name: ai-life-sim
description: 所有 AI 人生模拟器任务首先使用；提供项目入口、跨领域事实和按需资料索引。
---

# AI 人生模拟器

## 目标

为 AI 人生模拟器任务提供唯一项目入口、跨领域事实和按需路由，让核心模拟、MOD、页面、Prompt、数据、生产和测试在同一套公司式金字塔与标准化契约下协作。

## 适用范围

- 应用根目录：`D:\AI\ai-life-sim`；产品是 AI 驱动的叙事人生模拟器。
- 所有项目任务先读取 `docs/authority-index.md`，再只读取当前目标命中的活动权威章节和实时源。
- 依赖方向为 `app -> mods -> core -> foundation`；运行时活动子系统以 `src/mods/mod-engine/helpers/mvp-stages-config.default.json` 为准，源码存在不代表已经激活。
- 玩家可感知结果以体验质量为主，兼顾文本质量、生成速度、操作直觉和低信息压力。

## 执行契约

- 核心模拟回合是项目运行时的总指挥：先确定本轮目标和上下文，再按公共契约委派给活动 MOD；MOD 在自己的边界内继续分派给子系统和组件，完成后逐级返回状态、结果和证据。
- 项目新增或改变的流程统一使用全局五阶段 `prepare -> ready -> execute -> transition -> finalize`；具体节点、业务码和依赖由活动权威持有。
- 活动执行流必须先消费 `src/core/execution/execution-flow-registry.ts` 的中央登记项；共享执行器、生成接线、诊断层级和发布门禁不得各自维护流程 ID 或 owner 副本。
- 自动接线、注册、依赖解析、排队、状态校验、快照和诊断由基础设施完成；业务计算、状态写入、持久化和结果解释始终归所属 MOD/子系统，页面与聚合器不成为第二所有者。
- 能够稳定描述的标识、所有者、阶段、依赖、顺序、状态码、输入输出和验收条件复用同一契约；无所有者、无引用、重复或被取代的机制在同一任务中清理。

## 权威与实时源

| 任务 | 读取 |
|---|---|
| 项目入口和活动权威路由 | `docs/authority-index.md` |
| 架构、所有权、系统演进、标识或数值边界 | [项目开发契约](references/project-development.md) |
| 系统或组件的阶段、依赖、运行顺序、状态码、异常反馈或结束条件 | [项目开发契约](references/project-development.md) 与对应活动权威 |
| 技能、文件、格式、命名、写法、排序和生成物 | [项目标准化契约](references/standardization.md) |
| 数据存储、选择、压缩、传递、容量或限长 | [数据完整性](references/data-integrity.md) |
| 修改或交付应用文件 | [开发检查](references/development-checks.md) |
| 应用行为、缺陷、版本号或玩家更新日志 | [版本记录](references/release-recording.md) |
| SSH、生产路径、日志诊断或账号存储 | [生产环境](references/production-environment.md) |
| 正式部署或更新生产代码 | [生产部署](references/production-deployment.md) |
| PM2、systemd、Nginx、端口、防火墙或 TLS | [生产服务](references/production-services.md) |
| 不确定生产操作分支 | [生产操作索引](references/production-operations.md) |

## 边界

- 本 Skill 只路由项目事实和可复用流程；当前运行机制只写入对应活动权威，不在 Skill 复制第二真源。
- 只读取目标命中的项目资料，不遍历同层 Skill、references、整棵权威树或历史文档。
- 变更系统、功能或运行策略时，同一任务同步更新唯一活动权威；替代实现必须完成入口、注册、调用、状态所有权和文档/测试引用的收口。
- 不保留兼容层、旁路、备用实现、双写双读或平行汇报链；发现残留立即清理并验证唯一所有者。

## 验收

- 修改 Skill 或其 reference 后运行对应目录的 Skill 校验和 `git diff --check`。
- 修改项目文件时按 [开发检查](references/development-checks.md) 选择检查，涉及标准化时固定运行 `npm run check:standardization`。
- 涉及执行流、生命周期、世界初始化、子系统推进或诊断契约时，追加 `npm run check:execution`；跨领域或持久化交付最后运行 `npm run gate-check`。
