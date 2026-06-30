export interface TimeStepSelectorProps {
  value: { unit: 'day' | 'month' | 'season' | 'year'; value: number };
  onChange: (step: { unit: 'day' | 'month' | 'season' | 'year'; value: number }) => void;
  className?: string;
}
