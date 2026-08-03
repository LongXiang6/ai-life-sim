/**
 * Purpose: Preserve the public narrative-memory database API across focused storage components.
 * Owner: core:storage
 * Responsibility: Export database lifecycle, synchronization, search, and decay commands only.
 */

import 'server-only'

export {
  closeNarrativeMemoryDatabaseForTests,
  getNarrativeMemoryDatabasePath,
} from './narrative-memory-store/database'
export { advanceNarrativeMemoryDatabase } from './narrative-memory-store/memory-decay'
export { searchNarrativeMemoryDatabase } from './narrative-memory-store/memory-search'
export { syncNarrativeMemoryDatabase } from './narrative-memory-store/memory-sync'
export type {
  NarrativeMemorySearchResult,
  NarrativeMemorySummaryInput,
} from './narrative-memory-store/types'
