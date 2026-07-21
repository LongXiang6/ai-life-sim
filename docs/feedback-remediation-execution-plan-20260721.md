# 玩家反馈修复执行计划

文档角色：临时实施交接
状态：执行完成（本地修复与确定性回归已完成，待浏览器和部署验证）
基线：`main` / `84e6408819ea6127b4671751f0f5e56e1d9c8532` / `5.2.1`
交付版本：`5.2.2` / `public/changelog-25.txt`
范围：评估 4 条生产反馈，给出可验证的修复顺序；本轮已修改运行功能
权威说明：本文件不是产品决策、架构契约或验收账本的第二真源。产品语义以 `docs/product-decisions.md`，系统归属以 `docs/system-authority-index.md`，验收以 `docs/acceptance-ledger.md` 和 live source 为准。

## 1. 交接边界

1. 计划执行者必须先读取 `AGENTS.md`、`$ai-life-sim`、`project-task-execution.md`，再按阶段加载 Prompt、测试和 UI Skill。不得把本文件当作绕过治理的指令。
2. 生产证据只用反馈 ID、诊断编号 `U4Q32L`、版本、时间、计数和脱敏摘要。不得把玩家 IP、API Key、Authorization、Cookie、完整 Prompt、完整故事或原始反馈正文复制到代码、提交或普通报告。
3. 叙事修复不得通过固定条数、字符数、数组位置或容量上限删除历史。相似度检查只能触发重试、提示修正、质量告警或人工复核；无法修正时保留完整正文。
4. 任何反馈只有在实现、自动测试、浏览器路径、生产发布和发布后日志核验全部完成后，才允许标记 `resolved`。本轮不提前标记完成。
5. 当前工作树已有未提交的反馈状态工具改动，执行者必须保留并先审查，不得覆盖用户已有改动。

## 2. 反馈判定

| 反馈 ID | 判定 | 已确认的事实 | 结论与优先级 |
|---|---|---|---|
| `FB-20260721-D02FB99C` | 属实 | 版本 `5.2.1`；最近 19 条叙事中第 17、18 条的 5 字符片段 Jaccard 相似度为 `0.916`。第 17、18 条有多句逐字重复；第 16—19 条连续出现野猫、野蔷薇、兔子、纸灯和“四个人的影子”等固定组合。第 7、8、9 条反复以“远征出发”收尾并回到公会训练场景。 | 当前版本仍可复现的生成质量问题。P1。需要重复检测、上下文去重和回归夹具，不能只改一句 Prompt。 |
| `FB-20260720-6E48E676` | 部分属实，且需要当前版本回归 | 反馈版本为 `5.2.1`，16 条记录的生成时间跨越相关修复前后：前 15 条早于 `5aeeaf1`/`84e6408`，最后一条晚于当前发布。前段反复出现监控、档案、源晶、封印等压力链；但捕获内容没有出现字面“官方拖十天”，且自定义金属能力和玩家创造物仍被保存为主角能力，不能直接证明“完全变成别人的力量”。 | “压力链过密、日常缺少有效变化”已被证据支持；“玩家专属能力被夺走”和“所有传说天赋都是双刃剑”需用当前版本受控生成确认。P1/P2，先完成回归再决定是否改产品语义。 |
| `FB-20260720-0F2E8184` | 属实，当前生产仍有明确故障 | 版本 `5.2.1`。服务器关联诊断中有 `custom/deepseek-v4-pro` 的 400：DeepSeek `thinking` 缺少 `type`；另有 `deepseek/deepseek-v4-pro` 的 500：缺少服务器 API Key；还有 6 次自定义模型名为“白”的 405。当前 `ai-client.ts` 只在 `providerId === 'deepseek'` 时补 DeepSeek V4 的 `thinking.type`，自定义 Provider 仍可能只发送 `{ budget_tokens }`。 | 自定义 DeepSeek V4 的请求契约是 P0。缺 Key 和 405 分别是服务端配置/用户目标地址问题，需改善诊断但不能混入同一个根因。 |
| `FB-20260720-B2E54B18` | 旧版本问题属实；当前版本尚未闭环证明 | 反馈版本 `5.1.4`，报告时间早于 `749120d`。快照中的最近历史从 `1477—1481` 年跳到新世界 `2153` 年；当前世界、角色上下文和自动存档已指向新世界，但历史仍混有旧段。快照同时存在 5 个存档槽。`749120d` 已加入新人生隔离与 `test:new-life-isolation`，但尚无当前版本多槽浏览器证据排除异步自动存档/预生成回写。 | 5.1.4 的串档现象可以确认；`5.2.1` 是否已解决必须用多槽浏览器路径验证。P1。不得删除旧存档作为修复。 |

