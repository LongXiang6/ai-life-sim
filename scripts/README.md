# scripts/ 目录说明

构建与检测脚本的根目录。**根目录仅保留本说明 + 三个子目录**，所有实现均在子目录内。

## 目录结构

```
scripts/
├── README.md                   # 本文件
├── codegen/                    # 构建期 codegen（dev/build 自动运行）
│   ├── generate-mod-wiring.mjs
│   └── create-mod.mjs
├── dev/                        # 开发环境辅助（dev 预热等）
│   ├── dev-with-warmup.mjs
│   └── warm-dev-server.mjs
└── check/                      # 检测 / 关闸（C3 闸）
    ├── index.mjs               # npm run check 入口
    ├── gate-check.mjs          # npm run gate-check
    ├── check-format.ps1        # PS 扫描总调度
    ├── domains.mjs             # 7 域注册
    ├── rules/
    │   ├── registry.json       # 规则元数据
    │   └── architecture-rules.json
    ├── lib/                    # runner、quiet、checker-utils.ps1 …
    ├── dev/                    # 开发辅助（非关闸必需）
    │   ├── checker-self-test.ps1
    │   ├── show-errors.ps1
    │   └── generate-dependency-graph.mjs
    └── domains/
        ├── structural/         # wiring + loader
        ├── standardization/    # Skill / 文档 / 配置 / 生成物标准化
        ├── mod/                # arch / smart / anomaly PS
        ├── ui/                 # ui / css PS
        ├── narrative/          # 叙事回归
        └── calibration/        # 世界校准
```

## 常用命令

| 命令 | 实际路径 |
|------|---------|
| `npm run gate-check` | `check/gate-check.mjs` |
| `npm run check` | `check/index.mjs` |
| `npm run generate:wiring` | `codegen/generate-mod-wiring.mjs` |
| `npm run mod:create` | `codegen/create-mod.mjs` |
| `npm run test:loader` | `check/domains/structural/test-mod-loader.mjs` |
| `npm run check:standardization` | `check/domains/standardization/standardization-gate.mjs` |

## 开发辅助

```bash
powershell -File scripts/check/check-format.ps1 -ModName mod-engine
powershell -File scripts/check/dev/show-errors.ps1
powershell -File scripts/check/dev/checker-self-test.ps1
npm run generate:deps
```
