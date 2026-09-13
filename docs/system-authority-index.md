# 系统权威历史源记录

状态：历史记录，按需读取。活动路由是 `docs/authority-index.md` 及其四份体系树。

本文件保留系统责任、运行成员、生命周期、AI 参与和持久化事实，不再定义全局体系、优先级或冲突处理。当前用户要求高于本文件；冲突时执行用户要求，完成任务后再在建议区说明。

精确数据形状以实时代码、类型、Manifest、生成注册表和 `src/mods/mod-engine/helpers/mvp-stages-config.default.json` 为准。不要整篇加载本文件，只在活动权威树指向历史证据时读取对应段落。

## Runtime and persistence contract

The current runtime stage key remains `mvp`; its active policy includes the completed P0 multi-world foundation and the P1 historical-event ledger. P2-P8 simulation packages remain deferred.

```text
project
├─ simulation-runtime
│  ├─ platform-services
│  ├─ external-product-systems
│  │  └─ history-causality: historical-event-ledger
│  └─ engine-orchestration-systems
└─ deferred-story-state
```

For active runtime rows, apply these composition defaults unless a row or linked authority overrides them:

```text
TreeId: RUN
NodeId: <SystemId>
ParentNodeId: external-product-systems | engine-orchestration-systems
SystemPath: project > simulation-runtime > external-product-systems|engine-orchestration-systems > <SystemId>
ParentGoal: contribute owned state or orchestration to the playable narrative simulation
PrimaryGovernanceParent: owning MOD for external systems; mod-engine for engine systems
ChildSystems: implementation-owned composed units or none
Dependencies: Inputs plus linked public contracts, registration, and consumers
Lifecycle: registration and liveness policy plus owned collectState/restore path
CrossTreeRelations: persists DATA; verified-by QUAL; add supplies SEM or projects-to UX only when applicable
```

Persistence selection follows `PD-033`:

- Durable mutable, queryable or related data defaults to a database, IndexedDB or an existing Schema-versioned structured Store with one owning API, migration, indexed queries, atomic writes and strict restore.
- OPFS, object storage and ordinary files are typed exceptions for large snapshots/blobs, immutable config/assets, import/export, release artifacts or append-only operational logs. Each exception declares its structured manifest/index, root, permissions, capacity, retention, cleanup and recovery.
- No system may create an unbounded per-player, per-record or per-round file layout, duplicate large content into several indexes, use directory scans as its query model, or add a second persistence truth for convenience.
- Existing stable storage is reviewed when touched and migrates only when product need, integrity, query cost, concurrency, recovery, capacity or file proliferation justifies the change.

Unless a row states otherwise, every active card uses these shared fields:

```text
RuntimeStageAndLivenessSource: mvp; src/mods/mod-engine/helpers/mvp-stages-config.default.json
StorageClass: database | structured-store | versioned-snapshot | operational-log | immutable-file | none
PersistenceAuthority: owning collectState/restore path plus orchestrator snapshot and save-restore aggregator
AcceptanceEvidence: governance system-coverage check plus the owning behavior's focused and delivery gates
LastVerified: 2026-07-21
Supersession: none
```

- External subsystem registration is owned by `src/mods/mod-engine/bootstrap/register-subsystems.ts` plus generated MOD importer and alias maps.
- Engine subsystem registration is owned by `src/mods/mod-engine/bootstrap/engine-subsystems.generated.ts`; edit its declarations or generator inputs, not the generated file.
- Runtime membership is owned by `src/mods/mod-engine/helpers/mvp-stages-config.default.json` and its runtime policy.
- Each subsystem owns its private state and `collectState()` representation. The orchestrator owns collection order, application phases, snapshots, and cross-system commit flow.
- Save aggregation and restoration are owned by `src/mods/mod-engine/helpers/save-restore.ts`, `OrchestratorSystem` snapshots, and `src/core/storage/save-manager.ts`. A system must not invent a second persistence owner.
- `mod-world` persists the complete `contexts` registry, `currentContextId`, cross-context exits and transition history. Legacy `worldConfig/entities/worldCode/...` fields are only the current-context compatibility projection and must be synchronized back to the owning context instance.
- `RoundContext.contextId` and `characterId` are stable business IDs. `worldId` is a deprecated compatibility alias of `contextId`; world names, `worldCode`, character names and six-character diagnostic codes are not business keys.
- One global `TimeSystem` remains the canonical owner of `daysPassed` and `totalDays`. Context local clocks read that authority and apply their own scale or inactive policy; they never create another round commit timeline.
- Orchestrator save snapshots persist scoped internal narrative state for memory lifecycle, relevance, forgetting, delayed causality, plot structure, foreshadowing and core memory in addition to external collected states. A present P0 snapshot whose `worldContextId` disagrees with the world Store is a core restore failure and rolls back the load.
- `historical-event-ledger` persists its complete Store v2 through `capturePersistenceState()` / `restorePersistenceState()` in the orchestrator snapshot. Its `collectState()` uses a read-only cached index and returns only global or current-including `scheduled/active` facts plus related edges; complete cloning is reserved for explicit save/rollback. Explicit restore and browser/Zustand hydration share strict validation for IDs, chains, evidence-reference arrays, endpoints and world references before replacement or use; invalid current Store state is quarantined from queries, commits and saves without silent reset, and malformed current/future versions reject. v1 Store or old `event-pool` / `causal-simulation` collected states migrate into the current save's original context instead of global or cross-save residue.
- Accepted ledger IDs flow to consumers instead of duplicating facts: memory and core-memory use `historicalEventIds`, foreshadowing uses `plantedFromEventIds/resolvedByEventIds`, plot structure uses `lastHistoricalEventIds`, and delayed causality uses `originEventId/resolutionEventId`. Compression and repeated relationship merges retain ID unions; old snapshots default missing reference arrays to empty.
- Main narrative AI may write only the internal IDs in `narrativeChange`; current writable systems remain `character-base`, `lifespan`, `luck`, and `morality`. `historical-event-ledger` is registered separately as `event-input`, so validated local orchestration may submit historical batches without exposing it as a fifth direct state-change target. AI-visible input uses only registered Chinese system and field names; `src/mods/mod-engine/helpers/subsystem-field-registry.ts` owns the one-to-one translation.
- Main narrative Prompt `7.34.0` separates the protected fixed asset from browser-owned dynamic work. `src/mods/mod-engine/server/narrative-system-prompt.ts` is the sole fixed-prefix compiler; it owns program-controlled node sampling, discrete life events, autonomous-world rules, result-centered narrative and the standard JSON正文/命运分支/结局 protocol without concrete story examples. `src/mods/mod-engine/server-prompt-assets.ts` is the `server-only` whitelist entry resolved by `/api/proxy`. The browser `narrativePrompt.systemPrompt` remains empty and carries only the asset ID; `prompt-builder.ts` owns the five-field single-object user message with the `年龄·历法` time coordinate. A main call is accepted once through the narrative parser; protocol or repetition failure becomes an explicit player-visible failure, while a later attempt is initiated only by a new player action. If a player-requested branch is missing, the existing branch flow handles that choice separately without rewriting the accepted body. `narrative-ai-input-view.ts` owns world/character projection. `narrative-ai-protocol.ts` translates the optional Chinese属性变化 object to the `character-base` owner and keeps the parser free of semantic repair or content rewriting.

### 3.1 Player-owned AI channel

```text
SystemId: player-owned-ai-channel
SystemPath: project > simulation-runtime > platform-services > player-owned-ai-channel
ParentGoal: send every AI operation through the player's explicitly configured compatible API target without a server-owned credential or hidden alternate route
PrimaryGovernanceParent: core AI Provider configuration plus app AI proxy and mod-settings
ChildSystems: DeepSeek preset fill, player settings persistence, registered protected-Prompt target validation, shared request transport, structured response validation and world initialization calls
Authority: A3 this index; A4 live Provider, settings, AI client, candidate generation, world initialization and proxy implementation
RootPosition: R1
Weight: W5
Sequence: S1 load player settings > S2 validate custom Provider, target, model and Key > S3 validate protected-Prompt target when applicable > S4 send one upstream request > S5 validate the one returned response > S6 return success or explicit terminal failure
Responsibility: own the DeepSeek URL/model preset, persist only player-selected settings in the browser, require the player's target and Key for every request, validate protected Prompt routing, transport one request per logical operation, preserve complete streams and return status-preserving errors
NonResponsibility: does not own or supply an API credential, redirect traffic to another Provider or model, retry a failed logical operation, repair Schema output with a second call, author gameplay state, or replace failed AI content locally
Inputs: player Provider settings, player API Key, target URL, model, validated messages and optional protected Prompt asset ID
OutputsAndWrites: one upstream request and one validated response, or an explicit configuration, target, transport, truncation, JSON or Schema failure; public settings contain only player-owned values
PublicStateOrAPI: `custom` Provider state, DeepSeek preset-fill values, connection testing and `/api/proxy`; POST requires the player request target, model and Key
Dependencies: src/core/ai-service/provider-config.ts, mod-settings persisted state and app AI proxy
Lifecycle: active for settings hydration, connection tests and every gameplay AI request
RuntimeLivenessSource: app route registration, settings Store hydration and active Next.js server process
AIParticipation: transports model requests only; does not interpret or apply AI semantic output
PersistenceAuthority: player settings remain in mod-settings browser persistence; no server-owned gameplay AI credential exists
Implementation: src/core/ai-service/provider-config.ts; src/core/ai-service/server-provider-targets.ts; src/core/ai-service/ai-client.ts; src/core/ai-service/ai-client/fetch-executor.ts; src/core/ai-service/ai-client/schema-validation.ts; src/mods/mod-settings/store.ts; src/mods/mod-settings/components/SettingsTabPresets.tsx; src/mods/mod-character/subsystems/destiny-pattern-system.ts; src/mods/mod-world/utils/world-init-pipeline/ai-service.ts; src/app/api/proxy/route.ts
AcceptanceEvidence: node scripts/check/domains/narrative/player-api-settings-regression.mjs; npm run test:ai-proxy; prompt and Schema regressions; complete narrative and world initialization paths; secret-absence scan; delivery gates
LastVerified: 2026-08-12
Supersession: replaces the removed managed LongCat/a6api channels and deleted `/api/world-init` server route
```

