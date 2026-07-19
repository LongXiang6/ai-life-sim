# System Authority Index

文档角色：system-index
权威层级：A3
状态：active
体系路径：project > governance > system-index
上级目标：让项目中的运行与延后系统拥有唯一责任、接口、生命周期和验收路由
下级组成：活动权威登记、外部 MVP 系统、引擎 MVP 系统、延后剧情系统
适用范围：MVP 运行子系统、延后但承载剧情事实的系统、状态与写入所有权、AI 参与、持久化和运行存活性
拥有者：`mod-engine` 运行注册与各 owning MOD
最后验证：2026-07-19；对照[运行阶段策略](../src/mods/mod-engine/helpers/mvp-stages-config.default.json)、子系统实现、Prompt/Schema、生产日志、持久化路径、[中文协议回归](../scripts/check/domains/narrative/narrative-chinese-protocol-regression.mjs)、[托管通道回归](../scripts/check/domains/narrative/managed-ai-default-regression.mjs)和[硬截断审计](../scripts/check/domains/narrative/no-hard-truncation-audit.mjs)
取代关系：none
运行真源：[mvp-stages-config.default.json](../src/mods/mod-engine/helpers/mvp-stages-config.default.json)、manifest、生成注册表和各实现文件
验收证据：`.agents` 治理检查、引用审计、活动系统覆盖检查、[Prompt 4.0 分级中文协议验收](playtest-2026-07-18-prompt-4-tiered-protocol.md)与[a6api 托管主备通道验收](playtest-2026-07-19-managed-ai-a6api.md)

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
| Selected plan, handoff, or prototype recorded by the owning index | A2 | Intended result | Selection, composition, acceptance target, or supersession changes |
| `docs/system-authority-index.md` | A3 | System responsibility and ownership map | System lifecycle, ownership, writes, AI role, persistence, or liveness changes |
| `docs/simulation-rewrite-architecture.md` | A3 | BaseSubsystem and Foundation architecture | Subsystem base contract or cross-domain contract rules change |
| `docs/design-2026-07-07-core-architecture.md` | A3 | Engine and field-contract design supplement | Core/foundation or field ownership changes |
| `src/mods/mod-engine/helpers/mvp-stages-config.default.json` | A4 | Runtime subsystem policy | Active stage or runtime membership changes |
| Manifests, generated registration, public entries, live implementations | A4 | Current executable truth | Code, registration, API, state, or generated wiring changes |
| Regression, gate, browser, playtest, and runtime records | A5 | Acceptance evidence | Expected behavior, reproduction, or validation result changes |
| Superseded plans, proposals, archived snapshots, unselected candidates | A6 | History and alternatives | Preserve explanation only; never present as active instruction |

## 3. Runtime and persistence contract

The current stage is `mvp`.

```text
project
├─ simulation-runtime
│  ├─ platform-services
│  ├─ external-product-systems
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
LastVerified: 2026-07-18
Supersession: none
```

