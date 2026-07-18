# System Authority Index

文档角色：system-index
权威层级：A3
状态：active
体系路径：project > governance > system-index
上级目标：让项目中的运行与延后系统拥有唯一责任、接口、生命周期和验收路由
下级组成：活动权威登记、外部 MVP 系统、引擎 MVP 系统、延后剧情系统
适用范围：MVP 运行子系统、延后但承载剧情事实的系统、状态与写入所有权、AI 参与、持久化和运行存活性
拥有者：`mod-engine` 运行注册与各 owning MOD
最后验证：2026-07-18；对照[运行阶段策略](../src/mods/mod-engine/helpers/mvp-stages-config.default.json)、子系统实现、Prompt/Schema、持久化路径和[硬截断审计](../scripts/check/domains/narrative/no-hard-truncation-audit.mjs)
取代关系：none
运行真源：[mvp-stages-config.default.json](../src/mods/mod-engine/helpers/mvp-stages-config.default.json)、manifest、生成注册表和各实现文件
验收证据：`.agents` 治理检查、引用审计和活动系统覆盖检查

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
- Main narrative AI may write only the IDs in `narrativeChange`; current writable systems are `character-base`, `lifespan`, `luck`, and `morality`.
- Main narrative Prompt `2.9.0` and its Zod/JSON Schema own the semantic META contract, including focused branch-intent resolution. The parser preserves the full raw change array, strict field validation rejects unknown keys, RoundCommit preflights the full bundle, and orchestrator rolls back unexpected partial writes; any failure rejects all META while preserving the narrative body.

### 3.1 AI call observability

```text
SystemId: ai-call-observability
SystemPath: project > simulation-runtime > platform-services > ai-call-observability
ParentGoal: preserve enough secure production evidence to diagnose every AI request and player-visible failure
PrimaryGovernanceParent: core logger plus app AI proxy
ChildSystems: proxy access index, full AI traces, raw upstream errors, client event logs
Authority: A1 current user request; A3 this index; A4 live proxy, client and server log store
RootPosition: R1
Weight: W5
Sequence: S1 request envelope > S2 upstream lifecycle > S3 client-visible result > S4 retention cleanup
Responsibility: correlate and securely retain complete AI request, response, error and client failure evidence
NonResponsibility: does not own Provider credentials, gameplay state, narrative truth, model choice or public log browsing authorization
Inputs: sanitized proxy request envelope, upstream lifecycle, client error events, environment retention policy
OutputsAndWrites: request IDs, access JSONL, full trace JSONL, raw error files and client event files
PublicStateOrAPI: x-ai-request-id response header and requestId error field; no public filesystem access
Dependencies: app proxy, core AI client, core client logger, Node filesystem and deployment environment
Lifecycle: active for every proxy call; cleanup runs opportunistically after writes at a bounded interval
RuntimeLivenessSource: app API route registration and active Next.js server process
AIParticipation: observes Provider traffic only; never authors or applies semantic game state
PersistenceAuthority: AI_LOG_DIR plus server-log-store retention and capacity policy
Implementation: src/app/api/proxy/route.ts; src/app/api/log/route.ts; src/core/logger/server-log-store.ts
AcceptanceEvidence: npm run test:ai-proxy; unreachable-upstream HTTP probe; secret-absence check; delivery gates
LastVerified: 2026-07-18
Supersession: none
```

- `src/app/api/proxy/route.ts` owns one request ID per proxy call and records the complete sanitized request envelope, upstream response or error, status, duration, retry observation and stream terminal state. The request ID is returned to the client for screenshot and server-log correlation.
- `src/core/logger/server-log-store.ts` owns persistent log-root resolution, secret redaction, `0700` directories, `0600` files, per-file rotation, age retention and total-cap cleanup. Production should set `AI_LOG_DIR` outside `/root/ai-life-sim/` so atomic deployments do not move active evidence into version backups; defaults are 30 days and 5 GiB unless environment policy overrides them.
- API keys, Authorization headers, cookies, passwords, token-like credentials and credential-bearing URL query values must never be written. Prompt and response semantics remain otherwise complete so diagnosis does not depend on lossy previews.
- Diagnostic copies are operational evidence, not the authoritative narrative or save-state store. Retention cleanup may delete old diagnostic copies after the configured policy, but it must never delete or truncate gameplay-owned story data.
- The proxy observes repeated fingerprints and retry counts but does not enforce a fixed identical-request rejection, because current AI candidate preparation intentionally continues until its product condition is satisfied or the player leaves.
- Acceptance evidence: `npm run test:ai-proxy`, a local unreachable-upstream HTTP probe confirming the enabled-thinking Schema and request-ID path, secret-absence inspection, TypeScript/lint, structural check and the delivery gate.

## 4. External MVP systems

