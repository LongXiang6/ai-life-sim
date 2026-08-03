# 生产部署恢复

仅在部署失败、存在未决状态或用户明确要求生产代码回滚时读取；恢复只使用 [production-deploy.ps1](../scripts/production-deploy.ps1) 的 `recover` 模式。

## 状态处理

| 状态 | 处理 |
|---|---|
| `DEPLOY_LOCK_TIMEOUT` | 未进入临界区；从部署编号 1 用新计划和 GUID 重做。 |
| 上传、哈希或语法失败 | 活动版未变；脚本清理已知临时输入，从部署编号 1 重做。 |
| `DEPLOY_PREREQUISITE_MISSING` 且无状态文件 | 修复输出点名的生产命令，再从部署编号 1 重做；其他无状态且无法收口的失败禁止猜测或重试。 |
| `DEPLOY_INPUT_INVALID` | root-owned 归档或 recovery 快照权限、身份或哈希不一致；活动版未变，保留状态并用新 GUID 重做。 |
| `BLOCKED_UNRESOLVED` | 先运行状态发现，不得重跑部署。 |
| `ACTIVE_CHANGED` | 等锁期间活动版变化；从部署编号 1 重新解析。 |
| `ACTIVE_RELEASE_INVALID` | 活动目录、提交标记、环境文件或单元材料不完整；停止并报告生产身份损坏。 |
| `ACTIVE_PERSISTENCE_PATHS_INVALID` | 保留活动发布和原数据，完成专用无损迁移后重新计划。 |
| `ACTIVE_UNHEALTHY` | 新目录创建前旧版固定健康检查失败；停止并进入明确授权的生产修复任务。 |
| `RELEASE_EXISTS` | 目标 40 位目录已存在且不是 no-op；不得由部署任务删除。 |
| `PREACTIVATION_FAILED_UNCHANGED` | 创建本次发布目录前失败，活动版未切换。 |
| `PREACTIVATION_CLEANUP_OK` | 激活前失败；不完整发布和备份已清理，活动版未变。 |
| `ROLLBACK_OK` | 静默或切换后失败，但旧软链接、PM2、systemd 和健康已恢复；备份保留。 |
| `RUNNING_*`、`ROLLBACK_FAILED`、退出码 `86` | 禁止部署和手工删除，只执行 recovery。 |
| `RECOVERY_LOCK_TIMEOUT` | 未执行恢复；重新发现，仍为同一唯一未决状态时可重试相同 `run_id`。 |
| `RECOVERY_PREREQUISITE_MISSING` | 修复点名命令，重新发现后仅在同一状态仍唯一时重试。 |
| `RECOVERY_ROLLBACK_FAILED` | recovery 已失败；保留全部现场，禁止循环重试或新部署。 |

## 唯一恢复入口

不确定未决 GUID 时，先在同一远端锁下只读发现全部状态：

```powershell
$DeployTool = 'D:\AI\ai-life-sim\.agents\skills\ai-life-sim\scripts\production-deploy.ps1'
& $DeployTool recover
```

只有恰好一个合法 `RUNNING_*` 或初次 `ROLLBACK_FAILED` 且 `UNRESOLVED_COUNT=1` 时，才代入其 32 位 `run_id`：

```powershell
& $DeployTool recover -InterruptedRunId '<32位未决发布GUID>'
```

多个未决状态、`RECOVERY_ROLLBACK_FAILED`、`CORRUPT`、schema 或脚本快照不匹配都是真实阻塞；禁止猜测顺序、逐个尝试、编辑状态或删除 root-only 文件。

Recovery 执行该轮状态绑定的 root-only 脚本快照，在同一锁下确认全局唯一未决状态、活动版属于 `{expected_previous, release}` 且哈希匹配。无迁移发布随后恢复旧软链接、systemd 和 PM2；邮箱 Schema v5 发布若已进入备份后阶段，则先再次停止写入、归档当前 v5 数据库并恢复部署前 v4 备份；游戏记录字段迁移则归档当前账号库和玩家内容库，再恢复部署前双库备份；日志冷热库迁移会从旧版环境唯一解析实际日志热库，归档候选热库与归档库，再恢复部署前热库，并按备份中是否存在旧归档库精确恢复或移除候选归档库。只有固定健康检查通过后才删除失败的新发布并写入 `RECOVERY_ROLLBACK_OK`；健康失败输出稳定的 `RUNTIME_CHECK_FAILED check=<标识>`，不得用该诊断替代状态文件终态。恢复失败保留原状态，数据库基线与迁移现场归档始终保留。

通用 recovery 只处理状态中明确记录的 `player-mailbox-v5`、`game-record-lifespan-adjustments` 或 `log-archive-v1` 专用恢复，不推断其他持久化迁移。其他迁移必须先接入并验证自己的数据恢复或明确丢弃流程；无法证明旧版完整健康时保留旧版、新版和备份现场并报告，`RECOVERY_ROLLBACK_OK` 后从部署编号 1 创建全新计划。
