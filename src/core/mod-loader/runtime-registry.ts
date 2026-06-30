/**
 * @module runtime-registry.ts
 * @description 运行时注册表 —— loader 完成后的只读快照（Factorio data.raw 等价物）
 * @mod core
 *
 * 在 InitMods 完成 lifecycle + onLoad 后冻结，此后只读。
 * 供 RoundCommit 校验、Remote 查询、调试面板使用。
 */

import type { ModManifest } from '@/foundation'

/** 已激活子系统绑定（运行时实例，非 manifest 声明） */
export interface SubsystemBinding {
  readonly id: string
  readonly mod: string
}

/** 单个 MOD 的运行时快照 */
export interface RuntimeModSnapshot {
  readonly name: string
  readonly version: string
  readonly provides: readonly string[]
  readonly consumes: readonly string[]
  /** manifest 声明的子系统类名 */
  readonly declaredSubsystems: readonly string[]
  readonly remoteApi: readonly string[]
}

/** 冻结后的完整注册表 */
export interface RuntimeRegistrySnapshot {
  readonly frozenAt: number
  readonly loadOrder: readonly string[]
  readonly mods: Readonly<Record<string, RuntimeModSnapshot>>
  /** 能力标识 → 提供方 MOD */
  readonly provides: Readonly<Record<string, string>>
  /** 子系统 id → 绑定信息 */
  readonly activeSubsystems: Readonly<Record<string, SubsystemBinding>>
  /** MOD → 已注册 Remote 函数名 */
  readonly remoteApis: Readonly<Record<string, readonly string[]>>
}

export interface FreezeRuntimeRegistryParams {
  loadOrder: string[]
  getManifest: (name: string) => ModManifest | undefined
  listRemoteMods: () => string[]
  listRemoteFunctions: (mod: string) => string[]
  remoteContracts: Record<string, readonly string[]>
}

class RuntimeRegistry {
  private snapshot: RuntimeRegistrySnapshot | null = null
  private pendingSubsystemBindings: SubsystemBinding[] = []

  /** 重置（开发热重载 / 测试） */
  reset(): void {
    this.snapshot = null
    this.pendingSubsystemBindings = []
  }

  /**
   * 记录已注册子系统实例（mod-engine onInit 调用，冻结前可写）
   */
  recordActiveSubsystems(bindings: SubsystemBinding[]): void {
    if (this.snapshot) {
      throw new Error('[RuntimeRegistry] 已冻结，无法 recordActiveSubsystems')
    }
    this.pendingSubsystemBindings = bindings.map((b) => ({ ...b }))
  }

  /**
   * 冻结注册表（InitMods 在 onLoad 完成后调用）
   */
  freeze(params: FreezeRuntimeRegistryParams): RuntimeRegistrySnapshot {
    if (this.snapshot) {
      return this.snapshot
    }

    const mods: Record<string, RuntimeModSnapshot> = {}
    const provides: Record<string, string> = {}
    const remoteApis: Record<string, readonly string[]> = {}
    const activeSubsystems: Record<string, SubsystemBinding> = {}

    for (const name of params.loadOrder) {
      const manifest = params.getManifest(name)
      if (!manifest) continue

      for (const cap of manifest.provides) {
        provides[cap] = name
      }

      const declaredRemote = manifest.remoteApi
        ?? params.remoteContracts[name]
        ?? []

      mods[name] = {
        name,
        version: manifest.version,
        provides: [...manifest.provides],
        consumes: manifest.consumes.map((c) => c.replace(/^[!~?]/, '')),
        declaredSubsystems: manifest.subsystems ? [...manifest.subsystems] : [],
        remoteApi: [...declaredRemote],
      }
    }

    for (const modName of params.listRemoteMods()) {
      remoteApis[modName] = params.listRemoteFunctions(modName)
    }

    for (const binding of this.pendingSubsystemBindings) {
      activeSubsystems[binding.id] = { ...binding }
    }

    this.snapshot = Object.freeze({
      frozenAt: Date.now(),
      loadOrder: Object.freeze([...params.loadOrder]),
      mods: Object.freeze(mods),
      provides: Object.freeze(provides),
      activeSubsystems: Object.freeze(activeSubsystems),
      remoteApis: Object.freeze(remoteApis),
    })

    return this.snapshot
  }

  isFrozen(): boolean {
    return this.snapshot !== null
  }

  tryGet(): RuntimeRegistrySnapshot | null {
    return this.snapshot
  }

  get(): RuntimeRegistrySnapshot {
    if (!this.snapshot) {
      throw new Error(
        '[RuntimeRegistry] 尚未冻结 — 须在 InitMods 完成 lifecycle + onLoad 后调用 freeze()',
      )
    }
    return this.snapshot
  }

  hasSubsystem(id: string): boolean {
    return this.snapshot?.activeSubsystems[id] !== undefined
  }

  resolveProvider(capability: string): string | undefined {
    return this.snapshot?.provides[capability]
  }

  listActiveSubsystemIds(): string[] {
    if (!this.snapshot) return []
    return Object.keys(this.snapshot.activeSubsystems)
  }

  /** 调试面板用：JSON 可序列化视图 */
  toDebugView(): Record<string, unknown> | null {
    if (!this.snapshot) return null
    const snap = this.snapshot
    return {
      frozenAt: new Date(snap.frozenAt).toISOString(),
      loadOrder: [...snap.loadOrder],
      modCount: Object.keys(snap.mods).length,
      subsystemCount: Object.keys(snap.activeSubsystems).length,
      provides: { ...snap.provides },
      mods: Object.fromEntries(
        Object.entries(snap.mods).map(([name, mod]) => [name, { ...mod }]),
      ),
      activeSubsystems: { ...snap.activeSubsystems },
      remoteApis: Object.fromEntries(
        Object.entries(snap.remoteApis).map(([name, fns]) => [name, [...fns]]),
      ),
    }
  }
}

export const runtimeRegistry = new RuntimeRegistry()
