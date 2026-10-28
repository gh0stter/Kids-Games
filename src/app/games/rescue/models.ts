import * as THREE from 'three';
import { PARTS, PartKind } from './parts';
import { Friend } from './rescue-data';
import { Vehicle } from './vehicle';

/**
 * 零件和角色的 3D 模型，全部用简单几何体拼出来。
 * 每个零件占一格：x 在 [-0.5, 0.5]（+x 是车头方向），z 在 [-0.5, 0.5]，从 y = 0 往上。
 * 颜色照着孩子手上那套磁力工程车：黄色车身 + 深灰色底盘。
 */

/** 零件数值里的高度 1 在画面上有多高 */
export const HEIGHT_SCALE = 0.62;

const YELLOW = '#f6b42c';
const YELLOW_DARK = '#e09a17';
const GREY = '#5d6266';
const GREY_LIGHT = '#8a9095';
const TYRE = '#2b2b33';
const GLASS = '#bfe8ff';
const WHITE = '#fffaf0';

const mats = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: string, extra: THREE.MeshStandardMaterialParameters = {}): THREE.Material {
  const key = color + JSON.stringify(extra);
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, flatShading: true, ...extra });
    mats.set(key, m);
  }
  return m;
}

/** 底面在 y 处的长方体 */
function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y + h / 2, z);
  return m;
}

function sphere(r: number, color: string, x = 0, y = 0, z = 0, seg = 14): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), mat(color));
  m.position.set(x, y, z);
  return m;
}

/** 沿 z 轴放的圆柱（轮子、滚筒） */
function drum(r: number, len: number, color: string, x = 0, y = 0, z = 0, seg = 16): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r, len, seg);
  geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(x, y, z);
  return m;
}

// ---------------------------------------------------------------- 底部

/** 底盘顶面高度：上面的东西从这里开始放 */
const DECK = 0.34;

function wheelBase(g: THREE.Group, xs = [0]): void {
  g.add(box(0.96, 0.16, 0.8, GREY, 0, 0.18));
  for (const x of xs) {
    for (const z of [-0.4, 0.4]) {
      const wheel = new THREE.Group();
      wheel.name = 'wheel';
      wheel.position.set(x, 0.2, z);
      wheel.add(drum(0.2, 0.14, TYRE, 0, 0, 0, 14));
      wheel.add(drum(0.09, 0.16, GREY_LIGHT, 0, 0, 0, 8));
      g.add(wheel);
    }
  }
}

function rollerBase(g: THREE.Group): void {
  const roll = new THREE.Group();
  roll.name = 'wheel';
  roll.position.set(0, 0.3, 0);
  roll.add(drum(0.3, 0.92, GREY_LIGHT, 0, 0, 0, 18));
  roll.add(drum(0.31, 0.06, GREY, 0, 0, 0.3, 18), drum(0.31, 0.06, GREY, 0, 0, -0.3, 18));
  g.add(roll);
  g.add(box(0.8, 0.1, 0.96, YELLOW_DARK, 0, 0.58));
  for (const z of [-0.48, 0.48]) g.add(box(0.5, 0.36, 0.05, YELLOW, 0, 0.22, z));
}

/** 船身的横截面，往 x 方向拉长；pointed 是船头（往前收尖），square 是船尾 */
function hullGeo(shape: 'mid' | 'bow' | 'stern'): THREE.BufferGeometry {
  const s = new THREE.Shape();
  // 在 z-y 平面画梯形
  s.moveTo(-0.5, DECK);
  s.lineTo(0.5, DECK);
  s.lineTo(0.32, -0.02);
  s.lineTo(-0.32, -0.02);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  // 挤出方向是 z，转到 x
  geo.rotateY(Math.PI / 2);
  geo.translate(-0.5, 0, 0);
  if (shape === 'bow') {
    // 往前收尖：越靠前 z 越窄、底越高
    const pos = geo.attributes['position'];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const t = THREE.MathUtils.clamp((x + 0.1) / 0.6, 0, 1);
      pos.setZ(i, pos.getZ(i) * (1 - t * 0.95));
      pos.setY(i, pos.getY(i) + (DECK - pos.getY(i)) * t * 0.55);
    }
    geo.computeVertexNormals();
  }
  return geo;
}

