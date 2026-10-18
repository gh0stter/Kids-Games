import * as THREE from 'three';

/**
 * 浪的横截面，从后往前沿着水面走一圈：
 * 后面的缓坡 → 浪尖 → 往前卷出去的浪头 → 卷回来 → 浪面 → 浪脚。
 * u 沿前进方向（0 是浪脚，单位是浪的"宽度" L），v 是高度（0 是淹过的水面，1 是浪高）。
 */
const PROFILE: { u: number; v: number; color: string }[] = [
  { u: -1.7, v: 0, color: '#2a86c0' },
  { u: -1.2, v: 0.28, color: '#2f95cc' },
  { u: -0.75, v: 0.66, color: '#3aa8dc' },
  { u: -0.4, v: 0.92, color: '#4cb9e6' },
  { u: -0.1, v: 1.04, color: '#7fd0f0' },
  // 浪头往前卷出去，卷边是白色的泡沫
  { u: 0.18, v: 1.06, color: '#d8f6ff' },
  { u: 0.42, v: 0.95, color: '#ffffff' },
  { u: 0.52, v: 0.76, color: '#f2fcff' },
  // 卷回到浪头底下
  { u: 0.42, v: 0.62, color: '#a8e6f8' },
  { u: 0.24, v: 0.58, color: '#5cc4ec' },
  { u: 0.1, v: 0.46, color: '#3aa8dc' },
  { u: 0.03, v: 0.25, color: '#2f9fd0' },
  { u: 0, v: 0, color: '#2a92c8' },
];
/** 浪头卷边最前面那一点，用来喷水花 */
export const LIP = { u: 0.45, v: 0.97 };

export interface WaveSample {
  /** 宽度方向的位置（排为单位） */
  w: number;
  /** 浪脚走到哪了 */
  front: number;
  /** 浪高（世界单位，从淹过的水面算起） */
  height: number;
}

/** 一整道连续的浪：每个宽度采样点有自己的前进位置和高度，所以被楼挡住的地方会停下，旁边的继续走 */
export class WaveMesh {
  readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly cols: number;
  private readonly rows = PROFILE.length + 1;

  constructor(samples: number) {
    this.cols = samples;
    const n = samples * this.rows;
    this.positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const tail = new THREE.Color(PROFILE[0].color);
    const c = new THREE.Color();
    for (let j = 0; j < samples; j++) {
      for (let i = 0; i < this.rows; i++) {
        c.set(i === 0 ? tail : PROFILE[i - 1].color);
        colors.set([c.r, c.g, c.b], (j * this.rows + i) * 3);
      }
    }
    const index: number[] = [];
    for (let j = 0; j < samples - 1; j++) {
      for (let i = 0; i < this.rows - 1; i++) {
        const a = j * this.rows + i;
        const b = a + this.rows;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(index);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        roughness: 0.15,
        side: THREE.DoubleSide,
        // 不让黄昏的暖光和色调映射把水照成米色
        toneMapped: false,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  /**
   * @param toWorld 海浪坐标（宽度 w，前进 s，高度 y）→ 世界坐标
   * @param start 淹水从哪里开始（浪出发的地方）
   * @param base 淹过的水面高度
   * @param len 浪的"宽度" L（世界单位）
   */
  update(
    samples: WaveSample[],
    toWorld: (w: number, s: number, y: number) => THREE.Vector3,
    start: number,
    base: number,
    len: number,
    time: number,
  ): void {
    for (let j = 0; j < this.cols; j++) {
      const { w, front, height } = samples[j];
      // 浪尖一高一低地起伏，看起来像水
      const wobble = 1 + 0.06 * Math.sin(w * 1.3 + time * 3) + 0.03 * Math.sin(w * 3.1 - time * 5);
      for (let i = 0; i < this.rows; i++) {
        let s: number;
        let y: number;
        if (i === 0) {
          s = Math.min(start, front - 1.7 * len);
          y = base;
        } else {
          const p = PROFILE[i - 1];
          s = front + p.u * len;
          y = base + p.v * height * (p.v > 0.5 ? wobble : 1);
        }
        const v = toWorld(w, s, y);
        this.positions.set([v.x, v.y, v.z], (j * this.rows + i) * 3);
      }
    }
    const geo = this.mesh.geometry;
    geo.attributes['position'].needsUpdate = true;
    geo.computeVertexNormals();
  }
}
