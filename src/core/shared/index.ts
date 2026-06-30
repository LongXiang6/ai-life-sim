/**
 * core/shared/ — 跨 MOD 公共函数库
 *
 * 使用规则：
 * 1. 所有函数必须是纯函数，不依赖任何 MOD 的 store 或外部状态
 * 2. 被 2 个以上 MOD 调用的函数放这里
 * 3. 只被 1 个 MOD 使用的函数放该 MOD 自己的 utils.ts
 * 4. UI 组件不复用（移动端/桌面端分开维护）
 * 5. 新增函数前先查是否已有等价实现
 */

export * from './common-utils';
export * from './character-utils';
export * from './world-utils';
export * from './narrative-utils';