function hullBase(g: THREE.Group, shape: 'mid' | 'bow' | 'stern' = 'mid'): void {
  const hull = new THREE.Mesh(hullGeo(shape), mat(GREY));
  g.add(hull);
  // 黄色的船舷：顶面比灰色船体高一点点。两个面正好重叠在 DECK 时，显卡分不出谁在前面，会一直闪
  if (shape !== 'bow') g.add(box(1, 0.08, 1.02, YELLOW, 0, DECK - 0.07));
}

function skidBase(g: THREE.Group): void {
  for (const z of [-0.3, 0.3]) {
    g.add(box(0.9, 0.05, 0.06, GREY, 0, 0.02, z));
    for (const x of [-0.25, 0.25]) g.add(box(0.05, 0.22, 0.05, GREY, x, 0.05, z));
  }
  g.add(box(0.96, 0.08, 0.7, GREY, 0, 0.26));
}

// ---------------------------------------------------------------- 零件

function truckCab(g: THREE.Group): void {
  wheelBase(g);
  const top = PARTS.truckCab.height * HEIGHT_SCALE;
  g.add(box(0.86, top - DECK - 0.08, 0.84, YELLOW, -0.05, DECK));
  g.add(box(0.8, 0.08, 0.78, GREY, -0.05, top - 0.08));
  // 挡风玻璃和侧窗
  g.add(box(0.04, 0.26, 0.66, GLASS, 0.4, top - 0.4));
  g.add(box(0.36, 0.22, 0.86, GLASS, 0.1, top - 0.38));
  // 车灯
  for (const z of [-0.3, 0.3]) g.add(box(0.05, 0.08, 0.12, '#fff2a8', 0.4, DECK + 0.04, z));
}

function jeepCab(g: THREE.Group): void {
  wheelBase(g);
  const top = PARTS.jeepCab.height * HEIGHT_SCALE;
  g.add(box(0.9, 0.16, 0.84, YELLOW, 0, DECK));
  // 斜着的挡风玻璃：流线型
  const glass = box(0.04, 0.2, 0.7, GLASS, 0.05, DECK + 0.12);
  glass.rotation.z = 0.7;
  g.add(glass);
  g.add(box(0.36, top - DECK - 0.16, 0.8, YELLOW_DARK, -0.25, DECK + 0.16));
  for (const z of [-0.3, 0.3]) g.add(box(0.05, 0.07, 0.12, '#fff2a8', 0.44, DECK + 0.05, z));
}

function trainHead(g: THREE.Group): void {
  wheelBase(g, [-0.22, 0.22]);
  const top = PARTS.trainHead.height * HEIGHT_SCALE;
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.66, 16), mat(YELLOW));
  boiler.rotation.z = Math.PI / 2;
  boiler.position.set(0.12, DECK + 0.28, 0);
  g.add(boiler);
  g.add(box(0.04, 0.42, 0.42, GREY, 0.45, DECK + 0.07));
  // 烟囱
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.24, 10), mat(GREY));
  chimney.position.set(0.3, DECK + 0.62, 0);
  g.add(chimney);
  g.add(box(0.36, top - DECK, 0.8, YELLOW_DARK, -0.3, DECK));
  g.add(box(0.06, 0.18, 0.6, GLASS, -0.13, top - 0.3));
  // 排障器（尖头）
  const plow = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 4), mat(GREY));
  plow.rotation.set(0, Math.PI / 4, -Math.PI / 2);
  plow.position.set(0.52, 0.18, 0);
  g.add(plow);
}

function boatBow(g: THREE.Group): void {
  hullBase(g, 'bow');
  g.add(box(0.36, 0.26, 0.5, WHITE, -0.25, DECK));
  g.add(box(0.06, 0.12, 0.4, GLASS, -0.08, DECK + 0.1));
}

function heliNose(g: THREE.Group): void {
  skidBase(g);
  const body = sphere(0.42, YELLOW, -0.02, 0.62, 0, 18);
  body.scale.set(1.25, 0.95, 1);
  g.add(body);
  const glass = sphere(0.34, GLASS, 0.22, 0.66, 0, 16);
  glass.scale.set(0.9, 0.85, 0.95);
  g.add(glass);
}

function deck(g: THREE.Group, color = YELLOW): void {
  g.add(box(0.96, 0.14, 0.86, color, 0, DECK));
}

function wheels(g: THREE.Group): void {
  wheelBase(g);
  deck(g);
}

function roller(g: THREE.Group): void {
  rollerBase(g);
}

