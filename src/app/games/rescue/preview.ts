import * as THREE from 'three';
import {
  buildCharacter,
  buildPart,
  buildVehicle,
  Character,
  disposeGeometry,
  partTop,
} from './models';
import { PART_KINDS, PARTS, PartKind } from './parts';
import { Vehicle } from './vehicle';

function lights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight('#fff4dc', '#7a8f9a', 1.6));
  const sun = new THREE.DirectionalLight('#fff0d0', 2.2);
  sun.position.set(4, 8, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
  scene.add(sun);
}

let thumbs: Record<string, string> | null = null;

/** 零件和角色的小图（零件盘、网格、任务卡用）。只画一次，存在模块里 */
export function thumbnails(): Record<PartKind | Character, string> {
  if (thumbs) return thumbs as Record<PartKind | Character, string>;
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const out: Record<string, string> = {};
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    // 没有 WebGL（比如截缩略图的时候），零件盘只显示名字
    thumbs = {};
    return thumbs as Record<PartKind | Character, string>;
  }
  renderer.setSize(size, size, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  lights(scene);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  const items: [string, THREE.Object3D, number][] = [
    ...PART_KINDS.map((k): [string, THREE.Object3D, number] => [k, buildPart(k), partTop(k)]),
    ...(['bear', 'koala', 'chick', 'polar'] as Character[]).map(
      (k): [string, THREE.Object3D, number] => [k, buildCharacter(k), 0.95],
    ),
  ];
  for (const [key, obj, top] of items) {
    scene.add(obj);
    const isChar = !(key in PARTS);
    // 零件从右前上方看（车头朝右），角色正面
    const look = new THREE.Vector3(0, isChar ? 0.48 : Math.max(0.35, top * 0.45), 0);
    const dist = isChar ? 2.6 : 3.1 + Math.max(0, top - 1) * 0.8;
    const dir = isChar ? new THREE.Vector3(0.25, 0.25, 1) : new THREE.Vector3(0.55, 0.55, 1);
    camera.position.copy(look).addScaledVector(dir.normalize(), dist);
    camera.lookAt(look);
    renderer.render(scene, camera);
    out[key] = canvas.toDataURL('image/png');
    scene.remove(obj);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  thumbs = out;
  return out as Record<PartKind | Character, string>;
}

/**
 * 拼装时右边的小转台：载具放在上面慢慢转，手指拖动可以转着看。
 * 新吸上的块会"咔嗒"一下弹出来。
 */
export class Preview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private readonly turntable = new THREE.Group();
  private table: THREE.Mesh | null = null;
  private vehicle: THREE.Group | null = null;
  private readonly bear = buildCharacter('bear');
  private keys = new Set<string>();
  private pops: { obj: THREE.Object3D; t: number }[] = [];
  private flash: { obj: THREE.Object3D; t: number }[] = [];
  private angle = -0.5;
  private spin = 0.25;
  private dragX: number | null = null;
  private zoom = 8;
  private raf = 0;
  private last = 0;
  private readonly resizeObserver: ResizeObserver;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    lights(this.scene);
    // 圆形的木头转台
    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3.15, 0.3, 40),
      new THREE.MeshStandardMaterial({ color: '#e2b47a', roughness: 0.9 }),
    );
    table.position.y = -0.15;
    table.receiveShadow = true;
    this.table = table;
    this.turntable.add(table);
    this.scene.add(this.turntable);
    this.bear.scale.setScalar(0.55);

    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointercancel', this.onUp);
    this.renderer.dispose();
  }

  /** 换一台载具；和上一台比，新多出来的块弹一下。bad 里的块（网格 [row, col]）闪红 */
  setVehicle(v: Vehicle, bad: [number, number][] = []): void {
    if (this.vehicle) {
      this.bear.removeFromParent();
      this.turntable.remove(this.vehicle);
      disposeGeometry(this.vehicle);
    }
    this.vehicle = buildVehicle(v);
    this.turntable.add(this.vehicle);
    const keys = new Set<string>();
    this.pops = [];
    this.flash = [];
    const badKeys = new Set(bad.map(([r, c]) => `${r},${c}`));
    for (const part of this.vehicle.children) {
      const b = part.userData['block'];
      const key = `${b.row},${b.col},${b.part}`;
      keys.add(key);
      if (!this.keys.has(key)) this.pops.push({ obj: part, t: 0 });
      if (badKeys.has(`${b.row},${b.col}`)) this.flash.push({ obj: part, t: 0 });
    }
    this.keys = keys;

    // 黄熊队长坐在最靠中间的车头上
    const heads = this.vehicle.children.filter(
      (p) => PARTS[p.userData['block'].part as PartKind].slot === 'head',
    );
    if (heads.length) {
      const mid = (v.width - 1) / 2;
      const seat = heads.reduce((a, b) =>
        Math.abs(a.userData['block'].z - mid) <= Math.abs(b.userData['block'].z - mid) ? a : b,
      );
      this.bear.position.set(-0.15, partTop(seat.userData['block'].part), 0);
      this.bear.rotation.y = 0.6;
      seat.add(this.bear);
    }
    this.zoom = 6.5 + Math.max(3, v.length, v.width * 1.3) * 0.6;
    // 车越大转台越大，画面上看起来一样大
    this.table?.scale.set(this.zoom / 8.3, 1, this.zoom / 8.3);
  }

  private readonly onDown = (e: PointerEvent): void => {
    this.dragX = e.clientX;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (this.dragX === null) return;
    this.angle += (e.clientX - this.dragX) * 0.012;
    this.dragX = e.clientX;
    this.spin = 0;
  };

  private readonly onUp = (): void => {
    this.dragX = null;
    // 放手后过一会儿再自己慢慢转
    this.spin = 0.25;
  };

  private resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (document.visibilityState !== 'visible') return;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.dragX === null) this.angle += this.spin * dt;
    this.turntable.rotation.y = this.angle;

    for (const p of this.pops) {
      p.t = Math.min(1, p.t + dt * 4);
      // 从上面落下来，弹一下
      const k = p.t < 0.6 ? p.t / 0.6 : 1;
      p.obj.position.y =
        (1 - k) * 1.2 + (p.t >= 0.6 ? Math.sin(((p.t - 0.6) / 0.4) * Math.PI) * 0.12 : 0);
    }
    this.pops = this.pops.filter((p) => p.t < 1);
    for (const f of this.flash) {
      f.t += dt;
      f.obj.position.y = Math.abs(Math.sin(f.t * 8)) * 0.25;
    }
    for (const part of this.vehicle?.children ?? []) {
      const blades = part.getObjectByName('blades');
      if (blades) blades.rotation.y += dt * 4;
    }

    const aspect = this.camera.aspect;
    const dist = this.zoom / Math.min(1, aspect);
    this.camera.position.set(0, dist * 0.75, dist);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  };
}
