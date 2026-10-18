import * as THREE from 'three';

/** 能摆在岛上的东西 */
export type ItemKind = 'fireTruck' | 'carrier' | 'digger' | 'bus' | 'person' | 'boat';

export const ITEM_TOOLS: { kind: ItemKind; emoji: string; name: string }[] = [
  { kind: 'fireTruck', emoji: '🚒', name: '消防车' },
  { kind: 'carrier', emoji: '🚛', name: '运输车' },
  { kind: 'digger', emoji: '🚜', name: '挖掘机' },
  { kind: 'bus', emoji: '🚌', name: '巴士' },
  { kind: 'person', emoji: '🧍', name: '小人' },
  { kind: 'boat', emoji: '⛵', name: '小船' },
];

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** 同一种颜色共用一个材质 */
function mat(
  color: string,
  extra: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  const key = color + JSON.stringify(extra);
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, ...extra });
    mats.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y + h / 2, z);
  return m;
}

function wheels(group: THREE.Group, xs: number[], halfWidth: number, r = 0.09): void {
  const geo = new THREE.CylinderGeometry(r, r, 0.06, 10);
  geo.rotateX(Math.PI / 2);
  for (const x of xs) {
    for (const z of [-halfWidth, halfWidth]) {
      const w = new THREE.Mesh(geo, mat('#2b2b33'));
      w.position.set(x, r, z);
      group.add(w);
    }
  }
}

function fireTruck(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.78, 0.22, 0.34, '#e8483f', 0, 0.06));
  g.add(box(0.24, 0.2, 0.34, '#e8483f', 0.27, 0.28));
  g.add(box(0.05, 0.12, 0.3, '#bfe8ff', 0.4, 0.32));
  // 梯子
  g.add(box(0.62, 0.04, 0.12, '#d9d9d9', -0.08, 0.32));
  g.add(box(0.06, 0.06, 0.08, '#ffd34d', 0.27, 0.48));
  wheels(g, [-0.25, 0.25], 0.17);
  return g;
}

function carrier(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.22, 0.3, 0.34, '#2f7fd8', 0.32, 0.06));
  g.add(box(0.05, 0.12, 0.3, '#bfe8ff', 0.44, 0.22));
  g.add(box(0.6, 0.28, 0.34, '#b8bec6', -0.12, 0.08));
  g.add(box(0.6, 0.03, 0.36, '#8e959e', -0.12, 0.22));
  wheels(g, [-0.3, -0.05, 0.3], 0.17);
  return g;
}

function digger(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.56, 0.1, 0.4, '#3a3a40', 0, 0));
  g.add(box(0.4, 0.2, 0.32, '#f5b82e', -0.04, 0.1));
  g.add(box(0.16, 0.18, 0.2, '#f5b82e', -0.08, 0.3));
  g.add(box(0.12, 0.12, 0.18, '#bfe8ff', -0.08, 0.32));
  const arm = box(0.42, 0.07, 0.07, '#f0a81c', 0.3, 0.32);
  arm.rotation.z = 0.5;
  g.add(arm);
  g.add(box(0.12, 0.12, 0.16, '#5c5c63', 0.48, 0.24));
  return g;
}

function bus(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.8, 0.46, 0.34, '#d93a3a', 0, 0.06));
  // 两层窗户
  g.add(box(0.72, 0.08, 0.35, '#fff3d6', 0, 0.2));
  g.add(box(0.72, 0.08, 0.35, '#fff3d6', 0, 0.38));
  wheels(g, [-0.26, 0.26], 0.17);
  return g;
}

const SHIRTS = ['#f47c7c', '#6aaee8', '#6cc59a', '#f8d248', '#b08be0', '#f8a24b'];

function person(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.09, 0.22, 8),
    mat(SHIRTS[Math.floor(Math.random() * SHIRTS.length)]),
  );
  body.position.y = 0.11;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), mat('#f5d0a9'));
  head.position.y = 0.3;
  g.add(head);
  return g;
}

function boat(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Shape();
  hull.moveTo(-0.38, 0.12);
  hull.lineTo(0.42, 0.12);
  hull.lineTo(0.28, -0.04);
  hull.lineTo(-0.3, -0.04);
  hull.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(hull, { depth: 0.3, bevelEnabled: false });
  hullGeo.translate(0, 0, -0.15);
  g.add(new THREE.Mesh(hullGeo, mat('#ffffff')));
  g.add(box(0.03, 0.55, 0.03, '#8d6a48', 0, 0.12));
  const sail = new THREE.Shape();
  sail.moveTo(0.02, 0.2);
  sail.lineTo(0.02, 0.64);
  sail.lineTo(0.32, 0.2);
  sail.closePath();
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(sail), mat('#f47c7c', { side: THREE.DoubleSide })));
  return g;
}

const BUILDERS: Record<ItemKind, () => THREE.Group> = {
  fireTruck,
  carrier,
  digger,
  bus,
  person,
  boat,
};

export function buildItem(kind: ItemKind): THREE.Group {
  const g = BUILDERS[kind]();
  // 比真实比例大一点，小朋友看得清、点得准
  g.scale.setScalar(kind === 'person' ? 1.6 : 1.2);
  g.traverse((o) => {
    o.castShadow = true;
  });
  return g;
}

/** 楼顶的尖顶（磁力片三角形） */
export function roof(color: string): THREE.Mesh {
  const geo = new THREE.ConeGeometry(0.62, 0.75, 4);
  geo.rotateY(Math.PI / 4);
  geo.translate(0, 0.375, 0);
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.85, roughness: 0.3 }),
  );
  m.castShadow = true;
  return m;
}

/** 台北 101 的塔尖 */
export function spire(): THREE.Group {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.6, 8), mat('#7fc8d8'));
  base.position.y = 0.3;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 2.4, 6), mat('#d8e4ea'));
  pole.position.y = 1.8;
  g.add(base, pole);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** 远处海里的火山 */
export function volcano(): THREE.Group {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 3.2, 3.4, 9), mat('#8a5a3c'));
  cone.position.y = 1.7;
  const lava = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 0.9, 0.15, 9),
    mat('#ff7a2e', { emissive: '#ff5a1e', emissiveIntensity: 0.8 }),
  );
  lava.position.y = 3.42;
  g.add(cone, lava);
  return g;
}

export function meteor(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9, 0),
    mat('#5a4038', { emissive: '#ff6a1e', emissiveIntensity: 0.9 }),
  );
}