- External subsystem registration is owned by `src/mods/mod-engine/bootstrap/register-subsystems.ts` plus generated MOD importer and alias maps.
- Engine subsystem registration is owned by `src/mods/mod-engine/bootstrap/engine-subsystems.generated.ts`; edit its declarations or generator inputs, not the generated file.
- Runtime membership is owned by `src/mods/mod-engine/helpers/mvp-stages-config.default.json` and its runtime policy.
- Each subsystem owns its private state and `collectState()` representation. The orchestrator owns collection order, application phases, snapshots, and cross-system commit flow.
- Save aggregation and restoration are owned by `src/mods/mod-engine/helpers/save-restore.ts`, `OrchestratorSystem` snapshots, and `src/core/storage/save-manager.ts`. A system must not invent a second persistence owner.
- Main narrative AI may write only the internal IDs in `narrativeChange`; current writable systems are `character-base`, `lifespan`, `luck`, and `morality`. AI-visible input uses only their registered Chinese system and field names; `src/mods/mod-engine/helpers/subsystem-field-registry.ts` owns the one-to-one translation.
- Main narrative Prompt `4.1.0` owns the componentized fixed prefix and the ordered three-message input `全局信息 -> 记忆 -> 本轮引导`. `narrative-prompt-components.ts` compiles low-noise plain text with basic constraints first and one annotated standard example last; `prompt-builder.ts` owns layer order; `narrative-ai-input-view.ts` owns world/character projection; `narrative-ai-protocol.ts` owns the sole successful `⟦正文⟧/⟦摘要⟧/可选⟦数据⟧/⟦结束⟧` protocol and strict translation. Ordinary rounds may commit complete body and digest without structured data; a present data block is accepted or rejected as a whole, while focused intent and forced branch rounds retain conditional data gates. The protocol boundary normalizes model no-op arrays, `命运分支:false`, empty conditional objects, and optional near-synonym enums without inventing semantic state; unknown writable targets and incomplete conditional cores remain rejected. Conditional gates may receive at most two targeted repairs, while the body remains available if the intent result is still pending. RoundCommit preflights every state-change bundle and rolls back unexpected partial writes. The time guidance requires varied scene-first openings and uses the explicit current calendar label when a time anchor is needed instead of repeating generic openings such as “这一年”.

### 3.1 Managed AI default channel

```text
SystemId: managed-ai-default-channel
SystemPath: project > simulation-runtime > platform-services > managed-ai-default-channel
ParentGoal: let players start with a usable free experience while keeping the managed credential server-only and preserving player-owned overrides
PrimaryGovernanceParent: core AI Provider configuration plus app AI proxy and mod-settings
ChildSystems: public managed Provider preset, settings defaults and migration, server credential resolution, credential-terminal propagation, complete SSE transport aggregation, background world initialization routing
Authority: A1 PD-018 and PD-020; A3 this index; A4 live Provider, settings, AI client, candidate generation and proxy implementation
RootPosition: R1
Weight: W5
Sequence: S1 public default selection > S2 server credential resolution > S3 primary request > S4 safe fallback or explicit failure > S5 player override
Responsibility: own the public default Provider, base URL, primary model and internal fallback model; select the environment credential only inside server AI routes; preserve restore-default and custom-override semantics; classify 401/403 as configuration-terminal for consuming candidate loops; adapt long non-stream client calls through complete SSE upstream aggregation and switch models only before any partial result is committed
NonResponsibility: does not expose or persist the managed credential, own third-party billing or credential lifecycle, author gameplay state, or silently redirect managed traffic
Inputs: player settings, optional player API Key, MANAGED_AI_API_KEY environment value, validated proxy request
OutputsAndWrites: fixed managed primary request, same-interface fallback request or explicit configuration/allowlist/credential-terminal error; public settings state contains no managed credential
PublicStateOrAPI: managed Provider metadata; GET /api/proxy returns only configured boolean; POST accepts no client Key for the managed path
Dependencies: deployment environment, src/core/ai-service/provider-config.ts, mod-settings persisted state, app AI proxy
Lifecycle: active for new-user defaults, restore-default, API availability checks and every managed proxy request
RuntimeLivenessSource: app route registration, settings Store hydration and active Next.js server process
AIParticipation: transports model requests only; does not interpret or apply AI semantic output
PersistenceAuthority: player overrides remain in mod-settings browser persistence; managed credential exists only in private local or server environment files
Implementation: src/core/ai-service/provider-config.ts; src/core/ai-service/server-provider-credentials.ts; src/core/ai-service/managed-sse-aggregation.ts; src/core/ai-service/ai-client.ts; src/mods/mod-settings/store.ts; src/mods/mod-settings/components/SettingsTabPresets.tsx; src/mods/mod-character/subsystems/destiny-pattern-system.ts; src/mods/mod-pages/pages/talent-draw/page.tsx; src/mods/mod-world/world-init-bundle.ts; src/app/api/proxy/route.ts; src/app/api/world-init/route.ts
AcceptanceEvidence: npm run test:managed-ai-default; npm run test:ai-proxy; npm run test:destiny-credential-terminal; primary and fallback routing smoke; complete long-narrative proxy and browser round; background world initialization; restore/default/custom tests; secret-absence scan; delivery gates
LastVerified: 2026-07-19
Supersession: none
```

