# Standardization domain

本目录由 `quality:standardization` 拥有。入口 `standardization-gate.mjs` 只负责按序调用下级组件：

- `lib/format-checks.mjs`：文本、Markdown、JSON 和生成标记；
- `lib/skill-checks.mjs`：全局与项目 Skill 入口、命名、链接和体积；
- `lib/structure-snapshot.mjs`：从实时目录推导所有者、行数、文件头和索引；
- `lib/structure-checks.mjs`：具名职责例外、防增长、变更文件头和索引漂移；
- `lib/report.mjs`：发布唯一门禁结果。

```powershell
npm run generate:structure-index
npm run check:standardization
```

`300` 行是优先预算，不是对单一职责文件的一刀切失败条件。超预算文件必须在 `scripts/check/rules/file-budget-exceptions/` 留下路径、所有者、审查行数和职责理由；新文件无例外、空理由、重复路径、所有者漂移、继续增长或过期例外都会失败。
