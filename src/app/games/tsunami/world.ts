import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { generateIsland } from './island';
import { buildItem, ItemKind, meteor, roof, spire, volcano } from './models';
import { EventKind, FLOOR_H, HALFWAY, MAX_FLOORS, TAIPEI_101 } from './tsunami-data';
import { LIP, WaveMesh, WaveSample } from './wave-mesh';

export type Tool = 'build' | 'road' | 'remove' | ItemKind;

/**
 * 当前的小岛地图：L 陆地，W 小河，. 海。每次进游戏、每次清空都重新随机生成。
 * 一个页面同时只有一个 World，所以放在模块里，tileCenter / cell 这些小函数可以直接用。
 */
let MAP: string[] = [];
let W = 0;
let D = 0;
const SEA_Y = -0.15;
/** 船能放在离岛多远的海里 */
const SEA_MARGIN = 3;
/** 海浪从岛外多远开始 */
const WAVE_START = -3;
const WAVE_SPEED = 2.6;
const MAX_BLOCKS = 4000;
const MAX_PARTICLES = 800;

/** 磁力片的颜色，一层一层轮换，像彩虹 */
const TILE_COLORS = ['#ff5a5f', '#ff9f1c', '#ffd23f', '#3bceac', '#3a86ff', '#9b5de5'].map(
  (c) => new THREE.Color(c),
);
const ROOF_COLORS = ['#ffd23f', '#9b5de5', '#3bceac', '#ff5a5f'];

type Dir = 'x+' | 'x-' | 'z+' | 'z-';
const DIRS: Dir[] = ['x+', 'x-', 'z+', 'z-'];

export interface WaveResult {
  saved: number;
  lost: number;
  blocked: boolean;
}

export interface WorldCallbacks {
  /** 楼高变了（加了或拆了一层） */
  floor(height: number): void;
  /** 盖到 101 */
  taipei(): void;
  /** 盖到 50 层 */
  halfway(): void;
  /** 每帧：当前这栋楼的层数标签在屏幕上的位置 */
  label(pos: { x: number; y: number } | null, height: number): void;
  /** 有楼被冲倒 */
  collapse(): void;
  /** 有一排海浪被楼挡住 */
  blocked(): void;
}

/** 一个会动的东西：楼的一层、楼顶、车、船 */
interface Body {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  /** home 在原位；drop 正从天上落下；debris 被冲走在乱飞；back 正飞回原位 */
  mode: 'home' | 'drop' | 'debris' | 'back';
  t: number;
  delay: number;
  from: THREE.Vector3;
  fromQuat: THREE.Quaternion;
}

interface Tower {
  x: number;
  z: number;
  blocks: Body[];
  roof: { obj: THREE.Object3D; body: Body } | null;
  is101: boolean;
  collapsed: boolean;
}

interface Item {
  kind: ItemKind;
  x: number;
  z: number;
  rot: number;
  obj: THREE.Group;
  body: Body;
  state: 'idle' | 'carried' | 'lost';
  lane: Lane | null;
  offset: number;
  depth: number;
}

interface Lane {
  idx: number;
  front: number;
  nextK: number;
  stopped: boolean;
  done: boolean;
  /** 浪高的比例：被楼挡住后慢慢塌下来 */
  level: number;
}

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
  gravity: number;
}

interface Tween {
  t: number;
  dur: number;
  update(p: number, dt: number): void;
  done?(): void;
}

const key = (x: number, z: number): string => `${x},${z}`;
const IDENTITY = new THREE.Quaternion();
const ease = (p: number): number => 1 - Math.pow(1 - p, 3);
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

function newBody(pos: THREE.Vector3, mode: Body['mode'] = 'home'): Body {
  return {
    pos: pos.clone(),
    quat: new THREE.Quaternion(),
    vel: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    mode,
    t: 0,
    delay: 0,
    from: pos.clone(),
    fromQuat: new THREE.Quaternion(),
  };
}

/** 地块中心的世界坐标 */
function tileCenter(x: number, z: number, y = 0): THREE.Vector3 {
  return new THREE.Vector3(x - W / 2 + 0.5, y, z - D / 2 + 0.5);
}

function cell(x: number, z: number): string {
  return MAP[z]?.[x] ?? '.';
}

/** 台北 101 的造型：底座 + 8 节往外张的"竹节" + 收尖的顶 */
function shape101(floor: number): number {
  if (floor < 25) return 1 - floor * 0.004;
  if (floor < 89) return 0.76 + ((floor - 25) % 8) * 0.03;
  return Math.max(0.3, 0.66 - (floor - 89) * 0.025);
}

