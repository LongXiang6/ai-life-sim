# 生产部署

仅在用户明确要求生产部署时读取。唯一入口是 [production-deploy.ps1](../scripts/production-deploy.ps1)；不得复制、拆分或临时改写脚本步骤，也不得绕过 `plan`、`execute`、`recover` 三种模式。计划锁定同一次字节快照中的三个脚本哈希，计划后脚本变化会拒绝继续。

固定顺序只有：创建部署溯源 -> 运行 `plan` -> 看到 `STOP` 后结束本次调用并完整审阅 -> 另一次调用运行 `execute` -> 只按状态文件判定成功或进入 [生产恢复](production-recovery.md)。不得串联 `plan` 与 `execute`；默认发布现有 `origin/main`，只有用户明确要求发布本地改动时才使用 `-PublishLocalHead`。本机 GitHub TLS 不可用但 `gh` 已认证时，入口先用 GitHub API 同步已存在的 `origin/main` 对象，只有对象缺失才回到 Git fetch；不得把 API 返回的凭据写入 Git 配置或日志。

## 部署不变量

- 将“部署主项目”“把主项目更新发布”“发布 main”等明确要求作为完整流程授权；授权包含发布离不开的显式提交与 `git push origin main`，不包含无关源码修改、重构、Nginx、TLS 或凭据变更。
- 第一个持久操作前按 `D:\AI\.agents\task-trace.md` 在 `D:\AI\ai-life-sim\.agents\traces` 创建部署溯源；`git fetch` 也必须在溯源后执行。
- 含糊的“部署主项目/main”只发布现有 `origin/main`。只有用户明确要求把本次本地路径一并发布时才使用本地提交分支，不顺带发布本地领先提交、未提交文件或其他 agent 已暂存内容。
- 每个模式开始时固定核对：`origin` 的 fetch/push URL 均为 `https://github.com/LongXiang6/ai-life-sim.git`；`tencent-vm` 解析为 `ubuntu@49.235.100.36:22`、使用 `D:\AI\.secrets\ssh\GPT.pem`，本机 `known_hosts` 含脚本锁定的生产 ED25519 指纹。任一身份变化都停止。
- 只发布 `origin/main` 上一个锁定的完整 40 位提交。新目录为 `/root/ai-life-sim-releases/<40位提交>`；既有 7 位目录只作为当前旧版和回滚目标兼容，不再创建。
- 唯一通用发布前门禁是 Node 20 下的 `npm ci` 与 `npm run gate-check`：锁定提交只在本地临时干净 worktree 执行一次。生产 Linux Node 20 对同一归档只执行 `npm ci`、环境校验、构建、迁移、切换和健康检查，不得用脏工作树、`npm run dev`、较小门禁或自选命令替代本地门禁。
- PowerShell 入口自动解析本地 Node 20；缺失时下载固定 `v20.20.2` Windows x64 包，校验脚本内 SHA-256 后缓存到 `%LOCALAPPDATA%\ai-life-sim-deploy\runtimes`，只在门禁进程中调整 PATH，不修改全局 Node 或 PATH。
- 生产切换由持有 `/run/lock/ai-life-sim-deploy.lock` 的单一远端脚本完成；锁覆盖未决状态扫描、解压、构建、备份、切换、重启、健康检查和失败回滚。
- 锁后先扫描 `/root/ai-life-sim-deploy-state`。既有 `RUNNING_*`、`ROLLBACK_FAILED` 或无法解析状态会阻塞新发布，必须先按生产恢复处理。
- 上传归档先用 SSH 用户临时名，再固化为 root 所有、`0600` 的锁内输入；远端解压前复核 SHA-256。每轮保存 root-only、哈希锁定的 recovery 脚本快照，`state_schema=2` 绑定该快照，中断后只执行产生状态的版本。
- 固定验收只检查活动提交、PM2 实际进程目录、两个 timer、运营面板、回环首页、新 `BUILD_ID` 清单和运营面板 `/api/stats`；失败时输出稳定的 `RUNTIME_CHECK_FAILED check=<标识>` 定位具体检查。普通发布不追加公网、TLS、Nginx、浏览器或日志检查。
- 通用流程短暂停止应用写入和账号清理 timer，对账号库与玩家内容库建立同一静默边界备份。账号及玩家核心数据禁止丢弃；其他旧版数据资源优先确定性迁移，确实无法迁移时可按用户长期授权明确抛弃，但必须由专用模式声明范围、证明不触及账号及玩家核心数据，并在状态中留下结果。无迁移发布不自动恢复数据库；候选改变生产持久化 Schema、执行迁移或使旧版无法读取新数据时，必须先有已验证并接入同一锁的专用迁移和数据回滚或明确丢弃流程，否则不得执行。
- `-ConfirmNoProductionPersistenceChange` 只适用于无持久化变化的候选。专用迁移开关包括邮箱 Schema v5 的 `-PlayerMailboxV5Migration`、游戏记录字段改名的 `-GameRecordLifespanAdjustmentMigration`，以及日志冷热库的 `-LogArchiveV1Migration`；计划和执行必须使用同一开关，且每轮最多一个。邮箱迁移显式执行并验证 v4 到 v5 升级；游戏记录迁移只重写 `breakthrough`、`breakthroughs`、`breakthroughCount` 三个精确结构位置，验证双库全部记录符合新契约；日志迁移额外备份实际 `AI_LOG_DB_PATH` 或 `AI_LOG_DIR` 所指热库及可选归档库，创建同 Schema 归档库、迁移并核验过期行，失败回滚先归档候选日志现场，再恢复部署前热库和原有归档库状态。其他 Schema、启动迁移或旧版读取能力变化仍须先实现并验证新的专用契约。
- `plan` 和锁内脚本要求 `NARRATIVE_MEMORY_DIR=/var/lib/ai-life-sim/narrative-memory`、`NARRATIVE_ROUND_LOG_DIR=/var/log/ai-life-sim/narrative-rounds` 各恰好一次，目录 root 所有且 `0700`，活动发布中的 legacy `.data/narrative-memory`、`.data/narrative-rounds` 不存在或为空且不是软链接；不满足时保留全部数据并先做专用无损迁移。

