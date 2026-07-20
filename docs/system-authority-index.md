# System Authority Index

文档角色：system-index
权威层级：A3
状态：active
体系路径：project > governance > system-index
上级目标：让项目中的运行与延后系统拥有唯一责任、接口、生命周期和验收路由
下级组成：活动权威登记、平台服务、新人生生命周期、外部 MVP 系统、引擎 MVP 系统、历史因果内部组件、延后剧情系统
适用范围：平台服务、MVP 运行子系统、历史事件与消费者引用、延后但承载剧情事实的系统、状态与写入所有权、AI 参与、持久化和运行存活性
拥有者：`mod-engine` 运行注册与各 owning MOD
最后验证：2026-07-20；对照[蓝图二](blueprint-02-multi-world-simulation-foundation.md)、[运行阶段策略](../src/mods/mod-engine/helpers/mvp-stages-config.default.json)、P0/P1 focused 回归、新人生隔离、历史事件 Store v2/旧迁移、子系统实现、Prompt/Schema、缓存统计分桶、持久化路径、[LongCat 与服务端 Prompt 验收](playtest-2026-07-20-managed-ai-longcat-server-prompt.md)、[叙事变化驱动力验收](playtest-2026-07-20-narrative-pressure-balance.md)、[中文协议回归](../scripts/check/domains/narrative/narrative-chinese-protocol-regression.mjs)和[硬截断审计](../scripts/check/domains/narrative/no-hard-truncation-audit.mjs)
取代关系：none
运行真源：[mvp-stages-config.default.json](../src/mods/mod-engine/helpers/mvp-stages-config.default.json)、manifest、生成注册表和各实现文件
验收证据：`.agents` 治理检查、引用审计、活动系统覆盖检查、`npm run test:world-context-p0`、`npm run test:historical-event-p1`、`npm run test:narrative-protocol`、无硬截断审计、[Prompt 4.0 分级中文协议验收](playtest-2026-07-18-prompt-4-tiered-protocol.md)、[叙事变化驱动力验收](playtest-2026-07-20-narrative-pressure-balance.md)、[a6api 托管主备通道验收](playtest-2026-07-19-managed-ai-a6api.md)与[LongCat 与服务端 Prompt 验收](playtest-2026-07-20-managed-ai-longcat-server-prompt.md)

## 1. Reading rules

- This index owns responsibility routing, not detailed field schemas or runtime implementation.
- Use the authority ladder in `.agents/skills/ai-life-sim/references/authority-hierarchy.md` when sources conflict.
- Treat `SystemPath` as a conceptual ownership path rather than a filesystem path. Each responsibility has one primary governance parent and one runtime owner; model other relationships as dependencies, producers, adapters, or consumers.
- Use live code and types for exact data shape. Use [mvp-stages-config.default.json](../src/mods/mod-engine/helpers/mvp-stages-config.default.json) for runtime liveness; a source file or manifest entry alone is insufficient.
- Update this index in the same task when a system is added, removed, renamed, activated, deactivated, changes owner or responsibility, changes public state or API authority, changes AI participation, or changes persistence behavior.

## 2. Active authority registry

| Authority | Tier | Role | Update trigger |
|---|---|---|---|
| `../../AGENTS.md` | A0 | Project entry, authorization boundary, commands, secret handling | Project workflow, permissions, gates, infrastructure, or Skill routing changes |
| `docs/product-decisions.md` | A1 | Active product semantics | User-visible meaning, product red line, or selected behavior changes |
| `docs/blueprint-02-multi-world-simulation-foundation.md` | A2 | Multi-world simulation target, P0-P8 order, and active P0/P1 execution contracts | P0/P1 target, phase order, composition, or acceptance changes |
| `docs/system-authority-index.md` | A3 | System responsibility and ownership map | System lifecycle, ownership, writes, AI role, persistence, or liveness changes |
| `docs/simulation-rewrite-architecture.md` | A3 | BaseSubsystem and Foundation architecture | Subsystem base contract or cross-domain contract rules change |
| `docs/design-2026-07-07-core-architecture.md` | A3 | Engine and field-contract design supplement | Core/foundation or field ownership changes |
| `src/mods/mod-engine/helpers/mvp-stages-config.default.json` | A4 | Runtime subsystem policy | Active stage or runtime membership changes |
| Manifests, generated registration, public entries, live implementations | A4 | Current executable truth | Code, registration, API, state, or generated wiring changes |
| Regression, gate, browser, playtest, and runtime records | A5 | Acceptance evidence | Expected behavior, reproduction, or validation result changes |
| Superseded plans, proposals, archived snapshots, unselected candidates | A6 | History and alternatives | Preserve explanation only; never present as active instruction |

