/**
 * Purpose: Verify that generated file-header baseline hashes are portable across Git worktrees.
 * Owner: quality:standardization
 * Responsibility: Baseline hash invariants only; snapshot generation remains in structure-snapshot.
 */

import { fail, structureConfigPath } from './context.mjs'
import { hashStandardizedText } from './structure-snapshot.mjs'

export function checkBaselineHashPortability() {
  const lf = 'first\nsecond\n'
  const crlf = 'first\r\nsecond\r\n'
  const cr = 'first\rsecond\r'
  if (
    hashStandardizedText(lf) !== hashStandardizedText(crlf)
    || hashStandardizedText(lf) !== hashStandardizedText(cr)
  ) {
    fail(
      'STD-HEADER-HASH-PORTABILITY',
      structureConfigPath,
      '文件头基线哈希必须忽略工作树换行差异',
    )
  }
}
