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
const themeStoreSrc = readRel('src/core/theme/theme-store.ts')
const settingsParamCardSrc = readRel('src/mods/mod-settings/components/SettingsParamCard.tsx')
const settingsPresetsSrc = readRel('src/mods/mod-settings/components/SettingsTabPresets.tsx')
const deepSeekPresetHandler = settingsPresetsSrc.slice(
  settingsPresetsSrc.indexOf('const handleApplyDeepSeekPreset'),
  settingsPresetsSrc.indexOf('const handleClearKey'),
)
const preGenQueueSrc = readRel('src/mods/mod-engine/helpers/pre-gen-queue.ts')
const helpModalSrc = readRel('src/mods/mod-ui/components/organisms/HelpModal.tsx')
const helpFocusTrapSrc = readRel('src/mods/mod-ui/components/organisms/HelpModalFocusTrap.ts')
const helpNavigationSrc = readRel('src/mods/mod-ui/components/organisms/HelpModalNavigation.tsx')
const helpModalCssSrc = readRel('src/mods/mod-ui/components/organisms/HelpModal.module.css')
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
const worldSelectCacheDialogSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectCacheResetDialog.tsx')
const worldSelectCustomFormSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectCustomForm.tsx')
const worldSelectCssSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectMobile.module.css')
const worldGeneratedCacheSrc = readRel('src/mods/mod-world/utils/world-generated-cache.ts')
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
const productDecisionsSrc = readRel('docs/product-decisions.md')
const worldCustomizeMobileSrc = readRel('src/mods/mod-pages/pages/world-customize/WorldCustomizeMobile.tsx')
const worldCustomizePageSrc = readRel('src/mods/mod-pages/pages/world-customize/page.tsx')
const worldCustomizeLogicSrc = readRel('src/mods/mod-pages/pages/world-customize/useWorldCustomize.ts')
const worldCustomizeDimensionSrc = readRel('src/mods/mod-pages/pages/world-customize/WorldCustomizeDimensionCard.tsx')
const worldCustomizeBottomBarSrc = readRel('src/mods/mod-pages/pages/world-customize/WorldCustomizeBottomBar.tsx')
const worldCustomizeCssSrc = readRel('src/mods/mod-pages/pages/world-customize/WorldCustomizeMobile.module.css')
const gameStoryPageSrc = readCodeDirectory('src/mods/mod-pages/pages/game-story')
const gameStoryCssSrc = readRel('src/mods/mod-pages/pages/game-story/GameStory.module.css')
const narrativeTimelineSrc = `${readRel('src/mods/mod-ui/components/organisms/NarrativeTimeline.tsx')}\n${readRel('src/mods/mod-ui/components/organisms/NarrativeTimelineEntryView.tsx')}`
const narrativeTimelineCssSrc = readRel('src/mods/mod-ui/components/organisms/NarrativeTimeline.module.css')
const fatePreviewPageSrc = readCodeDirectory('src/mods/mod-pages/pages/fate-preview')
const fatePreviewCssSrc = readRel('src/mods/mod-pages/pages/fate-preview/FatePreview.module.css')
const worldDimensionLabelsSrc = readRel('src/mods/mod-pages/helpers/world-dimension-labels.ts')
const worldConfigMappingSrc = readRel('src/mods/mod-world/utils/world-config-mapping.ts')
const saveManagerPageSrc = readRel('src/mods/mod-pages/pages/save-manager/page.tsx')
const saveManagerCssSrc = readRel('src/mods/mod-pages/pages/save-manager/save-manager.module.css')
const gameOverPageSrc = readCodeDirectory('src/mods/mod-pages/pages/game-over')
const gameOverRadarSrc = readRel('src/mods/mod-pages/pages/game-over/GameOverRadar.tsx')
const gameOverShareCardSrc = readRel('src/mods/mod-pages/pages/game-over/game-over-share-card.ts')
const gameOverCssSrc = readRel('src/mods/mod-pages/pages/game-over/GameOver.module.css')
const accountPageSrc = readCodeDirectory('src/mods/mod-pages/pages/account')
const feedbackPageSrc = readRel('src/mods/mod-pages/pages/feedback/page.tsx')
const prototypeLibraryCssSrc = readRel('docs/ui-prototypes/mobile/assets/library.css')
const prototypeIndexSrc = readRel('docs/ui-prototypes/mobile/index.html')
const prototypeIterationTemplateSrc = readRel('docs/ui-prototypes/mobile/template/iteration.html')
const prototypeRootEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile')).sort()
const prototypeAssetEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/assets')).sort()
const prototypeTemplateEntries = fs.readdirSync(path.join(root, 'docs/ui-prototypes/mobile/template')).sort()
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
  worldCustomizeLogicSrc.includes('raw.worldCode === currentWorldCode')
    && worldCustomizeLogicSrc.includes('raw.worldName === currentWorldName'),
  'world-customize drafts must be isolated to the selected world identity',
)
assertOk(
  worldCustomizePageSrc.includes("router.replace('/new-game/world-select')")
    && characterCreatePageSrc.includes("router.replace('/new-game/world-select')")
    && talentDrawPageSrc.includes("router.replace('/new-game/character-create')")
    && talentDrawPageSrc.includes('useCreationStoresHydrated()'),
  'creation routes must redirect to the nearest missing prerequisite after persisted stores hydrate',
)
assertOk(
  attributeAllocPageSrc.includes('const TOTAL_POINTS = 15')
    && attributeAllocPageSrc.includes('const effectiveValue = value + bonus')
    && attributeAllocPageSrc.includes('nextUsedPoints > TOTAL_POINTS')
    && !attributeAllocPageSrc.includes('const MAX_VALUE = 10')
    && !attributeAllocPageSrc.includes('const MIN_VALUE = 0')
    && attributeAllocPageSrc.includes('setCharacterBase({')
    && attributeAllocPageSrc.includes("router.push('/fate-preview')"),
  'the creation flow must expose the confirmed 15-point allocation with unbounded per-attribute values and effective-value display',
)
assertOk(welcomePageSrc.includes("import WelcomeView from './WelcomeView'"), 'welcome page must use the single responsive WelcomeView')
assertOk(!welcomePageSrc.includes('useIsMobile'), 'welcome page must not switch desktop/mobile DOM after hydration')
assertOk(welcomePageSrc.includes('<WelcomeView'), 'welcome page must render WelcomeView exactly once')
assertOk(welcomeViewSrc.includes('一生很长，') && welcomeViewSrc.includes('也只由几次选择组成。'), 'welcome title must use the approved T2 copy')
assertOk(welcomeViewSrc.includes('选择世界与角色。'), 'welcome introduction must use the approved short copy from the selected RF4 refinement')
assertOk(welcomeViewSrc.includes('开始新人生'), 'welcome primary action must use the approved T2 label')
assertOk(!welcomeViewSrc.includes('styles.trajectory'), 'welcome must not reintroduce the retired decorative trajectory ornament')
assertOk(/hasAnySave\s*&&\s*\(/.test(welcomeViewSrc), 'continue action must only appear when a local or cloud save exists')
assertOk(
  welcomeViewSrc.includes('onDeleteSave={onDeleteSave}')
    && welcomeViewSrc.includes('onDeleteCloudSave={onDeleteCloudSave}')
    && welcomeSaveSheetSrc.includes('删除已选择的存档')
    && welcomeSaveSheetSrc.includes('role="alertdialog"')
    && welcomeSaveSheetSrc.includes('确认删除')
    && welcomeSaveSheetSrc.includes('onDeleteCloudSave()')
    && welcomeSaveSheetSrc.includes('onDeleteSave(deleteTarget.save.slot)')
    && welcomeCssSrc.includes('.deleteDialogOverlay')
    && welcomeCssSrc.includes('.deleteConfirm'),
  'welcome local and cloud save selection must expose destructive deletion with an explicit second-confirmation dialog',
)
assertOk(!/[🎮⚙️📖]/u.test(welcomeViewSrc), 'welcome actions must not use the rejected emoji icon treatment')
assertOk(
  welcomePageSrc.includes('flow-responsive-viewport')
    && welcomePageSrc.includes('flow-responsive-layout')
    && !welcomePageSrc.includes('final-flow-design-fit'),
  'welcome must use the shared native viewport layout without a fixed-size design canvas',
)

assertOk(!/[🎨🤖🔌📝⚙️]/u.test(settingsModalSrc), 'approved settings tabs and title must not use emoji icons')
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
  'settings tab changes must scroll the active tab into the horizontal viewport',
)
assertOk(
  /\.tabBar\s*\{[^}]*overflow-x:\s*auto;[^}]*scrollbar-width:\s*none;[^}]*touch-action:\s*pan-x;/s.test(settingsModalCssSrc)
    && settingsModalCssSrc.includes('.tabBar::-webkit-scrollbar'),
  'settings tabs must support native horizontal touch scrolling with hidden scrollbars',
)
assertOk(settingsModalCssSrc.includes('flex: 0 0 auto'), 'settings tabs must keep the approved compact horizontal sizing')
assertOk(/\.tabActive\s*\{[^}]*background:\s*#fff;[^}]*color:\s*#7382bb;/s.test(settingsModalCssSrc), 'active settings tab must use the approved white-on-accent navigation treatment')
assertOk(
  settingsModalSrc.includes('flow-responsive-viewport')
    && settingsModalSrc.includes('flow-responsive-layout')
    && !settingsModalSrc.includes('final-flow-design-fit'),
  'mobile settings must use the shared native viewport layout without canvas scaling',
)
assertOk(settingsModalSrc.includes('aria-label="关闭设置"') && settingsModalSrc.includes('>×</button>'), 'settings modal must use the shared accessible circular close control')
assertOk(
  disclaimerModalSrc.includes('role="dialog"')
    && disclaimerModalSrc.includes('aria-modal="true"')
    && disclaimerModalSrc.includes("event.key !== 'Tab'"),
  'the blocking disclaimer dialog must move and contain keyboard focus',
)
assertOk(
  !settingsThemeSrc.includes('THEME_OPTIONS')
    && themeStoreSrc.includes("themes: ['minimal-white']")
    && themeStoreSrc.includes("theme: 'minimal-white', themes: ['minimal-white']"),
  'approved settings must not expose alternate themes that conflict with the fixed white-paper UI',
)
assertOk(
  settingsModalCssSrc.includes(`width: ${scaledPx(34)}`)
    && settingsModalCssSrc.includes(`height: ${scaledPx(34)}`),
  'settings close control must use the shared 1.2x density size',
)
assertOk(settingsModalCssSrc.includes('border-radius: 50%'), 'settings close control must be circular')
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
  settingsModelSrc.includes("{ value: 1, label: '预生成下一轮' }")
    && !settingsModelSrc.includes('{ value: 2')
    && !settingsModelSrc.includes('{ value: 3')
    && preGenQueueSrc.includes('return configuredRounds > 0 ? 1 : 0'),
  'pre-generation must expose only off/next-round and cap historical positive values at one queued round',
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
  !settingsPresetsSrc.includes('保存配置')
    && settingsPresetsSrc.includes('修改后自动保存')
    && settingsPresetsSrc.includes('测试连接'),
  'API model settings must explain automatic persistence and keep connectivity testing as a real action',
)

