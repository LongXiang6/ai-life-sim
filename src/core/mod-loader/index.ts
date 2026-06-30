/**
 * @module index.ts
 * @description MOD 加载器统一导出
 * @mod core
 */

export { defineMod, loadMods, ENGINE_FEATURE_FLAGS } from './mod-loader'
export type { LoadResult } from './mod-loader'
export { invokeModLifecycles, notifyConfigurationChanged, invokeModOnLoad, getModImporter, getModControlImporter, getModApiImporter } from './mod-lifecycle'
export { runPrototypeStage } from './prototype-stage'
export type { PrototypeStageResult } from './prototype-stage'
export { validateRemoteContracts, reportRemoteContractIssues } from './validate-remote-contracts'
export type { RemoteContractIssue } from './validate-remote-contracts'
export { modRegistry } from './mod-registry'
export type { ModEntry } from './mod-registry'
export { resolveDependenciesV2, parseDependency } from './dependency-resolver'
export type { ResolveResult } from './dependency-resolver'
export {
  validateDirectoryName,
  validateManifest,
  validateStructure,
  validateFeatureFlags,
} from './mod-validator'
export type { ValidationResult } from './mod-validator'
export { enrichModLoadError } from './load-error-hints'
export type { ModLoadErrorWithHint } from './load-error-hints'
export { runtimeRegistry } from './runtime-registry'
export type {
  RuntimeRegistrySnapshot,
  RuntimeModSnapshot,
  SubsystemBinding,
  FreezeRuntimeRegistryParams,
} from './runtime-registry'
