import { PARTS, PartKind } from './parts';
import { Cause, Challenge, Disaster, Outcome, Power, Terrain } from './sim';
import { VEHICLE_NAMES } from './vehicle';

export type Friend = 'koala' | 'chick' | 'polar';

export const FRIENDS: Record<Friend, { name: string; emoji: string }> = {
  koala: { name: '考拉', emoji: '🐨' },
  chick: { name: '小黄鸡', emoji: '🐥' },
  polar: { name: '白熊', emoji: '🐻‍❄️' },
};

/** 朋友待的地方，决定场景里摆什么 */
export type Place = 'field' | 'island' | 'tree' | 'barn' | 'iceberg' | 'raft' | 'roof';

export interface Mission extends Challenge {
  id: number;
  friend: Friend;
  place: Place;
  /** 任务卡上读的话 */
  brief: string;
}

export const MISSIONS: Mission[] = [
  {
    id: 1,
    terrain: 'land',
    disaster: 'none',
    power: 1,
    spot: 'ground',
    friend: 'koala',
    place: 'field',
    brief: '考拉在草地那边，开车去接它吧！',
  },
  {
    id: 2,
    terrain: 'ocean',
    disaster: 'none',
    power: 1,
    spot: 'water',
    friend: 'chick',
    place: 'island',
    brief: '小黄鸡在海里的小岛上，要过海哦！',
  },
  {
    id: 3,
    terrain: 'land',
    disaster: 'quake',
    power: 1,
    spot: 'ground',
    crack: 3,
    friend: 'polar',
    place: 'field',
    brief: '要地震啦！白熊在大裂缝那边！',
  },
  {
    id: 4,
    terrain: 'land',
    disaster: 'tornado',
    power: 2,
    spot: 'ground',
    friend: 'chick',
    place: 'barn',
    brief: '龙卷风要来了！快去救小黄鸡！',
  },
  {
    id: 5,
    terrain: 'land',
    disaster: 'typhoon',
    power: 3,
    spot: 'high',
    friend: 'koala',
    place: 'tree',
    brief: '台风要来了！考拉在大树上下不来！',
  },
  {
    id: 6,
    terrain: 'ocean',
    disaster: 'typhoon',
    power: 2,
    spot: 'water',
    friend: 'polar',
    place: 'iceberg',
    brief: '海上有台风！白熊在冰山上！',
  },
  {
    id: 7,
    terrain: 'ocean',
    disaster: 'tsunami',
    power: 2,
    spot: 'water',
    friend: 'chick',
    place: 'raft',
    brief: '海啸要来了！小黄鸡在木板上！',
  },
  {
    id: 8,
    terrain: 'coast',
    disaster: 'tsunami',
    power: 2,
    spot: 'ground',
    friend: 'koala',
    place: 'island',
    brief: '海啸要来了！考拉在海对面的小岛上！',
  },
  {
    id: 9,
    terrain: 'coast',
    disaster: 'typhoon',
    power: 2,
    spot: 'ground',
    friend: 'polar',
    place: 'island',
    brief: '海边有台风！白熊在海对面！',
  },
  {
    id: 10,
    terrain: 'land',
    disaster: 'quake',
    power: 3,
    spot: 'high',
    friend: 'polar',
    place: 'roof',
    brief: '大地震！白熊在屋顶上！',
  },
  {
    id: 11,
    terrain: 'ocean',
    disaster: 'whirlpool',
    power: 2,
    spot: 'water',
    friend: 'koala',
    place: 'island',
    brief: '海上有漩涡！考拉在小岛上！',
  },
];

export const PLACE_EMOJI: Record<Place, string> = {
  field: '🌼',
  island: '🏝️',
  tree: '🌳',
  barn: '🛖',
  iceberg: '🧊',
  raft: '🪵',
  roof: '🏠',
};

export const TERRAIN_EMOJI: Record<Terrain, string> = { land: '🌾', ocean: '🌊', coast: '🏖️' };
export const DISASTER_EMOJI: Record<Disaster, string> = {
  none: '☀️',
  // 漩涡用 🌀，台风就用 ⛈️
  typhoon: '⛈️',
  tornado: '🌪️',
  quake: '🫨',
  tsunami: '🌊',
  whirlpool: '🌀',
};
export const DISASTER_LINES: Record<Exclude<Disaster, 'none'>, string> = {
  typhoon: '台风来啦！',
  tornado: '龙卷风来啦！',
  quake: '地震啦！',
  tsunami: '海啸来啦！',
  whirlpool: '漩涡来啦！',
};

