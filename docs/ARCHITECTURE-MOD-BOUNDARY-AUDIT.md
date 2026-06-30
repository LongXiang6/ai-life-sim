# MOD Public Boundary Audit

> Enforcement lives in `scripts/check/domains/structural/scan-mod-public-boundary.mjs` and `scripts/check/rules/architecture-rules.json`.

## Charter

- Cross-MOD imports must use `@/mods/mod-name` public index exports or a manifest-declared `secondaryPublicEntries` entry.
- New cross-MOD deep imports fail structural checks.
- `allowedCrossModDeepImports` must stay empty; do not use it as a new compatibility layer.
- Store registration has one explicit architecture exception: `src/core/global-store/slices/index.ts` may import `@/mods/mod-name/store` so Core can register Zustand stores without pulling heavy public barrels.

## Current Status

- Registered historical cross-MOD deep imports: 0.
- Declared secondary public entries:
  - `mod-character/destiny-pattern-access`
  - `mod-engine/engine-api`
  - `mod-world/world-init-api`
- Explicit Store registry exception:
  - `src/core/global-store/slices/index.ts` -> `@/mods/mod-*/store`

## Removal Rule

If a future change needs a cross-MOD API, expose it through one of these paths:

1. Add a named export to the target MOD `index.ts` for lightweight public API.
2. Add a dedicated file and register it in `manifest.secondaryPublicEntries` for heavy/runtime API.
3. Use events or a stable Store selector/facade when direct import would couple lifecycles.

Do not add entries to `allowedCrossModDeepImports` unless the team is deliberately accepting temporary debt with a removal issue and a validation plan.
