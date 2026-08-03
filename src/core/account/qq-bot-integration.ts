/**
 * Purpose: Preserve the public QQ Bot integration API across focused components.
 * Owner: core:account
 * Responsibility: Export binding, request authentication, and project-status contracts only.
 */

import 'server-only'

export {
  bindQqAccount,
  createAccountQqLinkCode,
  readQqBotAccountStatus,
  unlinkAccountQq,
  unlinkQqBotAccount,
} from './qq-bot-integration/account-binding'
export {
  QqBotAccountRequestSchema,
  QqBotBindRequestSchema,
  QqBotQqSchema,
  type QqBotAccountStatus,
  type QqBotProjectStatus,
  type QqLinkCodePayload,
} from './qq-bot-integration/contracts'
export { readQqBotProjectStatus } from './qq-bot-integration/project-status'
export {
  buildQqBotSignature,
  readVerifiedQqBotJson,
  verifyQqBotRequest,
} from './qq-bot-integration/request-authentication'
