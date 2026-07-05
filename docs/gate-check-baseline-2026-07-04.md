# Gate Check Baseline 2026-07-04

> Status: Stage 0 complete; Stage A time-step foundation complete.
> Source run: `npm run gate-check`
> Latest report: `reports/check-run-2026-07-04T15-49-33.md`
> Latest logs: `reports/check-log-calibration-2026-07-04T15-48-23.txt`, `reports/check-log-mod-2026-07-04T15-48-23.txt`, `reports/check-log-ui-2026-07-04T15-48-23.txt`

## Result

| Gate | Result | Note |
|------|--------|------|
| C1 lint | PASS | 0 errors |
| C2 tsc | PASS | 0 errors |
| structural | PASS | Latest structural run: `reports/check-run-2026-07-04T15-47-51.json`; `fate-prophecy` schema/generated mismatch and `orchestrator-system.ts` deep import are cleared |
| full C3 | FAIL | `calibration`, `mod`, `ui` fail; `wiring`, `loader`, `narrative` pass; latest ATCE is `REFACTOR_MANDATORY` due repeat `A-15` refactor signal |

## Stage 0 Stop Line

Stage 0 only clears the two structural blockers and records a reviewed full-gate split. It does not fix downstream gameplay blockers such as `A9-MISSING-APIKEY`, `A5-CTX-ORPHAN`, calibration runner boundaries, UI design-token cleanup, or delayed MOD import policy. Those items are intentionally assigned to later stages so the MVP path can be repaired in dependency order.

## Stage A Time-Step Result

Stage A is complete for the time engine foundation:

- `TimeSystem` now derives its default and reset `timeStep` from `DEFAULT_ENGINE_CONFIG.timeStep` (`{ unit: 'year', value: 1 }`).
- `TimeSystem.setTimeStep()` only changes the next narrative step mode. It must not mutate `round`, `daysPassed`, or `totalDays`; switching from year to day/month/season at game start no longer skips a year.
- Month and year advances still convert to integer day deltas. Season/quarter advance now counts the current month plus the next two real months, instead of jumping by a fixed spring/summer/autumn/winter boundary.
- Legacy `executeRound()` now syncs `orchestrator.state.timeStep` into `TimeSystem` before advancing, matching the main `advanceTime()` path.
- `TimeSystem.collectState()` runtime summary now starts with `【时间系统】` while keeping the detailed current date for Prompt context.
- Docs now explicitly state that `timeStep` switching is not time advancement.

Stage A smoke check passed:

```text
year=365, day=1, month=31, quarter-from-Jan=90, quarter-from-Feb=89, total-after-Jan-month-plus-Feb-quarter=120
```

Latest full gate still reports `C5-SUMMARY-FMT` for `time-system.ts` because `scripts/check/domains/mod/arch-scanner.ps1` parses only literal `summary: '...'` / `summary: \`...\`` fields and checks the final character as `】`. The current `TimeSystem` keeps a computed date summary for narrative usefulness; this should be handled as scanner/rule maintenance rather than by degrading the runtime summary to only `【时间系统】`.

## Stage 0 Fixes Already Applied

| Item | Resolution |
|------|------------|
| `SUBSYSTEM_CHANGE_SCHEMAS` vs generated keys mismatch | Removed delayed `fate-prophecy` from active narrative change schemas and regenerated `subsystem-field-keys.generated.ts` |
| `orchestrator-system.ts` deep import from `mod-world/utils` | Exported `buildPowerCeilingPresetsForNarrative` through `mod-world/index.ts`; orchestrator now imports from `@/mods/mod-world` |
| Prompt active chain for `fate-prophecy` | Removed from `SUBSYSTEM_GUIDE`, `allowedSubSystems`, and prompt state layer grouping |

## Full Gate Split

