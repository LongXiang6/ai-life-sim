# 界面体系权威

## 目标

界面体系负责让玩家完整、直观地完成创建、模拟、结算和辅助操作。玩家可感知结果以体验质量为主，兼顾文本质量、生成速度、低信息压力和符合使用习惯的操作；图标只在能增强理解时使用。

## 当前机制与边界

- Next.js 动态入口位于 `src/app/[mod-page]/` 和 `src/app/[...mod-page]/`，实际页面由 `src/mods/mod-pages/` 提供。
- 页面拥有渲染、导航和页面内临时交互状态；业务状态、计算、持久化和跨系统提交由所属 MOD 或 Core 服务负责。
- 页面通过公共入口调用所属系统，不从其他 MOD 私有目录建立第二套状态或写入路径。
- `docs/ui-prototypes/mobile/flow.html` 及其页面只在用户明确要求原型或视觉对照时作为界面资产，不定义运行时机制或全局执行流程。

## 界面树

```text
玩家界面
├─ 新人生主流程
│  ├─ 欢迎与新人生重置
│  ├─ 世界选择与世界配置
│  ├─ 角色创建、命格、属性与命运预览
│  ├─ 核心故事模拟
│  └─ 人生结算与下一世
├─ 玩家辅助
│  ├─ 存档管理
│  ├─ 账号与云端
│  ├─ 排行榜与邮箱
│  ├─ 四页设置
│  └─ 反馈
└─ 开发辅助
   ├─ 调试日志与运行时注册表
   └─ 独立只读数据查看器
```

## 新人生主流程

| 界面 | 要达到的目标 | 当前运行机制 | 所有权、边界与实时源 |
|---|---|---|---|
| 欢迎 | 提供开始新人生、继续游戏和辅助入口 | 页面根据可用存档和入口状态导航到对应流程；右上角两个圆形图标分别进入排行榜和邮箱，桌面手机示例框保持原型展示，不成为桌面页面容器 | 页面：`src/mods/mod-pages/pages/welcome/`；不拥有存档、排行或邮箱状态 |
| 新人生重置 | 开始前隔离上一段人生，成功后进入世界选择 | `new-game` 页面调用统一重置逻辑；失败停留并允许返回或重试 | `src/mods/mod-pages/pages/new-game/`、`src/mods/mod-pages/helpers/new-life-reset.ts`；不由各创建页分散清理 |
| 世界选择 | 选择已有世界或进入自定义世界，并保持可识别的选择状态 | 页面读取世界候选和生成缓存，确认后进入配置或下一步 | `src/mods/mod-pages/pages/world-select/`；世界事实由 `mod-world` 所有 |
| 世界配置 | 编辑并确认当前世界的创建参数 | 页面维护创建草稿，确认时通过世界公共能力初始化或更新当前上下文 | `src/mods/mod-pages/pages/world-customize/`；世界上下文与持久化由 `mod-world` 所有 |
| 角色创建 | 确认身份、寿命、背景等开局信息 | 页面使用创建草稿承接未完成输入，确认后写入角色公共状态 | `src/mods/mod-pages/pages/character-create/`；角色事实由 `mod-character` 所有 |
| 命格抽取与选择 | 生成有效候选并完成普通命格选择；轮回天赋保持独立 | 页面负责请求状态、候选展示和选择交互，确认结果进入角色链路 | `src/mods/mod-pages/pages/talent-draw/`、`src/mods/mod-character/`；生成协议由叙事/AI 链路所有 |
| 属性分配 | 调整并确认玩家可见的基础属性，命格修正保持独立 | 页面操作创建期基础值，确认后通过 `character-base` 所属公开状态提交 | `src/mods/mod-pages/pages/attribute-alloc/`；后续叙事写入仍受核心模拟字段契约限制 |
| 命运预览 | 在正式模拟前完成最后核对并进入第一轮 | 页面汇总已确认的世界、角色和命格信息，确认后启动模拟 | `src/mods/mod-pages/pages/fate-preview/`；不复制所属系统状态 |
| 核心故事 | 展示故事、流式状态、分支选择、错误和继续推进 | 页面调用引擎回合入口并消费 `EngineStore` 投影；分支结果由引擎提交 | `src/mods/mod-pages/pages/game-story/`；详细机制见 [核心模拟](core-simulation.md) |
| 人生结算 | 展示本局结果、人生记录、评分、轮回结果和新人生入口 | 页面读取已完成的引擎与角色结果，使用逐轮迁移审计组装完整评分输入，消费核心评分结果与第二人称评语，并执行分享、战绩同步、画像资格请求、轮回选择或重新开始；页面不把迁移状态硬编码为可信 | `src/mods/mod-pages/pages/game-over/`、`src/core/scoring/`、`src/mods/mod-character/mythic-library-store.ts`；结算页不建立第二套评分公式，服务端仍会独立复算资格 |

