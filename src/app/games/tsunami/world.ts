import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CameraRig } from './camera-rig';
import { generateIsland } from './island';
import {
  bridgeDeck,
  bridgePillar,
  buildItem,
  damperBall,
  ItemKind,
  meteor,
  roof,
  spire,
  volcano,
} from './models';
import {
  EventKind,
  FLOOR_H,
  HALFWAY,
  MAX_FLOORS,
  randomQuakeLimit,
  TAIPEI_101,
} from './tsunami-data';
import { LIP, WaveMesh, WaveSample } from './wave-mesh';

export type Tool = 'build' | 'wall' | 'road' | 'bridge' | 'damper' | 'remove' | ItemKind;

/**
 * 当前的小岛地图：L 陆地，W 小河，. 海。第一次进游戏时随机生成，之后跟着存档走。
 * 一个页面同时只有一个 World，所以放在模块里，tileCenter / cell 这些小函数可以直接用。
 */
let MAP: string[] = [];
let W = 0;
let D = 0;
const SEA_Y = -0.15;
/** 船能放在离岛多远的海里 */
const SEA_MARGIN = 6;
/** 海浪从岛外多远开始 */
const WAVE_START = -3;
const WAVE_SPEED = 3.2;
const MAX_BLOCKS = 6000;
const MAX_PARTICLES = 900;
/** 地面到地面的高架桥有多高 */
const VIADUCT_H = 1.2;
const MAX_BRIDGE = 14;
/** 手指移动超过这么多像素算拖动，不算点 */
const DRAG_PX = 12;
/** 按住多久开始连续盖 */
const HOLD_MS = 220;

/** 磁力片的颜色，一层一层轮换，像彩虹 */
const TILE_COLORS = [
  '#ff5a5f',
  '#ff9f1c',
  '#ffd23f',
  '#a3e048',
  '#3bceac',
  '#4cc9f0',
  '#3a86ff',
  '#9b5de5',
  '#f15bb5',
].map((c) => new THREE.Color(c));
const ROOF_COLORS = ['#ffd23f', '#9b5de5', '#3bceac', '#ff5a5f', '#f15bb5'];

type Dir = 'x+' | 'x-' | 'z+' | 'z-';
const DIRS: Dir[] = ['x+', 'x-', 'z+', 'z-'];
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

type StackKind = 'tower' | 'wall';

/** 存档：岛的形状 + 孩子搭的所有东西 */
export interface SaveData {
  v: 2;
  map: string[];
  stacks: { kind: StackKind; x: number; z: number; h: number; damper?: boolean }[];
  roads: string[];
  bridges: { path: [number, number][]; heights: number[] }[];
  items: { kind: ItemKind; x: number; z: number; rot: number }[];
}

export interface WaveResult {
  saved: number;
  lost: number;
  blocked: boolean;
}

export interface QuakeResult {
  /** 倒了几栋楼 */
  fallen: number;
  /** 有几栋高楼靠阻尼球没倒 */
  damped: number;
}

export interface WorldCallbacks {
  /** 楼或墙的高度变了（0 表示放了或拆了别的东西） */
  floor(height: number): void;
  /** 这样建不了（比如桥画到海里去了） */
  invalid(): void;
  /** 盖到 101 */
  taipei(): void;
  /** 盖到 50 层 */
  halfway(): void;
  /** 装上了阻尼球 */
  damper(): void;
  /** 每帧：当前这栋楼的层数标签在屏幕上的位置；clipped 表示楼顶在画面外，标签贴在顶上 */
  label(pos: { x: number; y: number } | null, height: number, clipped: boolean): void;
  /** 有楼被冲倒 */
  collapse(): void;
  /** 有一排海浪被楼挡住 */
  blocked(): void;
  /** 搭的东西变了，需要保存 */
  changed(data: SaveData): void;
}

/** 一个会动的东西：楼的一层、楼顶、车、船、一段桥 */
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

interface Piece {
  obj: THREE.Object3D;
  body: Body;
}

/** 楼和墙都是一层一层的磁力片，只是画法不同 */
interface Stack {
  kind: StackKind;
  x: number;
  z: number;
  blocks: Body[];
  roof: Piece | null;
  damper: Piece | null;
  is101: boolean;
  collapsed: boolean;
}

interface BridgePiece extends Piece {
  home: THREE.Vector3;
  homeQuat: THREE.Quaternion;
  /** 这段桥在哪些地块上（海浪到了这些地块就可能被冲垮） */
  tiles: string[];
  /** 这段桥最低的地方有多高：浪比它高才会被冲垮 */
  low: number;
}

