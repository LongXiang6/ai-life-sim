# 生产日志与叙事起句验收

文档角色：acceptance
权威层级：A5
状态：active
体系路径：project > acceptance > production-observability-and-narrative-opening
上级目标：让生产问题可按来源快速定位，并降低年度叙事的模板化起句频率
下级组成：服务器现状基线、日志安全与关联回归、四轮真实模型起句评测、发布后验证
适用范围：`ai-call-observability`、客户端诊断日志、主叙事 Prompt `4.1.0`
拥有者：`src/core/logger/`、`src/app/api/proxy/route.ts`、`src/app/api/log/route.ts`、`src/app/api/debug-log/route.ts`、主叙事 Prompt
最后验证：2026-07-19；本地 focused gates、DeepSeek 官方四轮评测与生产只读检查
取代关系：none
运行真源：生产 PM2/Nginx、`AI_LOG_DIR`、服务端日志实现与主叙事 Prompt
验收证据：本文命令与结果；发布后证据待同任务补齐

## 1. 原始反馈与预期

1. 服务器项目和日志系统是否运行不明确；PM2 输出目录看不到对话和错误。
2. 每轮完整请求、响应、错误与本地 AI 调试信息应在服务器持久保存，但 API Key、Authorization、Cookie、密码和 Token 不得保存。
3. 诊断证据应按服务器识别的来源 IP 分类，并能按 IP 或请求 ID 查询。
4. 四轮测试中三轮以“这一年”开头；年度叙事应使用具体场景起句，确需时间锚时使用当前明确纪年。

## 2. 生产只读基线

检查时间：2026-07-19，北京时间。

- PM2 `ai-life-sim`：`online`；Node.js 20；监听 `127.0.0.1:3000`。
- 回环 3000、Nginx 配置和公网 HTTPS：首页均通过。
- PM2 stdout/stderr：两个文件均为 0 字节，不能代表 AI 诊断是否运行。
- 专用日志：`/var/log/ai-life-sim` 正在持续写入；另有旧 `/root/ai-life-sim-logs` 历史目录。
- 当日样本：105 条代理访问、212 条 trace、10 条客户端事件、5 个不同来源；94 次 200、1 次 400、3 次 401、7 次 499。
- 完整性：104 个响应事件中 100 个含完整响应正文；4 个无正文事件均为客户端取消。已检索 trace，未发现未脱敏 Bearer 或 `sk-` 形式 Key。
- 当前可见异常：托管通道曾出现 401；存在客户端主动/超时取消；客户端另上报过若干 504，但旧客户端事件没有来源 IP 和请求 ID，关联不足。

## 3. 实现验收

| 检查块 | 命令或证据 | 结果 |
|---|---|---|
| 日志来源与秘密脱敏 | `npm run test:ai-proxy` | 通过；可信 IP 优先级、IPv4/IPv6 来源 ID、`customKey`/Token 等递归脱敏通过 |
| Prompt 协议 | `npm run test:narrative-protocol` | 通过；Prompt `4.1.0` 与中文协议保持一致 |
| Prompt 装配 | `npm run test:prompt-wiring` | 通过；三层消息与缓存顺序未漂移 |
| 剧情完整性 | `node scripts/check/domains/narrative/no-hard-truncation-audit.mjs` | 通过；日志和起句修复未引入剧情硬截断 |
| 类型与静态质量 | `npm run lint`、`npx tsc --noEmit` | 通过 |
| 本地生产路由 | Next production server + `/api/log`、`/api/debug-log`、拒绝型 `/api/proxy` 探测 | 写入均成功；生产 GET 日志为 403；400 响应含请求 ID |
| 来源分类 | 同时提交 `X-Real-IP` 与不同的 `X-Forwarded-For` | 只记录可信 `X-Real-IP`；建立对应来源目录；伪造 forwarded 值未写入 |
| 原始文件脱敏 | 在结构化字段和 raw 文本中放入专用假 Key | 首轮探测暴露独立文本文件未走脱敏的缺口；修复拥有者后复测，11 个生成文件中假 Key 为 0，`[REDACTED]` 标记存在 |

## 4. DeepSeek 官方四轮起句评测

命令：`npm run test:narrative-opening:live`

固定条件：官方 `deepseek` Provider、`deepseek-v4-flash`、Prompt `4.1.0`、同一潮汐群岛角色与调查主线、连续四个年度回合、上一轮正文进入下一轮记忆。

| 轮次 | 起句方式 | “这一年/这一月/这一天”起句 | 与前轮同构起句 | 耗时 | finish reason |
|---|---|---|---|---:|---|
| 1 | 具体动作与物件 | 否 | 否 | 17.7s | stop |
| 2 | 手部动作与逼近脚步 | 否 | 否 | 11.0s | stop |
| 3 | 开柜动作与新线索 | 否 | 否 | 18.7s | stop |
| 4 | 声音、取工具与现场冲突 | 否 | 否 | 15.4s | stop |

结论：四轮中泛指时间套语起句为 `0/4`，重复起句为 `0/4`。该结果证明本次固定样本已消除原反馈中的高频模式；它不等于所有模型采样永不出现类似措辞，后续继续以真实玩家日志监测频率。

## 5. 发布后验证

待部署后补充：统一日志目录、旧目录迁移、按来源索引生成、客户端 request ID 关联、运维查询命令、线上秘密扫描、PM2/回环/Nginx/HTTPS/版本与新增错误日志。
