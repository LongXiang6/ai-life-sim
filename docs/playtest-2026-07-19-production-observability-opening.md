# 生产日志与叙事起句验收

文档角色：acceptance
权威层级：A5
状态：active
体系路径：project > acceptance > production-observability-and-narrative-opening
上级目标：让生产问题可按来源快速定位、确定性配置错误可终止，并降低年度叙事的模板化起句频率
下级组成：服务器现状基线、日志安全与关联回归、鉴权终止状态机、发布保留策略、四轮真实模型起句评测、发布后验证
适用范围：`ai-call-observability`、`managed-ai-default-channel`、`production-release-retention`、命格候选生成、主叙事 Prompt `4.1.0`
拥有者：`src/core/logger/`、AI client/proxy、`DestinyPatternSystem`、命格页、release cleanup 运维脚本、主叙事 Prompt
最后验证：2026-07-19；本地 focused gates、DeepSeek 官方四轮评测、生产只读检查与 release cleanup 回归
取代关系：none
运行真源：生产 PM2/Nginx、`AI_LOG_DIR`、活动 release symlink、systemd timer、服务端日志实现、命格状态机与主叙事 Prompt
验收证据：本文命令与结果、Linux release gate/build、3001 旁路、3000 生产探测、systemd 状态、浏览器控制台

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

发布时间：2026-07-19，北京时间。

- GitHub `main` 与本地发布提交一致；Linux Node.js 20 环境的 `npm ci`、`npm run gate-check` 和 `npm run build` 通过。
- 3001 旁路：主页、帮助、更新日志、托管配置均为 200；生产 GET 调试日志为 403；客户端日志、完整 AI 调试日志和拒绝型代理 trace 均成功写入。
- 旁路秘密测试：结构化字段与 raw 文本中的专用假 Key 均未落盘；来源目录、请求 ID、`0600` 文件与 `0700` 目录通过；伪造 `X-Forwarded-For` 未进入日志。
- 原子切换后 `/root/ai-life-sim` 指向新的不可变 release；PM2 `ai-life-sim` online，仅监听 `127.0.0.1:3000`，3001 旁路已删除并执行 `pm2 save`。
- `/var/log/ai-life-sim` 成为唯一活动日志根；旧 `/root/ai-life-sim-logs` 已原样移入 `/var/log/ai-life-sim/legacy/root-ai-life-sim-logs-20260718`，统一权限后继续受保留策略管理。
- 生产托管最短调用：HTTP 200，`gpt-5.6-luna` 正常完成；同一请求留下 request/response 两个 trace 事件、完整请求消息和完整响应正文，凭据来源只记录为 `server-or-missing`。
- 当日历史 401 共 17 次，全部 trace 的 `credentialSource` 为 `request`，说明失败来自浏览器提交的玩家 Key；服务器托管 Key 的发布后实测为 200。
- Nginx 配置通过；HTTP 根路径 301 到 HTTPS；`ai-mnrs.icu`、`www.ai-mnrs.icu`、帮助、`changelog-11.txt` 和版本索引均为 200。
- 浏览器：欢迎页恢复完成，说明页显示当前版本 `5.0.8`，控制台 warning/error 为 0。

结论：生产项目、日志采集、来源分类、秘密排除、只读运维查询和主叙事起句修复均已上线。后续用户反馈优先收集请求 ID；若用户主动填写过 Key，先检查本地 Key 是否失效，再按来源 IP 与请求 ID 联合定位。

## 6. 生产日志跟进与 401 根因

跟进时间：2026-07-19 12:36 前，北京时间。

- 最近 24 小时日志共记录 569 个代理请求、1138 个 trace 事件、127 个客户端事件和 13 个来源；状态为 462 次 200、66 次 401、36 次 499、2 次 500、2 次 502 与 1 次 400。
- 最近问题链显示 `/talent-draw` 在同一来源、同一玩家配置下连续产生 401；每个代理请求自身 `retryCount=0`，说明重复不是代理内部重试，而是命格候选循环在三路首屏失败后继续启动后续批次。
- 已有生产证据和托管通道单独 200 探测表明，这类高频 401 主要由浏览器提交的玩家 Key 无效或权限不足触发；服务器、PM2 与 Nginx 仍在线。
- 原 `PD-001`/`PD-013` 将所有单次失败都视为可持续等待，导致确定性鉴权失败无法终止。用户已明确授权把 401/403 改为配置终止错误，形成 `PD-020`。

## 7. 跟进实现与发布前证据

