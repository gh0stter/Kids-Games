import * as THREE from 'three';
import { LIP, WaveMesh, WaveSample } from '../tsunami/wave-mesh';
import { buildCharacter, buildVehicle, disposeGeometry, partTop } from './models';
import { PARTS } from './parts';
import {
  BEAR,
  CAUSES,
  DISASTER_LINES,
  Friend,
  Mission,
  Place,
  RESCUED,
  TOO_HEAVY,
} from './rescue-data';
import { Outcome } from './sim';
import { Block, Vehicle } from './vehicle';

export type Sfx =
  'go' | 'wind' | 'rumble' | 'splash' | 'whoosh' | 'crash' | 'boing' | 'hop' | 'pop';

export interface JourneyCallbacks {
  /** 旁白说一句 */
  say(text: string): void;
  /** 拔河条：灾害的力气 ÷ 载具的力气；null 收起来 */
  tug(ratio: number | null): void;
  sfx(kind: Sfx): void;
}

/** 地面的顶面 y = 0；水面比地面低一点 */
const WATER_Y = -0.25;
/** 船浮在水上时载具的 y */
const FLOAT_Y = WATER_Y - 0.15;
const FLY_Y = 3;
const SPEED = 4.5;
const MAX_PARTICLES = 700;
const TRACK_HALF = 2.4;

/** 一路上的地形：哪几段是地，朋友在哪，灾害在哪发生 */
interface Layout {
  land: [number, number][];
  friendX: number;
  disasterX: number;
  /** 往前开第一次碰到水的地方 */
  shore: number | null;
  /** 过了水再上岸的地方 */
  landing: number | null;
}

function layout(m: Mission): Layout {
  switch (m.terrain) {
    case 'land':
      return { land: [[-14, 40]], friendX: 21, disasterX: 8, shore: null, landing: null };
    case 'ocean':
      return { land: [[-14, 1.5]], friendX: 20, disasterX: 9, shore: 1.5, landing: null };
    case 'coast':
      return {
        land: [
          [-14, 4],
          [15, 40],
        ],
        friendX: 21,
        disasterX: 9,
        shore: 4,
        landing: 15,
      };
  }
}

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

interface Tween {
  t: number;
  dur: number;
  update(p: number, dt: number): void;
  done(): void;
}

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: THREE.Vector3;
  color: THREE.Color;
  gravity: number;
}

/**
 * 出发以后的场面：载具从左往右开，路上碰到水、灾害，最后接上朋友。
 * 结果已经由 sim.ts 算好了（Outcome），这里只负责把它演出来。
 */
