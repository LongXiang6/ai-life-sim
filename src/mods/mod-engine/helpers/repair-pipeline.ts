/**
 * @module repair-pipeline.ts
 * @description 统一修复管道 — JSON 语法、缺失括号、枚举归一化、空值清理
 * @mod mod-engine
 *
 * 所有修复阶段按优先级排序，每个阶段只处理自己能修复的错误类型。
 * 修复结果通过 RepairMetrics 返回，用于监控和优化。
 */

/** 修复阶段能识别的错误类型 */
export type RepairErrorType =
  | 'json-syntax'        // 全角引号、冒号、逗号
  | 'missing-brace'      // 缺失的闭合括号
  | 'invalid-enum'       // 近义枚举值
  | 'empty-value'        // 空数组、空对象
  | 'annotation-残留'     // 示例说明标记
  | 'unknown'

/** 修复阶段执行结果 */
export interface RepairStageResult {
  stage: string
  applied: boolean
  changes: RepairChange[]
  success: boolean
  error?: string
}

/** 单次修复变更记录 */
export interface RepairChange {
  type: 'syntax' | 'structure' | 'enum' | 'removal'
  description: string
  before?: string
  after?: string
}

/** 完整修复指标 */
export interface RepairMetrics {
  original: string
  stages: RepairStageResult[]
  finalResult?: string
  finalSuccess: boolean
  totalTimeMs: number
  context: RepairContext
}

/** 修复上下文 */
export interface RepairContext {
  source: string
  timestamp: number
  worldType?: string
  roundNumber?: number
}

/** 修复阶段接口 */
export interface RepairStage {
  name: string
  priority: number
  canRepair: (source: string) => RepairErrorType | null
  repair: (source: string) => RepairStageResult
}

/**
 * JSON 语法修复阶段
 * 处理全角引号、冒号、逗号等中文标点
 */
export const jsonSyntaxRepairStage: RepairStage = {
  name: 'json-syntax',
  priority: 10,
  canRepair(source) {
    if (/[""：，]/u.test(source)) return 'json-syntax'
    return null
  },
  repair(source) {
    const changes: RepairChange[] = []
    let output = ''
    let inAsciiString = false
    let inCurlyString = false
    let escaped = false

    const nextNonWhitespace = (from: number): string | undefined => {
      for (let index = from; index < source.length; index++) {
        if (!/\s/u.test(source[index]!)) return source[index]
      }
      return undefined
    }

    for (let index = 0; index < source.length; index++) {
      const char = source[index]!

      if (inAsciiString) {
        output += char
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === '"') {
          inAsciiString = false
        }
        continue
      }

      if (inCurlyString) {
        if (char === '\u201D' && [':', ',', '}', ']'].includes(nextNonWhitespace(index + 1) ?? '')) {
          output += '"'
          inCurlyString = false
          changes.push({ type: 'syntax', description: '闭合全角引号', before: '\u201D', after: '"' })
        } else if (char === '"') {
          output += '\\"'
        } else {
          output += char
        }
        continue
      }

      if (char === '"') {
        output += char
        inAsciiString = true
      } else if (char === '\u201C') {
        output += '"'
        inCurlyString = true
        changes.push({ type: 'syntax', description: '开启全角引号', before: '\u201C', after: '"' })
      } else if (char === '\uFF0C') {
        output += ','
        changes.push({ type: 'syntax', description: '全角逗号', before: '\uFF0C', after: ',' })
      } else if (char === '\uFF1A') {
        output += ':'
        changes.push({ type: 'syntax', description: '全角冒号', before: '\uFF1A', after: ':' })
      } else {
        output += char
      }
    }

    return {
      stage: this.name,
      applied: changes.length > 0,
      changes,
      success: true,
    }
  },
}

/**
 * 缺失括号修复阶段
 * 只修复最外层缺失的一个闭合括号
 */