function hull(g: THREE.Group): void {
  hullBase(g);
  g.add(box(0.7, 0.04, 0.6, '#c9a26b', 0, DECK));
}

function rotor(g: THREE.Group): void {
  skidBase(g);
  g.add(box(0.96, 0.32, 0.8, YELLOW, 0, DECK));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), mat(GREY));
  mast.position.set(0, DECK + 0.38, 0);
  g.add(mast);
  const blades = new THREE.Group();
  blades.name = 'blades';
  blades.position.set(0, DECK + 0.45, 0);
  blades.add(box(1.5, 0.03, 0.12, GREY, 0, 0), box(0.12, 0.03, 1.5, GREY, 0, 0));
  blades.add(sphere(0.07, YELLOW_DARK, 0, 0.03, 0, 8));
  g.add(blades);
}

function bucket(g: THREE.Group): void {
  wheelBase(g);
  deck(g);
  g.add(box(0.34, 0.24, 0.4, YELLOW_DARK, -0.2, DECK + 0.14));
  // 大臂：绕后端转；大风时往下插进地里
  const arm = new THREE.Group();
  arm.name = 'arm';
  arm.position.set(-0.1, DECK + 0.32, 0);
  arm.rotation.z = 0.5;
  arm.add(box(0.62, 0.09, 0.1, YELLOW, 0.3, -0.045));
  const scoop = box(0.18, 0.2, 0.34, GREY, 0.62, -0.2);
  arm.add(scoop);
  for (const z of [-0.12, 0, 0.12]) arm.add(box(0.05, 0.08, 0.04, GREY_LIGHT, 0.7, -0.27, z));
  g.add(arm);
}

function crane(g: THREE.Group): void {
  wheelBase(g);
  deck(g);
  g.add(box(0.36, 0.2, 0.44, YELLOW_DARK, -0.22, DECK + 0.14));
  // 吊臂：绕后端转起来
  const boom = new THREE.Group();
  boom.name = 'boom';
  boom.position.set(-0.3, DECK + 0.36, 0);
  const len = 1.15;
  boom.add(box(len, 0.1, 0.12, YELLOW, len / 2, -0.05));
  boom.add(box(len * 0.6, 0.08, 0.08, GREY, len * 0.55, 0.05));
  // 吊钩：挂在吊臂前端，跟着往下垂
  const hook = new THREE.Group();
  hook.name = 'hook';
  hook.position.set(len, 0, 0);
  const rope = box(0.02, 0.3, 0.02, '#333333', 0, -0.3);
  rope.name = 'rope';
  hook.add(rope);
  const hookMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.06, 0.02, 6, 12, Math.PI * 1.4),
    mat(GREY),
  );
  hookMesh.position.y = -0.36;
  hook.add(hookMesh);
  boom.add(hook);
  g.add(boom);
}

function mixer(g: THREE.Group): void {
  wheelBase(g);
  deck(g, GREY);
  const drumMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.38, 0.86, 14),
    mat(GREY_LIGHT),
  );
  drumMesh.rotation.z = Math.PI / 2 + 0.35;
  drumMesh.position.set(0, DECK + 0.48, 0);
  g.add(drumMesh);
  for (const x of [-0.18, 0.08]) {
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.03, 6, 16), mat(YELLOW));
    stripe.rotation.y = Math.PI / 2;
    stripe.rotation.x = 0.35;
    stripe.position.set(x, DECK + 0.48 + x * 0.35, 0);
    g.add(stripe);
  }
}

function dumper(g: THREE.Group, full = false): void {
  wheelBase(g);
  deck(g, GREY);
  const bed = DECK + 0.14;
  g.add(box(0.92, 0.06, 0.84, YELLOW, 0, bed));
  for (const z of [-0.4, 0.4]) g.add(box(0.92, 0.3, 0.05, YELLOW, 0, bed, z));
  g.add(box(0.05, 0.3, 0.84, YELLOW, -0.44, bed), box(0.05, 0.36, 0.84, YELLOW_DARK, 0.44, bed));
  if (full) {
    const rocks = [
      [-0.22, -0.18],
      [0.15, -0.15],
      [-0.1, 0.18],
      [0.22, 0.16],
      [0, 0],
    ];
    rocks.forEach(([x, z], i) => {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.17 + (i % 2) * 0.04),
        mat('#8f8a84'),
      );
      rock.position.set(x, bed + 0.2 + (i === 4 ? 0.12 : 0), z);
      rock.rotation.set(i, i * 2, 0);
      g.add(rock);
    });
  }
}