/** 磁力片的贴图：白色边框 + 半透明的中间 */
function tileTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 56, 56);
  g.fillStyle = 'rgba(255,255,255,0.8)';
  for (const [x, y] of [
    [16, 32],
    [48, 32],
  ]) {
    g.beginPath();
    g.arc(x, y, 3, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class World {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private readonly raycaster = new THREE.Raycaster();

  private readonly blockMesh: THREE.InstancedMesh;
  /** 第 i 个实例属于哪栋楼 */
  private blockOwners: Tower[] = [];
  private islandMesh: THREE.InstancedMesh | null = null;
  private landTiles: { x: number; z: number; delay: number }[] = [];
  /** 新岛从天上一块一块落下来，Bastion 那样拼起来 */
  private islandTime = 0;
  private islandDone = false;
  private readonly islandGeo = new THREE.BoxGeometry(1, 1.6, 1).translate(0, -0.8, 0);
  private readonly islandMats = (() => {
    const dirt = new THREE.MeshStandardMaterial({
      color: '#a8754a',
      roughness: 0.9,
      flatShading: true,
    });
    const grass = new THREE.MeshStandardMaterial({
      color: '#8fd06c',
      roughness: 0.9,
      flatShading: true,
    });
    return [dirt, dirt, grass, dirt, dirt, dirt];
  })();
  private readonly roadMats = {
    asphalt: new THREE.MeshStandardMaterial({ color: '#6a6e78', roughness: 0.9 }),
    line: new THREE.MeshStandardMaterial({ color: '#f4ecd8', roughness: 0.6 }),
    bridge: new THREE.MeshStandardMaterial({
      color: '#3a6ff0',
      transparent: true,
      opacity: 0.85,
      roughness: 0.3,
    }),
  };
  private readonly sea: THREE.Mesh;
  private readonly roadGroup = new THREE.Group();
  private readonly particleMesh: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private tweens: Tween[] = [];

  private towers = new Map<string, Tower>();
  private roads = new Set<string>();
  private items: Item[] = [];

  private tool: Tool = 'build';
  private active: Tower | null = null;
  private holdTimer = 0;
  /** 按住盖楼时盖到 101 就停，让孩子正好停在 101 */
  private stopHold = false;
  private painting = false;
  private enabled = true;

  private rot = 0;
  private az = Math.PI / 4;
  private view = { target: new THREE.Vector3(), half: 8 };
  private shake = 0;
  private extraFocus: THREE.Vector3 | null = null;

  private lanes: Lane[] = [];
  private wave: WaveMesh | null = null;
  /** 浪的宽度采样点：比岛两边各多出 2 排，两头慢慢变矮，不会看到切口 */
  private waveSamples: WaveSample[] = [];
  private time = 0;
  private waveDir: Dir = 'x+';
  private waveH = 0;
  private waveRise = 0;
  private volcanoObj: THREE.Group | null = null;

  private raf = 0;
  private last = 0;
  private readonly resizeObserver: ResizeObserver;
  private readonly tmp = {
    m: new THREE.Matrix4(),
    s: new THREE.Vector3(),
    v: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    e: new THREE.Euler(),
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cb: WorldCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    // Bastion 那种暖暖的黄昏光
    this.scene.add(new THREE.HemisphereLight('#ffe7c4', '#2f6474', 1.1));
    const sun = new THREE.DirectionalLight('#ffd09a', 2.4);
    sun.position.set(10, 18, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, far: 80 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // 海
    this.sea = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({
        color: '#3fb0c2',
        roughness: 0.25,
        transparent: true,
        opacity: 0.88,
      }),
    );
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = SEA_Y;
    this.sea.receiveShadow = true;
    this.scene.add(this.sea);

    this.newIsland();
    this.scene.add(this.roadGroup);

    // 磁力片：所有楼的每一层共用一个 InstancedMesh
    this.blockMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.86, FLOOR_H * 0.94, 0.86),
      new THREE.MeshStandardMaterial({
        map: tileTexture(),
        transparent: true,
        opacity: 0.92,
        roughness: 0.25,
      }),
      MAX_BLOCKS,
    );
    this.blockMesh.count = 0;
    this.blockMesh.castShadow = true;
    this.blockMesh.receiveShadow = true;
    this.blockMesh.frustumCulled = false;
    this.scene.add(this.blockMesh);

    this.particleMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      MAX_PARTICLES,
    );
    this.particleMesh.count = 0;
    this.particleMesh.frustumCulled = false;
    this.scene.add(this.particleMesh);

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement!);
    this.resize();
    this.fitView(true);
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.holdTimer);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    this.renderer.dispose();
  }

  setTool(tool: Tool): void {
    this.tool = tool;
  }

  rotate(step: number): void {
    this.rot += step;
  }

  /** 随机生成一座新岛：每个地块一个方块，上面草地、侧面泥土，河道低一些 */
  private newIsland(): void {
    MAP = generateIsland();
    W = MAP[0].length;
    D = MAP.length;
    if (this.islandMesh) {
      this.scene.remove(this.islandMesh);
      this.islandMesh.dispose();
    }
    this.landTiles = [];
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        if (cell(x, z) === '.') continue;
        // 从中间往外，一圈一圈落下来
        const delay = Math.hypot(x - W / 2, z - D / 2) * 0.05 + rand(0, 0.15);
        this.landTiles.push({ x, z, delay });
      }
    }
    const mesh = new THREE.InstancedMesh(this.islandGeo, this.islandMats, this.landTiles.length);
    this.landTiles.forEach(({ x, z }, i) => {
      const tint =
        cell(x, z) === 'W'
          ? new THREE.Color('#e8d4a0')
          : new THREE.Color(1, 1, 1).multiplyScalar(rand(0.92, 1.04));
      mesh.setColorAt(i, tint);
    });
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.islandMesh = mesh;
    this.islandTime = 0;
    this.islandDone = false;
    this.stepIsland(0);
    this.scene.add(mesh);
  }

  private stepIsland(dt: number): void {
    if (this.islandDone || !this.islandMesh) return;
    this.islandTime += dt;
    let done = true;
    this.landTiles.forEach(({ x, z, delay }, i) => {
      const p = THREE.MathUtils.clamp((this.islandTime - delay) / 0.45, 0, 1);
      if (p < 1) done = false;
      const fall = (1 - p) * (1 - p) * 12;
      const c = tileCenter(x, z, (cell(x, z) === 'W' ? -0.55 : 0) + fall);
      this.islandMesh!.setMatrixAt(i, this.tmp.m.makeTranslation(c.x, c.y, c.z));
    });
    this.islandMesh.instanceMatrix.needsUpdate = true;
    this.islandDone = done;
  }

  /** 清空整个岛：楼、车、路都飞上天，然后消失 */
  clear(): void {
    this.setEnabled(false);
    const bodies: Body[] = [];
    for (const t of this.towers.values()) {
      t.collapsed = true;
      bodies.push(...t.blocks);
      if (t.roof) bodies.push(t.roof.body);
    }
    for (const it of this.items) {
      it.state = 'lost';
      bodies.push(it.body);
    }
    for (const b of bodies) {
      b.mode = 'debris';
      b.vel.set(rand(-1.5, 1.5), rand(8, 14), rand(-1.5, 1.5));
      b.spin.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    }
    this.active = null;
    this.roads.clear();
    this.rebuildRoads();
    setTimeout(() => {
      for (const t of this.towers.values()) if (t.roof) this.scene.remove(t.roof.obj);
      for (const it of this.items) this.scene.remove(it.obj);
      this.towers.clear();
      this.items = [];
      this.newIsland();
      this.setEnabled(true);
    }, 1100);
  }

  // ---------------------------------------------------------------- 搭建

  private isLand(x: number, z: number): boolean {
    return cell(x, z) === 'L';
  }

  private isWater(x: number, z: number): boolean {
    if (cell(x, z) === 'W') return true;
    return (
      cell(x, z) === '.' &&
      x >= -SEA_MARGIN &&
      x < W + SEA_MARGIN &&
      z >= -SEA_MARGIN &&
      z < D + SEA_MARGIN
    );
  }

  private itemAt(x: number, z: number): Item | undefined {
    return this.items.find((it) => it.x === x && it.z === z);
  }

  private blockHome(t: Tower, floor: number): { pos: THREE.Vector3; scale: number } {
    return {
      pos: tileCenter(t.x, t.z, floor * FLOOR_H + FLOOR_H / 2),
      scale: t.is101 ? shape101(floor) : 1,
    };
  }

  private addFloor(x: number, z: number): void {
    const k = key(x, z);
    let t = this.towers.get(k);
    if (!t) {
      if (!this.isLand(x, z) || this.roads.has(k) || this.itemAt(x, z)) return;
      t = { x, z, blocks: [], roof: null, is101: false, collapsed: false };
      this.towers.set(k, t);
    }
    if (t.blocks.length >= MAX_FLOORS || t.collapsed) return;
    const home = this.blockHome(t, t.blocks.length).pos;
    const b = newBody(home.clone().add(new THREE.Vector3(0, 2.5, 0)), 'drop');
    t.blocks.push(b);
    this.active = t;
    if (t.blocks.length === TAIPEI_101 && !t.is101) {
      t.is101 = true;
      this.stopHold = true;
      this.cb.taipei();
      this.fireworks(tileCenter(x, z, TAIPEI_101 * FLOOR_H + 2));
    } else if (t.blocks.length < TAIPEI_101) {
      t.is101 = false;
    }
    if (t.blocks.length === HALFWAY) {
      this.cb.halfway();
      this.fireworks(tileCenter(x, z, HALFWAY * FLOOR_H + 1.5));
    }
    if (t.blocks.length === TAIPEI_101 || t.blocks.length === 1) this.updateRoof(t);
    this.cb.floor(t.blocks.length);
  }

  private removeFloor(t: Tower): void {
    t.blocks.pop();
    this.active = t;
    if (t.blocks.length < TAIPEI_101 && t.is101) {
      t.is101 = false;
      this.updateRoof(t);
    }
    if (t.blocks.length === 0) {
      if (t.roof) this.scene.remove(t.roof.obj);
      this.towers.delete(key(t.x, t.z));
      this.active = null;
    }
    this.cb.floor(t.blocks.length);
  }

  private updateRoof(t: Tower): void {
    if (t.roof) this.scene.remove(t.roof.obj);
    const obj = t.is101 ? spire() : roof(ROOF_COLORS[(t.x + t.z) % ROOF_COLORS.length]);
    this.scene.add(obj);
    t.roof = { obj, body: newBody(this.roofHome(t)) };
  }

  private roofHome(t: Tower): THREE.Vector3 {
    return tileCenter(t.x, t.z, t.blocks.length * FLOOR_H);
  }

  private addItem(kind: ItemKind, x: number, z: number, rot = Math.floor(Math.random() * 4)): void {
    const obj = buildItem(kind);
    const y =
      kind === 'boat' ? SEA_Y : this.roads.has(key(x, z)) && cell(x, z) === 'W' ? 0.12 : 0.02;
    const body = newBody(tileCenter(x, z, y));
    body.quat.setFromEuler(new THREE.Euler(0, (rot * Math.PI) / 2, 0));
    this.scene.add(obj);
    this.items.push({ kind, x, z, rot, obj, body, state: 'idle', lane: null, offset: 0, depth: 0 });
  }

  private canPlace(kind: ItemKind, x: number, z: number): boolean {
    const k = key(x, z);
    if (this.itemAt(x, z) || this.towers.has(k)) return false;
    if (kind === 'boat') return this.isWater(x, z) && !this.roads.has(k);
    return this.isLand(x, z) || (cell(x, z) === 'W' && this.roads.has(k));
  }

  private paintRoad(x: number, z: number): void {
    const k = key(x, z);
    if (this.roads.has(k) || this.towers.has(k) || this.itemAt(x, z)) return;
    if (!this.isLand(x, z) && cell(x, z) !== 'W') return;
    this.roads.add(k);
    this.rebuildRoads();
  }

  /**
   * 公路：灰色路面；中线从格子中心往相连的方向画，转弯、路口都能接上；
   * 不和路相连的一边画白色路边线。河上是蓝色的桥（像磁力轨道），没相连的一边是栏杆。
   * 同一种材质的方块合并成一个网格，路再多也只有三次绘制。
   */
  private rebuildRoads(): void {
    for (const m of this.roadGroup.children) (m as THREE.Mesh).geometry.dispose();
    this.roadGroup.clear();
    const parts: Record<keyof typeof this.roadMats, THREE.BufferGeometry[]> = {
      asphalt: [],
      line: [],
      bridge: [],
    };
    const box = (
      part: keyof typeof parts,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
    ): void => {
      parts[part].push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
    };
    for (const k of this.roads) {
      const [x, z] = k.split(',').map(Number);
      const river = cell(x, z) === 'W';
      const c = tileCenter(x, z);
      const top = river ? 0.12 : 0.04;
      box(river ? 'bridge' : 'asphalt', 1, top, 1, c.x, top / 2, c.z);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const linked = this.roads.has(key(x + dx, z + dz));
        if (linked && !river) {
          box(
            'line',
            dx ? 0.22 : 0.06,
            0.01,
            dz ? 0.22 : 0.06,
            c.x + dx * 0.25,
            top + 0.005,
            c.z + dz * 0.25,
          );
        } else if (!linked && river) {
          box(
            'bridge',
            dx ? 0.06 : 1,
            0.14,
            dz ? 0.06 : 1,
            c.x + dx * 0.46,
            top + 0.07,
            c.z + dz * 0.46,
          );
        } else if (!linked) {
          box(
            'line',
            dx ? 0.05 : 1,
            0.01,
            dz ? 0.05 : 1,
            c.x + dx * 0.42,
            top + 0.005,
            c.z + dz * 0.42,
          );
        }
      }
    }
    for (const [part, geos] of Object.entries(parts) as [
      keyof typeof parts,
      THREE.BufferGeometry[],
    ][]) {
      if (!geos.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(geos), this.roadMats[part]);
      mesh.receiveShadow = true;
      this.roadGroup.add(mesh);
      for (const g of geos) g.dispose();
    }
  }

  // ---------------------------------------------------------------- 触摸

  private pick(e: PointerEvent): { x: number; z: number; tower?: Tower; item?: Item } | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    // 楼一直在长，包围球要重新算，不然点不到新盖的层
    this.blockMesh.computeBoundingSphere();
    this.islandMesh?.computeBoundingSphere();
    const targets: THREE.Object3D[] = [
      this.blockMesh,
      ...this.items.map((i) => i.obj),
      ...(this.islandMesh ? [this.islandMesh] : []),
      this.sea,
    ];
    for (const t of this.towers.values()) if (t.roof) targets.push(t.roof.obj);
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return null;
    if (hit.object === this.blockMesh && hit.instanceId !== undefined) {
      const t = this.blockOwners[hit.instanceId];
      return { x: t.x, z: t.z, tower: t };
    }
    for (const t of this.towers.values()) {
      if (t.roof && (hit.object === t.roof.obj || hit.object.parent === t.roof.obj))
        return { x: t.x, z: t.z, tower: t };
    }
    const item = this.items.find((i) => i.obj === hit.object || i.obj.getObjectById(hit.object.id));
    if (item) return { x: item.x, z: item.z, item };
    if (hit.object === this.islandMesh && hit.instanceId !== undefined) {
      const { x, z } = this.landTiles[hit.instanceId];
      return { x, z, tower: this.towers.get(key(x, z)) };
    }
    const x = Math.floor(hit.point.x + W / 2);
    const z = Math.floor(hit.point.z + D / 2);
    return { x, z, tower: this.towers.get(key(x, z)) };
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.pick(e);
    if (!p) return;
    const tool = this.tool;
    if (tool === 'build') {
      this.addFloor(p.x, p.z);
      this.repeat(() => this.addFloor(p.x, p.z));
    } else if (tool === 'remove') {
      if (p.item) {
        this.scene.remove(p.item.obj);
        this.items = this.items.filter((i) => i !== p.item);
        this.cb.floor(0);
      } else if (p.tower) {
        const t = p.tower;
        this.removeFloor(t);
        this.repeat(() => t.blocks.length && this.removeFloor(t));
      } else if (this.roads.delete(key(p.x, p.z))) {
        this.rebuildRoads();
        this.cb.floor(0);
      }
    } else if (tool === 'road') {
      this.painting = true;
      this.paintRoad(p.x, p.z);
    } else {
      // 点偏了一点（比如船点到了岸边）就放到旁边最近的空位
      const spot = [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, -1],
        [1, -1],
        [-1, 1],
      ]
        .map(([dx, dz]) => ({ x: p.x + dx, z: p.z + dz }))
        .find(({ x, z }) => this.canPlace(tool, x, z));
      if (spot) {
        this.addItem(tool, spot.x, spot.z);
        this.cb.floor(0);
      }
    }
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.painting) return;
    const p = this.pick(e);
    if (p) this.paintRoad(p.x, p.z);
  };

  private readonly onUp = (): void => {
    this.painting = false;
    clearTimeout(this.holdTimer);
  };

  /** 按住不放：越来越快地重复 */
  private repeat(fn: () => void): void {
    let delay = 380;
    this.stopHold = false;
    const tick = (): void => {
      fn();
      if (this.stopHold) return;
      delay = Math.max(60, delay * 0.8);
      this.holdTimer = setTimeout(tick, delay);
    };
    this.holdTimer = setTimeout(tick, delay);
  }

  // ---------------------------------------------------------------- 海啸

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      clearTimeout(this.holdTimer);
      this.painting = false;
    }
  }

  randomDir(): Dir {
    return DIRS[Math.floor(Math.random() * DIRS.length)];
  }

  private dirVec(dir: Dir): THREE.Vector3 {
    return new THREE.Vector3(
      dir === 'x+' ? 1 : dir === 'x-' ? -1 : 0,
      0,
      dir === 'z+' ? 1 : dir === 'z-' ? -1 : 0,
    );
  }

  private alongX(dir: Dir): boolean {
    return dir[0] === 'x';
  }

  /** 事件发生的地方：海浪来的那一边的远处海面 */
  private sourcePoint(dir: Dir): THREE.Vector3 {
    const len = this.alongX(dir) ? W : D;
    return this.dirVec(dir)
      .multiplyScalar(-(len / 2 + 9))
      .setY(SEA_Y);
  }

  /** 陨石 / 地震 / 火山，演完再起浪 */
  playEvent(kind: EventKind, dir: Dir): Promise<void> {
    const src = this.sourcePoint(dir);
    this.extraFocus = src;
    return new Promise((resolve) => {
      if (kind === 'meteor') {
        const m = meteor();
        const start = src.clone().add(this.dirVec(dir).multiplyScalar(-8)).setY(26);
        this.scene.add(m);
        this.tween(
          1.5,
          (p) => {
            m.position.lerpVectors(start, src, p * p);
            m.rotation.x += 0.2;
            for (let i = 0; i < 3; i++)
              this.spawn(
                m.position,
                new THREE.Vector3(rand(-1, 1), rand(0, 1.5), rand(-1, 1)),
                0.6,
                0.35,
                '#ffb347',
                0,
              );
          },
          () => {
            this.scene.remove(m);
            this.splash(src, 140, 9);
            this.shake = 0.6;
            setTimeout(resolve, 700);
          },
        );
      } else if (kind === 'quake') {
        this.shake = 1.8;
        for (let i = 0; i < 40; i++) {
          const p = tileCenter(Math.random() * W, Math.random() * D, 0.1);
          this.spawn(
            p,
            new THREE.Vector3(rand(-1, 1), rand(1, 3), rand(-1, 1)),
            1.2,
            0.18,
            '#c9a77c',
            6,
          );
        }
        setTimeout(resolve, 1900);
      } else {
        const v = volcano();
        this.volcanoObj = v;
        v.position.copy(src).setY(-4);
        this.scene.add(v);
        this.tween(
          0.9,
          (p) => (v.position.y = -4 + ease(p) * 4 + SEA_Y),
          () => {
            this.shake = 0.8;
            this.tween(
              1.6,
              () => {
                const top = v.position.clone().setY(3.5);
                for (let i = 0; i < 4; i++) {
                  this.spawn(
                    top,
                    new THREE.Vector3(rand(-2.5, 2.5), rand(7, 12), rand(-2.5, 2.5)),
                    1.6,
                    rand(0.2, 0.4),
                    Math.random() < 0.7 ? '#ff6a1e' : '#ffd23f',
                    9,
                  );
                }
                this.spawn(
                  top,
                  new THREE.Vector3(rand(-0.5, 0.5), rand(2, 3), rand(-0.5, 0.5)),
                  2,
                  0.6,
                  '#8a8a8a',
                  -0.3,
                );
              },
              () => setTimeout(resolve, 300),
            );
          },
        );
      }
    });
  }

  /** 海浪一排一排卷过来：楼比浪高就挡住，比浪矮就冲倒 */
  runWave(height: number, dir: Dir): Promise<WaveResult> {
    this.waveDir = dir;
    this.waveH = height;
    this.waveRise = 0;
    const count = this.alongX(dir) ? D : W;
    this.lanes = Array.from({ length: count }, (_, idx) => ({
      idx,
      front: WAVE_START,
      nextK: 0,
      stopped: false,
      done: false,
      level: 1,
    }));
    const per = 3;
    const n = (count + 4) * per + 1;
    this.waveSamples = Array.from({ length: n }, (_, j) => ({
      w: -2 + j / per,
      front: WAVE_START,
      height: 0,
    }));
    this.wave = new WaveMesh(n);
    this.scene.add(this.wave.mesh);
    let blocked = false;
    return new Promise((resolve) => {
      const check = (): void => {
        if (this.lanes.some((l) => !l.stopped && !l.done)) {
          setTimeout(check, 100);
          return;
        }
        // 全部停下：海浪退去
        this.tween(
          1.6,
          (p) => (this.waveRise = 1 - p),
          () => {
            if (this.wave) this.scene.remove(this.wave.mesh);
            this.wave = null;
            this.lanes = [];
            this.extraFocus = null;
            let saved = 0;
            let lost = 0;
            for (const it of this.items) {
              if (it.state === 'carried') {
                // 船浮在水上没事，就停在被冲到的地方；车和人算被冲走
                it.state = it.kind === 'boat' ? 'idle' : 'lost';
                it.body.mode = 'debris';
                it.body.vel.set(0, 0, 0);
                if (it.kind === 'boat') it.body.spin.set(0, 0, 0);
              }
              if (it.state === 'lost') lost++;
              else saved++;
            }
            resolve({ saved, lost, blocked });
          },
        );
      };
      this.onLaneBlocked = () => {
        if (!blocked) this.cb.blocked();
        blocked = true;
      };
      this.tween(0.8, (p) => (this.waveRise = ease(p)), check);
    });
  }

  private onLaneBlocked = (): void => {};

  /** 海浪里的位置 s（0 = 刚到岛边）→ 世界坐标 */
  private laneWorld(lane: number, s: number, y = 0): THREE.Vector3 {
    const d = this.waveDir;
    if (d === 'x+') return new THREE.Vector3(s - W / 2, y, lane - D / 2 + 0.5);
    if (d === 'x-') return new THREE.Vector3(W / 2 - s, y, lane - D / 2 + 0.5);
    if (d === 'z+') return new THREE.Vector3(lane - W / 2 + 0.5, y, s - D / 2);
    return new THREE.Vector3(lane - W / 2 + 0.5, y, D / 2 - s);
  }

  /** 第 k 个地块（按海浪前进的顺序） */
  private laneTile(lane: number, k: number): { x: number; z: number } {
    const d = this.waveDir;
    if (d === 'x+') return { x: k, z: lane };
    if (d === 'x-') return { x: W - 1 - k, z: lane };
    if (d === 'z+') return { x: lane, z: k };
    return { x: lane, z: D - 1 - k };
  }

  /** 地块在海浪坐标里是第几排、第几格（中心） */
  private tileLane(x: number, z: number): { lane: number; s: number } {
    const d = this.waveDir;
    if (d === 'x+') return { lane: z, s: x + 0.5 };
    if (d === 'x-') return { lane: z, s: W - x - 0.5 };
    if (d === 'z+') return { lane: x, s: z + 0.5 };
    return { lane: x, s: D - z - 0.5 };
  }

  private stepWave(dt: number): void {
    if (!this.lanes.length) return;
    const len = this.alongX(this.waveDir) ? W : D;
    const top = this.waveH * FLOOR_H * this.waveRise;
    const along = this.alongX(this.waveDir);
    const dv = this.dirVec(this.waveDir);
    for (const l of this.lanes) {
      if (!l.stopped && !l.done && this.waveRise >= 1) {
        l.front += WAVE_SPEED * dt;
        while (l.nextK < len && l.front >= l.nextK) {
          const { x, z } = this.laneTile(l.idx, l.nextK);
          const t = this.towers.get(key(x, z));
          if (t && !t.collapsed && t.blocks.length >= this.waveH) {
            l.stopped = true;
            l.front = l.nextK;
            this.splash(this.laneWorld(l.idx, l.front, this.waveH * FLOOR_H), 30, 5);
            this.onLaneBlocked();
            break;
          }
          if (t && !t.collapsed) this.collapse(t, dv);
          l.nextK++;
        }
        if (l.front > len - WAVE_START) l.done = true;
        // 卷走这一排里被浪碰到的东西
        for (const it of this.items) {
          if (it.state !== 'idle') continue;
          const { lane, s } = this.tileLane(it.x, it.z);
          if (lane === l.idx && s >= WAVE_START && s <= l.front + 0.2) {
            it.state = 'carried';
            it.lane = l;
            it.offset = rand(0.2, 0.7);
            it.depth = it.kind === 'boat' ? 1 : rand(0.25, 0.75);
            it.body.spin.set(rand(-4, 4), rand(-4, 4), rand(-4, 4));
          }
        }
      }
      // 被挡住的那一排，浪拍在楼上慢慢塌下来
      if (l.stopped) l.level = Math.max(0.45, l.level - dt * 0.6);
    }
    this.drawWave(dt);
    for (const it of this.items) {
      if (it.state !== 'carried' || !it.lane) continue;
      const p = this.laneWorld(
        it.lane.idx,
        it.lane.front - it.offset,
        SEA_Y + Math.max(0, top - SEA_Y) * it.depth,
      );
      it.body.pos.lerp(p, Math.min(1, dt * 8));
      if (it.kind !== 'boat') this.integrateSpin(it.body, dt);
    }
  }

  /** 按每一排的位置算出整道浪的形状，排和排之间平滑过渡 */
  private drawWave(dt: number): void {
    if (!this.wave) return;
    const lanes = this.lanes;
    const count = lanes.length;
    const height = this.waveH * FLOOR_H * this.waveRise;
    const base = SEA_Y + 0.3 * this.waveRise;
    const len = THREE.MathUtils.clamp(height * 0.5, 1, 6);
    const at = (w: number, f: (l: Lane) => number): number => {
      const x = THREE.MathUtils.clamp(w - 0.5, 0, count - 1);
      const i = Math.min(count - 2, Math.floor(x));
      if (count < 2) return f(lanes[0]);
      const k = x - i;
      return f(lanes[i]) * (1 - k) + f(lanes[i + 1]) * k;
    };
    for (const smp of this.waveSamples) {
      smp.front = at(smp.w, (l) => l.front);
      // 两头 2 排慢慢变矮
      const edge = Math.min(1, (smp.w + 2) / 2, (count + 2 - smp.w) / 2);
      smp.height = Math.max(0.01, height * at(smp.w, (l) => l.level) * edge);
    }
    const toWorld = (w: number, s: number, y: number): THREE.Vector3 =>
      this.laneWorld(w - 0.5, s, y);
    this.wave.update(this.waveSamples, toWorld, WAVE_START, base, len, this.time);
    this.wave.mesh.visible = this.waveRise > 0.01;

    // 浪头一路喷水花
    if (this.waveRise > 0.5) {
      const dv = this.dirVec(this.waveDir);
      for (let i = 0; i < 40 * dt * count; i++) {
        const smp = this.waveSamples[Math.floor(Math.random() * this.waveSamples.length)];
        const lane = lanes[THREE.MathUtils.clamp(Math.floor(smp.w), 0, count - 1)];
        if (lane.done) continue;
        const p = toWorld(smp.w, smp.front + LIP.u * len, base + LIP.v * smp.height);
        const v = dv.clone().multiplyScalar(rand(0.5, 2.5)).setY(rand(1, 3));
        this.spawn(p, v, rand(0.4, 0.8), rand(0.08, 0.18), '#ffffff', 9);
      }
    }
  }

  private collapse(t: Tower, dir: THREE.Vector3): void {
    t.collapsed = true;
    this.cb.collapse();
    const side = new THREE.Vector3(dir.z, 0, dir.x);
    const all = t.roof ? [...t.blocks, t.roof.body] : t.blocks;
    all.forEach((b, i) => {
      b.mode = 'debris';
      const up = rand(1, 3) + i * 0.02;
      b.vel
        .copy(dir)
        .multiplyScalar(rand(2.5, 5.5))
        .addScaledVector(side, rand(-1.5, 1.5))
        .setY(up);
      b.spin.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    });
    this.active = null;
  }

  /** 重建：被冲倒的磁力片飞回原位，被冲走的车开回来 */
  rebuild(): void {
    let i = 0;
    for (const t of this.towers.values()) {
      t.collapsed = false;
      const all = t.roof ? [...t.blocks, t.roof.body] : t.blocks;
      for (const b of all) this.sendBack(b, (i++ % 60) * 0.02);
    }
    for (const it of this.items) {
      it.state = 'idle';
      it.lane = null;
      this.sendBack(it.body, rand(0, 0.5));
    }
    if (this.volcanoObj) {
      const v = this.volcanoObj;
      this.volcanoObj = null;
      this.tween(
        1,
        (p) => (v.position.y = SEA_Y - ease(p) * 5),
        () => this.scene.remove(v),
      );
    }
  }

  private sendBack(b: Body, delay: number): void {
    b.mode = 'back';
    b.t = 0;
    b.delay = delay;
    b.from.copy(b.pos);
    b.fromQuat.copy(b.quat);
  }

  // ---------------------------------------------------------------- 粒子 / 动画

  private tween(dur: number, update: (p: number, dt: number) => void, done?: () => void): void {
    this.tweens.push({ t: 0, dur, update, done });
  }

  private spawn(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    life: number,
    size: number,
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
        .multiplyScalar(rand(0.5, power * 0.5));
      v.y = rand(power * 0.5, power * 1.3);
      this.spawn(
        at,
        v,
        rand(0.8, 1.5),
        rand(0.12, 0.3),
        Math.random() < 0.6 ? '#ffffff' : '#8fdcf0',
        12,
      );
    }
  }

  private fireworks(at: THREE.Vector3): void {
    const colors = ['#ff5a5f', '#ffd23f', '#3a86ff', '#3bceac', '#f15bb5'];
    for (let burst = 0; burst < 4; burst++) {
      setTimeout(() => {
        const c = at.clone().add(new THREE.Vector3(rand(-2, 2), rand(0, 3), rand(-2, 2)));
        const color = colors[burst % colors.length];
        for (let i = 0; i < 50; i++) {
          const v = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1))
            .normalize()
            .multiplyScalar(rand(3, 5));
          this.spawn(c, v, rand(0.8, 1.3), 0.16, color, 2);
        }
      }, burst * 350);
    }
  }

  private integrateSpin(b: Body, dt: number): void {
    const { e, q } = this.tmp;
    e.set(b.spin.x * dt, b.spin.y * dt, b.spin.z * dt);
    b.quat.multiply(q.setFromEuler(e));
  }

  /** 被冲走的东西：抛物线落地，掉进水里就漂着 */
  private stepDebris(b: Body, dt: number, half: number): void {
    const x = Math.floor(b.pos.x + W / 2);
    const z = Math.floor(b.pos.z + D / 2);
    const ground = this.isLand(x, z) ? half : null;
    b.vel.y -= 12 * dt;
    if (ground === null && b.pos.y < SEA_Y + 0.05) {
      // 浮力 + 水的阻力
      b.vel.y += (SEA_Y + 0.05 - b.pos.y) * 30 * dt;
      b.vel.multiplyScalar(1 - 2.5 * dt);
      b.spin.multiplyScalar(1 - 2 * dt);
    }
    b.pos.addScaledVector(b.vel, dt);
    if (ground !== null && b.pos.y < ground) {
      b.pos.y = ground;
      b.vel.y *= -0.25;
      b.vel.x *= 0.7;
      b.vel.z *= 0.7;
      b.spin.multiplyScalar(0.6);
    }
    this.integrateSpin(b, dt);
  }

  private stepBody(
    b: Body,
    home: THREE.Vector3,
    homeQuat: THREE.Quaternion,
    dt: number,
    half: number,
  ): void {
    if (b.mode === 'drop') {
      b.t += dt / 0.3;
      b.pos.lerp(home, Math.min(1, b.t * b.t));
      if (b.t >= 1) {
        b.mode = 'home';
        b.pos.copy(home);
      }
    } else if (b.mode === 'home') {
      b.pos.copy(home);
      b.quat.copy(homeQuat);
    } else if (b.mode === 'debris') {
      this.stepDebris(b, dt, half);
    } else if (b.mode === 'back') {
      if (b.delay > 0) {
        b.delay -= dt;
        return;
      }
      b.t += dt / 0.9;
      const p = ease(Math.min(1, b.t));
      b.pos.lerpVectors(b.from, home, p);
      b.pos.y += Math.sin(p * Math.PI) * 2;
      b.quat.slerpQuaternions(b.fromQuat, homeQuat, p);
      if (b.t >= 1) b.mode = 'home';
    }
  }

  // ---------------------------------------------------------------- 每帧

  private resize(): void {
    const el = this.canvas.parentElement!;
    this.renderer.setSize(el.clientWidth, el.clientHeight, false);
  }

  /** 镜头自动缩放，让整个岛和最高的楼都在画面里 */
  private fitView(instant = false): void {
    const el = this.canvas;
    const aspect = el.clientWidth / Math.max(1, el.clientHeight);
    const pts: THREE.Vector3[] = [];
    for (const x of [-W / 2, W / 2])
      for (const z of [-D / 2, D / 2])
        pts.push(new THREE.Vector3(x, -0.4, z), new THREE.Vector3(x, 1, z));
    for (const t of this.towers.values())
      pts.push(tileCenter(t.x, t.z, t.blocks.length * FLOOR_H + (t.is101 ? 3.2 : 0.9)));
    if (this.lanes.length) pts.push(new THREE.Vector3(0, this.waveH * FLOOR_H, 0));
    if (this.extraFocus) pts.push(this.extraFocus, this.extraFocus.clone().setY(6));
    this.az += (Math.PI / 4 + (this.rot * Math.PI) / 2 - this.az) * (instant ? 1 : 0.12);
    const el2 = 0.6;
    const v = new THREE.Vector3(
      Math.cos(el2) * Math.sin(this.az),
      Math.sin(el2),
      Math.cos(el2) * Math.cos(this.az),
    );
    const xAxis = new THREE.Vector3(0, 1, 0).cross(v).normalize();
    const yAxis = v.clone().cross(xAxis);
    let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const p of pts) {
      const cx = p.dot(xAxis);
      const cy = p.dot(yAxis);
      minX = Math.min(minX, cx);
      maxX = Math.max(maxX, cx);
      minY = Math.min(minY, cy);
      maxY = Math.max(maxY, cy);
    }
    const target = xAxis
      .clone()
      .multiplyScalar((minX + maxX) / 2)
      .addScaledVector(yAxis, (minY + maxY) / 2);
    const half = Math.max((maxY - minY) / 2, (maxX - minX) / 2 / aspect) * 1.12 + 0.3;
    const k = instant ? 1 : 0.16;
    this.view.target.lerp(target, k);
    this.view.half += (half - this.view.half) * k;
    // 下面留出工具栏的位置
    const h = this.view.half;
    Object.assign(this.camera, {
      left: -h * aspect,
      right: h * aspect,
      top: h * 1.02,
      bottom: -h * 1.3,
    });
    this.camera.updateProjectionMatrix();
    const shake =
      this.shake > 0
        ? new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(
            0.12 * Math.min(1, this.shake),
          )
        : new THREE.Vector3();
    this.camera.position.copy(this.view.target).addScaledVector(v, 60).add(shake);
    this.camera.lookAt(this.view.target.clone().add(shake));
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.visibilityState !== 'visible') return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    this.shake = Math.max(0, this.shake - dt);
    this.time += dt;

    for (const tw of [...this.tweens]) {
      tw.t += dt;
      tw.update(Math.min(1, tw.t / tw.dur), dt);
      if (tw.t >= tw.dur) {
        this.tweens.splice(this.tweens.indexOf(tw), 1);
        tw.done?.();
      }
    }
    this.stepIsland(dt);
    this.stepWave(dt);

    // 磁力片
    const { m, s, q } = this.tmp;
    let n = 0;
    this.blockOwners.length = 0;
    const wobble = this.shake > 0 ? 0.03 * Math.min(1, this.shake) : 0;
    for (const t of this.towers.values()) {
      t.blocks.forEach((b, floor) => {
        const home = this.blockHome(t, floor);
        const homePos = wobble
          ? home.pos.clone().add(new THREE.Vector3(rand(-wobble, wobble), 0, rand(-wobble, wobble)))
          : home.pos;
        this.stepBody(b, homePos, IDENTITY, dt, FLOOR_H / 2);
        s.set(home.scale, 1, home.scale);
        m.compose(b.pos, b.quat, s);
        this.blockMesh.setMatrixAt(n, m);
        this.blockMesh.setColorAt(n, TILE_COLORS[floor % TILE_COLORS.length]);
        this.blockOwners[n++] = t;
      });
      if (t.roof) {
        this.stepBody(t.roof.body, this.roofHome(t), IDENTITY, dt, 0.1);
        t.roof.obj.position.copy(t.roof.body.pos);
        t.roof.obj.quaternion.copy(t.roof.body.quat);
      }
    }
    this.blockMesh.count = n;
    this.blockMesh.instanceMatrix.needsUpdate = true;
    if (this.blockMesh.instanceColor) this.blockMesh.instanceColor.needsUpdate = true;

    // 车、人、船
    for (const it of this.items) {
      const homeY =
        it.kind === 'boat'
          ? SEA_Y
          : this.roads.has(key(it.x, it.z)) && cell(it.x, it.z) === 'W'
            ? 0.12
            : 0.02;
      const home = tileCenter(it.x, it.z, homeY);
      const homeQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, (it.rot * Math.PI) / 2, 0),
      );
      if (it.state === 'idle' || it.body.mode === 'back')
        this.stepBody(it.body, home, homeQuat, dt, 0.02);
      else if (it.state === 'lost' && it.body.mode === 'debris') this.stepDebris(it.body, dt, 0.02);
      it.obj.position.copy(it.body.pos);
      if (it.kind === 'boat' && it.state !== 'carried')
        it.obj.position.y += Math.sin(now / 500 + it.x) * 0.03;
      it.obj.quaternion.copy(it.body.quat);
    }

    // 粒子
    let pn = 0;
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const size = p.size * Math.min(1, (p.life / p.maxLife) * 2);
      m.compose(p.pos, q.identity(), s.set(size, size, size));
      this.particleMesh.setMatrixAt(pn, m);
      this.particleMesh.setColorAt(pn++, p.color);
    }
    this.particleMesh.count = pn;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    this.fitView();
    this.renderer.render(this.scene, this.camera);

    // 当前这栋楼头顶的层数
    const a = this.active;
    if (a && !a.collapsed && a.blocks.length) {
      const top = tileCenter(a.x, a.z, a.blocks.length * FLOOR_H + (a.is101 ? 3.2 : 0.9)).project(
        this.camera,
      );
      const r = this.canvas.getBoundingClientRect();
      this.cb.label(
        { x: ((top.x + 1) / 2) * r.width + r.left, y: ((1 - top.y) / 2) * r.height + r.top },
        a.blocks.length,
      );
    } else {
      this.cb.label(null, 0);
    }
  };
}
