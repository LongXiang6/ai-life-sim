# CHANGELOG

## 2026-07-27

### 修复

- **核心模拟界面分支点自创分支锁死**：移动端软键盘弹起时吞掉预设选项和确认按钮的点击事件（首次触摸被浏览器用于收起键盘），同时在 textarea 点击前主动 blur 收起键盘；`confirmingBranchRef` 新增 10 秒超时保护和回合切换自动重置，防止 `advanceRound` 挂起导致永久锁死；确认失败时通过 toast 给出错误反馈
- **游戏叙事页 sticky header 未固定**：`.bookShell` 从 grid 布局改为 flex 列布局，`.stickyShell`（readerBar、infoPanel 等）设为 `flex: 0 0 auto` 固定顶部，`.reading` 作为唯一滚动容器
- **GamePage addToast 初始化顺序错误**：`addToast` 声明移到 `handleBranchConfirmWithFeedback` 之前，修复 `Cannot access 'addToast' before initialization` Runtime ReferenceError
- **移动端页面宽度不匹配**：`TalentDraw`、`WorldCustomize`、`CharacterCreate` 页面从固定 px 宽度改为百分比 + 视口单位，消除不同分辨率下左右留白不一致
- **天赋卡光效被截断**：移除 `.candidateList` 的 `overflow-y: auto`，滚动移至父容器，使 `box-shadow` 光效不再被容器边界裁切
- **欢迎页辅助按钮大小不一致**：`.secondaryBtn` 从 `min-height` 改为固定 `height: 6.1cqh` + `min-height: 0`，文本溢出省略号从父级 `.routeCopy` 移至直接包含文本的 `<strong>` 元素，解决 Grid `min-height: auto` 导致的尺寸差异
