# 零基础值创建链验收

文档角色：acceptance
权威层级：A5
状态：active
体系路径：project > player-flow > new-life-lifecycle > zero-base creation
上级目标：删除玩家手动加点，让四项基础属性从零开始并只接受后续叙事结构化变更
下级组成：零值常量、命格确认交接、命运预览复核、正式开局归零、旧地址兼容跳转
适用范围：新人生创建流程、`character-base`、`talent-draw`、`fate-preview` 与旧 `/attribute-alloc`
拥有者：mod-character 与 mod-pages
最后验证：2026-07-20；创建链、隔离、UI 与 TypeScript 回归
取代关系：取代历史属性分配页面和 30 点预算验收结论
运行真源：`src/mods/mod-character/constants.ts`、`src/mods/mod-character/subsystems/character-base-system.ts`、`src/mods/mod-pages/pages/talent-draw/page.tsx`、`src/mods/mod-pages/pages/fate-preview/page.tsx`
验收证据：`npm run test:creation-first-narrative`、`npm run test:new-life-isolation`、`npm run check:ui`、`npx tsc --noEmit` 与交付关闸

## 1. 结论

活动创建流程已从八步收敛为七步：命格确认后直接进入命运预览，不再出现属性预算、加减点、平均分配或剩余点数确认。四项基础属性在新人生交接和正式开局两个边界都强制为零，避免旧草稿或旧页面状态回流。

零值只约束 `character-base.base` 的新人生起点。随机命格、种族基准、伤病、衰减和上下文来源继续通过独立修正值聚合，因此玩家在预览中看到的最终值可以不为零。

## 2. 验收矩阵

| Case | 结果 | 证明内容 |
|---|---|---|
| 单一零值常量 | 通过 | `ZERO_BASE_ATTRIBUTES` 同时覆盖体魄、心智、悟性和魅力，避免页面各自维护初始值 |
| 新系统默认值 | 通过 | `character-base` 创建与重置后的四项基础值均为零 |
| 命格确认交接 | 通过 | 选满三条普通命格后写入零基础值并直接导航到 `/fate-preview` |
| 正式开局防残留 | 通过 | 命运预览确认开始人生前再次写入零基础值，旧创建草稿不能保留手动值 |
| 修正值独立 | 通过 | 命格、种族和其他合法 modifier 不被归零，并继续参与最终属性聚合 |
| 叙事后续变化 | 通过 | 四项基础属性仍由主叙事结构化增量经 `character-base` 校验、钳制、提交与持久化 |
| 旧地址兼容 | 通过 | `/attribute-alloc` 只在 Store 水合后跳转到 `/fate-preview`，不含预算或状态写入逻辑 |
| 活动 UI 流程 | 通过 | 创建页步骤、原型 flow、帮助说明和 UI 回归均使用七步链路；历史原型保留为 A6 证据 |
| 新人生隔离 | 通过 | 新人生清理当前生命的创建草稿和基础状态，不删除独立存档、设置、诊断编号或跨人生神话库 |

## 3. 不变边界

1. 删除的是玩家手动加点能力，不是四项基础属性系统本身。
2. AI 只能提交已登记的四项增量字段，不能绕过 owning subsystem 直接替换整个角色状态。
3. 气运、善恶和寿命不成为新的可分配属性，也不借“资源”等旧名称重新引入预算。
4. 旧存档恢复继续遵循现有严格校验；本改动不批量重写历史存档中的既有角色数值。

## 4. 玩家路径

```text
角色创建 -> 命格抽取 -> 命格选择 -> 命运预览 -> 开始人生
```

命运预览负责展示零基础值与独立修正后的结果。玩家的数值成长或下降从第一轮叙事开始，由 AI 的合法结构化指令实际影响对应系统。
