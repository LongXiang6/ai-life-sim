/**
 * @module mobile-ui-regression.mjs
 * @description 用户定版移动端页面的结构、文案与响应式契约回归。
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

function assertOk(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`)
    failed++
  }
}

function countMatches(source, expression) {
  return [...source.matchAll(expression)].length
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
const globalCssSrc = readRel('src/app/globals.css')
const themeStoreSrc = readRel('src/core/theme/theme-store.ts')
const settingsParamCardSrc = readRel('src/mods/mod-settings/components/SettingsParamCard.tsx')
const settingsPresetsSrc = readRel('src/mods/mod-settings/components/SettingsTabPresets.tsx')
const preGenQueueSrc = readRel('src/mods/mod-engine/helpers/pre-gen-queue.ts')
const helpModalSrc = readRel('src/mods/mod-ui/components/organisms/HelpModal.tsx')
const helpFocusTrapSrc = readRel('src/mods/mod-ui/components/organisms/HelpModalFocusTrap.ts')
const helpNavigationSrc = readRel('src/mods/mod-ui/components/organisms/HelpModalNavigation.tsx')
const helpModalCssSrc = readRel('src/mods/mod-ui/components/organisms/HelpModal.module.css')
const disclaimerModalSrc = readRel('src/mods/mod-ui/components/organisms/DisclaimerModal.tsx')
const disclaimerModalCssSrc = readRel('src/mods/mod-ui/components/organisms/DisclaimerModal.module.css')
const helpModalSurfaceSrc = `${helpModalSrc}\n${helpNavigationSrc}`
const worldSelectMobileSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectMobile.tsx')
const worldSelectLogicSrc = readRel('src/mods/mod-pages/pages/world-select/useWorldSelectLogic.ts')
const worldSelectStageSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectStage.tsx')
const worldSelectDirectorySrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectDirectory.tsx')
const worldSelectMainGridSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectMainGrid.tsx')
const worldSelectBottomBarSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectBottomBar.tsx')
const worldSelectCssSrc = readRel('src/mods/mod-pages/pages/world-select/WorldSelectMobile.module.css')
const characterCreateMobileSrc = readRel('src/mods/mod-pages/pages/character-create/CharacterCreateMobile.tsx')
const characterCreatePageSrc = readRel('src/mods/mod-pages/pages/character-create/page.tsx')
const characterIdentitySrc = readRel('src/mods/mod-pages/pages/character-create/CharacterIdentitySection.tsx')
const characterCreateLogicSrc = readRel('src/mods/mod-pages/pages/character-create/useCharacterCreateLogic.ts')
const characterLifespanSrc = readRel('src/mods/mod-pages/pages/character-create/CharacterLifespanSection.tsx')
const characterBottomBarSrc = readRel('src/mods/mod-pages/pages/character-create/CharacterCreateBottomBar.tsx')
const characterCreateCssSrc = readRel('src/mods/mod-pages/pages/character-create/CharacterCreateMobile.module.css')
const talentDrawPageSrc = readRel('src/mods/mod-pages/pages/talent-draw/page.tsx')
const talentAstrolabeSrc = readRel('src/mods/mod-pages/pages/talent-draw/TalentAstrolabe.tsx')
const talentDrawCssSrc = readRel('src/mods/mod-pages/pages/talent-draw/TalentDraw.module.css')
const attributeAllocPageSrc = readRel('src/mods/mod-pages/pages/attribute-alloc/page.tsx')
const productDecisionsSrc = readRel('docs/product-decisions.md')
const worldCustomizeMobileSrc = readRel('src/mods/mod-pages/pages/world-customize/WorldCustomizeMobile.tsx')
const worldCustomizePageSrc = readRel('src/mods/mod-pages/pages/world-customize/page.tsx')
const worldCustomizeLogicSrc = readRel('src/mods/mod-pages/pages/world-customize/useWorldCustomize.ts')
const worldCustomizeDimensionSrc = readRel('src/mods/mod-pages/pages/world-customize/WorldCustomizeDimensionCard.tsx')
const worldCustomizeBottomBarSrc = readRel('src/mods/mod-pages/pages/world-customize/WorldCustomizeBottomBar.tsx')
const worldCustomizeCssSrc = readRel('src/mods/mod-pages/pages/world-customize/WorldCustomizeMobile.module.css')
const gameStoryPageSrc = readRel('src/mods/mod-pages/pages/game-story/page.tsx')
const gameStoryCssSrc = readRel('src/mods/mod-pages/pages/game-story/GameStory.module.css')
const narrativeTimelineSrc = readRel('src/mods/mod-ui/components/organisms/NarrativeTimeline.tsx')
const narrativeTimelineCssSrc = readRel('src/mods/mod-ui/components/organisms/NarrativeTimeline.module.css')
const fatePreviewPageSrc = readRel('src/mods/mod-pages/pages/fate-preview/page.tsx')
const fatePreviewCssSrc = readRel('src/mods/mod-pages/pages/fate-preview/FatePreview.module.css')
const worldDimensionLabelsSrc = readRel('src/mods/mod-pages/helpers/world-dimension-labels.ts')
const worldConfigMappingSrc = readRel('src/mods/mod-world/utils/world-config-mapping.ts')
const saveManagerPageSrc = readRel('src/mods/mod-pages/pages/save-manager/page.tsx')
const saveManagerCssSrc = readRel('src/mods/mod-pages/pages/save-manager/save-manager.module.css')
const gameOverPageSrc = readRel('src/mods/mod-pages/pages/game-over/page.tsx')
const gameOverRadarSrc = readRel('src/mods/mod-pages/pages/game-over/GameOverRadar.tsx')
const gameOverShareCardSrc = readRel('src/mods/mod-pages/pages/game-over/game-over-share-card.ts')
const gameOverCssSrc = readRel('src/mods/mod-pages/pages/game-over/GameOver.module.css')

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
  attributeAllocPageSrc.includes("router.replace('/fate-preview')")
    && !attributeAllocPageSrc.includes('TOTAL_POINTS')
    && !attributeAllocPageSrc.includes('setCharacterBase'),
  'the retired attribute-allocation address must be a compatibility redirect with no allocation behavior',
)
assertOk(welcomePageSrc.includes("import WelcomeView from './WelcomeView'"), 'welcome page must use the single responsive WelcomeView')
assertOk(!welcomePageSrc.includes('useIsMobile'), 'welcome page must not switch desktop/mobile DOM after hydration')
assertOk(welcomePageSrc.includes('<WelcomeView'), 'welcome page must render WelcomeView exactly once')
assertOk(welcomeViewSrc.includes('一生很长，') && welcomeViewSrc.includes('也只由几次选择组成。'), 'welcome title must use the approved T2 copy')
assertOk(welcomeViewSrc.includes('选择世界与角色，走过关系、机会、代价和告别。'), 'welcome introduction must use the approved copy without the removed resources/origin attribute')
assertOk(welcomeViewSrc.includes('开始新人生'), 'welcome primary action must use the approved T2 label')
assertOk(welcomeViewSrc.includes('aria-hidden="true"') && welcomeViewSrc.includes('styles.trajectory'), 'welcome must render the approved decorative T3 trajectory')
assertOk(/latestSave\s*&&\s*\(/.test(welcomeViewSrc), 'continue action must only appear when a save exists')
assertOk(
  welcomeViewSrc.includes('onDeleteSave={onDeleteSave}')
    && welcomeSaveSheetSrc.includes('删除已选择的存档')
    && welcomeSaveSheetSrc.includes('role="alertdialog"')
    && welcomeSaveSheetSrc.includes('确认删除')
    && welcomeSaveSheetSrc.includes('onDeleteSave(deleteTarget.slot)')
    && welcomeCssSrc.includes('.deleteDialogOverlay')
    && welcomeCssSrc.includes('.deleteConfirm'),
  'welcome save selection must expose a destructive delete action with an explicit second-confirmation dialog',
)
assertOk(!/[🎮⚙️📖]/u.test(welcomeViewSrc), 'welcome actions must not use the rejected emoji icon treatment')
assertOk(welcomeCssSrc.includes('height: 100dvh') && welcomeCssSrc.includes('overflow-y: auto'), 'welcome responsive shell must use a dynamic viewport scroll container')
assertOk(welcomeCssSrc.includes('env(safe-area-inset-bottom)'), 'welcome actions must account for the mobile bottom safe area')

assertOk(!/[🎨🤖🔌📝⚙️]/u.test(settingsModalSrc), 'approved settings tabs and title must not use emoji icons')
assertOk(settingsModalSrc.includes('role="tablist"'), 'settings navigation must expose a tablist')
assertOk(settingsModalSrc.includes('role="tab"') && settingsModalSrc.includes('aria-selected='), 'settings tabs must expose selected state')
assertOk(
  settingsModalSrc.includes("event.key === 'ArrowRight'")
    && settingsModalSrc.includes('tabIndex={activeTab === tab.id ? 0 : -1}'),
  'settings tabs must use the approved roving focus and arrow-key model',
)
assertOk(settingsModalCssSrc.includes('flex: 0 0 auto'), 'settings tabs must keep the approved compact horizontal sizing')
assertOk(/\.tabActive\s*\{[^}]*background:\s*#fff;[^}]*color:\s*#6d7f94;/s.test(settingsModalCssSrc), 'active settings tab must use the approved white-on-soft navigation treatment')
assertOk(settingsModalCssSrc.includes('100dvh'), 'mobile settings sheet must use the dynamic viewport height')
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
assertOk(settingsModalCssSrc.includes('width: 2.125rem') && settingsModalCssSrc.includes('height: 2.125rem'), 'settings close control must use the shared 34px visual size')
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
  settingsPresetsSrc.includes("setProvider('custom')")
    && settingsPresetsSrc.includes("provider === 'custom' ? (")
    && settingsPresetsSrc.includes('setCustomUrl(event.target.value)')
    && settingsPresetsSrc.includes('setCustomModel(event.target.value)'),
  'custom API URL or model edits must route real narrative calls through the custom provider',
)
assertOk(
  !settingsPresetsSrc.includes('extraParamEnabled')
    && !settingsPresetsSrc.includes('extraParamName')
    && settingsPresetsSrc.includes('尚未开放')
    && settingsPresetsSrc.includes('当前版本不会把额外参数写入 AI 请求'),
  'unwired custom API parameters must be non-interactive and explicitly marked unavailable',
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
assertOk(helpModalCssSrc.includes('width: 2.125rem') && helpModalCssSrc.includes('height: 2.125rem'), 'help close control must keep the approved 34px visual size')
assertOk(helpModalCssSrc.includes('border-radius: 50%'), 'help close control must remain circular')
assertOk(helpModalCssSrc.includes('100dvh'), 'mobile help sheet must use the dynamic viewport height')
assertOk(helpModalSrc.trimEnd().split('\n').length <= 200, 'help modal component must stay at or below the 200-line UI limit')

assertOk(!worldSelectMobileSrc.includes('BottomActionBar'), 'WF2 world select must use its compact page-specific bottom bar')
assertOk(worldSelectMobileSrc.includes('<WorldSelectStage') && worldSelectMobileSrc.includes('<WorldSelectDirectory'), 'WF2 world select must compose the approved stage and independent directory')
assertOk(worldSelectMobileSrc.includes('role="tablist"') && worldSelectMobileSrc.includes('role="tab"') && worldSelectMobileSrc.includes('aria-selected=') && worldSelectMobileSrc.includes('role="tabpanel"'), 'world source switching must preserve the approved tab and panel semantics')
assertOk(
  worldSelectLogicSrc.includes('resolveRestoredWorld(existingWorldConfig, existingWorldCode, savedWorlds)')
    && worldSelectLogicSrc.includes('const selectedWorld = selectedWorldOverride ?? restoredWorld')
    && worldSelectLogicSrc.includes("useWorldSelectForm(existingWorldConfig?.difficulty ?? 'normal')"),
  'returning from world customization must restore the completed world selection and difficulty',
)
assertOk(worldSelectStageSrc.includes('世界规则摘要') && worldSelectStageSrc.includes('world.summary'), 'WF2 stage must keep the selected-world rule summary inside the large stage')
assertOk(!worldSelectStageSrc.includes('difficulty'), 'difficulty controls must not appear inside the WF2 stage')
assertOk(worldSelectDirectorySrc.includes('aria-expanded=') && worldSelectDirectorySrc.includes('更多世界') && worldSelectDirectorySrc.includes('已保存世界') && worldSelectDirectorySrc.includes('自定义世界'), 'WF2 directory must expose three independent inline disclosures')
assertOk(
  worldSelectMobileSrc.includes('styles.difficultySection')
    && worldSelectMobileSrc.includes('人生难度')
    && worldSelectMobileSrc.includes('logic.difficultyItems.map')
    && worldSelectMobileSrc.includes('aria-pressed={Boolean(item.icon)}'),
  'WF2 world select body must render the runtime-provided difficulty options with selected state',
)
assertOk(
  !worldSelectBottomBarSrc.includes('logic.difficultyItems')
    && worldSelectBottomBarSrc.includes('onClick={logic.handleBack}')
    && worldSelectBottomBarSrc.includes('onClick={logic.handleConfirm}')
    && worldSelectBottomBarSrc.includes('disabled={!logic.selectedWorld || logic.isConfirming}'),
  'WF2 compact bottom bar must keep back/confirm actions and disabled confirmation semantics',
)
assertOk(worldSelectCssSrc.includes('height: 2rem') && !worldSelectCssSrc.includes('48px'), 'WF2 compact bottom controls must use the approved 32px visual height without 48px sizing')
assertOk(
  /\.page\s*\{[^}]*height:\s*100dvh;[^}]*overflow-y:\s*auto;/s.test(worldSelectCssSrc)
    && worldSelectCssSrc.includes('scroll-padding-bottom: calc(5.5rem + env(safe-area-inset-bottom))'),
  'WF2 world select must own a dynamic-viewport scroll container with fixed-bottom-bar clearance',
)
assertOk(
  /\.cacheButton,\s*\.inlineCacheButton\s*\{[^}]*width:\s*2rem;[^}]*height:\s*2rem;/s.test(worldSelectCssSrc)
    && /\.savedActions button\s*\{[^}]*min-height:\s*2rem;/s.test(worldSelectCssSrc)
    && worldSelectMainGridSrc.includes('event.stopPropagation()')
    && worldSelectDirectorySrc.includes('event.stopPropagation()'),
  'WF2 cache controls, including saved-world text actions, must expose a stable 32px hit area without selecting the underlying world card',
)
assertOk(worldSelectMobileSrc.trimEnd().split('\n').length <= 200, 'world select mobile composer must stay at or below the 200-line UI limit')

assertOk(!characterCreateMobileSrc.includes('BottomActionBar'), 'N2A character create must use its page-specific edge-aligned bottom bar')
assertOk(characterCreateMobileSrc.includes('<CharacterIdentitySection') && characterCreateMobileSrc.includes('<CharacterLifespanSection') && characterCreateMobileSrc.includes('<CharacterBackgroundSection'), 'N2A character create must compose identity, lifespan, and background sections')
assertOk(characterCreateMobileSrc.includes('role="tablist"') && characterCreateMobileSrc.includes('role="tabpanel"') && characterCreateMobileSrc.includes('hidden={activePanel'), 'character creation must keep identity, lifespan, and background in one accessible tabbed surface')
assertOk(characterIdentitySrc.includes('角色姓名') && characterIdentitySrc.includes('性别') && characterIdentitySrc.includes('种族'), 'N2A identity section must preserve all three core identity groups')
assertOk(
  characterIdentitySrc.includes('姓名为必填项')
    && characterIdentitySrc.includes('必填 · 可随机')
    && !characterIdentitySrc.includes('姓名留空将自动生成')
    && !characterIdentitySrc.includes('可选 · 可随机'),
  'character identity copy must describe the required-name contract enforced by the confirmation action',
)
assertOk(characterIdentitySrc.includes('styles.softGroup') && !characterIdentitySrc.includes('divider'), 'N2A identity groups must use same-tone soft grouping without divider lines')
assertOk(characterCreateMobileSrc.includes('logic.background.trim()'), 'character summary must not treat whitespace-only background text as completed')
assertOk(characterBottomBarSrc.includes('styles.backButton') && characterBottomBarSrc.includes('styles.confirmButton'), 'N2A bottom bar must expose dedicated back and confirm sizing')
assertOk(characterCreateCssSrc.includes('.backButton') && characterCreateCssSrc.includes('.confirmButton') && characterCreateCssSrc.includes('height: 2rem'), 'N2A bottom buttons must share the approved 32px control height')
assertOk(characterCreateCssSrc.includes('justify-content: space-between'), 'N2A bottom actions must align to opposite page edges')
assertOk(!characterCreateCssSrc.includes('48px'), 'N2A mobile CSS must not reintroduce mechanical 48px controls')
assertOk(
  characterCreateLogicSrc.includes('storedAgeSetup && storedAgeSetup.startingAge > 0')
    && characterCreateLogicSrc.includes('previewStartingAge: ageSetupPreview.startingAge')
    && characterCreateLogicSrc.includes('起始年龄必须小于预期寿命')
    && characterLifespanSrc.includes('logic.previewStartingAge === 0 ? \'出生\'')
    && characterBottomBarSrc.includes('disabled={!logic.canProceed}'),
  'character lifespan must retain an empty birth-age input, preview edits immediately, and block an age at or beyond the lifespan',
)
assertOk(characterCreateMobileSrc.trimEnd().split('\n').length <= 200, 'character create mobile composer must stay at or below the 200-line UI limit')
assertOk(productDecisionsSrc.includes('欢迎 → 世界选择 → 世界配置 → 角色创建'), 'PD-002 must preserve the live world-customize step before character creation')
assertOk(worldSelectMobileSrc.includes('<span>02 / 07</span>') && !worldSelectMobileSrc.includes('WORLD · ORIGIN') && worldSelectBottomBarSrc.includes('nextNumber}>03'), 'world selection must use the unified step-02 header and advance to step 03')
assertOk(worldCustomizeMobileSrc.includes('<span>03 / 07</span>') && !worldCustomizeMobileSrc.includes('WORLD · CHARTER') && worldCustomizeBottomBarSrc.includes('nextNumber}>04'), 'world customization must use the unified step-03 header and advance to step 04')
assertOk(characterCreateMobileSrc.includes('<span>04 / 07</span>') && !characterCreateMobileSrc.includes('CHARACTER · ORIGIN') && characterBottomBarSrc.includes('nextNumber}>05'), 'character creation must use the unified step-04 header and advance to step 05')
assertOk(talentDrawPageSrc.includes("phase === 'selecting' ? '06' : '05'") && talentDrawPageSrc.includes("phase === 'selecting' ? '07' : '06'") && talentDrawPageSrc.includes("/ 07</span>"), 'talent draw and selection must occupy creation steps 05 and 06 before final review')
assertOk(
  !talentDrawPageSrc.includes('CREATION FLOW ·')
    && talentDrawCssSrc.includes('.titleMark::after')
    && !/\.titleMark\s*\{[^}]*border-radius:\s*50%/s.test(talentDrawCssSrc),
  'talent draw header must use the unified title block instead of the legacy eyebrow and round seal',
)
assertOk(
  /import\s+(?:\{[^}]*\bTalentAstrolabe\b[^}]*\}|TalentAstrolabe)\s+from\s+['"]\.\/TalentAstrolabe['"]/.test(talentDrawPageSrc)
    && countMatches(talentDrawPageSrc, /<TalentAstrolabe\b/g) === 1,
  'TD-RF17-1 and MI-RF1-1 must share exactly one runtime TalentAstrolabe instance',
)
assertOk(
  talentAstrolabeSrc.includes('aria-label="五星位命格星盘"')
    && talentAstrolabeSrc.includes('<span aria-hidden="true">命</span>'),
  'the shared talent astrolabe must preserve the approved five-position identity and center glyph',
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
    && /const\s+handleTurnAstrolabe[\s\S]{0,360}handleFocusSlot\(next\)/.test(talentDrawPageSrc)
    && talentDrawPageSrc.includes('onTurn={handleTurnAstrolabe}')
    && talentDrawPageSrc.includes('五条命格已就绪 · 由你手动转动命盘')
    && !talentDrawPageSrc.includes('持续轮转')
    && talentAstrolabeSrc.includes('aria-label="转动命格星盘"')
    && talentAstrolabeSrc.includes('eventRippleMain')
    && !talentAstrolabeSrc.includes('eventRippleTail'),
  'the shared astrolabe must rotate only from player input and emit one large ripple per turn',
)
assertOk(
  /const\s+\[selectedUiSlots,\s*setSelectedUiSlots\]\s*=\s*useState<\(number\s*\|\s*null\)\[\]>/.test(talentDrawPageSrc)
    && /function\s+createSelectedUiSlots[\s\S]{0,240}Array\.from\(\{\s*length:\s*DESTINY_PATTERN_SELECT_COUNT\s*\}/.test(talentDrawPageSrc)
    && (
      /selectedUiSlots\.map\(\s*\([^)]*,\s*\w+\)\s*=>\s*\{/.test(talentDrawPageSrc)
      || /Array\.from\(\{\s*length:\s*DESTINY_PATTERN_SELECT_COUNT\s*\},\s*\(_,\s*(\w+)\)\s*=>\s*\{[\s\S]{0,240}selectedUiSlots\[\1\]/.test(talentDrawPageSrc)
    )
    && /setSelectedUiSlots\([\s\S]{0,180}\.map\([\s\S]{0,180}null/.test(talentDrawPageSrc),
  'MI-RF1-1 must keep three position-stable UI slots and clear a removed selection in place',
)

const astrolabeWidths = cssDeclarationValues(talentDrawCssSrc, 'astrolabe', 'width')
const astrolabeHeights = cssDeclarationValues(talentDrawCssSrc, 'astrolabe', 'height')
const fateNodeWidths = cssDeclarationValues(talentDrawCssSrc, 'fateNode', 'width')
const fateNodeHeights = cssDeclarationValues(talentDrawCssSrc, 'fateNode', 'height')
assertOk(
  astrolabeWidths.includes('286px')
    && astrolabeHeights.includes('286px')
    && astrolabeWidths.every((value) => value === '286px')
    && astrolabeHeights.every((value) => value === '286px'),
  'the shared astrolabe must remain exactly 286px in draw and selection layouts without responsive shrinking',
)
assertOk(
  fateNodeWidths.includes('48px')
    && fateNodeHeights.includes('48px')
    && fateNodeWidths.every((value) => value === '48px')
    && fateNodeHeights.every((value) => value === '48px'),
  'all TalentAstrolabe fate nodes must preserve the approved 48px size',
)
assertOk(fatePreviewPageSrc.includes('<span>07 / 07</span>') && !fatePreviewPageSrc.includes('FATE · PREVIEW') && fatePreviewPageSrc.includes('confirmNumber="完成"'), 'fate preview must use the unified final step and close the creation flow')
assertOk(
  fatePreviewPageSrc.includes('useCreationStoresHydrated()')
    && fatePreviewPageSrc.includes("router.replace('/new-game/world-select')")
    && fatePreviewPageSrc.includes("router.replace('/new-game/character-create')")
    && fatePreviewPageSrc.includes("router.replace('/talent-draw')"),
  'fate preview must wait for persisted creation state and reject out-of-order direct entry',
)
assertOk(
  fatePreviewPageSrc.includes("worldInitAIStatus?.status === 'complete'")
    && fatePreviewPageSrc.includes('WORLD_INIT_STEPS.every')
    && fatePreviewPageSrc.includes('!aiComplete'),
  'fate preview must not unlock start from initialized=true when the explicit four-step status failed or is incomplete',
)
assertOk(!fatePreviewPageSrc.includes('maxWidth='), 'fate preview bottom bar must inherit the shared content-width token')
assertOk(
  layoutCssSrc.includes('--content-max-width: 42rem;')
    && layoutCssSrc.includes('--non-simulation-ui-desktop-scale: 1.1;')
    && /@media \(max-width: 767px\)[\s\S]*--content-max-width:\s*42rem;/.test(layoutCssSrc)
    && /@media \(max-width: 767px\)[\s\S]*--content-max-width:\s*42rem;/.test(mobileBaseCssSrc),
  'book surfaces must keep one 42rem cap across 767→768 while min(100%, token) keeps narrow mobile fluid',
)
assertOk(
  [worldSelectCssSrc, worldCustomizeCssSrc, characterCreateCssSrc].every((source) => (
    /@media \(min-width: 64rem\)/.test(source)
      && source.includes('--content-max-width: 48rem;')
      && source.includes('--font-size-base: 1.0625rem;')
  ))
    && [welcomeCssSrc, talentDrawCssSrc, fatePreviewCssSrc, saveManagerCssSrc].every((source) => (
      source.includes('zoom: var(--non-simulation-ui-desktop-scale);')
    ))
    && /@media \(min-width: 64rem\)[\s\S]*\.drawCopy > p,[\s\S]*font-size: 10px;/.test(talentDrawCssSrc)
    && !gameStoryCssSrc.includes('--non-simulation-ui-desktop-scale'),
  'non-simulation pages must gain a modest desktop reading scale while game-story keeps its current density',
)
const sharedDesktopWidthRules = [
  [welcomeCssSrc, 'container', 'width', 'min(100%, var(--content-max-width))'],
  [worldSelectCssSrc, 'container', 'max-width', 'var(--content-max-width)'],
  [worldCustomizeCssSrc, 'container', 'max-width', 'var(--content-max-width)'],
  [characterCreateCssSrc, 'container', 'max-width', 'var(--content-max-width)'],
  [talentDrawCssSrc, 'book', 'width', 'min(100%, var(--content-max-width))'],
  [fatePreviewCssSrc, 'paper', 'width', 'min(100%, var(--content-max-width))'],
  [gameStoryCssSrc, 'bookShell', 'width', 'min(100%, var(--content-max-width))'],
  [gameOverCssSrc, 'book', 'width', 'min(100%, var(--content-max-width))'],
  [saveManagerCssSrc, 'frame', 'width', 'min(100%, var(--content-max-width))'],
  [settingsModalCssSrc, 'modalFrame', 'width', 'min(100%, var(--content-max-width))'],
  [helpModalCssSrc, 'modalFrame', 'width', 'min(100%, var(--content-max-width))'],
  [disclaimerModalCssSrc, 'frame', 'width', 'min(100%, var(--content-max-width))'],
]
assertOk(
  sharedDesktopWidthRules.every(([source, className, property, value]) => (
    hasCssDeclaration(source, className, property, value)
  )),
  'all primary pages and full-screen sheets must use one shared desktop book width',
)
assertOk(
  [worldSelectCssSrc, worldCustomizeCssSrc, characterCreateCssSrc, talentDrawCssSrc, fatePreviewCssSrc, settingsModalCssSrc, helpModalCssSrc, gameOverCssSrc]
    .every((source) => source.includes('titleMark::after') || source.includes('titleSeal::after')),
  'all flow title marks must preserve the approved outer diamond and inner circle',
)
assertOk(
  !gameOverPageSrc.includes('LIFE ARCHIVE · FINAL')
    && gameOverCssSrc.includes('.titleSeal::after')
    && !/\.titleSeal\s*\{[^}]*display:\s*none/s.test(gameOverCssSrc),
  'game over must keep the approved compact title mark visible on mobile without the legacy eyebrow',
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
    && /\.metricButton\s*\{[^}]*position:\s*absolute;[^}]*width:\s*40px;[^}]*height:\s*31px;/s.test(gameOverCssSrc)
    && /\.metricButton span\s*\{[^}]*font-size:\s*6px;/s.test(gameOverCssSrc)
    && /\.metricButton strong\s*\{[^}]*font-size:\s*8px;/s.test(gameOverCssSrc)
    && /\.metricTop\s*\{[^}]*top:\s*0;[^}]*left:\s*106px;/s.test(gameOverCssSrc)
    && /\.metricRight\s*\{[^}]*top:\s*76px;[^}]*right:\s*0;/s.test(gameOverCssSrc)
    && /\.metricBottom\s*\{[^}]*bottom:\s*0;[^}]*left:\s*106px;/s.test(gameOverCssSrc)
    && /\.metricLeft\s*\{[^}]*top:\s*76px;[^}]*left:\s*0;/s.test(gameOverCssSrc),
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
    && /\.shareFactGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s.test(gameOverCssSrc)
    && /@media\s*\(max-width:\s*340px\)[\s\S]*\.shareFactGrid,[\s\S]*\.shareActions\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s.test(gameOverCssSrc),
  'game over must expose a local fact-only share card with Web Share, PNG fallback and 320px reflow',
)
assertOk(worldCustomizeMobileSrc.includes('<WorldCustomizeDimensionCard') && worldCustomizeMobileSrc.includes('<WorldCustomizeBottomBar'), 'M2 world customization must compose approved dimension cards and bottom bar')
assertOk(worldCustomizeDimensionSrc.includes("['ai', 'adaptive', 'custom']") && worldCustomizeDimensionSrc.includes('AI') && worldCustomizeDimensionSrc.includes('选择') && worldCustomizeDimensionSrc.includes('自定'), 'M2 dimension card must expose the compact AI / 选择 / 自定 segmented control')
assertOk(worldCustomizeDimensionSrc.includes('aria-pressed=') && worldCustomizeDimensionSrc.includes('styles.modeActive'), 'M2 mode buttons must expose non-color selected state')
assertOk(worldCustomizeDimensionSrc.includes('styles.currentValue'), 'M2 dimension card must preserve the full-width current-value row')
assertOk(worldCustomizeBottomBarSrc.includes('styles.backButton') && worldCustomizeBottomBarSrc.includes('styles.confirmButton'), 'world customization must use the shared-size edge-aligned bottom actions')
assertOk(
  worldCustomizeLogicSrc.includes("field.mode === 'adaptive' && !field.playerValue.trim()")
    && worldCustomizeLogicSrc.includes("field.mode === 'custom' && !field.customValue.trim()")
    && worldCustomizeLogicSrc.includes('const canSave = !isSaving && saveBlockReason === null')
    && worldCustomizeBottomBarSrc.includes('disabled={disabled}')
    && worldCustomizeMobileSrc.includes('canConfirm={logic.canSave}'),
  'world customization must block confirmation while a player-selected or custom rule is blank',
)
assertOk(worldCustomizeCssSrc.includes('height: 2rem') && !worldCustomizeCssSrc.includes('48px'), 'M2 world customization must use compact controls without 48px sizing')
assertOk(worldCustomizeMobileSrc.trimEnd().split('\n').length <= 200, 'world customization mobile composer must stay at or below the 200-line UI limit')

assertOk(
  gameStoryPageSrc.includes('const includeCreationPatternBonus = totalRounds === 0')
    && gameStoryPageSrc.includes('includeCreationPatternBonus ? (patternBonus[k] ?? 0) : 0'),
  'game story must only add preview-time destiny bonuses before the runtime character state is synchronized',
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
  gameStoryPageSrc.includes('if (narrativeError || !isRuntimeReady')
    && gameStoryPageSrc.includes('onClick={handleNarrativeRetry}>重新尝试</button>')
    && gameStoryPageSrc.includes('advanceBlocked={!isRuntimeReady || hasUnresolvedBranch || Boolean(narrativeError)}')
    && gameStoryPageSrc.includes('请使用上方“重新尝试”恢复本段故事'),
  'game story narrative errors must leave retry as the only advancing action and block the normal timeline control',
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

if (failed === 0) {
  console.log('PASS: mobile-ui-regression')
  process.exit(0)
}
process.exit(1)