assertOk(!helpModalSrc.includes('useIsMobile'), 'help modal must use one responsive DOM without viewport branching')
assertOk(helpModalSrc.includes("import styles from './HelpModal.module.css'"), 'help modal must use one responsive CSS module')
assertOk(helpModalSurfaceSrc.includes('HELP_CHAPTERS') && helpModalSurfaceSrc.includes('styles.chapterNav'), 'help docs must expose the approved H1 chapter navigation')
assertOk(helpModalSrc.includes('aria-label="关闭说明"') && helpModalSrc.includes('>×</button>'), 'help modal must use the approved accessible C3 close control')
assertOk(helpModalSurfaceSrc.includes('role="tablist"') && helpModalSurfaceSrc.includes('aria-selected='), 'help tabs must expose semantic selected state')
assertOk(helpModalSrc.includes('useHelpModalFocusTrap') && helpModalSrc.includes('tabIndex={-1}') && helpFocusTrapSrc.includes("document.addEventListener('keydown'") && helpFocusTrapSrc.includes("event.key === 'Escape'"), 'help modal must trap focus, close globally on Escape, and restore focus')
assertOk(helpModalSrc.includes('<h2 className={styles.headerTitle}>说明</h2>') && helpModalSrc.includes('沿章节阅读，也可快速定位当前需要的功能。'), 'help header must use the flow-approved title and copy')
assertOk(!helpNavigationSrc.includes('<small>01</small>') && !helpNavigationSrc.includes('<small>02</small>'), 'help two-tab navigation must not add settings-style chapter numbers')
assertOk(helpModalSrc.includes('<strong>读完说明</strong><small>返回进入说明前的界面</small>'), 'help footer must use the flow-approved return copy')
assertOk(
  helpModalCssSrc.includes(`width: ${scaledPx(34)}`)
    && helpModalCssSrc.includes(`height: ${scaledPx(34)}`),
  'help close control must keep the approved hierarchy at 1.2x density',
)
assertOk(helpModalCssSrc.includes('border-radius: 50%'), 'help close control must remain circular')
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
    && worldSelectLogicSrc.includes('const selectedWorld = selectedWorldOverride ?? restoredWorld')
    && worldSelectLogicSrc.includes("useWorldSelectForm(existingWorldConfig?.difficulty ?? 'normal')"),
  'returning from world customization must restore the completed world selection and difficulty',
)
assertOk(worldSelectStageSrc.includes('世界规则摘要') && worldSelectStageSrc.includes('world.summary'), 'WF2 stage must keep the selected-world rule summary inside the large stage')
assertOk(
  worldSelectStageSrc.includes('difficultySection')
    && worldSelectStageSrc.includes('difficultyOptions')
    && worldSelectStageSrc.includes('人生难度')
    && worldSelectStageSrc.includes('challengeLabel')
    && worldSelectStageSrc.includes('type="button"')
    && worldSelectStageSrc.includes('onClick={logic.handleCycleDifficulty}')
    && !worldSelectStageSrc.includes('role="button"'),
  'difficulty controls must use the approved native cycle button inside the world-focus stage card',
)
assertOk(
  worldSelectMobileSrc.includes("['saved', '已保存']")
    && worldSelectMobileSrc.includes("['custom', '自定义']")
    && worldSelectMobileSrc.includes("['preset', '预设世界']")
    && worldSelectMobileSrc.includes('role="tablist"'),
  'WF2 directory must expose the approved saved/custom/preset source tabs',
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
  bottomActionBarCssSrc.includes(`min-height: ${scaledPx(52)}`)
    && bottomActionBarCssSrc.includes(`min-height: ${scaledPx(48)}`)
    && bottomActionBarCssSrc.includes(`width: ${scaledPx(38)}`)
    && bottomActionBarCssSrc.includes('position: absolute'),
  'WF2 floating bottom bar must use the approved unified 52/48/38 creation-flow hierarchy',
)
assertOk(
  worldSelectMobileSrc.includes('flow-responsive-viewport')
    && worldSelectMobileSrc.includes('flow-responsive-layout')
    && bottomActionBarSrc.includes('data-flow-bottom-bar'),
  'WF2 world select must use the native responsive viewport with a shared viewport-anchored bottom bar',
)
assertOk(
  worldSelectMainGridSrc.includes('event.stopPropagation()')
    && worldSelectDirectorySrc.includes('event.stopPropagation()')
    && worldSelectMainGridSrc.includes('handleRequestClearWorldCache')
    && worldSelectDirectorySrc.includes('handleRequestClearWorldCache')
    && !/\.cacheButton\s*\{\s*display:\s*none/.test(worldSelectCssSrc)
    && !/\.inlineCacheButton\s*\{\s*display:\s*none/.test(worldSelectCssSrc),
  'WF2 cached worlds must expose reset controls without selecting the underlying card',
)
assertOk(
  worldGeneratedCacheSrc.includes("const DESTINY_POOL_CACHE_PREFIX = 'mod-character:cache:destiny-pool:'")
    && worldGeneratedCacheSrc.includes('parseDestinyPoolWorldCode')
    && worldGeneratedCacheSrc.includes('parseDestinyPoolWorldCode(stripped) === worldCode'),
  'world cache scanning and clearing must include versioned destiny pools while remaining worldCode-scoped',
)
assertOk(
  worldSelectCacheDialogSrc.includes('role="alertdialog"')
    && worldSelectCacheDialogSrc.includes('aria-modal="true"')
    && worldSelectCacheDialogSrc.includes('不会删除世界、存档或其他世界的数据')
    && worldSelectCacheDialogSrc.includes("event.key === 'Escape'")
    && worldSelectCacheDialogSrc.includes("event.key !== 'Tab'"),
  'WF2 cache reset must use an explicit accessible confirmation dialog and disclose the preserved data',
)
assertOk(
  bottomActionBarSrc.includes('<span className={styles.confirmArrow}')
    && bottomActionBarSrc.includes('M5 12h14m-6-6 6 6-6 6')
    && !bottomActionBarSrc.includes('aria-hidden="true">→</span>'),
  'WF2 bottom action must use the approved centered SVG arrow instead of a font glyph',
)
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
  characterIdentitySrc.includes('01 / 03 · 姓名、性别与种族')
    && characterIdentitySrc.includes('必填 · 可随机')
    && !characterIdentitySrc.includes('姓名留空将自动生成')
    && !characterIdentitySrc.includes('可选 · 可随机'),
  'character identity copy must describe the required-name contract enforced by the confirmation action',
)
assertOk(characterIdentitySrc.includes('styles.softGroup') && !characterIdentitySrc.includes('divider'), 'N2A identity groups must use same-tone soft grouping without divider lines')
assertOk(characterCreateMobileSrc.includes('logic.background.trim()'), 'character summary must not treat whitespace-only background text as completed')
assertOk(characterBottomBarSrc.includes('<BottomActionBar') && characterBottomBarSrc.includes('onBack={logic.handleBack}') && characterBottomBarSrc.includes('onConfirm={logic.handleNext}'), 'N2A bottom bar must delegate back and confirm actions to the unified creation-flow control')
assertOk(
  bottomActionBarCssSrc.includes('.backButton')
    && bottomActionBarCssSrc.includes('.confirmButton')
    && bottomActionBarCssSrc.includes(`min-height: ${scaledPx(48)}`),
  'N2A bottom buttons must share the approved creation-flow control height',
)
assertOk(characterCreateCssSrc.includes('justify-content: space-between'), 'N2A bottom actions must align to opposite page edges')
assertOk(
  bottomActionBarCssSrc.includes(`min-height: ${scaledPx(52)}`)
    && bottomActionBarCssSrc.includes(`border-radius: ${scaledPx(18)}`),
  'N2A mobile CSS must keep the floating creation-flow bottom bar treatment',
)
assertOk(
  characterCreateLogicSrc.includes('const manualStartingAge = storedManualStartingAge')
    && characterCreateLogicSrc.includes('const parsedStartingAge = input.manualStartingAge')
    && characterCreateLogicSrc.includes('Number.parseInt(input.manualStartingAge, 10)')
    && characterCreateLogicSrc.includes('previewStartingAge: ageSetupPreview.startingAge')
    && characterCreateLogicSrc.includes('起始年龄必须小于预期寿命')
    && characterLifespanSrc.includes('logic.previewStartingAge === 0 ? \'出生\'')
    && characterBottomBarSrc.includes('confirmDisabled={!logic.canProceed}'),
  'character lifespan must retain an empty birth-age input, preview edits immediately, and block an age at or beyond the lifespan',
)
assertOk(characterCreateMobileSrc.trimEnd().split('\n').length <= 200, 'character create mobile composer must stay at or below the 200-line UI limit')
assertOk(productDecisionsSrc.includes('欢迎 → 世界选择 → 世界配置 → 角色创建'), 'PD-002 must preserve the live world-customize step before character creation')
assertOk(worldSelectMobileSrc.includes('<span>01 / 08</span>') && worldSelectBottomBarSrc.includes('confirmNumber="02"'), 'world selection must use the selected flow step-01 header and advance to step 02')
assertOk(worldCustomizeMobileSrc.includes('<span>02 / 08</span>') && worldCustomizeBottomBarSrc.includes('confirmNumber="03"'), 'world customization must use the selected flow step-02 header and advance to step 03')
assertOk(characterCreateMobileSrc.includes('<span>03 / 08</span>') && characterBottomBarSrc.includes('confirmNumber="04"'), 'character creation must use the selected flow step-03 header and advance to step 04')
assertOk(talentDrawPageSrc.includes("phase === 'selecting' ? '05' : '04'") && talentDrawPageSrc.includes("phase === 'selecting' ? '06' : '05'") && talentDrawPageSrc.includes("/ 08</span>"), 'talent draw and selection must occupy creation steps 04 and 05 before final review')
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
    && talentDrawPageSrc.includes('aria-label="十二道命印"'),
  'runtime talent draw must use the selected cloud-purple aura and twelve fate seals instead of the retired astrolabe',
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
    && /const\s+handleCandidateClick[\s\S]{0,260}handleSlotClick\(index\)/.test(talentDrawPageSrc)
    && !talentDrawPageSrc.includes('持续轮转')
    && talentDrawPageSrc.includes('visiblePatterns.length < DESTINY_PATTERN_DISPLAY_COUNT')
    && /completionTimerRef\.current\s*=\s*window\.setTimeout\([\s\S]{0,240}setPhase\('ready'\)[\s\S]{0,80}1000\)/.test(talentDrawPageSrc)
    && !talentDrawPageSrc.includes('可先进入选择'),
  'talent draw must reveal real progress, wait for all twelve candidates, and hold the completed seals for one second before handoff',
)
assertOk(
  talentDrawPageSrc.includes('useState<Array<number | null>>')
    && talentDrawPageSrc.includes('function createSelectedUiSlots')
    && talentDrawPageSrc.includes('Array.from({ length: DESTINY_PATTERN_SELECT_COUNT')
    && talentDrawPageSrc.includes('selectedUiSlots.map(')
    && talentDrawPageSrc.includes('setSelectedUiSlots((current) => current.map(')
    && talentDrawPageSrc.includes('index === uiSlotIndex ? null : value'),
  'MI-RF1-1 must keep three position-stable UI slots and clear a removed selection in place',
)

