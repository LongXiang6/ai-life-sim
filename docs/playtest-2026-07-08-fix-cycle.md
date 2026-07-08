# 2026-07-08 修复后复测记录

## 范围

依据 `docs/` 现有计划、`playtest-2026-07-08-full-click-restart.md` 的问题清单，以及项目 `.agents` 测试关闸执行本轮修复与复测。

本轮未写入任何 API Key 或本地密钥文件。

## 修复项

| 编号 | 问题 | 处理结果 |
|------|------|----------|
| P1-01 | `/save-manager` 未注册 | 已在 `mod-pages` 路由表注册。 |
| P1-02 | `/debug-log` 未注册 | 已在 `mod-pages` 路由表注册。 |
| P1-03 | game-over 可被未死亡角色直接进入 | 已增加守卫：未完成/未死亡状态直接返回故事页或欢迎页。 |
| P1-04 | 自动保存状态被预生成快照恢复覆盖 | 已在 orchestrator 快照恢复时保持 `lastAutoSaveRound` 单调不回退。 |
| P1-05 | 时间步长粗粒度切细粒度被误判为推进错误 | 项目关闸要求保留“粗到细先对齐到未叙事周期”。本轮恢复该核心逻辑，并在时间步长菜单补充说明，避免用户误解为月/日推进算法错误。 |
| P2-01 | 角色创建寿命检测不回填输入 | 已回填寿命上限和起始年龄输入，并按寿命上限钳制起始年龄。 |
| P2-02 | 自定义种族添加后仍受搜索过滤影响 | 添加后清空搜索、选中新种族并关闭种族面板。 |
| P2-03 | 背景预设保存无反馈/空名称无效果 | 背景非空时允许自动生成预设名，并处理重名后缀。 |
| P2-04 | 移动端角色页保存预设区靠近底部栏 | 已增加最后一段内容底部间距。 |
| P2-05 | 命格卡片非语义按钮 | 已将可点击命格卡改为 `button`，并补充 `aria-label` 和禁用态。 |
| P2-06 | 命格库数量含义不清 | 已改为同时展示“本次候选”和“本地库”。 |
| P2-07 | 命格生成加载文案过于技术化 | 已替换明显技术术语文案，保留玩家可读表达。 |
| P2-08 | 手动存档关闭后反馈弱 | 已在保存成功后追加全局 toast。 |
| P2-09 | 说明文档陈旧 | 已重写 `public/help.md` 为当前流程说明。 |
| P2-10 | 更新日志加载更多无实际内容 | 已补 `changelog-1.txt` 与 `changelog-2.txt`，重写 changelog 解析器，并过滤 Next catch-all 返回的非 changelog 页面，避免误判不存在的分片。 |
| P2-11 | 自定义世界保存无反馈、删除无二次确认 | 已补保存/编辑/删除反馈；删除改为“删除 → 确认/取消”二段式，确认后清理该世界生成缓存。 |
| P2-12 | 移动端故事页顶部状态栏与叙事区挤压 | 已为 `game-story` 增加 640px 以下响应式折叠：顶部左右区纵向排列，控制按钮两列网格，正文区独立滚动且禁止横向溢出。 |
| P2-13 | 存档弹窗在中等/移动宽度下控件偏挤 | 已将 `SaveDialog` 从 Tailwind 内联类迁移到 CSS Module，补齐弹窗响应式布局；手机槽位换行、按钮纵向排列，中等宽度五槽一行。 |
| P2-14 | UI token 治理缺少 effects/glass/radius/motion 基础 token | 已新增 `foundation/tokens/effects.css` 并在 `mod-ui/tokens.ts` 暴露 radius/motion/glass token，`SaveDialog` 改为引用 token。 |
| P2-15 | 命格卡片底栏有/无修正时高度不稳定 | 已给命格底栏补最小高度，保留虚实分隔线和“无数值修正”占位。 |

## docs 其他清单核对

