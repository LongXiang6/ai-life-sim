# 架构迭代与自动化升级计划书

> **状态**: ✅ Phase 0–11 已落地（2026-06-25）  
> **日期**: 2026-06-25  
> **背景**: 修复 `useWorldStore.getState is not a function` 启动崩溃后的系统性架构升级。  
> **关联**: `.agents/skills/`、`scripts/check/rules/registry.json`、`scripts/gate-check.mjs`

---

## 1. 执行摘要

| 维度 | 结论 |
|------|------|
| **推倒重来 vs 迭代** | **按 ATCE 总成本决策**，非一律否。债务超阈值、同根因第 2 次 → 批准重构窗口；方向正确则迭代。 |
| **默认策略** | **架构优先**：长远最优 > 局部 patch；patch 需书面降级理由。 |
| **升级重点** | Barrel 分层、子系统实例化契约、域化 check、技能 ATCE 同步。 |
| **验证** | `npm run gate-check` ✅ · `npm run gate-check:quick` ✅ |

---

## 2. Phase 0 复盘（已完成）

根因：barrel 循环 + eager singleton + 构造期读 Store。  
已修复：`world-init-bundle` 动态 import、`luckSystem` 删除、`calibration-access` 防御、A-13~15。

---

## 3. 架构升级（Phase 2 — 已完成）

| # | 任务 | 状态 |
|---|------|------|
| A-01 | Barrel 轻/重分层 | ✅ `mod-world/world-init-api.ts`；`index.ts` 不再 re-export bundle |
| A-02 | 清除 eager singleton | ✅ luck / destiny；扫描 A-14 |
| A-03 | 重依赖动态化规范 | ✅ §6.55 + A-15 |
| A-04 | `global-store/slices` 瘦身 | ✅ 只 import 各 MOD `store.ts` |
| A-05 | `estimateTokenBudget` → Foundation | ✅ `foundation/utils/estimate-token-budget.ts` |
| A-06 | RemoteContract 漂移 | ✅ 排除 `*Schema` 导出；regenerate wiring |

---

## 4. 技能体系（Phase 1 — 已完成）

| # | 任务 | 状态 |
|---|------|------|
| S-01 | lessons-learned 沉淀 | ✅ |
| S-02 | subsystem.template §8.4 | ✅ |
| S-03 / S-04 | A-16 + B-26~28 | ✅ |
| S-05 | mod-index.template barrel 注释 | ✅ |
| S-06 | MOD作者清单 红线速查 | ✅ |
| S-07 | SKILL.md 范例引用 | ✅ |
| S-08 | mod-spec-architecture §6.55 | ✅ |
| S-09 | mod-architecture.mdc 红线 | ✅ |
| S-10 | mod-spec-subsystem §8.4 | ✅ |

---

## 5. 检测器（Phase 1–3 — 已完成）

| # | 任务 | 状态 |
|---|------|------|
| D-01 | A-16 构造期 Store 检测 | ✅ scan-typescript-wiring.mjs |
| D-02 | A-15 扩展（排除 mod-pages） | ✅ architecture-rules.json |
| D-03 | checker-self-test | 🟡 规则由 scan-typescript-wiring 覆盖（gate-check 强制） |
| D-04 | `check:quick` | ✅ |
| D-05 | `gate-check:quick` | ✅ |
| D-06 | ErrorOnly 摘要 | ✅ gate-check --quick 末尾摘要 |
| D-07 | 文件级 import 图 | ✅ scan-file-import-graph.mjs |
| D-08 | decision-tree L1 对齐 | ✅ |
| D-09 | D22 降噪 | ✅ 仅 VerboseOutput |
| D-10 | 规则单源 | ✅ `check/rules/registry.json` + architecture-rules.json |
| D-11 | 模板一致性扫描 | ✅ |
| D-12 | `check:structural` / `check:refactor` profile | ✅ profiles.mjs |
| D-13 | ATCE 报告信号 | ✅ atceRecommendation / refactorSignals / repeatOffenders |
| D-14 | changed 结构性叠加 | ✅ resolve-changed.mjs |

---

## 10. Phase 4 — 技能 ATCE 同步 + 检测器增强（已完成）

| # | 技能 (P0–P2) | 状态 |
|---|--------------|------|
| P0 | mod-spec-quality §16、SKILL-INDEX 7 步、code-review ATCE pillar、testing §3 | ✅ |
| P1 | mod-architecture.mdc、PM-08 单轨、ai-behavior D闸、本计划 Phase 4 | ✅ |
| P2 | atce-template.md、SKILL §22、lessons 同根因索引、MOD作者清单 | ✅ |

| # | 检测器 | 状态 |
|---|--------|------|
| 4a | `scripts/check/rules/registry.json` | ✅ |
| 4b | profiles structural / refactor | ✅ |
| 4c | report refactorSignals + atceRecommendation | ✅ |
| 4d | repeatOffenders（历史 checker/check-run） | ✅ |
| 4e | domains/structural README | ✅ |

