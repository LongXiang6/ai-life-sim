# 服务端托管免费体验通道验收

文档角色：acceptance
权威层级：A5
状态：active
体系路径：project > simulation-runtime > platform-services > managed-ai-default-channel
上级目标：让玩家无需先配置自己的 API Key 即可体验游戏，同时保证托管凭据不进入客户端或仓库
下级组成：公开 Provider 预设、设置默认与迁移、代理凭据选择、玩家自定义覆盖、部署环境
适用范围：欢迎页开始条件、模型调用设置、恢复默认、`/api/proxy` 与发布前 AI 实测
拥有者：core AI Provider 配置、mod-settings 与 app AI proxy
最后验证：2026-07-18；上游直连、完整 SSE 聚合、后台世界初始化、项目代理、浏览器真实首轮、完整门禁、生产构建与服务器发布验证通过
取代关系：none
运行真源：`src/core/ai-service/provider-config.ts`、`src/mods/mod-settings/store.ts`、`src/app/api/proxy/route.ts`
验收证据：`npm run test:managed-ai-default`、`npm run test:ai-proxy`、浏览器玩家路径、密钥缺席扫描、完整 gate/build、3001 旁路、3000 正式服务、HTTPS 与 Certbot 模拟续期

## 1. 当前结论

- 请求接口 `https://dasuapi.com/v1` 与请求模型名 `grok-4.5` 可用。
- 非流式、JSON Mode 与 SSE 流式请求均已成功；流式响应包含正常终止标记。
- 默认 Provider 为 `managed`，浏览器保存的 Key 为空；代理在服务端从 `MANAGED_AI_API_KEY` 选择凭据。
- 本验收只覆盖玩家免费体验与托管通道专项。根据 2026-07-18 最新用户决定，本地开发、浏览器调试和发布前通用真实模型测试改用 DeepSeek 官方 Provider；不得再把 `managed` / `dasuapi` 作为本地通用测试模型。
- 玩家填写自己的 Key 时优先使用玩家 Key；修改接口或模型后使用 `custom`，不再借用托管凭据。
- 托管通道固定接口并只允许 `grok-4.5` 请求名，避免服务器凭据被转发到任意目标。
- 配置探测只返回 `configured` 布尔值，代码、文档和环境示例不包含真实凭据。
- 完整主叙事的上游非流式请求会在约 60 秒被服务端中断；代理现改用 SSE 上游传输并在收到 `[DONE]` 后无损聚合，再按原非流式 JSON 契约交给浏览器。

## 2. 脱敏上游实测

| Case | 结果 | 观测 |
|---|---|---|
| 普通非流式 | 通过 | 返回预期短文本，约 2.2 秒 |
| JSON Mode | 通过 | 返回严格 JSON，约 3.4 秒 |
| SSE 流式 | 通过 | `text/event-stream` 且包含终止标记，约 3.9 秒 |
| 请求模型名 | 通过 | `grok-4.5` 被上游接受；响应模型标识可带服务端构建后缀 |

本节不记录请求头、环境值、完整命令或任何可逆凭据材料。

## 3. 项目代理实测

| Case | 结果 | 证据 |
|---|---|---|
| `GET /api/proxy?providerId=managed` | 通过 | 只返回 `configured: true` |
| managed 请求不传浏览器 Key | 通过 | 代理返回预期短文本 |
| managed 请求非法模型 | 通过 | HTTP 400，未向上游转发 |
| custom + 玩家 Key + 自定义接口/模型 | 通过 | 返回预期短文本 |
| managed 完整主叙事、客户端非流式 | 通过 | SSE 首事件约 18.8 秒、完整结束约 74.1 秒；聚合后 JSON 完整返回 |
| managed 后台世界初始化 | 通过 | 校准与标签均完成，0 项错误 |
| 本地环境文件 | 通过 | `.env.local` 存在、已配置且被 Git 忽略 |
| 密钥缺席 | 通过 | Git 跟踪文件与本地 AI 日志未发现凭据 |

非流式长请求的原始失败表现为上游约 60 秒后 `fetch failed`，不是客户端 Key 缺失或模型名错误。传输适配后，当时的 Prompt 3.0 完整请求在约 40.8 秒内以非流式 JSON 成功返回，并包含当时使用的 `[正文]` 与 `[回合数据]`；该协议记录仅证明传输完整性，当前输出协议以 `playtest-2026-07-18-prompt-4-tiered-protocol.md` 为准。确定性回归还验证了跨字节分块的完整中文正文、缺少 `[DONE]`、非法事件和空正文拒绝路径。

## 4. 浏览器玩家路径

- 设置页“恢复默认”后显示“免费体验通道”、`Grok 4.5`、公开接口与空 Key；浏览器不显示托管凭据。
- “测试连接”在不填写 Key 时成功，页面显示已连通。
- 玩家修改接口与模型后，预设选择清空并显示“自定义接口需要 API Key”；再次恢复默认可回到托管通道。
- 欢迎页在空 Key 状态下直接进入世界选择，没有错误打开设置页。
- 后台世界初始化的 4 项状态均完成；真实创建链路可进入核心模拟。
- 传输修复前，真实首轮按完整主叙事重试三次均在约 60 秒出现 502，回合保持为 0 且没有写入坏剧情。
- 传输修复后，当时的 Prompt 3.0 真实首稿完整返回；严格中文协议触发一次格式修复，最终成功提交第 1 轮。该记录证明托管通道能承载完整长响应，不再作为当前 Prompt 4.0 的协议通过率证据。
- 修复后的浏览器阶段没有新增错误；开发日志中保留的三条 502 均发生在传输修复之前，可由请求时间与 ID 区分。

## 5. 发布验收

- 游戏版本为 `5.0.4`；`check:changelog`、完整 `gate-check` 与生产 `build` 通过。
- 发布包在 `/root/ai-life-sim-releases/` 独立构建，3001 旁路的欢迎页、配置探测与无客户端 Key 实际请求通过后，原子切换 `/root/ai-life-sim` 并重建 PM2 主进程。
- 正式 3000 服务的欢迎页、配置探测与无客户端 Key 实际请求通过；PM2 在计划内重启后在线，Nginx 配置校验通过。
- `https://ai-mnrs.icu/welcome` 与公网配置探测返回 HTTP 200；证书覆盖 `ai-mnrs.icu` 与 `www.ai-mnrs.icu`，有效期至 2026-10-16。
- 服务器 `.env.local` 与 `.env.production` 权限均为 `0600 root:root`。托管 Key 只存在于私有环境文件，Next Server Actions 加密值在发布时完成安全轮换。
- AI 诊断目录迁移到 `/var/log/ai-life-sim`，权限为 `0700 root:root`，不再随原子发布目录切换。
- 生产实际请求后扫描 695 个构建、PM2 与 AI 日志文件，托管 Key 命中数为 0。
- 自动续期由 `snap.certbot.renew.timer` 管理，状态为 enabled；`certbot renew --dry-run --no-random-sleep-on-renew` 模拟续期成功。
