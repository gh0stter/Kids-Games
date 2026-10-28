/** 零件的位置：头只能放最前一列，尾只能放最后一列，中间段放中间 */
export type Slot = 'head' | 'mid' | 'tail';

/** 零件底下是什么：轮子和滚筒能在地上跑，船底能浮，滑橇什么都不能（要靠螺旋桨飞） */
export type Bottom = 'wheel' | 'roller' | 'hull' | 'skid';

export type PartKind =
  | 'truckCab'
  | 'jeepCab'
  | 'trainHead'
  | 'boatBow'
  | 'heliNose'
  | 'wheels'
  | 'roller'
  | 'hull'
  | 'rotor'
  | 'bucket'
  | 'crane'
  | 'mixer'
  | 'dumper'
  | 'dumperFull'
  | 'damper'
  | 'truckTail'
  | 'trainTail'
  | 'boatStern'
  | 'heliTail';

export interface PartInfo {
  slot: Slot;
  name: string;
  bottom: Bottom;
  /** 重量：1 = 一块轻的段 */
  weight: number;
  /** 高度：1 = 一块的边长 */
  height: number;
  /** 能托起多重（浮力总和 ≥ 重量才浮得起来） */
  buoyancy?: number;
  /** 能抬起多重（升力总和 ≥ 重量才飞得起来） */
  lift?: number;
  /** 大风里抓住地面的力气（铲斗插进地里、吊钩勾住地面） */
  anchor?: number;
  /** 吊臂举起来时的高度 */
  raisedHeight?: number;
  /** 尖头破浪：海浪的冲力打折 */
  pierce?: boolean;
  damper?: boolean;
}

/**
 * 零件数值。调这里就能调难度；docs/rescue-design.md 第 4.3 节有说明，
 * rescue.spec.ts 检查每一关都有解、典型的错法都会失败。
 */
export const PARTS: Record<PartKind, PartInfo> = {
  truckCab: { slot: 'head', name: '卡车头', bottom: 'wheel', weight: 2, height: 1.5 },
  jeepCab: { slot: 'head', name: '越野车头', bottom: 'wheel', weight: 1, height: 1 },
  trainHead: {
    slot: 'head',
    name: '火车头',
    bottom: 'wheel',
    weight: 3,
    height: 1.5,
    pierce: true,
  },
  boatBow: { slot: 'head', name: '船头', bottom: 'hull', weight: 1, height: 1, buoyancy: 3 },
  heliNose: { slot: 'head', name: '直升机头', bottom: 'skid', weight: 1, height: 1.3 },

  wheels: { slot: 'mid', name: '轮子', bottom: 'wheel', weight: 1, height: 0.8 },
  roller: { slot: 'mid', name: '压路滚筒', bottom: 'roller', weight: 4, height: 0.9 },
  hull: { slot: 'mid', name: '船身', bottom: 'hull', weight: 1, height: 0.8, buoyancy: 3 },
  rotor: { slot: 'mid', name: '螺旋桨', bottom: 'skid', weight: 1, height: 1.2, lift: 3 },
  bucket: { slot: 'mid', name: '挖掘铲斗', bottom: 'wheel', weight: 2, height: 1.2, anchor: 4 },
  crane: {
    slot: 'mid',
    name: '吊车',
    bottom: 'wheel',
    weight: 2,
    height: 1,
    raisedHeight: 4,
    anchor: 3,
  },
  mixer: { slot: 'mid', name: '搅拌罐', bottom: 'wheel', weight: 3, height: 1.5 },
  dumper: { slot: 'mid', name: '自卸斗', bottom: 'wheel', weight: 1, height: 1.1 },
  dumperFull: { slot: 'mid', name: '自卸斗', bottom: 'wheel', weight: 3, height: 1.2 },
  damper: { slot: 'mid', name: '阻尼球', bottom: 'wheel', weight: 2, height: 1.5, damper: true },

  truckTail: { slot: 'tail', name: '卡车尾巴', bottom: 'wheel', weight: 1, height: 1 },
  trainTail: { slot: 'tail', name: '火车尾巴', bottom: 'wheel', weight: 2, height: 1.2 },
  boatStern: { slot: 'tail', name: '船尾', bottom: 'hull', weight: 1, height: 0.9, buoyancy: 2 },
  heliTail: { slot: 'tail', name: '直升机尾巴', bottom: 'skid', weight: 0.5, height: 1 },
};

/** 零件盘里的顺序（装满石头的自卸斗不在盘里，点一下放好的自卸斗才会装上石头） */
export const TRAY: Record<Slot, PartKind[]> = {
  head: ['truckCab', 'jeepCab', 'trainHead', 'boatBow', 'heliNose'],
  mid: ['wheels', 'roller', 'hull', 'rotor', 'bucket', 'crane', 'mixer', 'dumper', 'damper'],
  tail: ['truckTail', 'trainTail', 'boatStern', 'heliTail'],
};

export const PART_KINDS = Object.keys(PARTS) as PartKind[];
