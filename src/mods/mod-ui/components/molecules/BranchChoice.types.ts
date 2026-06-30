export interface BranchOption {
  id: string;
  label: string;
  description?: string;
}

export interface BranchChoiceProps {
  options: BranchOption[];
  onSelect: (optionId: string) => void;
  allowCustom?: boolean;
  customPlaceholder?: string;
  onCustomConfirm?: (text: string) => void;
  title?: string;
  disabled?: boolean;
}
