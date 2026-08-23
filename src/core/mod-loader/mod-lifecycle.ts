/**
 * Purpose: Execute the registered MOD lifecycle graph through its control, subsystem, and remote stages.
 * Owner: core:mod-loader
 * Responsibility: Single ordered lifecycle transaction, dependency checks, signals, and hook completion.
 */

import {
  createExecutionOutcomeCodes,
  runExecutionSequence,
} from '@/foundation'
import type {
  ConfigurationChangedData,
  ExecutionFlowRegistration,
  ExecutionNodeSignal,
  ExecutionSequenceNode,
  ExecutionSequenceResult,
  ModContext,
  ModLifecycleV2,
  ModManifest,
} from '@/foundation'

import { modRegistry } from './mod-registry'
import { remote } from '../remote-interface/remote-interface'
import { isInstrumentEnabled, getInstrumentHooks } from '../instrument/instrument-mode'
import { createStorageNamespace } from '../storage-namespace'
import { validateRemoteContracts } from './validate-remote-contracts'
import { MOD_CONTROL_IMPORTERS } from './mod-control-importers.generated'
import { MOD_API_IMPORTERS } from './mod-importers.generated'
import { MOD_SECONDARY_API_IMPORTERS } from './mod-secondary-api-importers.generated'
import { parseDependency } from './dependency-resolver'
import { EXECUTION_FLOWS } from '../execution'
import { recordExecutionSequenceResult } from '../logger/development-system-diagnostic'

const LIFECYCLE_OWNER = 'core-mod-loader'

function createExecutionId(flowId: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
  return `${flowId}:${suffix}`
}

function buildPerModContext(name: string, context: ModContext): ModContext {
  return {
    ...context,
    getStorage: <T extends Record<string, unknown> = Record<string, unknown>>() =>
      createStorageNamespace<T>(name, context.storage),
  }
}

function getOrderedManifests(): ModManifest[] {
  return modRegistry.getLoadOrder().map((name) => {
    const manifest = modRegistry.get(name)?.manifest
    if (!manifest) {
      throw new Error(`[mod-lifecycle] 加载顺序包含未注册 MOD: ${name}`)
    }
    return manifest
  })
}

/**
 * Factorio control.lua 等价 — lifecycle 窄入口
 * @param name - MOD 名称
 */
export function getModControlImporter(name: string): () => Promise<Record<string, unknown>> {
  const importer = MOD_CONTROL_IMPORTERS[name]
  if (!importer) {
    throw new Error(`[getModControlImporter] 未知 MOD "${name}" — 请确认 _internal/control.ts 存在并运行 npm run generate:wiring`)
  }
  return importer
}

/**
 * index.ts 全量 API — Remote 注册专用
 * @param name - MOD 名称
 */
export function getModApiImporter(name: string): () => Promise<Record<string, unknown>> {
  const importer = MOD_API_IMPORTERS[name]
  if (!importer) {
    throw new Error(`[getModApiImporter] 未知 MOD "${name}" — 请确认 src/mods/${name} 存在并运行 npm run generate:wiring`)
  }
  return importer
}

/**
 * @deprecated 使用 getModControlImporter（lifecycle）或 getModApiImporter（Remote）
 * @param name - MOD 名称
 */
export function getModImporter(name: string): () => Promise<Record<string, unknown>> {
  return getModControlImporter(name)
}

/** 根据 manifest.remoteApi 显式 allowlist 过滤可注册导出；未声明时保留自动推导。 */
export function selectRemoteApiExports(
  api: Record<string, unknown>,
  declaredRemoteApi: readonly string[] | undefined,
): Record<string, unknown> {
  if (declaredRemoteApi === undefined) return api

  return Object.fromEntries(
    declaredRemoteApi
      .filter((name) => typeof api[name] === 'function')
      .map((name) => [name, api[name]]),
  )
}

/** 合并公开入口；同一函数的纯重导出可复用，任何不同实现都必须显式失败。 */
export function mergeRemoteApiExports(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  sourceLabel: string,
): void {
  for (const [name, value] of Object.entries(source)) {
    if (!Object.prototype.hasOwnProperty.call(target, name)) {
      target[name] = value
      continue
    }
    if (target[name] !== value) {
      throw new Error(`MOD Remote API 重复导出：${name} 已存在，来源 ${sourceLabel} 提供了不同实现`)
    }
  }
}

