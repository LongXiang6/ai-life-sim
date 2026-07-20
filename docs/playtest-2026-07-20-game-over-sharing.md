# 人生结算分享卡验收记录

文档角色：acceptance
权威层级：A5
状态：active
体系路径：project > player-flow > game-over > sharing
上级目标：让玩家愿意保存和主动分享一段已经完成的人生，同时保持事实忠实与秘密隔离
下级组成：结算事实投影、页面预览、Canvas 成图、Web Share、PNG 降级与状态反馈
适用范围：`/game-over` 的“留下此生”区域及本机分享输出
拥有者：`mod-pages` game-over composition
最后验证：2026-07-20；本地真实浏览器、Canvas 成图、UI 门禁、lint 与 TypeScript
取代关系：none
运行真源：`src/mods/mod-pages/pages/game-over/page.tsx` 与 `game-over-share-card.ts`
验收证据：本文第 4 节、`game-over-share-card-smoke.mjs`、`npm run check:ui`

## 1. 结果

结算页在现有“真实四维 → 人生三记 → 命格余响”之后增加“留下此生”。玩家可以预览由真实结算字段组成的卡片，一键调用系统图片分享，或直接保存 PNG。当前实现不新增 AI 请求、服务器接口、依赖、存档字段或模拟状态写入。

## 2. 方案一致性

```text
SelectedSource: docs/ui-prototypes/mobile/flow.html -> game-over/round-refactor-01-style-1.html
RuntimeTarget: src/mods/mod-pages/pages/game-over/page.tsx + GameOver.module.css
LockedComposition: 终章页眉 -> 角色概览 -> 真实四维 -> 人生记录 -> 命格余响 -> 底部返回/新人生
LockedContentAndControlOrder: 结算阅读先于神话封存，神话封存先于开启新人生
LockedInteractionAndStateMeaning: 四维选择、神话三选一、不可逆封存、新人生确认与守卫不变
AllowedResponsiveOrRuntimeAdaptations: PD-011 允许补充原型缺失的运行功能；PD-032 授权在命格余响后、底部操作前追加分享区域
MissingRuntimeOnlyContent: 本机成图、系统分享、PNG 下载、异步状态与隐私说明
ForbiddenChanges: 编造成就、上传故事、额外 AI、修改神话 Schema、阻塞新人生、改变现有结算状态
AcceptanceEvidence: 320—1280px 实际渲染、完整 PNG 检查、分享结果、控制台与自动门禁
```

既有运行页使用“人生三记”展示原始历史取样，而定版原型写作“人生三幕”。本轮没有扩大该既有差异；分享功能不读取这些故事正文，也不把取样内容写入图片。

## 3. 数据与隐私边界

分享数据只包含角色名、世界名、年岁、轮数、品性、四维、均分、稳定技术运行编号和当前神话命格。运行编号只用于生成安全文件名，不显示为玩家身份。输出不包含正文、摘要、Prompt、API Key、Provider 目标、诊断编号、日志、存档或设备信息。

Canvas 对选中的文本逐字测量并完整换行；高度按真实行数增长。四维为零时只显示空轨道，不绘制虚假的正值条。Web Share 不可用、`File` 不可用或文件分享检查失败时，统一降级到 PNG 下载。

## 4. 已观察证据

| 检查块 | 结果 | 证据 |
|---|---|---|
| 响应式 | 通过 | 320、360、375、390、430、768、1280px 均无横向溢出、按钮越界或低于 44px 的主操作 |
| 320px 徽标 | 通过 | 首次截图发现右侧徽标受挤压；改为可换行后 `scrollWidth === clientWidth`，徽标自身无内部溢出 |
| 768px 构图 | 通过 | 白纸、灰蓝、双列事实、神话区和双操作保持原有结算语言 |
| Canvas 成图 | 通过 | 实际生成 1080px PNG；首次检查发现页脚覆盖命格效果，改为按完整换行行数计算高度后复核无重叠 |
| 系统分享 | 通过 | 内置浏览器实际执行返回 `shared` |
| PNG 降级 | 通过 | 本地生成 `ai-life-sim-life-browser-preview.png`，文件 178322 字节；页面状态返回已保存 |
| 控制台 | 通过 | 本地预览路径无 error 或 warn；临时验证路由已从源码和 manifest 删除 |
| 自动检查 | 通过 | `game-over-share-card-smoke.mjs`、`npm run check:ui`、`npm run lint`、`npx tsc --noEmit` |

## 5. 执行顺序

| 节点 | Authority | RootPosition | Weight | Sequence |
|---|---|---|---|---|
| 事实忠实与隐私边界 | A1 | R0 | W5 | S1 |
| 结算页面组合与分享位置 | A2 | R1 | W4 | S2 |
| `game-over-sharing` 系统登记 | A3 | R1 | W4 | S3 |
| 页面、Canvas 与降级实现 | A4 | R2 | W4 | S4 |
| 响应式、图片和发布证据 | A5 | R3 | W4 | S5 |
