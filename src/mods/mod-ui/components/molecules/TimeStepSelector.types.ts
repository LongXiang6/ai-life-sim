/**
 * Purpose: Define the public props for the time-step selector molecule.
 * Owner: mod-ui
 * Responsibility: Keep selector input and change callbacks typed without owning state.
 */

import type { TimeStep } from '@/foundation'

export interface TimeStepSelectorProps {
  value: TimeStep;
  onChange: (step: TimeStep) => void;
  className?: string;
}