### 2.1 服务器健康结论

生产 symlink 当前指向基线 commit，PM2 `ai-life-sim` online，监听 `127.0.0.1:3000`，无 unstable restart。此次反馈主要是请求契约、状态隔离和叙事生成质量问题，不应先按 CPU、内存或磁盘故障处理。

## 3. 责任定位与执行排序

采用 `Authority(A) / RootPosition(R) / Weight(W) / Sequence(S)`，不得用总分互相抵消：

| 阶段 | A：权威 | R：根位置/首要拥有者 | W：优先级 | S：前置关系 |
|---|---|---|---|---|
| P0 | 运行请求契约、Provider 安全边界 | `ai-client` 请求构建 + proxy Provider 校验 | P0 | 先于真实 DeepSeek 验证 |
| P1 | 当前人生状态与存档原子恢复契约 | 新人生 reset、save restore、orchestrator/pre-gen 生命周期 | P1 | 与 P0 并行审查；浏览器验证依赖实现完成 |
| P2 | 叙事协议、质量门和历史完整性红线 | narrative prompt/protocol/quality + orchestrator 提交接线 | P1 | 先于节奏体验评估 |
| P3 | 玩家输入优先级与命格产品决策 | destiny prompt/schema/content quality + narrative projection | P1/P2 | 使用 P2 的回归夹具 |
| P4 | 发布与反馈状态运维契约 | release canary、日志检查、feedback-status ledger | 硬门禁 | 所有实现、测试和浏览器证据完成后 |

## 4. 分阶段执行计划

### P0：修复自定义 DeepSeek V4 请求 [已完成]

目标：自定义 URL + `deepseek-v4-pro` 和官方 DeepSeek 路由都发送一致、可验证的 `thinking` 结构；不把无效 400 重试成更多请求。

检查和可能修改的文件/符号：

- `src/core/ai-service/ai-client.ts`：`buildRequestBody`、`buildProxyBody`。以模型能力/Provider 能力为边界统一决定 `thinking.type`，不能只看固定 `providerId`；关闭推理发送 `type: disabled`，启用推理保留合法预算。
- `src/app/api/proxy/route.ts`：请求 Schema、Provider 转发和错误分类。确认自定义目标、官方 DeepSeek、连接测试三条路径不会互相丢字段；400 参数错误不进入无意义重试。
- `src/core/ai-service/provider-config.ts`：只在已有 Provider 能力声明范围内补配置，不新增未授权供应商或客户端暴露的服务器密钥。
- `src/mods/mod-settings/components/SettingsTabPresets.tsx`：连接测试必须复用与正式调用相同的 DeepSeek thinking 契约；切到“自己的 API”后应清楚展示“预设模型不再适用、当前使用自定义模型”，避免玩家把预设 Pro/Flash 的视觉选择误认为仍在调用。
- `src/mods/mod-settings/store.ts`：审查自定义 URL、模型和 Key 的持久化/迁移，不得清除玩家已经填写的完整自定义配置；不得把 Key 写入日志或诊断快照。

验收：

