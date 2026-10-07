# 项目标准化契约

本文件是 AI 人生模拟器对全局标准化理念的项目化落地。全局优先级、任务流程和唯一所有权只以 `D:\AI\AGENTS.md` 为准；本文件只规定本项目的目录、文件、格式、命名、写法、排序和验收细节。

## 目标

- 让技能、权威文档、源码、配置、测试、日志和生成文件都能被稳定定位、读取、校验和交接。
- 让机器可判断的约束进入统一检查，让业务差异留在所属系统，不因格式统一复制第二份状态或规则。
- 让同一事实只有一个命名源、一个所有者、一个公开契约和一个验收入口。

## 技能标准

跨项目通用理念只位于 `D:\AI\.agents\skills`，AI 人生模拟器高度特化 Skill 只位于 `D:\AI\ai-life-sim\.agents\skills`。每个 Skill 使用一个 ASCII 小写 kebab-case 目录，目录根部只允许以下入口：

```text
<skill-id>/
├─ SKILL.md
├─ agents/openai.yaml
├─ references/       # 可选，按需加载的项目事实或专项流程
├─ assets/           # 可选，模板和静态资源
└─ scripts/          # 可选，Skill 自有检查或操作脚本
```

`SKILL.md` 必须按固定顺序包含以下二级标题，标题不得重复或跳级：

1. `目标`
2. `适用范围`
3. `执行契约`
4. `权威与实时源`
5. `边界`
6. `验收`

frontmatter 只保留 `name`、`description` 两个字段，字段顺序固定；`name` 必须等于目录名。`agents/openai.yaml` 只保留 `interface.display_name`、`interface.short_description`、`interface.default_prompt`，按该顺序书写。`SKILL.md` 优先不超过 120 行，详细资料放在一层 `references/` 并由入口按需索引。

Skill 指令行使用 `[核心原则]`、`[次要规则]`、`[辅助说明]` 标注权重，并按该顺序组织。

每条 Skill 指令承担一个职责，相邻段落共同约束一个主题，表达采用目标状态、执行动作和验收结果。

Prompt 专项语义、缓存排列和样品规则由 [Prompt 标准](../../ai-life-sim-prompt-engineering/references/prompt-standard.md) 负责。

## 文件与目录标准

- 目录和机器文件名默认使用 ASCII 小写 kebab-case；子系统文件使用 `{subsystem-id}-system.ts`，MOD 目录使用 `mod-{name}`。
- `SKILL.md`、`README.md` 和活动权威使用 Markdown；机器配置使用 JSON；Skill 入口使用 YAML；运行代码使用 TypeScript/JavaScript；脚本扩展名必须与解释器一致。
- Skill reference 文件名使用 ASCII 小写 kebab-case。
- 生成文件使用 `.generated` 文件名标识，并在文件头写明自动生成、生成源和禁止手工编辑；临时文件只能进入项目既有临时目录。
- 文件必须归入所属项目、体系、系统和所有者；根目录不放散落副本，不以页面或聚合器持有业务真源。
- 手写活动源码、样式、测试、扫描器和运维脚本优先保持在 300 行以内；超过目标时先判断是否职责混杂或持续膨胀，确属单一职责的静态数据、生成物、第三方内容和只读历史证据可以具名保留。
- 新建或本次修改的手写代码文件在顶部声明 `Purpose`、`Owner` 和 `Responsibility`；跨部门或用途不直观的引用在引用处说明用途，普通同目录引用不重复注释。

## 编码与格式标准

- 文本统一 UTF-8、无 BOM、LF 换行、单一文件末尾换行；禁止制表符和行尾空白。
- Markdown 使用一个一级标题，标题层级连续，二级标题不重复；列表、表格和代码围栏前后保持稳定空行。
- JSON 使用 2 个空格缩进、合法 JSON、末尾换行；对象键顺序按所属 Schema，集合型数组按稳定 ASCII 升序，业务执行数组按公开 `order` 保持语义顺序。
- YAML 只使用项目约定的键和缩进；禁止隐式重复键、制表符和未声明字段。
- TypeScript/JavaScript 采用现有 ESLint/TypeScript 写法；公共入口、状态码、依赖、所有者和失败反馈显式声明，不用枚举顺序、对象遍历或自然语言决定运行顺序。

## 命名、写法与排序标准

- 稳定机器标识、文件名、导出名、注册键和生成常量从同一声明源派生；显示名称不能作为机器主键。
- 新建或本次修改的标识按系统树命名表执行；已经进入公共契约或持久数据且没有实际冲突的旧名称不做无意义批量重命名。
- 文档先写目标，再写当前机制、权责边界、实时源和验收；Skill 只写可复用规则，活动权威只写当前事实。
- 同层同类文件、规则、Skill 路由和配置字段使用确定顺序；可排序集合按 ASCII 升序，执行阶段、依赖和活动成员按显式 `order`，不得以字典序覆盖业务顺序。
- 自动化只完成加载、注册、接线、排队、格式校验、状态流转和诊断；业务判断、业务状态和业务结果仍归所属系统。
- `scripts/check/rules/project-structure.json` 是目录、预算和所有者规则唯一机器契约；`scripts/check/generated/project-structure-index.generated.json` 从实时目录自动生成定位索引，不生成全量 barrel 或第二业务真源。

## 统一验收

运行 `npm run generate:structure-index` 更新自动结构索引，运行 `npm run check:standardization` 检查 Skill 结构、frontmatter、YAML 键序、文件命名、文本编码、Markdown 标题、JSON 格式、稳定排序、生成标记、引用、所有权、文件头、优先预算和索引漂移。该检查作为 `npm run check`、`npm run check:structural`、`npm run check:quick`、`npm run check:refactor` 和 `npm run gate-check` 的固定步骤执行。

文件预算以优先预算为基准，当前文件长度达到优先预算的 120% 以内时允许保留；超过 120% 才需要通过 `scripts/check/rules/file-budget-exceptions/` 的所属分片记录路径、所有者、审查行数和单一职责理由。已登记例外的增长同样不得超过审查上限的 120%。门禁仍拒绝空理由、重复路径、所有者漂移、继续增长和过期例外。存量缺失文件头以内容哈希建立迁移基线，内容变化后必须补齐文件头。不得通过静默跳过、兼容层、旁路或第二套配置绕过检查。