- `src/core/ai-service/provider-config.ts` owns the public `custom` Provider ID and the DeepSeek URL/model preset. Filling the preset does not supply or overwrite the player's Key.
- `server-provider-targets.ts` only verifies whether a protected Prompt is being sent to the registered DeepSeek HTTPS target. It does not resolve a private target or credential.
- `ai-client/fetch-executor.ts` sends one network request for each logical operation. `schema-validation.ts` validates that response once; transport, truncation, JSON or Schema failure returns directly to the owning caller.
- World initialization calls the same client-side AI service path as other gameplay generation and has no dedicated `/api/world-init` route, polling job or server credential path.
- `DestinyPatternSystem` requests the complete visible candidate set through one logical call; a failed call leaves an explicit terminal error, and another call requires the player's regenerate action.

### 3.2 AI call observability

```text
SystemId: ai-call-observability
SystemPath: project > simulation-runtime > platform-services > ai-call-observability
ParentGoal: preserve enough secure production evidence to diagnose every AI request and player-visible failure
PrimaryGovernanceParent: core logger plus app AI proxy
ChildSystems: fixed-field event rows, content-addressed gzip object store, proxy access index, full AI traces, raw upstream errors, client event logs, session environment snapshot, safe HTTP error translation, per-IP and per-player indexes, operator inspection
Authority: A1 PD-019, PD-022 and PD-024; A3 this index; A4 live proxy, client and server log store
RootPosition: R1
Weight: W5
Sequence: S1 trusted source classification > S2 request envelope > S3 upstream lifecycle > S4 client-visible result > S5 retention cleanup and inspection
Responsibility: correlate and securely retain complete AI request, response, error and client failure evidence, classify it by server-derived IP and server-issued player diagnostic code, translate player-visible HTTP failures safely, and expose a private read-only inspection path
NonResponsibility: does not own credential values, gameplay state, narrative truth, model choice or public log browsing authorization
Inputs: trusted proxy headers, server-issued diagnostic Cookie, sanitized proxy request envelope, upstream lifecycle, client error events, environment retention policy
OutputsAndWrites: request IDs, diagnostic codes, fixed-field JSONL rows, SHA-256 gzip content objects, compact per-IP and per-player reference indexes, and operator-readable reconstructed records
PublicStateOrAPI: x-ai-request-id response header and requestId error field; no public filesystem or log-browsing access
Dependencies: diagnostic-player-identity, app proxy, core AI client, core client logger, Node filesystem and deployment environment
Lifecycle: active for every proxy call; cleanup runs opportunistically after writes at a bounded interval
RuntimeLivenessSource: app API route registration and active Next.js server process
AIParticipation: observes Provider traffic only; never authors or applies semantic game state
PersistenceAuthority: AI_LOG_DIR plus server-log-store retention and capacity policy
Implementation: src/app/api/proxy/route.ts; src/app/api/log/route.ts; src/app/api/debug-log/route.ts; src/core/ai-service/api-error.ts; src/core/ai-service/story-seed.ts; src/core/logger/server-log-store.ts; src/core/logger/server-log-safety.ts; src/core/logger/client-logger.ts; src/core/logger/usage-metrics.ts; src/core/logger/diagnostic-consent.ts; src/core/logger/debug-logger.ts; scripts/ops/inspect-ai-logs.mjs; scripts/ops/analyze-ai-logs.mjs
AcceptanceEvidence: docs/acceptance-ledger.md#production-observability; npm run test:ai-proxy; source-classification, content-deduplication and secret-redaction regression; operator-inspector reconstruction smoke; unreachable-upstream HTTP probe; secret-absence check; delivery gates
LastVerified: 2026-07-21
Supersession: none
```

- `src/app/api/proxy/route.ts` owns one request ID per proxy call and records the complete sanitized request envelope, upstream response or error, status, duration, retry observation and stream terminal state. Fixed diagnostic fields stay in append-only JSONL rows; large Prompt, message, response, error and debug values are written once as SHA-256-addressed gzip objects and referenced by compact rows. The request ID is returned to the client for screenshot and server-log correlation. Every trace event carries the same server-derived source identity.
- `src/core/ai-service/api-error.ts` is the single player-facing HTTP translation authority. It covers explicit 4xx/5xx causes and resolution steps, preserves request IDs, and never copies raw upstream bodies into UI messages. `ai-client.ts` retains the raw body only for sanitized diagnostic logging while exposing the translated Error message to Toasts and page-owned error regions.
- Story seed normalization is enforced on both boundaries: the client omits non-finite or non-numeric values, while the proxy treats cached legacy `seed:null` as absent and leaves every other invalid type to Zod rejection. This prevents `NaN -> JSON null -> 400` without weakening request validation.
- `src/core/logger/server-log-store.ts` owns trusted source extraction, persistent log-root resolution, secret redaction, `0700` directories, `0600` files, fixed-row writing, content addressing, gzip compression, duplicate-object reuse, reference freshness, per-file rotation, per-IP and per-player indexes, age retention and total-cap cleanup. Production uses `/var/log/ai-life-sim` through `AI_LOG_DIR`, outside `/root/ai-life-sim/`, so atomic deployments do not move active evidence into version backups; defaults are 30 days and 10 GiB unless environment policy overrides them. Diagnostic identity reservations are retention-exempt because reusing an old six-character code would break correlation.
- `src/core/logger/usage-metrics.ts` and `client-logger.ts` own the opt-in aggregate telemetry contract. They never upload custom branch text; they only send page, time-step, branch-type, bounded local terms and length metadata after the current diagnostic disclosure. `scripts/ops/analyze-ai-logs.mjs` reads root JSONL rows without IP/player indexes and produces aggregate-only reports with a minimum cohort threshold for branch terms.
- API keys, Authorization headers, cookies, passwords, token-like credentials and credential-bearing URL query values must never be written. Prompt and response semantics remain otherwise complete so diagnosis does not depend on lossy previews.
- `src/app/api/log/route.ts` enriches client diagnostics with the trusted source, server-issued diagnostic code and optional AI request ID; request-body fields cannot override the source or code. After the current disclaimer is accepted, `diagnostic-consent.ts` and `client-logger.ts` send one non-sensitive environment snapshot per browser session. `src/app/api/debug-log/route.ts` keeps complete AI-call metadata collection enabled independently of the production-disabled public debug viewer, while its production GET/DELETE paths remain closed. `scripts/ops/inspect-ai-logs.mjs` searches by IP, player code, request ID or feedback ID, verifies and reconstructs v2 content references only with `--include-content`, and remains compatible with legacy rows.
- Diagnostic copies are operational evidence, not the authoritative narrative or save-state store. Retention cleanup may delete old diagnostic copies after the configured policy, but it must never delete or truncate gameplay-owned story data.
- The proxy observes repeated fingerprints and retry counts but does not enforce a fixed identical-request rejection. Candidate preparation normally continues until its product condition is satisfied or the player leaves; 401/403 are the explicit `PD-020` configuration-terminal exception owned by the consuming loop.
- Acceptance evidence: `npm run test:ai-proxy`, the AI error translation and story-seed smoke, a local unreachable-upstream HTTP probe confirming the enabled-thinking Schema and request-ID path, secret-absence inspection, TypeScript/lint, structural check and the delivery gate.

### 3.3 Player feedback diagnostics

