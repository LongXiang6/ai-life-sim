# 生产环境与诊断

仅在用户明确要求 SSH、生产路径、日志诊断或账号存储操作时读取。

## 连接

| 项目 | 值 |
|---|---|
| SSH 别名 | `tencent-vm` |
| 主机 | `49.235.100.36` |
| 用户 | `ubuntu` |
| 私钥路径 | `D:\AI\.secrets\ssh\GPT.pem` |
| SSH 配置 | `C:\Users\龙祥\.ssh\config` |

```powershell
ssh tencent-vm
ssh tencent-vm "<command>"
scp <file> tencent-vm:<path>
```

操作 `/root`、`/var/lib`、`/var/log`、`/etc` 和系统服务时使用 `sudo`。绝不打印或提交凭据及环境文件内容。

## 生产路径

| 路径 | 用途 |
|---|---|
| `/root/ai-life-sim` | 活动软链接；使用 `sudo readlink -f /root/ai-life-sim` 验证 |
| `/root/ai-life-sim-releases/<commit>` | 不可变发布目录 |
| `/root/ai-life-sim-backups` | 小型运维回滚快照 |
| `/root/ai-life-sim-deploy-state` | root-only 部署状态；用于连接中断后的锁内结果核对 |
| `/var/log/ai-life-sim` | 生产诊断日志 |
| `/var/lib/ai-life-sim/accounts.sqlite` | 账号与云端设置数据库 |
| `/var/lib/ai-life-sim/player-content.sqlite` | 玩家内容、手动云存档及相关投影 |
| `/var/lib/ai-life-sim/narrative-memory` | 存档级叙事记忆 SQLite；必须通过 `NARRATIVE_MEMORY_DIR` 外置 |
| `/var/log/ai-life-sim/narrative-rounds` | 核心叙事逐轮原文；必须通过 `NARRATIVE_ROUND_LOG_DIR` 外置 |
| `/var/log/ai-life-sim/logs-archive.sqlite` | 明文日志自动归档库；前天及更早的主库行逐列核验并无损迁入，再清出 `logs.sqlite` |
| `/etc/nginx/sites-enabled/ai-mnrs.icu` | 当前 Nginx 站点 |
| `/etc/letsencrypt/live/ai-mnrs.icu` | Certbot 管理的证书链接 |

服务器发布目录不是 Git 仓库，不得用 `git pull` 替代发布流程。

## 诊断

```powershell
ssh tencent-vm "sudo node /root/ai-life-sim/scripts/ops/inspect-ai-logs.mjs --root /var/log/ai-life-sim --since-hours 24"
ssh tencent-vm "sudo node /root/ai-life-sim/scripts/ops/inspect-ai-logs.mjs --root /var/log/ai-life-sim --player-code <code> --since-hours 72"
ssh tencent-vm "sudo node /root/ai-life-sim/scripts/ops/inspect-ai-logs.mjs --root /var/log/ai-life-sim --ip <IP> --since-hours 72"
ssh tencent-vm "sudo node /root/ai-life-sim/scripts/ops/inspect-ai-logs.mjs --root /var/log/ai-life-sim --request-id <ID>"
```

用户明确要求诊断时，如确需完整且已经清洗的 Prompt、响应、故事或反馈内容，使用 `--include-content`。用户明确要求本身就是项目授权，不另设同意门禁。不得暴露日志或环境文件中的凭据。

生产日志使用 `AI_LOG_DIR=/var/log/ai-life-sim` 并完整保留。主库按“昨天与今天”保持可查询热窗，更早行由 `cleanupServerLogsNow` 自动迁入 `logs-archive.sqlite`；迁移先逐列核验，同 ID 不同内容时明确失败并保留主库原行。服务端查询、`inspect-ai-logs.mjs`、`analyze-ai-logs.mjs`、`feedback-status.mjs`、运营面板和数据查看器均联合读取热库与归档库并按 ID 去重，不提供永久清除入口。所有归档继续为明文 SQLite，不压缩、不覆盖、不截断；容量不足时扩大或转移存储。目录权限保持 `0700`，文件权限保持 `0600`。

## 账号存储

- `/var/lib/ai-life-sim` 保持 `0700`，SQLite 数据库及 WAL/SHM 保持 `0600`。
- 只保留一个有效的 `ACCOUNT_DB_PATH=/var/lib/ai-life-sim/accounts.sqlite` 和一个 `PLAYER_CONTENT_DB_PATH=/var/lib/ai-life-sim/player-content.sqlite`。
- `ACCOUNT_DATA_ENCRYPTION_KEY` 是仅服务器持有的 32 字节密钥。不得打印、提交、替换或复制进发布产物。
