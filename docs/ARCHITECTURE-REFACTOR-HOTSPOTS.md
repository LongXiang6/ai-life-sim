# Architecture Refactor Hotspots

> This document records small-step candidates for the four files currently reported by `scan-file-import-graph.mjs` as D-07 refactor hints. They are not blocking failures yet; the goal is to keep future refactors bounded and scanner-verifiable.

## Current Scanner Signal

`node scripts/check/domains/structural/scan-file-import-graph.mjs --quiet` currently reports:

- `src/mods/mod-character/subsystems/destiny-pattern-system.ts` — 9 relative imports.
- `src/mods/mod-engine/subsystems/orchestrator-system.ts` — 13 relative imports.
- `src/mods/mod-world/subsystems/world-entity-system.ts` — 6 relative imports.
- `src/mods/mod-world/world-init-bundle.ts` — 8 relative imports.

## Refactor Candidates

### `src/mods/mod-character/subsystems/destiny-pattern-system.ts`

First safe split: move AI pool filling and streaming JSON normalization into `src/mods/mod-character/helpers/destiny-pattern-pool-generation.ts`.

Why: the subsystem currently mixes ISubSystem state ownership, preset candidate selection, AI generation, token budgeting, quality rejection, and cache persistence. The subsystem should keep orchestration and state mutation, while helper code owns generation mechanics.

Guardrails:

- Keep `DestinyPatternSystem` as the only owner of `DestinyPatternState` mutation.
- Do not expose helpers cross-MOD unless they are promoted through `index.ts` or `secondaryPublicEntries`.
- Preserve `collectState()` structured cloning and existing public methods.

### `src/mods/mod-engine/subsystems/orchestrator-system.ts`

First safe split: extract world-direction application and post-narrative mutation helpers into `src/mods/mod-engine/helpers/orchestrator-world-direction.ts` or reuse the existing `orchestrator-pipeline-support` boundary where it already fits.

Why: this subsystem is the main runtime coordinator and already imports many pipeline helpers. Its import degree is acceptable for now, but changes should continue moving pure pipeline stages into helper modules rather than adding more responsibilities to the class file.

Guardrails:

- Keep lifecycle-owned runtime state and public orchestration entrypoints inside `OrchestratorSystem`.
- Avoid static imports from non-engine MOD internals; use public MOD API or declared secondary public entries.
- Do not move singleton imports into barrels that reintroduce eager loading.

### `src/mods/mod-world/subsystems/world-entity-system.ts`

First safe split: move static fallback `EntitySet` data and selector logic into `src/mods/mod-world/helpers/world-entity-fallbacks.ts`.

Why: the subsystem mixes static genre datasets, AI JSON parsing, coherence retry behavior, store persistence, and entity generation. The fallback data is pure and can be separated without changing runtime behavior.

Guardrails:

- Keep AI service injection and store writes inside the subsystem until there is a dedicated public API.
- Keep fallback data local to `mod-world`; do not export it cross-MOD.
- Preserve generated entity shapes from `WorldConfig` / `AnyWorldEntity`.

### `src/mods/mod-world/world-init-bundle.ts`

First safe split: split synchronous commit helpers from background AI pipeline helpers:

- `world-init-commit.ts` for `commitWorldInitialization()` and local snapshot/entity/timeline commit.
- `world-init-ai-bundle.ts` for `generateWorldInitBundle()` and AI pipeline orchestration.

Why: this file is already a known heavy API surface and should remain behind `mod-world/world-init-api` instead of being re-exported from `index.ts`.

Guardrails:

- Keep `world-init-bundle.ts` as a compatibility facade only if needed, then remove it once imports move to `world-init-api`.
- Do not import `orchestrator` statically from `mod-engine`.
- Run `generate-mod-wiring --check` after changing any secondary public entry.

## Validation

For each small split, run:

```bash
node scripts/codegen/generate-mod-wiring.mjs --check
node scripts/check/domains/structural/scan-typescript-wiring.mjs --quiet
node scripts/check/domains/structural/scan-mod-public-boundary.mjs --quiet
node scripts/check/domains/structural/scan-file-import-graph.mjs --quiet
```

Promote a hint to FAIL only after the target file has a clear replacement boundary and no current call sites depend on the old shape.
