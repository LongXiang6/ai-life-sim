# Standardization domain

`standardization-gate.mjs` 是项目标准化门禁，读取 `scripts/check/rules/standardization.json`，检查：

- Skill 目录、`SKILL.md` frontmatter/章节和 `agents/openai.yaml` 键序；
- reference 文件名、Markdown 标题层级和内部引用；
- 治理文档与标准配置的 UTF-8/LF/空白/末尾换行；
- 受管 JSON 的解析、缩进和声明的稳定排序；
- `.generated` 文件的自动生成标记。

```powershell
npm run check:standardization
```

业务数组按公开 `order` 保持语义顺序，不在本域强行字典排序。
