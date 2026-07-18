/**
 * @module typescript-loader.mjs
 * @description Node 20 compatible ESM loader for project TypeScript checks without an extra runtime dependency
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const projectRoot = path.resolve(process.env.AI_LIFE_SIM_PROJECT_ROOT || process.cwd())
const sourceRoot = path.join(projectRoot, 'src')
const candidateSuffixes = [
  '',
  '.ts',
  '.tsx',
  '.mts',
  '.js',
  '.mjs',
  path.join('', 'index.ts'),
  path.join('', 'index.tsx'),
  path.join('', 'index.mjs'),
  path.join('', 'index.js'),
]

async function isFile(target) {
  const stat = await fs.stat(target).catch(() => null)
  return stat?.isFile() === true
}

async function resolveCandidate(basePath) {
  for (const suffix of candidateSuffixes) {
    const candidate = suffix.startsWith('index.')
      ? path.join(basePath, suffix)
      : `${basePath}${suffix}`
    if (await isFile(candidate)) return candidate
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  if (path.isAbsolute(specifier)) {
    const target = await resolveCandidate(specifier)
    if (target) return { url: pathToFileURL(target).href, shortCircuit: true }
  }

  if (specifier.startsWith('@/')) {
    const target = await resolveCandidate(path.join(sourceRoot, specifier.slice(2)))
    if (target) return { url: pathToFileURL(target).href, shortCircuit: true }
  }

  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const parentPath = fileURLToPath(context.parentURL)
    const target = await resolveCandidate(path.resolve(path.dirname(parentPath), specifier))
    if (target) return { url: pathToFileURL(target).href, shortCircuit: true }
  }

  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (/\.(?:ts|tsx|mts)$/.test(url)) {
    const filePath = fileURLToPath(url)
    const source = await fs.readFile(filePath, 'utf8')
    const transpiled = ts.transpileModule(source, {
      fileName: filePath,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
        isolatedModules: true,
        sourceMap: false,
      },
      reportDiagnostics: false,
    })
    return {
      format: 'module',
      source: transpiled.outputText,
      shortCircuit: true,
    }
  }

  return nextLoad(url, context)
}