| 文档 | 项目 | 当前结论 |
|------|------|----------|
| `plan-2026-07-08-gpt-fix-followup.md` | P0-1 属性短时间步长可能恒为 0 | 已核对：`resolveCharacterAttributeDeltaLimit()` 有 `MIN_PERCEPTIBLE_ATTRIBUTE_DELTA = 1` 下限，`clampCharacterAttributeDelta()` 已按 `daysPassed` 使用。 |
| `plan-2026-07-08-gpt-fix-followup.md` | P0-2 叙事降级分支 JSON Mode 未显式关闭 | 已核对：默认叙事 campaign 的 `streamOpts` 已显式 `jsonMode: false`，并传给 `callAIDegraded()`。 |
| `plan-2026-07-08-gpt-fix-followup.md` | P1-1 穿越者检测双实现 | 已核对：`detectStartingAge()` 与 `TRANSMIGRATOR_KEYWORDS` 已迁入 `core/shared/character-origin.ts`，创建页与 `CharacterBaseSystem` 共用。 |
| `plan-2026-07-08-gpt-fix-followup.md` | P1-2 命格卡片底栏细化 | 已补稳定最小高度；已有虚实分隔线、空占位和语义按钮。 |
| `plan-2026-07-08-gpt-fix-followup.md` | P1-3 寿命关键词兜底双扣风险 | 已核对：`LifespanSystem` 记录 `_lastStructuredDeltaRound`，同轮已有结构化 `lifespanDelta` 时跳过关键词兜底。 |
| `plan-2026-07-08-gpt-fix-followup.md` | P1-4 E2 UI token 治理 | 本轮完成 effects/glass/radius/motion token 基础层与 `SaveDialog` 落地；全项目历史硬编码 px 仍属于后续大范围治理，不在本轮全部重写。 |
| `proposal-2026-07-07-skill-updates.md` | `.agents` 规则体系固化提案 | 已核对：该文档状态已为“已落地（2026-07-07）”；`.agents` 中已存在 B-49/B-50/B-51/B-52、E-09/E-10、P-10/P-11 等镜像规则。本轮无需重复修改规则体系。 |

## 复测结果

| 检查 | 结果 |
|------|------|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run check:structural` | PASS |
| `npm run check:ui` | PASS |
| `npm run build` | PASS |
| `npm run gate-check` | PASS |
| HTTP 路由探测 | `/save-manager`、`/debug-log`、`/game-over`、`/new-game/world-select`、`/new-game/character-create`、`/talent-draw`、`/game-story` 均返回 200 |
| 静态资源探测 | `/help.md`、`/changelog-2.txt` 返回 200 |
| 浏览器点击：自定义世界 | `/new-game/world-select` 展开自定义世界，空表单添加按钮禁用；填写后出现“已保存自定义世界「自动化测试世界」。”；已保存世界列表显示新世界。 |
| 浏览器点击：删除确认 | 点击删除后出现“确认/取消”和缓存清理提示；取消恢复为删除按钮；确认后列表变为“暂无已保存的自定义世界”，确认按钮回到禁用。 |
| 浏览器点击：真实存档进入故事页 | 欢迎页点击“继续模拟 — 林清和”进入 `/game-story`，可见完整故事、顶部状态栏和控制按钮。 |
| 浏览器响应式：故事页 390x844 | `documentElement.scrollWidth = 390`；`headerInner` 为纵向 flex；`controlRow` 为两列 grid；`mainArea` 独立纵向滚动。 |
| 浏览器响应式：SaveDialog 390x844 | 页面无横向溢出；弹窗 `overflow-x:hidden`；槽位 4 列换行；操作按钮纵向排列。 |
| 浏览器响应式：SaveDialog 973x898 | 页面无横向溢出；槽位 5 列一行；操作按钮横向排列。 |

## 浏览器长流程说明

本轮使用 Codex in-app browser 完成了部分真实点击复测：世界自定义新增/删除、真实存档进入故事页、移动故事页布局、存档弹窗响应式布局。

受限于当前测试环境：

- 浏览器插件的 `domSnapshot()` 仍会报 `incrementalAriaSnapshot is not a function`，本轮改用只读 DOM evaluate 与真实按钮点击完成验证。
- 浏览器只读 evaluate 环境不能访问 `localStorage`，因此未通过注入状态伪造故事页；故事页复测改用欢迎页已有真实存档进入。
- 本轮未重新跑“输入 API Key → DeepSeek 生成完整新角色 → 推进多轮叙事”的端到端 AI 长流程，避免把测试 API Key 写入文件或持久化记录。

## 后续复测建议

如需继续做完整“从设置 API Key 到推进多轮叙事”的端到端点击，应在浏览器会话中临时输入测试 key，并在复测后清理本地配置；测试记录中不得落盘 API Key。
