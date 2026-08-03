/**
 * Purpose: Enforce ownership, reviewed file-budget exceptions, changed-file headers, and structure-index drift.
 * Owner: quality:standardization
 * Responsibility: Compare the current snapshot with reviewed baselines and report actionable structural failures.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  canonicalJson,
  fail,
  projectRoot,
  readJson,
  readText,
  structureConfig,
} from './context.mjs'
import { buildStructureIndex, buildStructureSnapshot } from './structure-snapshot.mjs'

const budgetExceptionDirectory = path.join(
  projectRoot,
  'scripts',
  'check',
  'rules',
  'file-budget-exceptions',
)
const headerBaselinePath = path.join(projectRoot, 'scripts', 'check', 'rules', 'file-header-baseline.generated.json')
const indexPath = path.join(projectRoot, 'scripts', 'check', 'generated', 'project-structure-index.generated.json')

function loadEntries(file, rule) {
  if (!fs.existsSync(file)) {
    fail(rule, file, '结构基线不存在')
    return new Map()
  }
  const parsed = readJson(file)
  return new Map((parsed.entries ?? []).map((entry) => [entry.path, entry]))
}

function loadBudgetExceptions() {
  const exceptions = new Map()
  if (!fs.existsSync(budgetExceptionDirectory)) {
    fail('STD-BUDGET-EXCEPTIONS', budgetExceptionDirectory, '文件预算例外目录不存在')
    return exceptions
  }

  const files = fs.readdirSync(budgetExceptionDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
  for (const entry of files) {
    const file = path.join(budgetExceptionDirectory, entry.name)
    const parsed = readJson(file)
    if (readText(file) !== canonicalJson(parsed)) {
      fail('STD-JSON-FORMAT', file, 'JSON 必须使用 2 个空格缩进并以单一换行结束')
    }
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) {
      fail('STD-BUDGET-EXCEPTIONS', file, '例外分片必须声明 schemaVersion=1 和 entries 数组')
      continue
    }

    const sortedPaths = parsed.entries.map((item) => item.path)
    const expectedPaths = [...sortedPaths].sort((left, right) => left.localeCompare(right, 'en'))
    if (JSON.stringify(sortedPaths) !== JSON.stringify(expectedPaths)) {
      fail('STD-BUDGET-ORDER', file, '例外条目必须按 path 的 ASCII 升序排列')
    }

    for (const item of parsed.entries) {
      const keys = Object.keys(item)
      const expectedKeys = ['path', 'owner', 'reviewedLines', 'reason']
      if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
        fail('STD-BUDGET-SCHEMA', file, `例外 ${item.path ?? '<missing>'} 字段必须为 ${expectedKeys.join('、')}`)
        continue
      }
      if (
        typeof item.path !== 'string'
        || typeof item.owner !== 'string'
        || !Number.isInteger(item.reviewedLines)
        || item.reviewedLines < 1
        || typeof item.reason !== 'string'
        || item.reason.trim().length < 8
      ) {
        fail('STD-BUDGET-SCHEMA', file, `例外 ${item.path ?? '<missing>'} 缺少有效路径、所有者、审查行数或职责理由`)
        continue
      }
      if (exceptions.has(item.path)) {
        fail('STD-BUDGET-DUPLICATE', file, `例外路径重复：${item.path}`)
        continue
      }
      exceptions.set(item.path, item)
    }
  }
  return exceptions
}

function checkBudgets(snapshot, exceptions) {
  const currentPaths = new Set(snapshot.map((file) => file.path))
  for (const file of snapshot) {
    if (!file.overBudget) {
      if (exceptions.has(file.path)) {
        fail('STD-BUDGET-STALE', path.join(projectRoot, file.path), '文件已回到优先预算内，请移除职责例外')
      }
      continue
    }
    const reviewed = exceptions.get(file.path)
    if (!reviewed) {
      fail('STD-FILE-BUDGET', path.join(projectRoot, file.path), `新超预算文件为 ${file.lines} 行，优先预算为 ${file.budget} 行`)
      continue
    }
    if (file.lines > reviewed.reviewedLines) {
      fail('STD-FILE-GROWTH', path.join(projectRoot, file.path), `超预算文件从审查上限 ${reviewed.reviewedLines} 行增长到 ${file.lines} 行`)
    }
    if (reviewed.owner !== file.owner) {
      fail('STD-BUDGET-OWNER', path.join(projectRoot, file.path), '预算基线所有者与当前结构所有者不一致')
    }
  }
  for (const filePath of exceptions.keys()) {
    if (!currentPaths.has(filePath)) {
      fail('STD-BUDGET-STALE', path.join(projectRoot, filePath), '职责例外引用的文件已不存在')
    }
  }
}

function checkHeaders(snapshot, baseline) {
  const currentPaths = new Set(snapshot.map((file) => file.path))
  for (const file of snapshot) {
    if (!file.requiresHeader) continue
    const reviewed = baseline.get(file.path)
    if (file.hasHeader) {
      if (reviewed) fail('STD-HEADER-STALE', path.join(projectRoot, file.path), '文件头已补齐，请移除旧文件头基线')
      continue
    }
    if (!reviewed) {
      fail('STD-FILE-HEADER', path.join(projectRoot, file.path), '文件顶部缺少 Purpose、Owner、Responsibility 说明')
      continue
    }
    if (reviewed.sha256 !== file.sha256) {
      fail('STD-FILE-HEADER', path.join(projectRoot, file.path), '存量文件已修改，必须补齐标准文件头')
    }
    if (reviewed.owner !== file.owner) {
      fail('STD-HEADER-OWNER', path.join(projectRoot, file.path), '文件头基线所有者与当前结构所有者不一致')
    }
  }
  for (const filePath of baseline.keys()) {
    if (!currentPaths.has(filePath)) {
      fail('STD-HEADER-STALE', path.join(projectRoot, filePath), '文件头基线引用的文件已不存在')
    }
  }
}

function checkIndex(snapshot) {
  const expected = canonicalJson(buildStructureIndex(snapshot))
  if (!fs.existsSync(indexPath)) {
    fail('STD-STRUCTURE-INDEX', indexPath, '自动结构索引不存在')
    return
  }
  if (readText(indexPath) !== expected) {
    fail('STD-STRUCTURE-INDEX', indexPath, '自动结构索引与当前目录、所有者或文件清单不一致')
  }
}

export function checkStructure() {
  const snapshot = buildStructureSnapshot()
  for (const file of snapshot) {
    if (!file.owner) fail('STD-FILE-OWNER', path.join(projectRoot, file.path), '文件无法映射到唯一所有者')
  }
  checkBudgets(snapshot, loadBudgetExceptions())
  checkHeaders(snapshot, loadEntries(headerBaselinePath, 'STD-HEADER-BASELINE'))
  checkIndex(snapshot)
  return {
    files: snapshot.length,
    owners: new Set(snapshot.map((file) => file.owner)).size,
    overBudget: snapshot.filter((file) => file.overBudget).length,
    preferredLineBudget: structureConfig.preferredLineBudget,
  }
}