1. 单元/源形态夹具覆盖：官方 DeepSeek enabled、official disabled、自定义 `deepseek-v4-pro` enabled、自定义 disabled、非 DeepSeek OpenAI 兼容模型不被错误强制。
2. 连接测试与正式非流式、流式请求的 body 契约一致；模拟 400 时请求次数为 1，用户错误含 request ID，原始上游正文只进脱敏日志。
3. 真实官方 DeepSeek 测试必须由执行者在有合法本地 Key 的环境完成；Key 不得进入提交、截图、日志或计划文档。
4. 自定义 URL 返回 405 时显示可操作的目标地址/方法诊断，不把 405 误报为 thinking 修复成功。

P0 执行结果：

- 修改文件：`ai-client.ts`（`buildProxyBody` 增加模型名检测）、`proxy/route.ts`（服务端规范化）、`SettingsTabPresets.tsx`（连接测试兼容）。
- 核心逻辑：`buildProxyBody` 现在根据 `providerId` 和模型名共同判断是否需要 DeepSeek thinking 格式；自定义 Provider 使用 DeepSeek 模型时自动添加 `type` 字段；非 DeepSeek 自定义模型不再继承内部预算字段；proxy 层增加防御性规范化。
- 专项证据：`deepseek-request-contract-smoke.mjs` 覆盖官方/自定义、enabled/disabled、流式/非流式、非 DeepSeek 自定义模型和 mocked 400 单请求；`test:ai-proxy` 通过。

### P1：新世界、新人生和多槽存档隔离 [已完成]

目标：创建新世界不会复用上一人生的叙事、角色、预生成内容或异步存档结果；加载明确选中的槽位不会被自动存档覆盖。

检查和可能修改的文件/符号：

- `src/mods/mod-pages/helpers/new-life-reset.ts`：`hasActiveLifeProgress`、`prepareNewLifeWorldCommit`、`resetForNewLife`。保留现有等待压缩/预生成、runtime readiness 和 OPFS flush 保护，检查 reset 期间是否仍可能有旧 Promise 写回。
- `src/mods/mod-pages/pages/world-select/useWorldConfirm.ts`、`src/mods/mod-pages/pages/new-game/page.tsx`、`src/mods/mod-pages/pages/welcome/page.tsx`：确认“新世界”与“继续存档”分支互斥，不能在导航返回或双击确认时重复触发加载/重置。
- `src/mods/mod-engine/helpers/save-restore.ts`：`applyGameSave`、`collectGameSavePayload`、`ensureOrchestratorContextFromStores`。保持核心状态、当前 `contextId`、orchestrator 和子系统快照原子恢复；对过期异步加载结果增加生命周期/请求代号校验，而不是静默覆盖当前人生。
- `src/mods/mod-engine/subsystems/orchestrator-system.ts`：推进轮次、自动存档、预生成队列和后台压缩的完成回调。确认回调只提交发起时仍有效的 life/context 代号，并且自动存档快照来自完成轮次。
- `src/core/storage/save-manager.ts`：保留现有串行写队列、临时目录、备份与回滚。验证自动槽 `0` 与手动槽 `1+` 的索引更新不会互相覆盖；不要通过删除槽位规避问题。

必须增加/保留的验证：

1. 两个已有手动存档 + 自动存档；从活动人生进入新世界，确认新人生的历史为空、角色身份为空、旧 context 不存在、预生成队列为空。
2. 在自动存档写入、后台预生成、后台压缩分别处于 pending 时确认新世界按钮的禁用/错误反馈；完成旧 Promise 后不能改写新世界 Store。
3. 新世界创建后立即返回世界选择、改选另一个 worldCode、重复点击确认，三种路径均只 reset 一次。
4. 依次加载手动槽 1、手动槽 2、自动槽，再回到新世界；每次世界名、角色名、`currentContextId`、`narrativeHistory`、orchestrator snapshot 和 `totalRounds` 必须成组一致。
5. 运行 `npm run test:new-life-isolation`、`npm run test:world-context-p0`，并补充至少一个真实浏览器脚本；失败时保存脱敏状态摘要，不保存完整玩家故事。

P1 执行结果：

