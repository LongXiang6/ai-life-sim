export interface SaveDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (slot: number, name: string) => void;
  defaultWorldName?: string;
  defaultCharacterName?: string;
}