- `src/core/ai-service/provider-config.ts` owns the public `managed` ID, fixed interface, allowed client request model and same-interface server fallback order. These values are not credentials.
- The deployment environment owns the credential value. `src/app/api/proxy/route.ts` and `src/app/api/world-init/route.ts` may select and use it for the fixed managed target, but must never persist, disclose or log it; a player-supplied Key takes precedence for that request.
- `GET /api/proxy` exposes only a boolean configuration state. It must not return the Provider configuration, environment variable value, credential source or any reversible derivative of the Key.
- Editing the interface or model switches the browser state to `custom`. Restore-default clears the browser Key and reselects the public managed configuration without transferring the managed credential to the client.
- Managed long-form requests keep the browser's non-stream response contract but use SSE upstream transport. `managed-sse-aggregation.ts` must preserve every content chunk, require `[DONE]`, reject malformed or incomplete streams, and only then rebuild one complete OpenAI-compatible response. The proxy may retry the backup model after a primary aggregation failure because no content has reached the browser; client-visible streaming may switch only before its first successful response begins, and partial story output must never be joined across models or committed as complete.
- `ai-client.ts` owns status-preserving credential-error classification. `DestinyPatternSystem` keeps the three already-started first-screen calls but aborts remaining work and rejects before any later batch after the first 401/403; the page reuses its selected error region and never clears the player Key automatically.

### 3.2 AI call observability

```text
SystemId: ai-call-observability
SystemPath: project > simulation-runtime > platform-services > ai-call-observability
ParentGoal: preserve enough secure production evidence to diagnose every AI request and player-visible failure
PrimaryGovernanceParent: core logger plus app AI proxy
ChildSystems: proxy access index, full AI traces, raw upstream errors, client event logs, safe HTTP error translation, per-source indexes, operator inspection
Authority: A1 PD-019 and PD-022; A3 this index; A4 live proxy, client and server log store
RootPosition: R1
Weight: W5
Sequence: S1 trusted source classification > S2 request envelope > S3 upstream lifecycle > S4 client-visible result > S5 retention cleanup and inspection
Responsibility: correlate and securely retain complete AI request, response, error and client failure evidence, classify it by server-derived IP, translate player-visible HTTP failures safely, and expose a private read-only inspection path
NonResponsibility: does not own credential values, gameplay state, narrative truth, model choice or public log browsing authorization
Inputs: trusted proxy headers, sanitized proxy request envelope, upstream lifecycle, client error events, environment retention policy
OutputsAndWrites: request IDs, access JSONL, full trace JSONL, raw error files, client event files and per-source indexes
PublicStateOrAPI: x-ai-request-id response header and requestId error field; no public filesystem or log-browsing access
Dependencies: app proxy, core AI client, core client logger, Node filesystem and deployment environment
Lifecycle: active for every proxy call; cleanup runs opportunistically after writes at a bounded interval
RuntimeLivenessSource: app API route registration and active Next.js server process
AIParticipation: observes Provider traffic only; never authors or applies semantic game state
PersistenceAuthority: AI_LOG_DIR plus server-log-store retention and capacity policy
Implementation: src/app/api/proxy/route.ts; src/app/api/log/route.ts; src/app/api/debug-log/route.ts; src/core/ai-service/api-error.ts; src/core/ai-service/story-seed.ts; src/core/logger/server-log-store.ts; src/core/logger/client-logger.ts; src/core/logger/debug-logger.ts; scripts/ops/inspect-ai-logs.mjs
AcceptanceEvidence: docs/playtest-2026-07-19-production-observability-opening.md; npm run test:ai-proxy; source-classification and secret-redaction regression; operator-inspector smoke; unreachable-upstream HTTP probe; secret-absence check; delivery gates
LastVerified: 2026-07-19
Supersession: none
```