| Bucket | Items | Decision |
|--------|-------|----------|
| True blocker | `A9-MISSING-APIKEY` in `core/ai-service/ai-call-wrapper.ts` and `mods/mod-engine/campaigns/default/index.ts` | Fix before validating AI destiny/narrative/summary paths. This directly affects user-entered custom API key reaching `/api/proxy`. |
| True blocker | `A5-CTX-ORPHAN` for `timeBridgeSummary`, `narrativeGuidanceText`, `subsystemFields`, `causalChainHint` | Fix or explicitly remove before narrative quality validation; current data is computed but not injected into the narrative template. |
| True gate blocker | calibration imports `WorldMapCanvas.module.css` through a Node/tsx acceptance runner and throws `SyntaxError: Unexpected token '.'` | Fix check/import boundary. This is not solved by bypassing runtime world-init AI. |
| True UI cleanup | `S25` deprecated CSS vars: 30 errors in `GameStory.module.css`; `S26`: 4 unknown vars across `game-story`, `fate-preview`, `talent-draw` | Fix before final MVP gate. Can be done in UI cleanup stage. |
| Scanner false positive / maintenance | `D30-DEP-EXISTS` parses `provides` text as dependencies for `mod-engine`, `mod-ui`, `mod-difficulty` | Fix scanner parsing before changing manifests. Do not add fake MOD dependencies. |
| Scanner false positive / maintenance | `C1/C2/C3/C4/C5/C6` checks treat helper files such as `subsystems/shared.ts` and `world-init-deps.ts` as subsystem classes | Exclude helper/deps files or move them outside `subsystems/` during the relevant stage. Do not rewrite them as fake subsystems. |
| Scanner false positive / maintenance | `C9-CROSS-PATH` flags generated `all-stores.generated.ts` `/store` imports for every MOD | Decide whether generated store registry is an allowed boundary or change codegen. Do not hand-edit generated output. |
| Migration downgrade | Bulk `C1-CLASS-EXPORT`, `C3-APPLY-*`, `C4-DEEPCOPY`, `C5-SUMMARY-FMT`, `C6-RESET` across legacy untouched subsystems | Downgrade during MVP unless the file is touched/restored or enters MVP execution path. Fix per system when that system is brought back. |
| Migration / architecture decision | `D2-DEP-MISSING`, `D24-SEGMENT-REVERSE`, `D7-SUBSINDEX`, `D9-PROVIDE` | Needs manifest/load-order review. Do not blindly add dependencies because some are scanner limitations or intentional loading-order relationships. |
| MVP later | `D31-UNIMPORTED-MOD` for all MODs in `init-mods.tsx` | Handle when the MVP active MOD list is finalized. Avoid importing delayed systems into normal execution path prematurely. |
| Cleanup later | `A10-UNWIRED-EXPORT` for `core/mod-loader/load-error-hints.ts`, `core/mod-loader/prototype-stage.ts`, `core/store-migration/migration-runner.ts` | Core/export cleanup requires a separate owner decision: wire into real flow or remove dead API. Do not change core in Stage 0. |
| Cleanup later | `G1/G2/G5/G10` file purity and duplicate utility rules | Not a Stage 0 blocker; schedule after MVP path is stable. |

## Rule Count Snapshot

| Domain | Count |
|--------|-------|
| calibration | 2 issues |
| mod `C5-SUMMARY-FMT` | 76 |
| mod `D2-DEP-MISSING` | 27 |
| mod `C3-APPLY-FIVE` | 26 |
| mod `C4-DEEPCOPY` | 23 |
| mod `C3-APPLY-SIG` | 22 |
| mod `D31-UNIMPORTED-MOD` | 18 |
| mod `C9-CROSS-PATH` | 16 |
| mod `D7-SUBSINDEX` | 13 |
| mod `G10-PROMPT-TYPE` | 11 |
| mod `D30-DEP-EXISTS` | 9 |
| mod `A5-CTX-ORPHAN` | 4 |
| mod `G2-CONST-FUNC` / `G2-CONST-TYPE` | 4 each |
| mod `A9-MISSING-APIKEY` | 3 |
| mod `A10-UNWIRED-EXPORT` | 3 |
| mod `C11-SUB-DIR` / `C11-SUB-FILE` | 3 / 1 |
| ui `S25-DEPRECATED-CSS-VAR` | 30 |
| ui `S26-UNKNOWN-CSS-VAR` | 4 |

## Recommended Next Stage

1. Fix `A9-MISSING-APIKEY` first because it blocks actual AI calls with the user's custom key.
2. Fix calibration CSS-module import boundary so full gate can run that acceptance runner.
3. Then enter Stage B: world-select/world-customize 手动世界配置，隔离 world-init AI 管线，并继续确保延后系统不进入 Prompt / AI changes / 正常回合日志。