## 3. Runtime and persistence contract

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
SystemPath: project > simulation-runtime > external-product-systems|engine-orchestration-systems > <SystemId>
ParentGoal: contribute owned state or orchestration to the playable narrative simulation
PrimaryGovernanceParent: owning MOD for external systems; mod-engine for engine systems
ChildSystems: implementation-owned composed units or none
Dependencies: Inputs plus linked public contracts, registration, and consumers
Lifecycle: registration and liveness policy plus owned collectState/restore path
```

Unless a row states otherwise, every active card uses these shared fields:

```text
RuntimeStageAndLivenessSource: mvp; src/mods/mod-engine/helpers/mvp-stages-config.default.json
PersistenceAuthority: owning collectState/restore path plus orchestrator snapshot and save-restore aggregator
AcceptanceEvidence: governance system-coverage check plus the owning behavior's focused and delivery gates
LastVerified: 2026-07-19
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
- Main narrative Prompt `4.4.0` splits fixed private assets from browser-owned dynamic work. `src/mods/mod-engine/server/narrative-system-prompt.ts` is the sole fixed-prefix compiler with basic constraints first and one annotated standard example last; `src/mods/mod-engine/server-prompt-assets.ts` is the `server-only` whitelist entry resolved by `/api/proxy`. The browser `narrativePrompt.systemPrompt` remains empty and carries only `serverPromptAssetId`; `narrative-prompt-components.ts` owns dynamic repair-component composition, while `prompt-builder.ts` owns the ordered `全局信息 -> 记忆 -> 本轮引导` user messages, keeps dynamic local time out of the global cache message, and places changing originality protection at the memory prefix. The fixed变化驱动力 contract accepts opportunities, discovery, mastery, recognition, recovery, success or causally grounded conflict instead of requiring pressure every round, forbids automatic institutional review without established world or story causality, prevents resolved obstacle classes from being mechanically reused, and rejects unrelated negative ending hooks. `narrative-ai-input-view.ts` owns world/character projection; `historical-event-prompt-projection.ts` deterministically renders only current-relevant scoped facts and edges; the background worldview adapter cannot rewrite that projection. `narrative-ai-protocol.ts` retains the browser-required Schema, sole successful `⟦正文⟧/⟦摘要⟧/可选⟦数据⟧/⟦结束⟧` parser, translation and repair reminder, but no longer contains the fixed rules or standard example. Ordinary rounds may commit complete body and digest without structured data; a present data block remains whole-bundle accepted or rejected, focused intent and forced branch rounds retain conditional gates, and RoundCommit preflights and rolls back dependent state. The time guidance requires varied scene-first openings and the explicit current calendar label when a time anchor is needed.

### 3.1 Managed AI default channel

```text
SystemId: managed-ai-default-channel
SystemPath: project > simulation-runtime > platform-services > managed-ai-default-channel
ParentGoal: let players start with a usable free experience while keeping the managed credential server-only and preserving player-owned overrides
PrimaryGovernanceParent: core AI Provider configuration plus app AI proxy and mod-settings
ChildSystems: public LongCat default preset, retained a6api preset, settings defaults and migration, per-Provider server credential resolution, credential-terminal propagation, complete SSE transport aggregation, background world initialization routing
Authority: A1 PD-018 and PD-020; A3 this index; A4 live Provider, settings, AI client, candidate generation and proxy implementation
RootPosition: R1
Weight: W5
Sequence: S1 LongCat default selection > S2 optional old-channel selection > S3 per-Provider credential resolution > S4 fixed-target request > S5 same-interface fallback or explicit failure > S6 player override
Responsibility: own LongCat as the public default Provider and retain the old a6api free Provider as a selectable alternative; fix each Provider to its public base URL and model allowlist; select the matching environment credential only inside server AI routes; preserve restore-default, migration and custom-override semantics; classify 401/403 as configuration-terminal for consuming candidate loops; adapt the old channel's long non-stream client calls through complete SSE upstream aggregation and switch its internal model only before any partial result is committed
NonResponsibility: does not expose or persist the managed credential, own third-party billing or credential lifecycle, author gameplay state, or silently redirect managed traffic
Inputs: player settings, optional player API Key, LONGCAT_API_KEY or MANAGED_AI_API_KEY environment value selected by Provider, validated proxy request
OutputsAndWrites: fixed LongCat request, fixed old-channel primary request, same-interface old-channel fallback request or explicit configuration/allowlist/credential-terminal error; public settings state contains no managed credential
PublicStateOrAPI: managed and managed-a6 Provider metadata; GET /api/proxy returns only configured boolean for the selected Provider; POST may omit a client Key for either managed path, while an explicit player Key overrides only that request
Dependencies: deployment environment, src/core/ai-service/provider-config.ts, mod-settings persisted state, app AI proxy
Lifecycle: active for new-user defaults, restore-default, API availability checks and every managed proxy request
RuntimeLivenessSource: app route registration, settings Store hydration and active Next.js server process
AIParticipation: transports model requests only; does not interpret or apply AI semantic output
PersistenceAuthority: player overrides remain in mod-settings browser persistence; each managed credential exists only in private local or server environment files
Implementation: src/core/ai-service/provider-config.ts; src/core/ai-service/server-provider-credentials.ts; src/core/ai-service/managed-sse-aggregation.ts; src/core/ai-service/ai-client.ts; src/mods/mod-settings/store.ts; src/mods/mod-settings/components/SettingsTabPresets.tsx; src/mods/mod-character/subsystems/destiny-pattern-system.ts; src/mods/mod-pages/pages/talent-draw/page.tsx; src/mods/mod-world/world-init-bundle.ts; src/app/api/proxy/route.ts; src/app/api/world-init/route.ts
AcceptanceEvidence: npm run test:managed-ai-default; npm run test:ai-proxy; npm run test:destiny-credential-terminal; LongCat direct and SSE contract smoke; retained a6api primary/fallback routing smoke; complete long-narrative proxy and browser round; background world initialization; restore/default/old-channel/custom tests; secret-absence scan; docs/playtest-2026-07-20-managed-ai-longcat-server-prompt.md; delivery gates
LastVerified: 2026-07-20
Supersession: none
```

