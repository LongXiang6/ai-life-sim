---
name: ai-life-sim-prompt-engineering
description: 用于用户要求的 AI 人生模拟器提示词、结构化输出、解析器、叙事组装、Provider 参数、响应终态、Token、缓存池或 DeepSeek user_id 行为变更。
---

# AI 人生模拟器提示词工程

## 目标

让 AI 输入、固定资产、动态组装、结构化输出、解析、校验和应用形成一个可追踪的端到端契约，不发生提示词、Schema、状态所有权或响应终态漂移。

## 适用范围

- 提示词、结构化输出、解析器、叙事组装、Provider 参数、响应终态、Token、缓存池、DeepSeek `user_id` 和 AI 服务边界。
- 读取核心模拟和逻辑树的目标章节及其点名的 Prompt、Schema、解析器和状态应用实时源。
- 涉及 DeepSeek 模型生命周期、Provider 参数、`finish_reason`、保活/超时、限速、`user_id`、KVCache 或调用系统池时，追加系统树“AI 服务”和 `docs/product-decisions.md` 的 `PD-039`、`PD-040`。

## 执行契约

- 占位符、Schema、解析、校验和应用共同描述一个契约；所属系统负责写入，提示词不转移状态所有权。
- 长期不变的叙事约束只由服务端固定 Prompt 资产拥有；动态消息只传具体事实、本轮条件和玩家原始意图。
- 面向 DeepSeek 的输出引导使用正向字段职责：推理归 `reasoning_content`，最终结果归 `content`；固定 Prompt 提供唯一可解析标准示例，并用明确边界区分示例与动态输入。
- 故事记忆按时间主轴投影，每个时间阶段和事件使用真实换行；压缩、检索和存档真源继续完整保存层级、来源、权重、衰减、遗忘状态与原始内容。
- 精确 AI 输入样例必须由当前固定 Prompt 资产和真实动态组装器生成或逐字校验；样例只包含实际发送内容。
- 标识、文件、格式、写法和排序按 [项目标准化契约](../ai-life-sim/references/standardization.md) 执行。

## 权威与实时源

- 当前协议和回合机制：`ai-life-sim/docs/authority/core-simulation.md`、`logic-tree.md`。
- Prompt 资产、动态组装和解析：由核心模拟权威点名的实时源负责。
- Provider 传输和参数：`src/core/ai-service/`、`src/app/api/proxy/` 及系统树 AI 服务章节。
- Skill 只保留可复用执行流程；新 Prompt 行为、解析策略或调用策略必须同步写入核心模拟唯一活动权威。

## 边界

- 除非用户明确要求，不改变现行协议或新增模型调用、重试、回退、正则推断、风格规则和字段。
- 不从正文关键词、页面状态或错误文本反推业务状态；不把提示词资产变成第二状态所有者。
- 固定规则进入固定资产后，删除动态区的同义说明；格式修复复用原资产和原输入，不建立旁路协议。
- 隐藏过滤或拦截遵循 `D:\AI\AGENTS.md` 的明确同意规则。

## 验收

- 运行相关 Prompt、协议、解析和 AI 服务回归；涉及结构化写入或回合推进时追加 `npm run check:execution`。
- 运行 `npm run check:standardization`，确认 Skill、Prompt 文件、配置格式、命名、排序和生成标记符合项目契约。
- 核对活动权威与实时源一致，确保旧协议入口、重复 Schema、旁路状态写入和未声明字段残留为零。
