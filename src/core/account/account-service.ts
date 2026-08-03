/**
 * Purpose: Preserve the public account service API while delegating owned responsibilities.
 * Owner: core:account
 * Responsibility: Export account operations, session access, errors, and rate limiting only.
 */

import 'server-only'

export {
  cleanupInactiveAccounts,
  deleteAccount,
  registerAccount,
  syncAccount,
} from './account-service/account-operations'
export { AccountServiceError } from './account-service/error'
export { enforceAccountRateLimit } from './account-service/rate-limit'
export {
  getSessionAccount,
  getSessionAccountIdentity,
  loginAccount,
  logoutAccount,
  requireSessionAccountId,
  type SessionAccountIdentity,
} from './account-service/session-service'
