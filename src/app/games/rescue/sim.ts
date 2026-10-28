import { Stats, stats, Vehicle } from './vehicle';

export type Terrain = 'land' | 'ocean' | 'coast';
export type Disaster = 'none' | 'typhoon' | 'tornado' | 'quake' | 'tsunami';
/** 朋友在哪：地上、高处（树上、屋顶上，要吊车或者飞上去）、水上（木板、冰山、小岛） */
export type Spot = 'ground' | 'high' | 'water';
export type Power = 1 | 2 | 3;

export interface Challenge {
  terrain: Terrain;
  disaster: Disaster;
  power: Power;
  spot: Spot;
  /** 地震裂缝有几格宽（0 表示没有裂缝） */
  crack?: number;
}

export type Cause =
  | 'stuckOnLand'
  | 'cantSwim'
  | 'sank'
  | 'cantReach'
  | 'tipped'
  | 'capsized'
  | 'blownAway'
  | 'sucked'
  | 'shookOver'
  | 'fellInCrack'
  | 'washedAway';

/** 载具怎么走：开、漂、飞 */
export type Mode = 'drive' | 'float' | 'fly';

export interface Outcome {
  ok: boolean;
  /** 成功时 3 星（稳稳的）或 2 星（晃晃悠悠）；失败 0 */
  stars: 0 | 2 | 3;
  cause: Cause | null;
  /** 灾害的力气 ÷ 载具的力气（拔河条）；没有灾害或者没碰上灾害是 0 */
  ratio: number;
  /** 碰上灾害时在怎么走 */
  mode: Mode;
  /** 出发时就有螺旋桨，但是太重飞不起来 */
  tooHeavy: boolean;
  /** 吊臂举起来去救朋友 */
  raised: boolean;
  /** 灾害发生时在水上 */
  onWater: boolean;
  stats: Stats;
}

/** 每一档灾害的力气。改这里调难度，rescue.spec.ts 会检查每一关还有没有解 */
export const POWER = {
  typhoon: [0, 1, 2, 3],
  tornado: [0, 1, 2, 2.6],
  quake: [0, 1, 1.6, 2.4],
  tsunami: [0, 0.6, 1, 1.4],
};

/** 比值低于这个是 3 星 */
export const STEADY = 0.7;

/** 灾害发生的时候在不在水上 */
export function disasterOnWater(c: Challenge): boolean {
  return c.terrain === 'ocean' || (c.terrain === 'coast' && c.spot !== 'high');
}

export function simulate(v: Vehicle, c: Challenge): Outcome {
  const base = stats(v);
  const mode: Mode = base.flies ? 'fly' : c.terrain === 'ocean' ? 'float' : 'drive';
  const raised = c.spot === 'high' && base.reach && mode !== 'fly';
  const s = raised ? stats(v, true) : base;
  const onWater = disasterOnWater(c);
  const result = (cause: Cause | null, ratio = 0): Outcome => ({
    ok: !cause,
    stars: cause ? 0 : ratio < STEADY ? 3 : 2,
    cause,
    ratio,
    mode: onWater && mode === 'drive' ? 'float' : mode,
    tooHeavy: base.rotors > 0 && !base.flies,
    raised,
    onWater,
    stats: s,
  });

  // 1. 一路过去：地上要有轮子，水上要有船底而且浮得起来；能飞的哪里都能去
  if (mode !== 'fly') {
    if ((c.terrain === 'land' || c.terrain === 'coast') && !s.canDrive)
      return result('stuckOnLand');
    if (c.terrain === 'ocean' || c.terrain === 'coast') {
      if (!s.hulls) return result('cantSwim');
      if (!s.floats) return result('sank');
    }
  }
  // 2. 朋友在高处的话，到了先要够得着（灾害就在举着吊臂的时候来）
  if (c.spot === 'high' && !raised && mode !== 'fly') return result('cantReach');

  // 3. 灾害
  const r = ratio(s, c, mode, onWater);
  if (r.cause && r.ratio >= 1) return result(r.cause, r.ratio);
  return result(null, r.ratio);
}

function ratio(
  s: Stats,
  c: Challenge,
  mode: Mode,
  onWater: boolean,
): { ratio: number; cause: Cause | null } {
  const fly = mode === 'fly';
  switch (c.disaster) {
    case 'none':
      return { ratio: 0, cause: null };
    case 'typhoon': {
      if (fly) return { ratio: 9, cause: 'blownAway' };
      // 翻倒：风吹的力气（侧面越大、越高越吃风）对重量撑住的力气（越重、站得越宽越稳；左右不平衡会打折）
      const push = (POWER.typhoon[c.power] * s.sideArea * (s.sideArea / s.length)) / 2;
      const hold = s.weight * Math.max(0.15, s.width / 2 - s.offset);
      return { ratio: push / hold, cause: onWater ? 'capsized' : 'tipped' };
    }
    case 'tornado': {
      if (fly) return { ratio: 9, cause: 'sucked' };
      // 往上吸：块越多吸得越多；越重、抓地越牢越吸不动（水上抓不住地）
      const pull = POWER.tornado[c.power] * s.blocks;
      const hold = s.weight + (onWater ? 0 : s.anchor);
      return { ratio: pull / hold, cause: 'sucked' };
    }
    case 'quake': {
      if (fly) return { ratio: 0, cause: null };
      if (c.crack && s.length <= c.crack) return { ratio: 9, cause: 'fellInCrack' };
      // 摇晃：重心越高、车越窄越容易倒；阻尼球把晃动吃掉一大半
      const shake = (POWER.quake[c.power] * s.centerHeight) / s.width;
      return { ratio: shake * (s.damper ? 0.4 : 1), cause: 'shookOver' };
    }
    case 'tsunami': {
      if (fly) return { ratio: 0, cause: null };
      // 浮着的会被浪托起来，窄的船会晃一晃
      if (onWater) return { ratio: s.width === 1 ? 0.8 : 0.3, cause: null };
      // 在地上：浪冲正面（越宽越高挨得越多），重量抓住地面
      const push = POWER.tsunami[c.power] * s.width * s.top * (s.pierce ? 0.7 : 1);
      return { ratio: push / s.weight, cause: 'washedAway' };
    }
  }
}