- `src/app/api/proxy/route.ts` owns one request ID per proxy call and records the complete sanitized request envelope, upstream response or error, status, duration, retry observation and stream terminal state. The request ID is returned to the client for screenshot and server-log correlation. Every trace event carries the same server-derived source identity.
- `src/core/ai-service/api-error.ts` is the single player-facing HTTP translation authority. It covers explicit 4xx/5xx causes and resolution steps, preserves request IDs, and never copies raw upstream bodies into UI messages. `ai-client.ts` retains the raw body only for sanitized diagnostic logging while exposing the translated Error message to Toasts and page-owned error regions.
- Story seed normalization is enforced on both boundaries: the client omits non-finite or non-numeric values, while the proxy treats cached legacy `seed:null` as absent and leaves every other invalid type to Zod rejection. This prevents `NaN -> JSON null -> 400` without weakening request validation.
- `src/core/logger/server-log-store.ts` owns trusted source extraction, persistent log-root resolution, secret redaction, `0700` directories, `0600` files, per-file rotation, per-source indexes, age retention and total-cap cleanup. Production uses `/var/log/ai-life-sim` through `AI_LOG_DIR`, outside `/root/ai-life-sim/`, so atomic deployments do not move active evidence into version backups; defaults are 30 days and 10 GiB unless environment policy overrides them.
- API keys, Authorization headers, cookies, passwords, token-like credentials and credential-bearing URL query values must never be written. Prompt and response semantics remain otherwise complete so diagnosis does not depend on lossy previews.
- `src/app/api/log/route.ts` enriches client diagnostics with the trusted source and optional AI request ID on the server; request-body fields cannot override the source. `src/app/api/debug-log/route.ts` keeps complete AI-call metadata collection enabled independently of the production-disabled public debug viewer, while its production GET/DELETE paths remain closed. `scripts/ops/inspect-ai-logs.mjs` searches recent failures by IP or request ID and omits full Prompt/response content unless explicitly requested by an authorized operator.
- Diagnostic copies are operational evidence, not the authoritative narrative or save-state store. Retention cleanup may delete old diagnostic copies after the configured policy, but it must never delete or truncate gameplay-owned story data.
- The proxy observes repeated fingerprints and retry counts but does not enforce a fixed identical-request rejection. Candidate preparation normally continues until its product condition is satisfied or the player leaves; 401/403 are the explicit `PD-020` configuration-terminal exception owned by the consuming loop.
- Acceptance evidence: `npm run test:ai-proxy`, the AI error translation and story-seed smoke, a local unreachable-upstream HTTP probe confirming the enabled-thinking Schema and request-ID path, secret-absence inspection, TypeScript/lint, structural check and the delivery gate.

### 3.3 Production release retention

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

## 4. External MVP systems

