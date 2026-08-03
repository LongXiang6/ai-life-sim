#!/usr/bin/env node
/**
 * Purpose: Detect concrete cross-MOD runtime import cycles at file granularity.
 * Owner: quality:mod
 * Responsibility: TypeScript runtime-edge extraction, resolution, and D23 cycle reporting only.
 */

import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

import { getProjectRoot } from '../../lib/project-root.mjs'
import { logDomainSummary, logFail } from '../../lib/quiet.mjs'

const projectRoot = getProjectRoot(import.meta.url)
const sourceRoot = path.join(projectRoot, 'src')
const modRoot = path.join(sourceRoot, 'mods')
const tsconfigPath = path.join(projectRoot, 'tsconfig.json')

function canonicalPath(filePath) {
  const absolute = path.resolve(filePath)
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute
}

function compareAscii(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function walkTypeScriptFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => compareAscii(left.name, right.name))) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      walkTypeScriptFiles(fullPath, files)
    } else if (entry.isFile() && /\.(?:[cm]?ts|tsx)$/u.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(path.resolve(fullPath))
    }
  }
  return files
}

function scriptKindFor(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX
  if (filePath.endsWith('.mts')) return ts.ScriptKind.MTS
  if (filePath.endsWith('.cts')) return ts.ScriptKind.CTS
  return ts.ScriptKind.TS
}

function importDeclarationHasRuntimeEdge(node) {
  const clause = node.importClause
  if (!clause) return true
  if (clause.isTypeOnly) return false
  if (clause.name) return true
  if (!clause.namedBindings) return true
  if (ts.isNamespaceImport(clause.namedBindings)) return true
  return clause.namedBindings.elements.length === 0
    || clause.namedBindings.elements.some((element) => !element.isTypeOnly)
}

function exportDeclarationHasRuntimeEdge(node) {
  if (node.isTypeOnly) return false
  if (!node.exportClause || !ts.isNamedExports(node.exportClause)) return true
  return node.exportClause.elements.length === 0
    || node.exportClause.elements.some((element) => !element.isTypeOnly)
}

function collectRuntimeSpecifiers(filePath, sourceText) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  )
  const specifiers = new Set()

  function addStringLiteral(node) {
    if (node && ts.isStringLiteralLike(node)) specifiers.add(node.text)
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && importDeclarationHasRuntimeEdge(node)) {
      addStringLiteral(node.moduleSpecifier)
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && exportDeclarationHasRuntimeEdge(node)) {
      addStringLiteral(node.moduleSpecifier)
    } else if (ts.isImportEqualsDeclaration(node)
      && !node.isTypeOnly
      && ts.isExternalModuleReference(node.moduleReference)) {
      addStringLiteral(node.moduleReference.expression)
    } else if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'require'
      && node.arguments.length === 1) {
      addStringLiteral(node.arguments[0])
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return [...specifiers]
}

function loadCompilerOptions() {
  const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (config.error) {
    throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
  }
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, projectRoot)
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('; '))
  }
  return parsed.options
}

function buildRuntimeGraph(files, compilerOptions) {
  const fileByCanonicalPath = new Map(files.map((filePath) => [canonicalPath(filePath), filePath]))
  const resolutionCache = ts.createModuleResolutionCache(
    projectRoot,
    (fileName) => process.platform === 'win32' ? fileName.toLowerCase() : fileName,
    compilerOptions,
  )
  const graph = new Map(files.map((filePath) => [filePath, new Set()]))

  for (const filePath of files) {
    const sourceText = fs.readFileSync(filePath, 'utf8')
    for (const specifier of collectRuntimeSpecifiers(filePath, sourceText)) {
      const resolution = ts.resolveModuleName(
        specifier,
        filePath,
        compilerOptions,
        ts.sys,
        resolutionCache,
      ).resolvedModule
      if (!resolution || resolution.isExternalLibraryImport) continue
      const dependency = fileByCanonicalPath.get(canonicalPath(resolution.resolvedFileName))
      if (dependency) graph.get(filePath).add(dependency)
    }
  }
  return graph
}

function stronglyConnectedComponents(graph) {
  let nextIndex = 0
  const indexes = new Map()
  const lowLinks = new Map()
  const stack = []
  const onStack = new Set()
  const components = []

  function visit(node) {
    indexes.set(node, nextIndex)
    lowLinks.set(node, nextIndex)
    nextIndex += 1
    stack.push(node)
    onStack.add(node)

    for (const dependency of [...graph.get(node)].sort()) {
      if (!indexes.has(dependency)) {
        visit(dependency)
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(dependency)))
      } else if (onStack.has(dependency)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indexes.get(dependency)))
      }
    }

    if (lowLinks.get(node) !== indexes.get(node)) return
    const component = []
    let current
    do {
      current = stack.pop()
      onStack.delete(current)
      component.push(current)
    } while (current !== node)
    components.push(component.sort())
  }

  for (const node of [...graph.keys()].sort()) {
    if (!indexes.has(node)) visit(node)
  }
  return components
}

function findConcreteCycle(component, graph) {
  const members = new Set(component)
  const visited = new Set()
  const stack = []
  const stackIndexes = new Map()

  function visit(node) {
    visited.add(node)
    stackIndexes.set(node, stack.length)
    stack.push(node)
    for (const dependency of [...graph.get(node)].filter((item) => members.has(item)).sort()) {
      if (stackIndexes.has(dependency)) {
        return [...stack.slice(stackIndexes.get(dependency)), dependency]
      }
      if (!visited.has(dependency)) {
        const cycle = visit(dependency)
        if (cycle) return cycle
      }
    }
    stack.pop()
    stackIndexes.delete(node)
    return null
  }

  for (const node of component) {
    if (!visited.has(node)) {
      const cycle = visit(node)
      if (cycle) return cycle
    }
  }
  return null
}

function relativeSourcePath(filePath) {
  return path.relative(sourceRoot, filePath).replace(/\\/gu, '/')
}

function owningMod(filePath) {
  return relativeSourcePath(filePath).match(/^mods\/(mod-[^/]+)\//u)?.[1] ?? null
}

let graph
try {
  const files = walkTypeScriptFiles(modRoot)
  graph = buildRuntimeGraph(files, loadCompilerOptions())
} catch (error) {
  logFail(`[FAIL] [D23-SCANNER-ERROR] ${error instanceof Error ? error.message : String(error)}`)
  logDomainSummary('mod-runtime-import-cycles', 'FAIL', 'scanner setup failed')
  process.exit(1)
}

const cyclicComponents = stronglyConnectedComponents(graph).filter((component) => {
  const hasCycle = component.length > 1 || graph.get(component[0]).has(component[0])
  const mods = new Set(component.map(owningMod).filter(Boolean))
  return hasCycle && mods.size > 1
})

for (const component of cyclicComponents) {
  const cycle = findConcreteCycle(component, graph) ?? component
  const mods = [...new Set(cycle.map(owningMod).filter(Boolean))].sort(compareAscii)
  logFail(`[FAIL] [D23-RUNTIME-IMPORT-CYCLE] ${cycle.map(relativeSourcePath).join(' -> ')} (mods: ${mods.join(', ')})`)
}

const edgeCount = [...graph.values()].reduce((total, dependencies) => total + dependencies.size, 0)
if (cyclicComponents.length > 0) {
  logDomainSummary('mod-runtime-import-cycles', 'FAIL', `${cyclicComponents.length} cross-MOD runtime cycle component(s)`)
  process.exit(1)
}
logDomainSummary('mod-runtime-import-cycles', 'PASS', `${graph.size} files, ${edgeCount} runtime edges`)
