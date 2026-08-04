# 开发检查

仅在修改或交付 `D:\AI\ai-life-sim` 下的文件时读取。

## 命令

在 `D:\AI\ai-life-sim` 中运行：

```powershell
npm run check
npm run check:standardization
npm run check:structural
npm run check:execution
npm run check:mod
npm run check:ui
npm run gate-check:quick
npm run gate-check
npm run lint
npx tsc --noEmit
```

`npm run dev` 只用于需要真实页面交互或浏览器路径的开发验证。它是持续运行的开发服务器：确认就绪后再执行浏览器检查，并只停止本任务启动的进程；已经存在的服务器不得擅自停止。该命令不属于正式部署命令序列，也不能作为发布前门禁或生产健康检查。

## 选择范围与风险匹配的检查

- TypeScript 应用变更：运行 `npm run lint` 和 `npx tsc --noEmit`。
- 完整交付检查运行 `npm run check`；当前依次覆盖 wiring、loader、mod、calibration、narrative 和 ui 六个域。
- MOD、`core/`、`foundation/`、Manifest 或架构边界：运行 `npm run check:structural`；涉及 MOD 行为或注册时再运行 `npm run check:mod`。
- Skill、权威文档、治理配置、命名、格式、排序、生成文件或目录归属变更：先运行 `npm run check:standardization`；该检查已接入 structural、quick、refactor、full 和 gate-check。
- 执行流、生命周期、世界初始化、子系统推进或诊断契约变更：先运行 `npm run check:execution`；它会验证中央流程登记、真实执行图五阶段、状态码、依赖祖先、唯一终态、生成接线漂移、事故样本和周期复盘时限。
- `check:mod` 只对当前 `mvp-stages-config.default.json` 中的活动子系统执行严格运行契约；未激活子系统保留告警，Manifest、公共边界和生成接线仍检查全部 MOD。
- UI 变更：运行对应页面或流程检查及 `npm run check:ui`。
- 独立且低风险的应用变更：最后运行 `npm run gate-check:quick`。
- 大范围、跨领域、架构或持久化的本地交付变更：最后运行 `npm run gate-check`。
- 正式生产发布不从本节追加检查。按 [生产部署](production-deployment.md) 调用 Skill 自带的 `scripts/production-deploy.ps1`；该入口只覆盖、构建并重启，不运行本节门禁。
- 无关的既有失败按基线失败报告，不把部分通过描述为全部通过。

不因为存在任务就新增无关测试或运行大范围 Agent 评测。检查范围必须足以证明用户要求的结果；风险匹配用于普通开发任务开始时从既有检查中选择范围，不因执行中发现的风险、差异或疑点动态扩大。

## Git 边界

- 交付前检查 `D:\AI` 和 `D:\AI\ai-life-sim` 两个工作树。
- 保留无关的未提交工作，不得回退。
- 不自动暂存、提交、推送、发布或部署。只有用户明确要求，或明确要求的发布离不开相应提交时才执行。
- 仅修改 Skill 时，用 `skill-creator/scripts/quick_validate.py` 验证变更的 Skill 目录并运行 `git diff --check`；无需运行应用门禁。
