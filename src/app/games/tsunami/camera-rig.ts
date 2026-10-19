import * as THREE from 'three';

/** 镜头仰角（弧度） */
const ELEVATION = 0.6;
/** 画面下方要给工具栏留位置：视野往下多留一截 */
const TOP = 1.02;
const BOTTOM = 1.3;
const MIN_HALF = 3;
const MAX_HALF = 34;

export interface View {
  target: THREE.Vector3;
  half: number;
}

/**
 * 正交等距镜头。平时由孩子拖动、捏合控制；海啸的时候切到"演出"模式，自动拉远把整个场面框进来，
 * 演完再平滑地回到孩子原来的位置。
 */
export class CameraRig {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
  private readonly user: View = { target: new THREE.Vector3(), half: 10 };
  private readonly current: View = { target: new THREE.Vector3(), half: 10 };
  private cine: View | null = null;
  private rot = 0;
  private az = Math.PI / 4;
  private aspect = 1;
  private heightPx = 1;
  /** 可以拖到多远（岛的范围再往外一点） */
  private bounds = new THREE.Box3();

  setViewport(widthPx: number, heightPx: number): void {
    this.aspect = widthPx / Math.max(1, heightPx);
    this.heightPx = Math.max(1, heightPx);
  }

  setBounds(box: THREE.Box3): void {
    this.bounds.copy(box);
  }

  rotate(step: number): void {
    this.rot += step;
  }

  /** 把这些点都框进画面，作为孩子的视角（一进游戏时用） */
  fitUser(points: THREE.Vector3[]): void {
    Object.assign(this.user, this.fit(points));
    this.user.target = this.user.target.clone();
    this.current.target.copy(this.user.target);
    this.current.half = this.user.half;
  }

  /** 演出模式：自动框住这些点；传 null 回到孩子的视角 */
  setCinematic(points: THREE.Vector3[] | null): void {
    this.cine = points ? this.fit(points) : null;
  }

  /** 拖动：手指在屏幕上移动了多少像素 */
  pan(dxPx: number, dyPx: number): void {
    if (this.cine) return;
    const k = ((TOP + BOTTOM) * this.user.half) / this.heightPx;
    const { x, y } = this.axes();
    this.user.target.addScaledVector(x, -dxPx * k).addScaledVector(y, dyPx * k);
    this.clamp();
  }

  /** 捏合：factor > 1 拉近 */
  zoom(factor: number): void {
    if (this.cine) return;
    this.user.half = THREE.MathUtils.clamp(this.user.half / factor, MIN_HALF, MAX_HALF);
  }

  update(shake: number): void {
    this.az += (Math.PI / 4 + (this.rot * Math.PI) / 2 - this.az) * 0.12;
    const goal = this.cine ?? this.user;
    const k = this.cine ? 0.06 : 0.35;
    this.current.target.lerp(goal.target, k);
    this.current.half += (goal.half - this.current.half) * k;

    const h = this.current.half;
    const w = (h * (TOP + BOTTOM) * this.aspect) / 2;
    Object.assign(this.camera, { left: -w, right: w, top: h * TOP, bottom: -h * BOTTOM });
    this.camera.updateProjectionMatrix();
    const jitter = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() - 0.5,
      Math.random() - 0.5,
    ).multiplyScalar(0.25 * Math.min(1, shake));
    const look = this.current.target.clone().add(jitter);
    this.camera.position.copy(look).addScaledVector(this.viewDir(), 80);
    this.camera.lookAt(look);
  }

  private viewDir(): THREE.Vector3 {
    return new THREE.Vector3(
      Math.cos(ELEVATION) * Math.sin(this.az),
      Math.sin(ELEVATION),
      Math.cos(ELEVATION) * Math.cos(this.az),
    );
  }

  /** 画面的右方向和上方向（世界坐标） */
  private axes(): { x: THREE.Vector3; y: THREE.Vector3 } {
    const v = this.viewDir();
    const x = new THREE.Vector3(0, 1, 0).cross(v).normalize();
    return { x, y: v.clone().cross(x) };
  }

  private fit(points: THREE.Vector3[]): View {
    // 用最终的旋转角度来算，转视角时不会框错
    const az = Math.PI / 4 + (this.rot * Math.PI) / 2;
    const saved = this.az;
    this.az = az;
    const { x, y } = this.axes();
    this.az = saved;
    let [minX, maxX, minY, maxY] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const p of points) {
      minX = Math.min(minX, p.dot(x));
      maxX = Math.max(maxX, p.dot(x));
      minY = Math.min(minY, p.dot(y));
      maxY = Math.max(maxY, p.dot(y));
    }
    // 以这些点的中心为准：上面刚好放下，下面多出来的部分正好给工具栏
    const halfH = (maxY - minY) / 2 / TOP;
    const halfW = (maxX - minX) / 2 / (((TOP + BOTTOM) / 2) * this.aspect);
    const half = THREE.MathUtils.clamp(Math.max(halfH, halfW) * 1.1 + 0.3, MIN_HALF, 60);
    const target = x.multiplyScalar((minX + maxX) / 2).addScaledVector(y, (minY + maxY) / 2);
    return { target, half };
  }

  private clamp(): void {
    const t = this.user.target;
    const b = this.bounds;
    t.x = THREE.MathUtils.clamp(t.x, b.min.x, b.max.x);
    t.y = THREE.MathUtils.clamp(t.y, b.min.y, b.max.y);
    t.z = THREE.MathUtils.clamp(t.z, b.min.z, b.max.z);
  }
}
