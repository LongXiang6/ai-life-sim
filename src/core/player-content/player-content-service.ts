/**
 * Purpose: Preserve the public player-content service API across focused business components.
 * Owner: core:player-content
 * Responsibility: Export cloud-save, leaderboard, legendary encounter, cleanup, and metrics operations only.
 */

import 'server-only'

export {
  decodeCloudManualSave,
  deleteCloudManualSave,
  readCloudManualSavePayload,
  readCloudManualSaveSummary,
  saveCloudManualSave,
} from './player-content-service/cloud-manual-save-service'
export {
  deletePlayerContentForAccount,
  getPlayerContentAggregateCounts,
} from './player-content-service/content-maintenance'
export {
  markLegendaryEncounterInjected,
  selectLegendaryEncounter,
} from './player-content-service/legendary-encounter-service'
export {
  projectLeaderboardRecord,
  projectStructuredGameRecords,
  queuePortraitMailJob,
  readLeaderboardEntries,
  readLeaderboardPortraitAsset,
} from './player-content-service/leaderboard-service'