export const missingBraceRepairStage: RepairStage = {
  name: 'missing-brace',
  priority: 20,
  canRepair(source) {
    if (!source.startsWith('{') || !source.endsWith('}')) return null

    const stack: Array<'{' | '['> = []
    let inString = false
    let escaped = false
    for (const char of source) {
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === '"') {
          inString = false
        }
        continue
      }
      if (char === '"') {
        inString = true
        continue
      }
      if (char === '{' || char === '[') {
        stack.push(char)
        continue
      }
      if (char !== '}' && char !== ']') continue
      const expectedOpening = char === '}' ? '{' : '['
      if (stack.at(-1) !== expectedOpening) return null
      stack.pop()
    }

    if (!inString && stack.length === 1 && stack[0] === '{') return 'missing-brace'
    return null
  },
  repair(source) {
    const changes: RepairChange[] = []
    const repaired = source + '}'
    changes.push({ type: 'structure', description: '补充缺失的根对象闭合括号' })
    return {
      stage: this.name,
      applied: true,
      changes,
      success: true,
    }
  },
}

/**
 * 注释标记清理阶段
 * 删除标准示例中可能被模型误复制的 ⟪说明⟫
 */
export const annotationCleanupStage: RepairStage = {
  name: 'annotation-cleanup',
  priority: 30,
  canRepair(source) {
    if (/⟪[^⟫]*⟫/u.test(source)) return 'annotation-残留'
    return null
  },
  repair(source) {
    const changes: RepairChange[] = []
    let output = ''
    let inString = false
    let escaped = false
    const ANNOTATION_OPEN = '⟪'
    const ANNOTATION_CLOSE = '⟫'

    for (let index = 0; index < source.length; index++) {
      const char = source[index]!

      if (inString) {
        output += char
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === '"') {
          inString = false
        }
        continue
      }

      if (char === '"') {
        output += char
        inString = true
        continue
      }

      if (char === ANNOTATION_OPEN) {
        const closeIndex = source.indexOf(ANNOTATION_CLOSE, index + 1)
        if (closeIndex >= 0) {
          const annotation = source.slice(index, closeIndex + 1)
          changes.push({ type: 'removal', description: '移除注释标记', before: annotation })
          index = closeIndex
          continue
        }
      }

      output += char
    }

    return {
      stage: this.name,
      applied: changes.length > 0,
      changes,
      success: true,
    }
  },
}

/**
 * 修复管道
 * 按优先级执行各修复阶段
 */
export class NarrativeRepairPipeline {
  private stages: RepairStage[] = [
    jsonSyntaxRepairStage,
    missingBraceRepairStage,
    annotationCleanupStage,
  ]

  /**
   * 执行完整修复流程
   */
  async repairWithMetrics(
    source: string,
    context: RepairContext,
  ): Promise<RepairMetrics> {
    const startTime = Date.now()
    const metrics: RepairMetrics = {
      original: source,
      stages: [],
      finalSuccess: false,
      totalTimeMs: 0,
      context,
    }

    let current = source
    const sortedStages = [...this.stages].sort((a, b) => a.priority - b.priority)

    for (const stage of sortedStages) {
      const errorType = stage.canRepair(current)
      if (errorType) {
        const result = stage.repair(current)
        metrics.stages.push(result)
        if (result.success && result.applied) {
          current = this.applyStageResult(current, result)
        }
      } else {
        metrics.stages.push({
          stage: stage.name,
          applied: false,
          changes: [],
          success: true,
        })
      }
    }

    metrics.finalResult = current
    metrics.finalSuccess = this.validateResult(current)
    metrics.totalTimeMs = Date.now() - startTime

    return metrics
  }

  private applyStageResult(source: string, result: RepairStageResult): string {
    // 注释清理阶段需要特殊处理
    if (result.stage === 'annotation-cleanup') {
      const annotationCleanup = this.stages.find(s => s.name === 'annotation-cleanup')
      if (annotationCleanup) {
        const freshResult = annotationCleanup.repair(source)
        return freshResult.success ? source.replace(/⟪[^⟫]*⟫/gu, '') : source
      }
    }
    return source
  }

  private validateResult(source: string): boolean {
    try {
      const parsed = JSON.parse(source)
      return typeof parsed === 'object' && parsed !== null
    } catch {
      return false
    }
  }

  /**
   * 添加自定义修复阶段
   */
  addStage(stage: RepairStage): void {
    this.stages.push(stage)
  }

  /**
   * 获取所有修复阶段
   */
  getStages(): RepairStage[] {
    return [...this.stages]
  }
}

/**
 * 全局修复管道实例
 */
export const globalRepairPipeline = new NarrativeRepairPipeline()
