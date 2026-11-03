// 種子亂數 (audio-design 1 原則 2)：純函式、確定性；音訊的純邏輯一律用這裡，不用 Math.random

/** mulberry32：32 位元種子 → [0, 1) 的序列產生器 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字串 / 數字組合 → 32 位元種子 (FNV-1a) */
export function hashSeed(...parts: ReadonlyArray<string | number>): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join('|')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
