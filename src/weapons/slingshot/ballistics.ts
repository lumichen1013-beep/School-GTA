import { rangeDamageMul } from '../projectiles/collide';

// 彈弓彈道與傷害曲線 (純函式、零配置；控制器、裝備頁秒傷與測試共用)。
// 蓄力 t (秒)：t < CHARGE_MIN 不可射；CHARGE_MIN 起傷害 40%、彈速 40 m/s，線性增加到 CHARGE_FULL 滿蓄力 100%、70 m/s。

export const SLING = {
  damage: 60,
  chargeMin: 0.25,    // 起可射 (秒)
  chargeFull: 0.7,    // 滿蓄力 (秒)
  minFrac: 0.4,       // 最小蓄力傷害比例
  speedMin: 40,       // 最小蓄力彈速 (m/s)
  speedMax: 70,       // 滿蓄力彈速
  gravity: 6,         // 石子重力 (m/s²)；與 ProjectileSystem KIND_GRAVITY[石子] 一致
  range: 50,          // 射程 (m)
  falloffNear: 30,    // 此距離內全額傷害
  falloffMin: 0.7,    // 射程盡頭傷害比例 (30m → 50m 線性衰減)
  headshotMul: 1.6,   // 爆頭傷害倍率
  reload: 0.35,       // 上彈 (秒)：放手發射後不可再蓄力
  afterShot: 0.1,     // 秒傷估算的接後緩衝 (秒)
  zoomDesktop: 2,     // 開鏡倍率
  zoomTouch: 1.5,
  steadyTime: 0.25,   // 手機：滿蓄力後穩住多久準星縮小並移到頭部 (秒)
  headHitStop: 0.04,  // 爆頭命中停格 (真實秒)
  projectileRadius: 0.05
} as const;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// 蓄力是否已可射
export function canRelease(t: number): boolean {
  return t >= SLING.chargeMin;
}

// 蓄力進度 0..1：CHARGE_MIN → CHARGE_FULL (傷害 / 彈速曲線的參數)
export function chargeProgress(t: number): number {
  return clamp01((t - SLING.chargeMin) / (SLING.chargeFull - SLING.chargeMin));
}

// 蓄力視覺比例 0..1：0 → CHARGE_FULL (姿勢 / 開鏡 / 橡皮筋拉伸)
export function chargeRatio(t: number): number {
  return clamp01(t / SLING.chargeFull);
}

// 蓄力傷害比例：未達最小蓄力為 0；之後 40% → 100%
export function chargeDamageFrac(t: number): number {
  return canRelease(t) ? SLING.minFrac + (1 - SLING.minFrac) * chargeProgress(t) : 0;
}

// 蓄力彈速 (m/s)：40 → 70
export function chargeSpeed(t: number): number {
  return SLING.speedMin + (SLING.speedMax - SLING.speedMin) * chargeProgress(t);
}

// 射程傷害倍率：30m 內全額，30 → 50m 線性衰減到 70%，之後維持 70%
export function slingRangeMul(dist: number): number {
  return rangeDamageMul(dist, SLING.falloffNear, SLING.range, SLING.falloffMin);
}

// 單發期望傷害 (未四捨五入)：基礎傷害 × 蓄力比例 × 射程倍率 × (爆頭 ? 1.6 : 1)
export function slingDamage(t: number, dist: number, headshot: boolean): number {
  return SLING.damage * chargeDamageFrac(t) * slingRangeMul(dist) * (headshot ? SLING.headshotMul : 1);
}

// 水平射出 (仰角 0) 飛行 dist 公尺的下墜量 (m)：0.5 g (dist / v)²
export function flatDrop(speed: number, dist: number): number {
  const t = dist / speed;
  return 0.5 * SLING.gravity * t * t;
}

// 補償下墜的出手仰角 (弧度，低弧解)：初速 speed、水平距離 dist、目標比出手點高 dh (m)。
// tanθ = (v² − √(v⁴ − g(g d² + 2 dh v²))) / (g d)；超出射程 (無解) 回傳 45°
export function solvePitch(speed: number, dist: number, dh: number): number {
  const g = SLING.gravity;
  if (dist < 1e-3) return Math.atan2(dh, 1);
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * dist * dist + 2 * dh * v2);
  if (disc < 0) return Math.PI / 4;
  return Math.atan((v2 - Math.sqrt(disc)) / (g * dist));
}

// 單發出手到命中的飛行秒數 (給定仰角)：dist / (v cosθ)
export function flightTime(speed: number, dist: number, pitch: number): number {
  return dist / (speed * Math.cos(pitch));
}

// 秒傷估算 (裝備頁，遠程口徑)：單發期望傷害 ÷ (蓄力 + 上彈 + 接後緩衝)，不含飛行時間
export function slingDps(chargeTime: number, dist: number, headshot: boolean): number {
  return slingDamage(chargeTime, dist, headshot) / (chargeTime + SLING.reload + SLING.afterShot);
}

// 裝備頁秒傷情境：滿蓄力 / 爆頭 / 點射 (蓄力 0.5 秒連發)
export const SLING_SNAP_CHARGE = 0.5;