/** 自由模式能抽到的组合（海上不会地震，海边只有台风、海啸和漩涡；漩涡只在水里） */
export const FREE_COMBOS: Record<Terrain, Disaster[]> = {
  land: ['none', 'typhoon', 'tornado', 'quake'],
  ocean: ['none', 'typhoon', 'tornado', 'tsunami', 'whirlpool'],
  coast: ['none', 'typhoon', 'tsunami', 'whirlpool'],
};
export const freeBrief = (friend: Friend): string => `去救${FRIENDS[friend].name}吧！`;
/** 自由模式能抽到的强度：海上的龙卷风只有小的（船抓不住地，太强就没法拼了） */
export const freePowers = (terrain: Terrain, disaster: Disaster): Power[] =>
  terrain === 'ocean' && disaster === 'tornado' ? [1] : [1, 2, 2, 3];
/** 自由模式地震的裂缝宽度（0 表示没有裂缝） */
export const FREE_CRACKS = [0, 2, 3];

// ---------------------------------------------------------------- 原理贴纸

export type Sticker =
  'wheel' | 'hull' | 'lift' | 'heavy' | 'low' | 'anchor' | 'long' | 'wide' | 'balance' | 'damper';

export const STICKERS: Record<Sticker, { emoji: string; line: string }> = {
  wheel: { emoji: '🛞', line: '有轮子，就能在地上跑！' },
  hull: { emoji: '🛟', line: '有船底，就能浮在水上！' },
  lift: { emoji: '🚁', line: '螺旋桨够多，就能飞起来！' },
  heavy: { emoji: '🪨', line: '又重又稳，吹不动！' },
  low: { emoji: '📏', line: '矮矮的，风就吹不倒！' },
  anchor: { emoji: '⚓', line: '抓住地面，就卷不走！' },
  long: { emoji: '🚂', line: '长长的，掉不进去！' },
  wide: { emoji: '↔️', line: '站得宽宽的，就不会翻！' },
  balance: { emoji: '⚖️', line: '左右一样重，稳稳的！' },
  damper: { emoji: '🟡', line: '阻尼球不怕摇！' },
};
export const STICKER_ORDER = Object.keys(STICKERS) as Sticker[];

/** 这次成功用上了哪些道理，越靠前越贴切；奖励第一张还没得到的 */
export function principles(o: Outcome, c: Challenge): Sticker[] {
  const s = o.stats;
  const list: Sticker[] = [];
  const add = (cond: boolean, sticker: Sticker): void => {
    if (cond) list.push(sticker);
  };
  switch (c.disaster) {
    case 'quake':
      add(!!c.crack && o.mode !== 'fly', 'long');
      add(s.damper, 'damper');
      add(s.width >= 2, 'wide');
      break;
    case 'tornado':
      add(s.anchor > 0 && !o.onWater, 'anchor');
      add(true, 'heavy');
      break;
    case 'typhoon':
      add(s.width >= 2, 'wide');
      add(s.width >= 2 && s.offset < 0.25, 'balance');
      add(s.top <= 1.2, 'low');
      add(true, 'heavy');
      break;
    case 'tsunami':
      add(o.mode === 'float', 'hull');
      break;
    case 'whirlpool':
      add(o.mode === 'float' && s.length >= 4, 'long');
      break;
  }
  add(o.mode === 'fly', 'lift');
  add(o.mode === 'float' || (c.terrain !== 'land' && s.hulls > 0), 'hull');
  add(o.mode === 'drive' || s.canDrive, 'wheel');
  return [...new Set(list)];
}

// ---------------------------------------------------------------- 失败和提示

export interface CauseInfo {
  /** 第一次：说发生了什么 */
  what: string;
  /** 第二次：问一个生活里的问题 */
  ask: string;
  /** 第三次：零件盘里这些零件闪光 */
  parts: PartKind[];
}

