/**
 * 修复管道单元测试
 */

import { describe, test, expect } from 'vitest'
import {
  jsonSyntaxRepairStage,
  missingBraceRepairStage,
  annotationCleanupStage,
  NarrativeRepairPipeline,
} from '../../../../src/mods/mod-engine/helpers/repair-pipeline'

describe('JSON Syntax Repair Stage', () => {
  test('detects full-width quotation marks', () => {
    const input = '{"key": "value"}'
    expect(jsonSyntaxRepairStage.canRepair(input)).toBe('json-syntax')
  })

  test('detects full-width colon', () => {
    const input = '{"key"："value"}'
    expect(jsonSyntaxRepairStage.canRepair(input)).toBe('json-syntax')
  })

  test('detects full-width comma', () => {
    const input = '{"key"："value"，"key2"："value2"}'
    expect(jsonSyntaxRepairStage.canRepair(input)).toBe('json-syntax')
  })

  test('returns null for valid ASCII JSON', () => {
    const input = '{"key": "value"}'
    expect(jsonSyntaxRepairStage.canRepair(input)).toBeNull()
  })

  test('repairs full-width quotation marks', () => {
    const input = '{"key": "value"}'
    const result = jsonSyntaxRepairStage.repair(input)
    expect(result.success).toBe(true)
    expect(result.applied).toBe(true)
    expect(result.changes.length).toBeGreaterThan(0)
  })

  test('repairs full-width colon', () => {
    const input = '{"key"："value"}'
    const result = jsonSyntaxRepairStage.repair(input)
    expect(result.success).toBe(true)
    expect(result.applied).toBe(true)
  })

  test('repairs full-width comma', () => {
    const input = '{"key"："value"，"key2"："value2"}'
    const result = jsonSyntaxRepairStage.repair(input)
    expect(result.success).toBe(true)
    expect(result.applied).toBe(true)
  })
})

describe('Missing Brace Repair Stage', () => {
  test('detects missing closing brace', () => {
    const input = '{"key": "value"'
    expect(missingBraceRepairStage.canRepair(input)).toBe('missing-brace')
  })

  test('returns null for balanced braces', () => {
    const input = '{"key": "value"}'
    expect(missingBraceRepairStage.canRepair(input)).toBeNull()
  })

  test('returns null for unbalanced nested braces', () => {
    const input = '{"key": {"nested": "value"}'
    expect(missingBraceRepairStage.canRepair(input)).toBeNull()
  })

  test('repairs missing closing brace', () => {
    const input = '{"key": "value"'
    const result = missingBraceRepairStage.repair(input)
    expect(result.success).toBe(true)
    expect(result.applied).toBe(true)
    expect(result.changes[0].description).toContain('根对象闭合括号')
  })
})

describe('Annotation Cleanup Stage', () => {
  test('detects annotation markers', () => {
    const input = '{"key": "⟪说明⟫value"}'
    expect(annotationCleanupStage.canRepair(input)).toBe('annotation-残留')
  })

  test('returns null for clean input', () => {
    const input = '{"key": "value"}'
    expect(annotationCleanupStage.canRepair(input)).toBeNull()
  })

  test('repairs annotation markers', () => {
    const input = '{"key": "⟪说明⟫value"}'
    const result = annotationCleanupStage.repair(input)
    expect(result.success).toBe(true)
    expect(result.applied).toBe(true)
  })
})

describe('Repair Pipeline', () => {
  test('executes stages in priority order', async () => {
    const pipeline = new NarrativeRepairPipeline()
    const input = '{"key"："⟪说明⟫value"}'
    const context = {
      source: 'test',
      timestamp: Date.now(),
    }

    const metrics = await pipeline.repairWithMetrics(input, context)
    expect(metrics.stages.length).toBe(3)
    expect(metrics.stages[0].stage).toBe('json-syntax')
    expect(metrics.stages[1].stage).toBe('missing-brace')
    expect(metrics.stages[2].stage).toBe('annotation-cleanup')
  })

  test('handles valid JSON without repairs', async () => {
    const pipeline = new NarrativeRepairPipeline()
    const input = '{"key": "value"}'
    const context = {
      source: 'test',
      timestamp: Date.now(),
    }

    const metrics = await pipeline.repairWithMetrics(input, context)
    expect(metrics.finalSuccess).toBe(true)
    expect(metrics.stages.every(s => !s.applied)).toBe(true)
  })

  test('repairs multiple issues', async () => {
    const pipeline = new NarrativeRepairPipeline()
    const input = '{"key"："value"'
    const context = {
      source: 'test',
      timestamp: Date.now(),
    }

    const metrics = await pipeline.repairWithMetrics(input, context)
    expect(metrics.finalSuccess).toBe(true)
    expect(metrics.stages.some(s => s.applied)).toBe(true)
  })

  test('handles completely invalid input', async () => {
    const pipeline = new NarrativeRepairPipeline()
    const input = 'not json at all'
    const context = {
      source: 'test',
      timestamp: Date.now(),
    }

    const metrics = await pipeline.repairWithMetrics(input, context)
    expect(metrics.finalSuccess).toBe(false)
  })

  test('adds custom stage', () => {
    const pipeline = new NarrativeRepairPipeline()
    const customStage = {
      name: 'custom',
      priority: 5,
      canRepair: () => null,
      repair: (_source: string) => ({
        stage: 'custom',
        applied: false,
        changes: [],
        success: true,
      }),
    }

    pipeline.addStage(customStage)
    expect(pipeline.getStages().length).toBe(4)
    expect(pipeline.getStages()[0].name).toBe('custom')
  })
})
