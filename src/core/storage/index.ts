/**
 * @module index.ts
 * @description 存储服务统一导出
 * @mod core
 */

export { configStore, saveStore, cacheStore, tempStore } from './local-storage'
export { clearGameProgressFromLocalStorage } from './game-reset'
export { opfsStorage, isOPFSSupported, opfsRestoreAll, opfsFlushQueue } from './opfs-storage'
export { initStorage, enqueueOpfsWrite, flushOpfsQueueNow, safeCleanupReload } from './persist-layer'
export { saveManager, MAX_MANUAL_SAVE_SLOTS } from './save-manager'
export type { SaveMetadata } from './save-manager'
