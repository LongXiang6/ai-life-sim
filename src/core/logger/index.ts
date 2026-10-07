/**
 * Purpose: Expose the public client logging entry point.
 * Owner: core:logger
 * Responsibility: Re-export the canonical client logger without owning persistence.
 *
 * @module index.ts
 * @description 日志工具统一导出
 * @mod core
 */

export { logger } from './client-logger'
