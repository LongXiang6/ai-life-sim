# 蓝图：跨 MOD 公共函数库 shared/ 整合

> 生成时间：2026-06-30  
> P（Plan）阶段 — 待用户确认后进入 D（Do）  
> 来源：技能文件 `mod-dev-skill/SKILL.md` + `SKILL-INDEX.md` + `ARCHITECTURE.md`  
> 核心约束：被 2 个以上 MOD 调用的纯函数必须放在 `src/core/shared/`（B-45 禁止多 MOD 重复实现）

---

## 一、定级

| 维度 | 判定 |
|------|------|
| 触及范围 | 6 个 MOD + 3 个 core 文件 |
| 风险 | 中 — 修改 import 路径，需逐 MOD 验证编译 |
| 是否会破坏持久化 | 否（仅函数迁移，不修改数据结构） |
| **定级** | **L2**（跨 MOD、触及 core/shared/） |

---

## 二、现状：shared/ 被架空

`src/core/shared/` 已有 4 个文件、15 个函数，但 MOD 层几乎不使用：

| shared/ 文件 | 函数数 | 被 MOD import? |
|-------------|--------|---------------|
| `common-utils.ts` | 6 | ❌ 无 MOD 引用（`randomInt` 已存在但 6 个 MOD 重复定义 `randomInRange`） |
| `character-utils.ts` | 4 | ❌ `mod-character` 另有一套 `getHealthStatusLabel`/`getMentalStateLabel` |
| `world-utils.ts` | 3 | ⚠️ 未验证 |
| `narrative-utils.ts` | 3 | ❌ `mod-engine` 有自己的 `estimateTokens`（与 shared 的 `estimateTokenCount` 功能重复） |

MOD 的 `utils.ts` 普遍采用 `export { clamp, round, pickRandom } from '@/foundation'` 做 re-export，完全不经过 shared/。

---

## 三、变更合约

### A 类：已存在 shared/ 等价物 → 删除 MOD 端重复，统一 import shared/

| # | MOD 端重复 | 文件 | shared/ 等价 | shared/ 文件 |
|---|-----------|------|-------------|-------------|
| A1 | `randomInRange(min, max)` | mod-economy/utils.ts | `randomInt(min, max)` | common-utils.ts |
| A2 | `randomInRange(min, max)` | mod-politics/utils.ts | ↑ | ↑ |
| A3 | `randomInRange(min, max)` | mod-tech-level/utils.ts | ↑ | ↑ |
| A4 | `randomInRange(min, max)` | mod-culture/utils.ts | ↑ | ↑ |
| A5 | `randomInRange(min, max)` | mod-environment-ecology/utils.ts | ↑ | ↑ |
| A6 | `clampNumber` → `clamp` | mod-power-system/utils.ts（import 行） | `clamp` | common-utils.ts |
| A7 | `clampNumber` → `clamp` | mod-tech-level/utils.ts（import 行） | `clamp` | common-utils.ts |

> **注**：`system-safety.ts` 的 `clampNumber` **不动**——其实现多了 `safeNumber()` 安全转换，不是 `clamp` 的重复实现。

**A 类的波及范围**：删除函数定义 + 更新各 MOD 内所有调用点的 import。

### B 类：应提取到 shared/ 的新函数

| # | 函数 | 当前所在 MOD | 调用方数量 | 目标文件 |
|---|------|------------|-----------|---------|
| B1 | `computeAverage(values: number[])` | mod-power-system/utils.ts + mod-tech-level/utils.ts（**重复定义**） | 2 MOD | `shared/common-utils.ts` |
| B2 | `filterDigitsOnly(value: string)` | mod-character/utils.ts | 1 MOD（但属于通用字符串工具，建议提取） | `shared/common-utils.ts` |
| B3 | `isBlank(str: string)` → 工具函数定义 | 新函数 | —（**仅定义，本次不替换 15 处调用点**，另开蓝图） | `shared/common-utils.ts` |
| — | `pickRandom`/`ROUND_DECIMALS`/`round` re-export 统一 | — | — | **本次不动**（foundation 已是单一来源，MOD re-export 不违规则） |

### C 类：shared/ 现有函数补全注释

技能文件 B-46 要求 shared/ 每个导出函数必须写：功能说明 + `@param` + `@returns` + `@example`（至少一个实际用法）+ 典型使用场景。