export class Journey {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);
  private readonly hemi = new THREE.HemisphereLight('#ffe9c9', '#4a7d8a', 1.3);
  private readonly sun = new THREE.DirectionalLight('#fff0d0', 2.3);
  private readonly sky = new THREE.Color('#bfe7f2');
  private readonly world = new THREE.Group();
  private readonly particleMesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private tweens: Tween[] = [];
  /** 每帧都要跑的效果（下雨、龙卷风转、浮在水上晃） */
  private loops = new Set<(dt: number) => void>();

  /** 载具三层：carrier 管位置，tilt 绕车身一边翻倒，body 里是模型 */
  private readonly carrier = new THREE.Group();
  private readonly tilt = new THREE.Group();
  private body = new THREE.Group();
  private readonly bear = buildCharacter('bear');
  private friend: THREE.Group | null = null;
  private vehicle: Vehicle | null = null;
  private lay: Layout = layout({ terrain: 'land' } as Mission);
  private floating = false;
  private flying = false;
  private shake = 0;
  private time = 0;
  private focus = new THREE.Vector3();
  private trees: THREE.Object3D[] = [];
  private bend = 0;
  private gloom = 0;
  private crackFill: THREE.Mesh | null = null;
  /** 镜头拉远多少（0–1）：龙卷风、海啸这种大场面要看全 */
  private wide = 0;
  private wideGoal = 0;
  private readonly mats = new Map<string, THREE.MeshStandardMaterial>();
  private readonly pitMat = new THREE.MeshBasicMaterial({ color: '#2a1a12' });
  /** 测试脚本用：动画加速 */
  timeScale = 1;
  /** 被地图、拼装这些整页画面盖住的时候不用画 */
  paused = false;

  private raf = 0;
  private last = 0;
  private disposed = false;
  private readonly resizeObserver: ResizeObserver;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cb: JourneyCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.background = this.sky;
    this.scene.fog = new THREE.Fog(this.sky, 30, 70);
    this.scene.add(this.hemi);
    this.sun.position.set(6, 14, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, far: 60 });
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target, this.world);

    this.particleMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.85 }),
      MAX_PARTICLES,
    );
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);

    this.tilt.add(this.body);
    this.carrier.add(this.tilt);
    this.scene.add(this.carrier);
    this.bear.scale.setScalar(0.6);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement!);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    disposeGeometry(this.scene);
    this.mats.forEach((m) => m.dispose());
    this.pitMat.dispose();
    this.renderer.dispose();
    // 马上把 WebGL 上下文还回去：浏览器同时能开的有限，进出几次就会把别的画面挤掉
    this.renderer.forceContextLoss();
  }

  // ---------------------------------------------------------------- 搭场景

  /** 同样的颜色和参数共用一个材质：每次出发都重搭一遍场景，材质不用每次新建 */
  private mat(
    color: string,
    extra: THREE.MeshStandardMaterialParameters = {},
  ): THREE.MeshStandardMaterial {
    const key = color + JSON.stringify(extra);
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, ...extra });
      this.mats.set(key, m);
    }
    return m;
  }

  /** 摆好场景和载具，停在起点 */
  setup(v: Vehicle, m: Mission): void {
    this.vehicle = v;
    this.lay = layout(m);
    disposeGeometry(this.world);
    this.world.clear();
    this.trees = [];
    this.loops.clear();
    this.tweens = [];
    this.particles = [];
    this.gloom = 0;
    this.bend = 0;
    this.shake = 0;
    this.crackFill = null;
    this.wide = this.wideGoal = 0;
    this.buildTerrain(m);
    this.buildPlace(m.place, m.friend);

    disposeGeometry(this.body);
    this.tilt.remove(this.body);
    this.body = buildVehicle(v);
    this.tilt.add(this.body);
    // 翻倒时绕靠镜头那边的车边转
    this.tilt.position.set(0, 0, v.width / 2);
    this.body.position.set(0, 0, -v.width / 2);
    this.tilt.rotation.set(0, 0, 0);
    // 上一次挂上去的东西（龙卷风里撑的小伞）拿掉
    for (const extra of this.carrier.children.filter((c) => c !== this.tilt)) {
      this.carrier.remove(extra);
      disposeGeometry(extra);
    }
    this.carrier.rotation.set(0, 0, 0);
    this.carrier.scale.setScalar(1);
    this.seatBear();

    this.floating = false;
    this.flying = false;
    // 海洋关从码头边上出发，其他从路的起点出发
    const startFront = m.terrain === 'ocean' ? 0.4 : -2;
    this.carrier.position.set(startFront - v.length / 2, 0, 0);
    this.focus.set(this.carrier.position.x + 3, 0.8, 0);
  }

  private buildTerrain(m: Mission): void {
    const grass = this.mat('#8fd06c', { roughness: 0.9, flatShading: true });
    const dirt = this.mat('#a8754a', { roughness: 0.9, flatShading: true });
    const path = this.mat('#e3cf98', { roughness: 1 });
    const crack = m.disaster === 'quake' && m.crack ? m.crack : 0;
    const crackStart = this.lay.disasterX + 1.5;
    for (const [a, b] of this.lay.land) {
      // 有裂缝的话，地分成两段，中间先用一块会掉下去的地盖住
      const pieces: [number, number][] =
        crack && a < crackStart && b > crackStart + crack
          ? [
              [a, crackStart],
              [crackStart + crack, b],
            ]
          : [[a, b]];
      for (const [x0, x1] of pieces) {
        const land = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 3, 16), [
          dirt,
          dirt,
          grass,
          dirt,
          dirt,
          dirt,
        ]);
        land.position.set((x0 + x1) / 2, -1.5, -2);
        land.receiveShadow = true;
        this.world.add(land);
        const road = new THREE.Mesh(
          new THREE.BoxGeometry(x1 - x0, 0.02, TRACK_HALF * 2 + 0.4),
          path,
        );
        road.position.set((x0 + x1) / 2, 0.01, 0);
        road.receiveShadow = true;
        this.world.add(road);
      }
    }
    if (crack) {
      const fill = new THREE.Mesh(new THREE.BoxGeometry(crack, 3, 16), [
        dirt,
        dirt,
        grass,
        dirt,
        dirt,
        dirt,
      ]);
      fill.position.set(crackStart + crack / 2, -1.5, -2);
      fill.receiveShadow = true;
      this.world.add(fill);
      this.crackFill = fill;
      // 裂开以后里面黑黑的（比水面高一点，不然会看到下面的海）
      const pit = new THREE.Mesh(new THREE.BoxGeometry(crack, 2.9, 16), this.pitMat);
      pit.position.set(crackStart + crack / 2, -1.57, -2);
      this.world.add(pit);
    }
    // 水：海洋、海边都有；陆地关卡远处也看得到一点海
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      this.mat('#3fb0c2', { roughness: 0.25, transparent: true, opacity: 0.9 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    water.receiveShadow = true;
    water.name = 'water';
    this.world.add(water);

    // 路边的树和远处的山
    for (const [a, b] of this.lay.land) {
      for (let x = a + 1; x < b - 1; x += rand(2.2, 3.6)) {
        if (Math.abs(x - this.lay.friendX) < 2.5) continue;
        const tree = this.tree(rand(0.8, 1.2));
        tree.position.set(x, 0, rand(-6.5, -3.4));
        this.trees.push(tree);
        this.world.add(tree);
      }
    }
    for (let i = 0; i < 6; i++) {
      const cloud = this.cloud();
      cloud.position.set(-10 + i * 9 + rand(-2, 2), rand(7, 10), rand(-16, -10));
      this.world.add(cloud);
    }
    for (let i = 0; i < 6; i++) {
      const hill = new THREE.Mesh(
        new THREE.SphereGeometry(rand(4, 6), 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        this.mat('#9ccf8a', { roughness: 1, flatShading: true }),
      );
      hill.position.set(-16 + i * 11 + rand(-3, 3), WATER_Y, -34);
      hill.scale.y = 0.45;
      this.world.add(hill);
    }
  }

  private tree(scale: number): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.16, 1, 8),
      this.mat('#8b5a34', { flatShading: true }),
    );
    trunk.position.y = 0.5;
    const leaves = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 10, 8),
      this.mat('#5fb86a', { flatShading: true }),
    );
    leaves.position.y = 1.4;
    g.add(trunk, leaves);
    g.scale.setScalar(scale);
    g.traverse((o) => (o.castShadow = true));
    return g;
  }

  private cloud(): THREE.Group {
    const g = new THREE.Group();
    const m = this.mat('#ffffff', { roughness: 1, flatShading: true });
    for (let i = 0; i < 4; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rand(0.9, 1.4), 10, 8), m);
      puff.position.set(i * 1.1 - 1.6, rand(-0.2, 0.3), rand(-0.3, 0.3));
      g.add(puff);
    }
    return g;
  }

  /** 朋友待的地方，朋友站在那里招手 */
  private buildPlace(place: Place, friend: Friend): void {
    const x = this.lay.friendX;
    const m = (color: string): THREE.Material =>
      this.mat(color, { roughness: 0.8, flatShading: true });
    const add = (obj: THREE.Object3D): void => {
      obj.traverse((o) => {
        o.castShadow = true;
        o.receiveShadow = true;
      });
      this.world.add(obj);
    };
    this.friend = buildCharacter(friend);
    this.friend.scale.setScalar(0.6);
    let pos = new THREE.Vector3(x, 0, 0);
    switch (place) {
      case 'field':
        pos = new THREE.Vector3(x, 0, 0);
        break;
      case 'barn': {
        const barn = new THREE.Group();
        barn.add(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 2.2), m('#d9534f')));
        barn.children[0].position.y = 0.9;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.1, 4), m('#7a4a3a'));
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 2.35;
        barn.add(roof);
        barn.position.set(x + 1.8, 0, -3);
        add(barn);
        pos = new THREE.Vector3(x, 0, 0);
        break;
      }
      case 'tree': {
        const tree = this.tree(2.3);
        tree.position.set(x + 0.4, 0, -1.8);
        add(tree);
        // 一根往路上伸的树枝
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.8, 6), m('#8b5a34'));
        branch.rotation.x = Math.PI / 2 - 0.25;
        branch.position.set(x + 0.4, 2.8, -0.9);
        add(branch);
        pos = new THREE.Vector3(x + 0.4, 2.95, -0.2);
        break;
      }
      case 'roof': {
        const house = new THREE.Group();
        const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 2.4), m('#f4e1c1'));
        wall.position.y = 1.1;
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2, 1, 4), m('#4f7fc4'));
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 2.7;
        house.add(wall, roof);
        for (const dx of [-0.6, 0.6]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.05), m('#bfe8ff'));
          win.position.set(dx, 1.3, 1.21);
          house.add(win);
        }
        house.position.set(x + 0.4, 0, -1.6);
        add(house);
        pos = new THREE.Vector3(x + 0.4, 3.05, -1.3);
        break;
      }
      case 'island': {
        if (this.lay.landing === null) {
          const island = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 0.8, 12), m('#8fd06c'));
          island.position.set(x + 2.6, WATER_Y, -0.4);
          add(island);
          const palm = this.tree(0.8);
          palm.position.set(x + 3.2, 0.1, -1.2);
          add(palm);
          pos = new THREE.Vector3(x + 1.6, 0.15, -0.2);
        } else {
          pos = new THREE.Vector3(x, 0, 0);
        }
        break;
      }
      case 'iceberg': {
        const ice = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), m('#e8f8ff'));
        ice.scale.set(1.2, 0.6, 1);
        ice.position.set(x + 2.1, WATER_Y + 0.1, -0.6);
        add(ice);
        pos = new THREE.Vector3(x + 1.9, WATER_Y + 0.75, -0.4);
        this.bob(ice, 0.05);
        break;
      }
      case 'raft': {
        const raft = new THREE.Group();
        for (let i = 0; i < 4; i++) {
          const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.6, 8), m('#b07a45'));
          log.rotation.x = Math.PI / 2;
          log.position.set(i * 0.34 - 0.5, 0, 0);
          raft.add(log);
        }
        raft.position.set(x + 1.6, WATER_Y + 0.05, 0);
        add(raft);
        this.bob(raft, 0.06);
        pos = new THREE.Vector3(x + 1.6, WATER_Y + 0.2, 0);
        break;
      }
    }
    this.friend.position.copy(pos);
    this.friend.rotation.y = -0.4;
    this.world.add(this.friend);
    // 朋友一直在招手（一跳一跳）
    const f = this.friend;
    const y0 = pos.y;
    this.loops.add(() => {
      if (f.parent === this.world) f.position.y = y0 + Math.abs(Math.sin(this.time * 4)) * 0.12;
    });
  }

  private bob(obj: THREE.Object3D, amp: number): void {
    const y0 = obj.position.y;
    const phase = Math.random() * 6;
    this.loops.add(() => (obj.position.y = y0 + Math.sin(this.time * 2 + phase) * amp));
  }

  /** 黄熊队长坐在最靠中间的车头上 */
  private seatBear(): void {
    const heads = this.body.children.filter((p) => PARTS[block(p).part].slot === 'head');
    // 还没拼好（没有车头）的车也会摆出来当背景，那就先不坐
    if (!heads.length) return;
    const mid = ((this.vehicle?.width ?? 1) - 1) / 2;
    const seat = heads.reduce((a, b) =>
      Math.abs(block(a).z - mid) <= Math.abs(block(b).z - mid) ? a : b,
    );
    this.bear.position.set(-0.15, partTop(block(seat).part), 0);
    this.bear.rotation.set(0, 0.5, 0);
    seat.add(this.bear);
  }

  /** 朋友坐哪：最靠前、靠中间的那块非车头（出发的车一定有车尾，所以总能找到） */
  private friendSeat(): THREE.Object3D {
    const mid = ((this.vehicle?.width ?? 1) - 1) / 2;
    const others = this.body.children.filter((p) => PARTS[block(p).part].slot !== 'head');
    return others.reduce((a, b) => {
      const ka = block(a).x * 10 - Math.abs(block(a).z - mid);
      const kb = block(b).x * 10 - Math.abs(block(b).z - mid);
      return ka >= kb ? a : b;
    });
  }

  // ---------------------------------------------------------------- 演出

  /** 把结果演出来；演完 resolve */
  async run(m: Mission, o: Outcome): Promise<void> {
    const v = this.vehicle!;
    const front = (): number => this.carrier.position.x + v.length / 2;
    this.cb.sfx('go');
    this.cb.say(BEAR.go);
    await this.wait(1.2);

    if (o.tooHeavy) {
      // 螺旋桨拼命转，只蹦了两下
      this.spinRotors(true);
      for (let i = 0; i < 2; i++) {
        this.cb.sfx('boing');
        await this.hop(this.carrier, 0.35, 0.45);
      }
      this.cb.say(TOO_HEAVY);
      await this.wait(1.6);
      this.spinRotors(false);
    }

    if (o.mode === 'fly') {
      this.spinRotors(true);
      this.flying = true;
      this.cb.sfx('whoosh');
      await this.tween(1.3, (p) => (this.carrier.position.y = ease(p) * FLY_Y));
    } else if (m.terrain === 'ocean') {
      // 从码头滑进水里
      await this.moveFront(this.lay.shore! + 0.2, 2);
      if (o.cause === 'cantSwim') return this.stuckAtShore();
      await this.enterWater(o.cause === 'sank');
      if (o.cause === 'sank') return;
    } else if (o.cause === 'stuckOnLand') {
      return this.wiggle();
    }

    // 海边：先开到岸边下水
    if (m.terrain === 'coast' && o.mode !== 'fly') {
      await this.moveFront(this.lay.shore! - 0.1);
      if (o.cause === 'cantSwim') return this.stuckAtShore();
      await this.enterWater(o.cause === 'sank');
      if (o.cause === 'sank') return;
    }

    if (m.spot === 'high') {
      // 先开到朋友下面，再看够不够得着
      await this.moveFront(this.lay.friendX + 0.6 + (o.mode === 'fly' ? 0.2 : 0));
      if (o.cause === 'cantReach') {
        this.cb.say(CAUSES.cantReach.what);
        for (let i = 0; i < 3; i++) {
          this.cb.sfx('hop');
          await this.hop(this.bear, 0.5, 0.4);
        }
        await this.wait(1);
        return;
      }
      if (o.raised) await this.raiseBoom(true);
      if (o.mode === 'fly')
        await this.tween(0.8, (p) => (this.carrier.position.y = FLY_Y + p * 0.5));
      if (m.disaster !== 'none') {
        const ok = await this.disaster(m, o);
        if (!ok) return;
      }
      await this.pickUp();
      if (o.raised) await this.raiseBoom(false);
      return this.finish(front());
    }

    if (m.disaster !== 'none') {
      await this.moveFront(this.lay.disasterX + (m.crack ? 1.3 : 0));
      const ok = await this.disaster(m, o);
      if (!ok) return;
    }
    // 海边：过了海上岸
    if (m.terrain === 'coast' && o.mode !== 'fly') {
      await this.moveFront(this.lay.landing! + 0.2);
      await this.leaveWater();
    }
    // 水上的朋友在木筏、冰山、小岛上，停在它们前面一点
    const stop =
      m.place === 'iceberg' || m.place === 'raft' || (m.place === 'island' && m.terrain === 'ocean')
        ? 0.3
        : -0.7;
    await this.moveFront(this.lay.friendX + stop);
    await this.pickUp();
    return this.finish(front());
  }

  /** 灾害：返回载具有没有扛住 */
  private async disaster(m: Mission, o: Outcome): Promise<boolean> {
    if (m.disaster === 'none') return true;
    this.cb.say(DISASTER_LINES[m.disaster]);
    const fail = !!o.cause;
    switch (m.disaster) {
      case 'typhoon':
        return this.typhoon(o, fail);
      case 'tornado':
        return this.tornado(o, fail);
      case 'quake':
        return this.quake(m, o, fail);
      case 'tsunami':
        return this.tsunami(o);
    }
  }

  /** 拔河条从 0 慢慢拉到最后的比值，中间一抖一抖 */
  private tugTo(ratio: number, dur: number): Promise<void> {
    const target = Math.min(ratio, 1.6);
    return this.tween(dur, (p) =>
      this.cb.tug(target * ease(Math.min(1, p * 1.3)) * (1 + Math.sin(this.time * 9) * 0.06)),
    );
  }

  private async typhoon(o: Outcome, fail: boolean): Promise<boolean> {
    this.cb.sfx('wind');
    const storm = this.storm();
    await this.tween(1.2, (p) => {
      this.gloom = p;
      this.bend = p;
    });
    const r = Math.min(o.ratio, 1.2);
    const sway = (amp: number): void => {
      this.tilt.rotation.x = amp * (0.6 + 0.4 * Math.sin(this.time * 6));
    };
    if (o.cause === 'blownAway') {
      void this.tugTo(9, 1.5);
      await this.wait(1.2);
      this.cb.say(CAUSES.blownAway.what);
      this.cb.sfx('whoosh');
      const start = this.carrier.position.clone();
      await this.tween(2.4, (p) => {
        this.carrier.position.set(start.x + p * 3, start.y + p * 5, start.z + p * p * 14);
        this.carrier.rotation.set(p * 6, p * 9, p * 3);
      });
      this.cb.say(BEAR.wow);
      await this.wait(1.4);
      this.cb.tug(null);
      return false;
    }
    void this.tugTo(o.ratio, 2.6);
    await this.tween(2.6, (p) => sway(r * 0.32 * Math.min(1, p * 1.5)));
    if (fail) {
      this.cb.sfx('crash');
      const from = this.tilt.rotation.x;
      const y0 = this.carrier.position.y;
      // 侧着倒下；船翻了就侧躺在水面上漂着
      await this.tween(0.7, (p) => {
        this.tilt.rotation.x = from + (Math.PI / 2 - from) * ease(p);
        if (o.cause === 'capsized') this.carrier.position.y = y0 - ease(p) * 0.2;
      });
      if (o.cause === 'capsized') this.splash(this.carrier.position.clone().setY(WATER_Y), 30, 4);
      this.cb.say(BEAR.wow);
      await this.wait(1.2);
      this.cb.say(CAUSES[o.cause!].what);
      this.cb.tug(null);
      // 雨慢慢停了
      await this.tween(1.8, (p) => {
        this.gloom = 1 - p;
        this.bend = 1 - p;
      });
      this.loops.delete(storm);
      return false;
    }
    await this.tween(1.5, (p) => sway(r * 0.32 * (1 - p)));
    this.tilt.rotation.x = 0;
    this.cb.tug(null);
    await this.tween(1, (p) => {
      this.gloom = 1 - p;
      this.bend = 1 - p;
    });
    this.loops.delete(storm);
    return true;
  }

  /** 下雨刮风：返回每帧的效果，结束时删掉 */
  private storm(): (dt: number) => void {
    const fn = (dt: number): void => {
      if (this.gloom < 0.2) return;
      const n = Math.round(60 * dt * 10 * this.gloom);
      for (let i = 0; i < n; i++) {
        const p = this.focus
          .clone()
          .add(new THREE.Vector3(rand(-14, 14), rand(6, 10), rand(-10, 4)));
        this.spawn(
          p,
          new THREE.Vector3(1, -16, 6),
          0.8,
          new THREE.Vector3(0.03, 0.5, 0.03),
          '#d8eef8',
          0,
        );
      }
      if (Math.random() < dt * 8) {
        // 一道一道的风
        const p = this.focus.clone().add(new THREE.Vector3(rand(-10, 10), rand(0.5, 4), -8));
        this.spawn(
          p,
          new THREE.Vector3(2, 0, 16),
          1.1,
          new THREE.Vector3(0.04, 0.04, 1.6),
          '#ffffff',
          0,
        );
      }
    };
    this.loops.add(fn);
    return fn;
  }

  private async tornado(o: Outcome, fail: boolean): Promise<boolean> {
    this.cb.sfx('wind');
    const funnel = this.funnel();
    const cx = this.carrier.position.x;
    this.wideGoal = 1;
    funnel.position.set(cx + 12, 0, -1);
    this.world.add(funnel);
    await this.tween(1, (p) => (this.gloom = p * 0.6));
    void this.tugTo(o.ratio, 3.2);
    // 抓地：铲斗插进地里，吊钩垂到地上
    if (!o.onWater && o.stats.anchor > 0 && o.mode !== 'fly') void this.anchor(true);
    // 龙卷风从右边过来
    await this.tween(3.2, (p) => {
      funnel.position.x = cx + 12 - p * 12;
      if (!fail) this.tilt.rotation.x = Math.sin(this.time * 20) * 0.04 * Math.min(1, o.ratio) * p;
    });
    if (fail) {
      this.cb.say(BEAR.wow);
      this.cb.sfx('whoosh');
      const start = this.carrier.position.clone();
      await this.tween(2.4, (p) => {
        const a = p * 10;
        this.carrier.position.set(
          cx + Math.sin(a) * 1.2,
          start.y + ease(p) * 6,
          Math.cos(a) * 1.2 - 1,
        );
        this.carrier.rotation.y = a;
        funnel.position.x = cx - p * 2;
      });
      // 撑着小伞，轻轻地落下来
      const umbrella = this.umbrella(this.vehicle!);
      this.carrier.add(umbrella);
      const top = this.carrier.position.clone();
      const end = new THREE.Vector3(cx - 4, o.onWater ? FLOAT_Y : 0, 0);
      await this.tween(3, (p) => {
        funnel.position.x = cx - 2 - p * 14;
        this.carrier.position.lerpVectors(top, end, ease(p));
        this.carrier.position.x += Math.sin(p * 9) * 0.4;
        this.carrier.rotation.y = 10 + p * 2;
        this.gloom = 0.6 * (1 - p);
      });
      this.cb.tug(null);
      this.world.remove(funnel);
      this.wideGoal = 0;
      this.cb.say(CAUSES.sucked.what);
      await this.wait(1.6);
      return false;
    }
    this.cb.say(BEAR.hold);
    await this.tween(2.4, (p) => {
      funnel.position.x = cx - p * 14;
      this.tilt.rotation.x = Math.sin(this.time * 20) * 0.04 * (1 - p);
      this.gloom = 0.6 * (1 - p);
    });
    this.tilt.rotation.x = 0;
    this.cb.tug(null);
    this.world.remove(funnel);
    this.wideGoal = 0;
    if (!o.onWater && o.stats.anchor > 0) await this.anchor(false);
    return true;
  }

  private funnel(): THREE.Group {
    const g = new THREE.Group();
    const m = this.mat('#8a9298', {
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const r0 = 0.35 + i * 0.33;
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 0.33, r0, 1.05, 18, 1, true), m);
      ring.position.y = 0.5 + i;
      ring.rotation.y = i;
      rings.push(ring);
      g.add(ring);
    }
    this.loops.add((dt) => {
      rings.forEach((r, i) => {
        r.rotation.y += dt * (5 - i * 0.2);
        r.position.x = Math.sin(this.time * 3 + i * 0.5) * 0.15 * i;
      });
      if (g.parent && Math.random() < dt * 30) {
        // 被卷起来的叶子和土
        const a = rand(0, Math.PI * 2);
        const h = rand(0, 7);
        const p = g.position
          .clone()
          .add(new THREE.Vector3(Math.cos(a) * (0.6 + h * 0.3), h, Math.sin(a) * (0.6 + h * 0.3)));
        const v = new THREE.Vector3(-Math.sin(a) * 6, 2, Math.cos(a) * 6);
        this.spawn(
          p,
          v,
          0.8,
          new THREE.Vector3(0.12, 0.12, 0.12),
          Math.random() < 0.5 ? '#6fae5a' : '#9b7a55',
          0,
        );
      }
    });
    return g;
  }

  private umbrella(v: Vehicle): THREE.Group {
    const g = new THREE.Group();
    const r = Math.max(v.length, v.width) * 0.6 + 0.4;
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(r, r * 0.5, 12, 1, true),
      this.mat('#f47c7c', { side: THREE.DoubleSide, flatShading: true }),
    );
    canopy.position.y = 2.6;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), this.mat('#555'));
    stick.position.y = 1.7;
    g.add(canopy, stick);
    return g;
  }

  private async quake(m: Mission, o: Outcome, fail: boolean): Promise<boolean> {
    this.cb.sfx('rumble');
    const shaking = o.cause === 'shookOver';
    const r = Math.min(o.ratio, 1.2);
    void this.tugTo(m.crack && o.cause === 'fellInCrack' ? 0.3 : o.ratio, 2.8);
    const fill = this.crackFill;
    await this.tween(2.8, (p, dt) => {
      this.shake = 1;
      // 树一起摇，地上冒土
      this.bend = Math.sin(this.time * 17) * 0.5;
      if (Math.random() < dt * 14) {
        const at = this.carrier.position
          .clone()
          .add(new THREE.Vector3(rand(-7, 7), 0, rand(-4, 3)));
        this.dust(at.setY(0.05), 5);
      }
      const amp = (o.mode === 'fly' ? 0 : r) * 0.22 * Math.min(1, p * 1.4);
      this.tilt.rotation.x = Math.abs(Math.sin(this.time * 13)) * amp;
      this.swingBall(this.tilt.rotation.x);
      // 裂缝裂开：盖着的那块地往下掉
      if (fill && p > 0.4) fill.position.y = -1.5 - ease((p - 0.4) / 0.6) * 0.5;
    });
    if (shaking && fail) {
      this.cb.sfx('crash');
      const from = this.tilt.rotation.x;
      await this.tween(0.7, (p) => (this.tilt.rotation.x = from + (Math.PI / 2 - from) * ease(p)));
      this.shake = 0;
      this.bend = 0;
      this.cb.say(BEAR.wow);
      await this.wait(1.2);
      this.cb.say(CAUSES.shookOver.what);
      await this.wait(1.8);
      this.cb.tug(null);
      return false;
    }
    await this.tween(0.6, (p) => {
      this.tilt.rotation.x *= 1 - p;
      this.swingBall(this.tilt.rotation.x);
    });
    this.tilt.rotation.x = 0;
    this.shake = 0;
    this.bend = 0;
    this.cb.tug(null);
    if (m.crack && o.mode !== 'fly') {
      const crackStart = this.lay.disasterX + 1.5;
      if (o.cause === 'fellInCrack') {
        // 开到车身中间在裂缝上，掉下去
        await this.moveFront(crackStart + m.crack / 2 + this.vehicle!.length / 2);
        this.cb.sfx('crash');
        await this.tween(0.8, (p) => {
          this.carrier.position.y = -ease(p) * 0.5;
          this.carrier.rotation.z = -ease(p) * 0.35;
        });
        this.dust(this.carrier.position.clone().setY(0), 30);
        this.cb.say(BEAR.wow);
        await this.wait(1.2);
        this.cb.say(CAUSES.fellInCrack.what);
        await this.wait(1.8);
        return false;
      }
      // 车身比裂缝长，一下就开过去了
      await this.moveFront(crackStart + m.crack + this.vehicle!.length / 2 + 0.6);
    }
    return true;
  }

  private swingBall(tilt: number): void {
    for (const part of this.body.children) {
      const ball = part.getObjectByName('ball');
      if (ball) ball.rotation.x = -tilt * 2.5;
    }
  }

  private async tsunami(o: Outcome): Promise<boolean> {
    this.cb.sfx('rumble');
    const cx = this.carrier.position.x;
    const startX = cx + 18;
    const len = 2.4;
    const height = 2.4;
    this.wideGoal = 0.6;
    const wave = new WaveMesh(25);
    this.world.add(wave.mesh);
    let front = 0;
    const samples: WaveSample[] = Array.from({ length: 25 }, (_, j) => ({
      w: j - 12,
      front: 0,
      height: 0,
    }));
    const toWorld = (w: number, s: number, y: number): THREE.Vector3 =>
      new THREE.Vector3(startX - s, y, w * 0.8);
    const surface = (x: number): number => {
      const u = (startX - x - front) / len;
      if (u > 0.7 || u < -1.7) return 0;
      // 浮着的东西顺着浪头爬上去、骑在浪尖上，再从浪背面滑下来（浪背面和 wave-mesh.ts 的横截面差不多）
      const pts = [
        [-1.7, 0],
        [-1.2, 0.28],
        [-0.75, 0.66],
        [-0.4, 0.92],
        [-0.1, 1.04],
        [0.1, 1.06],
        [0.7, 0],
      ];
      for (let i = 1; i < pts.length; i++) {
        if (u <= pts[i][0]) {
          const [u0, v0] = pts[i - 1];
          const [u1, v1] = pts[i];
          return (v0 + ((u - u0) / (u1 - u0)) * (v1 - v0)) * height;
        }
      }
      return 0;
    };
    void this.tugTo(o.ratio, 3);
    // 现在的关卡里海啸都在水上，浮着的一定过得去；在地上才可能被冲走
    const washed = o.cause === 'washedAway';
    const baseY = this.carrier.position.y;
    await this.tween(7, (p, dt) => {
      front = p * 34;
      for (const sm of samples) {
        sm.front = front;
        // 两头矮一点，看不到切口
        sm.height = height * Math.min(1, (12 - Math.abs(sm.w)) / 4);
      }
      wave.update(samples, toWorld, -2, WATER_Y, len, this.time);
      if (o.mode !== 'fly') {
        // 在地上挡不住的：被浪推着往后冲，打着转
        if (washed && surface(this.carrier.position.x) > 0.3) {
          this.carrier.position.x -= dt * 7;
          this.carrier.rotation.y += dt * 3;
        }
        const x = this.carrier.position.x;
        const lift = surface(x);
        this.carrier.position.y = baseY + lift;
        // 爬浪的时候船头翘起来，下浪的时候低头；窄的船晃得厉害
        const slope = surface(x + 0.5) - surface(x - 0.5);
        const rock =
          lift > 0.1 ? Math.sin(this.time * 5) * 0.06 * (o.stats.width === 1 ? 2 : 1) : 0;
        this.tilt.rotation.z = THREE.MathUtils.clamp(Math.atan(slope) * 0.5, -0.45, 0.45) + rock;
      }
      // 浪头的水花
      if (Math.random() < dt * 20) {
        const w = rand(-9, 9);
        this.spawn(
          toWorld(w, front + LIP.u * len, WATER_Y + LIP.v * height),
          new THREE.Vector3(rand(-3, -1), rand(1, 3), rand(-1, 1)),
          0.7,
          new THREE.Vector3(0.18, 0.18, 0.18),
          '#ffffff',
          8,
        );
      }
    });
    this.tilt.rotation.z = 0;
    this.carrier.position.y = baseY;
    this.world.remove(wave.mesh);
    wave.mesh.geometry.dispose();
    this.wideGoal = 0;
    this.cb.tug(null);
    if (washed) {
      this.cb.say(BEAR.wow);
      await this.wait(1.2);
      this.cb.say(CAUSES.washedAway.what);
      await this.wait(1.8);
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- 小动作

  private async moveFront(x: number, speed = SPEED): Promise<void> {
    const v = this.vehicle!;
    const from = this.carrier.position.x;
    const to = x - v.length / 2;
    const dist = Math.abs(to - from);
    if (dist < 0.01) return;
    let prev = from;
    await this.tween(dist / speed + 0.4, (p) => {
      const x = from + (to - from) * ease(p);
      this.rollWheels(x - prev);
      prev = x;
      this.carrier.position.x = x;
    });
  }

  private rollWheels(dx: number): void {
    if (this.flying || this.floating) return;
    for (const part of this.body.children) {
      part.traverse((o) => {
        if (o.name === 'wheel') o.rotation.z -= dx / 0.22;
      });
    }
  }

  private spinRotors(on: boolean): void {
    const key = 'rotors';
    if (!on) {
      const fn = this.carrier.userData[key];
      if (fn) this.loops.delete(fn);
      return;
    }
    const fn = (dt: number): void => {
      for (const part of this.body.children) {
        const b = part.getObjectByName('blades');
        if (b) b.rotation.y += dt * 22;
        const t = part.getObjectByName('tailRotor');
        if (t) t.rotation.z += dt * 30;
      }
    };
    this.carrier.userData[key] = fn;
    this.loops.add(fn);
  }

  private async hop(obj: THREE.Object3D, h: number, dur: number): Promise<void> {
    const y0 = obj.position.y;
    await this.tween(dur, (p) => (obj.position.y = y0 + Math.sin(p * Math.PI) * h));
    obj.position.y = y0;
  }

  private async stuckAtShore(): Promise<void> {
    this.cb.sfx('boing');
    await this.tween(0.5, (p) => (this.carrier.position.x -= Math.sin(p * Math.PI) * 0.02));
    this.splash(new THREE.Vector3(this.lay.shore!, WATER_Y, 0), 14, 3);
    this.cb.say(BEAR.stuck);
    await this.hop(this.bear, 0.4, 0.4);
    await this.wait(0.8);
    this.cb.say(CAUSES.cantSwim.what);
    await this.wait(2);
  }

  /** 船在地上：原地扭来扭去，走不动 */
  private async wiggle(): Promise<void> {
    this.cb.sfx('boing');
    const x0 = this.carrier.position.x;
    await this.tween(1.6, (p) => {
      this.carrier.position.x = x0 + Math.sin(p * Math.PI * 6) * 0.12;
      this.carrier.rotation.y = Math.sin(p * Math.PI * 6) * 0.06;
    });
    this.carrier.rotation.y = 0;
    this.dust(this.carrier.position.clone(), 16);
    this.cb.say(BEAR.stuck);
    await this.wait(1.2);
    this.cb.say(CAUSES.stuckOnLand.what);
    await this.wait(2);
  }

  private async enterWater(sink: boolean): Promise<void> {
    const v = this.vehicle!;
    const x0 = this.carrier.position.x;
    this.cb.sfx('splash');
    await this.tween(1.1, (p) => {
      this.carrier.position.x = x0 + p * (v.length / 2 + 0.8);
      this.carrier.position.y = FLOAT_Y * ease(p);
      this.carrier.rotation.z = -Math.sin(p * Math.PI) * 0.15;
    });
    this.splash(this.carrier.position.clone().setY(WATER_Y), 24, 4);
    this.floating = true;
    if (!sink) {
      this.startBob();
      return;
    }
    // 太重：咕噜咕噜沉下去一半，黄熊坐上救生圈
    await this.wait(0.5);
    const bubbles = (dt: number): void => {
      if (Math.random() < dt * 25) {
        const p = this.carrier.position
          .clone()
          .add(new THREE.Vector3(rand(-1, 1), 0.2, rand(-1, 1)));
        this.spawn(
          p.setY(WATER_Y),
          new THREE.Vector3(0, 1.5, 0),
          0.6,
          new THREE.Vector3(0.12, 0.12, 0.12),
          '#e8fbff',
          -1,
        );
      }
    };
    this.loops.add(bubbles);
    await this.tween(2, (p) => {
      this.carrier.position.y = FLOAT_Y - ease(p) * 0.9;
      this.carrier.rotation.z = Math.sin(this.time * 3) * 0.05;
    });
    this.loops.delete(bubbles);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.16, 8, 16),
      this.mat('#ff6b5a', { flatShading: true }),
    );
    ring.rotation.x = Math.PI / 2;
    const bearPos = new THREE.Vector3();
    this.bear.getWorldPosition(bearPos);
    this.world.attach(this.bear);
    const ringPos = new THREE.Vector3(
      this.carrier.position.x + v.length / 2 + 0.8,
      WATER_Y + 0.05,
      0.8,
    );
    ring.position.copy(ringPos);
    this.world.add(ring);
    this.bob(ring, 0.05);
    this.cb.sfx('hop');
    await this.arc(this.bear, ringPos.clone().setY(WATER_Y - 0.1), 0.8, 1.2);
    this.cb.say(BEAR.wow);
    await this.wait(1);
    this.cb.say(CAUSES.sank.what);
    await this.wait(2);
  }

  private async leaveWater(): Promise<void> {
    this.stopBob();
    this.floating = false;
    const x0 = this.carrier.position.x;
    const y0 = this.carrier.position.y;
    await this.tween(0.9, (p) => {
      this.carrier.position.x = x0 + p * 0.8;
      this.carrier.position.y = y0 + (0 - y0) * ease(p);
      this.carrier.rotation.z = Math.sin(p * Math.PI) * 0.12;
    });
    this.carrier.rotation.z = 0;
  }

  private bobFn: ((dt: number) => void) | null = null;
  private startBob(): void {
    this.bobFn = () => {
      this.body.position.y = Math.sin(this.time * 2.2) * 0.05;
      this.body.rotation.x = Math.sin(this.time * 1.7) * 0.03;
    };
    this.loops.add(this.bobFn);
  }
  private stopBob(): void {
    if (this.bobFn) this.loops.delete(this.bobFn);
    this.body.position.y = 0;
    this.body.rotation.x = 0;
  }

  private async raiseBoom(up: boolean): Promise<void> {
    const booms: THREE.Object3D[] = [];
    this.body.traverse((o) => o.name === 'boom' && booms.push(o));
    const target = up ? 1.05 : 0;
    const from = booms[0]?.rotation.z ?? 0;
    this.cb.sfx('whoosh');
    await this.tween(1.1, (p) => {
      for (const b of booms) {
        b.rotation.z = from + (target - from) * ease(p);
        // 举起来的时候吊臂一节一节伸长
        b.scale.x = 1 + (b.rotation.z / 1.05) * 0.9;
        // 吊钩一直往下垂
        const hook = b.getObjectByName('hook');
        if (hook) hook.rotation.z = -b.rotation.z;
      }
    });
  }

  private async anchor(down: boolean): Promise<void> {
    const arms: THREE.Object3D[] = [];
    const hooks: THREE.Object3D[] = [];
    this.body.traverse((o) => {
      if (o.name === 'arm') arms.push(o);
      if (o.name === 'rope') hooks.push(o);
    });
    await this.tween(0.6, (p) => {
      const k = down ? p : 1 - p;
      for (const a of arms) a.rotation.z = 0.5 - k * 0.95;
      // 吊绳放长，吊钩勾到地上
      for (const h of hooks) {
        h.scale.y = 1 + k * 1.6;
        h.position.y = -0.3 - k * 0.24;
        const hook = h.parent!.children[1];
        if (hook) hook.position.y = -0.36 - k * 0.48;
      }
    });
    if (down) this.dust(this.carrier.position.clone().setY(0.1), 14);
  }

  /** 朋友跳上车 */
  private async pickUp(): Promise<void> {
    const f = this.friend!;
    const seat = this.friendSeat();
    const top = partTop(block(seat).part);
    const target = new THREE.Vector3(0, top, 0);
    seat.localToWorld(target);
    this.cb.say(BEAR.coming);
    await this.wait(0.8);
    this.world.attach(f);
    this.cb.sfx('hop');
    await this.arc(f, target, 1.4, 0.9);
    seat.attach(f);
    f.position.set(0, top, 0);
    f.rotation.set(0, 0.6, 0);
    this.cb.sfx('pop');
    this.cb.say(RESCUED);
  }

  private async finish(front: number): Promise<void> {
    await this.wait(0.8);
    if (this.flying) {
      // 救高处朋友时飞高了一点，落回平常的高度
      const y0 = this.carrier.position.y;
      await this.tween(1, (p) => (this.carrier.position.y = y0 + (FLY_Y - y0) * ease(p)));
    }
    // 大家一起蹦一下
    void this.hop(this.bear, 0.35, 0.4);
    void this.hop(this.friend!, 0.35, 0.4);
    await this.moveFront(front + 2.5, 2);
  }

  /** 沿抛物线跳到目标（世界坐标） */
  private async arc(obj: THREE.Object3D, to: THREE.Vector3, h: number, dur: number): Promise<void> {
    const from = obj.position.clone();
    const local = obj.parent ? obj.parent.worldToLocal(to.clone()) : to;
    await this.tween(dur, (p) => {
      obj.position.lerpVectors(from, local, p);
      obj.position.y += Math.sin(p * Math.PI) * h;
    });
  }

  // ---------------------------------------------------------------- 粒子 / 动画

  private tween(dur: number, update: (p: number, dt: number) => void): Promise<void> {
    // 场景拆掉以后就一直等着：不然后面的演出会一下子跑完，在别的页面上说话
    return new Promise((done) => {
      if (!this.disposed) this.tweens.push({ t: 0, dur, update, done });
    });
  }

  private wait(sec: number): Promise<void> {
    return this.tween(sec, () => {});
  }

  private spawn(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    life: number,
    size: THREE.Vector3,
    color: string,
    gravity: number,
  ): void {
    if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
    this.particles.push({
      pos: pos.clone(),
      vel,
      life,
      maxLife: life,
      size,
      color: new THREE.Color(color),
      gravity,
    });
  }

  private splash(at: THREE.Vector3, n: number, power: number): void {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1))
        .normalize()
        .multiplyScalar(rand(0.5, power * 0.4));
      v.y = rand(power * 0.6, power * 1.2);
      const s = rand(0.1, 0.24);
      this.spawn(
        at,
        v,
        rand(0.7, 1.2),
        new THREE.Vector3(s, s, s),
        Math.random() < 0.6 ? '#ffffff' : '#8fdcf0',
        10,
      );
    }
  }

  private dust(at: THREE.Vector3, n: number): void {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rand(-2, 2), rand(0.5, 2), rand(-2, 2));
      const s = rand(0.15, 0.3);
      this.spawn(at, v, rand(0.6, 1), new THREE.Vector3(s, s, s), '#d9c29a', 3);
    }
  }

  private resize(): void {
    const el = this.canvas.parentElement!;
    this.renderer.setSize(el.clientWidth, el.clientHeight, false);
    this.camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
    this.camera.updateProjectionMatrix();
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.visibilityState !== 'visible' || this.paused) {
      this.last = 0;
      return;
    }
    const dt = (this.last ? Math.min(0.05, (now - this.last) / 1000) : 0) * this.timeScale;
    this.last = now;
    this.time += dt;
    this.wide += (this.wideGoal - this.wide) * Math.min(1, dt * 2);

    for (const tw of [...this.tweens]) {
      tw.t += dt;
      tw.update(Math.min(1, tw.t / tw.dur), dt);
      if (tw.t >= tw.dur) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done();
      }
    }
    for (const fn of [...this.loops]) fn(dt);

    // 刮风时树往镜头这边弯，天变暗
    for (const t of this.trees)
      t.rotation.x = this.bend * (0.25 + Math.sin(this.time * 5 + t.position.x) * 0.1);
    this.sky.set('#bfe7f2').lerp(new THREE.Color('#7f939f'), this.gloom * 0.8);
    this.hemi.intensity = 1.3 - this.gloom * 0.5;
    this.sun.intensity = 2.3 - this.gloom * 1.5;
    if (this.flying) this.body.position.y = Math.sin(this.time * 2.5) * 0.08;

    // 粒子
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    let pn = 0;
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const k = Math.min(1, (p.life / p.maxLife) * 2);
      m.compose(p.pos, q, s.copy(p.size).multiplyScalar(k));
      this.particleMesh.setMatrixAt(pn, m);
      this.particleMesh.setColorAt(pn++, p.color);
    }
    this.particleMesh.count = pn;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    // 镜头跟着载具，从右前上方斜着看；竖屏时退远一点
    const goal = this.carrier.position.clone();
    goal.x += 1.5;
    // 在浪上起伏时镜头不跟着上下，才看得出被浪托起来；飞高了、被卷上天才跟上去
    goal.y = 0.6 + Math.max(0, goal.y - 1.5) * 0.8 + this.wide * 1.5;
    this.focus.lerp(goal, Math.min(1, dt * 3));
    const far = (1 + this.wide * 0.5) / Math.pow(Math.min(1, this.camera.aspect / 1.3), 0.6);
    const jitter = this.shake
      ? new THREE.Vector3(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(0.16)
      : new THREE.Vector3();
    this.camera.position
      .copy(this.focus)
      .add(new THREE.Vector3(-2.5 * far, 6.5 * far, 14 * far))
      .add(jitter);
    this.camera.lookAt(this.focus);
    this.sun.position.copy(this.focus).add(new THREE.Vector3(6, 14, 8));
    this.sun.target.position.copy(this.focus);
    this.renderer.render(this.scene, this.camera);
  };
}

function block(obj: THREE.Object3D): Block {
  return obj.userData['block'] as Block;
}
