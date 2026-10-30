// 空間音效與冷卻規則 (純函式，無 Web Audio 依賴，可單元測試)
// 距離衰減採「線性」：近距離 NEAR_RADIUS 內滿音量，之後線性降至最大可聞距離為 0。
// 不用反平方：它沒有自然的零點，超出範圍仍需硬切；線性則與「超過距離完全不播」一致，行為可預期。

export interface Vec3Like { x: number; y: number; z: number }

// 受距離與冷卻管理的音效 (NPC／場景發出者)
export type SpatialSoundId =
  | 'whistle' | 'bell' | 'dogBark' | 'punch' | 'slash' | 'batHit'
  | 'dodge' | 'fallHit' | 'badminton' | 'bossBite' | 'bugChirp';

// 最大可聞距離 (公尺)：超過即完全不播放、不建立 audio node
export const SOUND_RANGE: Record<SpatialSoundId, number> = {
  whistle: 35,
  bell: 20,
  dogBark: 25,
  bossBite: 25,
  punch: 15,
  slash: 15,
  batHit: 15,
  dodge: 15,
  fallHit: 15,
  badminton: 15,
  bugChirp: 12
};

// 全域冷卻 (秒)：同一音效不論來源，間隔內最多播放一次；未列出者不設冷卻
export const SOUND_COOLDOWN: Partial<Record<SpatialSoundId, number>> = {
  whistle: 2.5,
  bell: 1.5,
  dogBark: 1.2,
  dodge: 0.25
};

// 近距離滿音量半徑 (公尺)
export const NEAR_RADIUS = 3;
// 低於此增益視為聽不到，直接不播
export const MIN_AUDIBLE_GAIN = 0.04;

export function distanceBetween(a: Vec3Like, b: Vec3Like): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// 依距離回傳 0~1 音量倍率；超出 maxDist 或低於可聞門檻回傳 0
export function distanceGain(dist: number, maxDist: number): number {
  if (dist >= maxDist) return 0;
  if (dist <= NEAR_RADIUS) return 1;
  const g = (maxDist - dist) / (maxDist - NEAR_RADIUS);
  return g < MIN_AUDIBLE_GAIN ? 0 : g;
}

// 是否已過冷卻 (last 為上次播放時間，從未播放傳 -Infinity)
export function cooldownReady(last: number, now: number, cooldown: number): boolean {
  return now - last >= cooldown;
}
