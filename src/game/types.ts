export type StatKey = 'pace' | 'shooting' | 'passing' | 'dribbling' | 'defending' | 'physical';

export const STAT_KEYS: StatKey[] = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'physical'];

export const STAT_LABEL: Record<StatKey, string> = {
  pace: '스피드',
  shooting: '슈팅',
  passing: '패스',
  dribbling: '드리블',
  defending: '수비',
  physical: '체력',
};

export type Position = 'GK' | 'LB' | 'CB' | 'RB' | 'CM' | 'CAM' | 'LW' | 'ST' | 'RW';

export type Stats = Record<StatKey, number>;

export interface Avatar {
  skin: number;
  hair: number;
  hairStyle: number;
  beard: number;
}

export interface Player {
  id: string;
  name: string;
  job: string;
  age: number;
  position: Position;
  /** 국적 코드 (data/nations) */
  nation: string;
  /** 특성 id (data/traits). 없으면 undefined */
  trait?: string;
  tier: number;
  stats: Stats;
  overall: number;
  avatar: Avatar;
}

/** 4-3-3 포메이션의 11자리. 인덱스가 곧 슬롯 번호. */
export const FORMATION: Position[] = ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CAM', 'LW', 'ST', 'RW'];

export type Line = 'atk' | 'mid' | 'def';

export interface TeamPower {
  atk: number;
  mid: number;
  def: number;
  total: number;
}

export type Currency = 'cash' | 'contacts' | 'gems' | 'boards' | 'whistles';

export const CURRENCY_LABEL: Record<Currency, string> = {
  cash: '회비',
  contacts: '연락처',
  gems: '젬',
  boards: '작전판',
  whistles: '호루라기',
};

export const CURRENCY_ICON: Record<Currency, string> = {
  cash: '💵',
  contacts: '📞',
  gems: '💎',
  boards: '📋',
  whistles: '📯',
};

export type Wallet = Record<Currency, number>;
export type Reward = Partial<Wallet>;