| SystemId | OwnerMOD | Responsibility | NonResponsibility | Inputs | OutputsAndWrites | AI participation | Implementation |
|---|---|---|---|---|---|---|---|
| `character-base` | `mod-character` | Own four base attributes, explicit starting age, and aggregation of destiny, injury, and decay modifiers | Does not own calendar time, maximum lifespan, luck, morality, or narrative phase order | `RoundContext` and provider-owned character modifiers | Character base state and structured attribute changes | Main narrative writable; validates and applies its owned structured changes | `src/mods/mod-character/subsystems/character-base-system.ts` |
| `destiny-pattern` | `mod-character` | Own selected destiny patterns, candidate pool, pattern runtime state, and terminal handling of credential failures during candidate generation | Does not directly own base-attribute state application, main narrative changes, or credential values | Character creation choice, presets, optional AI candidate generation and classified AI errors | Selected pattern state, modifiers, progress, or explicit terminal generation failure exposed to consumers | AI may generate candidates; not in the main narrative writable allowlist | `src/mods/mod-character/subsystems/destiny-pattern-system.ts` |
| `lifespan` | `mod-character` | Own maximum lifespan, breakthroughs, and structured lifespan deltas from explicit world and race configuration | Does not own current age, time advancement, or death prose | `RoundContext`, world/race configuration, owned structured changes | Lifespan state and change application | Main narrative writable | `src/mods/mod-character/subsystems/lifespan-system.ts` |
| `luck` | `mod-character` | Own luck value and derived disease, death, event-weight, and ageing modifiers | Does not generate events or own other subsystem state | `RoundContext` and owned structured changes | Luck state, derived modifiers, Prompt formatting | Main narrative writable | `src/mods/mod-character/subsystems/luck-system.ts` |
| `morality` | `mod-character` | Own morality value and apply structured morality deltas | Does not infer morality locally from narrative keywords | `RoundContext` and `morality.delta` | Morality state | Main narrative writable | `src/mods/mod-character/subsystems/morality-system.ts` |
| `world-entity` | `mod-world` | Own generated named countries, factions, noble houses, settlements, and trade routes | Does not own geography, calendar time, or narrative orchestration | World configuration and entity-generation inputs | World entity collections and their collected state | May participate in world initialization; not in the main narrative writable allowlist | `src/mods/mod-world/subsystems/world-entity-system.ts` |

All six external systems persist through their collected state when included in the orchestrator snapshot. Exact restoration support remains owned by each implementation and the save/restore aggregator.

## 5. Engine MVP systems