- `src/core/ai-service/provider-config.ts` owns public `managed` LongCat defaults, the retained `managed-a6` option, each fixed interface and allowed client model, and the old channel's same-interface fallback order. These values are not credentials.
- The deployment environment owns both credential values. `src/app/api/proxy/route.ts` and `src/app/api/world-init/route.ts` may select only the credential matching the fixed managed target, but must never persist, disclose or log it; a player-supplied Key takes precedence for that request.
- `GET /api/proxy` exposes only a boolean configuration state. It must not return the Provider configuration, environment variable value, credential source or any reversible derivative of the Key.
- Editing the interface or model switches the browser state to `custom`. Restore-default clears the browser Key and reselects LongCat without transferring either managed credential to the client. Migration moves old empty/default state to LongCat, keeps v6 player-key overrides on `managed-a6`, and preserves older explicit URL/model/key triples as `custom`.
- The retained a6api long-form path keeps the browser's non-stream response contract but uses SSE upstream transport. `managed-sse-aggregation.ts` must preserve every content chunk, require `[DONE]`, reject malformed or incomplete streams, and only then rebuild one complete OpenAI-compatible response. The proxy may retry that channel's backup model after a primary aggregation failure because no content has reached the browser; client-visible streaming may switch only before its first successful response begins, and partial story output must never be joined across models or committed as complete. LongCat uses its official OpenAI-compatible normal or SSE response directly and never falls back across Provider boundaries.
- `ai-client.ts` owns status-preserving credential-error classification. `DestinyPatternSystem` keeps the three already-started first-screen calls but aborts remaining work and rejects before any later batch after the first 401/403; the page reuses its selected error region and never clears the player Key automatically.

### 3.2 AI call observability

```text
SystemId: ai-call-observability
SystemPath: project > simulation-runtime > platform-services > ai-call-observability
ParentGoal: preserve enough secure production evidence to diagnose every AI request and player-visible failure
PrimaryGovernanceParent: core logger plus app AI proxy
ChildSystems: proxy access index, full AI traces, raw upstream errors, client event logs, safe HTTP error translation, per-IP and per-player indexes, operator inspection
Authority: A1 PD-019, PD-022 and PD-024; A3 this index; A4 live proxy, client and server log store
RootPosition: R1
Weight: W5
Sequence: S1 trusted source classification > S2 request envelope > S3 upstream lifecycle > S4 client-visible result > S5 retention cleanup and inspection
Responsibility: correlate and securely retain complete AI request, response, error and client failure evidence, classify it by server-derived IP and server-issued player diagnostic code, translate player-visible HTTP failures safely, and expose a private read-only inspection path
NonResponsibility: does not own credential values, gameplay state, narrative truth, model choice or public log browsing authorization
Inputs: trusted proxy headers, server-issued diagnostic Cookie, sanitized proxy request envelope, upstream lifecycle, client error events, environment retention policy
OutputsAndWrites: request IDs, diagnostic codes, access JSONL, full trace JSONL, raw error files, client event files, per-IP indexes and per-player indexes
PublicStateOrAPI: x-ai-request-id response header and requestId error field; no public filesystem or log-browsing access
Dependencies: diagnostic-player-identity, app proxy, core AI client, core client logger, Node filesystem and deployment environment
Lifecycle: active for every proxy call; cleanup runs opportunistically after writes at a bounded interval
RuntimeLivenessSource: app API route registration and active Next.js server process
AIParticipation: observes Provider traffic only; never authors or applies semantic game state
PersistenceAuthority: AI_LOG_DIR plus server-log-store retention and capacity policy
Implementation: src/app/api/proxy/route.ts; src/app/api/log/route.ts; src/app/api/debug-log/route.ts; src/core/ai-service/api-error.ts; src/core/ai-service/story-seed.ts; src/core/logger/server-log-store.ts; src/core/logger/server-log-safety.ts; src/core/logger/client-logger.ts; src/core/logger/debug-logger.ts; scripts/ops/inspect-ai-logs.mjs
AcceptanceEvidence: docs/playtest-2026-07-19-production-observability-opening.md; npm run test:ai-proxy; source-classification and secret-redaction regression; operator-inspector smoke; unreachable-upstream HTTP probe; secret-absence check; delivery gates
LastVerified: 2026-07-19
Supersession: none
```

