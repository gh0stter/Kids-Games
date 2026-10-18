/** 一层磁力片的高度（地块边长是 1） */
export const FLOOR_H = 0.3;
/** 每栋楼最多几层 */
export const MAX_FLOORS = 120;
/** 盖到这一层变成台北 101 */
export const TAIPEI_101 = 101;

/** 海浪高度（层），随机 */
export const MIN_WAVE = 5;
export const MAX_WAVE = 100;

export type EventKind = 'meteor' | 'quake' | 'volcano';
export const EVENTS: EventKind[] = ['meteor', 'quake', 'volcano'];
export const EVENT_LINES: Record<EventKind, string> = {
  meteor: '陨石掉下来啦！',
  quake: '地震啦！',
  volcano: '火山爆发啦！',
};
export const EVENT_EMOJI: Record<EventKind, string> = { meteor: '☄️', quake: '💥', volcano: '🌋' };

export const floorLine = (n: number): string => String(n);
export const waveLine = (n: number): string => `海浪有${n}层楼高！`;
export const BLOCKED = '挡住啦！';
export const ALL_SAFE = '大家都安全！';
export const SOME_LOST = '有的被冲走了，再盖高一点吧！';
export const REBUILD = '重新盖起来！';
export const TAIPEI = '台北101！好高呀！';
export const CLEAR_CONFIRM = '再按一次，全部清空';
export const CLEARED = '清空啦，重新盖吧！';

/** 海浪高度：大多数是中小浪，偶尔来个超级大浪；最高 100 层，盖到 101 一定挡得住 */
export function randomWaveHeight(): number {
  const r = Math.random();
  const [lo, hi] = r < 0.6 ? [MIN_WAVE, 20] : r < 0.9 ? [21, 45] : [46, MAX_WAVE];
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const VOICE_LINES = [
  ...Object.values(EVENT_LINES),
  ...range(MIN_WAVE, MAX_WAVE).map(waveLine),
  ...range(1, TAIPEI_101).map(floorLine),
  BLOCKED,
  ALL_SAFE,
  SOME_LOST,
  REBUILD,
  CLEAR_CONFIRM,
  CLEARED,
];
export const CHEER_LINES = [TAIPEI];
