import { PARTS, PartKind } from './parts';

/** 拼装网格：4 行（宽）× 6 列（长），载具朝右（第 5 列那边）开 */
export const ROWS = 4;
export const COLS = 6;

/** grid[row][col] */
export type Grid = (PartKind | null)[][];

export const emptyGrid = (): Grid =>
  Array.from({ length: ROWS }, () => Array<PartKind | null>(COLS).fill(null));

/** 网格里的一块，拼好以后的坐标：x 沿车身（0 是最后面），z 沿车宽（0 是最上面一行） */
export interface Block {
  part: PartKind;
  x: number;
  z: number;
  /** 在拼装网格里的位置 */
  row: number;
  col: number;
}

/** 拼好的载具：网格四周空着的行和列去掉 */
export interface Vehicle {
  blocks: Block[];
  /** 长（列数）、宽（行数） */
  length: number;
  width: number;
}

/**
 * empty 什么都没有；noHead / noTail 缺车头或车尾；
 * loose 有的块没吸上；headFront 车头前面还接着东西；tailBack 车尾后面还接着东西
 */
export type Problem = 'empty' | 'noHead' | 'noTail' | 'loose' | 'headFront' | 'tailBack';

export interface Check {
  problem: Problem | null;
  /** 出问题的块，在拼装网格里的 [row, col] */
  cells: [number, number][];
}

export function assemble(grid: Grid): Vehicle {
  const used: { row: number; col: number; part: PartKind }[] = [];
  grid.forEach((line, row) =>
    line.forEach((part, col) => {
      if (part) used.push({ row, col, part });
    }),
  );
  if (!used.length) return { blocks: [], length: 0, width: 0 };
  const minCol = Math.min(...used.map((u) => u.col));
  const minRow = Math.min(...used.map((u) => u.row));
  const blocks = used.map((u) => ({ ...u, x: u.col - minCol, z: u.row - minRow }));
  return {
    blocks,
    length: Math.max(...blocks.map((b) => b.x)) + 1,
    width: Math.max(...blocks.map((b) => b.z)) + 1,
  };
}

const isHead = (b: Block): boolean => PARTS[b.part].slot === 'head';
const isTail = (b: Block): boolean => PARTS[b.part].slot === 'tail';
const cells = (bs: Block[]): [number, number][] => bs.map((b) => [b.row, b.col]);

export function check(grid: Grid): Check {
  const v = assemble(grid);
  if (!v.blocks.length) return { problem: 'empty', cells: [] };
  if (!v.blocks.some(isHead)) return { problem: 'noHead', cells: [] };
  if (!v.blocks.some(isTail)) return { problem: 'noTail', cells: [] };

  // 上下左右挨着的连成一块；最大的那块算车，其他的都是没吸上的
  const at = new Map(v.blocks.map((b) => [`${b.x},${b.z}`, b]));
  const group = new Map<Block, number>();
  const sizes: number[] = [];
  for (const first of v.blocks) {
    if (group.has(first)) continue;
    const id = sizes.length;
    const queue = [first];
    group.set(first, id);
    let size = 0;
    while (queue.length) {
      const b = queue.pop()!;
      size++;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const n = at.get(`${b.x + dx},${b.z + dz}`);
        if (n && !group.has(n)) {
          group.set(n, id);
          queue.push(n);
        }
      }
    }
    sizes.push(size);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  const loose = v.blocks.filter((b) => group.get(b) !== main);
  if (loose.length) return { problem: 'loose', cells: cells(loose) };

  // 车头只有后面有磁铁，前面不能再接东西；车尾反过来
  const headFront = v.blocks.filter((b) => isHead(b) && at.has(`${b.x + 1},${b.z}`));
  if (headFront.length) return { problem: 'headFront', cells: cells(headFront) };
  const tailBack = v.blocks.filter((b) => isTail(b) && at.has(`${b.x - 1},${b.z}`));
  if (tailBack.length) return { problem: 'tailBack', cells: cells(tailBack) };
  return { problem: null, cells: [] };
}

