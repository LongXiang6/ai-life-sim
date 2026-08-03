# Purpose: Coordinate deterministic MOD anomaly-scanner heuristic phases.
# Owner: quality:mod
# Responsibility: Initialize shared scanner state and load A1-A12 phases in fixed order only.

# Purpose: Detect cross-file MOD anomalies that deterministic domain checks do not cover.
# Owner: quality:mod
# Responsibility: Report A1-A12 heuristics only; runtime systems retain business validation and state.
#             A7 (Zod outputSchema never validated) | A8 (store write-only fields)
#             A9 (AI call missing apiKey) | A10 (lifecycle exports never wired)
#             A11 (migration file conventions) | A12 (direct localStorage in MODs)
#                              .ts/.tsx                 .tsx                      .ts/.tsx/.css          .ts/.tsx
#          checker-utils.ps1                      dot-source
#                             $modsDir, $SrcDir, $VerboseOutput

Write-Host ""
Write-Host "  Anomaly Scanner - intelligent cross-file heuristic checks" -ForegroundColor Cyan

$anomStartErrors = $E.Errors
$anomStartWarnings = $E.Warnings

# ============================================================

$anomalyScannerRoot = Join-Path $PSScriptRoot 'anomaly-scanner'
. (Join-Path $anomalyScannerRoot 'source-layout-rules.ps1')
. (Join-Path $anomalyScannerRoot 'prompt-subsystem-rules.ps1')
. (Join-Path $anomalyScannerRoot 'schema-store-rules.ps1')
. (Join-Path $anomalyScannerRoot 'ai-call-rules.ps1')
. (Join-Path $anomalyScannerRoot 'lifecycle-storage-rules.ps1')