```text
SystemId: player-feedback
SystemPath: project > simulation-runtime > platform-services > player-feedback
ParentGoal: let players submit actionable feedback with enough non-secret runtime evidence to reproduce and diagnose the reported problem
PrimaryGovernanceParent: mod-pages feedback composition plus core logger persistence
ChildSystems: feedback page, diagnostic-code display, diagnostic package collector, POST API, full submission store, global, per-IP and per-player indexes, append-only status events, private operator status CLI
Authority: A1 PD-023, PD-024, PD-019 and PD-015; A3 this index; A4 live page, route, contract, collector and server store
RootPosition: R1
Weight: W5
Sequence: S1 player consent > S2 client collection and redaction > S3 whole-package validation > S4 trusted source classification > S5 private persistence and feedback ID
Responsibility: collect player-authored feedback together with complete recent narrative entries, non-secret configuration, current game state, recent client diagnostics and browser/device environment; reject secrets and stable hardware identifiers; persist the complete sanitized package and return a stable feedback ID; derive and record an auditable operator lifecycle without mutating the original submission
NonResponsibility: does not expose stored feedback publicly, replace the authoritative save or narrative stores, collect credentials, infer device identity, send feedback to third parties, or partially save an invalid package
Inputs: feedback category, subject, message, explicit consent, player diagnostic code, client diagnostic package and trusted request headers
OutputsAndWrites: feedback ID, player diagnostic code, content-addressed `submissionRef`, global feedback row, per-IP row, per-player row, append-only status event and derived latest status
PublicStateOrAPI: POST /api/feedback returns ok, feedbackId and receivedAt; no public GET, list or delete surface
Dependencies: diagnostic-player-identity, mod-pages route registration, core client logger, world/character/engine/global stores, server-log-store, AI_LOG_DIR
Lifecycle: available from welcome and active simulation pages; collection occurs only after explicit submission and consent
RuntimeLivenessSource: mod-pages route registration, app API route registration and active Next.js server process
AIParticipation: none; preserves existing AI and narrative evidence only
PersistenceAuthority: AI_LOG_DIR/feedback and AI_LOG_DIR/feedback-status under the PD-019 retention, capacity, permission and cleanup policy; gameplay stores remain authoritative
Implementation: src/mods/mod-pages/pages/feedback/page.tsx; src/mods/mod-pages/pages/feedback/build-feedback-diagnostics.ts; src/app/api/feedback/route.ts; src/core/logger/feedback-contract.ts; src/core/logger/player-feedback-store.ts; src/core/logger/server-log-store.ts; src/core/logger/redact-sensitive-data.ts; scripts/ops/inspect-ai-logs.mjs; scripts/ops/feedback-status.mjs
AcceptanceEvidence: npm run test:player-feedback; docs/acceptance-ledger.md#production-observability; browser submit and feedback-ID path; content-reference reconstruction, secret absence and complete-recent-story inspection; status transition, resolution-evidence and derived-inspector smoke; UI, TypeScript, lint, structural and delivery gates
LastVerified: 2026-07-21
Supersession: none
```

- The collector selects the canonical recent narrative window while preserving every selected entry intact. It excludes API routing and credential fields before serialization and applies the shared redaction authority again on the server.
- The API rejects an oversized, invalid or incompletely stored package as a whole. The player receives a feedback ID only after the complete sanitized package has a durable `submissionRef` and all compact indexes report successful persistence.
- Stored submissions are private operational evidence. They may be cleaned by the diagnostic retention policy but never mutate or replace local narrative history, save payloads, settings or subsystem state.
- A submission starts as `new` and remains separate from its immutable feedback content. The private operator CLI appends `in_progress`, `resolved`, `rejected`, `duplicate` or `reopened` events; `resolved` requires explicit resolution evidence, and `inspect-ai-logs.mjs` derives the latest status while default output still omits story and feedback正文.

### 3.4 Player diagnostic identity

```text
SystemId: diagnostic-player-identity
SystemPath: project > simulation-runtime > platform-services > diagnostic-player-identity
ParentGoal: let a player report a short stable locator so operators can retrieve the correct retained diagnostic timeline without requiring a precise technical description
PrimaryGovernanceParent: core logger identity allocation and app diagnostic identity route
ChildSystems: six-character contract, atomic reservation store, HttpOnly Cookie issuance, client initialization, player-code log indexes, feedback-page display
Authority: A1 PD-024 and PD-019; A3 this index; A4 live contract, allocator, API route, client initializer and log store
RootPosition: R1
Weight: W5
Sequence: S1 server allocation > S2 atomic collision reservation > S3 HttpOnly Cookie > S4 log enrichment and player index > S5 player display and operator lookup
Responsibility: issue a collision-safe six-character diagnostic alias for each browser profile, retain it across sessions and IP changes, attach it to every supported diagnostic record, and expose it to the same browser for copy and reporting
NonResponsibility: does not identify a legal person, authenticate a user, authorize log access, derive a device fingerprint, replace trusted IP classification, or expose logs publicly
Inputs: existing valid diagnostic Cookie or a new same-origin allocation request; cryptographic randomness; AI_LOG_DIR reservation root
OutputsAndWrites: diagnostic code, HttpOnly Cookie, retention-exempt reservation record, per-player diagnostic indexes and feedback-page copy surface
PublicStateOrAPI: GET /api/diagnostic-identity returns only the current browser's diagnosticCode and scope; no list, reverse lookup, log read or delete API
Dependencies: core server-log-store, app InitMods startup, client logger, AI proxy, client/debug log routes, player feedback and operator inspector
Lifecycle: allocated on first application startup, refreshed on later visits, stable until site Cookie removal; reservations remain to prevent code reuse
RuntimeLivenessSource: root InitMods initialization, app API route registration and active Next.js process
AIParticipation: none
PersistenceAuthority: AI_LOG_DIR/diagnostic-identities for collision reservations; HttpOnly browser Cookie for the current profile; gameplay stores remain unrelated
Implementation: src/core/logger/diagnostic-player-code.ts; src/core/logger/diagnostic-player-identity.ts; src/core/logger/diagnostic-player-code-client.ts; src/app/api/diagnostic-identity/route.ts; src/core/logger/server-log-safety.ts; src/core/logger/server-log-store.ts; src/app/_components/init-mods.tsx; scripts/ops/inspect-ai-logs.mjs
AcceptanceEvidence: npm run test:ai-proxy including diagnostic-player-code-smoke; browser code persistence and IP-change case; per-player index inspection; UI, TypeScript, lint, structural and delivery gates
LastVerified: 2026-07-19
Supersession: none
```

- The server-generated code uses six uppercase letters and digits while excluding ambiguous characters. Atomic `wx` reservation, rather than probability alone, prevents two issued profiles from receiving the same code.
- The code is a diagnostic locator, not a secret or an authentication factor. Server logs accept it only from the issued Cookie; arbitrary request headers and request bodies cannot override it.
- Reservation files contain no player content or device-derived facts and are excluded from diagnostic age/capacity cleanup. Retained story, request and client-event copies still follow PD-019 cleanup.

### 3.5 AI cache observability

```text
SystemId: ai-cache-observability
SystemPath: project > simulation-runtime > platform-services > ai-cache-observability
ParentGoal: make the player-visible cache rate describe the selected model's real main-narrative calls instead of an unrelated mixed lifetime total
PrimaryGovernanceParent: core AI client plus mod-settings
ChildSystems: compatible usage-field normalizer, scoped browser statistics store, main-call classification, settings projection and scoped reset
Authority: A1 PD-017; A3 this index; A4 live AI client, cache statistics module, narrative campaign and settings component
RootPosition: R1
Weight: W3
Sequence: S1 classify requested Provider/model/pool/call kind > S2 record one final usage snapshot > S3 query current main narrative > S4 scoped reset
Responsibility: normalize supported OpenAI-compatible cache usage aliases, including nested `prompt_tokens_details.cached_tokens` and `effectiveCachedTokens`; persist and aggregate cache hit/miss Tokens by Provider, model, pool and call kind; project only the current main-narrative bucket to settings; ignore unsplittable legacy totals
NonResponsibility: does not create Provider cache entries, promise a target hit rate, infer missing usage, measure pre-generation hits, store Prompt/story content, or alter model routing
Inputs: parsed upstream usage plus requested Provider, model, pool and diagnostic call kind
OutputsAndWrites: browser-local schema v2 cache-stat buckets and current-model main-narrative hit-rate projection
PublicStateOrAPI: getCacheStats(filter) and resetCacheStats(filter); no server or cross-player API
Dependencies: AI response usage fields, narrative call logContext, mod-settings current Provider/model
Lifecycle: records only successful upstream responses carrying nonzero cache usage; resets or starts empty when legacy data cannot be attributed
RuntimeLivenessSource: active client AI calls and rendered settings page
AIParticipation: observes transport metadata only; never reads or changes semantic AI output
PersistenceAuthority: browser localStorage key ai-cache-stats, schema version 2; not part of save-game or diagnostic identity
Implementation: src/core/ai-service/normalize-ai-usage.ts; src/core/ai-service/cache-stats.ts; src/core/ai-service/ai-client.ts; src/mods/mod-engine/campaigns/default/index.ts; src/mods/mod-settings/components/SettingsTabTheme.tsx
AcceptanceEvidence: scripts/check/domains/narrative/cache-stats-smoke.mjs; npm run test:ai-proxy; Prompt wiring, TypeScript, lint, UI and delivery gates
LastVerified: 2026-07-20
Supersession: replaces the unscoped ai-cache-stats lifetime total
```

- Each logical AI operation records one request classification; failed operations remain visible as failures and are retried only by the owning caller after an explicit new action.
- Streaming transports retain the last upstream usage snapshot and commit it once after stream aggregation. Providers that omit compatible hit/miss fields leave the selected bucket unchanged, so switching Provider or model cannot display stale statistics from another target.

### 3.6 Production release retention

