/**
 * Purpose: Regress approved mobile page structure, wording, and responsive contracts.
 * Owner: quality:ui
 * Responsibility: One source-backed mobile acceptance suite only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { getProjectRoot } from '../../lib/project-root.mjs'

const root = getProjectRoot(import.meta.url)
let failed = 0

function readRel(rel) {
  const target = path.join(root, rel)
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
}

function readCodeDirectory(rel) {
  const directory = path.join(root, rel)
  if (!fs.existsSync(directory)) return ''
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:js|jsx|ts|tsx)$/.test(entry.name))
    .sort((left, right) => left.name.localeCompare(right.name, 'en'))
    .map((entry) => fs.readFileSync(path.join(directory, entry.name), 'utf8'))
    .join('\n')
}

function assertOk(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    failed++
  }
}

function cssRulesForClass(source, className) {
  const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const classPattern = new RegExp(`\\.${escapedClassName}(?![\\w-])(?:\\.[\\w-]+|:(?!:)[\\w-]+(?:\\([^)]*\\))?|\\[[^\\]]+\\])*\\s*$`)
  const rules = []
  const rulePattern = /([^{}]+)\{([^{}]*)\}/g

  for (const match of source.matchAll(rulePattern)) {
    const selector = match[1].trim()
    if (selector.split(',').some((part) => classPattern.test(part.trim()))) {
      rules.push({ selector, body: match[2] })
    }
  }

  return rules
}

function cssDeclarationValues(source, className, property) {
  const escapedProperty = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const declarationPattern = new RegExp(`(?:^|;)\\s*${escapedProperty}\\s*:\\s*([^;]+)`, 'g')
  return cssRulesForClass(source, className).flatMap(({ body }) => (
    [...body.matchAll(declarationPattern)].map((match) => match[1].trim())
  ))
}

function hasCssDeclaration(source, className, property, expectedValue) {
  return cssDeclarationValues(source, className, property).includes(expectedValue)
}

function cssClassAvoidsValue(source, className, property, rejectedValue) {
  return !cssDeclarationValues(source, className, property).includes(rejectedValue)
}

function scaledPx(value) {
  return `calc(${value} * var(--final-flow-density-px))`
}

const welcomePageSrc = readRel('src/mods/mod-pages/pages/welcome/page.tsx')
const welcomeViewSrc = readRel('src/mods/mod-pages/pages/welcome/WelcomeView.tsx')
const welcomeSaveSheetSrc = readRel('src/mods/mod-pages/pages/welcome/WelcomeSaveSheet.tsx')
const welcomeCssSrc = readRel('src/mods/mod-pages/pages/welcome/WelcomeView.module.css')
const welcomeSaveSheetCssSrc = readRel('src/mods/mod-pages/pages/welcome/WelcomeSaveSheet.module.css')
const layoutCssSrc = readRel('src/foundation/tokens/layout.css')
const mobileBaseCssSrc = readRel('src/styles/mobile/base.css')
const settingsModalSrc = readRel('src/mods/mod-settings/components/SettingsModal.tsx')
const settingsModalCssSrc = readRel('src/mods/mod-settings/components/SettingsModal.module.css')
const settingsModelSrc = readRel('src/mods/mod-settings/components/SettingsTabModel.tsx')
const settingsModelCssSrc = readRel('src/mods/mod-settings/components/SettingsTabModel.module.css')
const settingsThemeSrc = readRel('src/mods/mod-settings/components/SettingsTabTheme.tsx')
const settingsStoreSrc = readRel('src/mods/mod-settings/store.ts')
const preferenceEffectsSrc = readRel('src/app/_components/preference-effects.tsx')
const rootLayoutSrc = readRel('src/app/layout.tsx')
const globalCssSrc = readRel('src/app/globals.css')
const flowRunningHeadSrc = readRel('src/mods/mod-ui/components/atoms/FlowRunningHead.tsx')
const flowRunningHeadCssSrc = readRel('src/mods/mod-ui/components/atoms/FlowRunningHead.module.css')
const themeStoreSrc = readRel('src/core/theme/theme-store.ts')
const settingsParamCardSrc = readRel('src/mods/mod-settings/components/SettingsParamCard.tsx')
const settingsPresetsSrc = readRel('src/mods/mod-settings/components/SettingsTabPresets.tsx')
const settingsProfilesSrc = readRel('src/mods/mod-settings/components/SettingsCustomProfiles.tsx')
const deepSeekPresetHandler = settingsPresetsSrc.slice(
  settingsPresetsSrc.indexOf('const handleApplyDeepSeekPreset'),
  settingsPresetsSrc.indexOf('const handleClearKey'),
)
const helpModalSrc = readRel('src/mods/mod-ui/components/organisms/HelpModal.tsx')
const helpFocusTrapSrc = readRel('src/mods/mod-ui/components/organisms/HelpModalFocusTrap.ts')
const helpNavigationSrc = readRel('src/mods/mod-ui/components/organisms/HelpModalNavigation.tsx')
const helpModalCssSrc = readRel('src/mods/mod-ui/components/organisms/HelpModal.module.css')
const helpProjectContentSrc = readRel('src/mods/mod-ui/components/organisms/HelpWorkspaceProjectContent.tsx')
const helpTabsSrc = readRel('src/mods/mod-ui/components/organisms/help-tabs.ts')
const disclaimerModalSrc = readRel('src/mods/mod-ui/components/organisms/DisclaimerModal.tsx')
const disclaimerModalCssSrc = readRel('src/mods/mod-ui/components/organisms/DisclaimerModal.module.css')
const helpModalSurfaceSrc = `${helpModalSrc}\n${helpNavigationSrc}`
const finalFlowScaleRuntimeSrc = readRel('src/mods/mod-ui/components/organisms/FinalFlowScaleRuntime.tsx')
const worldSelectMobileSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectMobile.tsx')
const worldSelectLogicSrc = readCodeDirectory('src/mods/mod-pages/pages/world-select')
const worldSelectStageSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectStage.tsx')
const worldSelectDirectorySrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectDirectory.tsx')
const worldSelectMainGridSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectMainGrid.tsx')
const worldSelectBottomBarSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectBottomBar.tsx')
const worldSelectCustomFormSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectCustomForm.tsx')
const worldSelectCssSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectMobile.module.css')
const bottomActionBarSrc = readRel('src/mods/mod-ui/components/organisms/BottomActionBar.tsx')
const bottomActionBarCssSrc = readRel('src/mods/mod-ui/components/organisms/BottomActionBar.module.css')
const characterCreateMobileSrc = readRel('src/mods/mod-pages/pages/character-create/CharacterCreateMobile.tsx')
const characterCreatePageSrc = readRel('src/mods/mod-pages/pages/character-create/page.tsx')
const characterIdentitySrc = readRel('src/mods/mod-pages/pages/character-create/CharacterIdentitySection.tsx')
const characterCreateLogicSrc = readCodeDirectory('src/mods/mod-pages/pages/character-create')
const characterLifespanSrc = readRel('src/mods/mod-pages/pages/character-create/CharacterLifespanSection.tsx')
const characterBackgroundSrc = readRel('src/mods/mod-pages/pages/character-create/CharacterBackgroundSection.tsx')
const characterBottomBarSrc = readRel('src/mods/mod-pages/pages/character-create/CharacterCreateBottomBar.tsx')
const characterCreateCssSrc = readRel('src/mods/mod-pages/pages/character-create/CharacterCreateMobile.module.css')
const talentDrawPageSrc = readCodeDirectory('src/mods/mod-pages/pages/talent-draw')
const talentDrawCssSrc = readRel('src/mods/mod-pages/pages/talent-draw/TalentDraw.module.css')
const attributeAllocPageSrc = readRel('src/mods/mod-pages/pages/attribute-alloc/page.tsx')
const attributeAllocCssSrc = readRel('src/mods/mod-pages/pages/attribute-alloc/AttributeAlloc.module.css')
const gameStoryPageSrc = readCodeDirectory('src/mods/mod-pages/pages/game-story')
const gameStoryCssSrc = readRel('src/mods/mod-pages/pages/game-story/GameStory.module.css')
const narrativeTimelineSrc = `${readRel('src/mods/mod-ui/components/organisms/NarrativeTimeline.tsx')}\n${readRel('src/mods/mod-ui/components/organisms/NarrativeTimelineEntryView.tsx')}`
const narrativeTimelineCssSrc = readRel('src/mods/mod-ui/components/organisms/NarrativeTimeline.module.css')
const fatePreviewPageSrc = readCodeDirectory('src/mods/mod-pages/pages/fate-preview')
const fatePreviewCssSrc = readRel('src/mods/mod-pages/pages/fate-preview/FatePreview.module.css')
const saveManagerPageSrc = readRel('src/mods/mod-pages/pages/save-manager/page.tsx')
const saveManagerCssSrc = readRel('src/mods/mod-pages/pages/save-manager/save-manager.module.css')
const gameOverPageSrc = readCodeDirectory('src/mods/mod-pages/pages/game-over')
const gameOverRadarSrc = readRel('src/mods/mod-pages/pages/game-over/GameOverRadar.tsx')
const gameOverShareCardSrc = readRel('src/mods/mod-pages/pages/game-over/game-over-share-card.ts')
const gameOverCssSrc = readRel('src/mods/mod-pages/pages/game-over/GameOver.module.css')
const leaderboardPageSrc = readRel('src/mods/mod-pages/pages/leaderboard/page.tsx')
const leaderboardCssSrc = readRel('src/mods/mod-pages/pages/leaderboard/Leaderboard.module.css')
const accountPageSrc = readCodeDirectory('src/mods/mod-pages/pages/account')
const feedbackPageSrc = readRel('src/mods/mod-pages/pages/feedback/page.tsx')
const prototypeLibraryCssSrc = readRel('docs/ui-prototypes/mobile/assets/library.css')
const prototypeIndexSrc = readRel('docs/ui-prototypes/mobile/index.html')
const prototypeMainFlowIndexSrc = readRel('docs/ui-prototypes/mobile/main-flow/index.html')
const prototypeIterationTemplateSrc = readRel('docs/ui-prototypes/mobile/template/iteration.html')
const prototypeRootEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile')).sort()
const prototypeAssetEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/assets')).sort()
const prototypeTemplateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/template')).sort()
const prototypeWelcomeIterationSrc = readRel('docs/ui-prototypes/mobile/welcome/iteration-round-01.html')
const prototypeWelcomeIterationRound02Src = readRel('docs/ui-prototypes/mobile/welcome/iteration-round-02.html')
const prototypeWelcomeIterationRound03Src = readRel('docs/ui-prototypes/mobile/welcome/iteration-round-03.html')
const prototypeWelcomeIterationRound04Src = readRel('docs/ui-prototypes/mobile/welcome/iteration-round-04.html')
const prototypeWelcomeIterationRound05Src = readRel('docs/ui-prototypes/mobile/welcome/iteration-round-05.html')
const prototypeWelcomeIterationRound06Src = readRel('docs/ui-prototypes/mobile/welcome/iteration-round-06.html')
const prototypeWelcomeCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/welcome/candidates')).sort()
const prototypeSaveSheetIterationSrc = readRel('docs/ui-prototypes/mobile/save-sheet/iteration-round-01.html')
const prototypeSaveSheetCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/save-sheet/candidates')).sort()
const prototypeLeaderboardIterationSrc = readRel('docs/ui-prototypes/mobile/leaderboard/iteration-round-01.html')
const prototypeLeaderboardIterationRound02Src = readRel('docs/ui-prototypes/mobile/leaderboard/iteration-round-02.html')
const prototypeLeaderboardIterationRound03Src = readRel('docs/ui-prototypes/mobile/leaderboard/iteration-round-03.html')
const prototypeLeaderboardIterationRound04Src = readRel('docs/ui-prototypes/mobile/leaderboard/iteration-round-04.html')
const prototypeLeaderboardIterationRound05Src = readRel('docs/ui-prototypes/mobile/leaderboard/iteration-round-05.html')
const prototypeLeaderboardCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/leaderboard/candidates')).sort()
const prototypeMailboxIterationSrc = readRel('docs/ui-prototypes/mobile/mailbox/iteration-round-01.html')
const prototypeMailboxIterationRound02Src = readRel('docs/ui-prototypes/mobile/mailbox/iteration-round-02.html')
const prototypeMailboxCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/mailbox/candidates')).sort()
const prototypeSettingsIterationSrc = readRel('docs/ui-prototypes/mobile/settings/iteration-round-01.html')
const prototypeSettingsIterationRound02Src = readRel('docs/ui-prototypes/mobile/settings/iteration-round-02.html')
const prototypeSettingsIterationRound03Src = readRel('docs/ui-prototypes/mobile/settings/iteration-round-03.html')
const prototypeSettingsIterationRound04Src = readRel('docs/ui-prototypes/mobile/settings/iteration-round-04.html')
const prototypeSettingsCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/settings/candidates')).sort()
const prototypeAccountIterationSrc = readRel('docs/ui-prototypes/mobile/account/iteration-round-01.html')
const prototypeAccountIterationRound02Src = readRel('docs/ui-prototypes/mobile/account/iteration-round-02.html')
const prototypeAccountIterationRound03Src = readRel('docs/ui-prototypes/mobile/account/iteration-round-03.html')
const prototypeAccountCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/account/candidates')).sort()
const prototypeWorldSelectIterationSrc = readRel('docs/ui-prototypes/mobile/world-select/iteration-round-01.html')
const prototypeWorldSelectIterationRound02Src = readRel('docs/ui-prototypes/mobile/world-select/iteration-round-02.html')
const prototypeWorldSelectIterationRound03Src = readRel('docs/ui-prototypes/mobile/world-select/iteration-round-03.html')
const prototypeWorldSelectIterationRound04Src = readRel('docs/ui-prototypes/mobile/world-select/iteration-round-04.html')
const prototypeWorldSelectIndexSrc = readRel('docs/ui-prototypes/mobile/world-select/index.html')
const prototypeWorldSelectCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/world-select/candidates')).sort()
const prototypeWorldCustomizeIndexSrc = readRel('docs/ui-prototypes/mobile/world-customize/index.html')
const prototypeCharacterCreateIterationSrc = readRel('docs/ui-prototypes/mobile/character-create/iteration-round-01.html')
const prototypeCharacterCreateIterationRound02Src = readRel('docs/ui-prototypes/mobile/character-create/iteration-round-02.html')
const prototypeCharacterCreateCurrentIterationSrc = readRel('docs/ui-prototypes/mobile/character-create/iteration-round-07.html')
const prototypeCharacterCreateIndexSrc = readRel('docs/ui-prototypes/mobile/character-create/index.html')
const prototypeCharacterCreateCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/character-create/candidates')).sort()
const prototypeTalentDrawIterationSrc = readRel('docs/ui-prototypes/mobile/talent-draw/iteration-round-01.html')
const prototypeTalentDrawIndexSrc = readRel('docs/ui-prototypes/mobile/talent-draw/index.html')
const prototypeTalentDrawCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/talent-draw/candidates')).sort()
const prototypeTalentSelectIterationSrc = readRel('docs/ui-prototypes/mobile/talent-select/iteration-round-01.html')
const prototypeTalentSelectIndexSrc = readRel('docs/ui-prototypes/mobile/talent-select/index.html')
const prototypeTalentSelectCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/talent-select/candidates')).sort()
const prototypeAttributeAllocIterationSrc = readRel('docs/ui-prototypes/mobile/attribute-alloc/iteration-round-01.html')
const prototypeAttributeAllocIndexSrc = readRel('docs/ui-prototypes/mobile/attribute-alloc/index.html')
const prototypeAttributeAllocCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/attribute-alloc/candidates')).sort()
const prototypeFatePreviewIterationSrc = readRel('docs/ui-prototypes/mobile/fate-preview/iteration-round-01.html')
const prototypeFatePreviewIndexSrc = readRel('docs/ui-prototypes/mobile/fate-preview/index.html')
const prototypeFatePreviewCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/fate-preview/candidates')).sort()
const prototypeFatePreviewCurrentCandidateSrc = readRel('docs/ui-prototypes/mobile/fate-preview/candidates/candidate-round-07-02-roomier-head.html')
const prototypeGameStoryIterationSrc = readRel('docs/ui-prototypes/mobile/game-story/iteration-round-01.html')
const prototypeGameStoryIndexSrc = readRel('docs/ui-prototypes/mobile/game-story/index.html')
const prototypeGameStoryCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/game-story/candidates')).sort()
const prototypeGameOverIterationSrc = readRel('docs/ui-prototypes/mobile/game-over/iteration-round-01.html')
const prototypeGameOverIndexSrc = readRel('docs/ui-prototypes/mobile/game-over/index.html')
const prototypeGameOverCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/game-over/candidates')).sort()
const prototypeHelpIterationSrc = readRel('docs/ui-prototypes/mobile/help/iteration-round-01.html')
const prototypeHelpCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/help/candidates')).sort()
const prototypeFeedbackIterationSrc = readRel('docs/ui-prototypes/mobile/feedback/iteration-round-01.html')
const prototypeFeedbackIteration02Src = readRel('docs/ui-prototypes/mobile/feedback/iteration-round-02.html')
const prototypeFeedbackCandidateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/feedback/candidates')).sort()
const pageManifestSrc = readRel('src/mods/mod-pages/manifest.ts')

assertOk(
  [
    ['/new-game/talent-draw', 'talent-draw'],
    ['/new-game/mythic-inheritance', 'talent-draw'],
    ['/new-game/attribute-alloc', 'attribute-alloc'],
    ['/new-game/fate-preview', 'fate-preview'],
    ['/new-game/game-story', 'game-story'],
    ['/new-game/game-over', 'game-over'],
  ].every(([path, page]) => new RegExp(`\\{ path: '${path}', page: '${page}' \\}`).test(pageManifestSrc)),
  'the runtime must register the solution-library /new-game aliases for every linked creation and narrative page',
)

assertOk(
  characterCreatePageSrc.includes("router.replace('/new-game/world-select')")
    && talentDrawPageSrc.includes("router.replace('/new-game/character-create')")
    && talentDrawPageSrc.includes('useCreationStoresHydrated()'),
  'creation routes must redirect to the nearest missing prerequisite after persisted stores hydrate',
)
assertOk(
  attributeAllocPageSrc.includes('const TOTAL_POINTS = 4')
    && attributeAllocPageSrc.includes('const effectiveValue = value + bonus')
    && attributeAllocPageSrc.includes('nextUsedPoints > TOTAL_POINTS')
    && !attributeAllocPageSrc.includes('const MAX_VALUE = 10')
    && !attributeAllocPageSrc.includes('const MIN_VALUE = 0')
    && attributeAllocPageSrc.includes('setCharacterBase({')
    && attributeAllocPageSrc.includes("router.push('/fate-preview')"),
  'the creation flow must expose the confirmed four-point allocation with unbounded per-attribute values and effective-value display',
)
assertOk(welcomePageSrc.includes("import WelcomeView from './WelcomeView'"), 'welcome page must use the single responsive WelcomeView')
assertOk(!welcomePageSrc.includes('useIsMobile'), 'welcome page must not switch desktop/mobile DOM after hydration')
assertOk(welcomePageSrc.includes('<WelcomeView'), 'welcome page must render WelcomeView exactly once')
assertOk(welcomeViewSrc.includes('🎮 人生模拟器 ✨'), 'welcome title must identify the life simulator with decorative emoji')
assertOk(welcomeViewSrc.includes('选择世界与角色。'), 'welcome introduction must use the approved short copy from the selected RF4 refinement')
assertOk(welcomeViewSrc.includes('开始新人生'), 'welcome primary action must use the approved T2 label')
assertOk(!welcomeViewSrc.includes('styles.trajectory'), 'welcome must not reintroduce the retired decorative trajectory ornament')
assertOk(/hasAnySave\s*&&\s*\(/.test(welcomeViewSrc), 'continue action must only appear when a local or cloud save exists')
assertOk(
  welcomePageSrc.includes("useGlobalStore((state) => state.allModsLoaded)")
    && welcomePageSrc.includes('runtimeReady={runtimeReady}')
    && welcomeViewSrc.includes('runtimeReady: boolean')
    && welcomeViewSrc.includes('runtimeReady={runtimeReady}')
    && welcomeSaveSheetSrc.includes('disabled={!runtimeReady}')
    && welcomeSaveSheetSrc.includes('disabled={!selectedSave || !runtimeReady || isContinuing}'),
  'welcome local and cloud continue actions must stay disabled until the shared runtime-ready state is true',
)
assertOk(
  welcomeViewSrc.includes('onDeleteSave={onDeleteSave}')
    && welcomeViewSrc.includes('onDeleteCloudSave={onDeleteCloudSave}')
    && welcomeSaveSheetSrc.includes('删除这段人生？')
    && welcomeSaveSheetSrc.includes('role="alertdialog"')
    && welcomeSaveSheetSrc.includes('确认删除')
    && welcomeSaveSheetSrc.includes('onDeleteCloudSave()')
    && welcomeSaveSheetSrc.includes('onDeleteSave(deleteTarget.save.slot)')
    && welcomeSaveSheetCssSrc.includes('.deleteDialogOverlay')
    && welcomeSaveSheetCssSrc.includes('.deleteConfirm'),
  'welcome local and cloud save selection must expose destructive deletion with an explicit second-confirmation dialog',
)
assertOk(welcomeViewSrc.includes('🌱 开始新人生') && welcomeViewSrc.includes('⚙️ 设置') && welcomeViewSrc.includes('📜 游戏说明'), 'welcome actions must use the finalized semantic emoji labels')
assertOk(
  welcomePageSrc.includes('flow-responsive-viewport')
    && welcomePageSrc.includes('flow-responsive-layout')
    && !welcomePageSrc.includes('final-flow-design-fit'),
  'welcome must use the shared native viewport layout without a fixed-size design canvas',
)
assertOk(
  flowRunningHeadSrc.includes('data-flow-running-head')
    && flowRunningHeadSrc.includes('AI LIFE SIM')
    && flowRunningHeadSrc.includes('人生模拟器 · 命书')
    && hasCssDeclaration(flowRunningHeadCssSrc, 'root', 'min-height', '62px')
    && hasCssDeclaration(flowRunningHeadCssSrc, 'root', 'gap', '18px')
    && hasCssDeclaration(flowRunningHeadCssSrc, 'root', 'color', 'var(--flow-muted)')
    && flowRunningHeadCssSrc.includes('min-height: 54px'),
  'the finalized running head must have one shared responsive 62px desktop / 54px mobile presentation contract',
)
assertOk(
  [
    welcomeViewSrc,
    worldSelectMobileSrc,
    characterCreateMobileSrc,
    talentDrawPageSrc,
    attributeAllocPageSrc,
    fatePreviewPageSrc,
    gameOverPageSrc,
    leaderboardPageSrc,
    helpModalSrc,
  ].every((source) => source.includes('<FlowRunningHead')),
  'finalized flow, settlement, leaderboard, and help surfaces must use the shared running head',
)
assertOk(
  !/\.runningHead\s*\{/.test(welcomeCssSrc)
    && !/\.runningHead\s*\{/.test(worldSelectCssSrc)
    && !/\.runningHead\s*\{/.test(characterCreateCssSrc)
    && !/\.runningHead\s*\{/.test(talentDrawCssSrc)
    && !/\.runningHead\s*\{/.test(attributeAllocCssSrc)
    && !/\.runningHead\s*\{/.test(fatePreviewCssSrc)
    && !/\.runningHead\s*\{/.test(gameOverCssSrc)
    && !/\.meta\s*\{/.test(worldSelectCssSrc)
    && !/\.meta\s*\{/.test(leaderboardCssSrc)
    && !/\.metaRow\s*\{/.test(helpModalCssSrc),
  'target surfaces must not retain page-local running-head implementations',
)

assertOk(settingsModalSrc.includes('⚙️ 设置') && settingsModalSrc.includes('📖 阅读与界面') && settingsModalSrc.includes('🔌 模型与调用'), 'finalized settings title and tabs must retain their semantic emoji labels')
assertOk(settingsModalSrc.includes('role="tablist"'), 'settings navigation must expose a tablist')
assertOk(settingsModalSrc.includes('role="tab"') && settingsModalSrc.includes('aria-selected='), 'settings tabs must expose selected state')
assertOk(
  settingsModalSrc.includes("event.key === 'ArrowRight'")
    && settingsModalSrc.includes('tabIndex={activeTab === tab.id ? 0 : -1}'),
  'settings tabs must use the approved roving focus and arrow-key model',
)
assertOk(
  settingsModalSrc.includes('ref={tabBarRef}')
    && settingsModalSrc.includes("scrollIntoView({")
    && settingsModalSrc.includes("inline: 'center'"),
  'settings tab changes must keep the active tab visible after selection',
)
assertOk(
  /\.tabBar\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\);/s.test(settingsModalCssSrc)
    && /@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.tabBar\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/s.test(settingsModalCssSrc)
    && !settingsModalCssSrc.includes('overflow-x: auto'),
  'settings tabs must keep all four categories discoverable on desktop and mobile',
)
assertOk(settingsModalCssSrc.includes('min-height: 44px') && settingsModalCssSrc.includes('white-space: normal'), 'settings tabs must keep readable wrapped labels')
assertOk(/\.tabActive\s*\{[^}]*border-bottom-color:\s*(?:#977026|var\(--flow-accent\)|var\(--color-border-focus\));[^}]*color:\s*(?:#241f18|var\(--flow-ink\));/s.test(settingsModalCssSrc), 'active settings tab must use the finalized warm-paper underline treatment')
assertOk(
  settingsModalSrc.includes('flow-responsive-viewport')
    && settingsModalSrc.includes('flow-responsive-layout')
    && !settingsModalSrc.includes('final-flow-design-fit'),
  'mobile settings must use the shared native viewport layout without canvas scaling',
)
assertOk(settingsModalSrc.includes('<footer className={styles.footer}>') && settingsModalSrc.includes('<strong>返回上一页</strong>') && settingsModalSrc.includes('<strong>完成</strong>'), 'settings modal must use the finalized two-action footer')
assertOk(
  disclaimerModalSrc.includes('role="dialog"')
    && disclaimerModalSrc.includes('aria-modal="true"')
    && disclaimerModalSrc.includes("event.key !== 'Tab'"),
  'the blocking disclaimer dialog must move and contain keyboard focus',
)
assertOk(
  settingsThemeSrc.includes('THEME_OPTIONS')
    && settingsThemeSrc.includes('阅读主题')
    && settingsThemeSrc.includes('暗夜主题')
    && settingsThemeSrc.includes('白色主题')
    && themeStoreSrc.includes("export type ThemeType = 'reading' | 'night' | 'white'")
    && themeStoreSrc.includes("themes: THEME_TYPES"),
  'settings must expose the three approved themes through the core theme store',
)
assertOk(settingsModalCssSrc.includes('.footerButton') && settingsModalCssSrc.includes(`min-height: ${scaledPx(38.333)}`), 'settings footer controls must use the finalized shared density')
assertOk(settingsModelSrc.includes('styles.sectionLabel') && settingsModelSrc.includes('styles.sectionCard'), 'model settings must use independent section labels and cards')
assertOk(settingsModelCssSrc.includes('.sectionLabel') && settingsModelCssSrc.includes('.sectionCard'), 'model settings section hierarchy must be styled explicitly')
assertOk(
  settingsModelSrc.includes('toggleable={false}')
    && settingsModelSrc.includes('activeLabel="始终生效"')
    && settingsParamCardSrc.includes('toggleable && ('),
  'temperature must remain visibly active without a forgetful local enable switch',
)
assertOk(
  !settingsModelSrc.includes('Top P（核采样）')
    && !settingsModelSrc.includes('最大 Token 数')
    && !settingsModelSrc.includes('保存参数')
    && settingsModalSrc.includes('已有调整 · 即时生效'),
  'model settings must not present unused sampling controls or a fake save action',
)
assertOk(
  settingsModalSrc.includes('className={styles.settingsTools}')
    && settingsModalSrc.includes('恢复默认')
    && settingsModalSrc.includes('disabled={allSettingsAreDefault}')
    && settingsModalCssSrc.includes('.restoreAction'),
  'approved settings must keep the global restore-default action visible above every tab panel',
)
assertOk(
  settingsThemeSrc.includes('段落舒展')
    && settingsThemeSrc.includes('减少动态效果')
    && settingsThemeSrc.includes('role="switch"')
    && settingsStoreSrc.includes('comfortableParagraphs: true')
    && settingsStoreSrc.includes('reduceMotion: false'),
  'personal settings must expose the approved paragraph-comfort and reduced-motion switches with prototype defaults',
)
assertOk(
  preferenceEffectsSrc.includes('dataset.paragraphComfort')
    && preferenceEffectsSrc.includes('dataset.reduceMotion')
    && globalCssSrc.includes("html[data-reduce-motion='true']")
    && narrativeTimelineCssSrc.includes('var(--narrative-line-height, 1.87)')
    && narrativeTimelineCssSrc.includes('var(--narrative-paragraph-gap, 0.4375rem)'),
  'approved presentation preferences must update actual narrative spacing and motion behavior',
)
assertOk(
  settingsModelSrc.includes('预生成下一轮')
    && settingsModelSrc.includes('preGenerateRounds === 1')
    && settingsModelSrc.includes('setPreGenerateRounds(preGenerationEnabled ? 0 : 1)')
    && settingsModelSrc.includes('当前故事与两次并行后调用全部完成后')
    && !settingsModelSrc.includes('预生成下一轮（已停用）')
    && !settingsModelSrc.includes('下一轮预生成已停用'),
  'settings must expose the persisted next-round pre-generation switch and describe its post-call timing',
)
assertOk(
  settingsPresetsSrc.includes('setProvider(DEFAULT_AI_PROVIDER_ID)')
    && settingsPresetsSrc.includes('setCustomUrl(event.target.value)')
    && settingsPresetsSrc.includes('setCustomModel(event.target.value)')
    && settingsPresetsSrc.includes('apiKey: customKey.trim()'),
  'API fields must route real narrative calls through the player-owned provider and credentials',
)
assertOk(
  settingsPresetsSrc.includes('填入 DeepSeek 预设')
    && settingsPresetsSrc.includes('DEEPSEEK_PRESET_BASE_URL')
    && settingsPresetsSrc.includes('DEEPSEEK_PRESET_MODEL')
    && settingsPresetsSrc.includes('预设按钮不会覆盖已经输入的 Key')
    && !deepSeekPresetHandler.includes('setCustomKey('),
  'DeepSeek preset fill must only replace URL and model while preserving the player key',
)
assertOk(
  !settingsPresetsSrc.includes('免费体验')
    && !settingsPresetsSrc.includes('预设模型')
    && !settingsPresetsSrc.includes('vendorGrid')
    && !settingsModelSrc.includes('生成档位')
    && !settingsModelSrc.includes('GENERATION_PRESETS'),
  'model settings must not expose free providers, vendor grids, or generation presets',
)
assertOk(
  settingsProfilesSrc.includes('保存配置')
    && settingsPresetsSrc.includes('修改后自动保存')
    && settingsPresetsSrc.includes('测试连接'),
  'API model settings must support named local profiles while keeping connectivity testing as a real action',
)

assertOk(!helpModalSrc.includes('useIsMobile'), 'help modal must use one responsive DOM without viewport branching')
assertOk(helpModalSrc.includes("import styles from './HelpModal.module.css'"), 'help modal must use one responsive CSS module')
assertOk(helpModalSrc.includes('ApprovedHelpGuide') && helpModalSrc.includes('styles.chapter') && helpModalSrc.includes('05 / 故事'), 'help docs must expose the finalized five chapter-card guide')
assertOk(helpModalSrc.includes('<footer className={styles.footer}>') && helpModalSrc.includes('<strong>返回上一页</strong>') && helpModalSrc.includes('<strong>完成</strong>'), 'help modal must use the finalized two-action footer')
assertOk(helpModalSurfaceSrc.includes('role="tablist"') && helpModalSurfaceSrc.includes('aria-selected='), 'help tabs must expose semantic selected state')
assertOk(helpModalSrc.includes('useHelpModalFocusTrap') && helpModalSrc.includes('tabIndex={-1}') && helpFocusTrapSrc.includes("document.addEventListener('keydown'") && helpFocusTrapSrc.includes("event.key === 'Escape'"), 'help modal must trap focus, close globally on Escape, and restore focus')
assertOk(helpModalSrc.includes('<h2 className={styles.headerTitle}>游戏说明</h2>') && helpModalSrc.includes('沿章节阅读，也可快速定位当前需要的功能。'), 'help header must use the finalized title and copy')
assertOk(
  helpTabsSrc.indexOf("{ id: 'docs', label: '说明' }") < helpTabsSrc.indexOf("{ id: 'changelog', label: '更新日志' }")
    && helpTabsSrc.indexOf("{ id: 'changelog', label: '更新日志' }") < helpTabsSrc.indexOf("{ id: 'qq-bot', label: 'QQ群机器人' }")
    && helpTabsSrc.includes("{ id: 'factorio-localizer', label: 'FACTORIO模组汉化器' }")
    && helpTabsSrc.includes("{ id: 'novelist-sim', label: '小说模拟器' }")
    && helpTabsSrc.includes("{ id: 'wechat-advisor', label: '微信聊天军师' }"),
  'help tabs must keep docs and changelog first, followed by the four workspace project guides',
)
assertOk(
  helpNavigationSrc.includes('HELP_TABS.map')
    && helpProjectContentSrc.includes("'qq-bot':")
    && helpProjectContentSrc.includes("'factorio-localizer':")
    && helpProjectContentSrc.includes("'novelist-sim':")
    && helpProjectContentSrc.includes("'wechat-advisor':"),
  'help navigation must render the shared six-tab contract and every project tab must own static guide content',
)
assertOk(
  hasCssDeclaration(helpModalCssSrc, 'tabBar', 'overflow-x', 'auto')
    && hasCssDeclaration(helpModalCssSrc, 'tab', 'white-space', 'nowrap')
    && helpModalCssSrc.includes('.tabBar::-webkit-scrollbar'),
  'help six-tab navigation must remain horizontally scrollable without wrapping on narrow viewports',
)
assertOk(helpModalSrc.includes('<small>退出说明页</small>') && helpModalSrc.includes('<small>返回欢迎界面</small>'), 'help footer must use the finalized return copy')
assertOk(helpModalCssSrc.includes('.footerButton') && helpModalCssSrc.includes(`min-height: ${scaledPx(38.333)}`), 'help footer controls must keep the finalized hierarchy at 1.2x density')
assertOk(
  helpModalSrc.includes('flow-responsive-viewport')
    && helpModalSrc.includes('flow-responsive-layout')
    && !helpModalSrc.includes('final-flow-design-fit'),
  'mobile help must use the shared native viewport layout without canvas scaling',
)
assertOk(helpModalSrc.trimEnd().split('\n').length <= 280, 'help modal component must stay at or below the 280-line UI limit')

assertOk(!worldSelectMobileSrc.includes('BottomActionBar'), 'WF2 world select must use its compact page-specific bottom bar')
assertOk(worldSelectMobileSrc.includes('<WorldSelectStage') && worldSelectMobileSrc.includes('<WorldSelectDirectory'), 'WF2 world select must compose the approved stage and independent directory')
assertOk(worldSelectMobileSrc.includes('role="tablist"') && worldSelectMobileSrc.includes('role="tab"') && worldSelectMobileSrc.includes('aria-selected=') && worldSelectMobileSrc.includes('role="tabpanel"'), 'world source switching must preserve the approved tab and panel semantics')
assertOk(
  worldSelectLogicSrc.includes('resolveRestoredWorld(existingWorldConfig, existingWorldCode, custom.savedWorlds)')
    && worldSelectLogicSrc.includes('const selectedWorld = selectedWorldOverride ?? restoredWorld ?? PRESET_WORLDS[0] ?? null')
    && worldSelectLogicSrc.includes("useWorldSelectForm(existingWorldConfig?.difficulty ?? 'normal')"),
  'returning from character creation must restore the completed world selection and difficulty',
)
assertOk(worldSelectStageSrc.includes('styles.stageIcon') && worldSelectStageSrc.includes('styles.stageQuote') && worldSelectStageSrc.includes('world.summary || world.description'), 'world focus stage must use the finalized icon, title, quote, and era composition')
assertOk(
  worldSelectStageSrc.includes('difficultyButton')
    && worldSelectStageSrc.includes('difficultyEmoji')
    && worldSelectStageSrc.includes('人生基调')
    && worldSelectStageSrc.includes('challengeLabel')
    && worldSelectStageSrc.includes('type="button"')
    && worldSelectStageSrc.includes('onClick={logic.handleCycleDifficulty}')
    && !worldSelectStageSrc.includes('role="button"'),
  'difficulty controls must use the finalized circular native cycle button inside the world-focus stage card',
)
assertOk(
  worldSelectMobileSrc.indexOf("['preset', '预设世界']") < worldSelectMobileSrc.indexOf("['saved', '已保存']")
    && worldSelectMobileSrc.indexOf("['saved', '已保存']") < worldSelectMobileSrc.indexOf("['custom', '自定义']")
    && worldSelectMobileSrc.includes('role="tablist"'),
  'world directory must expose the finalized preset/saved/custom tab order',
)
assertOk(
  !worldSelectBottomBarSrc.includes('logic.difficultyItems')
    && worldSelectBottomBarSrc.includes('onBack={logic.handleBack}')
    && worldSelectBottomBarSrc.includes('onConfirm={logic.handleConfirm}')
    && worldSelectBottomBarSrc.includes('confirmDisabled={!logic.selectedWorld || logic.isConfirming}')
    && bottomActionBarSrc.includes('onClick={onBack}')
    && bottomActionBarSrc.includes('disabled={backDisabled}')
    && bottomActionBarSrc.includes('disabled={confirmDisabled}'),
  'WF2 compact bottom bar must keep back/confirm actions and disabled confirmation semantics',
)
assertOk(
  bottomActionBarCssSrc.includes('min-height: 48px')
    && bottomActionBarCssSrc.includes('border-radius: 6px')
    && bottomActionBarCssSrc.includes('position: absolute'),
  'world selection bottom bar must use the finalized anchored command-band hierarchy',
)
assertOk(
  worldSelectMobileSrc.includes('flow-responsive-viewport')
    && worldSelectMobileSrc.includes('flow-responsive-layout')
    && bottomActionBarSrc.includes('data-flow-bottom-bar'),
  'WF2 world select must use the native responsive viewport with a shared viewport-anchored bottom bar',
)
assertOk(
  worldSelectMainGridSrc.includes('handleRequestClearWorldCache')
    && worldSelectDirectorySrc.includes('handleRequestClearWorldCache')
    && worldSelectLogicSrc.includes('useWorldSelectCache')
    && worldSelectCssSrc.includes('cacheButton')
    && worldSelectMobileSrc.includes('WorldSelectCacheResetDialog')
    && !fs.existsSync(path.join(root, 'src/mods/mod-world/utils/world-generated-cache.ts'))
    && fs.existsSync(path.join(root, 'src/mods/mod-pages/pages/world-select/WorldSelectCacheResetDialog.tsx')),
  'world selection must expose only the current per-world cache reset controls',
)
assertOk(!bottomActionBarSrc.includes('confirmArrow') && bottomActionBarSrc.includes('styles.actionCopy'), 'finalized bottom actions must use two-line text without a trailing arrow glyph')
assertOk(worldSelectMobileSrc.trimEnd().split('\n').length <= 200, 'world select mobile composer must stay at or below the 200-line UI limit')

assertOk(!characterCreateMobileSrc.includes('BottomActionBar'), 'N2A character create must use its page-specific edge-aligned bottom bar')
assertOk(characterCreateMobileSrc.includes('<CharacterIdentitySection') && characterCreateMobileSrc.includes('<CharacterLifespanSection') && characterCreateMobileSrc.includes('<CharacterBackgroundSection'), 'N2A character create must compose identity, lifespan, and background sections')
assertOk(
  characterCreateMobileSrc.includes('className={styles.flowSections}')
    && characterCreateMobileSrc.indexOf('<CharacterIdentitySection') < characterCreateMobileSrc.indexOf('<CharacterLifespanSection')
    && characterCreateMobileSrc.indexOf('<CharacterLifespanSection') < characterCreateMobileSrc.indexOf('<CharacterBackgroundSection')
    && !characterCreateMobileSrc.includes('role="tablist"')
    && !characterCreateMobileSrc.includes('hidden={activePanel'),
  'character creation must show identity, lifespan and background as the approved continuous vertical flow',
)
assertOk(characterIdentitySrc.includes('角色姓名') && characterIdentitySrc.includes('性别') && characterIdentitySrc.includes('种族'), 'N2A identity section must preserve all three core identity groups')
assertOk(
  characterIdentitySrc.includes('必填 · 可随机')
    && characterIdentitySrc.includes('styles.moreLink')
    && !characterIdentitySrc.includes('01 / 03 · 姓名、性别与种族')
    && !characterIdentitySrc.includes('姓名留空将自动生成')
    && !characterIdentitySrc.includes('可选 · 可随机'),
  'character identity must keep the required-name contract inside the finalized uncluttered section heading',
)
assertOk(characterIdentitySrc.includes('styles.softGroup') && !characterIdentitySrc.includes('divider'), 'N2A identity groups must use same-tone soft grouping without divider lines')
assertOk(!characterCreateMobileSrc.includes('已填写背景') && characterCreateMobileSrc.includes('📜</span>'), 'character summary must use the finalized compact identity projection without a background completion badge')
assertOk(characterBottomBarSrc.includes('<BottomActionBar') && characterBottomBarSrc.includes('onBack={logic.handleBack}') && characterBottomBarSrc.includes('onConfirm={logic.handleNext}'), 'N2A bottom bar must delegate back and confirm actions to the unified creation-flow control')
assertOk(
  bottomActionBarCssSrc.includes('.backButton')
    && bottomActionBarCssSrc.includes('.confirmButton')
    && bottomActionBarCssSrc.includes('min-height: 48px'),
  'N2A bottom buttons must share the approved creation-flow control height',
)
assertOk(bottomActionBarCssSrc.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'), 'N2A bottom actions must remain equal-width')
assertOk(
  bottomActionBarCssSrc.includes('min-height: 48px')
    && bottomActionBarCssSrc.includes('border-radius: 6px'),
  'N2A mobile CSS must keep the finalized command-band button treatment',
)
assertOk(
  characterCreateLogicSrc.includes('const manualStartingAge = storedManualStartingAge')
    && characterCreateLogicSrc.includes('const parsedStartingAge = input.manualStartingAge')
    && characterCreateLogicSrc.includes('Number.parseInt(input.manualStartingAge, 10)')
    && characterCreateLogicSrc.includes('previewStartingAge: ageSetupPreview.startingAge')
    && characterCreateLogicSrc.includes('起始年龄必须小于预期寿命')
    && characterLifespanSrc.includes("logic.previewStartingAge === 0 ? '初生'")
    && characterLifespanSrc.includes('className={styles.lifeSentence}')
    && characterBottomBarSrc.includes('confirmDisabled={!logic.canProceed}'),
  'character lifespan must retain an empty birth-age input, preview edits immediately, and block an age at or beyond the lifespan',
)
assertOk(characterCreateMobileSrc.trimEnd().split('\n').length <= 200, 'character create mobile composer must stay at or below the 200-line UI limit')
assertOk(worldSelectMobileSrc.includes('<FlowRunningHead stepLabel="01 / 07" />') && worldSelectBottomBarSrc.includes('confirmNumber="02"') && worldSelectBottomBarSrc.includes('下一步角色配置'), 'world selection must advance directly to character creation as step 02')
assertOk(characterCreateMobileSrc.includes('<FlowRunningHead stepLabel="02 / 07" />') && characterBottomBarSrc.includes('confirmNumber="03"') && !characterCreateMobileSrc.includes('CharacterCustomOptionsSection') && !characterCreateLogicSrc.includes('festivalScope'), 'character creation must advance as step 02 without a festival custom option')
assertOk(talentDrawPageSrc.includes("<FlowRunningHead stepLabel={`${phase === 'selecting' ? '04' : '03'} / 07`} />") && talentDrawPageSrc.includes("phase === 'selecting' ? '05' : '04'"), 'talent draw and selection must occupy creation steps 03 and 04 before final review')
assertOk(
  !talentDrawPageSrc.includes('CREATION FLOW ·')
    && !talentDrawPageSrc.includes('styles.titleMark')
    && talentDrawPageSrc.includes('styles.titleCopy'),
  'talent draw header must use the unified title block without a visible title mark',
)
assertOk(
  !talentDrawPageSrc.includes('TalentAstrolabe')
    && talentDrawPageSrc.includes('className={styles.aura}')
    && talentDrawPageSrc.includes('<b>命</b>')
    && talentDrawPageSrc.includes('className={styles.seals}')
    && talentDrawPageSrc.includes('aria-label="五类首批命印"'),
  'runtime talent draw must use the selected aura and twenty five-category seals instead of the retired astrolabe',
)
assertOk(
  !talentDrawPageSrc.includes('progressTrack')
    && !talentDrawPageSrc.includes('progressFill')
    && !talentDrawCssSrc.includes('.progressTrack')
    && !talentDrawCssSrc.includes('.progressFill'),
  'TD-RF17-1 must use only the phase/count readout without an added progress bar',
)
assertOk(
  !/window\.setInterval\([\s\S]*?4000\s*\)/.test(talentDrawPageSrc)
    && !talentDrawPageSrc.includes('handleTurnAstrolabe')
    && /const\s+handleCandidateClick[\s\S]{0,220}toggleEntry\(\{ kind: 'destiny'/.test(talentDrawPageSrc)
    && !talentDrawPageSrc.includes('持续轮转')
    && talentDrawPageSrc.includes('DESTINY_PATTERN_CATEGORY_ORDER.every((category) => (')
    && talentDrawPageSrc.includes('DESTINY_PATTERN_CATEGORY_INITIAL_COUNT')
    && !talentDrawPageSrc.includes('可先进入选择'),
  'talent draw must reveal real progress and wait for the complete five-category batch before handoff',
)
assertOk(
  talentDrawPageSrc.includes('function createLoadoutSlots')
    && talentDrawPageSrc.includes('Array.from({ length: PATTERN_LOADOUT_SLOT_COUNT')
    && talentDrawPageSrc.includes('resolvedLoadoutSlots.map(')
    && talentDrawPageSrc.includes('setLoadoutSlots((current) => current.map(')
    && talentDrawPageSrc.includes('index === slotIndex ? null : item'),
  'the selection stage must keep four position-stable shared loadout slots and clear a removed entry in place',
)

assertOk(
  hasCssDeclaration(talentDrawCssSrc, 'aura', 'width', scaledPx(220))
    && hasCssDeclaration(talentDrawCssSrc, 'aura', 'height', scaledPx(220))
    && hasCssDeclaration(talentDrawCssSrc, 'seals', 'grid-template-columns', 'repeat(5, minmax(0, 1fr))')
    && talentDrawCssSrc.includes(`.drawStageComplete .aura { top: ${scaledPx(224)};`)
    && talentDrawCssSrc.includes('.drawStageComplete .sealWrap { opacity: 0;')
    && talentDrawPageSrc.includes('<FlowRunningHead')
    && talentDrawPageSrc.includes('五类命印，静待天命。')
    && talentDrawPageSrc.includes('aria-hidden="true">🔮</span>'),
  'the finalized draw ritual must keep its 220px aura, five-column handoff, and selected warm-paper title copy',
)
assertOk(
  talentDrawPageSrc.includes('DESTINY_PATTERN_CATEGORY_ORDER.map')
    && talentDrawPageSrc.includes('DESTINY_PATTERN_CATEGORY_CONFIG[id].label')
    && talentDrawPageSrc.includes("{ id: 'mythic', label: '轮回天赋' }")
    && talentDrawPageSrc.includes('role="tablist"')
    && talentDrawPageSrc.includes('role="tabpanel"')
    && !talentDrawPageSrc.includes('role="dialog"')
    && !talentDrawPageSrc.includes('TalentDrawMythicLibrary')
    && !talentDrawPageSrc.includes('useTalentDrawMythicLibrary')
    && talentDrawCssSrc.includes('.selectedSlotFilled')
    && talentDrawCssSrc.includes('animation: candidate-breathe')
    && talentDrawCssSrc.includes('animation: seal-breathe')
    && talentDrawCssSrc.includes('animation: rebirth-flow')
    && talentDrawCssSrc.includes('rebirth-seal-halo')
    && talentDrawCssSrc.includes('@keyframes rebirth-seal-halo'),
  'selected fate runtime must keep five ordinary plus one reincarnation tab, four shared slots, and the finalized selected glow effects',
)
assertOk(
  ['progressBar', 'progressRow', 'categoryTabs', 'candidateBand'].every((className) => talentDrawPageSrc.includes(`className={styles.${className}}`))
    && ['candidateRarity', 'rebirthHeading', 'slotHeading'].every((className) => !talentDrawPageSrc.includes(`styles.${className}`))
    && hasCssDeclaration(talentDrawCssSrc, 'selectionView', 'display', 'contents')
    && hasCssDeclaration(talentDrawCssSrc, 'progressBar', 'position', 'sticky')
    && talentDrawPageSrc.includes('confirmationRef.current')
    && talentDrawPageSrc.includes('selectedData.length !== PATTERN_LOADOUT_SLOT_COUNT')
    && talentDrawPageSrc.includes('assertPatternLoadout(selectedPatterns, selectedMythicPatterns, true)')
    && talentDrawPageSrc.includes('useCharacterStore.getState().setPatternLoadout(')
    && talentDrawPageSrc.includes("navigate('/attribute-alloc')")
    && talentDrawPageSrc.includes('四个携带槽已确认 · 进入属性分配'),
  'talent selection must use the finalized shared-slot layout and make one atomic owner commit',
)
assertOk(
  talentDrawPageSrc.includes('轮回天赋')
    && !talentDrawPageSrc.includes('转世天赋')
    && fatePreviewPageSrc.includes('轮回天赋')
    && !fatePreviewPageSrc.includes('转世天赋'),
  'the creation flow must use the current player-facing reincarnation-talent terminology without changing internal mythic contracts',
)
assertOk(fatePreviewPageSrc.includes('<FlowRunningHead stepLabel="06 / 07" />') && fatePreviewPageSrc.includes('confirmNumber="07"') && !fatePreviewPageSrc.includes('CREATION FLOW ·') && !fatePreviewPageSrc.includes('FATE · PREVIEW'), 'fate preview must use the selected flow step-06 and close the creation flow')
assertOk(
  fatePreviewPageSrc.includes('useCreationStoresHydrated()')
    && fatePreviewPageSrc.includes("router.replace('/new-game/world-select')")
    && fatePreviewPageSrc.includes("router.replace('/new-game/character-create')")
    && fatePreviewPageSrc.includes("router.replace('/talent-draw')"),
  'fate preview must wait for persisted creation state and reject out-of-order direct entry',
)
assertOk(
  fatePreviewPageSrc.includes('const worldReady = worldInitialized && !!worldConfig && worldCode > 0')
    && !fatePreviewPageSrc.includes('FatePreviewWorldInit')
    && !fatePreviewPageSrc.includes('getWorldInitState'),
  'fate preview must use local world readiness and must not display the inactive world-init AI panel',
)
assertOk(!fatePreviewPageSrc.includes('maxWidth='), 'fate preview bottom bar must inherit the shared content-width token')
assertOk(
  globalCssSrc.includes('.final-flow-frame')
    && globalCssSrc.includes('.flow-responsive-viewport')
    && globalCssSrc.includes('.flow-responsive-layout')
    && globalCssSrc.includes('height: 100dvh')
    && globalCssSrc.includes('--final-flow-density-px: 1.2px')
    && globalCssSrc.includes('--final-flow-density-rem: 1.2rem')
    && globalCssSrc.includes('--final-flow-content-max-width: 30rem')
    && globalCssSrc.includes('@media (min-width: 48rem)')
    && globalCssSrc.includes('--final-flow-content-max-width: 74rem')
    && globalCssSrc.includes('width: min(calc(100% - 40px), var(--final-flow-content-max-width))')
    && !globalCssSrc.includes('--final-flow-content-max-width: max(42rem, 58vw)')
    && !globalCssSrc.includes('--final-flow-content-max-width: clamp(42rem, 58vw, 60rem)')
    && globalCssSrc.includes('--final-flow-content-gutter: calc(16.667 * var(--final-flow-density-px))')
    && globalCssSrc.includes('--final-flow-inline-unit: clamp(3.84px, 1.2vw, 5.16px)')
    && globalCssSrc.includes('--final-flow-block-unit: clamp(7.68px, 1.2dvh, 11.184px)')
    && globalCssSrc.includes('.final-flow-frame--core-simulation {')
    && globalCssSrc.includes('--final-flow-density-px: 1px')
    && globalCssSrc.includes('--final-flow-density-rem: 1rem')
    && globalCssSrc.includes('--final-flow-content-gutter: 20px')
    && globalCssSrc.includes('.final-flow-frame--core-simulation .flow-responsive-layout')
    && globalCssSrc.includes('--final-flow-inline-unit: clamp(3.2px, 1vw, 4.3px)')
    && globalCssSrc.includes('--final-flow-block-unit: clamp(6.4px, 1dvh, 9.32px)')
    && globalCssSrc.includes('-webkit-text-size-adjust: 100%')
    && !globalCssSrc.includes('.final-flow-design-fit')
    && !globalCssSrc.includes('.final-flow-design-canvas')
    && !globalCssSrc.includes('--non-simulation-ui-desktop-scale')
    && finalFlowScaleRuntimeSrc === ''
    && !rootLayoutSrc.includes('FinalFlowScaleRuntime')
    && mobileBaseCssSrc === '',
  'runtime pages must share one desktop content width while preserving native non-core density and the story reader tuned density without fixed-canvas or zoom scaling',
)
assertOk(
  [
    welcomeCssSrc,
    worldSelectCssSrc,
    characterCreateCssSrc,
    talentDrawCssSrc,
    fatePreviewCssSrc,
    gameOverCssSrc,
    leaderboardCssSrc,
    helpModalCssSrc,
  ].every((source) => source.includes('var(--final-flow-content-gutter)'))
    && hasCssDeclaration(attributeAllocCssSrc, 'page', 'padding', '0 28px 112px')
    && hasCssDeclaration(attributeAllocCssSrc, 'page', 'padding', '0 16px 96px')
    && hasCssDeclaration(gameStoryCssSrc, 'barTop', 'padding', '0 var(--final-flow-content-gutter)')
    && hasCssDeclaration(gameStoryCssSrc, 'barVitals', 'padding', '6px var(--final-flow-content-gutter) 8px')
    && hasCssDeclaration(gameStoryCssSrc, 'reading', 'padding', '0 var(--final-flow-content-gutter)'),
  'page gutters must match the responsive page contracts and preserve the core reader gutter',
)
assertOk(
  [
    worldSelectCssSrc,
    characterCreateCssSrc,
    talentDrawCssSrc,
    fatePreviewCssSrc,
    gameOverCssSrc,
    settingsModalCssSrc,
    helpModalCssSrc,
    disclaimerModalCssSrc,
    bottomActionBarCssSrc,
  ].every((source) => source.includes('var(--final-flow-density-px)'))
    && gameStoryPageSrc.includes('final-flow-frame final-flow-frame--core-simulation')
    && !gameStoryCssSrc.includes('var(--final-flow-density-px)'),
  'all fixed-unit non-core surfaces must consume the 1.2x density unit and game-story must remain explicitly excluded',
)
assertOk(
  globalCssSrc.includes('position: absolute !important')
    && globalCssSrc.includes('env(safe-area-inset-bottom')
    && !globalCssSrc.includes('data-final-flow-mobile-height-fit')
    && !globalCssSrc.includes('data-final-flow-height-owner'),
  'mobile bottom actions must anchor to the safe viewport without runtime height back-calculation',
)
assertOk(
  welcomePageSrc.includes('final-flow-frame')
    && worldSelectMobileSrc.includes('final-flow-frame')
    && characterCreateMobileSrc.includes('final-flow-frame')
    && talentDrawPageSrc.includes('final-flow-frame')
    && fatePreviewPageSrc.includes('final-flow-frame')
    && gameStoryPageSrc.includes('final-flow-frame')
    && gameOverPageSrc.includes('final-flow-frame'),
  'all primary flow pages must wrap content in the shared final-flow viewport frame',
)
assertOk(
  [worldSelectMobileSrc, characterCreateMobileSrc, talentDrawPageSrc, fatePreviewPageSrc, settingsModalSrc, helpModalSrc]
    .every((source) => !source.includes('styles.titleMark')),
  'finalized creation and auxiliary pages must not render retired title marks',
)
assertOk(
  gameOverPageSrc.includes('<FlowRunningHead stepLabel="09 / 09" />')
    && gameOverPageSrc.includes('className={styles.titleCopy}')
    && gameOverPageSrc.includes('09 / 09')
    && gameOverPageSrc.includes('一生回望')
    && !gameOverPageSrc.includes('maxWidth={330}'),
  'game over must use the finalized running head and centered title composition',
)
assertOk(
  gameOverPageSrc.includes('<GameOverRadar')
    && !gameOverPageSrc.includes('<RadarChart')
    && gameOverRadarSrc.includes('function labelStyle(axisIndex: number, axisCount: number)')
    && gameOverRadarSrc.includes('axisIndex * ((2 * Math.PI) / axisCount)')
    && gameOverRadarSrc.includes('style={labelStyle(index, axisCount)}')
    && gameOverRadarSrc.includes('aria-pressed={activeIndex === index}')
    && gameOverRadarSrc.includes('activeIndex === index ? 4.4 : 3')
    && /\.radarGraph\s*\{[^}]*position:\s*relative;/s.test(gameOverCssSrc)
    && /\.metricButton\s*\{[^}]*position:\s*absolute;/s.test(gameOverCssSrc),
  'game-over metrics must surround the radar and preserve the approved interactive axis layout',
)
assertOk(
  gameOverPageSrc.includes('一键分享人生卡')
    && gameOverPageSrc.includes('saveGameOverShareCard')
    && gameOverPageSrc.includes('shareGameOverLife')
    && gameOverPageSrc.includes('图片只在当前设备绘制')
    && gameOverShareCardSrc.includes('await navigator.share({')
    && gameOverShareCardSrc.includes('downloadShareCard(blob, fileName)')
    && gameOverShareCardSrc.includes("canvas.toBlob")
    && /\.shareSection\s*\{[^}]*display:\s*none/s.test(gameOverCssSrc),
  'game over keeps a local fact-only share card implementation while the selected final prototype hides the share block',
)

const informationPanelStart = gameStoryPageSrc.indexOf('id="current-information-panel"')
const informationActionsStart = gameStoryPageSrc.indexOf('className={styles.moreActions}', informationPanelStart)
const informationLedgerStart = gameStoryPageSrc.indexOf('className={styles.ledger}', informationPanelStart)
assertOk(
  informationPanelStart >= 0
    && informationActionsStart > informationPanelStart
    && informationLedgerStart > informationActionsStart
    && ['手动存档', '反馈与建议', '返回主界面'].every((label) => (
      gameStoryPageSrc.indexOf(label, informationActionsStart) < informationLedgerStart
    )),
  'game story current-information actions must open at the top before the long ledger',
)
assertOk(
  hasCssDeclaration(gameStoryCssSrc, 'infoPanel', 'top', '100%')
    && hasCssDeclaration(gameStoryCssSrc, 'infoPanel', 'bottom', 'calc(100% - 100dvh + env(safe-area-inset-bottom, 0px))')
    && hasCssDeclaration(gameStoryCssSrc, 'infoPanel', 'overflow-y', 'auto')
    && hasCssDeclaration(gameStoryCssSrc, 'infoPanel', 'overscroll-behavior', 'contain')
    && hasCssDeclaration(gameStoryCssSrc, 'infoPanel', '-webkit-overflow-scrolling', 'touch'),
  'game story current-information panel must stay inside the dynamic viewport and own touch scrolling',
)

assertOk(
  gameStoryPageSrc.includes('const includeCreationPatternBonus = totalRounds === 0')
    && gameStoryPageSrc.includes('includeCreationPatternBonus ? (patternBonus[key] ?? 0) : 0'),
  'game story must only add preview-time destiny bonuses before the runtime character state is synchronized',
)
assertOk(
  gameStoryPageSrc.includes('className={styles.barActions}')
    && gameStoryPageSrc.includes('className={styles.stepMenu}')
    && gameStoryPageSrc.includes('className={`${styles.forceButton}')
    && gameStoryPageSrc.includes('aria-haspopup="listbox"')
    && gameStoryPageSrc.includes('aria-selected={option.value === activeTimeStepKey}')
    && gameStoryPageSrc.includes('document.addEventListener(\'pointerdown\', handlePointerDown)')
    && gameStoryPageSrc.includes("event.key !== 'Escape'")
    && !gameStoryPageSrc.includes('<strong>推进步长</strong>')
    && !gameStoryPageSrc.includes('className={styles.stepGrid}'),
  'game story must keep the time-step menu in the approved top-bar action group and remove the duplicate info-panel step grid',
)
assertOk(
  !/className=\{styles\.moreActions\}[\s\S]{0,1200}handleForceBranch/.test(gameStoryPageSrc),
  'game story more-information panel must not contain a duplicate destiny-branch action',
)

const readingOpeningTag = gameStoryPageSrc.match(/<(?:main|div|section)\b(?=[^>]*className=\{styles\.reading\})[^>]*>/)?.[0] ?? ''
const readingStart = gameStoryPageSrc.indexOf(readingOpeningTag)
const chapterHeadStart = gameStoryPageSrc.indexOf('className={styles.chapterHeadLine}', readingStart)
const narrativeTimelineStart = gameStoryPageSrc.indexOf('<NarrativeTimeline', readingStart)
const scrollMainOpeningTag = narrativeTimelineSrc.match(/<(?:main|div|section)\b(?=[^>]*className=\{styles\.scrollMain\})[^>]*>/)?.[0] ?? ''
const scrollMainHasSafeRef = !scrollMainOpeningTag.includes('ref=')
  || /ref=\{internalScrollRef\}/.test(scrollMainOpeningTag)
  || /ref=\{\s*scrollContainerRef\s*\?\s*(?:undefined|null)\s*:\s*internalScrollRef\s*\}/.test(scrollMainOpeningTag)

assertOk(
  readingOpeningTag.includes('ref={narrativeEndRef}')
    && gameStoryPageSrc.includes('scrollContainerRef={narrativeEndRef}')
    && scrollMainHasSafeRef,
  'game story reading must be the sole narrative scroll authority and the external ref must not be rebound to scrollMain',
)
assertOk(
  readingStart >= 0
    && chapterHeadStart > readingStart
    && narrativeTimelineStart > chapterHeadStart
    && cssClassAvoidsValue(gameStoryCssSrc, 'chapterHeadLine', 'position', 'sticky')
    && cssClassAvoidsValue(gameStoryCssSrc, 'chapterHeadLine', 'position', 'fixed')
    && cssClassAvoidsValue(gameStoryCssSrc, 'chapterHeadLine', 'position', 'absolute'),
  'game-story chapter information must stay inside the continuous reading flow without an independent fixed title layer',
)
assertOk(
  hasCssDeclaration(gameStoryCssSrc, 'reading', 'overflow-y', 'auto')
    && !gameStoryCssSrc.includes('NarrativeTimeline owns story scrolling')
    && !gameStoryCssSrc.includes('.reading > div:last-child'),
  'game-story reading must own continuous story scrolling instead of delegating it to a nested timeline surface',
)
assertOk(
  cssClassAvoidsValue(narrativeTimelineCssSrc, 'timelineHeader', 'position', 'sticky')
    && cssClassAvoidsValue(narrativeTimelineCssSrc, 'timelineHeader', 'position', 'fixed')
    && cssClassAvoidsValue(narrativeTimelineCssSrc, 'timelineHeader', 'position', 'absolute'),
  'NarrativeTimeline timelineHeader must remain ordinary narrative flow content, not a sticky title layer',
)
assertOk(
  cssClassAvoidsValue(narrativeTimelineCssSrc, 'advanceDock', 'position', 'sticky')
    && cssClassAvoidsValue(narrativeTimelineCssSrc, 'advanceDock', 'position', 'fixed')
    && cssClassAvoidsValue(narrativeTimelineCssSrc, 'advanceDock', 'position', 'absolute'),
  'NarrativeTimeline advanceDock must remain at the narrative tail instead of becoming a bottom action layer',
)
assertOk(
  cssClassAvoidsValue(narrativeTimelineCssSrc, 'scrollMain', 'overflow-y', 'auto')
    && cssClassAvoidsValue(narrativeTimelineCssSrc, 'scrollMain', 'overflow-y', 'scroll')
    && cssClassAvoidsValue(narrativeTimelineCssSrc, 'scrollMain', 'overflow', 'auto')
    && cssClassAvoidsValue(narrativeTimelineCssSrc, 'scrollMain', 'overflow', 'scroll')
    && cssDeclarationValues(narrativeTimelineCssSrc, 'scrollMain', 'max-height').every((value) => value === 'none'),
  'NarrativeTimeline scrollMain must not create a nested scrolling or viewport-height layer',
)
assertOk(
  !gameStoryPageSrc.includes('getAutoNarrativeRetryDelay')
    && !gameStoryPageSrc.includes('runAutoNarrativeRetryAttempt')
    && !gameStoryPageSrc.includes('invalidateAutoNarrativeRetry')
    && !gameStoryPageSrc.includes('setAutoRetryAttempt')
    && gameStoryPageSrc.includes('narrativeError = useEngineStore')
    && gameStoryPageSrc.includes('advanceBlocked: !isRuntimeReady || hasUnresolvedBranch')
    && gameStoryPageSrc.includes('advanceText: narrativeAdvanceText')
    && gameStoryPageSrc.includes('advanceHint: narrativeAdvanceHint')
    && !gameStoryPageSrc.includes('handleNarrativeRetry'),
  'game story narrative errors must stay visible and wait for the player to use the normal advance control again',
)
assertOk(
  !gameStoryPageSrc.includes('resolveWorldDimensionLabels')
    && !fatePreviewPageSrc.includes('resolveWorldDimensionLabels')
    && !gameStoryPageSrc.includes('世界空间')
    && !fatePreviewPageSrc.includes('世界空间'),
  'retired world dimension outputs must not remain in fate preview or game story projections',
)
assertOk(
  !fs.existsSync(path.join(root, 'src/mods/mod-world/utils/world-config-mapping.ts'))
    && !readRel('src/mods/mod-world/utils/world-config-mapping.ts'),
  'retired world configuration mapping must not remain as a fallback path',
)
assertOk(
  (saveManagerPageSrc.match(/aria-label={`加载存档：/g) ?? []).length === 2
    && (saveManagerPageSrc.match(/className={styles\.slotRow}/g) ?? []).length === 2
    && saveManagerCssSrc.includes('.slotRow:focus-visible'),
  'automatic and manual save rows must expose keyboard-accessible load buttons with visible focus',
)
assertOk(
  gameOverPageSrc.includes("router.push('/new-game/world-select')")
    && gameOverPageSrc.includes('leavingForNewLifeRef.current = true')
    && gameOverPageSrc.includes('!canViewGameOver && !leavingForNewLifeRef.current'),
  'game-over new-life action must bypass the empty-state redirect race and return directly to world selection',
)
const newGamePageSrc = readRel('src/mods/mod-pages/pages/new-game/page.tsx')
const worldConfirmSrc = readRel('src/mods/mod-pages/pages/world-select/useWorldConfirm.ts')
assertOk(
  worldConfirmSrc.includes("router.push('/new-game/character-create')")
    && !worldConfirmSrc.includes('world-customize'),
  'world confirmation must bypass the removed customization route',
)
assertOk(
  newGamePageSrc.includes('void resetForNewLife()')
    && worldConfirmSrc.includes('await prepareNewLifeWorldCommit(worldCode)'),
  'canonical and direct world-selection entry paths must both prevent previous-life state from reaching a new world',
)
assertOk(
  !/\balert\s*\(/.test(worldConfirmSrc)
    && !worldConfirmSrc.includes('hasAvailableApiConfiguration')
    && !worldConfirmSrc.includes('isApiConfigured')
    && worldSelectMobileSrc.includes('role="alert"'),
  'world confirmation must not require narrative API configuration or open a native alert',
)
assertOk(
  !worldSelectCustomFormSrc.includes('maxLength=')
    && worldSelectCustomFormSrc.includes('{logic.customName.length} 字'),
  'custom world names must preserve complete input and expose only a non-destructive character count',
)
assertOk(
  JSON.stringify(prototypeRootEntries) === JSON.stringify(['account', 'assets', 'attribute-alloc', 'character-create', 'fate-preview', 'feedback', 'game-over', 'game-story', 'help', 'index.html', 'leaderboard', 'mailbox', 'main-flow', 'save-sheet', 'settings', 'talent-draw', 'talent-select', 'template', 'welcome', 'world-customize', 'world-select'])
    && JSON.stringify(prototypeAssetEntries) === JSON.stringify(['library.css'])
    && JSON.stringify(prototypeTemplateEntries) === JSON.stringify(['iteration.html'])
    && prototypeWelcomeIterationSrc.includes('data-template-purpose="ui-iteration"')
    && prototypeWelcomeIterationRound02Src.includes('data-template-purpose="ui-iteration"')
    && prototypeWelcomeIterationRound03Src.includes('data-template-purpose="ui-iteration"')
    && prototypeWelcomeIterationRound04Src.includes('data-template-purpose="ui-iteration"')
    && prototypeWelcomeIterationRound05Src.includes('data-template-purpose="ui-iteration"')
    && prototypeWelcomeIterationRound06Src.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-current.html', 'candidate-02-minimal.html', 'candidate-03-minimal.html',
        'candidate-round-02-01-warm.html', 'candidate-round-02-02-mist.html', 'candidate-round-02-03-moon.html',
        'candidate-round-03-01-hierarchy.html', 'candidate-round-03-02-rhythm.html', 'candidate-round-03-03-interaction.html',
        'candidate-round-04-01-vertcentered.html', 'candidate-round-04-02-leftaligned.html', 'candidate-round-04-03-centered.html',
        'candidate-round-05-01-tight.html', 'candidate-round-05-02-medium.html', 'candidate-round-05-03-minimal-gap.html',
        'candidate-round-06-01-lower-main.html', 'candidate-round-06-02-lower-block.html', 'candidate-round-06-03-lineheight.html']
      .every(marker => prototypeWelcomeCandidateEntries.includes(marker))
    && prototypeSaveSheetIterationSrc.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-current.html', 'candidate-02-minimal.html', 'candidate-03-focused.html']
      .every(marker => prototypeSaveSheetCandidateEntries.includes(marker))
    && prototypeLeaderboardIterationSrc.includes('data-template-purpose="ui-iteration"')
    && prototypeLeaderboardIterationRound02Src.includes('data-template-purpose="ui-iteration"')
    && prototypeLeaderboardIterationRound03Src.includes('data-template-purpose="ui-iteration"')
    && prototypeLeaderboardIterationRound04Src.includes('data-template-purpose="ui-iteration"')
    && prototypeLeaderboardIterationRound05Src.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-current.html', 'candidate-02-minimal.html', 'candidate-03-focused.html',
        'candidate-round-02-01-expanded.html', 'candidate-round-02-02-merged.html', 'candidate-round-02-03-equal.html',
        'candidate-round-03-01-top-card.html', 'candidate-round-03-02-entry-layer.html', 'candidate-round-03-03-top-emblem.html',
        'candidate-round-04-01-tinted.html', 'candidate-round-04-02-compact.html', 'candidate-round-04-03-icon.html',
        'candidate-round-05-01-pure-white.html', 'candidate-round-05-02-warm-beige.html', 'candidate-round-05-03-weight.html']
      .every(marker => prototypeLeaderboardCandidateEntries.includes(marker))
    && prototypeMailboxIterationSrc.includes('data-template-purpose="ui-iteration"')
    && prototypeMailboxIterationRound02Src.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-current.html', 'candidate-02-minimal.html', 'candidate-03-focused.html',
        'candidate-round-02-01-baseline.html', 'candidate-round-02-02-talent.html', 'candidate-round-02-03-unread.html']
      .every(marker => prototypeMailboxCandidateEntries.includes(marker))
    && prototypeSettingsIterationSrc.includes('data-template-purpose="ui-iteration"')
    && prototypeSettingsIterationRound02Src.includes('data-template-purpose="ui-iteration"')
    && prototypeSettingsIterationRound03Src.includes('data-template-purpose="ui-iteration"')
    && prototypeSettingsIterationRound04Src.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-current.html', 'candidate-02-minimal.html', 'candidate-03-focused.html',
        'candidate-round-02-01-baseline.html', 'candidate-round-02-02-feedback.html', 'candidate-round-02-03-restrained.html',
        'candidate-round-03-01-baseline.html', 'candidate-round-03-02-compact-tabs.html', 'candidate-round-03-03-airier.html',
        'candidate-round-04-01-baseline.html', 'candidate-round-04-02-data-actions.html', 'candidate-round-04-03-tail.html']
      .every(marker => prototypeSettingsCandidateEntries.includes(marker))
    && prototypeAccountIterationSrc.includes('data-template-purpose="ui-iteration"')
    && prototypeAccountIterationRound02Src.includes('data-template-purpose="ui-iteration"')
    && prototypeAccountIterationRound03Src.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-current.html', 'candidate-02-minimal.html', 'candidate-03-focused.html',
        'candidate-round-02-01-baseline.html', 'candidate-round-02-02-form-rhythm.html', 'candidate-round-02-03-data-rows.html',
        'candidate-round-03-01-baseline.html', 'candidate-round-03-02-signed-in.html', 'candidate-round-03-03-personal-data.html']
      .every(marker => prototypeAccountCandidateEntries.includes(marker))
    && prototypeHelpIterationSrc.includes('data-template-purpose="ui-iteration"')
    && ['candidate-round-01-01-chapter-nav.html', 'candidate-round-01-02-chapter-list.html', 'candidate-round-01-03-quick-guide.html']
      .every(marker => prototypeHelpCandidateEntries.includes(marker))
    && prototypeFeedbackIterationSrc.includes('data-template-purpose="ui-iteration"')
    && prototypeFeedbackIteration02Src.includes('data-template-purpose="ui-iteration"')
    && ['candidate-round-01-01-category-cards.html', 'candidate-round-01-02-guided-steps.html', 'candidate-round-01-03-compact-single.html',
        'candidate-round-02-01-guided-input.html', 'candidate-round-02-02-structured-fields.html', 'candidate-round-02-03-submit-review.html']
      .every(marker => prototypeFeedbackCandidateEntries.includes(marker))
    && prototypeWorldSelectIterationSrc.includes('data-template-purpose="ui-iteration"')
    && prototypeWorldSelectIterationRound02Src.includes('data-template-purpose="ui-iteration"')
    && prototypeWorldSelectIterationRound03Src.includes('data-template-purpose="ui-iteration"')
    && prototypeWorldSelectIterationRound04Src.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-current.html', 'candidate-02-minimal.html', 'candidate-03-focused.html',
        'candidate-round-02-01-baseline.html', 'candidate-round-02-02-decorated.html', 'candidate-round-02-03-emoji-led.html',
        'candidate-round-03-01-baseline.html', 'candidate-round-03-02-narrative.html', 'candidate-round-03-03-immersive.html',
        'candidate-round-04-01-baseline.html', 'candidate-round-04-02-tone-inline.html', 'candidate-round-04-03-scenery.html']
      .every(marker => prototypeWorldSelectCandidateEntries.includes(marker))
    && prototypeCharacterCreateIterationSrc.includes('data-template-purpose="ui-iteration"')
    && prototypeCharacterCreateIterationRound02Src.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-current.html', 'candidate-02-minimal.html', 'candidate-03-focused.html',
        'candidate-round-02-01-direct.html', 'candidate-round-02-02-clean.html', 'candidate-round-02-03-immersive.html']
      .every(marker => prototypeCharacterCreateCandidateEntries.includes(marker))
    && prototypeTalentDrawIterationSrc.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-current.html', 'candidate-02-minimal.html', 'candidate-03-focused.html']
      .every(marker => prototypeTalentDrawCandidateEntries.includes(marker))
    && prototypeTalentSelectIterationSrc.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-current.html', 'candidate-02-minimal.html', 'candidate-03-focused.html']
      .every(marker => prototypeTalentSelectCandidateEntries.includes(marker))
    && prototypeAttributeAllocIterationSrc.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-budget-top.html', 'candidate-02-attribute-cards.html', 'candidate-03-runtime-layout.html']
      .every(marker => prototypeAttributeAllocCandidateEntries.includes(marker))
    && prototypeFatePreviewIterationSrc.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-init-top.html', 'candidate-02-card-groups.html', 'candidate-03-runtime-layout.html']
      .every(marker => prototypeFatePreviewCandidateEntries.includes(marker))
    && prototypeGameStoryIterationSrc.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-runtime-layout.html', 'candidate-02-folio-merge.html', 'candidate-03-focus-advance.html']
      .every(marker => prototypeGameStoryCandidateEntries.includes(marker))
    && prototypeGameOverIterationSrc.includes('data-template-purpose="ui-iteration"')
    && ['candidate-01-runtime-layout.html', 'candidate-02-book-scroll.html', 'candidate-03-score-led.html']
      .every(marker => prototypeGameOverCandidateEntries.includes(marker)),
  'the UI solution library must contain the generic index, structural stylesheet, reusable template, and the registered welcome iteration directories',
)
assertOk(
  prototypeIndexSrc.includes('data-library-purpose="generic-ui-iteration"')
    && prototypeIndexSrc.includes('href="template/iteration.html"')
    && prototypeIndexSrc.includes('当前不保留任何既定主题、定版稿或页面构图')
    && prototypeIndexSrc.includes('Runtime authority: none')
    && prototypeIndexSrc.includes('href="main-flow/index.html"')
    && prototypeIndexSrc.includes('href="world-select/index.html"')
    && prototypeIndexSrc.includes('href="character-create/index.html"')
    && prototypeIndexSrc.includes('href="talent-draw/index.html"')
    && prototypeIndexSrc.includes('href="talent-select/index.html"')
    && prototypeIndexSrc.includes('href="attribute-alloc/index.html"')
    && prototypeIndexSrc.includes('href="fate-preview/index.html"')
    && prototypeIndexSrc.includes('href="game-story/index.html"')
    && prototypeIndexSrc.includes('href="game-over/index.html"')
    && !prototypeIndexSrc.includes('class="iteration-branch'),
  'the generic library index must stay neutral, register logical-interface entries only, and leave page iterations to the middle layer',
)
assertOk(
  prototypeMainFlowIndexSrc.includes('data-flow-purpose="mobile-main-flow"')
    && prototypeMainFlowIndexSrc.includes('href="../index.html"')
    && ['../welcome/iteration-round-06.html', '../save-sheet/iteration-round-01.html', '../leaderboard/iteration-round-05.html',
        '../mailbox/iteration-round-02.html', '../settings/iteration-round-04.html', '../account/iteration-round-03.html',
        '../feedback/iteration-round-02.html', '../help/iteration-round-01.html']
      .every(marker => prototypeMainFlowIndexSrc.includes(marker))
    && prototypeMainFlowIndexSrc.includes('iteration-branch-current')
    && prototypeMainFlowIndexSrc.includes('Runtime authority: none'),
  'the mobile main-flow middle layer must register every page iteration entry with its current branch and stay runtime-neutral',
)
assertOk(
  prototypeWorldSelectIndexSrc.includes('data-flow-purpose="world-select-flow"')
    && prototypeWorldSelectIndexSrc.includes('href="../index.html"')
    && prototypeWorldSelectIndexSrc.includes('href="iteration-round-01.html"')
    && prototypeWorldSelectIndexSrc.includes('href="iteration-round-02.html"')
    && prototypeWorldSelectIndexSrc.includes('href="iteration-round-03.html"')
    && prototypeWorldSelectIndexSrc.includes('href="iteration-round-04.html"')
    && prototypeWorldSelectIndexSrc.includes('iteration-branch-current')
    && prototypeWorldSelectIndexSrc.includes('Runtime authority: none')
    && prototypeWorldSelectIterationRound04Src.includes('角色创建'),
  'the world-select middle layer must register every page iteration entry with its current branch and stay runtime-neutral',
)
assertOk(
  prototypeWorldCustomizeIndexSrc.includes('data-flow-purpose="retired-world-customize-history"')
    && prototypeWorldCustomizeIndexSrc.includes('href="../index.html"')
    && prototypeWorldCustomizeIndexSrc.includes('href="iteration-round-01.html"')
    && prototypeWorldCustomizeIndexSrc.includes('href="iteration-round-02.html"')
    && prototypeWorldCustomizeIndexSrc.includes('href="iteration-round-03.html"')
    && !prototypeWorldCustomizeIndexSrc.includes('iteration-branch-current')
    && prototypeWorldCustomizeIndexSrc.includes('现行流程')
    && prototypeWorldCustomizeIndexSrc.includes('Runtime authority: none'),
  'the removed world-customize directory must remain a historical archive only and never act as a current flow or acceptance source',
)
assertOk(
  prototypeCharacterCreateIndexSrc.includes('data-flow-purpose="character-create-flow"')
    && prototypeCharacterCreateIndexSrc.includes('href="../index.html"')
    && prototypeCharacterCreateIndexSrc.includes('href="iteration-round-01.html"')
    && prototypeCharacterCreateIndexSrc.includes('href="iteration-round-02.html"')
    && prototypeCharacterCreateIndexSrc.includes('iteration-branch-current')
    && prototypeCharacterCreateIndexSrc.includes('Runtime authority: none')
    && prototypeCharacterCreateCurrentIterationSrc.includes('runningHead（02 / 07）'),
  'the character-create middle layer must register every page iteration entry with its current branch and stay runtime-neutral',
)
assertOk(
  prototypeFatePreviewCurrentCandidateSrc.includes('world-ready-title')
    && !prototypeFatePreviewCurrentCandidateSrc.includes('world-init-title')
    && !prototypeFatePreviewCurrentCandidateSrc.includes('initStepList')
    && !prototypeFatePreviewCurrentCandidateSrc.includes('loading149Spin'),
  'the current fate-preview prototype must show local world readiness without the retired world-init AI progress panel',
)
assertOk(
  prototypeTalentDrawIndexSrc.includes('data-flow-purpose="talent-draw-flow"')
    && prototypeTalentDrawIndexSrc.includes('href="../index.html"')
    && prototypeTalentDrawIndexSrc.includes('href="iteration-round-01.html"')
    && prototypeTalentDrawIndexSrc.includes('iteration-branch-current')
    && prototypeTalentDrawIndexSrc.includes('Runtime authority: none'),
  'the talent-draw middle layer must register every page iteration entry with its current branch and stay runtime-neutral',
)
assertOk(
  prototypeTalentSelectIndexSrc.includes('data-flow-purpose="talent-select-flow"')
    && prototypeTalentSelectIndexSrc.includes('href="../index.html"')
    && prototypeTalentSelectIndexSrc.includes('href="iteration-round-01.html"')
    && prototypeTalentSelectIndexSrc.includes('iteration-branch-current')
    && prototypeTalentSelectIndexSrc.includes('Runtime authority: none'),
  'the talent-select middle layer must register every page iteration entry with its current branch and stay runtime-neutral',
)
assertOk(
  prototypeAttributeAllocIndexSrc.includes('data-flow-purpose="attribute-alloc-flow"')
    && prototypeAttributeAllocIndexSrc.includes('href="../index.html"')
    && prototypeAttributeAllocIndexSrc.includes('href="iteration-round-01.html"')
    && prototypeAttributeAllocIndexSrc.includes('iteration-branch-current')
    && prototypeAttributeAllocIndexSrc.includes('Runtime authority: none'),
  'the attribute-alloc middle layer must register every page iteration entry with its current branch and stay runtime-neutral',
)
assertOk(
  prototypeFatePreviewIndexSrc.includes('data-flow-purpose="fate-preview-flow"')
    && prototypeFatePreviewIndexSrc.includes('href="../index.html"')
    && prototypeFatePreviewIndexSrc.includes('href="iteration-round-01.html"')
    && prototypeFatePreviewIndexSrc.includes('iteration-branch-current')
    && prototypeFatePreviewIndexSrc.includes('Runtime authority: none'),
  'the fate-preview middle layer must register every page iteration entry with its current branch and stay runtime-neutral',
)
assertOk(
  prototypeGameStoryIndexSrc.includes('data-flow-purpose="game-story-flow"')
    && prototypeGameStoryIndexSrc.includes('href="../index.html"')
    && prototypeGameStoryIndexSrc.includes('href="iteration-round-01.html"')
    && prototypeGameStoryIndexSrc.includes('iteration-branch-current')
    && prototypeGameStoryIndexSrc.includes('Runtime authority: none'),
  'the game-story middle layer must register every page iteration entry with its current branch and stay runtime-neutral',
)
assertOk(
  prototypeGameOverIndexSrc.includes('data-flow-purpose="game-over-flow"')
    && prototypeGameOverIndexSrc.includes('href="../index.html"')
    && prototypeGameOverIndexSrc.includes('href="iteration-round-01.html"')
    && prototypeGameOverIndexSrc.includes('iteration-branch-current')
    && prototypeGameOverIndexSrc.includes('Runtime authority: none'),
  'the game-over middle layer must register every page iteration entry with its current branch and stay runtime-neutral',
)
assertOk(
  prototypeIterationTemplateSrc.includes('data-template-purpose="ui-iteration"')
    && prototypeIterationTemplateSrc.includes('id="brief-title"')
    && prototypeIterationTemplateSrc.includes('id="candidate-title"')
    && prototypeIterationTemplateSrc.includes('id="comparison-title"')
    && prototypeIterationTemplateSrc.includes('id="decision-title"')
    && ['data-candidate="01"', 'data-candidate="02"', 'data-candidate="03"']
      .every(marker => prototypeIterationTemplateSrc.includes(marker))
    && !/(?:localStorage|sessionStorage|PrototypeFlow|fetch\s*\()/.test(prototypeIterationTemplateSrc),
  'the reusable iteration template must compare candidates without owning runtime state or persistence',
)
assertOk(
  prototypeLibraryCssSrc.includes('Provide neutral layout and responsive structure only')
    && prototypeLibraryCssSrc.includes('letter-spacing: 0;')
    && prototypeLibraryCssSrc.includes('@media (max-width: 640px)')
    && !/(?:linear-gradient|radial-gradient|semantic-emoji|#7382bb)/.test(prototypeLibraryCssSrc),
  'the library stylesheet must remain structural, responsive, and independent from the retired product theme',
)
assertOk(
  globalCssSrc.includes('.semantic-emoji {')
    && worldSelectMainGridSrc.includes('data-semantic-emoji')
    && worldSelectDirectorySrc.includes('data-semantic-emoji')
    && characterIdentitySrc.includes('data-semantic-emoji aria-hidden="true">👤</span>核心身份')
    && characterLifespanSrc.includes('data-semantic-emoji aria-hidden="true">⏳</span>寿命与起始')
    && characterBackgroundSrc.includes('data-semantic-emoji aria-hidden="true">📜</span>人生背景')
    && attributeAllocPageSrc.includes("icon: '💪'")
    && attributeAllocPageSrc.includes('className="semantic-emoji"')
    && attributeAllocPageSrc.includes('{attribute.icon}')
    && fatePreviewPageSrc.includes('{ATTRIBUTE_ICONS[key]}')
    && gameStoryPageSrc.includes('aria-label="四维属性"')
    && gameStoryPageSrc.includes('aria-hidden="true">{icon}')
    && gameStoryPageSrc.includes("'physique' ? '💪'")
    && gameOverRadarSrc.includes('GAME_OVER_DIMENSION_ICONS')
    && gameOverRadarSrc.includes('data-semantic-emoji')
    && accountPageSrc.includes('className="semantic-emoji"')
    && feedbackPageSrc.includes('className="semantic-emoji"'),
  'runtime pages must implement the selected small aria-hidden semantic markers without changing accessible labels',
)
assertOk(
  welcomeViewSrc.includes('🌱 开始新人生')
    && talentDrawPageSrc.includes('aria-hidden="true">🔮</span>')
    && settingsModalSrc.includes('⚙️ 设置')
    && helpModalSrc.includes('🚪 开始与设置'),
  'welcome, talent draw, settings and help must retain the finalized semantic emoji treatment',
)
assertOk(
  gameStoryPageSrc.includes('worldIcon')
    && gameStoryPageSrc.includes('identityWorldName')
    && gameStoryPageSrc.includes('identitySeparator')
    && gameStoryPageSrc.includes('narrativeTimeLabel')
    && gameStoryCssSrc.includes('.identityWorldIcon')
    && gameStoryCssSrc.includes('.identityTime'),
  'game story reader identity must show a semantic world icon and world name before the unadorned narrative time',
)
assertOk(
  narrativeTimelineSrc.includes('growthAttributeChip')
    && narrativeTimelineSrc.includes('data-rarity={option.rarity}')
    && !narrativeTimelineSrc.includes('属性加成：')
    && gameStoryPageSrc.includes('entryAge >= DESTINY_PATTERN_GROWTH_MINIMUM_AGE')
    && narrativeTimelineCssSrc.includes('.growthSource[data-rarity="common"]')
    && narrativeTimelineCssSrc.includes('.growthOption[data-rarity="mythic"]')
    && narrativeTimelineCssSrc.includes('--growth-rarity-bg'),
  'talent-growth cards must render separate emoji attribute chips and pale rarity-keyed containers without the old attribute prefix',
)
assertOk(
  hasCssDeclaration(gameOverCssSrc, 'bottomBar', 'position', 'absolute')
    && hasCssDeclaration(gameOverCssSrc, 'backButton', 'min-height', scaledPx(38.333))
    && hasCssDeclaration(gameOverCssSrc, 'confirmButton', 'min-height', scaledPx(38.333))
    && gameOverPageSrc.includes('className={styles.backButton}')
    && gameOverPageSrc.includes('className={styles.confirmButton}')
    && gameOverPageSrc.includes("router.push('/welcome')")
    && gameOverPageSrc.includes('查看模拟数据')
    && gameOverPageSrc.includes('开始新人生')
    && gameOverPageSrc.includes('完成回望'),
  'runtime game-over footer must match the finalized two-button hierarchy while preserving real actions',
)
if (failed === 0) {
  console.log('PASS: mobile-ui-regression')
  process.exit(0)
}
process.exit(1)
