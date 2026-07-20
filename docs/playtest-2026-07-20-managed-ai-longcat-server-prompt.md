# LongCat 默认通道与服务端 Prompt 资产验收

文档角色：acceptance
权威层级：A5
状态：active
体系路径：project > AI semantic capability > managed provider and protected prompt assembly
上级目标：默认提供可用的免费主叙事模型，同时避免向浏览器公开核心 Prompt，并把非秘密计算留在玩家设备
下级组成：LongCat 默认 Provider、原 a6api 可选 Provider、服务端资产白名单、浏览器动态投影、设置页与代理拒绝路径
适用范围：主叙事 Prompt `4.5.0`、`/api/proxy`、Provider 设置、客户端生产构建与生产发布
拥有者：`mod-engine` 服务端 Prompt 资产、core AI Provider、app proxy route、mod-settings
最后验证：2026-07-20；本地确定性回归、真实 LongCat 主叙事请求和浏览器设置路径
取代关系：取代 `docs/playtest-2026-07-19-managed-ai-a6api.md` 的当前默认结论；原 a6api 只作为保留选项
运行真源：`src/mods/mod-engine/server-prompt-assets.ts`、`src/mods/mod-engine/server/narrative-system-prompt.ts`、`src/core/ai-service/provider-config.ts`、`src/core/ai-service/server-provider-targets.ts`、`src/app/api/proxy/route.ts`
验收证据：`npm run test:managed-ai-default`、`npm run test:ai-proxy`、`npm run test:protected-prompt-bundle`、`npm run test:narrative-protocol`、真实 Provider 请求、浏览器手工路径与交付闸门

## 1. 验收目标

1. 新玩家、旧默认空配置和“恢复默认”统一选择 `managed / LongCat-2.0`；浏览器只收到预设名称和模型，不收到托管目标地址。
2. 原免费体验通道保留为 `managed-a6 / gpt-5.6-luna`，玩家也可使用自己的 API Key。
3. 固定身份、长期写作规则、完整协议示例和等价核心文本只在服务端白名单资产中存在。
4. 浏览器负责动态世界、角色和历史投影、缓存分层、序列化、响应解析、Schema 校验、模拟预检与状态提交；服务端不重复这些非秘密计算。
5. 任意自定义 URL 可以测试连接，但不能接收受保护主叙事资产。
6. 设置页不显示 Prompt 预览、内部组件文本或导出入口。

## 2. 服务端与客户端边界

| 执行位置 | 当前职责 | 明确不承担 |
|---|---|---|
| 浏览器与 owning systems | 动态状态投影、相关性选择、三层用户消息、缓存、序列化、流式正文提取、解析、严格校验、预检、提交与回滚 | 固定核心 Prompt、托管凭据、受保护资产选择权 |
| 服务端代理 | 白名单解析 `serverPromptAssetId`、插入唯一 system 消息、Provider 与凭据路由、上游转发、受限诊断记录 | 世界模拟、历史筛选、业务校验、状态计算或状态提交 |

浏览器可见类型、字段契约、解析器和模拟代码均按公开内容处理；只有未进入客户端构建的服务端文件与文本被视为受保护资产。

## 3. 确定性结果

| Case | 结果 | 证明内容 |
|---|---|---|
| 默认 Provider、目标保密与迁移 | 通过 | 默认、空旧配置与恢复默认均选择 LongCat；两套托管目标只由服务端环境解析；原 a6api 和玩家自有 Key 路径保留 |
| 未知资产编号 | HTTP 400 | 不回退到客户端 Prompt 或其他服务端副本 |
| 客户端同时提交 system 消息 | HTTP 400 | 玩家不能覆盖或拼接受保护 system Prompt |
| 未登记自定义 URL | HTTP 400 | 受保护资产不会发往玩家可控制的目标 |
| 主叙事协议 | 通过 | 浏览器仍发送有序动态用户消息并完成完整中文协议解析与提交 |
| 设置页 | 通过 | 仅显示“个性化 / 模型设置 / 模型调用”，不存在 Prompt 预览 |
| 浏览器控制台 | 通过 | 设置切换、恢复默认和限制提示路径无 error 或 warning |

## 4. 真实模型证据

| Provider / Model | 结果 | 备注 |
|---|---|---|
| `managed / LongCat-2.0` | HTTP 200 | 返回完整 `正文 / 摘要 / 结束` 协议；usage 中的嵌套缓存字段已归一化 |
| `managed-a6 / gpt-5.6-luna` | HTTP 401 | 代码、界面和固定目标仍保留，但当前服务器凭据无效；在取得有效凭据前不能宣称该通道可实际调用 |

真实请求和验收记录不保存 API Key、Authorization 或可逆凭据材料。

## 5. 浏览器设置路径

- 打开设置后仅有三个用户页签，没有详细 Prompt 文本或内部组件列表。
- 恢复默认后选中 LongCat 2.0；托管模式不显示 Key 或 API 地址。
- 玩家可以切换到保留的 a6api 选项，也可选择官方 Provider 并填写自己的 Key。
- 编辑为未登记地址后，界面明确显示“仅可测试连接，主叙事不可用”。

## 6. 已知限制

1. `managed-a6` 当前凭据返回 HTTP 401。该问题属于运行凭据，不通过静默切换模型或跨 Provider 回退掩盖。
2. `npm run test:creation-first-narrative:browser` 在当前工作区因未安装 Playwright 返回 `UNAVAILABLE`。本任务不新增依赖，已用应用内浏览器完成对应设置与控制台验证。
3. 正式生产发布、客户端 bundle 扫描和 HTTPS 主叙事复验在本地版本记录与提交完成后补充到本文件。
