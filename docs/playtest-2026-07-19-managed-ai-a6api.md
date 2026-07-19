# a6api 托管主备通道与部署验收

文档角色：acceptance
权威层级：A5
状态：active
体系路径：project > simulation-runtime > platform-services > managed-ai-default-channel > a6api-primary-fallback
上级目标：让玩家无浏览器 Key 使用稳定的免费体验通道，并在主模型故障时安全切换备用模型
下级组成：公开主模型、服务端备用顺序、设置迁移、代理聚合、世界初始化、生产发布
适用范围：`managed` Provider、恢复默认、`/api/proxy`、后台世界初始化与服务器运行环境
拥有者：core AI Provider 配置、app AI routes、mod-settings
最后验证：2026-07-19；本地代码回归、主备执行烟测、真实托管代理与 DeepSeek 官方本地请求通过
取代关系：取代 `docs/playtest-2026-07-18-managed-ai-default.md` 的当前通道结论；旧文档保留首代通道历史
运行真源：`src/core/ai-service/provider-config.ts`、`src/core/ai-service/managed-provider-execution.ts`、`src/app/api/proxy/route.ts`、`src/app/api/world-init/route.ts`
验收证据：`npm run test:managed-ai-default`、`npm run test:ai-proxy`、真实模型请求、完整交付闸门、3001 旁路与正式 HTTPS 验证

## 1. 当前目标

- 生产免费体验 Provider：`managed`。
- 固定接口：`https://a6.a6api.com/v1`。
- 浏览器公开主模型：`gpt-5.6-luna`。
- 服务端内部备用模型：`gpt-5.6-terra`。
- 本地开发、浏览器调试和发布前通用真实模型测试：DeepSeek 官方 `deepseek-v4-flash`。
- 托管凭据只由服务端 `MANAGED_AI_API_KEY` 提供；本文件与跟踪源码不保存凭据值。

## 2. 上游模型实测

同一短中文叙事请求各运行两轮非流式与流式请求，并追加一次 JSON Mode 请求。

| 模型 | 非流式 | 流式 | JSON Mode | 结论 |
|---|---:|---:|---|---|
| `gpt-5.6-luna` | 中位约 3.5 秒 | 中位约 3.7 秒 | 通过，约 2.6 秒 | 响应稳定，作为主模型 |
| `gpt-5.6-terra` | 中位约 6.0 秒 | 中位约 4.6 秒 | 通过，约 2.2 秒 | 可用，作为备用模型 |
| `gpt-5.6-sol` | 3.3 秒至 44.9 秒 | 中位约 3.7 秒 | 通过 | 冷启动波动过大，不进入生产顺序 |
| `grok-4.5` | 中位约 14.6 秒 | 出现空流式结果 | 90 秒超时 | 不再作为托管模型 |

模型清单接口返回四个模型且 HTTP 200。测试记录不包含 Authorization、API Key 或可逆凭据材料。

## 3. 确定性主备契约

- 浏览器提交 `managed + gpt-5.6-luna` 时，服务端候选顺序固定为 Luna、Terra。
- 浏览器直接提交 Terra 或任意其他托管模型时返回 HTTP 400，不允许借服务器凭据选择目标。
- 主模型连接失败、404、408、409、425、429、5xx 或完整 SSE 校验失败时，非流式托管请求可在未返回任何正文前切换 Terra。
- 401 等鉴权失败不切换模型，避免把凭据问题伪装成模型故障。
- 确定性烟测使用不完整 Luna SSE 和完整 Terra SSE，最终只返回 Terra 的完整结果；没有跨模型拼接部分正文。
- 客户端可见流式请求只允许在首个成功响应开始前切换；已经向浏览器输出部分正文后不跨模型续写。

## 4. 本地真实代理证据

| Case | Provider / Model | 结果 | 耗时 |
|---|---|---|---:|
| 托管非流式 | `managed / gpt-5.6-luna` | HTTP 200，聚合 JSON 完整，日志记录主模型一次成功 | 约 2.55 秒 |
| 托管流式 | `managed / gpt-5.6-luna` | HTTP 200，SSE 包含 `[DONE]` | 约 2.23 秒 |
| 通用本地实测 | `deepseek / deepseek-v4-flash` 官方接口 | HTTP 200，返回预期文本 | 约 0.93 秒 |
| 篡改托管模型 | `managed / gpt-5.6-terra` 浏览器请求 | HTTP 400，未进入允许路径 | 约 0.01 秒 |

本地 AI 日志扫描 53 个文件，托管凭据命中 0；临时开发凭据文件已删除，隔离端口已关闭。

## 5. 设置迁移

- `mod-settings:store` 持久化版本由 5 升至 6。
- 已使用 `managed` 的玩家自动更新公开接口和主模型，同时保留玩家自己填写的 Key。
- `custom` Provider、玩家自定义接口和模型保持不变。
- 恢复默认继续清空浏览器 Key，并回到新的公开主模型。

## 6. 生产发布

待本任务完成完整闸门、版本记录、3001 旁路、正式切换与服务器清理后补充最终证据。
