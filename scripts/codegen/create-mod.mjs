/**
 * @module create-mod.mjs
 * @description MOD 脚手架 —— Phase 6/7 标准目录（control + 轻量 index）
 *
 * 用法:
 *   npm run mod:create mod-my-feature
 *   npm run mod:create mod-my-feature -- --with-subsystem
 *   npm run mod:create mod-my-feature -- --with-subsystem CustomName
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const MODS_DIR = path.join(ROOT, 'src', 'mods')
const SUBSYSTEM_TEMPLATE = path.join(
  ROOT,
  '..',
  '.agents',
  'skills',
  'mod-dev-skill',
  'templates',
  'subsystem.template.ts',
)

const argv = process.argv.slice(2)
const rawName = argv.find((a) => !a.startsWith('--'))
const withSubsystem = argv.includes('--with-subsystem')
const subsystemFlagIdx = argv.indexOf('--with-subsystem')
const customSubsystemName = subsystemFlagIdx >= 0 ? argv[subsystemFlagIdx + 1] : undefined
const subsystemBaseName =
  customSubsystemName && !customSubsystemName.startsWith('--')
    ? customSubsystemName
    : null

if (!rawName) {
  console.error('用法: npm run mod:create mod-my-feature [-- --with-subsystem [SubsystemName]]')
  process.exit(1)
}

const modName = rawName.startsWith('mod-') ? rawName : `mod-${rawName}`
if (!/^mod-[a-z]+(-[a-z0-9]+)*$/.test(modName)) {
  console.error(`MOD 名称 "${modName}" 不符合 mod-{kebab-case} 格式`)
  process.exit(1)
}

const modDir = path.join(MODS_DIR, modName)
if (fs.existsSync(modDir)) {
  console.error(`目录已存在: ${modDir}`)
  process.exit(1)
}

const shortName = modName.replace(/^mod-/, '')
const pascal = toPascalCase(shortName)
const subsystemStem = subsystemBaseName ? toPascalCase(subsystemBaseName) : pascal
const subsystemClass = `${subsystemStem}System`
const subsystemFile = `${toKebabCase(subsystemStem)}-system.ts`
const subsystemId = toKebabCase(subsystemStem)

fs.mkdirSync(path.join(modDir, '_internal'), { recursive: true })

const subsystemsManifest = withSubsystem ? `\n  subsystems: ['${subsystemClass}'],` : '\n  subsystems: [],'

fs.writeFileSync(
  path.join(modDir, 'manifest.ts'),
  `/**
 * @module manifest.ts
 * @description MOD 身份声明 —— ${shortName}
 * @mod ${modName}
 */
import { defineMod } from '@/core'

export default defineMod({
  name: '${modName}',
  version: '1.0.0',
  description: 'TODO: 一句话描述',
  dependencies: ['mod-engine'],
  provides: ['${shortName}'],
  consumes: [],${subsystemsManifest}
  stores: [],
  events: {
    emits: [],
    listens: [],
  },
})
`,
  'utf8',
)

fs.writeFileSync(
  path.join(modDir, 'types.ts'),
  `/**
 * @module types.ts
 * @description ${modName} 类型定义
 * @mod ${modName}
 */

export interface ${pascal}State {
  initialized: boolean
}
`,
  'utf8',
)

fs.writeFileSync(
  path.join(modDir, 'index.ts'),
  `/**
 * @module index.ts
 * @description ${modName} 公共 API（轻量 barrel）
 * @mod ${modName}
 *
 * lifecycle → _internal/control.ts
 * 子系统 → subsystems/*.ts（禁止从此处 re-export）
 */

export type { ${pascal}State } from './types'
`,
  'utf8',
)

fs.writeFileSync(
  path.join(modDir, '_internal', 'control.ts'),
  `/**
 * @module control.ts
 * @description Factorio control.lua 等价 — lifecycle 窄入口
 * @mod ${modName}
 */

import type { ModLifecycle } from '@/foundation'

export const lifecycle: ModLifecycle = {
  async onInit(): Promise<void> {
    // TODO
  },
}
`,
  'utf8',
)

const created = ['manifest.ts', 'types.ts', 'index.ts', '_internal/control.ts']

if (withSubsystem) {
  fs.mkdirSync(path.join(modDir, 'subsystems'), { recursive: true })
  const template = fs.readFileSync(SUBSYSTEM_TEMPLATE, 'utf8')
  const subsystemContent = template
    .replace(/\{SubsystemName\}/g, subsystemStem)
    .replace(/\{kebab-name\}/g, subsystemId)
    .replace(/\{mod-name\}/g, shortName)
    .replace(/\{子系统显示名称\}/g, subsystemStem)
    .replace(/\{子系统功能描述\}/g, `TODO: ${subsystemClass} 功能描述`)
    .replace(/;\n/g, '\n')

  fs.writeFileSync(path.join(modDir, 'subsystems', subsystemFile), subsystemContent, 'utf8')
  created.push(`subsystems/${subsystemFile}`)
}

console.log(`[create-mod] 已创建 ${path.relative(ROOT, modDir)}`)
console.log(`[create-mod] 已生成: ${created.join(', ')}`)
if (withSubsystem) {
  console.log(`[create-mod] 子系统: ${subsystemClass} → subsystems/${subsystemFile}（无 subsystems/index barrel）`)
}
console.log('[create-mod] 下一步: 编辑 manifest.ts → npm run generate:wiring → npm run dev')

function toPascalCase(kebab) {
  return kebab
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function toKebabCase(name) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
}