| 检查块 | 命令或证据 | 结果 |
|---|---|---|
| 鉴权终止状态机 | `npm run test:destiny-credential-terminal` | 通过；只产生已启动的 3 路首屏请求，未进入后续批次，池填充状态退出 |
| 原命格质量回归 | TypeScript loader 运行 `playtest-quality-regression.mjs` | 通过；三路并发、五条门槛、后台补池和无预设兜底保持不变 |
| 日志容量与脱敏 | `npm run test:ai-proxy` | 通过；默认总量上限更新为 10 GiB，秘密脱敏、IP 分类和完整 trace 未回退 |
| 托管通道 | `npm run test:managed-ai-default` | 通过；主备路由和服务器 Key 隔离未受影响 |
| 旧发布清理 | `npm run test:release-cleanup` | 通过；活动版本未满 72 小时整次跳过，成熟活动版本只删除超过 72 小时的非活动直接子目录，活动与新目录保留 |
| 剧情完整性 | `node scripts/check/domains/narrative/no-hard-truncation-audit.mjs` | 通过；本次错误终止与运维清理不删除剧情数据 |
| UI 与结构 | `npm run check:ui`、`npm run check:structural` | 通过；错误复用定版命格页已有提示区域，未改变构图、字段、操作顺序或 MOD 注册 |

日志策略按用户意见从 5 GiB 提升为 10 GiB。旧发布策略形成 `PD-021`：每次原子切换后，活动 symlink 必须先连续保持 72 小时；随后每日 timer 只有在本机 3000 健康时才删除同样超过 72 小时的非活动 release。日志、环境文件、证书/Nginx 备份和玩家数据均不在清理范围内。

## 8. 5.0.9 首次生产切换与 symlink 入口修复

首次发布提交：`8a4acdb`。

- Linux Node.js 20 的专项回归、完整关闸和生产构建通过；3001 旁路首页、帮助、更新日志为 200，生产调试日志 GET 为 403。
- 旁路客户端日志写入为 200，伪造 `X-Real-IP` 建立对应来源索引；raw 中的专用假 Bearer 原文在 `/var/log/ai-life-sim` 命中为 0。
- 旁路托管 AI 请求为 200，返回稳定请求 ID；运维检查器按该 ID 找到 1 个请求、2 个 trace 事件和完整响应长度，默认未展开内容。
- 原子切换后 3000、PM2、Nginx、HTTP 到 HTTPS、两个 HTTPS 域名、5.0.9 帮助与 `changelog-12.txt` 均通过；日志环境值为 30 天、10 GiB、64 MiB，3001 已关闭。
- systemd timer 安装后显示 enabled/active，首次 oneshot 也返回 success，但 journal 没有清理计划。继续追踪发现：Node 通过活动 `/root/ai-life-sim` symlink 启动脚本时，`process.argv[1]` 保留 symlink 路径，而 `import.meta.url` 解析到真实 release；旧入口判断直接比较两种路径，因而误判为“不是 CLI 主模块”并空退出。
- 拥有者修复改为对两边执行 `realpath` 后比较，并在 `release-cleanup-smoke` 增加经目录 symlink 启动的入口回归。修复后本地完整关闸与生产构建再次通过；最终发布必须以 journal 出现结构化 `active-soak-incomplete` 计划作为验收条件，不能只看 systemd exit code。

## 9. 5.0.9 最终生产验收

最终运行修复提交：`123044a`。

- 独立 release 再次通过 Linux Node.js 20 的 `npm ci`、`npm run test:release-cleanup`、完整 `gate-check` 和生产 `build`；3001 旁路的 5.0.9 帮助与更新日志通过后才执行第二次原子切换。
- `/root/ai-life-sim` 指向 `123044a` 时，PM2 `ai-life-sim` online，只有 `127.0.0.1:3000` 在监听，3001 旁路已删除并保存 PM2 进程表。
- 修复后的 systemd oneshot journal 明确输出：`mode=execute`、活动 release 为 `123044a`、`activeAgeHours=0`、`minAgeHours=72`、候选为空、跳过原因为 `active-soak-incomplete`；service 结果 success，timer enabled/active，下一次计划为次日 04:30 加随机延迟。
- 清理首次运行没有删除任何 release；这证明新版本刚切换时旧回滚点完整保留。72 小时后仍会重新验证本机 3000 健康与每个候选的直接子目录/年龄边界。
- 回环帮助和公网 HTTPS 帮助均为 200；Nginx 配置、HTTP 301、两个 HTTPS 域名、`changelog-12.txt`、生产调试日志 GET 403 和 10 GiB 日志环境策略保持通过。
- 浏览器真实欢迎页恢复完成，说明弹层显示当前版本 `5.0.9`；页面 URL 为 `/welcome`，标题为“AI 人生模拟器”，控制台 warning/error 为 0。

最终结论：5.0.9 已修复玩家自定义 Key 无效时的无限后续批次；生产日志保留完整脱敏诊断并按 10 GiB 总量管理；旧 release 在每次新版本切换后的完整三天窗口内保留，三天后才由健康检查保护的 timer 自动清理。