- `src/app/api/proxy/route.ts` owns one request ID per proxy call and records the complete sanitized request envelope, upstream response or error, status, duration, retry observation and stream terminal state. The request ID is returned to the client for screenshot and server-log correlation. Every trace event carries the same server-derived source identity.
- `src/core/ai-service/api-error.ts` is the single player-facing HTTP translation authority. It covers explicit 4xx/5xx causes and resolution steps, preserves request IDs, and never copies raw upstream bodies into UI messages. `ai-client.ts` retains the raw body only for sanitized diagnostic logging while exposing the translated Error message to Toasts and page-owned error regions.
- Story seed normalization is enforced on both boundaries: the client omits non-finite or non-numeric values, while the proxy treats cached legacy `seed:null` as absent and leaves every other invalid type to Zod rejection. This prevents `NaN -> JSON null -> 400` without weakening request validation.
- `src/core/logger/server-log-store.ts` owns trusted source extraction, persistent log-root resolution, secret redaction, `0700` directories, `0600` files, per-file rotation, per-IP and per-player indexes, age retention and total-cap cleanup. Production uses `/var/log/ai-life-sim` through `AI_LOG_DIR`, outside `/root/ai-life-sim/`, so atomic deployments do not move active evidence into version backups; defaults are 30 days and 10 GiB unless environment policy overrides them. Diagnostic identity reservations are retention-exempt because reusing an old six-character code would break correlation.
- API keys, Authorization headers, cookies, passwords, token-like credentials and credential-bearing URL query values must never be written. Prompt and response semantics remain otherwise complete so diagnosis does not depend on lossy previews.
- `src/app/api/log/route.ts` enriches client diagnostics with the trusted source, server-issued diagnostic code and optional AI request ID; request-body fields cannot override the source or code. `src/app/api/debug-log/route.ts` keeps complete AI-call metadata collection enabled independently of the production-disabled public debug viewer, while its production GET/DELETE paths remain closed. `scripts/ops/inspect-ai-logs.mjs` searches by IP, player code, request ID or feedback ID and omits full Prompt/response content unless explicitly requested by an authorized operator.
- Diagnostic copies are operational evidence, not the authoritative narrative or save-state store. Retention cleanup may delete old diagnostic copies after the configured policy, but it must never delete or truncate gameplay-owned story data.
- The proxy observes repeated fingerprints and retry counts but does not enforce a fixed identical-request rejection. Candidate preparation normally continues until its product condition is satisfied or the player leaves; 401/403 are the explicit `PD-020` configuration-terminal exception owned by the consuming loop.
- Acceptance evidence: `npm run test:ai-proxy`, the AI error translation and story-seed smoke, a local unreachable-upstream HTTP probe confirming the enabled-thinking Schema and request-ID path, secret-absence inspection, TypeScript/lint, structural check and the delivery gate.

### 3.3 Player feedback diagnostics