## 1. 创建溯源并确定来源

先创建部署溯源，再检查 `D:\AI` 和 `D:\AI\ai-life-sim` 两个工作树。保留无关改动，不使用 `git add -A`、stash、rebase、强推或回退清理工作树。

**部署现有远端 main**：

```powershell
$DeployTool = 'D:\AI\ai-life-sim\.agents\skills\ai-life-sim\scripts\production-deploy.ps1'
& $DeployTool plan
```

**把本次本地改动一并发布**：仅在用户明确要求时使用。先确保位于 `main`，按溯源中的准确路径完成需要的 [玩家版本记录](release-recording.md) 和提交；用 `git commit --only` 防止混入其他已暂存路径，不得原样执行占位符。

```powershell
Set-Location 'D:\AI\ai-life-sim'
git add -- <path-1> <path-2>
git diff --cached
git commit --only -m '<message>' -- <path-1> <path-2>

$DeployTool = 'D:\AI\ai-life-sim\.agents\skills\ai-life-sim\scripts\production-deploy.ps1'
& $DeployTool plan -PublishLocalHead
```

候选包含邮箱 Schema v5 时，计划阶段同时锁定专用迁移：

```powershell
& $DeployTool plan -PublishLocalHead -PlayerMailboxV5Migration
```

候选包含游戏记录寿命调整字段改名时，计划阶段锁定对应双库迁移：

```powershell
& $DeployTool plan -PublishLocalHead -GameRecordLifespanAdjustmentMigration
```

候选引入日志冷热库时，计划阶段锁定日志归档迁移：

```powershell
& $DeployTool plan -PublishLocalHead -LogArchiveV1Migration
```

本地分支与 `origin/main` 分叉时脚本停止，不隐式合并或改写历史。`origin/main..HEAD` 的每个提交和路径必须属于当前用户目标，本次应发布路径不得仍留在工作树。

## 2. 审阅并停止

`plan` 会 fetch、解析活动版并证明普通发布只向前推进。工作树检查只显示状态和路径；候选与生产差异先经过秘密文件名守卫，Git 审阅禁用 pager，然后输出提交列表、完整路径/统计/内容差异、不含秘密的临时 JSON 计划路径，以及 `PLAN_PATH`、`PLAN_SHA256`、`PRODUCTION_DIFF_SHA256`。