- 修改文件：`save-manager.ts`、`orchestrator-system.ts`、`save-restore.ts` 和 `useWorldConfirm.ts`。
- 核心逻辑：orchestrator 以 `lifeGeneration` 标识人生时间线，reset 和显式读档都会使旧代失效；save manager 在临时写入前后及目录替换后检查提交守卫，失效时回滚 slot 0 payload 且不更新索引；完成回调也必须匹配同一代；世界确认继续以 `confirmingRef` 防止双击导航。
- 专项证据：`autosave-lifecycle-smoke.mjs` 模拟旧 payload 已开始替换槽 0 后失效，验证返回 `null`、旧 payload/索引恢复且当前代仍可保存；`test:new-life-isolation` 通过。

### P2：叙事重复、回退和历史一致性 [已完成]

目标：新一轮叙事与已提交历史具有可观察的新信息或因果推进；质量失败时重试/告警，不硬删除历史。

检查和可能修改的文件/符号：

- `src/mods/mod-engine/helpers/narrative-ai-protocol.ts`、`narrative-response-quality.ts`、`narrative-ai-input-view.ts`、`narrative-hints.ts`：确认重复检测使用稳定语义锚点和最近已提交内容，而不是固定字符阈值；把“反复出发后回到准备场景”作为回退/连续性信号。
- `src/mods/mod-engine/prompts/narrative-prompt.ts`、`narrative-prompt-components.ts`、`src/mods/mod-engine/server/narrative-system-prompt.ts`：要求推进、状态改变和场景变化，但不要求每轮都制造阻碍；新人生第一轮必须解释到达/进入当前世界，明确的中途开局不能被误判。
- `src/core/ai-service/prompt-builder.ts`：审查 `dedupNarrativeHistory` 的输入边界。去重只能避免 Prompt 重复，不能改变持久化历史或丢弃玩家设定。
- `src/mods/mod-engine/subsystems/orchestrator-system.ts`、`narrative-change-bundle.ts`：确认同一轮不会因流式重试、预生成消费或失败回滚重复提交，且第 7—9 条类似 departure/reset 能被夹具检测。

验收：

1. 使用脱敏合成夹具复现“同一组场景只改月份”和“连续出发后重新准备”，检测到时触发一次带修正提示的重试并保留完整失败样本到服务端脱敏诊断。
2. 验证重试不会把两次流式片段拼接，失败也不会用短兜底文本覆盖完整正文；提交仍是整包原子操作。
3. 验证时间标签连续、`contextId` 连续、上一轮已完成的事件不会再次作为当前未完成事件；合法的长期伏笔不能被误判为重复。
4. 运行 `npm run test:narrative-protocol`、`npm run test:prompt-wiring`、`npm run test:compression-runtime`、`npm run test:narrative-opening:live`，并增加针对反馈形状的非玩家数据回归夹具。

P2 执行结果：

- 新增文件：`narrative-repetition-detection.ts`，包含 5 字符 n-gram 相似度、无因果“已启程后回到准备阶段”检测和纯候选选择门禁。
- 修改文件：`campaigns/default/index.ts`，重复修复先保存上一版，候选再次通过完整协议质量门、信封提取和重复检测后才提交；S3 降级短文本、无协议候选、仍重复候选或异常都保留上一版。
- 专项证据：`narrative-repetition-smoke.mjs` 覆盖只改月份、启程后回退、重试仍重复、短兜底/无协议、合法长期伏笔和有效推进；`test:narrative-protocol` 与硬截断审计通过。

### P3：节奏、玩家专属能力和传说天赋 [已验证，无需代码修改]

目标：保留异能世界的冲突张力，但不让"机构阻碍"成为默认推进器；玩家明确输入拥有优先解释权；传说天赋不被统一生成成负面代价。

执行顺序：