`src/mods/mod-pages/pages/world-build/` 仅将旧路由重定向到世界配置，不是第二套世界创建界面。

## 玩家辅助界面

| 界面 | 要达到的目标 | 当前运行机制 | 所有权、边界与实时源 |
|---|---|---|---|
| 存档管理 | 识别、加载和管理本地存档槽 | 页面调用统一收集、保存和恢复入口，并显示操作结果 | `src/mods/mod-pages/pages/save-manager/`、`src/core/storage/`；恢复原子性见 [逻辑体系](logic-tree.md#存档与恢复) |
| 账号与云端 | 提供可选登录、账号内容和云端数据操作 | 页面通过账号客户端状态和账号 API 获取或提交账号拥有的数据 | `src/mods/mod-pages/pages/account/`、`src/core/account/`；本地存档与账号数据不互相冒充所有者 |
| 排行榜 | 查看分数超过 97 的账号最佳人生 | 页面读取服务端只读投影，按分数、轮数、完成时间和记录 ID 的稳定顺序展示用户名、角色、世界、维度、大事、第二人称评语及可用画像 | `src/mods/mod-pages/pages/leaderboard/`、`src/core/player-content/`；页面不复制完整故事、存档或评分计算 |
| 邮箱 | 查看当前账号的满分画像邮件并标记已读 | 页面只读取当前登录账号邮件，按需打开受控画像资产；未登录、处理中、失败和空邮箱各有明确状态 | `src/mods/mod-pages/pages/mailbox/`、账号邮箱 API、`src/core/player-content/portrait-mail-service.ts`；页面不拥有邮件或画像任务状态 |
| 设置 | 调整阅读界面、叙事偏好、模型调用并查看自己的数据统计 | 设置弹层固定四个 Tab：`阅读与界面 / 叙事偏好 / 模型与调用 / 数据统计`。叙事文风为空时使用默认，编辑稿经“保存当前风格”才生效，可“恢复默认”；思考模式为关闭、自动、深入、最大；统计页只显示当前浏览器/存档的 Token、内部调用池缓存、每轮与累计费用及自定义 DeepSeek Key 余额 | `src/mods/mod-settings/`；不显示原始 Prompt、其他用户、设备来源或管理者入口，请求与计费计算由 AI 服务负责 |
| 反馈 | 提交玩家描述并展示提交状态 | 页面静默构建完整诊断请求，经 API 明文保存后返回反馈编号 | `src/mods/mod-pages/pages/feedback/`、`src/core/logger/` 和反馈 API；不设置诊断同意步骤，具体链路见 [逻辑体系](logic-tree.md#诊断与反馈) |

## 开发辅助界面

调试日志页用于开发环境内直接查看明文 SQLite 中的 Prompt、AI 响应、叙事、错误、完整载荷、设备来源编号及注册账号 ID、用户名或匿名状态，也可查看运行时注册表。页面位于 `src/mods/mod-pages/pages/debug-log/`，数据来自对应调试 API 和运行时注册表；它不拥有日志事实或模拟状态。

独立管理者数据查看器通过 `npm run data:viewer` 启动单独 Node 进程，默认只监听 `127.0.0.1:4318`。它不注册玩家路由，也不进入欢迎页、玩家导航或设置；只读打开现有日志库、账号库、玩家内容库、逐存档记忆库、逐轮 TXT 和开发系统诊断 JSONL，提供总览、AI 调用、回合链路、系统诊断、压缩记忆、用户关联、数据库结构和只读查询八个视图。系统诊断可按状态、系统、人生 ID、轮次、错误和详情筛选；长内容全文展示，列表使用稳定分页且不改写数据。实时源为 `scripts/ops/data-viewer.mjs`。

## 相关实时源

- 页面注册与公共边界：`src/mods/mod-pages/manifest.ts`、`src/mods/mod-pages/index.ts`
- 共享界面组件：`src/mods/mod-ui/`
- 页面运行实现：`src/mods/mod-pages/pages/`
- 完整跨页流程：[逻辑体系](logic-tree.md)
- 状态所有权：[系统体系](system-tree.md)
