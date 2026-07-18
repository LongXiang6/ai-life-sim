# Mobile Welcome T3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将用户定版的 T3 背景轨迹、T2 标题介绍和“开始新人生”按钮落实为无移动端首帧闪屏的响应式欢迎页。

**Architecture:** 欢迎页只渲染一个 `WelcomeView`，使用 CSS media query 处理 375/390/768px 与桌面宽度，不再通过 `useIsMobile()` 切换两套 DOM。交互回调和弹层状态仍由现有 `page.tsx` 拥有，不改变创建流程或存档语义。

**Tech Stack:** Next.js 16、React 19、TypeScript、CSS Modules、项目 design tokens、Playwright 浏览器回放。

---

### Task 1: 固化欢迎页定版要求

**Files:**
- Create: `scripts/check/domains/ui/mobile-ui-regression.mjs`
- Modify: `scripts/check/domains.mjs`

- [ ] **Step 1: 写入失败回归**

断言欢迎页只使用 `WelcomeView`，不再调用 `useIsMobile`；视图包含标题“一生很长，也只由几次选择组成。”、介绍“选择世界与出身，走过关系、机会、代价和告别。”、主按钮“开始新人生”及 `aria-hidden` 背景轨迹。

- [ ] **Step 2: 运行并确认失败**

Run: `node scripts/check/domains/ui/mobile-ui-regression.mjs`

Expected: 因当前仍使用 `WelcomeDesktop`/`WelcomeMobile` 和旧文案而失败。

### Task 2: 实现单 DOM 响应式欢迎页

**Files:**
- Create: `src/mods/mod-pages/pages/welcome/WelcomeView.tsx`
- Create: `src/mods/mod-pages/pages/welcome/WelcomeView.module.css`
- Modify: `src/mods/mod-pages/pages/welcome/page.tsx`
- Delete: `src/mods/mod-pages/pages/welcome/WelcomeDesktop.tsx`
- Delete: `src/mods/mod-pages/pages/welcome/WelcomeDesktop.module.css`
- Delete: `src/mods/mod-pages/pages/welcome/WelcomeMobile.tsx`
- Delete: `src/mods/mod-pages/pages/welcome/WelcomeMobile.module.css`

- [ ] **Step 1: 建立定版结构**

`WelcomeView` 使用一个装饰性 SVG 曲线路径、品牌小标题、T2 主文案、存档条件操作和底部设置/说明入口。装饰图使用 `aria-hidden="true"`，交互按钮保留可见文本及现有回调。

- [ ] **Step 2: 建立响应式样式**

移动端以 `100dvh`、safe-area 和约 42px 主操作为基线；背景曲线不抢文字对比。设置与说明并排，存在存档时显示继续入口，不存在时不制造大面积禁用卡片。桌面仅调整内容最大宽度和排版尺度，不复制 DOM。

- [ ] **Step 3: 运行回归**

Run: `node scripts/check/domains/ui/mobile-ui-regression.mjs`

Expected: PASS。

### Task 3: 真实浏览器验收

**Files:**
- Create: `reports/mobile-ui-tournament-2026-07-11/verify-welcome-t3.mjs`

- [ ] **Step 1: 运行 375/390/768px 回放**

检查标题、轨迹、主按钮、设置/说明、无存档与有存档结构；记录横向溢出、控制台错误和截图。

- [ ] **Step 2: 运行项目关闸**

Run: `npm run check:ui`

Run: `npm run lint`

Run: `npx tsc --noEmit`

Expected: 全部 exit 0。

- [ ] **Step 3: 交付下一轮**

向用户展示真实 390px 欢迎页截图，然后开始世界选择页的三个 UI 方向淘汰赛。改动保持未提交，等待整轮 UI 迭代结束后统一处理版本控制。