| SystemId | Responsibility | NonResponsibility | Inputs | OutputsAndWrites | AI participation | Implementation |
|---|---|---|---|---|---|---|
| `time` | Own calendar advancement and canonical `daysPassed` and `totalDays` derivation | Does not own narrative pacing decisions, age business rules, or subsystem formulas | Selected time step and current time state | Canonical round time state | Deterministic local only | `src/mods/mod-engine/subsystems/time-system.ts` |
| `orchestrator` | Own ordered simulation phases, subsystem collection, three-layer main narrative assembly, AI calls, visible-body stream projection, tiered commit, branch flow, focused intent lifecycle, delayed-causality commit, snapshots, and autosave coordination | Does not calculate owning subsystem business rules, promise that a player choice succeeds, infer missing structured state from prose, or expose protocol/data chunks in the narrative UI | Registered live systems, `RoundContext`, AI configuration, projected Chinese world/character views, layered memory, branch choice, unresolved branch intents, due causal events, raw AI stream, stores | Engine state, body-only visible stream, phase transitions, narrative history, digest ledger, accepted structured writes and intent results, unresolved intent snapshots, confirmed delayed causality, subsystem snapshots | Owns the single main narrative call lifecycle; ordinary minimum success commits body and digest, while focused intent and forced branch require complete conditional data without an extra preflight call | `src/mods/mod-engine/subsystems/orchestrator-system.ts`, `src/mods/mod-engine/helpers/branch-intent-resolution.ts`, `src/mods/mod-engine/helpers/narrative-ai-input-view.ts` |
| `narrative-parser` | Parse the `正文 -> 摘要 -> 可选数据 -> 结束` Chinese protocol, preserve the independent digest, strictly translate valid data, and expose omitted versus rejected structured data | Does not accept old tagged or English protocols as valid state, infer omitted fields, repair semantic content, decide product meaning, or directly write subsystem state | Raw AI response text and the Chinese response contract | Complete narrative body, digest, explicit data-presence/rejection status, and any fully translated structured bundle | Consumes AI output; whole-line state-machine extraction, string-aware annotation removal, strict Schema validation and translation | `src/mods/mod-engine/subsystems/narrative-parser-system.ts`, `src/mods/mod-engine/helpers/tagged-meta-envelope.ts`, `src/mods/mod-engine/helpers/narrative-ai-protocol.ts` |
| `summary-compressor` | Own the hierarchical summary set, complete-coverage marker and traceable multi-level compression pipeline | Does not silently delete story facts, convert token budgets into semantic character caps, or create placeholder coverage after AI failure | Narrative history, existing summaries, coverage-safe output headroom, AI service when required | Only completed summaries and successful compression statistics; lower leaves remain on failure | Uses AI for semantic summary levels; `[SUMMARY_COMPLETE]` is required before a coverage node may be committed | `src/mods/mod-engine/subsystems/summary-compressor-system.ts`, `src/mods/mod-engine/prompts/summary-prompt.ts` |
| `memory-engine` | Extract and own structured long-term memory from narrative and numeric subsystem state | Does not own never-forget policy or general narrative compression | Narrative text and collected subsystem states | Relationships, status, wealth, locations, and event memory | Consumes AI narrative result; extraction/application is locally owned | `src/mods/mod-engine/subsystems/memory-engine-system.ts` |
| `subsystem-relevance` | Own subsystem relevance scoring, state/change tracking, and Prompt inclusion decisions | Does not delete subsystem state or change system ownership | Collected subsystem states, change history, current round context | Relevance decisions and non-destructive Prompt selection | Supplies context selection to AI; no semantic state write | `src/mods/mod-engine/subsystems/subsystem-relevance-system.ts` |
| `memory-lifecycle` | Own memory tiers, importance, event closure, and coverage-aware Prompt injection | Does not use hard truncation as forgetting or persistence | Memory records, compressed summaries, event lifecycle signals | Layered memory state and Prompt memory context | Prepares context for AI; lifecycle rules remain local and explainable | `src/mods/mod-engine/subsystems/memory-lifecycle-system.ts` |
| `memory-forgetting` | Own explainable forgetting decisions and causal or foreshadowing protection marks | Does not silently destroy uncovered story facts | Memory records, importance, causal marks, current round | Forgetting decisions, protection and resolution state | Local policy; any semantic compression must remain traceable | `src/mods/mod-engine/subsystems/memory-forgetting-system.ts` |
| `causal-delay` | Own delayed causal-event registration, deterministic due eligibility, pending/triggered state, and save/preview restoration | Does not pre-author the outcome, mark an event resolved merely because it entered a Prompt, write prose, or bypass the orchestrator | Validated AI delayed matters, round and age context, accepted narrative commit | Pending events, due-event facts, and confirmed triggered events with traceable result | AI may register Chinese structured delayed matters; local code waits until due, renders compact established facts, and confirms them only after the complete narrative round is accepted | `src/mods/mod-engine/subsystems/causal-delay-system.ts`, `src/mods/mod-engine/subsystems/orchestrator-system.ts` |
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
| History event pool and causal anchors | `mod-history-dynamics` | Owning subsystem state stores pending, triggered and expired event-pool entries plus pending and resolved causal events; frequency rules control capture cadence, not storage capacity | Deferred systems may derive anchors from narrative text or preset event candidates | Triggered and expired entries remain as auditable state instead of being filtered from the sole history array; pending causal anchors have no fixed queue capacity, while cadence rules may still govern new-event creation |
| Culture values, art styles and works | `mod-culture` | Owning subsystem state stores all cultural values, current styles, and notable works | Supplies deferred culture context | Prompt formatting includes all values and works; styles may emerge until the declared world style pool is exhausted, but no fixed count or random array deletion may erase an established style |
| World and character generation Prompts | `mod-world`, `mod-character` | Live PromptTemplate and Zod Schema own generated world tags, entity descriptions, destiny patterns, mythic effects, and race origins | Low-frequency or initialization AI | No semantic character-count or array-count caps; candidate counts, enums, numeric domains, and entity quantity mechanics remain explicit product contracts |

Acceptance authority: `docs/playtest-2026-07-18-compression-runtime.md` plus `scripts/check/domains/narrative/no-hard-truncation-audit.mjs`.

## 7. Change checklist

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
