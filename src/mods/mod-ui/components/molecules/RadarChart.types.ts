export interface RadarDimension {
  label: string;
  value: number;
  comment?: string;
}

export interface RadarChartProps {
  dimensions: RadarDimension[];
  size?: number;
  centerLabel?: string;
  className?: string;
}
