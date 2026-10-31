// 空間音效與冷卻規則 (純函式，無 Web Audio 依賴，可單元測試)
// 距離衰減採「線性」：近距離 NEAR_RADIUS 內滿音量，之後線性降至最大可聞距離為 0。
// 不用反平方：它沒有自然的零點，超出範圍仍需硬切；線性則與「超過距離完全不播」一致，行為可預期。

export interface Vec3Like { x: number; y: number; z: number }

// 受距離與冷卻管理的音效 (所有世界內發生的音效；僅 BGM 與純 HUD 回饋 playAlert／playFanfare／playCashRegister 例外)
export type SpatialSoundId =
  | 'whistle' | 'bell' | 'dogBark' | 'punch' | 'slash' | 'batHit'
  | 'dodge' | 'dodgePractice' | 'fallHit' | 'badminton' | 'bossBite' | 'bugChirp'
  | 'jump' | 'schoolBell' | 'broadcast' | 'elevator' | 'swish' | 'rimHit' | 'dribble'
  | 'eatFood' | 'execution' | 'splash' | 'poisonTick' | 'coinToss' | 'thunder'
  // 投射物 (共用投射物系統)：出手破風、球 / 石子命中點、接球
  | 'throwWhoosh' | 'ballHit' | 'stoneHit' | 'ballCatch'
  // 籃球氣功彈：出手「啾」、命中衝擊波
  | 'kiShot' | 'kiImpact'
  // 綁帶捆書：甩鞭脆響、書堆悶響
  | 'whipCrack' | 'bookThud'
  // 彈弓：拉弦吱嘎、放弦彈響、爆頭叮聲
  | 'slingDraw' | 'slingTwang' | 'headshotDing'
  // 操場踢足球雙人組：腳面觸球悶響
  | 'soccerKick'
  // 世界 Boss 花劍客：細劍突刺 (細劍武器共用)、高帽旋轉、花瓣綻放、終幕鐘聲、結界嗡鳴
  | 'rapierThrust' | 'hatSpin' | 'petalBloom' | 'finaleChime' | 'barrierHum';

// 最大可聞距離 (公尺)：超過即完全不播放、不建立 audio node。小動作小、全校性事件大
export const SOUND_RANGE: Record<SpatialSoundId, number> = {
  whistle: 35,
  bell: 20,
  dogBark: 25,
  bossBite: 25,
  punch: 15,
  slash: 15,
  batHit: 15,
  dodge: 15,
  dodgePractice: 12,
  fallHit: 15,
  badminton: 15,
  bugChirp: 12,
  jump: 10,
  eatFood: 8,
  poisonTick: 8,
  coinToss: 15,
  dribble: 15,
  swish: 20,
  rimHit: 25,
  splash: 20,
  elevator: 25,
  execution: 30,
  schoolBell: 120,
  broadcast: 100,
  throwWhoosh: 10,
  ballHit: 15,
  stoneHit: 15,
  ballCatch: 8,
  kiShot: 12,
  kiImpact: 18,
  whipCrack: 20,
  bookThud: 15,
  slingDraw: 8,
  slingTwang: 15,
  headshotDing: 20,
  soccerKick: 12,
  rapierThrust: 25,
  hatSpin: 25,
  petalBloom: 25,
  finaleChime: 40,
  barrierHum: 40,
  thunder: 1000 // 天空全域事件：以校園中心計距離，任何世界位置皆接近滿音量
};

// 音量倍率 (乘在距離衰減上)：未列出者為 1。閃身步老師演武為背景練習聲，約實戰 55%
export const SOUND_VOLUME: Partial<Record<SpatialSoundId, number>> = {
  dodgePractice: 0.55,
  soccerKick: 0.6
};

// 全域冷卻 (秒)：同一音效不論來源，間隔內最多播放一次；未列出者不設冷卻
export const SOUND_COOLDOWN: Partial<Record<SpatialSoundId, number>> = {
  whistle: 2.5,
  bell: 1.5,
  dogBark: 1.2,
  dodge: 0.25,
  headshotDing: 0.2,
  soccerKick: 0.15,
  hatSpin: 0.3,
  petalBloom: 0.08
};

// 無明確發聲物件的全域／場景音效定點位置 (校園中心；校鐘、廣播、雷聲等大範圍事件以此計距離)
export const CAMPUS_CENTER: Vec3Like = { x: 0, y: 0, z: 0 };

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

// 音效最終音量倍率 (距離衰減 × 音效固定倍率)；0 表示不播放
export function soundGain(id: SpatialSoundId, dist: number): number {
  return distanceGain(dist, SOUND_RANGE[id]) * (SOUND_VOLUME[id] ?? 1);
}

// 是否已過冷卻 (last 為上次播放時間，從未播放傳 -Infinity)
export function cooldownReady(last: number, now: number, cooldown: number): boolean {
  return now - last >= cooldown;
}