```text
SystemId: player-feedback
SystemPath: project > simulation-runtime > platform-services > player-feedback
ParentGoal: let players submit actionable feedback with enough non-secret runtime evidence to reproduce and diagnose the reported problem
PrimaryGovernanceParent: mod-pages feedback composition plus core logger persistence
ChildSystems: feedback page, diagnostic-code display, diagnostic package collector, POST API, full submission store, global, per-IP and per-player indexes
Authority: A1 PD-023, PD-024, PD-019 and PD-015; A3 this index; A4 live page, route, contract, collector and server store
RootPosition: R1
Weight: W5
Sequence: S1 player consent > S2 client collection and redaction > S3 whole-package validation > S4 trusted source classification > S5 private persistence and feedback ID
Responsibility: collect player-authored feedback together with complete recent narrative entries, non-secret configuration, current game state, recent client diagnostics and browser/device environment; reject secrets and stable hardware identifiers; persist the complete sanitized package and return a stable feedback ID
NonResponsibility: does not expose stored feedback publicly, replace the authoritative save or narrative stores, collect credentials, infer device identity, send feedback to third parties, or partially save an invalid package
Inputs: feedback category, subject, message, explicit consent, player diagnostic code, client diagnostic package and trusted request headers
OutputsAndWrites: feedback ID, player diagnostic code, private full JSON submission, global feedback index, per-IP index and per-player index
PublicStateOrAPI: POST /api/feedback returns ok, feedbackId and receivedAt; no public GET, list or delete surface
Dependencies: diagnostic-player-identity, mod-pages route registration, core client logger, world/character/engine/global stores, server-log-store, AI_LOG_DIR
Lifecycle: available from welcome and active simulation pages; collection occurs only after explicit submission and consent
RuntimeLivenessSource: mod-pages route registration, app API route registration and active Next.js server process
AIParticipation: none; preserves existing AI and narrative evidence only
PersistenceAuthority: AI_LOG_DIR/feedback under the PD-019 retention, capacity, permission and cleanup policy; gameplay stores remain authoritative
Implementation: src/mods/mod-pages/pages/feedback/page.tsx; src/mods/mod-pages/pages/feedback/build-feedback-diagnostics.ts; src/app/api/feedback/route.ts; src/core/logger/feedback-contract.ts; src/core/logger/player-feedback-store.ts; src/core/logger/redact-sensitive-data.ts; scripts/ops/inspect-ai-logs.mjs
AcceptanceEvidence: npm run test:player-feedback; browser submit and feedback-ID path; secret absence and complete-recent-story inspection; UI, TypeScript, lint, structural and delivery gates
LastVerified: 2026-07-19
Supersession: none
```

- The collector selects the canonical recent narrative window while preserving every selected entry intact. It excludes API routing and credential fields before serialization and applies the shared redaction authority again on the server.
- The API rejects an oversized, invalid or incompletely stored package as a whole. The player receives a feedback ID only after the full submission and both indexes report successful persistence.
- Stored submissions are private operational evidence. They may be cleaned by the diagnostic retention policy but never mutate or replace local narrative history, save payloads, settings or subsystem state.

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
ChildSystems: DeepSeek/LongCat usage normalizer, scoped browser statistics store, main/repair call classification, settings projection and scoped reset
Authority: A1 PD-017; A3 this index; A4 live AI client, cache statistics module, narrative campaign and settings component
RootPosition: R1
Weight: W3
Sequence: S1 classify requested Provider/model/pool/call kind > S2 record one final usage snapshot > S3 query current main narrative > S4 scoped reset
Responsibility: normalize DeepSeek and LongCat usage fields, including LongCat `prompt_tokens_details.cached_tokens` and `effectiveCachedTokens`; persist and aggregate cache hit/miss Tokens by Provider, model, pool and call kind; keep main narrative and format repair separate; project only the current main-narrative bucket to settings; ignore unsplittable legacy totals
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

