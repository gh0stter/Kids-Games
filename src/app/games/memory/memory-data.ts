export interface Animal {
  emoji: string;
  name: string;
}

export const ANIMALS: Animal[] = [
  { emoji: '🐶', name: '小狗' },
  { emoji: '🐱', name: '小猫' },
  { emoji: '🐰', name: '小兔子' },
  { emoji: '🐻', name: '小熊' },
  { emoji: '🐼', name: '熊猫' },
  { emoji: '🐸', name: '青蛙' },
  { emoji: '🐵', name: '小猴子' },
  { emoji: '🐷', name: '小猪' },
  { emoji: '🦁', name: '狮子' },
  { emoji: '🐘', name: '大象' },
  { emoji: '🐧', name: '企鹅' },
  { emoji: '🦒', name: '长颈鹿' },
];

export const ALL_FOUND = '全部找到啦！';

export const VOICE_LINES = ANIMALS.map((a) => a.name);
export const CHEER_LINES = [ALL_FOUND];
