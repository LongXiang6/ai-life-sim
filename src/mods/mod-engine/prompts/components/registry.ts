/**
 * @module registry.ts
 * @description 组件注册中心 — 管理所有提示词组件的组装
 * @mod mod-engine
 *
 * 支持按 Campaign、MOD 动态组装组件，实现模块化管理。
 */

import type { NarrativePromptComponent } from '../../helpers/narrative-prompt-component-types'

// 核心组件
import { identityGoalComponent } from './core/identity-goal'
import { authorityOrderComponent } from './core/authority-order'
import { playerSettingOwnershipComponent } from './core/player-setting-ownership'

// 写作规则组件
import { sceneCausalityComponent } from './writing/scene-causality'
import { drivingForceComponent } from './writing/driving-force'
import { viewpointComponent } from './writing/viewpoint'

// 风格组件
import { styleRegisterComponent } from './style/style-register'
import { branchPolicyComponent } from './style/branch-policy'

/** 组件类别 */
export type ComponentCategory = 'core' | 'writing' | 'style' | 'campaign' | 'mod'

/** 组件注册表 */
export interface ComponentRegistry {
  core: Map<string, Omit<NarrativePromptComponent, 'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'>>
  writing: Map<string, Omit<NarrativePromptComponent, 'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'>>
  style: Map<string, Omit<NarrativePromptComponent, 'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'>>
  campaignOverrides: Map<string, Map<string, Omit<NarrativePromptComponent, 'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'>>>
  modExtensions: Map<string, Map<string, Omit<NarrativePromptComponent, 'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'>>>
}

/**
 * 创建默认组件注册表
 */
export function createDefaultRegistry(): ComponentRegistry {
  const registry: ComponentRegistry = {
    core: new Map(),
    writing: new Map(),
    style: new Map(),
    campaignOverrides: new Map(),
    modExtensions: new Map(),
  }

  // 注册核心组件
  registry.core.set(identityGoalComponent.id, identityGoalComponent)
  registry.core.set(authorityOrderComponent.id, authorityOrderComponent)
  registry.core.set(playerSettingOwnershipComponent.id, playerSettingOwnershipComponent)

  // 注册写作规则组件
  registry.writing.set(sceneCausalityComponent.id, sceneCausalityComponent)
  registry.writing.set(drivingForceComponent.id, drivingForceComponent)
  registry.writing.set(viewpointComponent.id, viewpointComponent)

  // 注册风格组件
  registry.style.set(styleRegisterComponent.id, styleRegisterComponent)
  registry.style.set(branchPolicyComponent.id, branchPolicyComponent)

  return registry
}

/**
 * 全局组件注册表
 */
export const globalComponentRegistry = createDefaultRegistry()

/**
 * 注册 Campaign 覆盖组件
 */
export function registerCampaignOverride(
  campaignId: string,
  components: Array<Omit<NarrativePromptComponent, 'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'>>,
): void {
  const campaignMap = new Map(
    components.map(c => [c.id, c]),
  )
  globalComponentRegistry.campaignOverrides.set(campaignId, campaignMap)
}

/**
 * 注册 MOD 扩展组件
 */
export function registerModExtension(
  modId: string,
  components: Array<Omit<NarrativePromptComponent, 'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'>>,
): void {
  const modMap = new Map(
    components.map(c => [c.id, c]),
  )
  globalComponentRegistry.modExtensions.set(modId, modMap)
}

/**
 * 获取指定 Campaign 和 MOD 的组件列表
 */
export function getComponentsForContext(
  campaignId: string,
  activeModIds: string[],
): Array<Omit<NarrativePromptComponent, 'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'>> {
  const registry = globalComponentRegistry
  const componentMap = new Map<string, Omit<NarrativePromptComponent, 'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'>>()

  // 1. 加载核心组件
  for (const [id, component] of registry.core) {
    componentMap.set(id, component)
  }

  // 2. 加载写作规则组件
  for (const [id, component] of registry.writing) {
    componentMap.set(id, component)
  }

  // 3. 加载风格组件
  for (const [id, component] of registry.style) {
    componentMap.set(id, component)
  }

  // 4. 应用 Campaign 覆盖
  const campaignOverrides = registry.campaignOverrides.get(campaignId)
  if (campaignOverrides) {
    for (const [id, component] of campaignOverrides) {
      componentMap.set(id, component)
    }
  }

  // 5. 应用 MOD 扩展
  for (const modId of activeModIds) {
    const modExtensions = registry.modExtensions.get(modId)
    if (modExtensions) {
      for (const [id, component] of modExtensions) {
        componentMap.set(id, component)
      }
    }
  }

  // 6. 按 order 排序
  return Array.from(componentMap.values()).sort((a, b) => a.order - b.order)
}

/**
 * 编译组件为系统提示词
 */
export function compileComponentsToSystemPrompt(
  components: Array<Omit<NarrativePromptComponent, 'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'>>,
): string {
  const seenTitles = new Set<string>()
  const parts: string[] = []

  for (const component of components) {
    if (seenTitles.has(component.title)) {
      throw new Error(`主叙事提示词组件标题重复：${component.title}`)
    }
    seenTitles.add(component.title)

    const content = Array.isArray(component.content)
      ? component.content.join('\n')
      : component.content

    if (content.trim()) {
      parts.push(content.trim())
    }
  }

  return parts.join('\n')
}

/**
 * 获取组件统计信息
 */
export function getRegistryStats(): {
  core: number
  writing: number
  style: number
  campaigns: number
  mods: number
  total: number
} {
  const registry = globalComponentRegistry
  return {
    core: registry.core.size,
    writing: registry.writing.size,
    style: registry.style.size,
    campaigns: registry.campaignOverrides.size,
    mods: registry.modExtensions.size,
    total: registry.core.size + registry.writing.size + registry.style.size,
  }
}
