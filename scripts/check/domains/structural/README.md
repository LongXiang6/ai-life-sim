# Structural domain group

ATCE 核心 — 扫描器**物理位置**：

| 文件 | 职责 |
|------|------|
| `scan-typescript-wiring.mjs` | codegen + A-01/14/17 **FAIL** + export* HINT |
| `scan-file-import-graph.mjs` | D-07 环 **FAIL** + barrel ≥10 **FAIL** |
| `execution-system-gate.mjs` | A-19 流程注册、五阶段、状态码、唯一终态、生成漂移、事故根因链、观测证据、超时补丁禁令与复盘时限 **FAIL** |
| `test-mod-loader.mjs` | 加载器回归入口 |
| `test-mod-loader-runner.ts` | 加载器回归测试体（tsx） |

```bash
npm run check:structural
npm run check:execution
npm run test:loader
```

REFACTOR-HINT 写入 log / `check-run-*.json` → `atceRecommendation: REVIEW`（不 FAIL）。