interface Bridge {
  path: { x: number; z: number }[];
  heights: number[];
  pieces: BridgePiece[];
  broken: boolean;
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

/** 一根手指的状态 */
interface Finger {
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** pending 刚按下还不知道要干嘛；pan 拖地图；paint 画路/画墙；hold 按住连续盖；bridge 画桥 */
  mode: 'pending' | 'pan' | 'paint' | 'hold' | 'bridge';
  tile: { x: number; z: number } | null;
  stack: Stack | null;
  item: Item | null;
  bridge: Bridge | null;
  stroke: Set<string>;
  /** 画路/画墙时上一次经过的地块：手指划得快会跳格，中间的要补上 */
  lastTile: { x: number; z: number } | null;
}

const key = (x: number, z: number): string => `${x},${z}`;
const IDENTITY = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);
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
  private readonly rig = new CameraRig();
  private readonly raycaster = new THREE.Raycaster();

  private readonly blockMesh: THREE.InstancedMesh;
  /** 第 i 个磁力片实例属于哪栋楼/哪面墙 */
  private blockOwners: Stack[] = [];
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

  private stacks = new Map<string, Stack>();
  private roads = new Set<string>();
  private bridges: Bridge[] = [];
  private items: Item[] = [];

  private tool: Tool = 'build';
  private active: Stack | null = null;
  private holdTimer = 0;
  /** 按住盖楼时盖到 101 就停，让孩子正好停在 101 */
  private stopHold = false;
  private enabled = true;
  private fingers = new Map<number, Finger>();
  /** 两根手指：拖动 + 捏合 */
  private pinch: { mid: { x: number; y: number }; dist: number } | null = null;
  private ghost: THREE.Object3D[] = [];

  private shake = 0;
  private time = 0;

  private lanes: Lane[] = [];
  private wave: WaveMesh | null = null;
  /** 浪的宽度采样点：比岛两边各多出 2 排，两头慢慢变矮，不会看到切口 */
  private waveSamples: WaveSample[] = [];
  private waveDir: Dir = 'x+';
  private waveH = 0;
  private waveRise = 0;
  private volcanoObj: THREE.Group | null = null;

  private raf = 0;
  private last = 0;
  private readonly resizeObserver: ResizeObserver;
  private readonly tmp = {
    m: new THREE.Matrix4(),
    m2: new THREE.Matrix4(),
    s: new THREE.Vector3(),
    v: new THREE.Vector3(),
    q: new THREE.Quaternion(),
    e: new THREE.Euler(),
  };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cb: WorldCallbacks,
    saved: SaveData | null,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    // Bastion 那种暖暖的黄昏光
    this.scene.add(new THREE.HemisphereLight('#ffe7c4', '#2f6474', 1.1));
    const sun = new THREE.DirectionalLight('#ffd09a', 2.4);
    sun.position.set(14, 24, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, far: 120 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // 海
    this.sea = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
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
    this.scene.add(this.roadGroup);

    // 磁力片：所有楼和墙的每一层共用一个 InstancedMesh
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

    if (saved?.v === 2 && saved.map?.length) {
      this.setIsland(saved.map, false);
      this.load(saved);
    } else {
      this.setIsland(generateIsland(), true);
      this.changed();
    }

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement!);
    this.resize();
    this.rig.fitUser(this.scenePoints());
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
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.renderer.dispose();
  }

  /** 地块（某个高度）在屏幕上的位置，测试脚本用 */
  tileToScreen(x: number, z: number, y = 0): { x: number; y: number } {
    const p = tileCenter(x, z, y).project(this.rig.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: ((p.x + 1) / 2) * r.width + r.left, y: ((1 - p.y) / 2) * r.height + r.top };
  }

  setTool(tool: Tool): void {
    this.tool = tool;
  }

  rotate(step: number): void {
    this.rig.rotate(step);
  }

  /** 清空：楼、墙、桥、车都飞上天消失，然后换一座随机的新岛 */
  clear(): void {
    this.setEnabled(false);
    const bodies: Body[] = [...this.items.map((it) => it.body)];
    for (const t of this.stacks.values()) {
      t.collapsed = true;
      bodies.push(...t.blocks);
      if (t.roof) bodies.push(t.roof.body);
      if (t.damper) bodies.push(t.damper.body);
    }
    for (const b of this.bridges) bodies.push(...b.pieces.map((p) => p.body));
    for (const it of this.items) it.state = 'lost';
    for (const b of bodies) {
      b.mode = 'debris';
      b.vel.set(rand(-1.5, 1.5), rand(8, 14), rand(-1.5, 1.5));
      b.spin.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
    }
    this.active = null;
    this.roads.clear();
    this.rebuildRoads();
    setTimeout(() => {
      for (const t of this.stacks.values()) {
        if (t.roof) this.scene.remove(t.roof.obj);
        if (t.damper) this.scene.remove(t.damper.obj);
      }
      for (const it of this.items) this.scene.remove(it.obj);
      for (const b of this.bridges) for (const p of b.pieces) this.scene.remove(p.obj);
      this.stacks.clear();
      this.items = [];
      this.bridges = [];
      this.setIsland(generateIsland(), true);
      this.rig.fitUser(this.scenePoints());
      this.changed();
      this.setEnabled(true);
    }, 1100);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.cancelFingers();
  }

  // ---------------------------------------------------------------- 小岛 / 存档

  /** 换一座岛：每个地块一个方块，上面草地、侧面泥土，河道低一些 */
  private setIsland(map: string[], animate: boolean): void {
    MAP = map;
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
        const delay = animate ? Math.hypot(x - W / 2, z - D / 2) * 0.04 + rand(0, 0.15) : -1;
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
    this.rig.setBounds(
      new THREE.Box3(
        new THREE.Vector3(-W / 2 - 6, -4, -D / 2 - 6),
        new THREE.Vector3(W / 2 + 6, 40, D / 2 + 6),
      ),
    );
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

  private load(saved: SaveData): void {
    for (const r of saved.roads ?? []) this.roads.add(r);
    this.rebuildRoads();
    for (const s of saved.stacks ?? []) {
      for (let i = 0; i < Math.min(s.h, MAX_FLOORS); i++) this.addLayer(s.kind, s.x, s.z, true);
      const t = this.stacks.get(key(s.x, s.z));
      if (t && s.damper) this.setDamper(t, true);
    }
    for (const b of saved.bridges ?? []) {
      this.addBridge(
        b.path.map(([x, z]) => ({ x, z })),
        b.heights,
      );
    }
    for (const it of saved.items ?? []) this.addItem(it.kind, it.x, it.z, it.rot);
    this.active = null;
  }

  private changed(): void {
    this.cb.changed({
      v: 2,
      map: MAP,
      stacks: [...this.stacks.values()].map((t) => ({
        kind: t.kind,
        x: t.x,
        z: t.z,
        h: t.blocks.length,
        ...(t.damper ? { damper: true } : {}),
      })),
      roads: [...this.roads],
      bridges: this.bridges.map((b) => ({
        path: b.path.map(({ x, z }) => [x, z] as [number, number]),
        heights: b.heights,
      })),
      items: this.items.map(({ kind, x, z, rot }) => ({ kind, x, z, rot })),
    });
  }

  /** 镜头要框住的东西：整座岛 + 每栋楼的楼顶 + 桥 */
  private scenePoints(): THREE.Vector3[] {
    const pts: THREE.Vector3[] = [];
    for (const x of [-W / 2, W / 2])
      for (const z of [-D / 2, D / 2])
        pts.push(new THREE.Vector3(x, -0.4, z), new THREE.Vector3(x, 1, z));
    for (const t of this.stacks.values()) pts.push(this.stackTop(t));
    for (const b of this.bridges)
      b.path.forEach(({ x, z }, i) => pts.push(tileCenter(x, z, b.heights[i] + 0.5)));
    return pts;
  }

  // ---------------------------------------------------------------- 楼和墙

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

  private bridgeOver(x: number, z: number): boolean {
    return this.bridges.some((b) => b.path.some((p) => p.x === x && p.z === z));
  }

  private stackHome(t: Stack, floor: number): { pos: THREE.Vector3; scale: number } {
    return {
      pos: tileCenter(t.x, t.z, floor * FLOOR_H + FLOOR_H / 2),
      scale: t.is101 ? shape101(floor) : 1,
    };
  }

  private stackTop(t: Stack): THREE.Vector3 {
    return tileCenter(t.x, t.z, t.blocks.length * FLOOR_H + (t.is101 ? 3.2 : 0.9));
  }

  /** 加一层。quiet：读存档时用，不放动画、不庆祝 */
  private addLayer(kind: StackKind, x: number, z: number, quiet = false): void {
    const k = key(x, z);
    let t = this.stacks.get(k);
    if (!t) {
      if (!this.isLand(x, z) || this.roads.has(k) || this.itemAt(x, z) || this.bridgeOver(x, z))
        return;
      t = { kind, x, z, blocks: [], roof: null, damper: null, is101: false, collapsed: false };
      this.stacks.set(k, t);
    }
    if (t.kind !== kind || t.blocks.length >= MAX_FLOORS || t.collapsed) return;
    const home = this.stackHome(t, t.blocks.length).pos;
    t.blocks.push(
      quiet ? newBody(home) : newBody(home.clone().add(new THREE.Vector3(0, 2.5, 0)), 'drop'),
    );
    this.active = t;
    const h = t.blocks.length;
    if (kind === 'tower') {
      if (h === TAIPEI_101) {
        t.is101 = true;
        if (!quiet) {
          this.stopHold = true;
          this.cb.taipei();
          this.fireworks(tileCenter(x, z, TAIPEI_101 * FLOOR_H + 2));
        }
      } else if (h < TAIPEI_101) {
        t.is101 = false;
      }
      if (h === HALFWAY && !quiet) {
        this.cb.halfway();
        this.fireworks(tileCenter(x, z, HALFWAY * FLOOR_H + 1.5));
      }
      if (h === TAIPEI_101 || h === 1) this.updateRoof(t);
    }
    if (!quiet) this.cb.floor(h);
  }

  private removeLayer(t: Stack): void {
    t.blocks.pop();
    this.active = t;
    if (t.blocks.length < TAIPEI_101 && t.is101) {
      t.is101 = false;
      this.updateRoof(t);
    }
    if (t.blocks.length === 0) {
      if (t.roof) this.scene.remove(t.roof.obj);
      if (t.damper) this.scene.remove(t.damper.obj);
      this.stacks.delete(key(t.x, t.z));
      this.active = null;
    }
    this.cb.floor(t.blocks.length);
  }

  private updateRoof(t: Stack): void {
    if (t.roof) this.scene.remove(t.roof.obj);
    const obj = t.is101 ? spire() : roof(ROOF_COLORS[(t.x * 3 + t.z) % ROOF_COLORS.length]);
    this.scene.add(obj);
    t.roof = { obj, body: newBody(this.roofHome(t)) };
  }

  private roofHome(t: Stack): THREE.Vector3 {
    return tileCenter(t.x, t.z, t.blocks.length * FLOOR_H);
  }

  private setDamper(t: Stack, on: boolean): void {
    if (t.damper) this.scene.remove(t.damper.obj);
    t.damper = null;
    if (!on) return;
    const obj = damperBall();
    this.scene.add(obj);
    t.damper = { obj, body: newBody(this.damperHome(t)) };
  }

  private damperHome(t: Stack): THREE.Vector3 {
    return tileCenter(t.x, t.z, Math.max(FLOOR_H, (t.blocks.length - 3) * FLOOR_H));
  }

  /** 墙和旁边的哪些墙/楼连着 */
  private wallLinks(t: Stack): (readonly [number, number])[] {
    return NEIGHBORS.filter(([dx, dz]) => this.stacks.has(key(t.x + dx, t.z + dz)));
  }

  // ---------------------------------------------------------------- 车、路、桥

  /** 这个地块上有没有桥面（不算接在楼里的桥头）；有的话返回桥面高度 */
  private deckAt(x: number, z: number): number | null {
    if (this.stacks.has(key(x, z))) return null;
    let y: number | null = null;
    for (const b of this.bridges) {
      if (b.broken) continue;
      b.path.forEach((p, i) => {
        if (p.x === x && p.z === z) y = Math.max(y ?? -Infinity, b.heights[i]);
      });
    }
    return y;
  }

  private groundY(x: number, z: number): number {
    if (cell(x, z) === 'W') return this.roads.has(key(x, z)) ? 0.12 : SEA_Y;
    return 0.02;
  }

  private itemHome(it: Item): THREE.Vector3 {
    if (it.kind === 'boat') return tileCenter(it.x, it.z, SEA_Y);
    return tileCenter(it.x, it.z, this.deckAt(it.x, it.z) ?? this.groundY(it.x, it.z));
  }

  private addItem(kind: ItemKind, x: number, z: number, rot = Math.floor(Math.random() * 4)): void {
    const obj = buildItem(kind);
    const it: Item = {
      kind,
      x,
      z,
      rot,
      obj,
      body: newBody(new THREE.Vector3()),
      state: 'idle',
      lane: null,
      offset: 0,
      depth: 0,
    };
    it.body.pos.copy(this.itemHome(it));
    it.body.quat.setFromEuler(new THREE.Euler(0, (rot * Math.PI) / 2, 0));
    this.scene.add(obj);
    this.items.push(it);
  }

  private canPlace(kind: ItemKind, x: number, z: number): boolean {
    const k = key(x, z);
    if (this.itemAt(x, z) || this.stacks.has(k)) return false;
    if (kind === 'boat') return this.isWater(x, z) && !this.roads.has(k) && !this.bridgeOver(x, z);
    return (
      this.deckAt(x, z) !== null || this.isLand(x, z) || (cell(x, z) === 'W' && this.roads.has(k))
    );
  }

  private paintRoad(x: number, z: number): void {
    const k = key(x, z);
    if (this.roads.has(k) || this.stacks.has(k) || this.itemAt(x, z)) return;
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
      for (const [dx, dz] of NEIGHBORS) {
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

  /** 从 a 到 b 的 L 形路线（先走长的那个方向） */
  private bridgePath(
    a: { x: number; z: number },
    b: { x: number; z: number },
  ): { x: number; z: number }[] {
    const path = [{ ...a }];
    const p = { ...a };
    const xFirst = Math.abs(b.x - a.x) >= Math.abs(b.z - a.z);
    const stepX = (): void => {
      while (p.x !== b.x) {
        p.x += Math.sign(b.x - p.x);
        path.push({ ...p });
      }
    };
    const stepZ = (): void => {
      while (p.z !== b.z) {
        p.z += Math.sign(b.z - p.z);
        path.push({ ...p });
      }
    };
    if (xFirst) {
      stepX();
      stepZ();
    } else {
      stepZ();
      stepX();
    }
    return path.slice(0, MAX_BRIDGE);
  }

  /**
   * 桥面高度：两头都是楼 → 空中走廊，在矮的那栋楼顶；一头是楼 → 从楼顶斜下来的坡道；
   * 两头都是地面 → 两头着地、中间架高的高架桥。路线不对就返回 null。
   */
  private bridgeHeights(path: { x: number; z: number }[]): number[] | null {
    if (path.length < 2) return null;
    const end = (i: number): { stack: boolean; y: number } => {
      const { x, z } = path[i];
      const t = this.stacks.get(key(x, z));
      return t
        ? { stack: true, y: t.blocks.length * FLOOR_H }
        : { stack: false, y: cell(x, z) === 'W' ? 0.15 : 0.06 };
    };
    const a = end(0);
    const b = end(path.length - 1);
    const n = path.length - 1;
    if (a.stack && b.stack) return path.map(() => Math.min(a.y, b.y));
    if (a.stack || b.stack) return path.map((_, i) => a.y + ((b.y - a.y) * i) / n);
    return path.map((_, i) => (i === 0 ? a.y : i === n ? b.y : VIADUCT_H));
  }

  /** 把桥拆成一段段桥面和桥墩，每一段都能单独被冲垮 */
  private bridgePieces(
    path: { x: number; z: number }[],
    heights: number[],
    ghost: boolean,
  ): BridgePiece[] {
    const pieces: BridgePiece[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = tileCenter(path[i].x, path[i].z, heights[i]);
      const b = tileCenter(path[i + 1].x, path[i + 1].z, heights[i + 1]);
      const dir = b.clone().sub(a);
      const obj = bridgeDeck(dir.length(), ghost);
      const home = a.clone().add(b).multiplyScalar(0.5);
      const homeQuat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(1, 0, 0),
        dir.normalize(),
      );
      pieces.push({
        obj,
        body: newBody(home),
        home,
        homeQuat,
        tiles: [key(path[i].x, path[i].z), key(path[i + 1].x, path[i + 1].z)],
        low: Math.min(heights[i], heights[i + 1]),
      });
    }
    // 两头都接在楼上的是空中走廊，不要桥墩
    const ends = [path[0], path[path.length - 1]];
    const skyway = ends.every(({ x, z }) => this.stacks.has(key(x, z)));
    path.forEach(({ x, z }, i) => {
      if (skyway || this.stacks.has(key(x, z)) || heights[i] < 0.3) return;
      const base = cell(x, z) === 'W' ? SEA_Y : 0;
      const obj = bridgePillar(heights[i] - base - 0.08, ghost);
      const home = tileCenter(x, z, base);
      pieces.push({
        obj,
        body: newBody(home),
        home,
        homeQuat: new THREE.Quaternion(),
        tiles: [key(x, z)],
        low: heights[i],
      });
    });
    for (const p of pieces) {
      p.body.quat.copy(p.homeQuat);
      p.obj.position.copy(p.home);
      p.obj.quaternion.copy(p.homeQuat);
    }
    return pieces;
  }

  private addBridge(path: { x: number; z: number }[], heights: number[]): void {
    const pieces = this.bridgePieces(path, heights, false);
    for (const p of pieces) this.scene.add(p.obj);
    this.bridges.push({ path, heights, pieces, broken: false });
  }

  private removeBridge(b: Bridge): void {
    for (const p of b.pieces) this.scene.remove(p.obj);
    this.bridges = this.bridges.filter((x) => x !== b);
  }

  private clearGhost(): void {
    for (const o of this.ghost) this.scene.remove(o);
    this.ghost = [];
  }

  /**
   * 孩子画出来的桥的路线：起点是楼时，终点旁边一格内有楼就接到那栋楼上；
   * 路线走到海边就停在岸上，碰到别的楼就接在那栋楼上停下。
   */
  private drawnBridge(
    from: { x: number; z: number },
    to: { x: number; z: number },
  ): { path: { x: number; z: number }[]; heights: number[] } | null {
    if (cell(from.x, from.z) === '.') return null;
    let end = to;
    if (this.stacks.has(key(from.x, from.z)) && !this.stacks.has(key(to.x, to.z))) {
      for (const [dx, dz] of [[0, 0], ...NEIGHBORS, [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const k = key(to.x + dx, to.z + dz);
        if (this.stacks.has(k) && k !== key(from.x, from.z)) {
          end = { x: to.x + dx, z: to.z + dz };
          break;
        }
      }
    }
    const full = this.bridgePath(from, end);
    const path = [full[0]];
    for (const t of full.slice(1)) {
      if (cell(t.x, t.z) === '.') break;
      path.push(t);
      if (this.stacks.has(key(t.x, t.z))) break;
    }
    const heights = this.bridgeHeights(path);
    return heights ? { path, heights } : null;
  }

  private previewBridge(from: { x: number; z: number }, to: { x: number; z: number }): void {
    this.clearGhost();
    const drawn = this.drawnBridge(from, to);
    if (!drawn) return;
    const { path, heights } = drawn;
    if (!heights) return;
    for (const p of this.bridgePieces(path, heights, true)) {
      this.scene.add(p.obj);
      this.ghost.push(p.obj);
    }
  }

  // ---------------------------------------------------------------- 触摸

  private pick(
    clientX: number,
    clientY: number,
  ): { x: number; z: number; stack?: Stack; item?: Item; bridge?: Bridge } | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - r.left) / r.width) * 2 - 1,
      -((clientY - r.top) / r.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    // 楼一直在长，包围球要重新算，不然点不到新盖的层
    this.blockMesh.computeBoundingSphere();
    this.islandMesh?.computeBoundingSphere();
    const targets: THREE.Object3D[] = [
      this.blockMesh,
      ...this.items.map((i) => i.obj),
      ...this.bridges.flatMap((b) => b.pieces.map((p) => p.obj)),
      ...(this.islandMesh ? [this.islandMesh] : []),
      this.sea,
    ];
    for (const t of this.stacks.values()) {
      if (t.roof) targets.push(t.roof.obj);
      if (t.damper) targets.push(t.damper.obj);
    }
    const hit = this.raycaster.intersectObjects(targets, true)[0];
    if (!hit) return null;
    const isIn = (root: THREE.Object3D): boolean => {
      for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (o === root) return true;
      return false;
    };
    if (hit.object === this.blockMesh && hit.instanceId !== undefined) {
      const t = this.blockOwners[hit.instanceId];
      return { x: t.x, z: t.z, stack: t };
    }
    for (const t of this.stacks.values()) {
      if ((t.roof && isIn(t.roof.obj)) || (t.damper && isIn(t.damper.obj)))
        return { x: t.x, z: t.z, stack: t };
    }
    const item = this.items.find((i) => isIn(i.obj));
    if (item) return { x: item.x, z: item.z, item };
    const bridge = this.bridges.find((b) => b.pieces.some((p) => isIn(p.obj)));
    const x = Math.floor(hit.point.x + W / 2);
    const z = Math.floor(hit.point.z + D / 2);
    if (bridge) return { x, z, bridge };
    if (hit.object === this.islandMesh && hit.instanceId !== undefined) {
      const tile = this.landTiles[hit.instanceId];
      return { x: tile.x, z: tile.z, stack: this.stacks.get(key(tile.x, tile.z)) };
    }
    return { x, z, stack: this.stacks.get(key(x, z)) };
  }

  private readonly onDown = (e: PointerEvent): void => {
    this.canvas.setPointerCapture(e.pointerId);
    const f: Finger = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      x: e.clientX,
      y: e.clientY,
      mode: 'pending',
      tile: null,
      stack: null,
      item: null,
      bridge: null,
      stroke: new Set(),
      lastTile: null,
    };
    this.fingers.set(e.pointerId, f);
    if (this.fingers.size === 2) {
      // 第二根手指放下：取消第一根手指正在做的事，改成拖动 + 捏合
      this.cancelFingers(false);
      const [a, b] = [...this.fingers.values()];
      this.pinch = {
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        dist: Math.hypot(a.x - b.x, a.y - b.y),
      };
      return;
    }
    if (this.fingers.size > 2 || !this.enabled) return;

    const p = this.pick(e.clientX, e.clientY);
    f.tile = p ? { x: p.x, z: p.z } : null;
    f.stack = p?.stack ?? null;
    f.item = p?.item ?? null;
    f.bridge = p?.bridge ?? null;
    const tool = this.tool;
    if (tool === 'road') {
      f.mode = 'paint';
      if (p) this.paintTo(f, p);
    } else if (tool === 'bridge') {
      f.mode = p ? 'bridge' : 'pan';
    } else if (tool === 'build' || tool === 'wall' || tool === 'remove') {
      // 按住一会儿才开始连续盖/拆；在这之前手指动了就是拖地图（墙是画墙）
      this.holdTimer = setTimeout(() => {
        if (f.mode !== 'pending') return;
        f.mode = 'hold';
        this.tap(f);
        this.repeat(() => this.tap(f));
      }, HOLD_MS);
    }
  };

  private readonly onMove = (e: PointerEvent): void => {
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    const dx = e.clientX - f.x;
    const dy = e.clientY - f.y;
    f.x = e.clientX;
    f.y = e.clientY;

    if (this.pinch && this.fingers.size >= 2) {
      const [a, b] = [...this.fingers.values()];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      this.rig.pan(mid.x - this.pinch.mid.x, mid.y - this.pinch.mid.y);
      if (this.pinch.dist > 10) this.rig.zoom(dist / this.pinch.dist);
      this.pinch = { mid, dist };
      return;
    }
    if (this.fingers.size !== 1) return;

    const moved = Math.hypot(f.x - f.x0, f.y - f.y0) > DRAG_PX;
    if (f.mode === 'pending' && moved) {
      clearTimeout(this.holdTimer);
      if (this.tool === 'wall' && this.enabled) {
        f.mode = 'paint';
        if (f.tile) this.paintTo(f, f.tile);
      } else {
        f.mode = 'pan';
      }
    }
    if (f.mode === 'pan') {
      this.rig.pan(dx, dy);
    } else if (f.mode === 'paint') {
      const p = this.pick(e.clientX, e.clientY);
      if (p) this.paintTo(f, p);
    } else if (f.mode === 'bridge' && f.tile) {
      const p = this.pick(e.clientX, e.clientY);
      if (p) this.previewBridge(f.tile, p);
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    const f = this.fingers.get(e.pointerId);
    this.fingers.delete(e.pointerId);
    if (this.fingers.size < 2) this.pinch = null;
    if (!f) return;
    clearTimeout(this.holdTimer);
    if (!this.enabled) return;
    if (f.mode === 'pending') this.tap(f);
    if (f.mode === 'bridge' && f.tile) {
      this.clearGhost();
      const p = this.pick(e.clientX, e.clientY);
      const drawn = p ? this.drawnBridge(f.tile, p) : null;
      if (drawn) {
        this.addBridge(drawn.path, drawn.heights);
        this.cb.floor(0);
      } else {
        this.cb.invalid();
      }
    }
    this.changed();
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.rig.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

  private cancelFingers(clear = true): void {
    clearTimeout(this.holdTimer);
    this.clearGhost();
    for (const f of this.fingers.values()) f.mode = 'pan';
    if (clear) {
      this.fingers.clear();
      this.pinch = null;
    }
  }

  /** 点一下（或者按住时每一下）：看当前的工具做什么 */
  private tap(f: Finger): void {
    const tool = this.tool;
    const tile = f.tile;
    if (!tile) return;
    if (tool === 'build' || tool === 'wall') {
      this.addLayer(tool === 'build' ? 'tower' : 'wall', tile.x, tile.z);
    } else if (tool === 'remove') {
      if (f.item) {
        this.scene.remove(f.item.obj);
        this.items = this.items.filter((i) => i !== f.item);
        f.item = null;
        this.cb.floor(0);
      } else if (f.bridge) {
        this.removeBridge(f.bridge);
        f.bridge = null;
        this.cb.floor(0);
      } else if (f.stack && f.stack.blocks.length) {
        this.removeLayer(f.stack);
      } else if (this.roads.delete(key(tile.x, tile.z))) {
        this.rebuildRoads();
        this.cb.floor(0);
      }
    } else if (tool === 'damper') {
      const t = f.stack;
      if (t && t.kind === 'tower' && !t.collapsed) {
        this.setDamper(t, !t.damper);
        this.active = t;
        if (t.damper) this.cb.damper();
        else this.cb.floor(0);
      }
    } else if (tool !== 'road' && tool !== 'bridge') {
      // 点偏了一点（比如船点到了岸边）就放到旁边最近的空位
      const spot = [[0, 0], ...NEIGHBORS, [1, 1], [-1, -1], [1, -1], [-1, 1]]
        .map(([dx, dz]) => ({ x: tile.x + dx, z: tile.z + dz }))
        .find(({ x, z }) => this.canPlace(tool, x, z));
      if (spot) {
        this.addItem(tool, spot.x, spot.z);
        this.cb.floor(0);
      }
    }
  }

  /** 画路/画墙：从上一格画到这一格，中间跳过的格子也补上；墙是一笔经过的每格加一层 */
  private paintTo(f: Finger, p: { x: number; z: number }): void {
    const tiles = f.lastTile ? this.bridgePath(f.lastTile, p).slice(1) : [p];
    f.lastTile = { x: p.x, z: p.z };
    for (const t of tiles) {
      const k = key(t.x, t.z);
      if (f.stroke.has(k)) continue;
      f.stroke.add(k);
      if (this.tool === 'road') this.paintRoad(t.x, t.z);
      else this.addLayer('wall', t.x, t.z);
    }
  }

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

  // ---------------------------------------------------------------- 事件

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

  /** 陨石 / 地震 / 火山，演完再起浪。地震会返回倒了几栋楼 */
  playEvent(kind: EventKind, dir: Dir): Promise<QuakeResult | null> {
    const src = this.sourcePoint(dir);
    this.rig.setCinematic([...this.scenePoints(), src, src.clone().setY(6)]);
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
            setTimeout(() => resolve(null), 700);
          },
        );
      } else if (kind === 'quake') {
        this.quake().then(resolve);
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
              () => setTimeout(() => resolve(null), 300),
            );
          },
        );
      }
    });
  }

  /** 地震：楼摇来摇去；没装阻尼球、又比这次地震能承受的高度还高的楼会倒 */
  private quake(): Promise<QuakeResult> {
    this.shake = 2.4;
    for (let i = 0; i < 60; i++) {
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
    const limit = randomQuakeLimit();
    const result: QuakeResult = { fallen: 0, damped: 0 };
    return new Promise((resolve) => {
      setTimeout(() => {
        for (const t of this.stacks.values()) {
          if (t.kind !== 'tower' || t.collapsed || t.blocks.length < limit) continue;
          if (t.damper) {
            result.damped++;
            continue;
          }
          result.fallen++;
          setTimeout(() => this.collapse(t, this.dirVec(this.randomDir()), 'topple'), rand(0, 600));
        }
      }, 900);
      setTimeout(() => resolve(result), 2600);
    });
  }

  /** 海浪一排一排卷过来：楼比浪高就挡住，比浪矮就冲倒 */
  runWave(height: number, dir: Dir): Promise<WaveResult> {
    this.waveDir = dir;
    this.waveH = height;
    this.waveRise = 0;
    const src = this.sourcePoint(dir);
    this.rig.setCinematic([...this.scenePoints(), src, new THREE.Vector3(0, height * FLOOR_H, 0)]);
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
    const dv = this.dirVec(this.waveDir);
    for (const l of this.lanes) {
      if (!l.stopped && !l.done && this.waveRise >= 1) {
        l.front += WAVE_SPEED * dt;
        while (l.nextK < len && l.front >= l.nextK) {
          const { x, z } = this.laneTile(l.idx, l.nextK);
          const k = key(x, z);
          const t = this.stacks.get(k);
          if (t && !t.collapsed && t.blocks.length >= this.waveH) {
            l.stopped = true;
            l.front = l.nextK;
            this.splash(this.laneWorld(l.idx, l.front, this.waveH * FLOOR_H), 30, 5);
            this.onLaneBlocked();
            break;
          }
          if (t && !t.collapsed) this.collapse(t, dv, 'wave');
          // 比浪矮的桥被冲垮
          for (const b of this.bridges) {
            for (const p of b.pieces) {
              if (p.body.mode === 'home' && p.tiles.includes(k) && p.low < this.waveH * FLOOR_H)
                this.breakPiece(b, p, dv);
            }
          }
          l.nextK++;
        }
        if (l.front > len - WAVE_START) l.done = true;
        // 卷走这一排里被浪碰到、又比浪低的东西（停在高架桥上的车就没事）
        for (const it of this.items) {
          if (it.state !== 'idle') continue;
          const { lane, s } = this.tileLane(it.x, it.z);
          const under = it.kind === 'boat' || it.body.pos.y < this.waveH * FLOOR_H - 0.1;
          if (lane === l.idx && s >= WAVE_START && s <= l.front + 0.2 && under) {
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
      for (let i = 0; i < 25 * dt * count; i++) {
        const smp = this.waveSamples[Math.floor(Math.random() * this.waveSamples.length)];
        const lane = lanes[THREE.MathUtils.clamp(Math.floor(smp.w), 0, count - 1)];
        if (lane.done) continue;
        const p = toWorld(smp.w, smp.front + LIP.u * len, base + LIP.v * smp.height);
        const v = dv.clone().multiplyScalar(rand(0.5, 2.5)).setY(rand(1, 3));
        this.spawn(p, v, rand(0.4, 0.8), rand(0.08, 0.18), '#ffffff', 9);
      }
    }
  }

  /** 楼倒了：wave 被浪冲散；topple 地震时整栋往一边倒，越高的层甩得越远 */
  private collapse(t: Stack, dir: THREE.Vector3, how: 'wave' | 'topple'): void {
    if (t.collapsed) return;
    t.collapsed = true;
    this.cb.collapse();
    const side = new THREE.Vector3(dir.z, 0, dir.x);
    const all = [
      ...t.blocks,
      ...(t.roof ? [t.roof.body] : []),
      ...(t.damper ? [t.damper.body] : []),
    ];
    all.forEach((b, i) => {
      b.mode = 'debris';
      if (how === 'wave') {
        b.vel
          .copy(dir)
          .multiplyScalar(rand(2.5, 5.5))
          .addScaledVector(side, rand(-1.5, 1.5))
          .setY(rand(1, 3) + i * 0.02);
        b.spin.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
      } else {
        b.vel
          .copy(dir)
          .multiplyScalar(0.6 + i * 0.09)
          .addScaledVector(side, rand(-0.3, 0.3))
          .setY(rand(0, 1));
        b.spin.copy(side).multiplyScalar(rand(1.5, 3));
      }
    });
    // 接在这栋楼上的桥也跟着垮
    for (const b of this.bridges) {
      const ends = [b.path[0], b.path[b.path.length - 1]];
      if (ends.some((p) => p.x === t.x && p.z === t.z))
        for (const p of b.pieces) this.breakPiece(b, p, dir);
    }
    if (this.active === t) this.active = null;
  }

  private breakPiece(b: Bridge, p: BridgePiece, dir: THREE.Vector3): void {
    if (p.body.mode === 'debris') return;
    b.broken = true;
    p.body.mode = 'debris';
    p.body.vel.copy(dir).multiplyScalar(rand(2, 4)).setY(rand(0.5, 2));
    p.body.spin.set(rand(-3, 3), rand(-3, 3), rand(-3, 3));
  }

  /** 重建：被冲倒的磁力片飞回原位，被冲走的车开回来，镜头回到原来的位置 */
  rebuild(): void {
    this.rig.setCinematic(null);
    let i = 0;
    for (const t of this.stacks.values()) {
      t.collapsed = false;
      const all = [
        ...t.blocks,
        ...(t.roof ? [t.roof.body] : []),
        ...(t.damper ? [t.damper.body] : []),
      ];
      for (const b of all) this.sendBack(b, (i++ % 60) * 0.02);
    }
    for (const b of this.bridges) {
      b.broken = false;
      for (const p of b.pieces) this.sendBack(p.body, rand(0, 0.4));
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
    this.rig.setViewport(el.clientWidth, el.clientHeight);
  }

  /** 把一层墙画成竖着的磁力片：往连着的方向各伸出半格，没连着的就是一根柱子 */
  private drawWall(
    t: Stack,
    b: Body,
    color: THREE.Color,
    n: number,
    links: (readonly [number, number])[],
  ): number {
    const { m, m2, s, v } = this.tmp;
    m.compose(b.pos, b.quat, ONE);
    const panels: [number, number, number, number][] = links.length
      ? [
          [0, 0, 0.16, 0.16],
          ...links.map(
            ([dx, dz]) =>
              [dx * 0.25, dz * 0.25, dx ? 0.62 : 0.12, dz ? 0.62 : 0.12] as [
                number,
                number,
                number,
                number,
              ],
          ),
        ]
      : [[0, 0, 0.4, 0.4]];
    for (const [ox, oz, sx, sz] of panels) {
      m2.compose(v.set(ox, 0, oz), IDENTITY, s.set(sx, 1, sz));
      this.blockMesh.setMatrixAt(n, m2.premultiply(m));
      this.blockMesh.setColorAt(n, color);
      this.blockOwners[n++] = t;
    }
    return n;
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

    // 磁力片：地震时楼会摇，越高摇得越厉害；装了阻尼球的摇得少
    const { m, s } = this.tmp;
    let n = 0;
    this.blockOwners.length = 0;
    const quaking = Math.min(1, this.shake);
    const sway = Math.sin(this.time * 14) * quaking;
    for (const t of this.stacks.values()) {
      const links = t.kind === 'wall' ? this.wallLinks(t) : [];
      const damping = t.damper ? 0.25 : 1;
      t.blocks.forEach((b, floor) => {
        if (n >= MAX_BLOCKS - 8) return;
        const home = this.stackHome(t, floor);
        if (quaking) home.pos.x += sway * floor * 0.006 * damping;
        this.stepBody(b, home.pos, IDENTITY, dt, FLOOR_H / 2);
        const color = TILE_COLORS[floor % TILE_COLORS.length];
        if (t.kind === 'wall') {
          n = this.drawWall(t, b, color, n, links);
        } else {
          s.set(home.scale, 1, home.scale);
          m.compose(b.pos, b.quat, s);
          this.blockMesh.setMatrixAt(n, m);
          this.blockMesh.setColorAt(n, color);
          this.blockOwners[n++] = t;
        }
      });
      for (const piece of [t.roof, t.damper]) {
        if (!piece) continue;
        const home = piece === t.roof ? this.roofHome(t) : this.damperHome(t);
        const height = home.y / FLOOR_H;
        // 阻尼球往楼摇的反方向荡，把晃动"吃掉"
        home.x += sway * height * 0.006 * damping * (piece === t.damper ? -3 : 1);
        this.stepBody(piece.body, home, IDENTITY, dt, 0.1);
        piece.obj.position.copy(piece.body.pos);
        piece.obj.quaternion.copy(piece.body.quat);
      }
    }
    this.blockMesh.count = n;
    this.blockMesh.instanceMatrix.needsUpdate = true;
    if (this.blockMesh.instanceColor) this.blockMesh.instanceColor.needsUpdate = true;

    // 桥
    for (const b of this.bridges) {
      for (const p of b.pieces) {
        this.stepBody(p.body, p.home, p.homeQuat, dt, 0.05);
        p.obj.position.copy(p.body.pos);
        p.obj.quaternion.copy(p.body.quat);
      }
    }

    // 车、人、船
    for (const it of this.items) {
      const homeQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, (it.rot * Math.PI) / 2, 0),
      );
      if (it.state === 'idle' || it.body.mode === 'back')
        this.stepBody(it.body, this.itemHome(it), homeQuat, dt, 0.02);
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
      m.compose(p.pos, IDENTITY, s.set(size, size, size));
      this.particleMesh.setMatrixAt(pn, m);
      this.particleMesh.setColorAt(pn++, p.color);
    }
    this.particleMesh.count = pn;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    this.rig.update(this.shake);
    this.renderer.render(this.scene, this.rig.camera);

    // 当前这栋楼头顶的层数；楼顶在画面外就贴在屏幕最上面
    const a = this.active;
    if (a && !a.collapsed && a.blocks.length) {
      const top = this.stackTop(a).project(this.rig.camera);
      const r = this.canvas.getBoundingClientRect();
      const y = ((1 - top.y) / 2) * r.height + r.top;
      const minY = r.top + 110;
      const x = THREE.MathUtils.clamp(
        ((top.x + 1) / 2) * r.width + r.left,
        r.left + 50,
        r.right - 50,
      );
      this.cb.label({ x, y: Math.max(y, minY) }, a.blocks.length, y < minY);
    } else {
      this.cb.label(null, 0, false);
    }
  };
}
