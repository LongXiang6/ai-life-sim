import type { CloudManualSaveSummary } from '@/core/player-content/player-content-contract'

export interface SaveDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (slot: number, name: string) => Promise<void> | void;
  onCloudSave?: (name: string) => Promise<void> | void;
  cloudSave: CloudManualSaveSummary | null;
  cloudLoading?: boolean;
  defaultWorldName?: string;
  defaultCharacterName?: string;
}
