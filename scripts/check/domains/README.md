# 检测域目录树

扫描器实现位于各 `domains/<name>/` 子目录；编排与 PS 总调度在 `check/` 根。

```
scripts/check/
├── index.mjs
├── gate-check.mjs
├── check-format.ps1
├── domains.mjs
├── profiles.mjs
├── rules/
│   ├── registry.json
│   └── architecture-rules.json
├── lib/
│   ├── runner.mjs
│   ├── checker-utils.ps1
│   └── …
├── dev/                        # 非关闸辅助
└── domains/
    ├── structural/
    ├── mod/
    ├── ui/
    ├── narrative/
    └── calibration/
```

## Profile

| Profile | 域 | ATCE |
|---------|-----|------|
| `structural` | wiring + loader | 必跑 |
| `quick` | = structural | L1 关闸 |
| `refactor` | wiring + loader + mod | 架构重构 |
| `full` | 全部 6 域 | L2/L3 交付 |
| `changed` | git 推断 + 结构性叠加 | 日常 |

## 命令

```bash
npm run check:structural
npm run check:refactor
npm run check
npm run gate-check
```