export const CAUSES: Record<Cause, CauseInfo> = {
  stuckOnLand: {
    what: '在地上走不动呀！',
    ask: '在地上跑，要用什么呢？',
    parts: ['wheels', 'truckCab', 'truckTail'],
  },
  cantSwim: {
    what: '没有船底，过不了水呀！',
    ask: '什么东西能浮在水上呢？',
    parts: ['hull', 'boatBow', 'boatStern'],
  },
  sank: {
    what: '太重啦，沉下去了！',
    ask: '船底多一点，是不是就浮起来了？',
    parts: ['hull'],
  },
  cantReach: {
    what: '太高了，够不着！',
    ask: '什么车能把东西吊得高高的？',
    parts: ['crane', 'rotor'],
  },
  tipped: {
    what: '车被风吹倒了！',
    ask: '风能吹动小树叶，能吹动大石头吗？',
    parts: ['roller', 'mixer', 'wheels'],
  },
  capsized: {
    what: '船被风吹翻了！',
    ask: '站得宽宽的，是不是更稳呢？',
    parts: ['hull', 'boatBow', 'boatStern'],
  },
  blownAway: {
    what: '风太大，被吹走啦！',
    ask: '大风天，飞机还能飞吗？',
    parts: ['wheels', 'roller', 'hull'],
  },
  sucked: {
    what: '被龙卷风卷起来啦！',
    ask: '怎么才能抓住地面呢？',
    parts: ['bucket', 'crane', 'roller'],
  },
  shookOver: {
    what: '摇得太厉害，倒了！',
    ask: '台北101里，什么东西不怕摇？',
    parts: ['damper', 'wheels'],
  },
  fellInCrack: {
    what: '掉进裂缝里啦！',
    ask: '车子再长一点，能不能跨过去？',
    parts: ['wheels', 'trainHead', 'trainTail'],
  },
  washedAway: {
    what: '被海浪冲走啦！',
    ask: '什么东西能浮在浪上？',
    parts: ['hull', 'rotor'],
  },
  whirled: {
    what: '被漩涡卷进去啦！',
    ask: '船长长的，是不是就卷不进去了？',
    parts: ['hull', 'rotor'],
  },
};

// ---------------------------------------------------------------- 其他台词

export const PROBLEM_LINES = {
  empty: '先拼一台车吧！',
  noHead: '还要一个车头哦！',
  noTail: '还要一个车尾哦！',
  loose: '有一块没有吸上哦！',
  headFront: '车头前面不能再接东西哦！',
  tailBack: '车尾后面不能再接东西哦！',
} as const;
/** 量词：船是一艘，会飞的是一架，火车是一列，机器是一台，其他车是一辆 */
export const MEASURES: Record<string, string> = {
  全能救援机: '架',
  会飞的船: '艘',
  飞天车: '辆',
  直升机: '架',
  水陆两用车: '辆',
  船: '艘',
  小飞机: '架',
  吊车: '辆',
  挖掘车: '辆',
  搅拌车: '辆',
  压路机: '台',
  自卸车: '辆',
  火车: '列',
  小汽车: '辆',
};
export const nameLine = (name: string): string => `你拼了一${MEASURES[name] ?? '辆'}${name}！`;
export const TOO_HEAVY = '太重了，飞不起来！';
export const STONES_ON = '装上石头啦！';
export const STONES_OFF = '石头倒掉啦！';
export const RESCUED = '救到啦！';
export const THANKS = '谢谢黄熊队长！';
export const WOBBLY = '晃晃悠悠，还好过来了！';
export const ALMOST_ALL = '再改一改，会更好！';
export const CLEAR_CONFIRM = '再按一次，全部拆掉';
export const TRY_REAL_TOY = '用你的磁力车也拼一台吧！';
export const CHOOSE_MISSION = '今天去救谁呢？';
export const FREE_MODE = '自由模式！';
export const STICKER_BOOK = '贴纸本';

/** 黄熊队长自己说的话（童声） */
export const BEAR = {
  go: '黄熊队长，出发！',
  wow: '哇哦～',
  hold: '抓紧啦！',
  coming: '我们来救你啦！',
  stuck: '过不去呀～',
} as const;

export const VOICE_LINES = [
  ...MISSIONS.map((m) => m.brief),
  ...Object.values(DISASTER_LINES),
  ...(Object.keys(FRIENDS) as Friend[]).map(freeBrief),
  ...Object.values(CAUSES).flatMap((c) => [c.what, c.ask]),
  ...Object.values(PROBLEM_LINES),
  ...VEHICLE_NAMES.map(nameLine),
  ...new Set(Object.values(PARTS).map((p) => p.name)),
  TOO_HEAVY,
  STONES_ON,
  STONES_OFF,
  WOBBLY,
  ALMOST_ALL,
  CLEAR_CONFIRM,
  TRY_REAL_TOY,
  CHOOSE_MISSION,
  FREE_MODE,
  STICKER_BOOK,
];
export const CHEER_LINES = [RESCUED, THANKS, ...Object.values(STICKERS).map((s) => s.line)];
export const BEAR_LINES = Object.values(BEAR);
