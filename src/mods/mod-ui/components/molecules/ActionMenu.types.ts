export interface ActionMenuItem {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
}

export interface ActionMenuProps {
  items?: ActionMenuItem[];
}