---

## 6. 其他（已完成）

| # | 任务 | 状态 |
|---|------|------|
| O-01 | getXxxSystem 懒加载文档 | ✅ MOD作者清单 |
| O-03 | RemoteContract WARN | ✅ Schema 排除 |
| O-04 | L1 gate-check:quick | ✅ ai-behavior-rules |
| O-06 | code-review Module Loading pillar | ✅ |

---

## 7. 新增命令

```bash
cd ai-life-sim
npm run check:structural   # ATCE 编码前（= check:quick）
npm run check:refactor     # 架构重构（wiring + loader + mod）
npm run check:changed      # git 变更 + 结构性叠加
npm run check:quick        # L1 关闸 C3
npm run gate-check:quick   # L1：lint + tsc + check:quick
npm run gate-check         # L2/L3 全量
```

---

## 8. 关键新文件

| 路径 | 职责 |
|------|------|
| `src/mods/mod-world/world-init-api.ts` | 世界初始化重 API（secondaryPublicEntries） |
| `src/foundation/utils/estimate-token-budget.ts` | Token 预算唯一实现 |
| `scripts/architecture-rules.json` | 扫描器机器可读配置 |
| `scripts/check/rules/registry.json` | 规则元数据 + ATCE 关联 |
| `scripts/check/lib/atce-signals.mjs` | refactorSignals / repeatOffenders |
| `src/core/mod-loader/runtime-registry.ts` | RuntimeRegistry 冻结快照（data.raw 等价） |
| `src/mods/mod-engine/helpers/round-commit-bus.ts` | 回合状态提交总线 |
| `src/mods/mod-engine/helpers/narrative-interceptor-pipeline.ts` | 叙事拦截器三步链 |
| `scripts/check/domains/structural/scan-typescript-wiring.mjs` | codegen + A-13~16 + REFACTOR-HINT |
| `scripts/check/domains/structural/scan-file-import-graph.mjs` | 文件级循环 + 高度数 hint |
| `scripts/scan-*.mjs` | 兼容 re-export 入口 |
| `.agents/skills/ai-life-sim-skill/resources/atce-template.md` | ATCE 对比表模板 |

---

## 9. 验收（全部通过）

- [x] lessons-learned 含模块加载环条目
- [x] 子系统模板含 §8.4
- [x] check:quick / gate-check:quick 可用
- [x] 构造期 Store 读取被 scanner FAIL
- [x] RemoteContract Schema 误报消除
- [x] mod-world 轻量 import 不拉 world-init-bundle
- [x] slices 不拉 orchestrator 链
- [x] 文件级 import 图 0 环
- [x] check:structural / check:refactor 可用
- [x] check-run 报告含 atceRecommendation
- [x] 技能 P0–P2 + atce-template 同步
- [x] Phase 5：扫描器迁入 structural/ + REFACTOR-HINT

---

## 11. Phase 5 — 扫描器物理迁移 + REFACTOR-HINT（已完成）

| # | 任务 | 状态 |
|---|------|------|
| 5a | 扫描器迁入 `check/domains/structural/` | ✅ |
| 5b | `scripts/scan-*.mjs` 兼容 re-export | ✅ |
| 5c | REFACTOR-HINT（重 barrel / 单例 export / slices） | ✅ |
| 5d | 报告 `severity: hint` → `atce=REVIEW` | ✅ |
| 5e | import 图监视 mod index + 高度数 hint | ✅ |

---

*最后更新：2026-06-25 — Phase 13A–13D 核心已落地。*

---

## 18. Phase 13 — 世界一致性 + 命格流式（✅ 完成）

> **蓝图**：[BLUEPRINT-WORLD-COHERENCE-PHASE13.md](./BLUEPRINT-WORLD-COHERENCE-PHASE13.md) · [BLUEPRINT-TALENT-DRAW-STREAMING-PHASE13A.md](./BLUEPRINT-TALENT-DRAW-STREAMING-PHASE13A.md)

| # | 任务 | 状态 |
|---|------|------|
| 13A | 命格首批流式 + 进度充电 UI + 无效 ID / 槽位尺寸 + debug 日志 fallback | ✅ |
| 13B | Config AI 入库 · 上古史 coherenceHint · 校准缓存 · 实体 AI 条件跳过 | ✅ |
| 13C | essenceTag 推断 · 校准+标签合并 · 缓存 tags | ✅ |
| 13D | 性别默认 UX · fate-preview 5/5 进度 + currentStep | ✅ |
| **14** | 描述框 + 冲突弹窗 + 锁定 UI · WorldInitPipeline · Prompt 扩展 | ✅ |

---

