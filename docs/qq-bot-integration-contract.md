# QQ Bot 联动接口契约

文档角色：architecture
权威层级：A3
状态：active
体系路径：project > data-lifecycle > shared-qq-community > bot-adapter
上级目标：让主项目与 QQ 群机器人共享已验证身份和积分，同时隔离账号私密数据
下级组成：HMAC 请求认证、账号公开投影、QQ 绑定、积分事务、项目状态投影
适用范围：`/api/integrations/qq-bot/*` 与后续 QQ Bot 调用方
拥有者：AI Life Sim 主项目 `core/account`
最后验证：2026-07-21；账号云专项回归、签名重放与积分事务测试
取代关系：none
运行真源：`src/core/account/qq-bot-integration.ts`、`src/core/account/qq-points-service.ts` 与对应 API routes
验收证据：`npm run test:account-cloud`、`npx tsc --noEmit`
TreeId：DATA
NodeId：shared-qq-community
ParentNodeId：data-lifecycle
存储权威：database
跨树关系：projects-to UX account；consumed-by RUN external QQ Bot；verified-by QUAL account-cloud

## 1. 所有权和安全边界

1. 主项目与 QQ Bot 共享同一个 SQLite 业务真源；默认生产路径为 `/var/lib/ai-life-sim/accounts.sqlite`。
2. 只有主项目 Next.js 进程和主项目清理器可以直接打开数据库。QQ Bot 不得导入 SQLite 文件、复制数据库、执行 SQL 或读取主项目表。
3. QQ Bot 只调用 `http://127.0.0.1:3000/api/integrations/qq-bot/*`。Next.js 直连时可能自动补充转发头，因此接口允许 `x-forwarded-for` 与 `x-real-ip` 中仅包含 `127.0.0.0/8`、`::1` 或 IPv4-mapped 回环地址；任一转发链成员不是回环地址即拒绝。公网域名或 Nginx 请求会包含真实公网来源，不能调用这些接口。
4. Bot 可读取项目版本、自己的已绑定账号公开状态、天赋/战绩数量与积分；不可读取密码、会话、API Key、设置、角色设定、天赋内容、战绩内容、存档、故事、Prompt、日志或诊断内容。
5. Bot 必须从可信 OneBot 事件取得请求者 QQ 和群号。普通命令不得接受玩家在文本中伪造另一个 QQ；积分调整只能由 Bot 已有管理员/系统事件权限触发。
6. `QQ_BOT_INTEGRATION_SECRET` 在主项目和 Bot 运行环境中配置为同一个独立的 32 字符以上随机秘密。不得与账号加密密钥、OneBot Token 或管理员 Token 复用或写入日志。

## 2. 请求签名

每次请求生成一个 16-64 字符、只含 `A-Za-z0-9_-` 的随机 nonce。时间戳使用 Unix 秒，并要求服务器时钟差不超过 300 秒。

请求头：

```text
x-ai-life-bot-timestamp: <unix-seconds>
x-ai-life-bot-nonce: <random-nonce>
x-ai-life-bot-signature: <lowercase-hex-hmac-sha256>
```

签名原文严格为以下五行，不追加结尾换行：

```text
timestamp
nonce
METHOD
pathname
sha256(rawBody)
```

- `METHOD` 转为大写。
- `pathname` 只使用 URL pathname，例如 `/api/integrations/qq-bot/points`；联动接口不使用 query 参数。
- `rawBody` 是实际发送的 UTF-8 原始请求体。必须先序列化一次，再对同一字符串签名和发送；不得签名后重新格式化 JSON。
- GET 项目状态的 `rawBody` 是空字符串。
- `sha256(rawBody)` 和最终 HMAC 都使用小写十六进制。
- 服务端在签名通过后持久化 nonce 摘要；十分钟内重放同一 nonce 会返回 401。
- JSON 请求体最大 4096 字节。

伪代码：

```text
rawBody = JSON.stringify(payload) or ""
bodyHash = sha256Hex(rawBody)
canonical = timestamp + "\n" + nonce + "\n" + upper(method)
  + "\n" + pathname + "\n" + bodyHash
signature = hmacSha256Hex(QQ_BOT_INTEGRATION_SECRET, canonical)
```

## 3. 通用响应

成功响应均为 JSON，并带 `Cache-Control: no-store`。失败响应统一为：

```json
{
  "error": "可安全显示的中文错误",
  "code": "stable_error_code"
}
```

调用方按 HTTP 状态和 `code` 分支，不解析中文文案。401 通常表示签名、时钟或 nonce 重放；403 表示转发链包含非回环来源；409 表示业务冲突；429 表示频率限制；503 表示主项目或联动秘密未就绪。

## 4. 项目状态

`GET /api/integrations/qq-bot/project-status`

请求体为空。响应：

```json
{
  "project": "AI Life Sim",
  "version": "5.2.4",
  "latestUpdates": ["最近一条玩家更新"],
  "capabilities": {
    "optionalAccount": true,
    "cloudSync": true,
    "verifiedQqBinding": true,
    "sharedPoints": true
  }
}
```

建议命令：`/游戏进度`。

