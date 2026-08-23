# 第三层：机制目录

| 机制 | 结果文档 |
|---|---|
| 新人生创建 | [新人生创建机制](mechanisms/new-life.md) |
| 世界初始化 | [世界初始化机制](mechanisms/world-initialization.md) |
| 核心模拟回合 | [核心模拟](core-simulation.md) |
| 分支行动 | [分支行动机制](mechanisms/branch-action.md) |
| 时间步长 | [时间步长机制](mechanisms/time-step.md) |
| Prompt 与缓存 | [Prompt 与缓存机制](mechanisms/prompt-and-cache.md) |
| 开发日志镜像 | [开发日志镜像机制](mechanisms/development-log-mirror.md) |
| 故事压缩 | [故事压缩机制](mechanisms/story-compression.md) |
| 存档与恢复 | [存档与恢复机制](mechanisms/save-and-restore.md) |
| 人生结算 | [人生结算机制](mechanisms/settlement.md) |

第三层说明玩家不易直接感知但会持续影响结果的机制。每份文档定义机制的存在意义、输入范围、产出效果和最大边界。大型机制再进入第四层下属机制。

## 模块通信边界

- MOD 之间的请求/响应只通过 manifest 声明的唯一公开入口和生成式 wiring 接入；执行流阶段、所有者与故障反馈只读取中央流程登记。
- 自动化模块负责加载、注册、接线、依赖校验和诊断，不拥有业务判断或业务状态；业务结果仍由所属 MOD 发布。
- 同一 MOD 的 index 或 secondary public entry 出现重复导出名时，生成阶段和运行时注册阶段都必须报告冲突并停止静默覆盖；公开契约只保留一个明确所有者。
