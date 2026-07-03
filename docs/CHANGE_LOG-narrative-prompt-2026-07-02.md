# 叙事 Prompt 质量提升改动日志

日期: 2026-07-02
任务: 首轮叙事增强 + 反重复指令 + System Prompt 精简

## 改动文件

### 1. `src/mods/mod-engine/prompts/narrative-prompt.ts`

#### 2a.1: subsystemGuide 移出 System Prompt
- 将 `subsystemGuide` 字段从 `SYSTEM_PROMPT` 对象中移除
- 新建 `export const SUBSYSTEM_GUIDE` 常量为独立导出
- 由 orchestrator 在 user prompt 的 `subsystemGuideText` 字段中动态注入

#### 2a.2: defense 和 coreRequirements 精简约 30%
- coreRequirements L0: 6项 → 5项 (合并冗余条目)
- coreRequirements L1: 精简措辞
- coreRequirements L2: 3项 → 2项 (合并极端情况和世界观约束)
- defense: 精简各字段描述，去除重复

#### 2a.3: skillOperations 精简
- 移除重复说明和 `rules` 数组

#### 2b: narrative description 追加反重复约束
- 在 `output.schema.properties.narrative.description` 末尾追加:
  `⚠️ 严禁以"这一年""本年度""这一轮"作为段落或叙事开头...`

#### 2c: 新增 narrativeQuality 反重复约束节
- 在 `task` 字段前新增 `narrativeQuality.antiRepetition` 节:
  - 5 条反重复硬性规则
  - 推荐开头方式示例

#### 2d: 替换第一个示例为出生场景
- 旧: `示例0：婴儿期·感官认知` (抽象感官描述)
- 新: `示例0：首轮叙事·出生与家庭` (具体古代市井出生场景，展示如何避免"这一年"开头)

#### 2e: 新增 userPromptTemplate 变量
- 新增 `subsystemGuideText` 和 `timeGuideText` 字段到 userPromptTemplate
- 添加到 variables 数组

### 2. `src/mods/mod-engine/subsystems/orchestrator-system.ts`

#### 任务1: 首轮叙事指令注入
- 在 `if (totalRounds === 0)` 块中追加首轮叙事特殊指令
- 指令包含 5 条要求: 出生场景、家庭环境、时代背景、感官体验、叙事规范
- 追加到 `assembled.userInstruction` 字段

#### 2a.1 + 2e: 动态注入
- 导入 `SUBSYSTEM_GUIDE` 常量
- 当有可变更子系统时注入 `subsystemGuideText`
- totalRounds > 0 时注入 `timeGuideText` 时间描写指南

#### 任务3: triggerAutoSave 确认
- `triggerAutoSave()` 已由先前改动简化为无条件保存
- 间隔判断 (`autoSaveInterval` getter + `if (round !== 1 && round % interval !== 0) return`) 已移除

### 3. `src/foundation/types/narrative.types.ts`
- `PromptContext` 接口新增 `subsystemGuideText?: string` 和 `timeGuideText?: string` 字段

## 编译验证
- `npx tsc --noEmit`: 零错误通过
- `npm run lint`: 零错误通过