| 文件 | 当前注释状态 | 需补充 |
|------|------------|--------|
| `common-utils.ts` | 有简短描述 | 补 `@example` + 使用场景 |
| `character-utils.ts` | 有 `@param` 缺 `@example` | 补 `@example` + 使用场景 |
| `world-utils.ts` | 缺 `@param`/`@example` | 全补 |
| `narrative-utils.ts` | 缺 `@example` | 全补 |

---

## 四、改动文件清单（14 个文件）

### shared/ 直接修改（4 个）

| 文件 | 操作 | 具体改动 |
|------|------|---------|
| `src/core/shared/common-utils.ts` | **扩充** | 新增 `computeAverage`、`filterDigitsOnly`、`isBlank`；补全所有注释 |
| `src/core/shared/character-utils.ts` | **注释补全** | 补 `@example` + 使用场景 |
| `src/core/shared/world-utils.ts` | **注释补全** | 补 `@param` `@example` |
| `src/core/shared/narrative-utils.ts` | **注释补全** | 补 `@example` |

### MOD utils.ts 修改（8 个 — 删除重复函数 + 更新 import）

| 文件 | 操作 |
|------|------|
| `src/mods/mod-economy/utils.ts` | 删除 `randomInRange` 定义（已有 `shared/` 的 `randomInt`），更新调用方 import |
| `src/mods/mod-politics/utils.ts` | 同上 |
| `src/mods/mod-tech-level/utils.ts` | 删除 `randomInRange` + `computeAverage`，更新 import |
| `src/mods/mod-culture/utils.ts` | 删除 `randomInRange`，更新 import |
| `src/mods/mod-environment-ecology/utils.ts` | 删除 `randomInRange`，更新 import |
| `src/mods/mod-power-system/utils.ts` | 删除 `computeAverage` + `clampNumber` → `clamp`，更新 import |
| `src/mods/mod-character/utils.ts` | `filterDigitsOnly` 改为 re-export from shared/，保留 character 专属函数 |
| `src/mods/mod-engine/helpers/system-safety.ts` | **不动**（见上方注：其 `clampNumber` 含 `safeNumber` 逻辑，不是重复实现） |

### 调用方修改（需搜索确认）

| 涉及文件 | 操作 |
|---------|------|
| mod-economy 调用 `randomInRange` 的位置 | import 路径改为 `@/core/shared` 的 `randomInt` |
| mod-culture 调用 `randomInRange` 的位置 | ↑ |
| mod-environment-ecology 调用 `randomInRange` 的位置 | ↑ |
| mod-power-system 调用 `computeAverage` 的位置（monster-system.ts 等） | ↑ |
| mod-tech-level 调用 `computeAverage`/`randomInRange` 的位置 | ↑ |
| 15 个 `isBlank` 替代点（orchestrator/narrative-parser/summary-compressor 等） | 改为 `import { isBlank }` |
| `remote-contracts.generated.ts` | **不手动改** — 由 `npm run generate:wiring` 自动重新生成 |

---

## 五、不变更项

| 函数 | 原因 |
|------|------|
| `getHealthStatusLabel` / `getMentalStateLabel`（mod-character） | character 专属业务逻辑，阈值不同于 shared 的 `getHealthStatus`；保持 MOD 内 |
| `inferDeathCause` / `shouldSkipOldAgeDeath` 等（mod-character） | character 专属，不跨 MOD |
| `getUnitName` / `formatCombatPower` 等（mod-power-system） | 战力系统专属，不跨 MOD |
| `applyCeilingSuppress`（mod-difficulty） | 难度系统专属 |
| `estimateTokens`（mod-engine） vs `estimateTokenCount`（shared/narrative） | 算法一致但保留两个入口（mod-engine 的带冗余系数，shared 的是基础版本）；后续再统一 |

---

## 六、验收标准

1. `npx tsc --noEmit` 全通过
2. `npm run lint` 全通过
3. 6 个 MOD 的 `randomInRange` 定义全部删除
4. 2 个 MOD 的 `computeAverage` 定义全部删除
5. `system-safety.ts` 不再定义 `clampNumber`
6. shared/ 4 个文件每个导出函数有 `@param`/`@returns`/`@example` 注释
7. `npm run generate:wiring` 重新生成后无异常