```text
SystemId: production-release-retention
SystemPath: project > delivery-runtime > production-operations > release-retention
ParentGoal: keep a complete short rollback window without allowing immutable release directories to grow indefinitely
PrimaryGovernanceParent: formal atomic deployment flow plus PD-021
ChildSystems: active symlink soak gate, localhost health probe, inactive release selection, systemd daily timer
Authority: A1 PD-021; A3 this index and root AGENTS.md; A4 cleanup script and installed systemd units
RootPosition: R1
Weight: W4
Sequence: S1 atomic switch > S2 72-hour active soak > S3 localhost health > S4 bounded inactive cleanup
Responsibility: preserve every rollback directory for the full active-release soak window, then remove only inactive direct-child releases older than the same window after a successful local health probe
NonResponsibility: does not decide application correctness from player/configuration errors, delete the active release, clean production logs, manage secrets, or replace atomic deployment and manual rollback
Inputs: /root/ai-life-sim symlink mtime and target, /root/ai-life-sim-releases directory metadata, localhost HTTP status, 72-hour policy
OutputsAndWrites: structured cleanup plan/skip output and deletion of eligible inactive release directories only
PublicStateOrAPI: systemd service and timer status; dry-run operator CLI
Dependencies: Linux Node.js 20, PM2-managed localhost 3000 service, immutable release directory layout, systemd
Lifecycle: timer runs daily; every atomic symlink switch restarts the full 72-hour protection window
RuntimeLivenessSource: ai-life-sim-release-cleanup.timer plus its last service result
AIParticipation: none
PersistenceAuthority: release directories under /root/ai-life-sim-releases; does not touch AI_LOG_DIR or gameplay persistence
Implementation: scripts/ops/cleanup-old-releases.mjs; scripts/ops/deduplicate-release-storage.mjs; scripts/ops/systemd/ai-life-sim-release-cleanup.service; scripts/ops/systemd/ai-life-sim-release-cleanup.timer
AcceptanceEvidence: npm run test:release-cleanup; production dry-run and systemd timer/service inspection; active target and directory inventory after installation
LastVerified: 2026-07-19
Supersession: none
```

### 3.7 New-life lifecycle

```text
SystemId: new-life-lifecycle
SystemPath: project > player-flow > new-life-lifecycle > cross-store-reset
ParentGoal: ensure every explicit new-life request starts from an isolated empty life without deleting independent saves, settings or cross-life progression
PrimaryGovernanceParent: mod-pages creation-flow composition
ChildSystems: canonical /new-game entry, direct world-confirm guard, MOD-runtime readiness wait, life-generation invalidation, rollback-capable auto-save transaction, cross-store reset, per-life and legacy draft cleanup, long-lived character-draft preservation, four-attribute allocation handoff and OPFS flush
Authority: A1 PD-002 and PD-006; A2 blueprint-02 section 14; A3 this index; A4 live mod-pages helper and entry pages
RootPosition: R1
Weight: W5
Sequence: S1 wait for active compression and MOD registration > S2 invalidate previous-life asynchronous writes > S3 reset every active subsystem and owning Store > S4 clear per-life drafts and flow projections > S5 flush persistence > S6 allow world initialization
Responsibility: distinguish a new life from adding a context to an existing save; cancel and roll back an old-life auto-save before it can replace slot 0 or its index; clear the previous life narrative, runtime character, world registry, active subsystem state and per-life downstream drafts before the next world is committed; preserve the long-lived character creation draft across every new life and world; invalidate the old world and downstream drafts when creation changes world identity; route confirmed destiny patterns through the four-attribute allocation step before fate preview and pass the confirmed base values to orchestration
NonResponsibility: does not delete independent save slots, model settings, diagnostic identity, the cross-life mythic library or the long-lived character creation draft; does not create a world context, implement travel, or decide multi-world connection semantics
Inputs: explicit new-life route or game-over action, next worldCode, current game phase, engine/orchestrator progress, MOD readiness and background-task status
OutputsAndWrites: empty current-life world, runtime character, engine, subsystem and flow state; cancelled stale auto-save with the previous slot 0 payload and index restored; removed current and legacy per-life downstream drafts; unchanged versioned long-lived character draft; four confirmed base attributes plus independent source modifiers; durable browser persistence before navigation
PublicStateOrAPI: resetForNewLife() and prepareNewLifeWorldCommit(worldCode); orchestrator life invalidation is internal to reset and save restore; /new-game is the canonical resetting route while world confirmation remains the direct-entry guard; `/attribute-alloc` owns the 4-point, four-attribute creation step and preserves legacy over-budget values on restore
Dependencies: mod-pages routes, global Store, orchestrator and active P0/P1 subsystem registration, save manager directory transaction, owning world/character/engine/product Stores, long-lived character draft Store, configStore and OPFS persistence queue
Lifecycle: runs only for an explicit new-life request or when world confirmation detects previous-life progress or a changed creation world; same-world unfinished creation return is preserved
RuntimeLivenessSource: mod-pages route registration, InitMods allModsLoaded state and active browser persistence
AIParticipation: none
PersistenceAuthority: owning Stores and save-manager index/OPFS transaction remain authoritative; the lifecycle supplies a synchronous generation guard, invokes reset APIs and flushes queued browser deletions but never owns save slots
Implementation: src/mods/mod-pages/helpers/new-life-reset.ts; src/mods/mod-pages/helpers/creation-draft-storage.ts; src/mods/mod-pages/pages/new-game/page.tsx; src/mods/mod-pages/pages/world-select/useWorldConfirm.ts; src/mods/mod-pages/pages/talent-draw/page.tsx; src/mods/mod-pages/pages/attribute-alloc/page.tsx; src/mods/mod-pages/pages/fate-preview/page.tsx; src/mods/mod-pages/pages/game-over/page.tsx; src/mods/mod-engine/subsystems/orchestrator-system.ts; src/mods/mod-engine/helpers/save-restore.ts; src/core/storage/save-manager.ts
AcceptanceEvidence: npm run test:new-life-isolation including autosave-lifecycle-smoke; npm run test:world-context-p0; npm run test:creation-first-narrative; npm run check:ui; browser direct-entry isolation and allocated-base opening path; delivery gates
LastVerified: 2026-07-23
Supersession: replaces the game-over-private reset helper and the redirect-only /new-game entry
```

### 3.8 Protected main-narrative asset assembly

```text
SystemId: protected-narrative-prompt-assets
SystemPath: project > simulation-runtime > platform-services > protected-narrative-prompt-assets
ParentGoal: keep the main narrative's fixed competitive Prompt assets private without moving ordinary simulation work off the player's device
PrimaryGovernanceParent: mod-engine server-only public boundary plus app AI proxy
ChildSystems: fixed Prompt compiler, server asset whitelist, MOD server-only public entry, trusted-target check, proxy system-message injection, settings preview removal and client-bundle leakage gate
Authority: A1 PD-017, PD-030 and PD-031; A3 this index; A4 manifest, server asset registry, proxy and browser AI client
RootPosition: R1
Weight: W5
Sequence: S1 browser projects dynamic state > S2 browser sends asset ID and user messages > S3 server validates target and asset > S4 server injects one fixed system message > S5 upstream request and private sanitized trace
Responsibility: own the fixed main-narrative identity, writing constraints, full protocol example and internal templates; expose only a stable asset ID to the browser; reject unknown assets, client system-message injection and unregistered custom targets; keep protected text out of settings and client bundles
NonResponsibility: does not hide browser-delivered schemas or local code, calculate simulation state, select relevant history, parse responses, validate owning-system writes, commit gameplay state, or provide a public asset read/list API
Inputs: `serverPromptAssetId`, browser-computed dynamic user messages, selected Provider/base URL/model, optional player Key and server credential availability
OutputsAndWrites: one server-injected system message plus unchanged dynamic user messages, or an explicit protected-asset/target validation failure; no gameplay state write
PublicStateOrAPI: `PromptTemplate.serverPromptAssetId` and proxy request `prompt_asset`; no asset content endpoint, preview, export or browser Remote API
Dependencies: `serverOnlyPublicEntries`, `server-only`, official Provider base-URL registry, app proxy route, private AI trace policy and production build pipeline
Lifecycle: active for every protected main-narrative call; asset resolution is request-local and stateless
RuntimeLivenessSource: mod-engine manifest, Next.js app proxy route and active server process
AIParticipation: provides the fixed system instruction to the selected upstream model; does not interpret model output
PersistenceAuthority: none; private sanitized request traces remain operational evidence under PD-019 and are not an asset distribution surface
Implementation: src/foundation/types/mod.types.ts; src/mods/mod-engine/manifest.ts; src/mods/mod-engine/server-prompt-assets.ts; src/mods/mod-engine/server/narrative-system-prompt.ts; src/mods/mod-engine/prompts/narrative-prompt.ts; src/core/ai-service/ai-client.ts; src/core/ai-service/server-provider-targets.ts; src/app/api/proxy/route.ts; scripts/check/domains/structural/scan-mod-public-boundary.mjs
AcceptanceEvidence: node scripts/check/domains/narrative/protected-prompt-assets-regression.mjs; npm run test:protected-prompt-bundle; npm run test:narrative-protocol; npm run test:ai-proxy; production build bundle scan; settings browser path; docs/acceptance-ledger.md#player-exclusive-opening; docs/acceptance-ledger.md#managed-ai-longcat
LastVerified: 2026-07-20
Supersession: replaces the browser-embedded fixed main-narrative Prompt and public settings Prompt preview
```

### 3.9 Game-over sharing

