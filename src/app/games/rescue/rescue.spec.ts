/**
 * 拼拼救援队的规则测试：每一关都有解，典型的错法都会失败。调 parts.ts / sim.ts 里的数值后跑一下：
 *
 *   npm run test:rescue
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FREE_COMBOS,
  FREE_CRACKS,
  freePowers,
  MEASURES,
  MISSIONS,
  nameLine,
  principles,
} from './rescue-data';
import { Cause, Challenge, simulate, Spot, Terrain } from './sim';
import { assemble, check, gridFrom, VEHICLE_NAMES, vehicleName } from './vehicle';

const mission = (id: number) => MISSIONS.find((m) => m.id === id)!;
const v = (...rows: string[]) => assemble(gridFrom(rows));

// 常用的载具：每行从左（车尾）到右（车头），. 是空格子
const CAR = v('truckTail|wheels|truckCab');
const LONG_CAR = v('truckTail|wheels|wheels|wheels|truckCab');
const BOAT = v('boatStern|hull|boatBow');
const WIDE_BOAT = v('boatStern|hull|boatBow', 'boatStern|hull|boatBow');
const LONG_BOAT = v('boatStern|hull|hull|boatBow');
const LONGER_BOAT = v('boatStern|hull|hull|hull|boatBow');
const HELI = v('heliTail|rotor|heliNose');
const AMPHIBIOUS = v('boatStern|hull|wheels|truckCab');
const WIDE_AMPHIBIOUS = v('boatStern|hull|wheels|truckCab', 'boatStern|hull|wheels|truckCab');
const CRANE = v('truckTail|crane|truckCab');
const WIDE_HEAVY_CRANE = v(
  'truckTail|roller|roller|truckCab',
  'truckTail|crane|wheels|truckCab',
  'truckTail|roller|roller|truckCab',
);
const WIDE_CRANE = v(
  'truckTail|wheels|truckCab',
  'truckTail|crane|truckCab',
  'truckTail|wheels|truckCab',
);
const DAMPER_CRANE = v('truckTail|wheels|wheels|truckCab', 'truckTail|crane|damper|truckCab');
const DIGGER = v('truckTail|bucket|truckCab');
const ROLLER = v('truckTail|roller|truckCab');

const cause = (o: { cause: Cause | null }) => o.cause;

describe('拼装', () => {
  it('头可以直接接尾', () => {
    const g = gridFrom(['.|truckTail|truckCab']);
    assert.equal(check(g).problem, null);
    assert.equal(assemble(g).length, 2);
  });

  it('缺头、缺尾、没吸上、头尾接反', () => {
    assert.equal(check(gridFrom([])).problem, 'empty');
    assert.equal(check(gridFrom(['truckTail|wheels'])).problem, 'noHead');
    assert.equal(check(gridFrom(['wheels|truckCab'])).problem, 'noTail');
    const loose = check(gridFrom(['truckTail|wheels|truckCab', '.|.|.|.|wheels']));
    assert.equal(loose.problem, 'loose');
    assert.deepEqual(loose.cells, [[1, 4]]);
    assert.deepEqual(check(gridFrom(['truckTail|truckCab|wheels'])), {
      problem: 'headFront',
      cells: [[0, 1]],
    });
    assert.equal(check(gridFrom(['wheels|truckTail|truckCab'])).problem, 'tailBack');
    // 上下挨着的头和尾没关系
    assert.equal(
      check(gridFrom(['truckTail|wheels|truckCab', '.|truckTail|truckCab'])).problem,
      null,
    );
  });

  it('起名', () => {
    assert.equal(vehicleName(CAR), '小汽车');
    assert.equal(vehicleName(BOAT), '船');
    assert.equal(vehicleName(HELI), '直升机');
    assert.equal(vehicleName(AMPHIBIOUS), '水陆两用车');
    assert.equal(vehicleName(CRANE), '吊车');
    // 卡车头太重，一个螺旋桨抬不动
    assert.equal(vehicleName(v('truckTail|rotor|truckCab')), '小汽车');
    assert.equal(vehicleName(v('truckTail|rotor|rotor|truckCab')), '飞天车');
  });
});

describe('关卡', () => {
  it('1 草地：有轮子才能跑', () => {
    assert.equal(simulate(CAR, mission(1)).stars, 3);
    assert.equal(cause(simulate(BOAT, mission(1))), 'stuckOnLand');
    assert.equal(cause(simulate(v('heliTail|rotor|rotor|rotor|rotor|truckCab'), mission(1))), null);
  });

  it('2 过海：有船底才能漂', () => {
    assert.equal(simulate(BOAT, mission(2)).stars, 3);
    assert.equal(cause(simulate(CAR, mission(2))), 'cantSwim');
    assert.equal(cause(simulate(v('boatStern|hull|roller|roller|boatBow'), mission(2))), 'sank');
    assert.equal(simulate(HELI, mission(2)).ok, true);
  });

  it('3 地震裂缝：长车跨过去', () => {
    assert.equal(cause(simulate(CAR, mission(3))), 'fellInCrack');
    assert.equal(simulate(LONG_CAR, mission(3)).ok, true);
    assert.equal(simulate(HELI, mission(3)).ok, true);
  });

  it('4 龙卷风：抓住地面或者够重', () => {
    assert.equal(cause(simulate(CAR, mission(4))), 'sucked');
    assert.equal(cause(simulate(HELI, mission(4))), 'sucked');
    assert.equal(simulate(DIGGER, mission(4)).stars, 3);
    assert.equal(simulate(ROLLER, mission(4)).ok, true);
    assert.equal(simulate(CRANE, mission(4)).ok, true);
  });

  it('5 台风里吊考拉：吊车要又宽又重', () => {
    assert.equal(cause(simulate(CAR, mission(5))), 'cantReach');
    assert.equal(cause(simulate(CRANE, mission(5))), 'tipped');
    assert.equal(cause(simulate(HELI, mission(5))), 'blownAway');
    assert.equal(simulate(WIDE_HEAVY_CRANE, mission(5)).stars, 3);
    // 光宽不够重还是会翻，加上滚筒就稳了
    assert.equal(cause(simulate(WIDE_CRANE, mission(5))), 'tipped');
  });

  it('6 海上台风：宽的船不翻', () => {
    assert.equal(cause(simulate(BOAT, mission(6))), 'capsized');
    assert.equal(simulate(WIDE_BOAT, mission(6)).stars, 3);
    assert.equal(cause(simulate(HELI, mission(6))), 'blownAway');
  });

  it('7 海上海啸：浮起来越过浪', () => {
    assert.equal(simulate(BOAT, mission(7)).stars, 2);
    assert.equal(simulate(WIDE_BOAT, mission(7)).stars, 3);
    assert.equal(simulate(HELI, mission(7)).stars, 3);
  });

  it('8 海边海啸：水陆两用', () => {
    assert.equal(cause(simulate(CAR, mission(8))), 'cantSwim');
    assert.equal(cause(simulate(BOAT, mission(8))), 'stuckOnLand');
    assert.equal(simulate(AMPHIBIOUS, mission(8)).ok, true);
    assert.equal(simulate(HELI, mission(8)).ok, true);
  });

  it('9 海边台风：飞机不行，要宽的水陆两用车', () => {
    assert.equal(cause(simulate(HELI, mission(9))), 'blownAway');
    assert.equal(cause(simulate(AMPHIBIOUS, mission(9))), 'capsized');
    assert.equal(simulate(WIDE_AMPHIBIOUS, mission(9)).stars, 3);
  });

  it('10 大地震里吊白熊：阻尼球或者宽底盘', () => {
    assert.equal(cause(simulate(LONG_CAR, mission(10))), 'cantReach');
    assert.equal(cause(simulate(CRANE, mission(10))), 'shookOver');
    assert.equal(simulate(DAMPER_CRANE, mission(10)).ok, true);
    assert.equal(simulate(WIDE_HEAVY_CRANE, mission(10)).ok, true);
  });
});

describe('漩涡', () => {
  it('11 海上漩涡：长长的船卷不进去', () => {
    assert.equal(cause(simulate(BOAT, mission(11))), 'whirled');
    assert.equal(cause(simulate(WIDE_BOAT, mission(11))), 'whirled');
    assert.equal(simulate(LONG_BOAT, mission(11)).ok, true);
    assert.equal(simulate(HELI, mission(11)).stars, 3);
  });

  const pool = (power: 1 | 2 | 3, terrain: Terrain = 'ocean'): Challenge => ({
    terrain,
    disaster: 'whirlpool',
    power,
    spot: terrain === 'ocean' ? 'water' : 'ground',
  });

  it('船越长越卷不进去', () => {
    assert.equal(simulate(BOAT, pool(1)).stars, 2);
    assert.equal(cause(simulate(BOAT, pool(2))), 'whirled');
    assert.equal(simulate(LONG_BOAT, pool(2)).ok, true);
    assert.equal(cause(simulate(LONG_BOAT, pool(3))), 'whirled');
    assert.equal(simulate(LONGER_BOAT, pool(3)).ok, true);
  });

  it('宽的船也重一点，但是长度才是关键', () => {
    assert.equal(cause(simulate(WIDE_BOAT, pool(2))), 'whirled');
  });

  it('飞过去的不怕漩涡', () => {
    assert.equal(simulate(HELI, pool(3)).stars, 3);
  });

  it('海边：水陆两用车要够长或者够宽', () => {
    assert.equal(simulate(AMPHIBIOUS, pool(2, 'coast')).ok, true);
    assert.equal(cause(simulate(AMPHIBIOUS, pool(3, 'coast'))), 'whirled');
    assert.equal(simulate(WIDE_AMPHIBIOUS, pool(3, 'coast')).ok, true);
  });

  it('贴纸：长长的船', () => {
    const c = pool(2);
    assert.equal(principles(simulate(LONG_BOAT, c), c)[0], 'long');
  });
});

describe('自由模式', () => {
  // 孩子可能会拼的几种车，自由模式抽到的每一种情况，至少有一台能过
  const TRIED = [
    CAR,
    LONG_CAR,
    BOAT,
    WIDE_BOAT,
    LONG_BOAT,
    LONGER_BOAT,
    HELI,
    AMPHIBIOUS,
    WIDE_AMPHIBIOUS,
    WIDE_HEAVY_CRANE,
    DAMPER_CRANE,
    DIGGER,
    ROLLER,
    // 船上放个搅拌罐，压得住
    v('boatStern|hull|mixer|boatBow'),
    v('truckTail|bucket|wheels|wheels|truckCab'),
    // 吊车加铲斗：够得着，又抓得住地
    v('truckTail|bucket|crane|truckCab'),
  ];

  it('每一种组合都有解', () => {
    const spots: Record<Terrain, Spot[]> = {
      land: ['ground', 'high'],
      ocean: ['water'],
      coast: ['ground'],
    };
    for (const terrain of Object.keys(FREE_COMBOS) as Terrain[]) {
      for (const disaster of FREE_COMBOS[terrain]) {
        for (const power of new Set(freePowers(terrain, disaster))) {
          for (const spot of spots[terrain]) {
            const cracks = disaster === 'quake' && spot !== 'high' ? FREE_CRACKS : [0];
            for (const crack of cracks) {
              const c: Challenge = { terrain, disaster, power, spot, crack };
              const solved = TRIED.some((veh) => simulate(veh, c).ok);
              assert.ok(solved, `没有解：${JSON.stringify(c)}`);
            }
          }
        }
      }
    }
  });
});

describe('贴纸', () => {
  it('按这次用上的道理给', () => {
    const first = (veh: typeof CAR, id: number) =>
      principles(simulate(veh, mission(id)), mission(id))[0];
    assert.equal(first(CAR, 1), 'wheel');
    assert.equal(first(BOAT, 2), 'hull');
    assert.equal(first(LONG_CAR, 3), 'long');
    assert.equal(first(DIGGER, 4), 'anchor');
    assert.equal(first(WIDE_BOAT, 6), 'wide');
    assert.equal(first(DAMPER_CRANE, 10), 'damper');
  });
});

describe('台词', () => {
  it('每种车都有对的量词', () => {
    for (const name of VEHICLE_NAMES) assert.ok(MEASURES[name], `${name} 没有量词`);
    assert.equal(nameLine('船'), '你拼了一艘船！');
    assert.equal(nameLine('直升机'), '你拼了一架直升机！');
    assert.equal(nameLine('火车'), '你拼了一列火车！');
    assert.equal(nameLine('小汽车'), '你拼了一辆小汽车！');
  });
});