function damper(g: THREE.Group): void {
  wheelBase(g);
  deck(g);
  const top = PARTS.damper.height * HEIGHT_SCALE;
  for (const [x, z] of [
    [-0.36, -0.32],
    [0.36, -0.32],
    [-0.36, 0.32],
    [0.36, 0.32],
  ])
    g.add(box(0.06, top - DECK - 0.14, 0.06, GREY, x, DECK + 0.14, z));
  g.add(box(0.8, 0.06, 0.7, GREY, 0, top - 0.06));
  // 金色的大球挂在架子下面，摇的时候往反方向荡
  const swing = new THREE.Group();
  swing.name = 'ball';
  swing.position.set(0, top - 0.06, 0);
  swing.add(box(0.02, 0.14, 0.02, '#444444', 0, -0.14));
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 18, 14),
    new THREE.MeshStandardMaterial({
      color: '#ffd23f',
      metalness: 0.5,
      roughness: 0.25,
      emissive: '#ffb000',
      emissiveIntensity: 0.5,
    }),
  );
  ball.position.y = -0.32;
  swing.add(ball);
  g.add(swing);
}

function truckTail(g: THREE.Group): void {
  wheelBase(g);
  deck(g);
  g.add(box(0.06, 0.28, 0.84, YELLOW_DARK, -0.45, DECK + 0.14));
  for (const z of [-0.34, 0.34]) g.add(box(0.04, 0.08, 0.1, '#ff5a5f', -0.49, DECK + 0.02, z));
}

function trainTail(g: THREE.Group): void {
  wheelBase(g, [-0.22, 0.22]);
  const top = PARTS.trainTail.height * HEIGHT_SCALE;
  g.add(box(0.86, top - DECK - 0.1, 0.8, YELLOW, 0, DECK));
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.9, 16, 1, false, 0, Math.PI),
    mat(GREY),
  );
  roof.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  roof.scale.set(1, 1, 0.3);
  roof.position.set(0, top - 0.1, 0);
  g.add(roof);
  for (const x of [-0.2, 0.2]) g.add(box(0.2, 0.16, 0.82, GLASS, x, top - 0.38));
}

function boatStern(g: THREE.Group): void {
  hullBase(g, 'stern');
  g.add(box(0.5, 0.3, 0.6, WHITE, 0.05, DECK));
  g.add(box(0.06, 0.14, 0.5, GLASS, 0.3, DECK + 0.1));
  // 螺旋桨
  const prop = new THREE.Group();
  prop.name = 'prop';
  prop.position.set(-0.52, 0.12, 0);
  prop.add(
    box(0.03, 0.22, 0.05, GREY_LIGHT, 0, -0.11),
    box(0.03, 0.05, 0.22, GREY_LIGHT, 0, -0.025),
  );
  g.add(prop);
}

function heliTail(g: THREE.Group): void {
  skidBase(g);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 0.9, 10), mat(YELLOW));
  boom.rotation.z = Math.PI / 2;
  boom.position.set(0, 0.55, 0);
  g.add(boom);
  g.add(box(0.2, 0.36, 0.05, YELLOW_DARK, -0.4, 0.52));
  const tailRotor = new THREE.Group();
  tailRotor.name = 'tailRotor';
  tailRotor.position.set(-0.4, 0.75, 0.08);
  tailRotor.add(box(0.36, 0.05, 0.02, GREY, 0, -0.025), box(0.05, 0.36, 0.02, GREY, 0, -0.18));
  g.add(tailRotor);
}

const BUILDERS: Record<PartKind, (g: THREE.Group) => void> = {
  truckCab,
  jeepCab,
  trainHead,
  boatBow,
  heliNose,
  wheels,
  roller,
  hull,
  rotor,
  bucket,
  crane,
  mixer,
  dumper: (g) => dumper(g),
  dumperFull: (g) => dumper(g, true),
  damper,
  truckTail,
  trainTail,
  boatStern,
  heliTail,
};

