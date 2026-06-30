/**
 * @module index.ts
 * @description 存储服务统一导出
 * @mod core
 */

export { configStore, saveStore, cacheStore, tempStore } from './local-storage'
export { clearGameProgressFromLocalStorage } from './game-reset'
export { opfsStorage } from './opfs-storage'
export { saveManager } from './save-manager'
export type { SaveMetadata } from './save-manager'