看到 `STOP` 后结束第一次调用。完整审阅差异是否触及 `src/core/account/`、`src/core/player-content/`、其他服务端持久化 Store、生产环境契约或启动迁移；任何疑似持久化影响都要求专用迁移、兼容和数据回滚证据，不得用确认开关跳过。记录同次输出的 `PRODUCTION_DIFF_SHA256`；换 agent 或上下文丢失且无法证明已审阅时，重新运行 `plan` 并审阅。

## 3. 执行锁定计划

只有完整差异确认不改变生产持久化 Schema、迁移和旧版读取能力时，才在独立调用中代入实际输出：

```powershell
$DeployTool = 'D:\AI\ai-life-sim\.agents\skills\ai-life-sim\scripts\production-deploy.ps1'
& $DeployTool execute `
  -PlanPath '<PLAN_PATH>' `
  -PlanSha256 '<PLAN_SHA256>' `
  -ReviewedDiffSha256 '<PRODUCTION_DIFF_SHA256>' `
  -ConfirmNoProductionPersistenceChange
```

`-ConfirmNoProductionPersistenceChange` 只陈述审阅结果，不授权忽略疑点。执行模式自动断言：

1. 计划字节、审阅 diff、Git/SSH 身份、三个脚本快照、`origin/main`、活动版和祖先关系不变，重新生成的完整二进制 diff 哈希一致。
2. 候选无 submodule、Git LFS 指针、会改变归档的 attributes 或受跟踪秘密文件名。
3. 本地 Node 20 在干净 worktree 中运行 `npm ci` 和 `npm run gate-check`，且门禁不改动受跟踪文件。
4. 本地候选只在远端仍等于计划起点时快进推送。
5. `git archive`、root-owned 归档、部署脚本和 recovery 快照哈希一致，远端锁内解压前复核归档。
6. 锁内确认旧活动版身份完整且健康，生产 Linux Node 20 安装锁定依赖、校验环境并构建。
7. 停止账号清理 timer、等待清理服务空闲、停止 PM2，并证明 PM2 无正 PID且 `3000` 无监听。
8. 静默边界内备份并 `quick_check` 两个 SQLite，原子切换软链接，更新 PM2/systemd 并执行固定健康检查。
9. 在 root-only 版本化状态中原子写入终态，并在同一锁下核对 schema、提交、发布目录、备份、归档和 recovery 哈希。

锁定计划为邮箱 Schema v5 时，不使用 `-ConfirmNoProductionPersistenceChange`，改为：

```powershell
& $DeployTool execute `
  -PlanPath '<PLAN_PATH>' `
  -PlanSha256 '<PLAN_SHA256>' `
  -ReviewedDiffSha256 '<PRODUCTION_DIFF_SHA256>' `
  -PlayerMailboxV5Migration
```

锁定计划为游戏记录寿命调整字段迁移时，改为：

```powershell
& $DeployTool execute `
  -PlanPath '<PLAN_PATH>' `
  -PlanSha256 '<PLAN_SHA256>' `
  -ReviewedDiffSha256 '<PRODUCTION_DIFF_SHA256>' `
  -GameRecordLifespanAdjustmentMigration
```

锁定计划为日志冷热库迁移时，改为：

```powershell
& $DeployTool execute `
  -PlanPath '<PLAN_PATH>' `
  -PlanSha256 '<PLAN_SHA256>' `
  -ReviewedDiffSha256 '<PRODUCTION_DIFF_SHA256>' `
  -LogArchiveV1Migration
```

唯一生产环境文件名是 `.env.production.local`。脚本只从锁内确认的活动发布用 `install -m 0600` 复制，不读取、打印或下载内容。构建时数据库、日志和资产指向新目录内的隔离临时数据；不启动 `3001` 旁路实例，不用本地 `node_modules` 代替 `npm ci`。

## 4. 成功判据

- `DEPLOY_OK`：候选已构建并切换，活动软链接与 `.release-commit` 匹配完整提交；PM2 `/proc/<pid>/cwd`、systemd 和三个回环检查全部通过。
- `NOOP`：候选已经是活动提交，并在锁内通过同一固定健康检查；不宣称重新构建、切换或创建数据库备份。

只有这两个状态算成功。任务溯源记录完整提交、旧/新发布目录、备份目录、两端 Node 20 门禁、PM2/systemd/回环检查及发生过的失败恢复；其他状态读取 [生产恢复](production-recovery.md)。
