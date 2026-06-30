# Prompt 结构化优化方案

> 变更级别：L3 | 日期：2026-06-23

## 目标

1. 叙事格式：固定3段 → 多个段落
2. 风格切换：变量注入 → 直接注入完整提示词
3. 取消人生方向系统（与模拟数据冲突）
4. 移除叙事原型（依赖人生方向）
5. System Prompt 结构化重写

## 迭代 1：Prompt 文本优化

### 变更合约

| 维度 | 内容 |
|------|------|
| **变更目标** | 叙事格式改为多段落 + 风格直接注入提示词 + System Prompt 结构化 |
| **影响范围** | `narrative-prompt.ts`、`orchestrator-system.ts`、`SettingsTabPrompt.tsx` |
| **不受影响范围** | 其他 Prompt 文件、store、types |
| **锁定项** | `PromptContext` 接口不变、`buildPrompt()` 机制不变 |

### 文件清单

| 文件 | 改动 |
|------|------|
| `narrative-prompt.ts` | 改写 SYSTEM_PROMPT 为结构化格式 + 移除硬编码风格选择 + 移除叙事原型 + 3段→多段落 |
| `orchestrator-system.ts` | `getNarrativeStyle()` 改为返回完整提示词文本 |
| `SettingsTabPrompt.tsx` | MOCK_VARIABLES 同步更新 |

## 迭代 2：取消人生方向系统

### 变更合约

| 维度 | 内容 |
|------|------|
| **变更目标** | 移除 LifeDirectionSystem 及所有相关引用 |
| **影响范围** | ~15 文件 |
| **不受影响范围** | 其他子系统、Core 层（仅清理注册）、NarrativeDirection 类型（仍被 summary-compressor 使用） |

### 文件清单

| 操作 | 文件 |
|------|------|
| 删除 | `life-direction-system.ts` |
| 删除 | `direction-patterns.ts` |
| 删除 | `life-direction-prompt.ts`（campaign 专用 Prompt） |
| 修改 | `orchestrator-system.ts` — 移除 lifeDirection 引用 |
| 修改 | `campaigns/default/index.ts` — 移除 lifeDirection 引用 |
| 修改 | `campaigns/default/stages.generated.ts` — 移除 life-direction-check |
| 修改 | `manifest.ts` — 移除 LifeDirectionSystem 注册 |
| 修改 | `engine-subsystems.generated.ts` — 移除注册 |
| 修改 | `subsystems/index.ts` — 移除导出 |
| 修改 | `prompt-context-contract.generated.ts` — 移除 directionText |
| 修改 | `narrative-prompt.ts` — 移除 `{{directionText}}` 和对应 variable |
| 修改 | `plot-structure-system.ts` — 移除 lifeDirection 依赖 |
| 修改 | `SettingsTabPrompt.tsx` — 移除 mock directionText |
| 修改 | `remote-api-filter.ts` — 移除 lifeDirection |
| 修改 | `scripts/generate-mod-wiring.mjs` — 移除特殊处理 |
| 运行 | `npm run generate:wiring` |

## 迭代 3：清理叙事原型残留

### 文件清单

| 操作 | 文件 |
|------|------|
| 修改 | `narrative-prompt.ts` — 移除 NARRATIVE_PROTOTYPES |
| 修改 | `system-prompt.ts` — 移除 NARRATIVE_PROTOTYPES（重复定义） |
| 修改 | `narrative-config.ts` — 移除 buildDirectionInstruction 和 NARRATIVE_DIRECTION_DESCRIPTIONS |

## 验证标准

每个迭代完成后运行 `npm run lint` + `npx tsc --noEmit` + `npm run check`，均须 0 ERROR / 0 FAIL。
