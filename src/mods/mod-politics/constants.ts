import type { ConflictPhase, LawCategory, LegalSystemType } from './types'

export const CONFLICT_PHASE_ORDER: readonly ConflictPhase[] = ['forming', 'escalating', 'active', 'stalemate', 'resolving', 'resolved']
export const CONFLICT_PHASE_LABELS: Record<ConflictPhase, string> = {
  forming: '形成', escalating: '升级', active: '爆发', stalemate: '僵持', resolving: '缓和', resolved: '解决',
}
export const LAW_CATEGORY_LABELS: Record<LawCategory, string> = {
  criminal: '刑事', civil: '民事', economic: '经济', religious: '宗教', military: '军事', custom: '习惯',
}
export const LEGAL_SYSTEM_LABELS: Record<LegalSystemType, string> = {
  customary: '习惯规范', statutory: '成文法', religious: '宗教法', martial: '军事管制', normative: '共同规范', none: '无制度',
}