## 10. 5.1.0 日志复核、错误转译与 seed 根因修复

复核时间：2026-07-19 13:26 前，北京时间。

- 最近 24 小时复核扩大到 593 个代理请求、1184 个 trace 事件、129 个客户端事件和 15 个来源；状态为 484 次 200、3 次 400、66 次 401、36 次 499、2 次 500 与 2 次 502。
- 66 次 401 仍主要是玩家浏览器提交的无效自定义 Key；36 次 499 是浏览器取消或离页，不是服务器崩溃。2 次 500 与 2 次 502 均能对应发布验收期间故意缺少测试 Key 或请求不可达诊断地址的本机探测，不属于玩家运行缺陷。
- 3 次 400 中一次是此前发布验证时 JSON 引号错误的人工探测；另外两次来自 `/game-story`，请求 ID 为 `801a5fcd-a4dd-471a-ad2f-e6e0732cac40` 与 `1bb80075-9992-44c0-9ec7-8b589ba0a03b`，共同验证错误为 `seed: expected number, received null`。
- 根因是客户端对非数字故事种子执行 `Number(storySeed)` 得到 `NaN`，随后 `JSON.stringify` 将 `NaN` 写成 `null`，代理 Schema 因而返回 400。修复在客户端省略非有限或非数字 seed，并让代理仅把缓存旧客户端的 `seed:null` 兼容为空值；其他错误类型仍由 Zod 拒绝。
- `api-error.ts` 成为唯一玩家错误转译入口，明确覆盖 400、401、402、403、404、408、409、413、415、422、429、499、500、501、502、503、504、507 和未知 4xx/5xx。提示只包含状态、可理解原因、解决办法和请求 ID；原始上游正文继续只进入服务器脱敏日志。
- 专项 `npm run test:ai-proxy` 通过 20 类状态、秘密不回显、请求 ID、客户端 seed 与代理旧值兼容回归；`npm run test:destiny-credential-terminal` 保持 401/403 终止且只完成已启动三路请求。TypeScript、lint、结构基线和 5.1.0 完整 `gate-check` 均通过。

## 11. 5.1.0 正式生产验收

生产 release：`3e37f6e`。

- 本地 `main` 与 `origin/main` 同步后，以 `git archive` 上传到独立 `/root/ai-life-sim-releases/3e37f6e`。Linux Node.js 20 下的 AI 代理、鉴权终止、旧 release 清理专项、完整 `gate-check` 和生产构建全部通过，未直接修改活动目录。
- 3001 旁路欢迎页、帮助、`changelog-13.txt` 为 200，生产调试日志 GET 为 403，PM2 error 日志为空。托管通道最短调用返回 200，请求 ID `72bd0f25-56e6-499b-81c3-111f3a8b5ad0` 可回查到完整 request/response 两个 trace 事件，默认运维输出未展开正文。
- 原子 symlink 切换后 `/root/ai-life-sim` 指向 `3e37f6e`，正式 PM2 online，只有 `127.0.0.1:3000` 监听；3001 旁路已删除并执行 `pm2 save`。原 `7cbec2a` 及其他未满窗口的 release 完整保留。
- Nginx 配置通过，两个域名的 HTTP 均 301 到 HTTPS；`ai-mnrs.icu` 帮助、`www.ai-mnrs.icu` 欢迎页和公网 `changelog-13.txt` 均为 200。UFW 仍只开放 22/80/443，`pm2-root` 与 release cleanup timer 均 enabled/active。
- 真实公网浏览器欢迎页标题为“AI 人生模拟器”，说明弹层显示当前版本 5.1.0，更新日志展示错误转译与 seed 修复两条说明，控制台 warning/error 为 0。
- 正式 3000 使用 `seed:null` 发起无 Key 的未知 Provider 探测后到达 Provider 校验并返回预期 `Unknown provider`，请求 ID `bec2a3ba-c4b5-481b-b652-ba447c773d37`；这证明旧空 seed 不再被请求 Schema 提前拒绝。发布命令首次转义错误留下的两条本机 `Invalid request body` 400 已按 `127.0.0.1` 和请求 ID 明确归类为人工探测，不是玩家故障。
- 清理 service 在新 symlink 上输出 `activePath=/root/ai-life-sim-releases/3e37f6e`、`activeAgeHours=0.1`、`minAgeHours=72`、`skippedReason=active-soak-incomplete`，本次未删除任何 release，新的完整三天回滚窗口已开始。

最终结论：5.1.0 已上线。生产日志发现的两个真实 `seed:null` 400 已在客户端与代理双层修复；玩家现在会看到可操作的 HTTP 错误说明和请求 ID，原始错误仍只保存在服务器脱敏日志中。