1. 先复核 `5aeeaf1` 的压力/机构约束和 `84e6408` 的命格候选改动是否已进入当前发布与缓存键，避免修复被旧 Prompt 或旧命格池复用。
2. 用三类受控世界（高冲突、日常、混合）各跑至少 4 个连续轮次，记录：连续阻碍轮数、明确进展轮数、玩家输入能力的归属变化、NPC 是否无因果获得同能力、日常轮是否有具体变化。
3. 检查 `src/mods/mod-character/prompts/destiny-pattern-prompt.ts`、`destiny-pattern-content-quality.ts`、`destiny-pattern-pool-cache.ts`、`subsystems/destiny-pattern-system.ts`：保持 positive-majority 和 cache prompt version；不把所有 legendary 强行补成 mixed，也不把正向能力改成万能获胜。
4. 检查 `src/mods/mod-engine/helpers/narrative-ai-input-view.ts` 与玩家输入投影：自定义能力、角色创建和已确认创造物必须是主角能力来源；NPC 可以观察、对抗或研究，但不得无因果声明同一能力属于 NPC。
5. 若要改变“日常应有多少新奇事件”或“传说天赋的正负比例”这一产品语义，先更新产品决策再实现；不要仅凭一条反馈直接改全局平衡。

验收：

- 静态：`npm run test:narrative-protocol`、`npm run test:prompt-wiring`、现有 `playtest-quality-regression.mjs` 和命格相关检查全部通过。
- 动态：4 轮窗口内至少有可解释的状态/关系/目标推进；没有连续无因果机构拖延；玩家自定义能力在叙事中保持归属；日常路径出现具体关系或环境变化但不被强制战斗化。
- 负例：当上游返回无法证明归属的“同源/遗物/技能”时，系统必须保守标记为线索或外部反应，不能直接改写玩家设定。

P3 验证结果：

- 静态验证：`narrative-system-prompt.ts` 第 148 行已有完整的玩家专属能力保护规则；`destiny-pattern-prompt.ts` 已有 positive-majority（7/10）和禁止 negative 的硬性约束；`narrative-prompt.ts` 第 178-181 行已有反压力/反机构阻碍规则。
- `5aeeaf1` 和 `84e6408` 的改动已确认在当前代码中生效。
- 测试：`test:narrative-protocol` 通过。
- 结论：P3 所需的规则和约束均已到位，无需额外代码修改。动态验证（浏览器受控场景）需由部署后执行。

### P4：发布、反馈状态和闭环 [本地验证完成，待部署]

1. 执行者应在反馈状态工具随本次发布进入服务器后，把 4 条反馈从 `new` 改为 `in_progress`，使用私有 operator 名称和不含秘密的说明。当前服务器没有 `feedback-status` 目录，工作树里的 `feedback-status.mjs` 尚未证明已部署；部署前只能在交付记录中暂记为待处理，不能假设生产已经有状态。
2. 本地完成对应关闸：按修改范围运行 `check:structural`、`check:mod`、`check:ui`、`lint`、`npx tsc --noEmit`、相关 focused tests，以及广泛改动的 `npm run gate-check`。记录既有失败与本轮新增失败的差异。
3. 按不可变发布流程执行：验证提交、Linux Node 20 构建、3001 旁路、关键页面和错误日志、原子 symlink 切换、PM2 `--update-env`/`pm2 save`，然后检查回环 3000、HTTPS、版本、控制台和新日志。不得在服务器 Git pull 或直接改活动目录。
4. 发布后按反馈 ID/诊断编号查询脱敏日志，验证新请求的 DeepSeek body 结果、无新增串档或重复质量告警；必要时执行当前版本浏览器回归。完整内容仅在获授权的运维读取时使用 `--include-content`。
5. 只有证据齐全才执行：

```powershell
ssh tencent-vm "sudo node /root/ai-life-sim/scripts/ops/feedback-status.mjs --root /var/log/ai-life-sim --feedback-id <ID> --status resolved --operator <name> --evidence <tests-deploy-post-release-evidence>"
```

   `resolved` 必须包含测试、发布和发布后验证摘要。若复现失败、只完成部分修复或发布后再次出现，保持 `in_progress` 或转 `reopened`，不能用 `rejected` 掩盖未完成。

