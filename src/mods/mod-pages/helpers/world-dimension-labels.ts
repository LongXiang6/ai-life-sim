import type { WorldConfig } from '@/mods/mod-world'

const SPATIAL_FORM_LABELS: Record<string, string> = {
  plane: '单一位面',
  universe: '宇宙',
  crystalSphere: '位面晶壁群系',
  multiverse: '多元宇宙群系',
  omniverse: '诸天万界',
}

const ESSENCE_LABELS: Record<string, string> = {
  modern: '现代都市',
  materialist: '唯物主义',
  cultivation: '仙侠修真',
  materialist_cultivation: '唯物修仙',
  idealist_cultivation: '唯心修仙',
  mixed: '混合世界观',
  wuxia: '武侠江湖',
  scifi: '科幻未来',
  westernFantasy: '西方奇幻',
  easternFantasy: '东方玄幻',
  postApocalyptic: '末日废土',
  survivalHorror: '生存恐怖',
  steampunk: '蒸汽朋克',
  lovecraftian: '克苏鲁神话',
  mythological: '神话时代',
  historical: '历史演义',
}

const POWER_SYSTEM_LABELS: Record<string, string> = {
  none: '无超自然',
  cultivation: '修仙体系',
  magic: '魔法体系',
  psi: '灵能 / 异能',
  technology: '科技体系',
  mixed: '混合体系',
  martial: '武学体系',
  faith: '信仰体系',
}

function resolveDimensionLabel(
  playerValue: string | undefined,
  internalValue: string,
  labels: Record<string, string>,
): string {
  return playerValue?.trim() || labels[internalValue] || internalValue || '未设定'
}

export function resolveWorldDimensionLabels(worldConfig: WorldConfig) {
  const values = worldConfig._dimensionValues

  return {
    spatialForm: resolveDimensionLabel(values?.universeScale, worldConfig.spatialForm, SPATIAL_FORM_LABELS),
    essence: resolveDimensionLabel(values?.worldviewEssence, worldConfig.essenceTag, ESSENCE_LABELS),
    powerSystem: resolveDimensionLabel(values?.powerSystem, worldConfig.powerSystemTag, POWER_SYSTEM_LABELS),
  }
}