```text
SystemId: game-over-sharing
SystemPath: project > player-flow > game-over > sharing
ParentGoal: let players preserve and voluntarily share a completed life with verified accomplishments without inventing facts or exposing private story and model data
PrimaryGovernanceParent: mod-pages game-over composition
ChildSystems: structured share-fact and achievement projection, visible share preview, local Canvas renderer, Web Share handoff, PNG download fallback and accessible status feedback
Authority: A1 PD-032, PD-011 and PD-015; A2 selected game-over composition with a runtime-only extension authorized by PD-011; A3 this index; A4 live game-over page and local renderer
RootPosition: R2
Weight: W4
Sequence: S1 read completed-life facts and structured achievements > S2 reflect the current reincarnation selection when available > S3 render the visible preview > S4 generate the local image on explicit player action > S5 share through the operating system or download PNG > S6 leave simulation state unchanged
Responsibility: project existing public settlement fields, structured achievement count and one representative event into a faithful share snapshot; render the complete selected fields locally; expose one-click system sharing and an explicit PNG save action; provide pending, success, cancellation, fallback and error feedback
NonResponsibility: does not infer achievements from narrative prose or numeric thresholds, call AI, alter generation output Schema, upload images or story content, write gameplay or save state, expose diagnostics, or make sharing mandatory before starting a new life
Inputs: character and world names, age label, narrative round count, morality label, deterministic life score, four public settlement dimensions, structured resolved-choice and breakthrough achievements, stable technical life-run ID, current generated or sealed reincarnation candidate and current public origin
OutputsAndWrites: transient in-memory Canvas, PNG Blob, operating-system share handoff or browser download, and page-local status text; no persistent application write
PublicStateOrAPI: game-over “留下此生” preview, “一键分享人生卡” and “保存 PNG” controls; no new route, server API or MOD Remote API
Dependencies: mod-pages game-over page, existing character/world/engine Stores, current mythic candidate, Canvas 2D, File, URL object URLs and optional Web Share API
Lifecycle: available only after the existing game-over guard allows the settlement page; image generation starts only after explicit player action and object URLs are revoked after download
RuntimeLivenessSource: mod-pages route registration, game-over guard and browser support for Canvas; PNG fallback remains authoritative when file sharing is unavailable
AIParticipation: none; consumes an already generated mythic result as read-only display data and never requests or infers new semantics
PersistenceAuthority: none; the downloaded file is controlled by the player and no share payload enters application persistence or server diagnostics
Implementation: src/mods/mod-pages/pages/game-over/page.tsx; src/mods/mod-pages/pages/game-over/game-over-share-card.ts; src/mods/mod-pages/pages/game-over/GameOver.module.css
AcceptanceEvidence: scripts/check/domains/ui/game-over-share-card-smoke.mjs; npm run check:ui; lint and TypeScript; no-hard-truncation audit; 320/360/375/390/430/768/desktop browser layout; PNG download and post-release browser verification; docs/acceptance-ledger.md#game-over-sharing
LastVerified: 2026-07-20
Supersession: none
```

### 3.10 Optional account cloud and long-lived character draft

```text
TreeId: DATA
NodeId: account-cloud
ParentNodeId: data-lifecycle
SystemId: account-cloud
SystemPath: project > data-lifecycle > account-cloud > authenticated-snapshot
ParentGoal: let optional player identities restore bounded non-story preferences and progression across browsers without weakening guest play or secret handling
PrimaryGovernanceParent: core account service, with mod-pages account and character-creation projections
ChildSystems: username policy, password and session cryptography, SQLite repository, account HTTP routes, client revision sync, long-lived character draft Store, 10-slot reincarnation-talent and game-record Stores, verified QQ link projection, inactive-account cleanup timer
Authority: A0 secret and authentication boundaries; A1 PD-034, PD-033, PD-015 and PD-006; A3 this index; A4 account contracts, services, routes and owning client Stores
RootPosition: R1
Weight: W5
Sequence: S1 validate and normalize identity > S2 authenticate with rate limits > S3 read one revisioned snapshot > S4 cloud snapshot overwrites local synchronized fields > S5 debounce local writes into one atomic revision update > S6 delete after explicit account deletion or 30 days without authenticated activity
Responsibility: own optional registration, login, logout, account deletion, session recovery, bounded revisioned cloud persistence, encrypted optional API Key storage, local/cloud character-draft persistence, 10-slot mythic and structured record persistence, and inactive-account cleanup
NonResponsibility: does not store saves, auto-save payloads, story body, summaries, Prompt, model responses, diagnostic content, world runtime, player diagnostic identity, or determine gameplay facts; it supplies authenticated account identity to the separate player-content-services owner
Inputs: normalized username, optional QQ, password, HttpOnly session token, whitelisted settings, optional API Key preference, versioned character draft, mythic talents, structured game records and base revision
OutputsAndWrites: account/session/rate-limit rows, encrypted API Key, settings and character JSON, normalized 1-10 slot rows, revision, authenticated profile and cloud snapshot; browser replica writes only through owning structured Stores
PublicStateOrAPI: POST /api/account/register, POST /api/account/login, POST /api/account/logout, GET/DELETE /api/account, PUT /api/account/sync, POST/DELETE /api/account/qq-link, /account page, mod-pages account-cloud-api secondary public entry
Dependencies: better-sqlite3, Node crypto, Zod, HttpOnly cookies, mod-settings, mod-character mythic and life-record Stores, mod-pages character draft Store and systemd timer
Lifecycle: optional for guests; restored after client mount when a valid cookie exists; local writes debounce for 800 ms; sessions expire after 30 days without sliding extension; account activity is refreshed at most every five minutes; daily cleanup removes inactive accounts and expired sessions
RuntimeLivenessSource: Next.js account route registration, InitMods account sync initialization, active Node server and ai-life-sim-account-cleanup.timer
AIParticipation: none
StorageClass: database on the server; schema-versioned structured Store for the browser character draft and bounded progression replicas
PersistenceAuthority: /var/lib/ai-life-sim/accounts.sqlite is the authenticated cloud truth; each guest owning Store is local truth until login, after which the cloud snapshot overwrites synchronized local fields; no account data is persisted in operational log files
CrossTreeRelations: persists RUN and UX-owned non-story preferences; supplies verified account projection to shared-qq-community without exposing private snapshot fields; projects-to UX account and character pages; verified-by QUAL account-cloud and new-life isolation tests
Implementation: src/core/account; src/app/api/account; src/mods/mod-pages/account-cloud-api.ts; src/mods/mod-pages/helpers/account-cloud-sync.ts; src/mods/mod-pages/helpers/character-creation-draft-store.ts; src/mods/mod-pages/pages/account; src/mods/mod-pages/pages/character-create; src/mods/mod-character/reincarnation-library-store.ts; src/mods/mod-character/life-record-store.ts; scripts/ops/cleanup-inactive-accounts.mjs; scripts/ops/systemd/ai-life-sim-account-cleanup.*
AcceptanceEvidence: npm run test:account-cloud; npm run test:new-life-isolation; account register/login/logout/delete and cloud-overwrite browser paths; Linux database, WAL and SHM mode 0600 assertions; TypeScript, lint, structural, UI, no-hard-truncation and delivery gates; explicit MOD historical-baseline comparison with no account-specific addition
LastVerified: 2026-07-21
Supersession: replaces world-scoped character-create-form localStorage keys and the old rule that new-life reset clears role inputs
```

### 3.10.1 Authenticated player content services

```text
TreeId: DATA
NodeId: player-content-services
ParentNodeId: data-lifecycle
SystemId: player-content-services
SystemPath: project > data-lifecycle > player-content-services > cloud-save-ranking-mailbox
ParentGoal: preserve authenticated cloud data and expose a bounded per-life leaderboard without replacing local game-state ownership
PrimaryGovernanceParent: core player-content service, authenticated through account-cloud
ChildSystems: dedicated SQLite WAL repository, compact cloud-save codec, cloud save route/client, per-life leaderboard projection, mailbox, retained portrait assets, account deletion cleanup and loopback-only aggregate operations dashboard service
Authority: A0 secret, authentication and private-data boundaries; A1 PD-037, PD-034, PD-033 and PD-015; A3 this index; A4 player-content contracts, routes, database and operations scripts
RootPosition: R1
Weight: W5
Sequence: S1 authenticate account > S2 validate complete canonical save or one structured life record > S3 atomically replace the cloud slot or upsert that life record > S4 order eligible records by score then rounds and retain the global first 50 > S5 preserve old state on failure > S6 delete owned content with account lifecycle
Responsibility: own one cloud manual save per authenticated account, its compact storage/restore codec, per-life leaderboard eligibility and ordering, mailbox state, retained portrait asset manifests, feature flags, and aggregate-only local operations projections
NonResponsibility: does not own account credentials, session issuance, life scoring, game-state mutation, automatic saves, story truncation, per-account best-run filtering, new portrait generation, or raw diagnostic-log storage
Inputs: authenticated account ID, explicitly requested manual-save payload, validated save metadata, already structured game-over record with five dimensions, score, review, verse and round count, feature configuration and existing aggregate diagnostics
OutputsAndWrites: one indexed gzip cloud payload plus metadata/hash per account, zero or more independently keyed eligible life records per account within a global 50-record projection, mailbox and retained portrait assets, aggregate operations report; disabled features return no player data and perform no provider call
PublicStateOrAPI: authenticated cloud-save API, leaderboard, mailbox and existing account UI; operations dashboard binds only 127.0.0.1:4317 and is accessed locally through an SSH tunnel, never through Nginx
Dependencies: account-cloud session validation and deletion lifecycle, save-restore canonical payload, game-over structured records, better-sqlite3 WAL, Node crypto/zlib/DNS, existing aggregate log analyzer and optional public-HTTPS OpenAI-compatible image endpoint
Lifecycle: a cloud slot is virtual until first explicit save, is atomically overwritten only by its owner, and is removed with the account; every eligible completed life is independently upserted by record ID, global ordering is recalculated deterministically, and records beyond position 50 are removed from the active projection
RuntimeLivenessSource: registered Node account-content routes, leaderboard and mailbox routes, `ai-life-sim-operations-dashboard.service` and its loopback health response; new portrait generation and scheduling remain disabled
AIParticipation: player-content services perform no new image request; they only retain and display already stored portrait assets where present
StorageClass: dedicated schema-versioned SQLite WAL database for indexed state; portrait PNG/JPEG/WebP bytes use a controlled private object root behind database manifests, atomic writes, account cleanup and orphan reconciliation, never per-player unindexed files
PersistenceAuthority: /var/lib/ai-life-sim/player-content.sqlite is the sole server truth for cloud slots, rank projections and mail metadata; account-cloud remains the sole identity/session truth, and game stores remain the sole game-state owner before an explicit cloud-save capture
CrossTreeRelations: consumes authenticated identity from account-cloud and completed facts from game-over-reincarnation; persists DATA state; projects-to UX manual-save and later feature-gated inbox/rank surfaces; reads QUAL aggregate diagnostics; verified-by QUAL player-content and operations dashboard tests
Implementation: src/core/player-content; src/app/api/account/cloud-save; src/mods/mod-pages player-content client helpers; scripts/ops player-content dashboard
AcceptanceEvidence: compact save round-trip, compressed-size bound, strict malformed/future payload rejection, atomic overwrite rollback, account/inactivity cleanup, eligibility/order/idempotency, disabled-image no-call, public-host and PNG/JPEG/WebP validation, aggregate-only loopback dashboard/service, account browser path, TypeScript, lint, structural, UI, no-hard-truncation and delivery gates
LastVerified: 2026-07-23
Supersession: PD-034's former unimplemented generic cloud manual-slot statement is narrowed to one dedicated authenticated cloud slot; local 10-slot manual saves remain unchanged
```