export interface Stats {
  weight: number;
  buoyancy: number;
  lift: number;
  anchor: number;
  length: number;
  width: number;
  /** 块数（龙卷风往上吸的面） */
  blocks: number;
  /** 侧面挨风的面积：每一列最高那块的高度加起来 */
  sideArea: number;
  /** 最高的地方 */
  top: number;
  /** 重心有多高 */
  centerHeight: number;
  /** 重心偏离车宽中线多少（格） */
  offset: number;
  canDrive: boolean;
  hulls: number;
  rotors: number;
  /** 浮力够不够（有没有船底另看 hulls） */
  floats: boolean;
  flies: boolean;
  /** 有吊车，能够到高处 */
  reach: boolean;
  damper: boolean;
  pierce: boolean;
}

/** @param raised 吊臂是不是举着（救树上、屋顶上的朋友时） */
export function stats(v: Vehicle, raised = false): Stats {
  let weight = 0;
  let buoyancy = 0;
  let lift = 0;
  let anchor = 0;
  let moment = 0;
  let lateral = 0;
  const colTop = new Map<number, number>();
  const s = { canDrive: false, hulls: 0, rotors: 0, reach: false, damper: false, pierce: false };
  for (const b of v.blocks) {
    const p = PARTS[b.part];
    const h = raised && p.raisedHeight ? p.raisedHeight : p.height;
    weight += p.weight;
    buoyancy += p.buoyancy ?? 0;
    lift += p.lift ?? 0;
    anchor += p.anchor ?? 0;
    // 吊臂举起来，重心跟着变高：地震里更容易晃倒（第 10 关要用阻尼球或者宽底盘）
    moment += p.weight * (raised && p.raisedHeight ? p.raisedHeight / 2 : p.height / 2);
    lateral += p.weight * b.z;
    colTop.set(b.x, Math.max(colTop.get(b.x) ?? 0, h));
    if (p.bottom === 'wheel' || p.bottom === 'roller') s.canDrive = true;
    if (p.bottom === 'hull') s.hulls++;
    if (p.lift) s.rotors++;
    if (p.raisedHeight) s.reach = true;
    if (p.damper) s.damper = true;
    if (p.pierce) s.pierce = true;
  }
  const sideArea = [...colTop.values()].reduce((a, b) => a + b, 0);
  return {
    ...s,
    weight,
    buoyancy,
    lift,
    anchor,
    length: v.length,
    width: v.width,
    blocks: v.blocks.length,
    sideArea,
    top: Math.max(0, ...colTop.values()),
    centerHeight: weight ? moment / weight : 0,
    offset: weight ? Math.abs(lateral / weight - (v.width - 1) / 2) : 0,
    floats: buoyancy >= weight,
    flies: lift > 0 && lift >= weight,
  };
}

/** 有螺旋桨，但是太重飞不起来 */
export const tooHeavyToFly = (s: Stats): boolean => s.rotors > 0 && !s.flies;

/** 给拼好的载具起名字 */
export function vehicleName(v: Vehicle): string {
  const s = stats(v);
  const hull = s.hulls > 0;
  if (s.flies) {
    if (hull && s.canDrive) return '全能救援机';
    if (hull) return '会飞的船';
    if (s.canDrive) return '飞天车';
    return '直升机';
  }
  if (hull && s.canDrive) return '水陆两用车';
  if (hull) return '船';
  if (!s.canDrive) return '小飞机';
  const has = (...kinds: PartKind[]): boolean => v.blocks.some((b) => kinds.includes(b.part));
  if (has('crane')) return '吊车';
  if (has('bucket')) return '挖掘车';
  if (has('mixer')) return '搅拌车';
  if (has('roller')) return '压路机';
  if (has('dumper', 'dumperFull')) return '自卸车';
  if (has('trainHead', 'trainTail')) return '火车';
  return '小汽车';
}

export const VEHICLE_NAMES = [
  '全能救援机',
  '会飞的船',
  '飞天车',
  '直升机',
  '水陆两用车',
  '船',
  '小飞机',
  '吊车',
  '挖掘车',
  '搅拌车',
  '压路机',
  '自卸车',
  '火车',
  '小汽车',
];

/** 从一串文字拼出网格，测试和预设用：每行一个字符串，每个零件用 | 隔开，空格子写 . */
export function gridFrom(rows: string[]): Grid {
  const g = emptyGrid();
  rows.forEach((line, r) =>
    line.split('|').forEach((cell, c) => {
      const kind = cell.trim();
      if (kind && kind !== '.') g[r][c] = kind as PartKind;
    }),
  );
  return g;
}
