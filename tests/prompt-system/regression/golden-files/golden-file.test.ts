/**
 * 黄金文件回归测试
 */

import { describe, test, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { NarrativeAIResponseSchema } from '../../../../src/mods/mod-engine/helpers/narrative-ai-protocol'

const goldenDir = join(__dirname, '.')

describe('Golden File Regression Tests', () => {
  const goldenData = JSON.parse(
    readFileSync(join(goldenDir, 'valid-responses.json'), 'utf-8'),
  )

  test.each(Object.entries(goldenData))('validates golden file: %s', (name, data) => {
    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
    if (!result.success) {
      console.error(`Golden file "${name}" validation failed:`, result.error)
    }
  })

  test('all golden files are valid', () => {
    const results = Object.entries(goldenData).map(([name, data]) => ({
      name,
      result: NarrativeAIResponseSchema.safeParse(data),
    }))

    const failures = results.filter(r => !r.result.success)
    if (failures.length > 0) {
      const failureMessages = failures.map(
        f => `${f.name}: ${f.result.success ? '' : f.result.error.message}`,
      )
      expect.fail(`Golden file validation failed:\n${failureMessages.join('\n')}`)
    }
  })
})

describe('Golden File - Minimal Response', () => {
  test('minimal response validates', () => {
    const data = goldenData.minimal
    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})

describe('Golden File - Branch Response', () => {
  test('branch response validates', () => {
    const data = goldenData.withBranch
    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test('branch has required fields', () => {
    const data = goldenData.withBranch
    expect(data.命运分支).toBe(true)
    expect(data.分支标题).toBeDefined()
    expect(data.分支选项).toBeDefined()
    expect(data.分支选项.length).toBeGreaterThanOrEqual(2)
  })
})

describe('Golden File - Full Response', () => {
  test('full response validates', () => {
    const data = goldenData.full
    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test('full response has all optional fields', () => {
    const data = goldenData.full
    expect(data.状态变更).toBeDefined()
    expect(data.长期事件).toBeDefined()
    expect(data.原创内容).toBeDefined()
    expect(data.新伏笔).toBeDefined()
    expect(data.关键事件).toBeDefined()
    expect(data.命运意图判定).toBeDefined()
    expect(data.新延迟因果).toBeDefined()
  })
})

describe('Golden File - Enum Values', () => {
  test('importance levels are valid', () => {
    const data = goldenData.importanceLevels
    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })

  test('event types are valid', () => {
    const data = goldenData.eventTypes
    const result = NarrativeAIResponseSchema.safeParse(data)
    expect(result.success).toBe(true)
  })
})