- A format-repair request uses `narrative-format-repair`; it may benefit from the preceding failed response but cannot raise or lower the displayed `narrative-main` rate.
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
Implementation: scripts/ops/cleanup-old-releases.mjs; scripts/ops/systemd/ai-life-sim-release-cleanup.service; scripts/ops/systemd/ai-life-sim-release-cleanup.timer
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
ChildSystems: canonical /new-game entry, direct world-confirm guard, MOD-runtime readiness wait, cross-store reset, per-life draft cleanup and OPFS flush
Authority: A1 PD-002 and PD-006; A2 blueprint-02 section 14; A3 this index; A4 live mod-pages helper and entry pages
RootPosition: R1
Weight: W5
Sequence: S1 reject active pre-generation > S2 wait for compression and MOD registration > S3 reset every active subsystem and owning Store > S4 clear per-life drafts and flow projections > S5 flush persistence > S6 allow world initialization
Responsibility: distinguish a new life from adding a context to an existing save; clear the previous life narrative, character, world registry, active subsystem state and creation drafts before the next world is committed; preserve a same-world unfinished creation draft; invalidate the old world and downstream drafts when creation changes world identity
NonResponsibility: does not delete independent save slots, model settings, diagnostic identity or the cross-life mythic library; does not create a world context, implement travel, or decide multi-world connection semantics
Inputs: explicit new-life route or game-over action, next worldCode, current game phase, engine/orchestrator progress, MOD readiness and background-task status
OutputsAndWrites: empty current-life world, character, engine, subsystem and flow state; removed per-life creation drafts; durable browser persistence before navigation
PublicStateOrAPI: resetForNewLife() and prepareNewLifeWorldCommit(worldCode); /new-game is the canonical resetting route while world confirmation remains the direct-entry guard
Dependencies: mod-pages routes, global Store, orchestrator and active P0/P1 subsystem registration, owning world/character/engine/product Stores, configStore and OPFS persistence queue
Lifecycle: runs only for an explicit new-life request or when world confirmation detects previous-life progress or a changed creation world; same-world unfinished creation return is preserved
RuntimeLivenessSource: mod-pages route registration, InitMods allModsLoaded state and active browser persistence
AIParticipation: none
PersistenceAuthority: owning Stores remain authoritative; the lifecycle invokes their reset APIs and flushes queued browser deletions but never owns save slots
Implementation: src/mods/mod-pages/helpers/new-life-reset.ts; src/mods/mod-pages/helpers/creation-draft-storage.ts; src/mods/mod-pages/pages/new-game/page.tsx; src/mods/mod-pages/pages/world-select/useWorldConfirm.ts; src/mods/mod-pages/pages/game-over/page.tsx
AcceptanceEvidence: npm run test:new-life-isolation; npm run test:world-context-p0; npm run test:creation-first-narrative; npm run check:ui; browser direct-entry isolation path; delivery gates
LastVerified: 2026-07-20
Supersession: replaces the game-over-private reset helper and the redirect-only /new-game entry
```

### 3.8 Protected main-narrative asset assembly

```text
SystemId: protected-narrative-prompt-assets
SystemPath: project > simulation-runtime > platform-services > protected-narrative-prompt-assets
ParentGoal: keep the main narrative's fixed competitive Prompt assets private without moving ordinary simulation work off the player's device
PrimaryGovernanceParent: mod-engine server-only public boundary plus app AI proxy
ChildSystems: fixed Prompt compiler, server asset whitelist, MOD server-only public entry, trusted-target check, proxy system-message injection, settings preview removal and client-bundle leakage gate
Authority: A1 PD-017 and PD-030; A3 this index; A4 manifest, server asset registry, proxy and browser AI client
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
Implementation: src/foundation/types/mod.types.ts; src/mods/mod-engine/manifest.ts; src/mods/mod-engine/server-prompt-assets.ts; src/mods/mod-engine/server/narrative-system-prompt.ts; src/mods/mod-engine/prompts/narrative-prompt.ts; src/core/ai-service/ai-client.ts; src/app/api/proxy/route.ts; scripts/check/domains/structural/scan-mod-public-boundary.mjs
AcceptanceEvidence: node scripts/check/domains/narrative/protected-prompt-assets-regression.mjs; npm run test:protected-prompt-bundle; npm run test:narrative-protocol; npm run test:ai-proxy; production build bundle scan; settings browser path; docs/playtest-2026-07-20-managed-ai-longcat-server-prompt.md
LastVerified: 2026-07-20
Supersession: replaces the browser-embedded fixed main-narrative Prompt and public settings Prompt preview
```

## 4. External MVP systems

当前共有 13 个外部运行系统：P0 多世界基础 6 个、P1 历史事件账本 1 个、角色与世界既有系统 6 个。运行成员以 `mvp-stages-config.default.json` 为准。

| SystemId | OwnerMOD | Responsibility | NonResponsibility | Inputs | OutputsAndWrites | AI participation | Implementation |
|---|---|---|---|---|---|---|---|
| `world-context-registry` | `mod-world` | Own the save-level directory of world, universe, plane, planet, region and scene contexts, stable context IDs, hierarchy, lifecycle and current context reference | Does not own space edges, canonical time, transition atomicity or narrative commits | World-context factory output and lifecycle requests | `useWorldStore.contexts`, `currentContextId`, read-only registry state | Read-only | `src/mods/mod-world/subsystems/world-context-registry-system.ts`, `src/foundation/subsystem-contracts/world-context.contract.ts` |
| `contextual-capability-profile` | `mod-world` | Own each context's explicit life, space, NPC, economy, politics, technology and supernatural capabilities plus the allowed system combination | Does not register systems, wake dormant contexts or execute deferred simulation packages | Structured `WorldConfig` and confirmed facts | Per-context capability profiles and active/background subsystem ID sets | Read-only; semantic candidates require local confirmation | `src/mods/mod-world/subsystems/contextual-capability-profile-system.ts` |
| `spatial-graph` | `mod-world` | Own context roots, spatial nodes, containment/adjacency edges, cross-context exits and global-entity locations | Does not own map UI, geography, resources or transition commits | Validated spatial events and context initialization | Per-context graphs, global exits and entity locations | Event input only | `src/mods/mod-world/subsystems/spatial-graph-system.ts` |
| `context-transition` | `mod-world` | Preflight and atomically migrate the active context, actor/carried/companion locations, local clocks and source/target scopes; roll back on runtime-context injection failure | Does not author arrival prose, advance global time, or own item/companion business state | Stable actor ID, target context, validated exit and qualifications, canonical total days | Current-context projection, scoped entity locations and append-only transition records | Proposal only; local preflight owns commit | `src/mods/mod-world/subsystems/context-transition-system.ts`, `src/mods/mod-world/world-context-api.ts` |
| `simulation-scope-policy` | `mod-world` | Own `active/background/dormant/closed` scope and synchronize local clocks from canonical time | Does not run P2-P8 background simulation or write canonical time | `RoundContext.totalDays` and explicit local scope requests | Per-context scope and local clock state | Read-only | `src/mods/mod-world/subsystems/simulation-scope-policy-system.ts` |
| `world-init` | `mod-world` | Create one validated world-context instance per call with capability profile, spatial root, local calendar, initialization facts and optional connection to the current context | Does not replace the whole save, create a second time/orchestrator authority, or restore old world-map simulation | User world configuration, world generation cache code and explicit context options | New or intentionally reinitialized `WorldContextInstance` | Proposal; IDs, structure and validation remain local | `src/mods/mod-world/subsystems/world-init-system.ts`, `src/mods/mod-world/world-init-bundle.ts` |
| `historical-event-ledger` | `mod-history-dynamics` | Own the only append-only record of historical events, transitions, evidence, four-state capability-checked candidate audits, explicit causal edges, bounded queries and legacy migration across global, context, travel and cross-context scopes | Does not author narrative prose, infer facts from body text, own delayed-promise scheduling, run topic presets, or expose candidates as occurred facts | Locally validated historical batches, stable context/entity/location references, explicit candidates with optional generic capabilities, causal edges, v1/v2 snapshots | Store v2 full ledger, cached current-relevant collected view, stable event IDs, paginated event/evidence/transition/migration/detail queries and atomic commit results | `event-input`; not in `narrativeChange`, IDs and commit results remain local | `src/foundation/subsystem-contracts/historical-event.contract.ts`, `src/mods/mod-history-dynamics/subsystems/historical-event-ledger-system.ts`, `src/mods/mod-history-dynamics/components/event-candidate-provider.ts`, `src/mods/mod-history-dynamics/components/causal-graph-component.ts`, `src/mods/mod-history-dynamics/historical-event-api.ts`, `src/mods/mod-history-dynamics/store.ts` |
| `character-base` | `mod-character` | Own four base attributes, explicit starting age, and aggregation of destiny, injury, and decay modifiers | Does not own calendar time, maximum lifespan, luck, morality, or narrative phase order | `RoundContext` and provider-owned character modifiers | Character base state and structured attribute changes | Main narrative writable; validates and applies its owned structured changes | `src/mods/mod-character/subsystems/character-base-system.ts` |
| `destiny-pattern` | `mod-character` | Own selected destiny patterns, candidate pool, pattern runtime state, and terminal handling of credential failures during candidate generation | Does not directly own base-attribute state application, main narrative changes, or credential values | Character creation choice, presets, optional AI candidate generation and classified AI errors | Selected pattern state, modifiers, progress, or explicit terminal generation failure exposed to consumers | AI may generate candidates; not in the main narrative writable allowlist | `src/mods/mod-character/subsystems/destiny-pattern-system.ts` |
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
| `orchestrator` | Own ordered simulation phases, current-context filtering, three-layer main narrative assembly, AI calls, visible-body stream projection, tiered commit, branch flow, historical-event preflight/commit, scoped delayed-causality commit, rollback snapshots, and autosave coordination | Does not calculate owning subsystem business rules, switch contexts directly, invent historical IDs or facts, promise that a player choice succeeds, infer missing structured state from prose, or expose protocol/data chunks in the narrative UI | Registered live systems, scoped `RoundContext`, AI configuration, projected Chinese world/character/history views, layered memory, branch choice, unresolved intents, due in-scope causal events, validated structured data, raw AI stream, stores | Engine state, context-tagged narrative history and digest ledger, body-only visible stream, accepted state changes and historical batches, consumer event-ID references, internal narrative-system snapshots and subsystem snapshots | Owns the single main narrative call lifecycle; history is locally translated to `event-input`, while accepted pending facts and related edges enter Prompt through a deterministic read-only projection rather than a new AI write protocol | `src/mods/mod-engine/subsystems/orchestrator-system.ts`, `src/mods/mod-engine/helpers/save-restore.ts`, `src/mods/mod-engine/helpers/narrative-ai-input-view.ts`, `src/mods/mod-engine/helpers/historical-event-prompt-projection.ts` |
| `narrative-parser` | Parse the `正文 -> 摘要 -> 可选数据 -> 结束` Chinese protocol, preserve the independent digest, strictly translate valid data, and expose omitted versus rejected structured data | Does not accept old tagged or English protocols as valid state, infer omitted fields, repair semantic content, decide product meaning, or directly write subsystem state | Raw AI response text and the Chinese response contract | Complete narrative body, digest, explicit data-presence/rejection status, and any fully translated structured bundle | Consumes AI output; whole-line state-machine extraction, string-aware annotation removal, strict Schema validation and translation | `src/mods/mod-engine/subsystems/narrative-parser-system.ts`, `src/mods/mod-engine/helpers/tagged-meta-envelope.ts`, `src/mods/mod-engine/helpers/narrative-ai-protocol.ts` |
| `summary-compressor` | Own the hierarchical summary set, complete-coverage marker and traceable multi-level compression pipeline | Does not silently delete story facts, convert token budgets into semantic character caps, or create placeholder coverage after AI failure | Narrative history, existing summaries, coverage-safe output headroom, AI service when required | Only completed summaries and successful compression statistics; lower leaves remain on failure | Uses AI for semantic summary levels; `[SUMMARY_COMPLETE]` is required before a coverage node may be committed | `src/mods/mod-engine/subsystems/summary-compressor-system.ts`, `src/mods/mod-engine/prompts/summary-prompt.ts` |
| `memory-engine` | Extract and own structured long-term memory from narrative and numeric subsystem state | Does not own never-forget policy or general narrative compression | Narrative text and collected subsystem states | Relationships, status, wealth, locations, and event memory | Consumes AI narrative result; extraction/application is locally owned | `src/mods/mod-engine/subsystems/memory-engine-system.ts` |
| `subsystem-relevance` | Own subsystem relevance scoring, state/change tracking, and Prompt inclusion decisions | Does not delete subsystem state or change system ownership | Collected subsystem states, change history, current round context | Relevance decisions and non-destructive Prompt selection | Supplies context selection to AI; no semantic state write | `src/mods/mod-engine/subsystems/subsystem-relevance-system.ts` |
| `memory-lifecycle` | Own memory tiers, importance, event closure, and coverage-aware Prompt injection | Does not use hard truncation as forgetting or persistence | Memory records, compressed summaries, event lifecycle signals | Layered memory state and Prompt memory context | Prepares context for AI; lifecycle rules remain local and explainable | `src/mods/mod-engine/subsystems/memory-lifecycle-system.ts` |
| `memory-forgetting` | Own explainable forgetting decisions and causal or foreshadowing protection marks | Does not silently destroy uncovered story facts | Memory records, importance, causal marks, current round | Forgetting decisions, protection and resolution state | Local policy; any semantic compression must remain traceable | `src/mods/mod-engine/subsystems/memory-forgetting-system.ts` |
| `causal-delay` | Own delayed narrative-commitment registration, deterministic canonical-day due eligibility, explicit `legacy-round` compatibility, pending/triggered state, and versioned save/preview restoration | Does not pre-author the outcome, convert old round schedules into guessed days, mark an event resolved merely because it entered a Prompt, own world-event causality, write prose, or bypass the orchestrator | Validated AI delayed matters, scope, `createdTotalDays`, optional origin event ID, accepted narrative commit and resolution event ID | Pending events, due-event facts, confirmed triggered events with `originEventId/resolutionEventId`, plus snapshot `schemaVersion: 1`; versioned duplicate IDs reject and unversioned duplicates retain `legacyId` after deterministic migration | AI may register Chinese structured delayed matters; local code schedules by severity days, renders established facts, and confirms only after the complete narrative round and history batch are accepted | `src/mods/mod-engine/subsystems/causal-delay-system.ts`, `src/mods/mod-engine/subsystems/orchestrator-system.ts` |
| `plot-structure` | Own plot stage, tension progression, and deterministic narrative-structure signals | Does not choose player actions or author prose | Round context and narrative semantic signals | Plot-stage state and Prompt constraints | Constrains AI narrative structure | `src/mods/mod-engine/subsystems/plot-structure-system.ts` |
| `foreshadowing` | Own active and resolved foreshadowing records, trigger scoring, and resolution hints | Does not rewrite narrative history or own general memory compression | Structured foreshadowing signals, round context, narrative resolution | Foreshadowing state and Prompt hints | Consumes and supplies structured AI narrative signals | `src/mods/mod-engine/subsystems/foreshadowing-system.ts` |
| `core-memory` | Own never-forget key events, foreshadowing context, and NPC relationship history | Does not replace the general long-term memory engine or summary hierarchy | Narrative events, relationship updates, protected context | Core memory state and Prompt context | Supplies protected context to AI | `src/mods/mod-engine/subsystems/core-memory-system.ts` |

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

Acceptance authority: `docs/playtest-2026-07-18-compression-runtime.md`, `scripts/check/domains/mod/historical-event-p1-smoke.mjs` and `scripts/check/domains/narrative/no-hard-truncation-audit.mjs`.

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
