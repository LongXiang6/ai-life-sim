/**
 * Purpose: Declare the public view contract returned by the character-creation hook.
 * Owner: mod-pages/character-create
 * Responsibility: Type contract only; no state or calculations.
 */

import { RACE_LIFESPAN } from '@/mods/mod-character'

import { LABELS } from './character-create-options'

export interface UseCharacterCreateLogicReturn {
  name: string
  nameError: string
  gender: 'male' | 'female'
  race: string
  background: string
  setFormName: (value: string) => void
  setNameError: (value: string) => void
  setFormGender: (value: 'male' | 'female') => void
  setRace: (value: string) => void
  setBackground: (value: string) => void
  handleDice: () => void
  allGenders: string[]
  customGenders: string[]
  showCustomGender: boolean
  setShowCustomGender: (value: boolean) => void
  customGenderInput: string
  setCustomGenderInput: (value: string) => void
  handleAddCustomGender: () => void
  removeCustomGender: (gender: string) => void
  getGenderIcon: (gender: string) => string
  isGenderOptionActive: (option: string, current: string) => boolean
  genderOptionToValue: (option: string) => 'male' | 'female'
  ADDITIONAL_GENDERS: Record<string, string>
  allRaces: string[]
  customRaces: string[]
  showCustomRace: boolean
  setShowCustomRace: (value: boolean) => void
  showRaceCatalog: boolean
  setShowRaceCatalog: (value: boolean) => void
  raceSearch: string
  setRaceSearch: (value: string) => void
  customRaceInput: string
  setCustomRaceInput: (value: string) => void
  handleAddCustomRace: () => void
  removeCustomRace: (race: string) => void
  getRaceIcon: (race: string) => string
  getRaceDisplayName: (race: string) => string
  raceInfo: typeof RACE_LIFESPAN[string] | undefined
  raceCatalogOptions: Array<{ id: string; name: string }>
  bgPresets: Record<string, string>
  showBgPresetInput: boolean
  setShowBgPresetInput: (value: boolean) => void
  bgPresetNameInput: string
  setBgPresetNameInput: (value: string) => void
  handleAddBgPreset: () => void
  selectBgPreset: (name: string) => void
  removeBgPreset: (name: string) => void
  getBgPresetIcon: (name: string) => string
  manualLifespan: string
  setManualLifespan: (value: string) => void
  manualStartingAge: string
  setManualStartingAge: (value: string) => void
  computedLifespan: number | null
  computedStartingAge: number | null
  previewLifespan: number
  previewStartingAge: number
  ageSetupError: string | null
  canProceed: boolean
  nextBlockReason: string | null
  handleDetectLifespan: () => void
  handleBack: () => void
  handleNext: () => void
  LABELS: typeof LABELS
  RACE_LIFESPAN: typeof RACE_LIFESPAN
}
