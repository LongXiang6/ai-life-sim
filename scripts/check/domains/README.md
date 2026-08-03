# 检测域目录树

本文件说明本地门禁的领域归属与组件契约。`domains.mjs` 只聚合领域，`registry/specialized-scanner-steps.mjs` 声明专项节点、顺序、触发范围和并发属性；业务发现只由所属领域的 `contracts/*.ps1` 或独立 Node.js 检查器产生。

```text
scripts/check/
|- domains.mjs
|- registry/
|  `- specialized-scanner-steps.mjs
|- lib/
|  `- powershell-scanner/
|     |- context.ps1
|     `- complete.ps1
`- domains/
   |- mod/
   |  |- contracts/
   |  |- indexes/
   |  |- run-*-contracts.ps1
   |  `- runtime-import-cycle-scanner.mjs
   |- ui/
   |  |- contracts/
   |  |- indexes/
   |  `- run-*-contracts.ps1
   |- structural/
   |  |- contracts/
   |  `- run-*-contract.ps1
   `- narrative/
      |- contracts/
      `- run-critical-method-wiring-contract.ps1
```

## 组件契约

- `context.ps1` 只解析路径、预载源码并初始化报告状态。
- `indexes/*.ps1` 只构建可复用的只读投影，不调用 `Fail`、`Warn` 或 `Pass`。
- `contracts/*.ps1` 各自拥有一种检查职责和稳定规则 ID；同一规则 ID 不跨文件重复拥有。
- `run-*.ps1` 只按固定清单加载索引与契约，再交给 `complete.ps1` 发布唯一终态。
- runner 禁止枚举组件目录、按字符串动态选择扫描器或复制业务判断。

## 专项节点

| 领域 | 节点 | 职责 |
|---|---|---|
| MOD | `mod-source-contracts` | Manifest、Subsystem、Prompt、公开边界、存储与依赖对齐 |
| MOD | `mod-dependency-wiring-contracts` | 依赖、导入、注册、事件、能力、API 与可达性 |
| MOD | `mod-ownership-contracts` | 文件职责、导出边界与重复工具 |
| MOD | `mod-method-contracts` | 方法顺序、源码说明、输入快照与方法可达性 |
| MOD | `mod-pattern-contracts` | Pattern 分层、标识、注册、开关与异常边界 |
| MOD | `mod-anomaly-source-contracts` | 源码导入、React、布局和本地存储异常 |
| MOD | `mod-anomaly-runtime-contracts` | Prompt、Schema、Store、AI、生命周期和迁移异常 |
| MOD | `mod-runtime-import-cycles` | TypeScript 运行时文件导入环 |
| UI | `ui-tsx-contracts` | TSX 结构、组件边界和可访问性 |
| UI | `ui-architecture-contracts` | 响应式变体、主题和 Manifest 页面 |
| UI | `ui-css-contracts` | CSS 路径、变量、废弃项和白名单 |
| structural | `mod-registration-contract` | 应用到 MOD 的注册完整性 |
| structural | `generated-mod-wiring-contract` | 生成接线新鲜度和 importer 完整性 |
| narrative | `critical-method-wiring` | 叙事关键方法接线 |

互无依赖的节点由 check runner 显式并发，结果按 `order` 和稳定节点 ID 确定性汇合。单独运行 MOD 与 UI 领域时分别使用 10 和 6 个并发许可；多领域完整门禁仍使用全局有界并发。`specialized-scanner-contract-smoke.mjs` 机械验证固定清单、规则唯一所有者、索引只读和旧入口清理。