/**
 * 批量注册 Remote API（index.ts + 启用的 secondaryPublicEntries，与 lifecycle 加载分离）
 */
async function registerModRemoteApis(order: string[]): Promise<void> {
  for (const name of order) {
    const declaredRemoteApi = modRegistry.get(name)?.manifest.remoteApi
    if (declaredRemoteApi?.length === 0) {
      remote.autoRegister(name, {})
      continue
    }

    const merged: Record<string, unknown> = { ...(await getModApiImporter(name)()) }

    const secondaryImporters = MOD_SECONDARY_API_IMPORTERS[name]
    if (secondaryImporters) {
      for (const [index, importSecondary] of secondaryImporters.entries()) {
        mergeRemoteApiExports(merged, await importSecondary(), `${name} secondary[${index}]`)
      }
    }

    remote.autoRegister(name, selectRemoteApiExports(merged, declaredRemoteApi))
  }
}

type ModHookName = 'onInit' | 'onLoad' | 'onConfigurationChanged'

export interface RunModHookSequenceOptions {
  flow: ExecutionFlowRegistration
  hook: ModHookName
  context: ModContext
  configurationData?: ConfigurationChangedData
  transition?: (manifests: readonly ModManifest[]) => void | Promise<void>
  finalize?: (manifests: readonly ModManifest[]) => void | Promise<void>
}

function hookSignal(status: 'succeeded' | 'skipped', message?: string): ExecutionNodeSignal {
  return { status, ...(message ? { message } : {}) }
}

async function runModHookSequence(
  options: RunModHookSequenceOptions,
): Promise<ExecutionSequenceResult> {
  const manifests = getOrderedManifests()
  const nodes = createModLifecycleExecutionNodes(options, manifests)

  const result = await runExecutionSequence({
    flow: options.flow,
    executionId: createExecutionId(options.flow.flowId),
    context: options.context,
    nodes,
  })
  recordExecutionSequenceResult(result)
  return result
}

