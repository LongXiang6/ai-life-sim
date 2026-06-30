# Structural domain group

ATCE 核心 — 扫描器**物理位置**：

| 文件 | 职责 |
|------|------|
| `scan-typescript-wiring.mjs` | codegen + A-01/14/17 **FAIL** + export* HINT |
| `scan-file-import-graph.mjs` | D-07 环 **FAIL** + barrel ≥10 **FAIL** |
| `test-mod-loader.mjs` | 加载器回归入口 |
| `test-mod-loader-runner.ts` | 加载器回归测试体（tsx） |

```bash
npm run check:structural
npm run test:loader
```

REFACTOR-HINT 写入 log / `check-run-*.json` → `atceRecommendation: REVIEW`（不 FAIL）。