### 3.11 Shared QQ identity and points

```text
TreeId: DATA
NodeId: shared-qq-community
ParentNodeId: data-lifecycle
SystemId: shared-qq-community
SystemPath: project > data-lifecycle > shared-qq-community > signed-bot-api
ParentGoal: let the main game and QQ community share verified identity and one points economy without granting the Bot access to private account data
PrimaryGovernanceParent: core account database and signed integration service
ChildSystems: one-time QQ link codes, verified one-to-one links, HMAC request verifier, nonce replay store, project/account public projections, global QQ point accounts, append-only point ledger, Shanghai-date check-ins, group membership projections, persistent business idempotency results
Authority: A0 secret, authorization and private-data boundaries; A1 PD-035, PD-034 and PD-033; A3 this index and qq-bot-integration-contract.md; A4 core account integration services and thin routes
RootPosition: R1
Weight: W5
Sequence: S1 derive QQ and group from trusted Bot event > S2 sign exact raw request over loopback > S3 verify timestamp, nonce, signature and a loopback-only forwarding chain > S4 strictly parse an allowlisted DTO > S5 execute one database transaction > S6 return only the public projection
Responsibility: own verified QQ linkage, signed Bot authentication, public project/account projections, global points balances, check-ins, group leaderboards, transfers, privileged adjustments, append-only ledger rows and idempotent retries
NonResponsibility: does not expose or let the Bot directly query password hashes, sessions, API Keys, settings, character drafts, talent or record content, saves, story, Prompt, logs or diagnostics; does not own OneBot identity extraction, group membership verification, command confirmation or Bot administrator policy
Inputs: server-generated link code, trusted event QQ/group, exact signed request bytes, point operation DTO and business idempotency key
OutputsAndWrites: verified link rows, nonce hashes, point account balances, ledger rows, Shanghai-date check-ins, group membership timestamps, idempotent result rows and allowlisted response DTOs
PublicStateOrAPI: GET /api/integrations/qq-bot/project-status; POST /api/integrations/qq-bot/account-status, /bind, /unbind and /points; exact caller contract in docs/qq-bot-integration-contract.md
Dependencies: account-cloud identity, better-sqlite3 WAL repository, Node crypto, Zod, loopback network and shared QQ_BOT_INTEGRATION_SECRET
Lifecycle: link codes expire after ten minutes; request signatures after five minutes; nonce hashes after ten minutes; point idempotency results after 90 days; QQ point balances outlive optional game-account deletion and remain keyed by QQ
RuntimeLivenessSource: Next.js integration route registration, active main service on loopback and configured integration secret; the QQ Bot consumer is integrated by a separate task
AIParticipation: none
StorageClass: database
PersistenceAuthority: the main account SQLite database owns all shared QQ identity and point tables; only the main service and its cleanup process open the file, while the Bot consumes signed DTOs
CrossTreeRelations: consumes account-cloud verified identity; projects-to UX account points and external Bot commands; verified-by QUAL account-cloud transaction, replay and privacy tests
Implementation: src/core/account/account-database.ts; src/core/account/qq-bot-integration.ts; src/core/account/qq-points-service.ts; src/app/api/integrations/qq-bot; src/app/api/account/qq-link; scripts/ops/cleanup-inactive-accounts.mjs
AcceptanceEvidence: npm run test:account-cloud; signature mismatch, stale timestamp, replay, loopback-only and mixed/public forwarding chains, link-code, cross-day check-in, transfer conservation, request-bound idempotency and negative-balance cases; TypeScript, lint and delivery gates
LastVerified: 2026-07-21
Supersession: the Bot's former independent shared-point balance must be retired when its separate integration task adopts this API
```

### 3.12 Game-over score, achievements and reincarnation generation

```text
TreeId: SEM
NodeId: game-over-reincarnation
ParentNodeId: semantic-capabilities
SystemId: game-over-reincarnation
SystemPath: project > player-flow > game-over > score-achievements-reincarnation
ParentGoal: give completed lives a broadly rewarding but honest score, visible verified accomplishments and a score-scaled cross-world legacy
PrimaryGovernanceParent: mod-pages deterministic game-over scorer and mod-character reincarnation Prompt chain
ChildSystems: raw score components, sub-95 generous mapping, structured achievement extractor, featured-achievement selector, deterministic strength tiers, Prompt input projection, optional reincarnation promotion, local/cloud structured record projection
Authority: A1 PD-036, PD-006, PD-032 and PD-015; A3 this index; A4 live scorer, game-over page, Prompt access chain and owning Stores
RootPosition: R2
Weight: W5
Sequence: S1 read complete structured end state > S2 calculate raw and display score locally > S3 extract only resolved choices and breakthroughs > S4 choose strength tier locally > S5 run the optional reincarnation promotion when the player confirms > S6 write the promoted talent to the 36-slot library and upsert the bounded structured record
Responsibility: own deterministic score mapping, structured major-event projection, score-to-strength classification, score/tier Prompt input, optional promotion output validation, complete long-description display and structured persistence fields
NonResponsibility: does not infer achievements from prose, let AI calculate the score or tier, truncate story evidence, guarantee high-tier victory, create a second reincarnation Store, or persist story正文 in account records
Inputs: four public dimensions, narrative round count, structured resolved choices, lifespan breakthroughs, completed/dead state, complete ordered life records and digests, existing reincarnation library
OutputsAndWrites: score and components, structured achievements, representative achievement, strength tier, one optionally promoted reincarnation talent, bounded structured game record and local share projection
PublicStateOrAPI: game-over sections 01-05, share-card facts, mod-character promoteReincarnationTalent/createPromotedReincarnationTalent and the 36-slot reincarnation library
Dependencies: engine narrative metadata, character lifespan/destiny state, mod-character reincarnation-promotion Prompt, account-cloud structured schemas and game-over-sharing
Lifecycle: score and achievements are derived when game over is viewable; the optional promotion runs only after the player confirms and writes the promoted talent to the 36-slot library; the completed record is upserted after full settlement
RuntimeLivenessSource: mod-pages game-over route guard and live mod-character AI caller
AIParticipation: optional promotion only; AI proposes one non-numeric conceptual rule for the selected legendary or mythic talent, while local code owns score, tier, validation and persistence
StorageClass: schema-versioned structured Store locally and database projection when authenticated
PersistenceAuthority: mod-character reincarnation library and life-record Stores own browser state; account-cloud owns authenticated bounded replicas; no independent score files
CrossTreeRelations: consumes RUN completed-life facts; supplies SEM Prompt evidence; persists-to DATA account-cloud; projects-to UX game-over and talent draw; verified-by QUAL game-over and account regression tests
Implementation: src/mods/mod-pages/pages/game-over/game-over-scoring.ts; src/mods/mod-pages/pages/game-over/page.tsx; src/mods/mod-pages/pages/game-over/game-over-share-card.ts; src/mods/mod-pages/pages/game-over/useGameOverActions.ts; src/mods/mod-character/reincarnation-talent-access.ts; src/mods/mod-character/prompts/reincarnation-promotion-prompt.ts; src/mods/mod-character/reincarnation-library-store.ts; src/mods/mod-pages/pages/talent-draw
AcceptanceEvidence: game-over-share-card-smoke scoring thresholds, structured achievement extraction, share projection, Prompt version/tier and no-line-clamp assertions; npm run check:ui; no-hard-truncation audit; browser game-over and long-description layouts; lint and TypeScript
LastVerified: 2026-07-21
Supersession: replaces the old visible four-dimension average as the overall ending score, the player-facing “神话天赋” naming, and the retired three-candidate/auto-timer/sealing settlement flow
```

## 4. External MVP systems

当前共有 13 个外部运行系统：P0 多世界基础 6 个、P1 历史事件账本 1 个、角色与世界既有系统 6 个。与下节 12 个 engine 成员合计 25 个 active；`src/mods/**/subsystems/**/*-system.ts` 的 77 个文件中其余 52 个均为 non-active runtime 成员。运行存活性只以 `mvp-stages-config.default.json` 为准，文件、manifest 或 import 存在均不能提升 liveness。