## 19. Phase 14 — 世界配置 UX + Pipeline 重构（✅ 2026-06-25）

| # | 任务 | 状态 |
|---|------|------|
| 14A | world-build/customize 世界描述框 · worldviewEssence 映射 · applyCoherence 三入口 | ✅ |
| 14B | 冲突确认弹窗 + `_coherenceLocks` 锁定 UI | ✅ |
| 14C | `WorldInitPipeline` 步骤注册表（`world-init-pipeline.ts`） | ✅ |
| 14D | Prompt 扩展 `coherenceNote` + `worldType` | ✅ |

**调研输入：** `logs/ai-debug/world-init/` 20 条（原始时代 / 地猿）逐项审计，2026-06-25。

---

## 17. Phase 11 — 跨域校验 + Simulation Worker（已完成）

| # | 任务 | 状态 |
|---|------|------|
| 11a | `cross-domain-change-validator.ts` 专用 Zod + normalize | ✅ |
| 11b | 11 条跨域规则字段与子系统 applyChanges 对齐 | ✅ |
| 11c | RoundCommit `cross-domain` schema 校验 | ✅ |
| 11d | `simulation-kernel` 纯函数提取 | ✅ |
| 11e | `simulation.worker.ts` + `simulation-bridge.ts` | ✅ |
| 11f | orchestrator 跨域走 Worker（主线程降级） | ✅ |
| 11g | `useSimulationSnapshot` UI 订阅 | ✅ |

| # | 任务 | 状态 |
|---|------|------|
| 10a | `RuntimeRegistry` 冻结快照（data.raw 等价） | ✅ `runtime-registry.ts` + InitMods freeze |
| 10b | `RoundCommitBus` 唯一状态写入通道 | ✅ `round-commit-bus.ts` + orchestrator |
| 10c | Narrative Interceptor 三步链 | ✅ safety → schema → deadLoop |
| 10d | `FACTORIO-LIFECYCLE-MAP.md` 叙事回合映射 | ✅ |
| 10e | post-narrative 字段对齐（hp/hpDelta、fame/addFame） | ✅ |
| 10f | post-narrative 纳入 RoundCommit schema 校验 | ✅ |
| 10g | 调试页 RuntimeRegistry 面板 | ✅ `debug-log` → 运行时注册表 |

---

## 14. Phase 8 — 收尾三项（已完成）

| # | 任务 | 状态 |
|---|------|------|
| 8a | 删除 `mod-engine/subsystems/index.ts` mega barrel | ✅ |
| 8b | `export *` → A-01 **FAIL**；culture/economy/politics 移除 constants re-export | ✅ |
| 8c | `mod:create --with-subsystem [Name]` | ✅ |

---

## 15. Phase 9 — D-07 清零 + 删除遗留 barrel（已完成）

| # | 任务 | 状态 |
|---|------|------|
| 9a | 删除全部 MOD `subsystems/index.ts`（loader 已按文件 codegen） | ✅ |
| 9b | orchestrator / narrative-parser 依赖聚合模块 | ✅ |
| 9c | world-init / world-timeline 依赖聚合模块 | ✅ |
| 9d | D-07 子系统文件 FAIL 阈值 16→14 | ✅ |

---

## 13. Phase 7 — D-07 FAIL + 按文件子系统 codegen + mod:create（已完成）

| # | 任务 | 状态 |
|---|------|------|
| 7a | `MOD_SUBSYSTEM_IMPORTERS` 按 manifest 逐文件 import | ✅ |
| 7b | D-07：`subsystems/index.ts` ≥10 → FAIL（mod-engine 豁免） | ✅ |
| 7c | `mod:create` 生成 `_internal/control.ts` + 轻量 index | ✅ |
| 7d | `destiny-pattern-access.ts` 脱离 character barrel | ✅ |
| 7e | 删除 culture/power 无用 subsystems barrel | ✅ |
| 7f | registry A-17 + D-07 描述更新 | ✅ |

---

## 12. Phase 6 — Factorio 生命周期对齐（已完成）

| # | 任务 | 状态 |
|---|------|------|
| 6a | `MOD_CONTROL_IMPORTERS` 窄 lifecycle 入口 | ✅ |
| 6b | `MOD_SUBSYSTEM_IMPORTERS` 子系统注册分离 | ✅ |
| 6c | `MOD_API_IMPORTERS` Remote 延迟注册 | ✅ |
| 6d | `prototype-stage.ts` 三回合校验 | ✅ |
| 6e | `mod-engine/engine-api.ts` + index 瘦身 | ✅ |
| 6f | 全 MOD `_internal/control.ts` | ✅ |
| 6g | 全 MOD index 移除 subsystems export | ✅ |
| 6h | A-01 / A-14 / A-17 → FAIL | ✅ |
| 6i | `docs/FACTORIO-LIFECYCLE-MAP.md` | ✅ |
