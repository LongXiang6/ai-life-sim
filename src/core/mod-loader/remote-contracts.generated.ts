/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

/** 各 MOD index.ts 导出的 Remote API 函数名（供运行时契约校验） */
export const REMOTE_API_CONTRACTS: Record<string, readonly string[]> = {
  'mod-base-universe': ['round'],
  'mod-character': ['aggregatePatternSystemModifiers', 'drawTalents', 'estimateDestinyPatternTokenBudget', 'filterDigitsOnly', 'findTalentById', 'formatPatternSystemModifiersForDisplay', 'getAllAttrSemantics', 'getAttrSemantic', 'getAttrTierIndex', 'getHealthStatusLabel', 'getLifeStagePoolForWorldview', 'getMentalStateLabel', 'getRecoveryRounds', 'hasImmortalLifespanHint', 'inferDeathCause', 'loadDestinyPatternPool', 'randomName', 'resolveDestinyPatternWorldTags', 'round', 'saveDestinyPatternPool', 'shouldSkipOldAgeDeath', 'sumAttrBonus'],
  'mod-difficulty': ['applyCeilingSuppress'],
  'mod-engine': ['applyGameSave', 'buildOrchestratorWorldSetting', 'buildStyleInstruction', 'buildSummaryPrompt', 'buildSummarySystemPrompt', 'buildWordCountInstruction', 'checkAndClearPreGenOnTimeStepChange', 'clampMaxTokens', 'clearPreGenQueue', 'clearPreGenResult', 'collectGameSavePayload', 'computeSummaryCharLimit', 'computeSummaryL2Tokens', 'computeSummaryL3Tokens', 'computeSummaryL4Tokens', 'computeSummaryL5Tokens', 'computeSummaryL6Tokens', 'computeSummaryTokenBudget', 'daysBetween', 'encodeTimeStepKey', 'estimateTokenBudget', 'estimateTokens', 'fillPreGenQueue', 'formatCurrentNarrativeTimeLabel', 'formatNarrativeTimeLabel', 'formatRound', 'getPreGenQueueLength', 'getPreGenQueueStatus', 'getPreGenStatus', 'loadPreGenResult', 'resolveNarrativeBranchChoice', 'saveCurrentGameToSlot', 'savePreGenResult', 'setForceBranchNextRound', 'setPreGenStatus', 'setSimulationTimeStep', 'setSimulationTimeStepByKey', 'subscribePreGenQueue', 'syncOrchestratorToEngineStore', 'timeStepLabel'],
  'mod-environment-ecology': ['clamp', 'getPollutionLevel', 'pickRandom', 'randomInt', 'round'],
  'mod-golden-finger': ['getTemplateById', 'getTemplatesByKind'],
  'mod-history-dynamics': ['clamp', 'pickRandom', 'round'],
  'mod-power-system': ['calculateEconomicTier', 'clamp', 'computeAverage', 'formatCombatPower', 'generateNextStage', 'getDynamicStage', 'getDynamicStageDecay', 'getEconomicTierInfo', 'getRatingLabel', 'getStageDecay', 'getSubStageLabel', 'getSubStageThreshold', 'getUnitName', 'getWorldCapacity', 'isBeyondReachable', 'isTrueInfinite', 'isUltimateStage', 'parsePowerCeilingLevel', 'pickRandom', 'round'],
  'mod-settings': ['isApiConfigured'],
  'mod-tech-level': ['clamp', 'computeAverage', 'pickRandom', 'randomInt', 'round'],
  'mod-ui': ['acceptDisclaimer', 'isDisclaimerAccepted'],
  'mod-world': ['allocateWorldCode', 'applyCoherenceKeepUserTags', 'applyCoherenceToWorldConfig', 'buildCoherenceLocksFromUi', 'buildCoherenceNote', 'buildDefaultCalibration', 'buildPowerCeilingPresets', 'buildPowerCeilingPresetsForNarrative', 'buildWorldCoherenceHint', 'buildWorldConfigFromCustom', 'buildWorldConfigFromPreset', 'buildWorldInitKvSessionId', 'buildWorldInitPipelineBudgets', 'buildWorldInitPromptVars', 'clampCalibration', 'clampModifier', 'clearWorldGeneratedCache', 'combineTagDefaults', 'commitWorldInitialization', 'configConflictsWithPrehistoric', 'configForWorldInitSubPool', 'createDefaultWorldInitSteps', 'createWorldInitPipelineContext', 'fillPromptTemplate', 'filterCoherentWorldTags', 'formatAdaptationCalibrationBlock', 'formatCalibrationSummary', 'formatWorldTagsText', 'generateWorldInitBundle', 'getFormulaModifier', 'getIdealistWorlds', 'getMaterialistWorlds', 'getPresetWorld', 'getSurvivalHorrorWorlds', 'getWorldCalibration', 'getWorldviewStyleHint', 'hasAIDimensionMode', 'hasWorldGeneratedCache', 'inferAnchorYearFromDescription', 'inferMapTemplate', 'inferWorldCoherenceFromDescription', 'isWorldInitAIAvailable', 'mapPowerSystemZhToTag', 'mapWorldviewEssenceZhToTag', 'normalizeWorldviewType', 'parseWorldDimensionCalibrationResponse', 'parseWorldTagsResponse', 'previewCoherenceCorrection', 'resolvePresetWorldCode', 'resolveStaticPoolWorldviewKey', 'resolveWorldDimensionDecision', 'resolveWorldviewStyleHint', 'runWorldInitPipeline', 'scanWorldCodesWithGeneratedCache', 'shouldUseGenericSimulationPools', 'shouldUseStaticEntityFallback', 'startBackgroundWorldInit', 'startBackgroundWorldInitForCustom', 'translateTagValue'],
  'mod-world-map': ['buildFactionColors', 'computeRenderData', 'hitTestHex', 'renderMap'],
}