| SystemId | OwnerMOD | Responsibility | NonResponsibility | Inputs | OutputsAndWrites | AI participation | Implementation |
|---|---|---|---|---|---|---|---|
| `world-context-registry` | `mod-world` | Own the save-level directory of world, universe, plane, planet, region and scene contexts, stable context IDs, hierarchy, lifecycle and current context reference | Does not own space edges, canonical time, transition atomicity or narrative commits | World-context factory output and lifecycle requests | `useWorldStore.contexts`, `currentContextId`, read-only registry state | Read-only | `src/mods/mod-world/subsystems/world-context-registry-system.ts`, `src/foundation/subsystem-contracts/world-context.contract.ts` |
| `contextual-capability-profile` | `mod-world` | Own each context's explicit life, space, NPC, economy, politics, technology and supernatural capabilities plus the allowed system combination | Does not register systems, wake dormant contexts or execute deferred simulation packages | Structured `WorldConfig` and confirmed facts | Per-context capability profiles and active/background subsystem ID sets | Read-only; semantic candidates require local confirmation | `src/mods/mod-world/subsystems/contextual-capability-profile-system.ts` |
| `spatial-graph` | `mod-world` | Own context roots, spatial nodes, containment/adjacency edges, cross-context exits and global-entity locations | Does not own map UI, geography, resources or transition commits | Validated spatial events and context initialization | Per-context graphs, global exits and entity locations | Event input only | `src/mods/mod-world/subsystems/spatial-graph-system.ts` |
| `context-transition` | `mod-world` | Preflight and atomically migrate the active context, actor/carried/companion locations, local clocks and source/target scopes; roll back on runtime-context injection failure | Does not author arrival prose, advance global time, or own item/companion business state | Stable actor ID, target context, validated exit and qualifications, canonical total days | Current-context projection, scoped entity locations and append-only transition records | Proposal only; local preflight owns commit | `src/mods/mod-world/subsystems/context-transition-system.ts`, `src/mods/mod-world/world-context-api.ts` |
| `simulation-scope-policy` | `mod-world` | Own `active/background/dormant/closed` scope and synchronize local clocks from canonical time | Does not run P2-P8 background simulation or write canonical time | `RoundContext.totalDays` and explicit local scope requests | Per-context scope and local clock state | Read-only | `src/mods/mod-world/subsystems/simulation-scope-policy-system.ts` |
| `world-init` | `mod-world` | Create one validated world-context instance per call with capability profile, spatial root, local calendar, initialization facts and optional connection to the current context | Does not replace the whole save, create a second time/orchestrator authority, or restore old world-map simulation | User world configuration, world generation cache code and explicit context options | New or intentionally reinitialized `WorldContextInstance` | Proposal; IDs, structure and validation remain local | `src/mods/mod-world/subsystems/world-init-system.ts`, `src/mods/mod-world/world-init-bundle.ts` |
| `historical-event-ledger` | `mod-history-dynamics` | Own the only append-only record of historical events, transitions, evidence, four-state capability-checked candidate audits, explicit causal edges, bounded queries and legacy migration across global, context, travel and cross-context scopes | Does not author narrative prose, infer facts from body text, own delayed-promise scheduling, run topic presets, or expose candidates as occurred facts | Locally validated historical batches, stable context/entity/location references, explicit candidates with optional generic capabilities, causal edges, v1/v2 snapshots | Store v2 full ledger, cached current-relevant collected view, stable event IDs, paginated event/evidence/transition/migration/detail queries and atomic commit results | `event-input`; not in `narrativeChange`, IDs and commit results remain local | `src/foundation/subsystem-contracts/historical-event.contract.ts`, `src/mods/mod-history-dynamics/subsystems/historical-event-ledger-system.ts`, `src/mods/mod-history-dynamics/components/event-candidate-provider.ts`, `src/mods/mod-history-dynamics/components/causal-graph-component.ts`, `src/mods/mod-history-dynamics/historical-event-api.ts`, `src/mods/mod-history-dynamics/store.ts` |
| `character-base` | `mod-character` | Own four player-allocated base attributes, explicit starting age, narrative structured deltas, and aggregation of race, destiny, injury, decay and context modifiers | Does not own the allocation-page presentation, calendar time, maximum lifespan, luck, morality, or narrative phase order | `RoundContext`, confirmed 4-point creation allocation for new lives, legacy values on restore, and provider-owned character modifiers | Character base state and validated structured attribute changes | Main narrative writable through the derived four delta fields; validates, clamps and applies its owned changes | `src/mods/mod-character/subsystems/character-base-system.ts` |
| `destiny-pattern` | `mod-character` | Own selected destiny patterns, one-request generation of the complete 12-position candidate set, prompt-versioned candidate cache, pattern runtime state, and terminal handling of generation failure | Does not directly own base-attribute state application, main narrative changes, credential values, background pool filling, automatic follow-up requests, or rewrite already selected patterns when a candidate contract changes | Character creation choice, explicit preset mode, optional AI generation and classified AI errors | Selected pattern state, one complete 12-item AI candidate set with at least six positive entries, four-attribute bonuses, narrative effects, prompt-versioned candidate cache, or explicit terminal generation failure exposed to consumers | AI may generate candidates; not in the main narrative writable allowlist | `src/mods/mod-character/subsystems/destiny-pattern-system.ts`, `src/mods/mod-character/utils/destiny-pattern-pool-cache.ts` |
| `lifespan` | `mod-character` | Own maximum lifespan, breakthroughs, and structured lifespan deltas from explicit world and race configuration | Does not own current age, time advancement, or death prose | `RoundContext`, world/race configuration, owned structured changes | Lifespan state and change application | Main narrative writable | `src/mods/mod-character/subsystems/lifespan-system.ts` |
| `luck` | `mod-character` | Own luck value and derived disease, death, event-weight, and ageing modifiers | Does not generate events or own other subsystem state | `RoundContext` and owned structured changes | Luck state, derived modifiers, Prompt formatting | Main narrative writable | `src/mods/mod-character/subsystems/luck-system.ts` |
| `morality` | `mod-character` | Own morality value and apply structured morality deltas | Does not infer morality locally from narrative keywords | `RoundContext` and `morality.delta` | Morality state | Main narrative writable | `src/mods/mod-character/subsystems/morality-system.ts` |
| `world-entity` | `mod-world` | Own generated named countries, factions, noble houses, settlements, and trade routes partitioned by `contextId` with namespaced global entity IDs | Does not own geography, calendar time, spatial graph truth, or narrative orchestration | Current context, world configuration and entity-generation inputs | Per-context entity collections and validated location references | Event input; not in the main narrative writable allowlist | `src/mods/mod-world/subsystems/world-entity-system.ts` |

All thirteen external systems expose collected state to the orchestrator. The world Store additionally owns the full multi-context registry and compatibility projection; the history Store owns the complete ledger behind a bounded collected projection. Exact restoration support remains owned by each implementation and the save/restore aggregator.

## 5. Engine MVP systems

当前共有 12 个引擎运行系统；与 13 个外部运行系统合计为 25 个 MVP 运行系统。

