/**
 * Purpose: Preserve the public QQ points API across contract, repository, and operation components.
 * Owner: core:account
 * Responsibility: Export request schemas, result types, execution, and balance reads only.
 */

import 'server-only'

export {
  QqPointRequestSchema,
  type QqPointAdjustResult,
  type QqPointBalanceResult,
  type QqPointCheckinResult,
  type QqPointLeaderboardResult,
  type QqPointRequest,
  type QqPointResult,
  type QqPointTransferResult,
} from './qq-points-service/contracts'
export { executeQqPointRequest, readQqPointBalance } from './qq-points-service/operations'