assertOk(
  hasCssDeclaration(talentDrawCssSrc, 'aura', 'width', scaledPx(220))
    && hasCssDeclaration(talentDrawCssSrc, 'aura', 'height', scaledPx(220))
    && hasCssDeclaration(talentDrawCssSrc, 'seals', 'grid-template-columns', 'repeat(4, minmax(0, 1fr))')
    && talentDrawCssSrc.includes(`.drawStageComplete .aura { top: ${scaledPx(224)};`)
    && talentDrawCssSrc.includes('.drawStageComplete .sealWrap { opacity: 0;')
    && talentDrawCssSrc.includes('.candidateList')
    && talentDrawCssSrc.includes(`min-height: ${scaledPx(76)}`)
    && talentDrawCssSrc.includes('.sealLit[data-rarity="传世"]'),
  'the selected draw ritual must keep its exact 220px aura, centered completion state, hidden seal handoff, and content-sized candidate rows',
)
assertOk(
  talentDrawPageSrc.includes('Array.from({ length: MYTHIC_PATTERN_SELECT_COUNT }')
    && talentDrawPageSrc.includes('selectedUiSlots.map(')
    && talentDrawPageSrc.includes('role="dialog"')
    && talentDrawCssSrc.includes('.rebirthSlotFilled')
    && talentDrawCssSrc.includes('.selectedSlotFilled')
    && talentDrawCssSrc.includes('animation: candidate-breathe')
    && talentDrawCssSrc.includes('animation: seal-breathe')
    && talentDrawCssSrc.includes('animation: rebirth-flow')
    && talentDrawCssSrc.includes('rebirth-seal-halo')
    && talentDrawCssSrc.includes('@keyframes rebirth-seal-halo'),
  'selected fate runtime must keep two rebirth slots, three ordinary slots, the bottom sheet, and all selected glow effects',
)
assertOk(
  talentDrawCssSrc.includes(`margin-right: ${scaledPx(8)}`)
    && talentDrawCssSrc.includes(`padding: ${scaledPx(14)} ${scaledPx(16)} ${scaledPx(96)}`)
    && talentDrawPageSrc.includes('confirmationRef.current')
    && talentDrawPageSrc.includes('destinyPatterns.patterns.length !== DESTINY_PATTERN_SELECT_COUNT')
    && talentDrawPageSrc.includes("window.location.assign('/attribute-alloc')")
    && talentDrawPageSrc.includes('三条普通命格已选择 · 进入属性分配'),
  'talent selection must preserve glow clearance and make one confirmation commit reliably without requiring a reincarnation talent',
)
assertOk(
  talentDrawPageSrc.includes('轮回天赋')
    && !talentDrawPageSrc.includes('转世天赋')
    && fatePreviewPageSrc.includes('轮回天赋')
    && !fatePreviewPageSrc.includes('转世天赋'),
  'the creation flow must use the current player-facing reincarnation-talent terminology without changing internal mythic contracts',
)
assertOk(fatePreviewPageSrc.includes('<span>07 / 08</span>') && fatePreviewPageSrc.includes('confirmNumber="08"') && !fatePreviewPageSrc.includes('CREATION FLOW ·') && !fatePreviewPageSrc.includes('FATE · PREVIEW'), 'fate preview must use the selected flow step-07 and close the creation flow')
assertOk(
  fatePreviewPageSrc.includes('useCreationStoresHydrated()')
    && fatePreviewPageSrc.includes("router.replace('/new-game/world-select')")
    && fatePreviewPageSrc.includes("router.replace('/new-game/character-create')")
    && fatePreviewPageSrc.includes("router.replace('/talent-draw')"),
  'fate preview must wait for persisted creation state and reject out-of-order direct entry',
)
assertOk(
  fatePreviewPageSrc.includes("status?.status === 'complete'")
    && fatePreviewPageSrc.includes('completedSteps === WORLD_INIT_STEPS.length')
    && fatePreviewPageSrc.includes('!aiComplete'),
  'fate preview must not unlock start from initialized=true when the explicit four-step status failed or is incomplete',
)
assertOk(!fatePreviewPageSrc.includes('maxWidth='), 'fate preview bottom bar must inherit the shared content-width token')
assertOk(
  globalCssSrc.includes('.final-flow-frame')
    && globalCssSrc.includes('.flow-responsive-viewport')
    && globalCssSrc.includes('.flow-responsive-layout')
    && globalCssSrc.includes('height: 100dvh')
    && globalCssSrc.includes('--final-flow-density-px: 1.2px')
    && globalCssSrc.includes('--final-flow-density-rem: 1.2rem')
    && globalCssSrc.includes('--final-flow-inline-unit: clamp(3.84px, 1.2vw, 5.16px)')
    && globalCssSrc.includes('--final-flow-block-unit: clamp(7.68px, 1.2dvh, 11.184px)')
    && globalCssSrc.includes('.final-flow-frame--core-simulation {')
    && globalCssSrc.includes('--final-flow-density-px: 1px')
    && globalCssSrc.includes('--final-flow-density-rem: 1rem')
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
  'runtime pages must use native 1.2x non-core density while the story reader keeps its tuned size without fixed-canvas or zoom scaling',
)
assertOk(
  [
    worldSelectCssSrc,
    worldCustomizeCssSrc,
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
  globalCssSrc.includes('position: fixed !important')
    && globalCssSrc.includes('env(safe-area-inset-bottom')
    && !globalCssSrc.includes('data-final-flow-mobile-height-fit')
    && !globalCssSrc.includes('data-final-flow-height-owner'),
  'mobile bottom actions must anchor to the safe viewport without runtime height back-calculation',
)
assertOk(
  welcomePageSrc.includes('final-flow-frame')
    && worldSelectMobileSrc.includes('final-flow-frame')
    && worldCustomizeMobileSrc.includes('final-flow-frame')
    && characterCreateMobileSrc.includes('final-flow-frame')
    && talentDrawPageSrc.includes('final-flow-frame')
    && fatePreviewPageSrc.includes('final-flow-frame')
    && gameStoryPageSrc.includes('final-flow-frame')
    && gameOverPageSrc.includes('final-flow-frame'),
  'all primary flow pages must wrap content in the shared final-flow viewport frame',
)
assertOk(
  [worldSelectCssSrc, worldCustomizeCssSrc, characterCreateCssSrc, talentDrawCssSrc, fatePreviewCssSrc, settingsModalCssSrc, helpModalCssSrc]
    .every((source) => source.includes('display: none') && (source.includes('.titleMark') || source.includes('titleMark'))),
  'selected B1 creation and auxiliary pages must hide title marks per the approved prototypes',
)
assertOk(
  gameOverCssSrc.includes('.header')
    && /\.header\s*\{[^}]*display:\s*none/s.test(gameOverCssSrc)
    && !gameOverPageSrc.includes('LIFE ARCHIVE · FINAL'),
  'game over must keep the approved identity-first composition without a legacy eyebrow header',
)
assertOk(
  gameOverPageSrc.includes('<GameOverRadar')
    && !gameOverPageSrc.includes('<RadarChart')
    && gameOverRadarSrc.includes('styles.metricTop')
    && gameOverRadarSrc.includes('styles.metricRight')
    && gameOverRadarSrc.includes('styles.metricBottom')
    && gameOverRadarSrc.includes('styles.metricLeft')
    && gameOverRadarSrc.includes('aria-pressed={activeIndex === index}')
    && gameOverRadarSrc.includes('activeIndex === index ? 4.4 : 3')
    && /\.radarGraph\s*\{[^}]*position:\s*relative;/s.test(gameOverCssSrc)
    && /\.metricButton\s*\{[^}]*position:\s*absolute;/s.test(gameOverCssSrc)
    && /\.metricTop\s*\{[^}]*top:\s*0;/s.test(gameOverCssSrc)
    && /\.metricRight\s*\{[^}]*right:/s.test(gameOverCssSrc)
    && /\.metricBottom\s*\{[^}]*bottom:\s*0;/s.test(gameOverCssSrc)
    && /\.metricLeft\s*\{[^}]*left:/s.test(gameOverCssSrc),
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
assertOk(worldCustomizeMobileSrc.includes('<WorldCustomizeDimensionCard') && worldCustomizeMobileSrc.includes('<WorldCustomizeBottomBar'), 'M2 world customization must compose approved dimension cards and bottom bar')
assertOk(worldCustomizeDimensionSrc.includes("['ai', 'adaptive', 'custom']") && worldCustomizeDimensionSrc.includes('AI') && worldCustomizeDimensionSrc.includes('选择') && worldCustomizeDimensionSrc.includes('自定'), 'M2 dimension card must expose the compact AI / 选择 / 自定 segmented control')
assertOk(worldCustomizeDimensionSrc.includes('aria-pressed=') && worldCustomizeDimensionSrc.includes('styles.modeActive'), 'M2 mode buttons must expose non-color selected state')
assertOk(worldCustomizeDimensionSrc.includes('styles.currentValue'), 'M2 dimension card must preserve the full-width current-value row')
assertOk(worldCustomizeBottomBarSrc.includes('<BottomActionBar') && worldCustomizeBottomBarSrc.includes('onBack={onBack}') && worldCustomizeBottomBarSrc.includes('onConfirm={onConfirm}'), 'world customization must use the shared-size unified bottom actions')
assertOk(
  worldCustomizeLogicSrc.includes("field.mode === 'adaptive' && !field.playerValue.trim()")
    && worldCustomizeLogicSrc.includes("field.mode === 'custom' && !field.customValue.trim()")
    && worldCustomizeLogicSrc.includes('const canSave = !isSaving && saveBlockReason === null')
    && worldCustomizeBottomBarSrc.includes('confirmDisabled={disabled}')
    && worldCustomizeMobileSrc.includes('canConfirm={logic.canSave}'),
  'world customization must block confirmation while a player-selected or custom rule is blank',
)
assertOk(
  worldCustomizeCssSrc.includes(`min-height: ${scaledPx(42)}`)
    && worldCustomizeMobileSrc.includes('worldConfig?.name')
    && worldCustomizeMobileSrc.includes('difficultyLabel'),
  'M2 world customization must use compact controls and bind the summary card to live world data',
)
assertOk(worldCustomizeMobileSrc.trimEnd().split('\n').length <= 200, 'world customization mobile composer must stay at or below the 200-line UI limit')

const informationPanelStart = gameStoryPageSrc.indexOf('id="current-information-panel"')
const informationActionsStart = gameStoryPageSrc.indexOf('className={styles.moreActions}', informationPanelStart)
const informationLedgerStart = gameStoryPageSrc.indexOf('className={styles.ledgerDisclosure}', informationPanelStart)
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
const chapterHeadStart = gameStoryPageSrc.indexOf('className={styles.chapterHead}', readingStart)
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
    && cssClassAvoidsValue(gameStoryCssSrc, 'chapterHead', 'position', 'sticky')
    && cssClassAvoidsValue(gameStoryCssSrc, 'chapterHead', 'position', 'fixed')
    && cssClassAvoidsValue(gameStoryCssSrc, 'chapterHead', 'position', 'absolute'),
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
  gameStoryPageSrc.includes('getAutoNarrativeRetryDelay')
    && gameStoryPageSrc.includes('runAutoNarrativeRetryAttempt')
    && gameStoryPageSrc.includes('invalidateAutoNarrativeRetry(autoRetryGateRef.current)')
    && gameStoryPageSrc.includes('setAutoRetryAttempt(attemptIndex + 1)')
    && gameStoryPageSrc.includes('advanceBlocked: !isRuntimeReady || hasUnresolvedBranch')
    && gameStoryPageSrc.includes('advanceText: narrativeAdvanceText')
    && gameStoryPageSrc.includes('advanceHint: narrativeAdvanceHint')
    && !gameStoryPageSrc.includes('handleNarrativeRetry'),
  'game story narrative errors must retry automatically and reuse the bottom timeline control for manual retry',
)
assertOk(
  gameStoryPageSrc.includes('resolveWorldDimensionLabels(worldConfig)')
    && fatePreviewPageSrc.includes('resolveWorldDimensionLabels(worldConfig)')
    && worldDimensionLabelsSrc.includes('worldConfig._dimensionValues')
    && worldDimensionLabelsSrc.includes('values?.powerSystem'),
  'fate preview and game story must prefer player-facing world dimension values over internal tags',
)
assertOk(
  worldConfigMappingSrc.includes("'普通人的知识、技能与社会资源': 'none'")
    && worldConfigMappingSrc.includes("POWER_SYSTEM_ZH_MAP[zh.trim()] ?? 'mixed'"),
  'custom power systems must not silently fall back to cultivation',
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
  newGamePageSrc.includes('void resetForNewLife()')
    && worldConfirmSrc.includes('await prepareNewLifeWorldCommit(worldCode)'),
  'canonical and direct world-selection entry paths must both prevent previous-life state from reaching a new world',
)
assertOk(
  !/\balert\s*\(/.test(worldConfirmSrc)
    && /throw new Error\(\s*'当前主叙事模型不可用/u.test(worldConfirmSrc)
    && worldSelectMobileSrc.includes('role="alert"'),
  'unavailable narrative configuration must stay inside the selected page instead of opening a native alert',
)
assertOk(
  !worldSelectCustomFormSrc.includes('maxLength=')
    && worldSelectCustomFormSrc.includes('{logic.customName.length} 字'),
  'custom world names must preserve complete input and expose only a non-destructive character count',
)

assertOk(
  JSON.stringify(prototypeRootEntries) === JSON.stringify(['assets', 'index.html', 'template'])
    && JSON.stringify(prototypeAssetEntries) === JSON.stringify(['library.css'])
    && JSON.stringify(prototypeTemplateEntries) === JSON.stringify(['iteration.html']),
  'the UI solution library must contain only the generic index, structural stylesheet, and reusable iteration template',
)
assertOk(
  prototypeIndexSrc.includes('data-library-purpose="generic-ui-iteration"')
    && prototypeIndexSrc.includes('href="template/iteration.html"')
    && prototypeIndexSrc.includes('当前不保留任何既定主题、定版稿或页面构图')
    && prototypeIndexSrc.includes('Runtime authority: none'),
  'the generic library index must start empty and explicitly reject runtime visual authority',
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
    && worldCustomizeDimensionSrc.includes('className="semantic-emoji"')
    && worldCustomizeDimensionSrc.includes('{field.icon}')
    && characterIdentitySrc.includes('data-semantic-emoji aria-hidden="true">👤</span>核心身份')
    && characterLifespanSrc.includes('data-semantic-emoji aria-hidden="true">⏳</span>寿命与起始')
    && characterBackgroundSrc.includes('data-semantic-emoji aria-hidden="true">📜</span>人生背景')
    && attributeAllocPageSrc.includes("icon: '💪'")
    && attributeAllocPageSrc.includes('className="semantic-emoji"')
    && attributeAllocPageSrc.includes('{attribute.icon}')
    && fatePreviewPageSrc.includes('data-semantic-emoji aria-hidden="true">🗺️</span>世界空间')
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
  [welcomeViewSrc, talentDrawPageSrc, settingsModalSrc, helpModalSurfaceSrc]
    .every(source => !source.includes('data-semantic-emoji')),
  'runtime welcome, talent selection, settings and help surfaces must remain free of forced semantic markers',
)
assertOk(
  hasCssDeclaration(gameOverCssSrc, 'footer', 'min-height', scaledPx(52))
    && gameOverCssSrc.includes('.barTool')
    && gameOverCssSrc.includes(`width: ${scaledPx(38)}`)
    && gameOverCssSrc.includes(`height: ${scaledPx(38)}`)
    && hasCssDeclaration(gameOverCssSrc, 'newLifeButton', 'min-height', scaledPx(48))
    && gameOverCssSrc.includes('.newLifeArrow')
    && gameOverCssSrc.includes(`width: ${scaledPx(25)}`)
    && gameOverCssSrc.includes(`height: ${scaledPx(25)}`)
    && gameOverPageSrc.includes("router.push('/welcome')")
    && gameOverPageSrc.includes('aria-label="查看模拟数据"')
    && gameOverPageSrc.includes('开始新人生')
    && gameOverPageSrc.includes('完成回望'),
  'runtime game-over footer must match the compact creation-flow hierarchy while preserving real actions only',
)
if (failed === 0) {
  console.log('PASS: mobile-ui-regression')
  process.exit(0)
}
process.exit(1)