| SystemId | Responsibility | NonResponsibility | Inputs | OutputsAndWrites | AI participation | Implementation |
|---|---|---|---|---|---|---|
| `time` | Own calendar advancement and canonical `daysPassed` and `totalDays` derivation | Does not own narrative pacing decisions, age business rules, or subsystem formulas | Selected time step and current time state | Canonical round time state | Deterministic local only | `src/mods/mod-engine/subsystems/time-system.ts` |
| `orchestrator` | Own ordered simulation phases, current-context filtering, main narrative assembly, AI calls, visible-body projection, tiered commit, branch flow, historical-event preflight/commit, scoped delayed-causality commit and autosave coordination | Does not calculate owning subsystem business rules, switch contexts directly, invent historical IDs or facts, promise that a player choice succeeds, infer missing structured state from prose, or expose protocol/data chunks in the narrative UI | Registered live systems, scoped `RoundContext`, AI configuration, projected Chinese world/character views, layered memory, branch choice, unresolved intents, due in-scope causal events, validated structured data, raw AI response, stores | Engine state, context-tagged narrative history and digest ledger, body-only visible stream, accepted state changes and historical batches, consumer event-ID references, per-entry repetition metrics, per-life repetition summary, internal narrative-system snapshots and subsystem snapshots | Owns the single main narrative call lifecycle; accepted `属性变化` is translated to the `character-base` owner. A protocol or repetition failure is an explicit terminal failure; a later call requires a new player action. | `src/mods/mod-engine/subsystems/orchestrator-system.ts`, `src/mods/mod-engine/helpers/narrative-repetition-metrics.ts`, `src/mods/mod-engine/helpers/save-restore.ts`, `src/mods/mod-engine/helpers/narrative-ai-input-view.ts` |
| `narrative-parser` | Parse the `正文 -> 可选属性变化 -> 可选分支` Chinese protocol, preserve complete body text, and strictly translate valid structured fields | Does not infer omitted fields, rewrite semantic content, decide product meaning, or directly write subsystem state | Raw AI response text and the Chinese response contract | Complete narrative body, optional attribute-change object, optional branch, and explicit parse failure | Consumes one AI response; strict state-machine extraction, Schema validation and translation | `src/mods/mod-engine/subsystems/narrative-parser-system.ts`, `src/mods/mod-engine/helpers/tagged-meta-envelope.ts`, `src/mods/mod-engine/helpers/narrative-ai-protocol.ts` |
| `summary-compressor` | Own the hierarchical summary set, complete-coverage marker and traceable multi-level compression pipeline | Does not silently delete story facts, convert token budgets into semantic character caps, or create placeholder coverage after AI failure | Narrative history, existing summaries, coverage-safe output headroom, AI service when required | Only completed summaries and successful compression statistics; lower leaves remain on failure | Uses AI for semantic summary levels; `[SUMMARY_COMPLETE]` is required before a coverage node may be committed | `src/mods/mod-engine/subsystems/summary-compressor-system.ts`, `src/mods/mod-engine/prompts/summary-prompt.ts` |
| `memory-engine` | Remain an active registered compatibility member and expose its collected read-only memory projection | Does not infer business facts from free narrative text, own structured relationship/event writes, own never-forget policy, or own general narrative compression | Registered subsystem collection/reset lifecycle and explicitly restored compatibility memory | Compatibility memory snapshot only; it is not the current relationship or event write path | Read-only compatibility registration; legacy `extractFromNarrative`/`extractFromAttr` have no current main-path caller and must not be reconnected | `src/mods/mod-engine/subsystems/memory-engine-system.ts`, `src/mods/mod-engine/bootstrap/engine-subsystems.generated.ts`, `src/mods/mod-engine/subsystems/orchestrator-system.ts` |
| `subsystem-relevance` | Own subsystem relevance scoring, state/change tracking, and Prompt inclusion decisions | Does not delete subsystem state or change system ownership | Collected subsystem states, change history, current round context | Relevance decisions and non-destructive Prompt selection | Supplies context selection to AI; no semantic state write | `src/mods/mod-engine/subsystems/subsystem-relevance-system.ts` |
| `memory-lifecycle` | Own memory tiers, importance, event closure, and coverage-aware Prompt injection | Does not use hard truncation as forgetting or persistence | Memory records, compressed summaries, event lifecycle signals | Layered memory state and Prompt memory context | Prepares context for AI; lifecycle rules remain local and explainable | `src/mods/mod-engine/subsystems/memory-lifecycle-system.ts` |
| `memory-forgetting` | Own explainable forgetting decisions and causal or foreshadowing protection marks | Does not silently destroy uncovered story facts | Memory records, importance, causal marks, current round | Forgetting decisions, protection and resolution state | Local policy; any semantic compression must remain traceable | `src/mods/mod-engine/subsystems/memory-forgetting-system.ts` |
| `causal-delay` | Own delayed narrative-commitment registration, deterministic canonical-day due eligibility, explicit `legacy-round` compatibility, pending/triggered state, and versioned save/preview restoration | Does not pre-author the outcome, convert old round schedules into guessed days, mark an event resolved merely because it entered a Prompt, own world-event causality, write prose, or bypass the orchestrator | Validated AI delayed matters, scope, `createdTotalDays`, optional origin event ID, accepted narrative commit and resolution event ID | Pending events, due-event facts, confirmed triggered events with `originEventId/resolutionEventId`, plus snapshot `schemaVersion: 1`; versioned duplicate IDs reject and unversioned duplicates retain `legacyId` after deterministic migration | AI may register Chinese structured delayed matters; local code schedules by severity days, renders established facts, and confirms only after the complete narrative round and history batch are accepted | `src/mods/mod-engine/subsystems/causal-delay-system.ts`, `src/mods/mod-engine/subsystems/orchestrator-system.ts` |
| `plot-structure` | Own plot stage, tension progression, and deterministic narrative-structure signals | Does not choose player actions or author prose | Round context and narrative semantic signals | Plot-stage state and Prompt constraints | Constrains AI narrative structure | `src/mods/mod-engine/subsystems/plot-structure-system.ts` |
| `foreshadowing` | Own active and resolved foreshadowing records, trigger scoring, and resolution hints | Does not rewrite narrative history or own general memory compression | Structured foreshadowing signals, round context, narrative resolution | Foreshadowing state and Prompt hints | Consumes and supplies structured AI narrative signals | `src/mods/mod-engine/subsystems/foreshadowing-system.ts` |
| `core-memory` | Own never-forget key events, foreshadowing context, and structured NPC relationship history | Does not infer relationships from free prose, replace the summary hierarchy, or turn `memory-engine` compatibility regex into a fact source | Orchestrator-accepted semantic `relationshipUpdates`, round/context IDs, accepted historical event IDs and protected context | Core memory state, relationship graph and Prompt context | The orchestrator writes validated structured relationship updates through `recordRelationshipUpdates`; core-memory supplies protected context to AI | `src/mods/mod-engine/subsystems/core-memory-system.ts`, `src/mods/mod-engine/subsystems/orchestrator-system.ts` |

All engine systems persist through the orchestrator and engine save payload when their state is included by the live snapshot path. Exact state fields and restore methods remain authoritative in the implementation and save/restore code.

## 6. Deferred story-bearing no-truncation coverage

These systems are outside the current MVP runtime list but remain governed by `PD-015`; deferred liveness does not permit fixed-capacity deletion.

Their default `SystemPath` is `project > deferred-story-state > <owning domain or contract>`. Their parent goal is to preserve complete, attributable story state until the owning system is activated; their owner, dependencies, persistence authority, and AI participation are declared in each row and linked implementation.

| System or contract | Owner | Responsibility and persistence authority | AI participation | Current no-truncation contract |
|---|---|---|---|---|
| NPC store, behavior, and memory | `mod-npc` | Zustand `mod-npc:persist:npc-state` owns NPC roster, behavior, global events, relations, and memories; persisted version 2 removes the legacy `maxNPCs` field | Key-NPC behavior Prompt may generate structured behavior | Preserve every NPC, behavior, event, trait and memory; age only lowers importance, while same-year merging embeds every source ID, summary, detail, keyword, relation and emotion instead of keeping a fixed tail |
| Celestial and era history; world map context | `mod-base-universe` | Owning subsystem state stores all phase transitions, era transitions, regions, resources, neighbors, factions, and notable relations | Supplies or may supply world context to narrative AI | No fixed history capacity or top-N Prompt omission; explicit in-world removal remains a state transition, not capacity eviction |
| Geography and diplomacy | `mod-environment-ecology`, `mod-politics` | Owning subsystem state stores tectonic changes, changed regions, and diplomatic events | Supplies deferred world-state context | Preserve complete event histories and expose all recorded diplomatic events |
| Culture values, art styles and works | `mod-culture` | Owning subsystem state stores all cultural values, current styles, and notable works | Supplies deferred culture context | Prompt formatting includes all values and works; styles may emerge until the declared world style pool is exhausted, but no fixed count or random array deletion may erase an established style |
| World and character generation Prompts | `mod-world`, `mod-character` | Live PromptTemplate and Zod Schema own generated world tags, entity descriptions, destiny patterns, mythic effects, and race origins | Low-frequency or initialization AI | No semantic character-count or array-count caps; candidate counts, enums, numeric domains, and entity quantity mechanics remain explicit product contracts |

Acceptance authority: `docs/acceptance-ledger.md#narrative-compression`, `scripts/check/domains/mod/historical-event-p1-smoke.mjs` and `scripts/check/domains/narrative/no-hard-truncation-audit.mjs`.

## 7. Retired and internal-only nodes

| Node | Classification | Current consumer or replacement | Runtime and persistence status | Authority |
|---|---|---|---|---|
| `golden-finger` / `mod-golden-finger` | Retired and deleted | No replacement; fortune encounters now use only luck, difficulty and their owning rules | Not in MVP runtime before deletion; manifest, source, Store, events, prompt gate and dependencies removed; legacy browser key is ignored | `PD-027` |
| `adaptation-manager-system.ts` | Internal engine service, not a formal subsystem | `orchestrator` consumes cached worldview-adapted summaries during Prompt assembly and starts background adaptation; deterministic fact projections such as `historical-event-ledger` are explicitly bypassed | No independent subsystem ID, runtime membership or persistence payload; cache is session-local and cleared by orchestrator reset; it may not rewrite, summarize or replace ledger fact cards | `PD-027`; live orchestrator call sites |
| `event-pool` → `src/mods/mod-history-dynamics/components/event-candidate-provider.ts` / `EventCandidateProvider` | P1 internal candidate provider; old subsystem and file retired | `historical-event-ledger` consumes explicit candidate submissions, audit decisions and promotions | No manifest subsystem, runtime ID, independent Store, topic presets or fact ownership; v1 payload migrates into Store v2 | `PD-029`; blueprint §15; live provider and migration |
| `causal-simulation` → `src/mods/mod-history-dynamics/components/causal-graph-component.ts` / `CausalGraphComponent` | P1 internal causal-graph component; old subsystem and file retired | `historical-event-ledger` consumes validated explicit edges | No manifest subsystem, runtime ID, independent queue, prose regex, random delay or auto-resolution; v1 payload migrates into Store v2 | `PD-029`; blueprint §15; live component and migration |

Internal services remain governed by their parent system. They must not be counted as player-selectable simulation systems merely because their implementation file ends in `-system.ts`.

## 8. Change checklist

For every system change, record:

```text
SystemId:
SystemPath:
ParentGoal:
PrimaryGovernanceParent:
ChildSystems:
Authority: A1-A5 sources affected
RootPosition: R0-R4
Weight: W5-W1 within the same authority and root position
Sequence: S1-Sn
Responsibility change:
Dependencies change:
Lifecycle change:
Public API or state change:
Runtime liveness change:
AI participation change:
Persistence change:
PersistenceAuthority:
Acceptance evidence:
Last verified:
Supersession:
```
