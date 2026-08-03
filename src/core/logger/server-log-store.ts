/**
 * Purpose: Preserve the public server-log storage API across focused storage components.
 * Owner: core:logger
 * Responsibility: Export the log-store contract only; persistence, querying, cleanup, and identity have separate owners.
 */

import 'server-only'

export type {
  ServerLogEntryInput,
  ServerLogQuery,
  ServerLogRecord,
} from './server-log-store/contracts'
export {
  closeServerLogDatabaseForTests,
  getServerLogArchiveDatabasePath,
  getServerLogDatabase,
  getServerLogDatabasePath,
  getServerLogRoot,
  prepareServerLogArchiveDatabase,
} from './server-log-store/database'
export { appendServerLogEntry } from './server-log-store/entry-writer'
export {
  reserveDeviceProvenanceIdentity,
  reserveDiagnosticIdentity,
  type DiagnosticIdentityReservationResult,
} from './server-log-store/identity-reservations'
export { cleanupServerLogsNow } from './server-log-store/retention-cleanup'
export { getServerRequestSource } from './server-log-store/request-source'
export { queryServerLogEntries } from './server-log-store/server-log-query'
export { safeLogSegment, type ServerRequestSource } from './server-log-safety'