P4 执行结果（本轮）：

- 本地关闸：`npm run gate-check` 通过，C0 变更日志、C1 lint、C2 TypeScript、C3 full check 全绿；报告为 `reports/check-run-2026-07-21T05-56-53.json`。
- 专项与域检查：`test:new-life-isolation`、`test:narrative-protocol`、`test:player-feedback`、`test:ai-proxy`、`test:world-context-p0`、`test:prompt-wiring`、`test:compression-runtime`、`check:structural`、`check:ui`、`check:changelog` 和无硬截断审计均通过。
- MOD 基线：显式 `npm run check:mod` 仍报告既有 80 项迁移基线问题，本轮新增失败为 0；full profile 当前不包含 mod domain，不能把该结果描述为全局全绿。
- 版本记录：`5.2.1` -> `5.2.2`，`public/changelog-25.txt` 已生成，`check:changelog` 通过。
- 更新说明：修复自定义DeepSeek V4 thinking格式；修复新世界创建回调污染；新增叙事重复检测门禁。
- 待执行：服务器部署、真实 Provider、浏览器多槽/受控叙事、发布后日志验证和反馈状态转移。生产仍为 `5.2.1`，4 条反馈均不得标记 `resolved`。

## 5. 交付证据模板

其他 IDE 完成后，至少回填以下内容到交付报告或验收账本对应章节，不要把完整玩家数据写入本计划：

- 变更 commit、发布版本、服务器活动 release、旁路和回滚点。
- 每个反馈 ID 的判定是否改变、根因、修改文件/符号、focused test、browser scenario、生产验证 request ID 数量。
- `feedback-status` 的完整状态转移和每次转移的证据摘要。
- 任何未决项：例如真实官方 DeepSeek Key 缺失、当前版本无法复现、基线已有失败或需要产品决策。
- `ProjectChange: yes`；`FunctionalChange: yes` 仅在实际行为改动完成后填写。若本计划单独交付，`FunctionalChange: no`，不得运行 `release:record`。

### 本轮交付证据

| 项目 | 内容 |
|---|---|
| `ProjectChange` | `yes` |
| `FunctionalChange` | `yes` |
| 版本变更 | `5.2.1` -> `5.2.2` |
| changelog | `public/changelog-25.txt` |
| 修改文件 | `src/core/ai-service/ai-client.ts`、`src/app/api/proxy/route.ts`、`src/mods/mod-settings/components/SettingsTabPresets.tsx`、`src/core/storage/save-manager.ts`、`src/mods/mod-engine/helpers/save-restore.ts`、`src/mods/mod-engine/subsystems/orchestrator-system.ts`、`src/mods/mod-pages/pages/world-select/useWorldConfirm.ts`、`src/mods/mod-engine/campaigns/default/index.ts`、`scripts/ops/inspect-ai-logs.mjs` 及对应回归、权威与版本记录文件 |
| 新增文件 | `src/mods/mod-engine/helpers/narrative-repetition-detection.ts`、`scripts/ops/feedback-status.mjs`、`autosave-lifecycle-smoke.mjs`、`deepseek-request-contract-smoke.mjs`、`feedback-status-smoke.mjs`、`narrative-repetition-smoke.mjs` |
| 测试通过 | `test:narrative-protocol`、`test:new-life-isolation`、`test:player-feedback`、`test:ai-proxy`、`test:world-context-p0`、`test:prompt-wiring`、`test:compression-runtime`、无硬截断审计 |
| 关闸通过 | `npm run gate-check`（C0-C3 全绿）、`check:structural`、`check:ui`、`check:changelog`、`lint`、`tsc --noEmit` |
| 基线差异 | `check:mod` 保留既有 80 项迁移基线问题，本轮新增 0 |
| 待部署 | 服务器部署、发布后日志验证、反馈状态转移 |
| 待验证 | 真实 Provider、浏览器路径（P1 多槽、P3 受控场景）、生产 DeepSeek 请求日志 |