| SystemId | OwnerMOD | Responsibility | NonResponsibility | Inputs | OutputsAndWrites | AI participation | Implementation |
|---|---|---|---|---|---|---|---|
| `character-base` | `mod-character` | Own four base attributes, explicit starting age, and aggregation of destiny, injury, and decay modifiers | Does not own calendar time, maximum lifespan, luck, morality, or narrative phase order | `RoundContext` and provider-owned character modifiers | Character base state and structured attribute changes | Main narrative writable; validates and applies its owned structured changes | `src/mods/mod-character/subsystems/character-base-system.ts` |
| `destiny-pattern` | `mod-character` | Own selected destiny patterns, candidate pool, and pattern runtime state | Does not directly own base-attribute state application or main narrative changes | Character creation choice, presets, optional AI candidate generation | Selected pattern state and modifiers exposed to consumers | AI may generate candidates; not in the main narrative writable allowlist | `src/mods/mod-character/subsystems/destiny-pattern-system.ts` |
| `lifespan` | `mod-character` | Own maximum lifespan, breakthroughs, and structured lifespan deltas from explicit world and race configuration | Does not own current age, time advancement, or death prose | `RoundContext`, world/race configuration, owned structured changes | Lifespan state and change application | Main narrative writable | `src/mods/mod-character/subsystems/lifespan-system.ts` |
| `luck` | `mod-character` | Own luck value and derived disease, death, event-weight, and ageing modifiers | Does not generate events or own other subsystem state | `RoundContext` and owned structured changes | Luck state, derived modifiers, Prompt formatting | Main narrative writable | `src/mods/mod-character/subsystems/luck-system.ts` |
| `morality` | `mod-character` | Own morality value and apply structured morality deltas | Does not infer morality locally from narrative keywords | `RoundContext` and `morality.delta` | Morality state | Main narrative writable | `src/mods/mod-character/subsystems/morality-system.ts` |
| `world-entity` | `mod-world` | Own generated named countries, factions, noble houses, settlements, and trade routes | Does not own geography, calendar time, or narrative orchestration | World configuration and entity-generation inputs | World entity collections and their collected state | May participate in world initialization; not in the main narrative writable allowlist | `src/mods/mod-world/subsystems/world-entity-system.ts` |

All six external systems persist through their collected state when included in the orchestrator snapshot. Exact restoration support remains owned by each implementation and the save/restore aggregator.

## 5. Engine MVP systems

| SystemId | Responsibility | NonResponsibility | Inputs | OutputsAndWrites | AI participation | Implementation |
|---|---|---|---|---|---|---|
| `time` | Own calendar advancement and canonical `daysPassed` and `totalDays` derivation | Does not own narrative pacing decisions, age business rules, or subsystem formulas | Selected time step and current time state | Canonical round time state | Deterministic local only | `src/mods/mod-engine/subsystems/time-system.ts` |
| `orchestrator` | Own ordered simulation phases, subsystem collection, AI narrative calls, parsing handoff, branch flow, focused intent lifecycle, commit, snapshots, and autosave coordination | Does not calculate owning subsystem business rules, promise that a player choice succeeds, or silently rewrite their state | Registered live systems, `RoundContext`, AI configuration, branch choice, unresolved branch intents, stores | Engine state, phase transitions, narrative history with accepted intent resolutions, unresolved intent snapshots, subsystem snapshots, commits | Owns the single main narrative call lifecycle; AI supplies Schema-validated semantic feasibility and execution results without an extra preflight call | `src/mods/mod-engine/subsystems/orchestrator-system.ts`, `src/mods/mod-engine/helpers/branch-intent-resolution.ts` |
| `narrative-parser` | Parse the AI response envelope into a structured round result with controlled protocol degradation | Does not decide product meaning or directly write subsystem state | Raw AI response text and declared response contract | Parsed narrative and structured change bundle | Consumes AI output; deterministic parsing | `src/mods/mod-engine/subsystems/narrative-parser-system.ts` |
| `summary-compressor` | Own the hierarchical summary set, complete-coverage marker and traceable multi-level compression pipeline | Does not silently delete story facts, convert token budgets into semantic character caps, or create placeholder coverage after AI failure | Narrative history, existing summaries, coverage-safe output headroom, AI service when required | Only completed summaries and successful compression statistics; lower leaves remain on failure | Uses AI for semantic summary levels; `[SUMMARY_COMPLETE]` is required before a coverage node may be committed | `src/mods/mod-engine/subsystems/summary-compressor-system.ts`, `src/mods/mod-engine/prompts/summary-prompt.ts` |
| `memory-engine` | Extract and own structured long-term memory from narrative and numeric subsystem state | Does not own never-forget policy or general narrative compression | Narrative text and collected subsystem states | Relationships, status, wealth, locations, and event memory | Consumes AI narrative result; extraction/application is locally owned | `src/mods/mod-engine/subsystems/memory-engine-system.ts` |
| `subsystem-relevance` | Own subsystem relevance scoring, state/change tracking, and Prompt inclusion decisions | Does not delete subsystem state or change system ownership | Collected subsystem states, change history, current round context | Relevance decisions and non-destructive Prompt selection | Supplies context selection to AI; no semantic state write | `src/mods/mod-engine/subsystems/subsystem-relevance-system.ts` |
| `memory-lifecycle` | Own memory tiers, importance, event closure, and coverage-aware Prompt injection | Does not use hard truncation as forgetting or persistence | Memory records, compressed summaries, event lifecycle signals | Layered memory state and Prompt memory context | Prepares context for AI; lifecycle rules remain local and explainable | `src/mods/mod-engine/subsystems/memory-lifecycle-system.ts` |
| `memory-forgetting` | Own explainable forgetting decisions and causal or foreshadowing protection marks | Does not silently destroy uncovered story facts | Memory records, importance, causal marks, current round | Forgetting decisions, protection and resolution state | Local policy; any semantic compression must remain traceable | `src/mods/mod-engine/subsystems/memory-forgetting-system.ts` |
| `causal-delay` | Own delayed causal-event registration, eligibility, triggering, and resolution state | Does not write the resulting prose or bypass the orchestrator | Major event signals, round and age context | Pending and triggered causal events | Provides causal context to narrative generation | `src/mods/mod-engine/subsystems/causal-delay-system.ts` |
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
