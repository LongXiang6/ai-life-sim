export type TalentRarity = 'common' | 'fine' | 'rare' | 'epic' | 'legendary';

export interface TalentBadgeProps {
  name: string;
  rarity: TalentRarity;
  className?: string;
}
