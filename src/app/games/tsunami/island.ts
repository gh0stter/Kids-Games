/**
 * 随机生成小岛地图：每一行是一个字符串，L 陆地，W 小河，. 海。
 * 用一张粗糙的随机网格做"噪声"，让椭圆的海岸线弯弯曲曲；大多数时候再加一条弯弯的小河。
 */
const rand = (a: number, b: number): number => a + Math.random() * (b - a);
const randInt = (a: number, b: number): number => Math.floor(rand(a, b + 1));

/** 粗网格上的随机值，双线性插值成平滑的起伏 */
function noise(cells: number): (x: number, y: number) => number {
  const g = Array.from({ length: cells + 1 }, () => Array.from({ length: cells + 1 }, Math.random));
  return (x, y) => {
    const fx = x * cells;
    const fy = y * cells;
    const ix = Math.min(cells - 1, Math.floor(fx));
    const iy = Math.min(cells - 1, Math.floor(fy));
    const tx = fx - ix;
    const ty = fy - iy;
    const top = g[iy][ix] * (1 - tx) + g[iy][ix + 1] * tx;
    const bottom = g[iy + 1][ix] * (1 - tx) + g[iy + 1][ix + 1] * tx;
    return top * (1 - ty) + bottom * ty;
  };
}

/** 只留下最大的一块陆地，海里的小湖填成陆地 */
function tidy(land: boolean[][]): void {
  const D = land.length;
  const W = land[0].length;
  const seen = land.map((r) => r.map(() => -1));
  const sizes: number[] = [];
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      if (!land[z][x] || seen[z][x] >= 0) continue;
      const id = sizes.length;
      let size = 0;
      const stack = [[x, z]];
      seen[z][x] = id;
      while (stack.length) {
        const [cx, cz] = stack.pop()!;
        size++;
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (land[nz]?.[nx] && seen[nz][nx] < 0) {
            seen[nz][nx] = id;
            stack.push([nx, nz]);
          }
        }
      }
      sizes.push(size);
    }
  }
  const biggest = sizes.indexOf(Math.max(...sizes));
  // 从边上能流到的海才是海，其它的"湖"填平
  const sea = land.map((r) => r.map(() => false));
  const stack: number[][] = [];
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++)
      if (z === 0 || x === 0 || z === D - 1 || x === W - 1) stack.push([x, z]);
  while (stack.length) {
    const [x, z] = stack.pop()!;
    if (x < 0 || z < 0 || x >= W || z >= D || sea[z][x] || seen[z][x] === biggest) continue;
    sea[z][x] = true;
    stack.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]);
  }
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) land[z][x] = !sea[z][x];
}

export function generateIsland(): string[] {
  for (;;) {
    const W = randInt(18, 24);
    const D = randInt(14, 18);
    const n = noise(4);
    const land = Array.from({ length: D }, (_, z) =>
      Array.from({ length: W }, (_, x) => {
        const nx = ((x + 0.5) / W) * 2 - 1;
        const nz = ((z + 0.5) / D) * 2 - 1;
        const d = Math.hypot(nx, nz);
        return d + (n((x + 0.5) / W, (z + 0.5) / D) - 0.5) * 0.8 < 0.9;
      }),
    );
    tidy(land);
    const count = land.flat().filter(Boolean).length;
    if (count < W * D * 0.45) continue;

    const rows: string[][] = land.map((r) => r.map((l) => (l ? 'L' : '.')));
    // 小河：沿长边的垂直方向弯弯曲曲地穿过去
    if (Math.random() < 0.75) {
      const alongZ = W >= D;
      const across = alongZ ? W : D;
      const along = alongZ ? D : W;
      let pos = randInt(Math.floor(across * 0.3), Math.ceil(across * 0.7));
      for (let i = 0; i < along; i++) {
        const prev = pos;
        pos = Math.max(1, Math.min(across - 2, pos + [-1, 0, 0, 1][randInt(0, 3)]));
        // 拐弯时把上一格的位置也挖开，河水上下连在一起，不会只是斜着碰到
        const cells = [Math.min(prev, pos), Math.max(prev, pos)];
        if (Math.random() < 0.25) cells.push(cells[1] + 1);
        for (const p of new Set(cells)) {
          const [x, z] = alongZ ? [p, i] : [i, p];
          if (rows[z][x] === 'L') rows[z][x] = 'W';
        }
      }
    }
    return trim(rows.map((r) => r.join('')));
  }
}

/** 去掉四周整行整列都是海的部分，让岛居中 */
function trim(rows: string[]): string[] {
  const empty = (s: string): boolean => !/[LW]/.test(s);
  while (rows.length && empty(rows[0])) rows.shift();
  while (rows.length && empty(rows[rows.length - 1])) rows.pop();
  const cols = (i: number): string => rows.map((r) => r[i]).join('');
  while (rows[0].length && empty(cols(0))) rows = rows.map((r) => r.slice(1));
  while (rows[0].length && empty(cols(rows[0].length - 1))) rows = rows.map((r) => r.slice(0, -1));
  return rows;
}
