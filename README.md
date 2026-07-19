# AI 人生模拟器

当前版本：**5.0.9**。

基于 Next.js 与 MOD 化架构的 AI 驱动人生叙事游戏。5.0.0 以服务器仍在运行的废弃版 2.7.4 为对照完成重写，当前重点是完整可玩的创建与叙事主链、第二人称沉浸叙事、时间跨度一致性、长局记忆和可靠存档。

5.0.0 当前运行的是经过收敛的 MVP 系统集合。废弃版曾包含的经济、政治、文化、生态、科技、力量体系、NPC、历史和地图等扩展模拟系统尚未全部恢复到正常叙事回合；源码或 MOD 存在不代表已经对玩家开放。完整版本差异见 [5.0.0 发布说明](docs/release-notes-5.0.0.md)。

## 技术栈

- **框架**：Next.js 16、React 19、TypeScript
- **状态**：Zustand
- **校验**：Zod
- **样式**：Tailwind CSS 4

## 快速开始

### 环境要求

- Node.js 20+
- npm

### 安装依赖

```bash
npm install
```

### 启动开发服务器

**方式一：命令行**

```bash
npm run dev
```

带路由预热的开发模式（推荐本地使用）：

```bash
npm run dev:warm
```

**方式二：Windows 一键脚本**

双击项目根目录下的 `一键启动开发模式.bat`，会自动执行 `npm run dev:warm`。

启动后访问：<http://localhost:3000>

### 生产构建

```bash
npm run build
npm start
```

## 环境变量（可选）

AI 调用通过服务端代理 `/api/proxy` 转发。项目根目录提供 `.env.example` 作为模板：

```bash
copy .env.example .env.local
```

在 `.env.local` 中填写各厂商 API Key（也可在应用「设置」页填写自定义 Key，不必全部配置）。

> 请勿将 `.env.local` 或真实 API Key 提交到 Git 仓库。

## 换电脑 / 多机协作

代码通过 Git 同步即可，换机后按以下步骤恢复开发环境：

```bash
git clone https://github.com/LongXiang6/ai-life-sim.git
cd ai-life-sim
npm install
copy .env.example .env.local
# 编辑 .env.local 填入 API Key
npm run dev:warm
```

**需要单独备份、不能靠 Git 同步的内容：**

| 内容 | 说明 |
|------|------|
| `.env.local` | API Key 等密钥，已在 `.gitignore` 中排除 |
| 浏览器本地数据 | 应用设置、存档等存在浏览器 `localStorage`，换浏览器/换电脑不会自动带过去 |
| Cursor 工作区规则 | 若你在 `d:\AI\AGENTS.md`、`.agents/` 下有 AI 行为约束，它们不在本仓库内，需另行复制或同步 |

**给接手 AI 的最小信息：**

- 仓库地址：`https://github.com/LongXiang6/ai-life-sim.git`（私有，需你的 GitHub 账号授权）
- 分支：`main`
- 开发入口：`npm run dev:warm` 或 `一键启动开发模式.bat`
- 架构文档：`docs/` 目录

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式 |
| `npm run dev:warm` | 开发模式 + 路由预热 |
| `npm run build` | 生产构建 |
| `npm run lint` | ESLint 检查 |
| `npm run check:quick` | 快速架构/接线检查 |
| `npm run gate-check:quick` | 轻量交付门禁 |
| `npm run generate:wiring` | 重新生成 MOD 接线代码 |

## 项目结构（简要）

```
ai-life-sim/
├── src/
│   ├── app/          # Next.js 页面与 API 路由
│   ├── core/         # AI 服务、MOD 加载器等核心能力
│   ├── foundation/   # 公共类型与工具
│   └── mods/         # 各功能 MOD（引擎、世界、角色、NPC 等）
├── docs/             # 架构与蓝图文档
├── scripts/          # 代码生成与质量检查脚本
└── public/           # 静态资源
```

架构采用 **MOD 插件化** 设计：各子系统独立注册，由引擎编排叙事回合与世界状态更新。当前可玩系统以 `src/mods/mod-engine/helpers/mvp-stages-config.default.json` 为运行真源，更多设计说明见 `docs/` 目录。

## 许可证

本项目为私有仓库，未经授权请勿分发。