export function createModLifecycleExecutionNodes(
  options: RunModHookSequenceOptions,
  manifests: readonly ModManifest[],
): ExecutionSequenceNode<ModContext>[] {
  const manifestNames = new Set(manifests.map((manifest) => manifest.name))
  const prepareId = 'prepare-mod-hooks'
  const readyId = 'queue-mod-hooks'
  const executeId = 'complete-mod-hooks'
  const transitionId = 'accept-mod-hooks'
  const finalizeId = 'finalize-mod-hooks'

  return [
    {
      id: prepareId,
      owner: LIFECYCLE_OWNER,
      failureTarget: LIFECYCLE_OWNER,
      phase: 'prepare',
      dependsOn: [],
      order: 0,
      outcomes: createExecutionOutcomeCodes(options.flow.flowId, prepareId),
      run: () => hookSignal('succeeded'),
    },
    {
      id: readyId,
      owner: LIFECYCLE_OWNER,
      failureTarget: LIFECYCLE_OWNER,
      phase: 'ready',
      dependsOn: [prepareId],
      order: 0,
      outcomes: createExecutionOutcomeCodes(options.flow.flowId, readyId),
      run: () => hookSignal('succeeded', 'MOD 生命周期任务已排队'),
    },
    ...manifests.map((manifest): ExecutionSequenceNode<ModContext> => ({
      id: manifest.name,
      owner: manifest.name,
      failureTarget: LIFECYCLE_OWNER,
      phase: 'execute',
      dependsOn: [
        readyId,
        ...manifest.dependencies
          .map((dependency) => parseDependency(dependency))
          .filter((dependency) => dependency.affectsLoadOrder && manifestNames.has(dependency.name))
          .map((dependency) => dependency.name),
      ],
      order: manifest.order,
      outcomes: createExecutionOutcomeCodes(options.flow.flowId, manifest.name),
      optional: true,
      run: async (context) => {
        const mod = await getModControlImporter(manifest.name)()
        const lifecycle = mod.lifecycle as ModLifecycleV2 | undefined
        const perModContext = buildPerModContext(manifest.name, context)

        if (options.hook === 'onInit') {
          if (!lifecycle?.onInit) return hookSignal('skipped', '未声明 onInit')
          if (isInstrumentEnabled()) getInstrumentHooks().onBeforeInit?.(manifest.name)
          const startedAt = performance.now()
          await lifecycle.onInit(perModContext)
          if (isInstrumentEnabled()) {
            getInstrumentHooks().onAfterInit?.(manifest.name, performance.now() - startedAt)
          }
          return hookSignal('succeeded')
        }

        if (options.hook === 'onLoad') {
          if (!lifecycle?.onLoad) return hookSignal('skipped', '未声明 onLoad')
          await lifecycle.onLoad(perModContext)
          return hookSignal('succeeded')
        }

        if (!lifecycle?.onConfigurationChanged) {
          return hookSignal('skipped', '未声明 onConfigurationChanged')
        }
        if (!options.configurationData) {
          throw new Error('[mod-lifecycle] 配置变更节点缺少 ConfigurationChangedData')
        }
        await lifecycle.onConfigurationChanged(options.configurationData)
        return hookSignal('succeeded')
      },
    })),
    {
      id: executeId,
      owner: LIFECYCLE_OWNER,
      failureTarget: LIFECYCLE_OWNER,
      phase: 'execute',
      dependsOn: manifests.length > 0 ? manifests.map((manifest) => manifest.name) : [readyId],
      order: 1_000_000,
      outcomes: createExecutionOutcomeCodes(options.flow.flowId, executeId),
      run: () => hookSignal('succeeded', 'MOD 生命周期执行结果已汇合'),
    },
    {
      id: transitionId,
      owner: LIFECYCLE_OWNER,
      failureTarget: LIFECYCLE_OWNER,
      phase: 'transition',
      dependsOn: [executeId],
      order: 0,
      outcomes: createExecutionOutcomeCodes(options.flow.flowId, transitionId),
      run: async () => {
        await options.transition?.(manifests)
        return hookSignal('succeeded')
      },
    },
    {
      id: finalizeId,
      owner: LIFECYCLE_OWNER,
      failureTarget: LIFECYCLE_OWNER,
      phase: 'finalize',
      dependsOn: [transitionId],
      order: 0,
      outcomes: createExecutionOutcomeCodes(options.flow.flowId, finalizeId),
      run: async () => {
        await options.finalize?.(manifests)
        return hookSignal('succeeded')
      },
    },
  ]
}

/**
 * 按加载顺序调用各 MOD 的 lifecycle.onInit
 *
 * @param context - MOD 上下文
 * @returns 错误列表（空数组表示全部成功）
 */
export async function invokeModLifecycles(
  context: ModContext,
): Promise<ExecutionSequenceResult> {
  return runModHookSequence({
    flow: EXECUTION_FLOWS.modInitialization,
    hook: 'onInit',
    context,
    transition: async (manifests) => {
      await registerModRemoteApis(manifests.map((manifest) => manifest.name))
    },
    finalize: (manifests) => {
      const issues = validateRemoteContracts([...manifests])
      if (issues.length === 0) return
      const summary = issues
        .map((issue) => `${issue.mod}/${issue.functionName}:${issue.kind}`)
        .join(', ')
      throw new Error(`[RemoteContract] Remote 契约未收口: ${summary}`)
    },
  })
}

/**
 * 通知所有 MOD 执行 onLoad 钩子（吸收 Factorio on_load 设计）
 *
 * @param context - MOD 上下文
 * @returns 错误列表
 */
export async function invokeModOnLoad(context: ModContext): Promise<ExecutionSequenceResult> {
  return runModHookSequence({
    flow: EXECUTION_FLOWS.modStateLoad,
    hook: 'onLoad',
    context,
  })
}

/**
 * 触发配置变更通知
 *
 * @param data - 变更数据
 * @param context - MOD 上下文
 */
export async function notifyConfigurationChanged(
  data: ConfigurationChangedData,
  context: ModContext,
): Promise<ExecutionSequenceResult> {
  return runModHookSequence({
    flow: EXECUTION_FLOWS.modConfigurationChange,
    hook: 'onConfigurationChanged',
    context,
    configurationData: data,
  })
}
