/**
 * @module registry.ts
 * @description MOD 注册清单 —— 由 codegen 生成，禁止手写 import 列表
 * @mod mods
 *
 * 新增 MOD：在 src/mods/ 下创建 mod-* 目录 + manifest.ts，然后运行 npm run generate:wiring
 */

export { MOD_REGISTRY } from './registry.generated'