export function buildPart(kind: PartKind): THREE.Group {
  const g = new THREE.Group();
  g.name = kind;
  BUILDERS[kind](g);
  g.traverse((o) => {
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return g;
}

/** 不要了的模型：几何体释放掉（材质是共用的，留着） */
export function disposeGeometry(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}

/** 零件顶面的高度（角色站在上面） */
export function partTop(kind: PartKind): number {
  return Math.max(DECK + 0.14, PARTS[kind].height * HEIGHT_SCALE);
}

/** 整台载具：中心在原点，车头朝 +x，网格第 0 行在 -z（离镜头远） */
export function buildVehicle(v: Vehicle): THREE.Group {
  const g = new THREE.Group();
  for (const b of v.blocks) {
    const part = buildPart(b.part);
    part.position.set(b.x - (v.length - 1) / 2, 0, b.z - (v.width - 1) / 2);
    part.userData = { block: b };
    g.add(part);
  }
  return g;
}

// ---------------------------------------------------------------- 角色

export type Character = Friend | 'bear';

const CHAR_COLORS: Record<
  Character,
  { body: string; belly: string; nose: string; ear: string; extra?: 'koala' | 'chick' }
> = {
  bear: { body: '#f7cf55', belly: '#fffaf0', nose: '#8d8f94', ear: '#f7cf55' },
  polar: { body: '#f6f1e4', belly: '#ffffff', nose: '#8d8f94', ear: '#f6f1e4' },
  koala: { body: '#a3a3ad', belly: '#f4f1ea', nose: '#3d3434', ear: '#a3a3ad', extra: 'koala' },
  chick: { body: '#ffd93b', belly: '#ffe680', nose: '#ff8a2a', ear: '#ffd93b', extra: 'chick' },
};

/** 软软圆圆的玩偶：高大约 0.9（scale = 1 时），脚底在 y = 0，面朝 +z（镜头） */
export function buildCharacter(kind: Character): THREE.Group {
  const c = CHAR_COLORS[kind];
  const g = new THREE.Group();
  g.name = kind;
  const body = sphere(0.26, c.body, 0, 0.3, 0, 16);
  body.scale.set(1, 1.15, 0.9);
  const belly = sphere(0.2, c.belly, 0, 0.27, 0.08, 14);
  belly.scale.set(0.9, 1.05, 0.7);
  g.add(body, belly);
  // 手脚
  for (const s of [-1, 1]) {
    const arm = sphere(0.09, c.body, s * 0.26, 0.38, 0.04, 10);
    arm.scale.set(1.5, 0.8, 0.8);
    arm.rotation.z = s * -0.5;
    const leg = sphere(0.1, kind === 'chick' ? '#ff8a2a' : c.body, s * 0.12, 0.06, 0.08, 10);
    leg.scale.set(1, 0.7, 1.3);
    g.add(arm, leg);
  }
  const headY = 0.72;
  const head = sphere(0.24, c.body, 0, headY, 0.02, 18);
  g.add(head);
  if (c.extra === 'chick') {
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 8), mat(c.nose));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, headY - 0.03, 0.27);
    g.add(beak);
    // 头顶一撮毛
    for (const [x, r] of [
      [-0.04, -0.3],
      [0.04, 0.3],
    ]) {
      const tuft = sphere(0.05, c.body, x, headY + 0.25, 0, 8);
      tuft.scale.set(0.6, 1.4, 0.6);
      tuft.rotation.z = r;
      g.add(tuft);
    }
  } else {
    // 耳朵
    const earR = c.extra === 'koala' ? 0.12 : 0.075;
    for (const s of [-1, 1]) {
      const ear = sphere(earR, c.ear, s * (c.extra === 'koala' ? 0.22 : 0.16), headY + 0.17, 0, 10);
      ear.scale.z = 0.6;
      g.add(ear);
      if (c.extra === 'koala') g.add(sphere(earR * 0.6, c.belly, s * 0.22, headY + 0.17, 0.04, 8));
    }
    // 鼻子：考拉是一个大黑鼻子，熊是小灰鼻子 + 浅色口鼻
    if (c.extra === 'koala') {
      const nose = sphere(0.09, c.nose, 0, headY - 0.02, 0.23, 12);
      nose.scale.set(0.8, 1.1, 0.6);
      g.add(nose);
    } else {
      const muzzle = sphere(0.09, c.belly, 0, headY - 0.06, 0.2, 12);
      muzzle.scale.set(1.2, 0.8, 0.7);
      g.add(muzzle, sphere(0.035, c.nose, 0, headY - 0.03, 0.27, 8));
    }
  }
  // 眼睛
  for (const s of [-1, 1]) g.add(sphere(0.03, '#222222', s * 0.09, headY + 0.05, 0.22, 8));
  g.traverse((o) => (o.castShadow = true));
  return g;
}
