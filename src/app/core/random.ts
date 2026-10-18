export const rand = (min: number, max: number): number => Math.random() * (max - min) + min;

/** 包含 min 和 max 的随机整数 */
export const randInt = (min: number, max: number): number => Math.floor(rand(min, max + 1));

export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
