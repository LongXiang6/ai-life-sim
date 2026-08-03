#!/usr/bin/env node
/**
 * Purpose: Verify the specialized PowerShell scanner ownership and fixed composition contract.
 * Owner: quality:structural
 * Responsibility: Scanner-node declarations, component coverage, rule ownership, and retired-entry assertions only.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { DOMAINS } from '../../domains.mjs'

const structuralDir = path.dirname(fileURLToPath(import.meta.url))
const checkDir = path.resolve(structuralDir, '..', '..')
const projectRoot = path.resolve(checkDir, '..', '..')
const contractDomainIds = ['mod', 'narrative', 'structural', 'ui']
const expectedPowerShellSteps = {
  mod: [
    'mod-source-contracts',
    'mod-dependency-wiring-contracts',
    'mod-ownership-contracts',
    'mod-method-contracts',
    'mod-pattern-contracts',
    'mod-anomaly-source-contracts',
    'mod-anomaly-runtime-contracts',
  ],
  narrative: ['critical-method-wiring'],
  ui: ['ui-tsx-contracts', 'ui-architecture-contracts', 'ui-css-contracts'],
  wiring: ['mod-registration-contract', 'generated-mod-wiring-contract'],
}
const expectedDomainParallelism = { mod: 10, ui: 6 }
const retiredPaths = [
  'scripts/check/check-format',
  'scripts/check/check-format.ps1',
  'scripts/check/domains/mod/anomaly-scanner',
  'scripts/check/domains/mod/anomaly-scanner.ps1',
  'scripts/check/domains/mod/arch-scanner',
  'scripts/check/domains/mod/arch-scanner.ps1',
  'scripts/check/domains/mod/run-anomaly-scanner.ps1',
  'scripts/check/domains/mod/run-architecture-scanner.ps1',
  'scripts/check/domains/mod/run-mod-scanners.ps1',
  'scripts/check/domains/mod/run-smart-scanner.ps1',
  'scripts/check/domains/mod/scanner-context.ps1',
  'scripts/check/domains/mod/smart-scanner',
  'scripts/check/domains/mod/smart-scanner.ps1',
  'scripts/check/domains/ui/css-scanner',
  'scripts/check/domains/ui/css-scanner.ps1',
  'scripts/check/domains/ui/run-ui-scanners.ps1',
  'scripts/check/domains/ui/ui-scanner',
  'scripts/check/domains/ui/ui-scanner.ps1',
]

const failures = []
const referencedContracts = new Map()
const runnerContractIds = new Map()

function assertOk(condition, message) {
  if (!condition) failures.push(message)
}

function relative(filePath) {
  return path.relative(projectRoot, filePath).replace(/\\/g, '/')
}

function listPowerShellFiles(directory) {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ps1'))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => relative(left).localeCompare(relative(right), 'en'))
}

function containsFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return false
  const stat = fs.statSync(targetPath)
  if (stat.isFile()) return true
  return fs.readdirSync(targetPath, { withFileTypes: true })
    .some((entry) => containsFiles(path.join(targetPath, entry.name)))
}

function extractFixedRefs(source, rootName) {
  const pattern = new RegExp(`Join-Path\\s+\\$${rootName}\\s+'([^']+\\.ps1)'`, 'g')
  return [...source.matchAll(pattern)].map((match) => match[1])
}

for (const [domainId, expectedIds] of Object.entries(expectedPowerShellSteps)) {
  const steps = DOMAINS[domainId]?.steps?.filter((step) => step.cmd === 'powershell') ?? []
  assertOk(
    steps.map((step) => step.id).join(',') === expectedIds.join(','),
    `${domainId} PowerShell node list is not the fixed specialized list`,
  )

  for (const step of steps) {
    assertOk(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(step.id), `${step.id} has an unstable node ID`)
    assertOk(Number.isInteger(step.order), `${step.id} has no integer order`)
    assertOk(step.phase === 'execute', `${step.id} is not an execute-phase node`)
    assertOk(step.parallel === true, `${step.id} does not explicitly allow parallel execution`)
    assertOk(Array.isArray(step.dependsOn), `${step.id} has no explicit dependency list`)

    const fileFlag = step.args.indexOf('-File')
    const runnerRelativePath = fileFlag >= 0 ? step.args[fileFlag + 1] : null
    assertOk(Boolean(runnerRelativePath), `${step.id} does not declare a fixed PowerShell runner`)
    if (!runnerRelativePath) continue

    const runnerPath = path.join(projectRoot, runnerRelativePath)
    assertOk(fs.existsSync(runnerPath), `${step.id} runner is missing: ${runnerRelativePath}`)
    if (!fs.existsSync(runnerPath)) continue

    const source = fs.readFileSync(runnerPath, 'utf8')
    assertOk(!/\b(?:Get-ChildItem|Resolve-ScannerPath|Invoke-Expression)\b/u.test(source), `${step.id} dynamically discovers components`)
    assertOk(/Join-Path\s+\$runtimeRoot\s+'context\.ps1'/u.test(source), `${step.id} does not initialize the shared context`)
    assertOk(/Join-Path\s+\$runtimeRoot\s+'complete\.ps1'/u.test(source), `${step.id} does not publish through the shared completion contract`)

    const contractIdMatch = source.match(/-ContractId\s+'([^']+)'/u)
    assertOk(Boolean(contractIdMatch), `${step.id} has no stable terminal contract ID`)
    if (contractIdMatch) {
      const prior = runnerContractIds.get(contractIdMatch[1])
      assertOk(!prior, `${step.id} duplicates terminal contract ID ${contractIdMatch[1]} from ${prior}`)
      runnerContractIds.set(contractIdMatch[1], step.id)
    }

    const runnerDir = path.dirname(runnerPath)
    const contractRefs = extractFixedRefs(source, 'contractRoot')
    assertOk(contractRefs.length > 0, `${step.id} has no fixed contract component list`)
    for (const name of contractRefs) {
      const contractPath = path.join(runnerDir, 'contracts', name)
      assertOk(fs.existsSync(contractPath), `${step.id} references missing contract ${relative(contractPath)}`)
      referencedContracts.set(contractPath, (referencedContracts.get(contractPath) ?? 0) + 1)
    }
    for (const name of extractFixedRefs(source, 'indexRoot')) {
      const indexPath = path.join(runnerDir, 'indexes', name)
      assertOk(fs.existsSync(indexPath), `${step.id} references missing index ${relative(indexPath)}`)
    }
  }
}

for (const [domainId, parallelism] of Object.entries(expectedDomainParallelism)) {
  assertOk(DOMAINS[domainId]?.parallelism === parallelism, `${domainId} specialized parallelism must be ${parallelism}`)
}

const contractFiles = contractDomainIds.flatMap((domainId) => (
  listPowerShellFiles(path.join(checkDir, 'domains', domainId, 'contracts'))
))
for (const contractPath of contractFiles) {
  assertOk(
    referencedContracts.get(contractPath) === 1,
    `${relative(contractPath)} must be referenced by exactly one runner`,
  )
}
for (const [contractPath] of referencedContracts) {
  assertOk(contractFiles.includes(contractPath), `${relative(contractPath)} is outside the owned contract directories`)
}

const ruleOwners = new Map()
for (const contractPath of contractFiles) {
  const source = fs.readFileSync(contractPath, 'utf8')
  const executableLines = source.split(/\r?\n/u).filter((line) => !line.trimStart().startsWith('#'))
  const callLines = executableLines.filter((line) => /\b(?:Fail|Warn|Pass)\b/u.test(line))
  const literalCalls = callLines.flatMap((line) => (
    [...line.matchAll(/\b(?:Fail|Warn|Pass)\s*(?:\(\s*)?(['"])([^'"]+)\1/gu)]
  ))
  assertOk(callLines.length === literalCalls.length, `${relative(contractPath)} has a non-literal or ambiguous rule ID`)
  assertOk(literalCalls.length > 0, `${relative(contractPath)} does not own a feedback rule`)
  for (const match of literalCalls) {
    const ruleId = match[2]
    assertOk(/^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/u.test(ruleId), `${relative(contractPath)} has unstable rule ID ${ruleId}`)
    const owners = ruleOwners.get(ruleId) ?? new Set()
    owners.add(contractPath)
    ruleOwners.set(ruleId, owners)
  }
}
for (const [ruleId, owners] of ruleOwners) {
  assertOk(owners.size === 1, `${ruleId} is owned by multiple contracts: ${[...owners].map(relative).join(', ')}`)
}

for (const domainId of contractDomainIds) {
  const indexFiles = listPowerShellFiles(path.join(checkDir, 'domains', domainId, 'indexes'))
  for (const indexPath of indexFiles) {
    const source = fs.readFileSync(indexPath, 'utf8')
    const executable = source.split(/\r?\n/u).filter((line) => !line.trimStart().startsWith('#')).join('\n')
    assertOk(!/\b(?:Fail|Warn|Pass)\b/u.test(executable), `${relative(indexPath)} emits findings instead of read-only index data`)
  }
}

for (const retiredPath of retiredPaths) {
  assertOk(!containsFiles(path.join(projectRoot, retiredPath)), `retired scanner entry still exists: ${retiredPath}`)
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`)
  process.exit(1)
}

console.log(`PASS: specialized-scanner-contract-smoke (${contractFiles.length} contracts, ${ruleOwners.size} rule IDs)`)
