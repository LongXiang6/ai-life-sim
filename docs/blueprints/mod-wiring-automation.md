# MOD 接线自动化方案

> **状态**: ✅ 已实施  
> **日期**: 2026-06-22（Phase 6 更新：importers 迁 core + compat/migrations codegen）

## 目标

用「声明 + codegen + 运行时校验 + 扫描器兜底」替代手写 `MOD_IMPORTERS`、子系统别名等易断裂接线，防止路径/调用断裂。

## 架构

```
manifest.ts (声明 subsystems / remoteApi)
        ↓
generate-mod-wiring.mjs (构建期扫描)
        ↓
*.generated.ts (importers / aliases / engine map / remote contracts)
        ↓
register-subsystems.ts + mod-lifecycle (运行时加载)
        ↓
validate-remote-contracts.ts (开发环境契约校验)
        ↓
check-format.ps1 D35 (CI 漂移检测)
        ↓
test-mod-loader.mjs (加载器回归)
```

## 生成文件

| 文件 | 职责 |
|------|------|
| `src/mods/registry.generated.ts` | 全部 MOD manifest 注册表 |
| `src/core/mod-loader/mod-importers.generated.ts` | 全部 `mod-*` 的静态 `import()` 映射（Core 层） |
| `src/core/mod-loader/compat-importers.generated.ts` | `compatibility/{otherMod}.ts` 静态映射 |
| `src/core/mod-loader/migration-importers.generated.ts` | `migrations/{from}-{to}.ts` 静态映射 |
| `src/mods/mod-engine/bootstrap/mod-importers.generated.ts` | 薄 re-export（向后兼容） |
| `subsystem-aliases.generated.ts` | 子系统类名 → 非默认 camelCase 单例名 |
| `engine-subsystems.generated.ts` | mod-engine 内部子系统单例统一导出 |
| `remote-contracts.generated.ts` | 各 MOD `index.ts` 函数导出契约 |

## 使用方式

```bash
npm run generate:wiring   # 重新生成接线文件
npm run test:loader       # MOD 加载器回归测试
npm run check             # 校验生成物未漂移 + 架构扫描
```

新增 MOD 后只需：

1. 在 `src/mods/` 下创建 `mod-*` 目录 + `manifest.ts`（无需手写 registry）
2. 运行 `npm run generate:wiring`（`dev` / `build` 已自动执行）
3. 在 manifest 中声明 `subsystems` / 可选 `remoteApi`
4. 若有 `compatibility/` 或 `migrations/` 新文件，再次运行 codegen

## Phase 对照

| Phase | 内容 | 状态 |
|-------|------|------|
| 1 | codegen MOD_IMPORTERS + 子系统别名 | ✅ |
| 2 | Remote 契约 + `manifest.remoteApi` + 开发环境校验 | ✅ |
| 3 | 引擎子系统注册表 + orchestrator 统一 import | ✅ |
| 扫描 | D35 codegen 漂移 + importer 覆盖检查 | ✅ |
| 6 | importers/compat/migrations 迁 core；加载器单测 | ✅ |

## Next.js 约束

所有运行时 `import()` **必须**出现在 codegen 生成的静态映射中，禁止双段动态路径（如 `` `@/mods/${a}/${b}` ``）。`getModImporter` 仅查 `MOD_IMPORTERS`，未知 MOD 直接报错。

## 已知限制

- Remote 契约由 `index.ts` 静态解析推导，复杂 re-export 可能需 `manifest.remoteApi` 显式覆盖
- orchestrator 内部仍直接调用子系统方法，仅 import 路径集中化，非事件总线化