## 5. 账号绑定与公开状态

QQ 使用 5-12 位非零开头数字。Bot 必须使用当前消息发送者 QQ。

### 5.1 绑定

`POST /api/integrations/qq-bot/bind`

```json
{ "qq": "123456789", "code": "ABCDE-23456" }
```

绑定码由登录后的玩家在 `/account` 生成，十分钟有效且仅能成功使用一次。成功响应：

```json
{
  "linked": true,
  "account": {
    "linked": true,
    "username": "玩家名",
    "linkedAt": 1780000000000,
    "lastActiveAt": 1780000000000,
    "scheduledDeletionAt": 1782592000000,
    "reincarnationTalentCount": 2,
    "gameRecordCount": 5,
    "pointsBalance": 18
  }
}
```

建议命令：`/绑定游戏 <code>`。

### 5.2 查询自己的账号

`POST /api/integrations/qq-bot/account-status`

```json
{ "qq": "123456789" }
```

未绑定：

```json
{ "linked": false }
```

已绑定时返回与绑定成功相同的 `account` 投影。建议命令：`/我的游戏账号`。

### 5.3 解绑

`POST /api/integrations/qq-bot/unbind`

```json
{ "qq": "123456789" }
```

```json
{ "unlinked": true }
```

重复解绑返回 `false`。Bot 应在自身交互层要求明确确认，建议命令：`/解绑游戏 确认`。

## 6. 共享积分

所有积分操作使用 `POST /api/integrations/qq-bot/points`。积分账户按 QQ 全局唯一；群号只用于成员投影和群排行榜。签到按 `Asia/Shanghai` 日期全局计算，同一 QQ 在不同群重复签到不会重复得分。

`groupKey` 为 5-20 位非零开头数字。`qq` 始终是当前操作发起者。Bot 在转账前负责验证目标确实属于当前群。

### 6.1 签到

```json
{ "operation": "checkin", "qq": "123456789", "groupKey": "123456" }
```

```json
{
  "operation": "checkin",
  "repeated": false,
  "localDate": "2026-07-21",
  "streak": 3,
  "pointsAwarded": 1,
  "balance": 12
}
```

### 6.2 余额

```json
{ "operation": "balance", "qq": "123456789", "groupKey": "123456" }
```

```json
{ "operation": "balance", "balance": 12, "totalEarned": 19 }
```

`totalEarned` 表示累计正向入账，不等于当前余额。

### 6.3 群排行榜

```json
{
  "operation": "leaderboard",
  "qq": "123456789",
  "groupKey": "123456",
  "limit": 10
}
```

```json
{
  "operation": "leaderboard",
  "items": [
    { "qq": "123456789", "balance": 12, "totalEarned": 19 }
  ]
}
```

`limit` 可选，范围 1-20，默认 10。

### 6.4 转账

```json
{
  "operation": "transfer",
  "qq": "123456789",
  "targetQq": "987654321",
  "groupKey": "123456",
  "amount": 5,
  "idempotencyKey": "onebot-message:123456:998877"
}
```

```json
{ "operation": "transfer", "senderBalance": 7, "recipientBalance": 25 }
```

`amount` 为 1-1,000,000 的整数，不能转给自己，余额不得变为负数。

### 6.5 系统调整

```json
{
  "operation": "adjust",
  "qq": "123456789",
  "groupKey": "123456",
  "delta": 10,
  "reason": "活动奖励",
  "idempotencyKey": "event:summer-2026:123456789"
}
```

```json
{ "operation": "adjust", "balance": 22 }
```

`delta` 为 -1,000,000 到 1,000,000 的非零整数。普通玩家命令不得直接触发本操作。

## 7. 幂等和重试

1. `transfer` 与 `adjust` 必须提供 8-128 字符的业务幂等键，只允许 `A-Za-z0-9:_-`。
2. 推荐从不可变 OneBot 消息 ID、活动 ID 或订单 ID 构造，不使用随机重试次数。
3. 相同幂等键、相同操作和相同业务参数可安全重试，并返回第一次事务结果。
4. 相同幂等键若改了金额、目标、群、原因或 QQ，返回 HTTP 409、`idempotency_conflict`。
5. 幂等结果保留 90 天。调用方收到网络超时后应使用原键重试，不得生成新键。
6. `checkin` 由 QQ 与上海日期自然幂等，不接收业务幂等键。

## 8. Bot 接线清单

1. 配置 loopback base URL 和 `QQ_BOT_INTEGRATION_SECRET`，校时并实现统一签名客户端。
2. 将 `/游戏进度`、`/绑定游戏`、`/我的游戏账号`、`/解绑游戏` 接到对应端点。
3. 将签到、余额、排行榜、转账和管理员积分调整全部接到共享积分端点。
4. 停止 Bot 自身农场/修仙等模块直接维护另一份共享积分表；Bot 可保留玩法状态，但积分余额只认主项目 API。
5. 对 401、403、409、429、503 提供明确但不泄露签名材料的群内提示。
6. 不修改或读取主项目账号私密表；新增天赋交易时先扩展主项目白名单事务 API，再由 Bot 调用。
