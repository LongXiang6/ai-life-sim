# 结构化诊断日志 v2 验收

文档角色：acceptance
权威层级：A5
状态：active
体系路径：project > simulation-runtime > platform-services > diagnostic logging and player feedback
上级目标：在不保存凭据和稳定设备标识的前提下，以六位玩家编号快速还原玩家问题，并降低重复长文本的存储开销
下级组成：固定字段 JSONL、SHA-256 gzip 内容库、玩家与 IP 索引、反馈提交引用、会话环境快照、运维查询器
适用范围：AI 代理日志、客户端事件、调试记录、玩家反馈诊断包和 `/var/log/ai-life-sim`
拥有者：core logger、app API routes 与运维查询脚本
最后验证：2026-07-20；确定性日志、玩家编号、反馈整包与查询器回归
取代关系：补充 `docs/playtest-2026-07-19-production-observability-opening.md` 的日志 v2 存储结论
运行真源：`src/core/logger/server-log-store.ts`、`src/app/api/proxy/route.ts`、`src/app/api/log/route.ts`、`src/core/logger/player-feedback-store.ts`、`scripts/ops/inspect-ai-logs.mjs`
验收证据：`npm run test:ai-proxy`、`npm run test:player-feedback`、`diagnostic-player-code-smoke.mjs`、`ai-proxy-observability-regression.mjs` 与交付关闸

## 1. 结论

日志 v2 以固定字段 JSONL 保存可筛选元数据，以内容引用保存完整长文本。相同脱敏内容只写入一个 SHA-256 命名的 gzip 对象，AI Prompt、响应、近期完整故事和反馈诊断包不会因为压缩或索引而被字符裁剪。六位玩家诊断编号、请求 ID、来源 IP 和反馈 ID 均可指向同一批记录。

该结构不是为每名玩家创建独立数据库。当前数据量和只追加诊断场景下，统一内容库加紧凑索引比大量小数据库更节省文件句柄、迁移和清理成本，同时仍能按玩家编号直接定位。

## 2. 验收矩阵

| Case | 结果 | 证据 |
|---|---|---|
| 固定字段行表 | 通过 | 日志行使用 `schemaVersion: 2` 和稳定诊断字段；长内容只保存引用、字符数与摘要字段 |
| 重复长文本 | 通过 | 相同完整文本两次写入得到相同 hash 与对象路径，读取后逐字恢复 |
| 压缩与完整性 | 通过 | 内容以 gzip 保存；查询器验证引用并在授权参数下还原完整内容 |
| 秘密与设备标识 | 通过 | API Key、Authorization、Cookie、Token、序列号和硬件 ID 在哈希前被脱敏；非秘密故事保持完整 |
| 六位玩家编号 | 通过 | 服务端原子分配大写字母与数字混合编号；Cookie 值稳定，客户端伪造头不能覆盖 |
| 多维索引 | 通过 | 全局、IP 与玩家目录保存紧凑引用；请求 ID 和反馈 ID 可继续关联 |
| 会话环境快照 | 通过 | 玩家接受当前诊断说明后，每个浏览器会话只提交一次非敏感环境快照并保存为内容引用 |
| 玩家反馈整包 | 通过 | 服务端先保存完整脱敏诊断包对象，再把同一 `submissionRef` 写入全局、IP 与玩家索引；失败时整包拒绝 |
| 默认运维查询 | 通过 | 默认输出不展开 Prompt、响应、故事或反馈正文；明确使用 `--include-content` 才还原脱敏内容 |

## 3. 存储与查询约束

1. `AI_LOG_DIR` 是唯一生产诊断根；应用发布目录切换不得移动或复制活动日志。
2. 日志目录和文件分别保持 `0700` 与 `0600`，默认保留 30 天、总量 10 GiB、单文件 64 MiB。
3. 内容对象按脱敏后的字节计算 SHA-256；重复对象复用并刷新访问时间，行表不重复保存正文。
4. 玩家编号只是诊断别名，不是账号、鉴权或设备指纹；编号占用记录不随普通日志清理而复用。
5. 运维优先使用 `--player-code`，再按请求 ID、反馈 ID 或 IP 缩小范围；只有诊断确实需要时才展开内容。

## 4. 故事数据完整性

- 近期窗口只选择完整叙事条目，不切割条目内正文、摘要、分支或结构化语义。
- 内容去重、gzip 和索引均为无损技术存储，不替代玩家本地故事与存档权威。
- 诊断保留期届满只清理运维副本，不得影响游戏 Store、存档、记忆或历史事件账本。

## 5. 发布后复核项

正式发布后复核生产 `AI_LOG_DIR` 唯一配置、目录权限、PM2 新增错误、玩家编号查询、内容默认不展开和 cleanup 行为。生产验证只记录统计与引用，不把玩家故事正文写入本文件。
