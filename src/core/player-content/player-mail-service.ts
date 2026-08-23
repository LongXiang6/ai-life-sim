/**
 * Purpose: Preserve the public player-mail API across focused mailbox components.
 * Owner: core:player-content
 * Responsibility: Export mailbox identity, reads, commands, portrait assets, cleanup, and reconciliation only.
 */

import 'server-only'

export {
  cleanupExpiredPlayerMail,
  cleanupExpiredPlayerMailIfNeeded,
} from './player-mail-service/mailbox-cleanup'
export {
  acceptPlayerMailboxTalent,
  deletePlayerMailboxMessage,
  markPlayerMailboxMessageRead,
  sendPlayerMail,
} from './player-mail-service/mailbox-commands'
export { claimPlayerMailboxReward } from './player-mail-service/mailbox-reward-service'
export {
  bindDiagnosticMailboxIdentity,
  reserveDiagnosticMailboxAddress,
} from './player-mail-service/mailbox-identity'
export { readPlayerMailboxPage } from './player-mail-service/mailbox-read-service'
export { reconcileAccountMailTalents } from './player-mail-service/mailbox-talent-storage'
export {
  createPortraitPlayerMail,
  readMailboxPortraitAsset,
} from './player-mail-service/portrait-mail-service'
export type { PlayerMailboxIdentity } from './player-mail-service/types'
