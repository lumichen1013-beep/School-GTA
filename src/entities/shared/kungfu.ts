import * as THREE from 'three';

/**
 * 功夫風格攻擊動作：每招以少量關鍵影格描述全身姿勢 (根節點扭腰/俯仰/側傾/升降 + 四肢旋轉)，
 * 依「預備 → 出招 → 延展 → 收招」各段緩動插值；玩家與人型 NPC 共用。
 *
 * 座標慣例 (角色面向 +Z，持武器手臂 rightArm 位於 +X 側)：
 *  tw 扭腰：正值使 +X 肩向後 (身體轉向 +X 側)；ln 俯仰：正值前傾；rl 側傾：正值頭部偏向 -X；h 升降 (m)
 *  手臂 x 負值向前上舉、rightArm z 正值向外展 (leftArm 外展為負)；腿 x 負值向前踢、rightLeg z 正值向外 (leftLeg 為負)
 *  四肢原本以中心為軸，出招期間自動補償位移改以肩/髖為軸旋轉 (收招淡出時還原)
 */

const CH = 16; // tw, ln, rl, h, la(xyz), ra(xyz), ll(xyz), rr(xyz)
const STRIDE = CH + 2; // t, ease, 16 channels
const TAIL = 0.16; // 收招後淡出回一般動作的秒數
export const ARM_HALF = 0.325;
const LEG_HALF = 0.35;
const TWO_PI = Math.PI * 2;

// 緩動：0 平滑 (起訖皆緩)、1 加速 (出招，接觸瞬間最快)、2 減速 (延展)、3 線性
export const E_SMOOTH = 0;
export const E_IN = 1;
export const E_OUT = 2;
export const E_LINEAR = 3;

type V3 = readonly [number, number, number];
export interface PoseSpec { tw?: number; ln?: number; rl?: number; h?: number; la?: V3; ra?: V3; ll?: V3; rr?: V3 }
export type KeySpec = readonly [t: number, ease: number, pose: PoseSpec];

// 揮擊拖尾錨點：W 手持武器 (右手)、WL 左手武器 (雙持)、RA 右拳、RL 右腿、LL 左腿
export type TrailLimb = 'W' | 'WL' | 'RA' | 'RL' | 'LL';
// 終結技特效類型：SLAM 下劈地裂、SPIN 旋身衝擊環、DASH 突進斬 (終點雙圈環 + 羽毛，路徑斬痕由戰鬥系統另出)
export type FinisherFx = 'SLAM' | 'SPIN' | 'DASH';
// 命中斬痕特效類型 (由斬痕特效系統實作)：LINE 單道光痕、X 交叉光痕
export type SlashFx = 'LINE' | 'X';

// 招式突進：出招進度 from → to (占全長比例) 期間沿面向等速前衝 dist 公尺 (位移交由一般碰撞處理，遇牆即停)
export interface KfLunge {
  readonly dist: number;
  readonly from: number;
  readonly to: number;
}

// 群攻範圍 (終結技或帶 aoe 的非終結技)：offset / radius / len / halfWidth 皆為攻擊距離 (getWeaponReach) 倍率
// shape：未設或 'CIRCLE' 為圓形 (center 決定圓心)；'PATH' 為沿本招突進路徑 (突進起點 → 目前位置) 的矩形 / 膠囊，
// radius 為半寬 (攻擊距離倍率)、長度取實際突進距離 (撞牆時較短)，center / offset 不使用；
// 'FAN' 為以 center 為頂點、沿面向的扇形 (radius + halfAngle)；'LINE' 為自玩家位置沿面向的長條 (len + halfWidth，center / offset 不使用)
export type AoeShape = 'CIRCLE' | 'PATH' | 'FAN' | 'LINE';
export interface FinisherAoe {
  readonly shape?: AoeShape;
  readonly center: 'SELF' | 'FRONT'; // 以玩家為圓心 / 以面前衝擊點為圓心
  readonly offset: number; // FRONT 衝擊點前移距離
  readonly radius: number;
  readonly halfAngle?: number; // FAN 半角 (弧度)
  readonly len?: number; // LINE 長度 (攻擊距離倍率)
  readonly halfWidth?: number; // LINE 半寬 (攻擊距離倍率)
  readonly max: number; // 最多命中人數 (上限 8)
  readonly falloff: number; // 擊退距離衰減：× (1 − falloff · d / radius)
  readonly shake: number; // 命中鏡頭震動
  readonly hitStop: number; // 命中停格 (真實秒)
  readonly hitStopMulti: number; // 命中 ≥2 人停格
  readonly missShake: number; // 揮空鏡頭震動 (0 不震、不停格)
  // 黃金雷霆棒覆寫值
  readonly maxGold?: number;
  readonly shakeGold?: number;
  readonly hitStopGold?: number;
}

// 發射型招式 (遠程回收武器，如籃球)：命中時間點不做近戰判定而是發射彈體
// 籃球氣功彈 (皆為直線高速光束)：BALL_CHEST 雙掌推傳、BALL_SNAP 單掌快傳、BALL_BLAST 灌籃氣功砲 (終結技)；SLING 彈弓放弦 (石子)
export type ProjectileMoveKind = 'BALL_CHEST' | 'BALL_SNAP' | 'BALL_BLAST' | 'SLING';

export interface KfMove {
  readonly name: string;
  readonly dur: number; // 秒
  readonly strike: number; // 命中判定時間點 (占全長比例)
  readonly cancel: number; // 可接續下一招的時間點 (占全長比例)
  readonly reach: number; // 攻擊距離倍率
  readonly arc: number; // 命中方向門檻 (面向與目標方向內積下限，-1 為全方位)
  readonly dmg: number; // 傷害倍率
  readonly knock: number; // 擊退倍率
  readonly finisher: boolean;
  // 額外命中時間點 (占全長比例，多段招式如戒尺連打；第一段為 strike)
  readonly extraStrikes: readonly number[];
  // 揮擊拖尾區段 (占全長比例；預設為命中點前後兩個關鍵影格) 與錨點
  readonly trail: readonly [number, number];
  readonly trailLimb: TrailLimb;
  // 第二條拖尾區段與錨點 (雙持左手等；null 為不出)
  readonly trail2: readonly [number, number] | null;
  readonly trailLimb2: TrailLimb;
  // 額外命中傷害倍率 (與 extraStrikes 依序對應；未設時沿用 dmg)
  readonly extraDmg: readonly number[];
  readonly lunge: KfLunge | null;
  // 蓄力區段 (占全長比例，null 為無)：武器拍尖蓄能發光並出向內收的光環
  readonly charge: readonly [number, number] | null;
  readonly hitShake: number; // 一般命中鏡頭震動 (0 不震；終結技主擊另有固定震動)
  readonly slashFx: SlashFx | null;
  readonly aoe: FinisherAoe | null; // 終結技群攻 (null 為單體判定)
  readonly fx: FinisherFx | null;
  readonly projectile: ProjectileMoveKind | null; // 發射型招式 (非 null 時命中時間點改為發射彈體)
  readonly keys: Float32Array;
  readonly count: number;
}

export interface MoveOpts {
  dur: number; strike: number; cancel?: number; reach?: number; arc?: number; dmg?: number; knock?: number; finisher?: boolean; extraStrikes?: readonly number[];
  trail?: readonly [number, number]; trailLimb?: TrailLimb; aoe?: FinisherAoe; fx?: FinisherFx;
  trail2?: readonly [number, number]; trailLimb2?: TrailLimb; extraDmg?: readonly number[]; lunge?: KfLunge; charge?: readonly [number, number]; hitShake?: number; slashFx?: SlashFx;
  projectile?: ProjectileMoveKind;
}

// 預設拖尾區段：命中點前一個關鍵影格 → 後一個關鍵影格
function defaultTrail(strike: number, keys: readonly KeySpec[]): [number, number] {
  let from = 0;
  let to = 1;
  for (const [t] of keys) {
    if (t < strike) from = t;
    else if (t > strike) { to = t; break; }
  }
  return [from, to];
}

export function defineMove(name: string, o: MoveOpts, keys: readonly KeySpec[]): KfMove {
  const data = new Float32Array(keys.length * STRIDE);
  keys.forEach(([t, ease, p], i) => {
    const b = i * STRIDE;
    data[b] = t;
    data[b + 1] = ease;
    data[b + 2] = p.tw ?? 0;
    data[b + 3] = p.ln ?? 0;
    data[b + 4] = p.rl ?? 0;
    data[b + 5] = p.h ?? 0;
    const limbs = [p.la, p.ra, p.ll, p.rr];
    for (let l = 0; l < 4; l++) {
      const v = limbs[l];
      data[b + 6 + l * 3] = v ? v[0] : 0;
      data[b + 7 + l * 3] = v ? v[1] : 0;
      data[b + 8 + l * 3] = v ? v[2] : 0;
    }
  });
  return {
    name,
    dur: o.dur,
    strike: o.strike,
    cancel: o.cancel ?? Math.min(1, o.strike + 0.22),
    reach: o.reach ?? 1,
    arc: o.arc ?? 0,
    dmg: o.dmg ?? 1,
    knock: o.knock ?? 1,
    finisher: o.finisher ?? false,
    extraStrikes: o.extraStrikes ?? [],
    trail: o.trail ?? defaultTrail(o.strike, keys),
    trailLimb: o.trailLimb ?? 'RA',
    trail2: o.trail2 ?? null,
    trailLimb2: o.trailLimb2 ?? 'WL',
    extraDmg: o.extraDmg ?? [],
    lunge: o.lunge ?? null,
    charge: o.charge ?? null,
    hitShake: o.hitShake ?? 0,
    slashFx: o.slashFx ?? null,
    aoe: o.aoe ?? null,
    fx: o.fx ?? null,
    projectile: o.projectile ?? null,
    keys: data,
    count: keys.length
  };
}

export const REST: PoseSpec = {};

// ───────────── 玩家：徒手 ─────────────
// 1 弓步衝拳：沉身扭腰蓄勢 → 擰腰送肩直拳、另一拳收抱腰間
const FIST_1 = defineMove('弓步衝拳', { dur: 0.4, strike: 0.4, cancel: 0.62, trailLimb: 'RA', trail: [0.25, 0.68] }, [
  [0.25, E_SMOOTH, { tw: 0.55, ln: -0.04, h: -0.07, la: [-1.15, 0, 0.1], ra: [0.7, 0, 0.12], ll: [-0.5, 0, -0.06], rr: [0.42, 0, 0.06] }],
  [0.4, E_IN, { tw: -0.42, ln: 0.16, h: -0.12, la: [0.75, 0, -0.12], ra: [-1.58, 0, -0.14], ll: [-0.68, 0, -0.08], rr: [0.58, 0, 0.08] }],
  [0.68, E_OUT, { tw: -0.36, ln: 0.13, h: -0.11, la: [0.7, 0, -0.12], ra: [-1.5, 0, -0.12], ll: [-0.64, 0, -0.08], rr: [0.55, 0, 0.08] }],
  [1, E_SMOOTH, { ln: 0.02, la: [-0.2, 0, 0], ra: [-0.25, 0, 0] }]
]);
// 2 轉身鞭腿：扭身蓄力 → 後腿掄圓橫掃，雙臂展開平衡
const FIST_2 = defineMove('轉身鞭腿', { dur: 0.48, strike: 0.42, cancel: 0.62, reach: 1.15, arc: -0.2, trailLimb: 'RL', trail: [0.26, 0.66] }, [
  [0.26, E_SMOOTH, { tw: -1.05, ln: 0.02, h: -0.07, la: [-1.0, 0, -0.2], ra: [-0.5, 0, 0.35], ll: [-0.2, 0, -0.05], rr: [0.45, 0, 0.05] }],
  [0.42, E_IN, { tw: 0.2, ln: -0.3, rl: 0.3, h: 0.04, la: [-0.2, 0, -1.2], ra: [0.3, 0, 1.0], ll: [0.15, 0, -0.06], rr: [-1.95, 0, 0.35] }],
  [0.66, E_OUT, { tw: 0.85, ln: -0.22, rl: 0.22, h: 0.02, la: [-0.15, 0, -1.05], ra: [0.25, 0, 0.9], ll: [0.12, 0, -0.05], rr: [-1.5, 0, 0.25] }],
  [1, E_SMOOTH, { la: [-0.25, 0, 0], ra: [-0.2, 0, 0] }]
]);
// 3 騰空旋風腿：下沉蓄勢 → 騰空 360° 旋身甩腿 → 落地馬步亮相 (終結技)
const FIST_3 = defineMove('騰空旋風腿', {
  dur: 0.72, strike: 0.46, cancel: 0.74, reach: 1.2, arc: -1, dmg: 1.25, knock: 1.6, finisher: true, trailLimb: 'RL', trail: [0.3, 0.62], fx: 'SPIN',
  charge: [0.02, 0.18], // 下沉蓄勢：聚氣光環 (純視覺，不影響節奏)
  aoe: { center: 'SELF', offset: 0, radius: 1.3, max: 5, falloff: 0.35, shake: 0.4, hitStop: 0.08, hitStopMulti: 0.08, missShake: 0 }
}, [
  [0.16, E_SMOOTH, { tw: -0.55, ln: 0.14, h: -0.17, la: [0.75, 0, -0.15], ra: [0.75, 0, 0.15], ll: [-0.35, 0, -0.08], rr: [0.3, 0, 0.08] }],
  [0.3, E_OUT, { tw: 1.4, ln: -0.06, h: 0.38, la: [-2.6, 0, -0.3], ra: [-2.6, 0, 0.3], ll: [-1.0, 0, -0.05], rr: [0.25, 0, 0.05] }],
  [0.46, E_LINEAR, { tw: 4.71, ln: -0.08, rl: 0.32, h: 0.62, la: [-0.2, 0, -1.35], ra: [-0.2, 0, 1.35], ll: [-0.95, 0, -0.1], rr: [-0.25, 0, 1.35] }],
  [0.62, E_OUT, { tw: 5.9, ln: 0, rl: 0.1, h: 0.25, la: [-0.6, 0, -0.9], ra: [-0.6, 0, 0.9], ll: [-0.35, 0, -0.2], rr: [-0.2, 0, 0.35] }],
  [0.8, E_OUT, { tw: TWO_PI, ln: 0.06, h: -0.16, la: [0.65, 0, -0.15], ra: [-1.5, 0, -0.1], ll: [-0.05, 0, -0.5], rr: [-0.05, 0, 0.5] }],
  [1, E_SMOOTH, { tw: TWO_PI, ln: 0.02, la: [-0.15, 0, 0], ra: [-0.3, 0, 0] }]
]);

// ───────────── 玩家：球棒 ─────────────
// 1 橫掃千軍：腰身右轉蓄勢 → 帶動球棒自右向左大幅橫掃
const BAT_1 = defineMove('橫掃千軍', { dur: 0.48, strike: 0.42, cancel: 0.62, arc: -0.3, trailLimb: 'W', trail: [0.28, 0.68] }, [
  [0.28, E_SMOOTH, { tw: 1.3, ln: -0.06, rl: -0.08, h: -0.08, la: [-1.3, 0, 0.3], ra: [-0.15, 0, 1.45], ll: [-0.45, 0, -0.15], rr: [0.35, 0, 0.15] }],
  [0.42, E_IN, { tw: -0.5, ln: 0.12, rl: 0.1, h: -0.12, la: [0.5, 0, -0.6], ra: [-0.15, -0.25, 1.5], ll: [-0.55, 0, -0.2], rr: [0.45, 0, 0.2] }],
  [0.68, E_OUT, { tw: -1.3, ln: 0.1, rl: 0.14, h: -0.1, la: [0.6, 0, -0.8], ra: [-0.3, -0.45, 1.25], ll: [-0.5, 0, -0.2], rr: [0.45, 0, 0.2] }],
  [1, E_SMOOTH, { tw: -0.15, la: [-0.1, 0, 0], ra: [-0.2, 0, 0.15] }]
]);
// 2 回身反掃：轉身背對收棒 → 反手自左向右回掃
const BAT_2 = defineMove('回身反掃', { dur: 0.5, strike: 0.42, cancel: 0.62, arc: -0.3, trailLimb: 'W', trail: [0.26, 0.66] }, [
  [0.26, E_SMOOTH, { tw: -2.0, ln: 0.05, rl: 0.08, h: -0.08, la: [0.4, 0, -0.7], ra: [-1.25, 0.8, -0.55], ll: [0.35, 0, -0.2], rr: [-0.45, 0, 0.15] }],
  [0.42, E_IN, { tw: 0.35, ln: 0.1, rl: -0.12, h: -0.12, la: [0.5, 0, -1.0], ra: [-0.35, 0.2, 1.45], ll: [0.45, 0, -0.25], rr: [-0.5, 0, 0.2] }],
  [0.66, E_OUT, { tw: 1.2, ln: 0.08, rl: -0.14, h: -0.1, la: [0.45, 0, -0.9], ra: [-0.4, 0, 1.3], ll: [0.4, 0, -0.25], rr: [-0.45, 0, 0.2] }],
  [1, E_SMOOTH, { tw: 0.1, la: [-0.1, 0, 0], ra: [-0.2, 0, 0.15] }]
]);
// 3 躍起下劈：屈膝起跳、雙手舉棒過頂 → 落地沉身全力下劈 (終結技)
const BAT_3 = defineMove('躍起下劈', {
  dur: 0.66, strike: 0.5, cancel: 0.95, reach: 1.05, arc: 0.1, dmg: 1.1, knock: 1.5, finisher: true, trailLimb: 'W', trail: [0.36, 0.56], fx: 'SLAM',
  charge: [0.16, 0.36], // 起跳舉棒：聚氣光環 + 棒身蓄能發光 (純視覺)
  aoe: { center: 'FRONT', offset: 0.55, radius: 0.75, max: 6, falloff: 0.35, shake: 0.6, hitStop: 0.08, hitStopMulti: 0.1, missShake: 0.4, maxGold: 7, shakeGold: 0.8, hitStopGold: 0.11 }
}, [
  [0.18, E_SMOOTH, { ln: 0.1, h: -0.15, la: [0.55, 0, -0.1], ra: [0.55, 0, 0.1], ll: [-0.3, 0, -0.05], rr: [0.3, 0, 0.05] }],
  [0.36, E_OUT, { tw: 0.15, ln: -0.28, h: 0.45, la: [-2.85, 0, 0.3], ra: [-2.9, 0, -0.1], ll: [-0.85, 0, -0.05], rr: [-0.25, 0, 0.05] }],
  [0.5, E_IN, { tw: -0.05, ln: 0.42, h: -0.06, la: [-1.0, 0, 0.35], ra: [-0.15, 0, -0.05], ll: [-0.6, 0, -0.08], rr: [0.6, 0, 0.08] }],
  [0.72, E_OUT, { tw: -0.05, ln: 0.4, h: -0.2, la: [-0.85, 0, 0.3], ra: [0.25, 0, -0.05], ll: [-0.75, 0, -0.12], rr: [0.75, 0, 0.12] }],
  [1, E_SMOOTH, { ln: 0.02, la: [-0.1, 0, 0], ra: [-0.15, 0, 0.1] }]
]);

// ───────────── 玩家：特訓院防暴警棍 ─────────────
// 1 上步斜劈：持棍高舉 → 上步沉身自右上向左下斜劈
const BATON_1 = defineMove('上步斜劈', { dur: 0.46, strike: 0.42, cancel: 0.62, trailLimb: 'W', trail: [0.26, 0.66] }, [
  [0.26, E_SMOOTH, { tw: 0.6, ln: -0.1, h: -0.04, la: [-0.9, 0, -0.3], ra: [-2.6, 0, 0.55], ll: [0.3, 0, -0.05], rr: [-0.2, 0, 0.05] }],
  [0.42, E_IN, { tw: -0.4, ln: 0.22, h: -0.12, la: [0.55, 0, -0.35], ra: [0.1, 0, -0.35], ll: [0.45, 0, -0.08], rr: [-0.6, 0, 0.08] }],
  [0.66, E_OUT, { tw: -0.5, ln: 0.18, h: -0.11, la: [0.6, 0, -0.4], ra: [0.35, 0, -0.45], ll: [0.42, 0, -0.08], rr: [-0.55, 0, 0.08] }],
  [1, E_SMOOTH, { la: [-0.1, 0, 0], ra: [-0.2, 0, 0.1] }]
]);
// 2 轉腕回挑：棍收左下 → 翻腕自下而上挑擊
const BATON_2 = defineMove('轉腕回挑', { dur: 0.42, strike: 0.42, cancel: 0.62, trailLimb: 'W', trail: [0.26, 0.68] }, [
  [0.26, E_SMOOTH, { tw: -0.55, ln: 0.12, h: -0.1, la: [-0.6, 0, -0.3], ra: [0.35, 0.6, -0.5], ll: [-0.35, 0, -0.08], rr: [0.35, 0, 0.08] }],
  [0.42, E_IN, { tw: 0.35, ln: -0.1, h: 0.03, la: [0.5, 0, -0.5], ra: [-2.1, -0.3, 0.45], ll: [-0.2, 0, -0.05], rr: [0.25, 0, 0.05] }],
  [0.68, E_OUT, { tw: 0.45, ln: -0.12, h: 0.02, la: [0.55, 0, -0.55], ra: [-2.4, -0.4, 0.5], ll: [-0.2, 0, -0.05], rr: [0.25, 0, 0.05] }],
  [1, E_SMOOTH, { la: [-0.1, 0, 0], ra: [-0.2, 0, 0.1] }]
]);
// 3 旋身橫打：蓄勢後旋身一圈，警棍平舉橫打 (終結技)
const BATON_3 = defineMove('旋身橫打', {
  dur: 0.66, strike: 0.5, cancel: 1, reach: 1.1, arc: -1, dmg: 1.1, knock: 1.5, finisher: true, trailLimb: 'W', trail: [0.2, 0.72], fx: 'SPIN',
  charge: [0.02, 0.18], // 蓄勢：電弧聚氣光環 (純視覺)
  aoe: { center: 'SELF', offset: 0, radius: 1.12, max: 6, falloff: 0.35, shake: 0.45, hitStop: 0.09, hitStopMulti: 0.09, missShake: 0 }
}, [
  [0.2, E_SMOOTH, { tw: 0.8, ln: -0.04, h: -0.1, la: [-1.1, 0, 0.2], ra: [-0.2, 0, 1.2], ll: [-0.35, 0, -0.15], rr: [0.3, 0, 0.15] }],
  [0.5, E_IN, { tw: -TWO_PI - 0.35, ln: 0.1, rl: 0.12, h: -0.12, la: [0.3, 0, -1.2], ra: [-0.2, -0.3, 1.5], ll: [-0.45, 0, -0.25], rr: [0.4, 0, 0.25] }],
  [0.72, E_OUT, { tw: -TWO_PI - 1.0, ln: 0.08, rl: 0.14, h: -0.12, la: [0.35, 0, -1.1], ra: [-0.3, -0.4, 1.3], ll: [-0.45, 0, -0.25], rr: [0.4, 0, 0.25] }],
  [1, E_SMOOTH, { tw: -TWO_PI, la: [-0.1, 0, 0], ra: [-0.2, 0, 0.1] }]
]);

// 羽球拍：側身引拍 → 轉腰揮拍 (4F 羽球賽，不連段)
const RACKET = defineMove('揮拍', { dur: 0.38, strike: 0.36, cancel: 1, trailLimb: 'W', trail: [0.22, 0.65] }, [
  [0.22, E_SMOOTH, { tw: 0.6, ln: -0.05, la: [-0.9, 0, -0.2], ra: [-1.6, 0, 0.9], ll: [-0.25, 0, 0], rr: [0.2, 0, 0] }],
  [0.36, E_IN, { tw: -0.35, ln: 0.12, la: [0.3, 0, -0.3], ra: [-1.3, 0, -0.2], ll: [-0.3, 0, 0], rr: [0.25, 0, 0] }],
  [0.65, E_OUT, { tw: -0.45, ln: 0.1, la: [0.35, 0, -0.3], ra: [-0.6, 0, -0.3], ll: [-0.3, 0, 0], rr: [0.25, 0, 0] }],
  [1, E_SMOOTH, REST]
]);

// ───────────── 玩家：雙燕羽刃 (雙羽球拍二刀流，右拍 W / 左拍 WL，每段多擊) ─────────────
// 1 二刀・快斬：自倒提架勢起手，右拍由下往上斜撩 (0.28)、左拍反向斜劈 (0.55)；小幅轉腰、不弓步
const DUAL_1 = defineMove('二刀・快斬', {
  dur: 0.4, strike: 0.28, cancel: 0.68, reach: 1.0, arc: -0.1, dmg: 1.0, knock: 0.4,
  extraStrikes: [0.55], extraDmg: [1.0], trailLimb: 'W', trail: [0.12, 0.4], trail2: [0.38, 0.66], trailLimb2: 'WL', slashFx: 'LINE'
}, [
  [0.12, E_SMOOTH, { tw: 0.3, ln: 0.05, ra: [0.35, 0, 0.5], la: [0.1, 0, -0.5] }],
  [0.28, E_IN, { tw: -0.35, ln: 0.1, ra: [-2.1, 0, -0.2], la: [0.2, 0, -0.5] }],
  [0.42, E_SMOOTH, { tw: -0.1, ra: [-2.3, 0, -0.1], la: [-2.4, 0, 0.2] }],
  [0.55, E_IN, { tw: 0.4, ln: 0.12, ra: [-1.6, 0, 0.5], la: [-0.5, 0, -0.3] }],
  [0.78, E_OUT, { tw: 0.5, ln: 0.1, ra: [-1.4, 0, 0.6], la: [-0.4, 0, -0.4] }],
  [1, E_SMOOTH, REST]
]);
// 2 二刀・交叉斬：雙拍高舉交叉 → 向兩側外斬拉開 (右拍 0.42、左拍 0.50)，兩道斬痕在面前交成 X
const DUAL_2 = defineMove('二刀・交叉斬', {
  dur: 0.44, strike: 0.42, cancel: 0.64, reach: 1.05, arc: 0, dmg: 1.0, knock: 0.4,
  extraStrikes: [0.5], extraDmg: [1.0], trailLimb: 'W', trail: [0.26, 0.55], trail2: [0.32, 0.62], trailLimb2: 'WL',
  hitShake: 0.15, slashFx: 'X'
}, [
  [0.2, E_SMOOTH, { ln: -0.05, h: 0.04, ra: [-2.5, 0, -0.5], la: [-2.5, 0, 0.5] }],
  [0.42, E_IN, { tw: -0.15, ln: 0.15, ra: [-1.2, 0, 1.2], la: [-2.4, 0, 0.5] }],
  [0.5, E_IN, { tw: 0.2, ln: 0.15, ra: [-1.0, 0, 1.5], la: [-1.0, 0, -1.5] }],
  [1, E_SMOOTH, REST]
]);
// 3 鬼斬 (終結技)：雙拍身前交叉成 X、壓低重心蓄勢 (0.2s) → 沿面向高速突進 4.5m 穿過敵群 (0.2 → 0.35)，
// 衝刺中途兩次小擊只扣血 (0.26 / 0.31) → 停下後雙拍向兩側外斬、背對敵人收刀 (0.42，延遲斬：敵人此刻才爆開並擊飛，唯一擊飛) → 停格收勢 0.3s
// 命中範圍為沿突進路徑的矩形 (半寬 = radius × 攻擊距離 ≈ 0.9m、長度 = 實際突進距離，撞牆時較短)
const DUAL_3 = defineMove('鬼斬', {
  dur: 1.0, strike: 0.42, cancel: 0.7, reach: 1.0, arc: -1, dmg: 1.6, knock: 1.5, finisher: true,
  extraStrikes: [0.26, 0.31], extraDmg: [0.5, 0.5], trailLimb: 'W', trail: [0.2, 0.56], trail2: [0.2, 0.56], trailLimb2: 'WL', fx: 'DASH',
  lunge: { dist: 4.5, from: 0.2, to: 0.35 }, charge: [0.04, 0.2], slashFx: 'LINE',
  aoe: { shape: 'PATH', center: 'SELF', offset: 0, radius: 0.35, max: 6, falloff: 0.3, shake: 0.75, hitStop: 0.12, hitStopMulti: 0.14, missShake: 0.3 }
}, [
  [0.18, E_SMOOTH, { ln: 0.3, h: -0.25, ra: [-1.3, 0, -0.7], la: [-1.3, 0, 0.7], ll: [-0.6, 0, -0.1], rr: [0.5, 0, 0.1] }],
  [0.2, E_LINEAR, { ln: 0.3, h: -0.25, ra: [-1.3, 0, -0.7], la: [-1.3, 0, 0.7], ll: [-0.6, 0, -0.1], rr: [0.5, 0, 0.1] }],
  [0.35, E_LINEAR, { ln: 0.5, h: -0.3, ra: [-1.5, 0, -0.4], la: [-1.5, 0, 0.4], ll: [-0.9, 0, -0.1], rr: [0.8, 0, 0.1] }],
  [0.42, E_IN, { tw: Math.PI, ln: 0.2, h: -0.2, ra: [-1.5, 0, 1.5], la: [-1.5, 0, -1.5], ll: [-0.5, 0, -0.2], rr: [0.4, 0, 0.2] }],
  [0.72, E_OUT, { tw: Math.PI, ln: 0.2, h: -0.2, ra: [-1.4, 0, 1.45], la: [-1.4, 0, -1.45], ll: [-0.5, 0, -0.2], rr: [0.4, 0, 0.2] }],
  [1, E_SMOOTH, { tw: TWO_PI }]
]);

// ───────────── 玩家：綁帶捆書 (溜溜球式長鞭，dev 武器；第 1、2 段 FAN / LINE 群攻只扣血，第 3 段旋鞭擊飛) ─────────────
// 每段：蓄 (腳步 + 轉腰帶肩，手臂落後一拍) → 爆發 (鬆手甩出書，約 0.06 秒甩到最外側 = 命中) → 收 (綁帶收回、手在胸前接書) → 回勢。
// 書在外 / 回收期間有明顯空檔 (敵人可趁隙近身)，第 3 段蓄勢較長再爆發旋身形成高潮。
// 模型以拖尾區段進度驅動書的甩出 / 收回：拖尾區段起點 = 鬆手、中點 = strike (書在最外側)、終點起開始收回 (見 bookWhipModel)。
// 1 甩書橫掃：左腳上步、腰往右擰把書拉到右後方 (0.12) → 腰先轉、手臂落後 (0.2 鬆手) → 手臂橫甩、書沿弧線甩出 (0.3 命中，扇形 ±70°、4.2m)
//   → 隨勢甩過左側 (0.42) → 收綁帶、雙手胸前接書 (0.62) → 回勢
const WHIP_1 = defineMove('甩書橫掃', {
  dur: 0.6, strike: 0.3, cancel: 0.85, reach: 1.0, arc: -0.3, dmg: 1.0, knock: 0.35, trailLimb: 'W', trail: [0.2, 0.4], slashFx: 'LINE',
  aoe: { shape: 'FAN', center: 'SELF', offset: 0, radius: 1.0, halfAngle: 70 * Math.PI / 180, max: 4, falloff: 0, shake: 0.14, hitStop: 0.035, hitStopMulti: 0.04, missShake: 0 }
}, [
  [0.12, E_SMOOTH, { tw: 0.95, ln: -0.04, rl: -0.06, h: -0.06, la: [-0.9, 0, -0.35], ra: [0.15, 0.2, 1.3], ll: [-0.4, 0, -0.1], rr: [0.3, 0, 0.1] }],
  [0.2, E_SMOOTH, { tw: 0.45, ln: 0.04, rl: -0.02, h: -0.08, la: [-0.6, 0, -0.5], ra: [0.05, 0.2, 1.45], ll: [-0.5, 0, -0.12], rr: [0.4, 0, 0.12] }],
  [0.3, E_IN, { tw: -0.75, ln: 0.14, rl: 0.08, h: -0.1, la: [0.4, 0, -0.6], ra: [-1.4, -0.25, 0.55], ll: [-0.6, 0, -0.16], rr: [0.5, 0, 0.16] }],
  [0.42, E_OUT, { tw: -1.1, ln: 0.12, rl: 0.1, h: -0.09, la: [0.45, 0, -0.7], ra: [-1.35, -0.4, 0.05], ll: [-0.55, 0, -0.16], rr: [0.45, 0, 0.16] }],
  [0.62, E_SMOOTH, { tw: -0.35, ln: 0.06, h: -0.05, la: [-1.0, 0, -0.35], ra: [-1.15, 0, 0.12], ll: [-0.3, 0, -0.08], rr: [0.25, 0, 0.08] }],
  [1, E_SMOOTH, { tw: -0.05, la: [-0.2, 0, 0], ra: [-0.3, 0, 0.1] }]
]);
// 2 回手抽擊：上身後仰、書高舉過頂 (0.12) → 前傾帶肩、手臂仍在頂上 (0.2 鬆手) → 弓步向下直線抽出 (0.32 命中，前方長條 4.8m × 1.2m)
//   → 手腕一抖回彈 (0.42 追擊，傷害 ×0.5) → 收綁帶、胸前接書 (0.66) → 回勢
const WHIP_2 = defineMove('回手抽擊', {
  dur: 0.62, strike: 0.32, cancel: 0.85, reach: 1.0, arc: -0.3, dmg: 1.0, knock: 0.35, extraStrikes: [0.42], extraDmg: [0.5],
  trailLimb: 'W', trail: [0.2, 0.44], slashFx: 'LINE',
  aoe: { shape: 'LINE', center: 'SELF', offset: 0, radius: 1.0, len: 4.8 / 4.2, halfWidth: 0.6 / 4.2, max: 4, falloff: 0, shake: 0.18, hitStop: 0.045, hitStopMulti: 0.05, missShake: 0 }
}, [
  [0.12, E_SMOOTH, { tw: -0.35, ln: -0.26, h: 0.04, la: [-1.0, 0, 0.3], ra: [-2.9, 0.3, 0.4], ll: [-0.25, 0, -0.08], rr: [0.25, 0, 0.08] }],
  [0.2, E_SMOOTH, { tw: -0.15, ln: -0.04, h: 0.0, la: [-0.6, 0, 0.1], ra: [-2.75, 0.2, 0.35], ll: [-0.45, 0, -0.1], rr: [0.4, 0, 0.1] }],
  [0.32, E_IN, { tw: 0.02, ln: 0.32, h: -0.13, la: [0.5, 0, -0.45], ra: [-1.35, 0, 0.1], ll: [-0.7, 0, -0.1], rr: [0.6, 0, 0.1] }],
  [0.42, E_OUT, { tw: -0.06, ln: 0.2, h: -0.1, la: [0.4, 0, -0.45], ra: [-1.75, 0.1, 0.2], ll: [-0.65, 0, -0.1], rr: [0.55, 0, 0.1] }],
  [0.66, E_SMOOTH, { tw: 0.05, ln: 0.08, h: -0.05, la: [-1.0, 0, -0.35], ra: [-1.15, 0, 0.12], ll: [-0.35, 0, -0.08], rr: [0.3, 0, 0.08] }],
  [1, E_SMOOTH, { la: [-0.2, 0, 0], ra: [-0.3, 0, 0.1] }]
]);
// 3 旋鞭橫掃 (終結技，慢招重擊飛)：沉腰擰身、書拉到身後 (0.26) → 繃緊停頓 (0.38) → 爆發旋身一圈、0.42 鬆手、手臂平伸把書繞身拉成大圓
//   (0.52 命中 4.2m，擊飛約 3.5 ~ 4m) → 甩過 (0.62) → 收綁帶、胸前接書 (0.76) → 0.79 可動 (命中後僵直約 0.25 秒，短於被擊飛敵人跑回所需時間)
const WHIP_3 = defineMove('旋鞭橫掃', {
  dur: 0.92, strike: 0.52, cancel: 0.79, reach: 1.0, arc: -1, dmg: 1.3, knock: 1.3, finisher: true, trailLimb: 'W', trail: [0.42, 0.62], fx: 'SPIN', slashFx: 'LINE',
  aoe: { center: 'SELF', offset: 0, radius: 1.0, max: 6, falloff: 0.15, shake: 0.55, hitStop: 0.07, hitStopMulti: 0.085, missShake: 0.15 }
}, [
  [0.26, E_SMOOTH, { tw: 1.2, ln: 0.1, rl: -0.1, h: -0.2, la: [-1.1, 0, -0.3], ra: [0.1, 0, 1.3], ll: [-0.45, 0, -0.18], rr: [0.4, 0, 0.18] }],
  [0.38, E_LINEAR, { tw: 1.35, ln: 0.12, rl: -0.12, h: -0.22, la: [-1.15, 0, -0.3], ra: [0.15, 0, 1.4], ll: [-0.45, 0, -0.2], rr: [0.42, 0, 0.2] }],
  [0.52, E_IN, { tw: -TWO_PI - 0.2, ln: 0.06, rl: 0.1, h: 0.06, la: [0.3, 0, -1.2], ra: [-0.3, -0.2, 1.55], ll: [-0.35, 0, -0.22], rr: [0.3, 0, 0.22] }],
  [0.62, E_OUT, { tw: -TWO_PI - 0.75, ln: 0.08, rl: 0.12, h: -0.08, la: [0.35, 0, -1.05], ra: [-0.5, -0.4, 1.2], ll: [-0.45, 0, -0.24], rr: [0.4, 0, 0.24] }],
  [0.76, E_SMOOTH, { tw: -TWO_PI - 0.4, ln: 0.06, h: -0.05, la: [-1.0, 0, -0.35], ra: [-1.15, 0, 0.15], ll: [-0.3, 0, -0.1], rr: [0.25, 0, 0.1] }],
  [1, E_SMOOTH, { tw: -TWO_PI, la: [-0.2, 0, 0], ra: [-0.3, 0, 0.1] }]
]);

// ───────────── 玩家：籃球氣功彈 (遠程回收型，dev 武器；三投各自發射光束彈，命中時間點 = 球離手) ─────────────
// 節奏：聚氣 (極短) → 出手 (瞬間) → 收招 (短)；第 1、2 投前搖約 0.1 秒、0.38 秒可接下一投，第 3 投聚氣 0.28 秒形成高潮、出手後 0.22 秒即可移動 / 閃身
// 1 氣勁推傳：雙掌抱球收胸 (0.12) → 雙掌猛推 (0.25 出手) → 前推定住 (0.5) → 收勢
const BALL_1 = defineMove('氣勁推傳', {
  dur: 0.42, strike: 0.25, cancel: 0.9, reach: 1.0, arc: -1, dmg: 1.0, knock: 1.0, projectile: 'BALL_CHEST'
}, [
  [0.12, E_SMOOTH, { tw: 0.12, ln: -0.06, h: -0.05, la: [-1.0, 0, 0.5], ra: [-1.0, 0, -0.5], ll: [-0.2, 0, -0.05], rr: [0.2, 0, 0.05] }],
  [0.25, E_IN, { tw: -0.06, ln: 0.16, h: -0.06, la: [-1.55, 0, 0.1], ra: [-1.55, 0, -0.1], ll: [-0.42, 0, -0.08], rr: [0.36, 0, 0.08] }],
  [0.5, E_OUT, { tw: -0.02, ln: 0.12, h: -0.04, la: [-1.45, 0, 0.1], ra: [-1.45, 0, -0.1], ll: [-0.32, 0, -0.06], rr: [0.26, 0, 0.06] }],
  [1, E_SMOOTH, REST]
]);
// 2 迴旋快傳：反向扭身右手後拉 (0.12) → 轉腰單掌甩出 (0.25 出手，左手護胸) → 收勢
const BALL_2 = defineMove('迴旋快傳', {
  dur: 0.42, strike: 0.25, cancel: 0.9, reach: 1.0, arc: -1, dmg: 1.0, knock: 1.0, projectile: 'BALL_SNAP'
}, [
  [0.12, E_SMOOTH, { tw: 0.32, ln: 0.02, h: -0.06, la: [-0.9, 0, 0.45], ra: [-0.4, 0, -0.9], ll: [-0.3, 0, -0.08], rr: [0.3, 0, 0.08] }],
  [0.25, E_IN, { tw: -0.28, ln: 0.18, h: -0.08, la: [-0.8, 0, 0.6], ra: [-1.6, 0, 0.05], ll: [-0.5, 0, -0.1], rr: [0.4, 0, 0.1] }],
  [0.5, E_OUT, { tw: -0.18, ln: 0.12, h: -0.05, la: [-0.7, 0, 0.5], ra: [-1.45, 0, 0.0], ll: [-0.38, 0, -0.08], rr: [0.3, 0, 0.08] }],
  [1, E_SMOOTH, REST]
]);
// 3 灌籃氣功砲 (終結技)：沉腰把球收到腰側聚氣 (0.38) → 雙掌合推爆發 (0.45 出手，擊飛 + 小範圍爆風) → 前推定住 → 收勢
const BALL_3 = defineMove('灌籃氣功砲', {
  dur: 0.62, strike: 0.45, cancel: 0.8, reach: 1.0, arc: -1, dmg: 1.7, knock: 1.0, finisher: true, projectile: 'BALL_BLAST',
  charge: [0.05, 0.38] // 沉腰聚氣：聚氣光環 (純視覺，節奏不變)
}, [
  [0.38, E_SMOOTH, { tw: 0.35, ln: 0.12, h: -0.24, la: [-0.5, 0, 0.35], ra: [-0.6, 0, -0.35], ll: [-0.55, 0, -0.12], rr: [0.5, 0, 0.12] }],
  [0.45, E_IN, { tw: -0.05, ln: 0.2, h: -0.12, la: [-1.6, 0, 0.05], ra: [-1.6, 0, -0.05], ll: [-0.6, 0, -0.12], rr: [0.5, 0, 0.12] }],
  [0.72, E_OUT, { tw: 0, ln: 0.14, h: -0.08, la: [-1.5, 0, 0.08], ra: [-1.5, 0, -0.08], ll: [-0.45, 0, -0.1], rr: [0.38, 0, 0.1] }],
  [1, E_SMOOTH, REST]
]);

export const PLAYER_COMBOS = {
  FIST: [FIST_1, FIST_2, FIST_3],
  BAT: [BAT_1, BAT_2, BAT_3],
  BATON: [BATON_1, BATON_2, BATON_3],
  RACKET: [RACKET],
  DUAL: [DUAL_1, DUAL_2, DUAL_3],
  WHIP: [WHIP_1, WHIP_2, WHIP_3],
  BALL: [BALL_1, BALL_2, BALL_3]
} as const;
export type PlayerComboSet = keyof typeof PLAYER_COMBOS;

// ───────────── NPC ─────────────
// 同學：亂拳 / 推人
const NPC_FLAIL = defineMove('亂拳', { dur: 0.62, strike: 0.48 }, [
  [0.3, E_SMOOTH, { tw: 0.35, ln: -0.06, la: [-1.2, 0, -0.1], ra: [0.55, 0, 0.1], ll: [-0.2, 0, 0], rr: [0.15, 0, 0] }],
  [0.48, E_IN, { tw: -0.35, ln: 0.15, h: -0.05, la: [0.3, 0, -0.1], ra: [-1.5, 0, -0.18], ll: [-0.35, 0, 0], rr: [0.3, 0, 0] }],
  [0.72, E_SMOOTH, { tw: 0.15, ln: 0.1, h: -0.04, la: [-1.35, 0, 0.12], ra: [0.1, 0, 0.1], ll: [-0.3, 0, 0], rr: [0.25, 0, 0] }],
  [1, E_SMOOTH, REST]
]);
const NPC_PUSH = defineMove('推人', { dur: 0.6, strike: 0.48 }, [
  [0.3, E_SMOOTH, { ln: -0.12, h: -0.05, la: [0.45, 0, -0.1], ra: [0.45, 0, 0.1], ll: [-0.1, 0, 0], rr: [0.1, 0, 0] }],
  [0.48, E_IN, { ln: 0.26, h: -0.08, la: [-1.45, 0, 0.18], ra: [-1.45, 0, -0.18], ll: [-0.45, 0, 0], rr: [0.35, 0, 0] }],
  [0.72, E_OUT, { ln: 0.22, h: -0.07, la: [-1.4, 0, 0.18], ra: [-1.4, 0, -0.18], ll: [-0.42, 0, 0], rr: [0.33, 0, 0] }],
  [1, E_SMOOTH, REST]
]);
// 老師/教官：弓步推掌 / 彈腿
const NPC_PALM = defineMove('弓步推掌', { dur: 0.66, strike: 0.48 }, [
  [0.32, E_SMOOTH, { tw: 0.5, ln: -0.05, h: -0.06, la: [-1.1, 0, 0.1], ra: [0.65, 0, 0.1], ll: [-0.4, 0, -0.06], rr: [0.35, 0, 0.06] }],
  [0.48, E_IN, { tw: -0.35, ln: 0.18, h: -0.12, la: [0.7, 0, -0.1], ra: [-1.55, 0, -0.12], ll: [-0.65, 0, -0.08], rr: [0.55, 0, 0.08] }],
  [0.74, E_OUT, { tw: -0.3, ln: 0.15, h: -0.11, la: [0.65, 0, -0.1], ra: [-1.5, 0, -0.1], ll: [-0.62, 0, -0.08], rr: [0.52, 0, 0.08] }],
  [1, E_SMOOTH, REST]
]);
const NPC_SNAPKICK = defineMove('彈腿', { dur: 0.62, strike: 0.46, reach: 1.1 }, [
  [0.3, E_SMOOTH, { ln: 0.04, h: -0.05, la: [-0.9, 0, -0.2], ra: [-0.7, 0, 0.2], ll: [0.05, 0, 0], rr: [0.45, 0, 0] }],
  [0.46, E_IN, { ln: -0.2, h: 0.02, la: [-0.5, 0, -0.55], ra: [0.35, 0, 0.55], ll: [0.15, 0, 0], rr: [-1.5, 0, 0] }],
  [0.68, E_OUT, { ln: -0.15, la: [-0.5, 0, -0.5], ra: [0.3, 0, 0.5], ll: [0.12, 0, 0], rr: [-1.2, 0, 0] }],
  [1, E_SMOOTH, REST]
]);
// 糾察：擒拿推掌 (前手探抓回拉 → 後手推掌)
const NPC_SEIZE = defineMove('擒拿推掌', { dur: 0.7, strike: 0.52 }, [
  [0.22, E_SMOOTH, { tw: -0.25, ln: 0.12, la: [-1.5, 0, 0.1], ra: [0.3, 0, 0.1], ll: [-0.35, 0, 0], rr: [0.25, 0, 0] }],
  [0.38, E_SMOOTH, { tw: 0.5, ln: -0.02, h: -0.06, la: [0.3, 0, -0.1], ra: [0.55, 0, 0.12], ll: [-0.4, 0, -0.05], rr: [0.35, 0, 0.05] }],
  [0.52, E_IN, { tw: -0.38, ln: 0.2, h: -0.11, la: [0.65, 0, -0.1], ra: [-1.55, 0, -0.12], ll: [-0.6, 0, -0.08], rr: [0.5, 0, 0.08] }],
  [0.76, E_OUT, { tw: -0.32, ln: 0.16, h: -0.1, la: [0.6, 0, -0.1], ra: [-1.5, 0, -0.1], ll: [-0.58, 0, -0.08], rr: [0.48, 0, 0.08] }],
  [1, E_SMOOTH, REST]
]);
// 強盜：斜劈 / 回身刺
const NPC_SLASH = defineMove('斜劈', { dur: 0.66, strike: 0.48 }, [
  [0.32, E_SMOOTH, { tw: 0.5, ln: -0.1, h: -0.03, la: [-0.8, 0, -0.3], ra: [-2.6, 0, 0.5], ll: [-0.25, 0, -0.05], rr: [0.2, 0, 0.05] }],
  [0.48, E_IN, { tw: -0.45, ln: 0.25, h: -0.11, la: [0.5, 0, -0.35], ra: [0.05, 0, -0.4], ll: [-0.6, 0, -0.08], rr: [0.5, 0, 0.08] }],
  [0.74, E_OUT, { tw: -0.5, ln: 0.2, h: -0.1, la: [0.55, 0, -0.4], ra: [0.3, 0, -0.45], ll: [-0.58, 0, -0.08], rr: [0.48, 0, 0.08] }],
  [1, E_SMOOTH, REST]
]);
const NPC_THRUST = defineMove('回身刺', { dur: 0.72, strike: 0.5, reach: 1.1 }, [
  [0.34, E_SMOOTH, { tw: -1.3, ln: 0.04, h: -0.06, la: [-0.6, 0, -0.4], ra: [0.5, 0, 0.15], ll: [0.25, 0, -0.08], rr: [-0.25, 0, 0.08] }],
  [0.5, E_IN, { tw: 0.3, ln: 0.26, h: -0.12, la: [0.6, 0, -0.3], ra: [-1.55, 0, -0.08], ll: [0.5, 0, -0.08], rr: [-0.65, 0, 0.08] }],
  [0.76, E_OUT, { tw: 0.25, ln: 0.22, h: -0.11, la: [0.55, 0, -0.3], ra: [-1.5, 0, -0.08], ll: [0.48, 0, -0.08], rr: [-0.6, 0, 0.08] }],
  [1, E_SMOOTH, REST]
]);
// 特訓院守衛：盾牌衝撞 → 警棍下劈
const NPC_SHIELD = defineMove('盾牌衝撞', { dur: 0.64, strike: 0.48 }, [
  [0.32, E_SMOOTH, { tw: -0.3, ln: -0.06, h: -0.1, la: [-0.5, 0, 0.1], ra: [0.3, 0, 0.1], ll: [-0.3, 0, -0.08], rr: [0.3, 0, 0.08] }],
  [0.48, E_IN, { tw: 0.5, ln: 0.3, h: -0.1, la: [-1.25, 0, 0.2], ra: [0.45, 0, 0.15], ll: [-0.6, 0, -0.08], rr: [0.5, 0, 0.08] }],
  [0.72, E_OUT, { tw: 0.45, ln: 0.25, h: -0.09, la: [-1.2, 0, 0.2], ra: [0.4, 0, 0.15], ll: [-0.55, 0, -0.08], rr: [0.48, 0, 0.08] }],
  [1, E_SMOOTH, REST]
]);
const NPC_BATON_CHOP = defineMove('警棍下劈', { dur: 0.66, strike: 0.48 }, [
  [0.32, E_SMOOTH, { tw: 0.3, ln: -0.12, la: [-1.0, 0, 0.15], ra: [-2.75, 0, 0.2], ll: [-0.25, 0, -0.05], rr: [0.2, 0, 0.05] }],
  [0.48, E_IN, { tw: -0.3, ln: 0.3, h: -0.1, la: [-0.8, 0, 0.15], ra: [-0.75, 0, -0.1], ll: [-0.55, 0, -0.08], rr: [0.45, 0, 0.08] }],
  [0.74, E_OUT, { tw: -0.32, ln: 0.26, h: -0.1, la: [-0.75, 0, 0.15], ra: [-0.45, 0, -0.12], ll: [-0.52, 0, -0.08], rr: [0.43, 0, 0.08] }],
  [1, E_SMOOTH, REST]
]);
// 特訓院守衛舉盾格擋 (不造成傷害)：沉身後仰、左臂防暴盾猛然前舉護住正面
export const NPC_SHIELD_BLOCK = defineMove('舉盾格擋', { dur: 0.45, strike: 1, dmg: 0 }, [
  [0.18, E_OUT, { tw: 0.25, ln: -0.12, h: -0.12, la: [-1.4, 0, 0.25], ra: [0.35, 0, 0.15], ll: [-0.3, 0, -0.08], rr: [0.35, 0, 0.08] }],
  [0.65, E_SMOOTH, { tw: 0.2, ln: -0.08, h: -0.1, la: [-1.35, 0, 0.22], ra: [0.3, 0, 0.12], ll: [-0.28, 0, -0.08], rr: [0.32, 0, 0.08] }],
  [1, E_SMOOTH, REST]
]);
// 總教官：大開大合重拳 / 迴旋踢
const NPC_HEAVY = defineMove('大開大合重拳', { dur: 0.76, strike: 0.5 }, [
  [0.34, E_SMOOTH, { tw: 0.95, ln: -0.12, rl: -0.06, h: -0.08, la: [-1.25, 0, -0.35], ra: [0.85, 0, 0.45], ll: [-0.45, 0, -0.2], rr: [0.4, 0, 0.2] }],
  [0.5, E_IN, { tw: -0.6, ln: 0.3, rl: 0.06, h: -0.15, la: [0.75, 0, -0.2], ra: [-1.55, 0, -0.12], ll: [-0.7, 0, -0.2], rr: [0.6, 0, 0.2] }],
  [0.76, E_OUT, { tw: -0.55, ln: 0.26, h: -0.14, la: [0.7, 0, -0.2], ra: [-1.5, 0, -0.1], ll: [-0.68, 0, -0.2], rr: [0.58, 0, 0.2] }],
  [1, E_SMOOTH, REST]
]);
export const NPC_SPINKICK = defineMove('迴旋踢', { dur: 0.8, strike: 0.5, reach: 1.1, arc: -1 }, [
  [0.28, E_SMOOTH, { tw: -0.7, ln: 0.06, h: -0.1, la: [-1.0, 0, -0.2], ra: [-0.7, 0, 0.2], ll: [-0.2, 0, -0.05], rr: [0.3, 0, 0.05] }],
  [0.5, E_IN, { tw: 4.71, ln: -0.08, rl: 0.3, h: 0.04, la: [-0.2, 0, -1.25], ra: [-0.2, 0, 1.2], ll: [0.05, 0, -0.08], rr: [-0.25, 0, 1.35] }],
  [0.72, E_OUT, { tw: 5.7, ln: -0.04, rl: 0.18, la: [-0.3, 0, -1.0], ra: [-0.3, 0, 0.9], ll: [0.05, 0, -0.08], rr: [-0.2, 0, 0.7] }],
  [1, E_SMOOTH, { tw: TWO_PI }]
]);

// 主任教官「格擋反擊」(不造成傷害)：沉身雙臂十字架起封住正面，隨即由攻擊冷卻接回一般招式反擊
export const NPC_CROSS_PARRY = defineMove('十字格擋', { dur: 0.4, strike: 1, dmg: 0 }, [
  [0.2, E_OUT, { tw: 0.2, ln: -0.1, h: -0.1, la: [-1.5, 0, 0.65], ra: [-1.5, 0, -0.65], ll: [-0.35, 0, -0.1], rr: [0.35, 0, 0.1] }],
  [0.65, E_SMOOTH, { tw: 0.15, ln: -0.06, h: -0.09, la: [-1.45, 0, 0.6], ra: [-1.45, 0, -0.6], ll: [-0.32, 0, -0.1], rr: [0.32, 0, 0.1] }],
  [1, E_SMOOTH, REST]
]);
// 主任教官招牌技「擒拿摔」：沉身雙手前探 (預備期間向前短距撲抓) → 抓住後扭腰過肩摔
export const NPC_GRAB_THROW = defineMove('擒拿摔', { dur: 1.3, strike: 0.45, cancel: 0.9, reach: 1.0 }, [
  [0.3, E_SMOOTH, { tw: 0.15, ln: 0.18, h: -0.16, la: [-1.25, 0, 0.25], ra: [-1.25, 0, -0.25], ll: [-0.55, 0, -0.1], rr: [0.5, 0, 0.1] }],
  [0.42, E_IN, { ln: 0.3, h: -0.18, la: [-1.6, 0, 0.1], ra: [-1.6, 0, -0.1], ll: [-0.7, 0, -0.1], rr: [0.6, 0, 0.1] }],
  [0.6, E_SMOOTH, { tw: -0.5, ln: 0.05, h: -0.2, la: [-2.5, 0, 0.2], ra: [-2.5, 0, -0.2], ll: [-0.5, 0, -0.12], rr: [0.45, 0, 0.12] }],
  [0.78, E_OUT, { tw: -1.7, ln: 0.35, h: -0.22, la: [-0.6, 0, 0.3], ra: [-0.4, 0, -0.3], ll: [-0.6, 0, -0.12], rr: [0.55, 0, 0.12] }],
  [1, E_SMOOTH, REST]
]);
// 生教組長招牌技「戒尺連打」：高舉戒尺蓄勢 → 連續三下快速下劈 (各段分別判定命中)
export const NPC_RULER_FLURRY = defineMove('戒尺連打', { dur: 1.25, strike: 0.36, cancel: 0.92, reach: 1.05, extraStrikes: [0.56, 0.76] }, [
  [0.26, E_SMOOTH, { tw: 0.35, ln: -0.12, la: [-0.9, 0, 0.15], ra: [-2.8, 0, 0.2], ll: [-0.3, 0, -0.05], rr: [0.25, 0, 0.05] }],
  [0.36, E_IN, { tw: -0.25, ln: 0.25, h: -0.08, la: [-0.8, 0, 0.15], ra: [-0.7, 0, -0.1], ll: [-0.5, 0, -0.08], rr: [0.45, 0, 0.08] }],
  [0.46, E_OUT, { tw: 0.2, ln: 0.0, h: -0.04, la: [-0.85, 0, 0.15], ra: [-2.5, 0, 0.15], ll: [-0.45, 0, -0.08], rr: [0.4, 0, 0.08] }],
  [0.56, E_IN, { tw: -0.3, ln: 0.27, h: -0.09, la: [-0.8, 0, 0.15], ra: [-0.65, 0, -0.12], ll: [-0.55, 0, -0.08], rr: [0.48, 0, 0.08] }],
  [0.66, E_OUT, { tw: 0.25, ln: 0.0, h: -0.05, la: [-0.85, 0, 0.15], ra: [-2.6, 0, 0.15], ll: [-0.5, 0, -0.08], rr: [0.42, 0, 0.08] }],
  [0.76, E_IN, { tw: -0.35, ln: 0.3, h: -0.11, la: [-0.75, 0, 0.15], ra: [-0.55, 0, -0.14], ll: [-0.6, 0, -0.08], rr: [0.5, 0, 0.08] }],
  [1, E_SMOOTH, REST]
]);

// 暗殺時機失誤反制招式 (不造成傷害；擊退由戰鬥系統於命中時間點結算)。起始扭腰由呼叫端帶入原本朝向，回身轉體與前一姿勢連續
// 徒手守衛/總教官：回身十字格擋 → 沉身震掌推開
export const TAKEDOWN_PALM_PARRY = defineMove('回身十字格擋·震掌', { dur: 0.8, strike: 0.42, dmg: 0 }, [
  [0.32, E_SMOOTH, { tw: 0.35, ln: -0.1, h: -0.12, la: [-1.5, 0, 0.7], ra: [-1.5, 0, -0.7], ll: [-0.4, 0, -0.12], rr: [0.35, 0, 0.12] }],
  [0.42, E_IN, { tw: -0.2, ln: 0.2, h: -0.15, la: [0.4, 0, -0.2], ra: [-1.6, 0, -0.1], ll: [-0.65, 0, -0.1], rr: [0.55, 0, 0.1] }],
  [0.68, E_OUT, { tw: -0.26, ln: 0.17, h: -0.14, la: [0.35, 0, -0.2], ra: [-1.5, 0, -0.08], ll: [-0.62, 0, -0.1], rr: [0.52, 0, 0.1] }],
  [1, E_SMOOTH, REST]
]);
// 持盾守衛：回身舉盾護住正面 → 上步盾擊
export const TAKEDOWN_SHIELD_PARRY = defineMove('回身舉盾·盾擊', { dur: 0.8, strike: 0.42, dmg: 0 }, [
  [0.32, E_SMOOTH, { tw: 0.25, ln: -0.1, h: -0.1, la: [-1.45, 0, 0.25], ra: [0.35, 0, 0.15], ll: [-0.3, 0, -0.08], rr: [0.35, 0, 0.08] }],
  [0.42, E_IN, { tw: -0.15, ln: 0.28, h: -0.12, la: [-1.6, 0, 0.15], ra: [0.45, 0, 0.15], ll: [-0.65, 0, -0.08], rr: [0.55, 0, 0.08] }],
  [0.68, E_OUT, { tw: -0.18, ln: 0.24, h: -0.11, la: [-1.55, 0, 0.18], ra: [0.4, 0, 0.15], ll: [-0.6, 0, -0.08], rr: [0.52, 0, 0.08] }],
  [1, E_SMOOTH, REST]
]);
// 警戒犬：回身後躍閃開 → 前撲猛咬逼退 (僅根節點動作)
export const TAKEDOWN_WOLF_PARRY = defineMove('回身後躍·撲咬', { dur: 0.8, strike: 0.42, dmg: 0 }, [
  [0.32, E_SMOOTH, { tw: 0.2, ln: -0.3, h: 0.2 }],
  [0.42, E_IN, { ln: 0.22, h: 0.02 }],
  [0.68, E_OUT, { ln: 0.16 }],
  [1, E_SMOOTH, REST]
]);

// 玩家暗殺被格擋：收勢架起十字手 → 承受震擊後仰沉身、前腳撐地向後滑退 → 收勢站穩 (命中點 = 對方格擋擊中瞬間)
export const PLAYER_TAKEDOWN_BLOCKED = defineMove('十字護身·滑步卸力', { dur: 1.04, strike: 0.32, cancel: 0.82 }, [
  [0.2, E_SMOOTH, { ln: -0.05, h: -0.08, la: [-1.5, 0, 0.6], ra: [-1.5, 0, -0.6], ll: [-0.3, 0, -0.05], rr: [0.3, 0, 0.05] }],
  [0.32, E_SMOOTH, { ln: -0.08, h: -0.12, la: [-1.52, 0, 0.62], ra: [-1.52, 0, -0.62], ll: [-0.38, 0, -0.06], rr: [0.34, 0, 0.06] }],
  [0.42, E_OUT, { ln: -0.28, h: -0.2, la: [-1.25, 0, 0.75], ra: [-1.25, 0, -0.75], ll: [-0.7, 0, -0.1], rr: [0.5, 0, 0.1] }],
  [0.75, E_SMOOTH, { ln: -0.16, h: -0.2, la: [-1.1, 0, 0.6], ra: [-1.1, 0, -0.6], ll: [-0.72, 0, -0.14], rr: [0.52, 0, 0.14] }],
  [1, E_SMOOTH, REST]
]);

// 玩家暗殺總教官專用：上步沉身、雙拳後拉蓄勢 → 雙峰貫耳 (雙拳弧線合擊兩耳) → 前壓延展 → 收勢站樁
// 命中點占全長 27%，結尾回到站姿，讓收招淡出在後空翻起跳前完成 (時間縮放見 CombatSystem)；
// 蓄勢頂點 (PLAYER_TAKEDOWN_WINDUP) 為時機計量表暫停點
export const PLAYER_TAKEDOWN_WINDUP = 0.17;
export const PLAYER_TAKEDOWN = defineMove('雙峰貫耳', { dur: 0.5, strike: 0.27, cancel: 1 }, [
  [0.09, E_SMOOTH, { ln: 0.06, h: -0.05, la: [0.15, 0, -0.18], ra: [0.15, 0, 0.18], ll: [-0.38, 0, -0.05], rr: [0.26, 0, 0.05] }],
  [0.17, E_OUT, { ln: 0.18, h: -0.16, la: [0.6, 0, -0.8], ra: [0.6, 0, 0.8], ll: [-0.62, 0, -0.1], rr: [0.5, 0, 0.1] }],
  [0.27, E_IN, { ln: 0.28, h: -0.18, la: [-1.45, 0, 0.38], ra: [-1.45, 0, -0.38], ll: [-0.76, 0, -0.1], rr: [0.6, 0, 0.1] }],
  [0.45, E_OUT, { ln: 0.32, h: -0.2, la: [-1.38, 0, 0.48], ra: [-1.38, 0, -0.48], ll: [-0.78, 0, -0.1], rr: [0.62, 0, 0.1] }],
  [0.75, E_SMOOTH, { ln: 0.08, h: -0.06, la: [-0.3, 0, 0.05], ra: [-0.3, 0, -0.05], ll: [-0.2, 0, -0.02], rr: [0.15, 0, 0.02] }],
  [1, E_SMOOTH, REST]
]);

const NPC_MOVESETS: Record<string, readonly KfMove[]> = {
  STUDENT: [NPC_FLAIL, NPC_PUSH],
  TEACHER: [NPC_PALM, NPC_SNAPKICK],
  DISCIPLINE_CHIEF: [NPC_PALM, NPC_SNAPKICK],
  INSTRUCTOR: [NPC_PALM, NPC_SNAPKICK],
  DODGE_TEACHER: [NPC_PALM, NPC_SNAPKICK],
  PE_TEACHER_BOSS: [NPC_PALM, NPC_SNAPKICK],
  INSPECTOR: [NPC_SEIZE, NPC_PALM],
  BANDIT: [NPC_SLASH, NPC_THRUST],
  DETENTION_GUARD: [NPC_SHIELD, NPC_BATON_CHOP],
  DETENTION_SENIOR: [NPC_PALM, NPC_SNAPKICK],
  DETENTION_HEAVY: [NPC_HEAVY, NPC_PALM],
  DETENTION_BOSS: [NPC_HEAVY, NPC_SPINKICK]
};

// 取得角色的招式組 (犬類、單車糾察等非人型角色回傳 null，沿用原本攻擊判定)
export function getNpcMoveset(role: string): readonly KfMove[] | null {
  return NPC_MOVESETS[role] ?? null;
}

function ease(kind: number, u: number): number {
  if (kind === E_IN) return u * u;
  if (kind === E_OUT) return 1 - (1 - u) * (1 - u);
  if (kind === E_LINEAR) return u;
  return u * u * (3 - 2 * u);
}

export function wrapAngle(a: number): number {
  return a - TWO_PI * Math.round(a / TWO_PI);
}

// ───────────── 多段命中 / 突進 (玩家連段共用的純函式) ─────────────
// 命中序號 strikeIndex：0 = 主擊 (strike)，1 以後依 extraStrikes 順序 (時間先後不一定與序號相同)

// 第 i 擊命中時間點 (占全長比例)
export function strikeFrac(move: KfMove, i: number): number {
  return i === 0 ? move.strike : move.extraStrikes[i - 1];
}

// 群攻次目標傷害倍率 (主目標全額，其餘 ×此值；戰鬥系統與裝備頁群攻秒傷共用)
export const AOE_SECONDARY_DMG = 0.8;

// 第 i 擊傷害倍率：主擊為 dmg，額外擊取 extraDmg (未設時沿用 dmg)
export function strikeDmg(move: KfMove, i: number): number {
  return i === 0 ? move.dmg : move.extraDmg[i - 1] ?? move.dmg;
}

// 第 i 擊結算方式：主擊沿用招式本身 (群攻 / 單體)；帶 aoe 的招式 (終結技或非終結技) 額外擊為群攻、其餘額外擊為單體判定
// (主擊 / 額外擊是否擊飛另由 strikeHitMode 決定：只有終結技主擊擊飛)
export type StrikeRoute = 'AOE' | 'AOE_LIGHT' | 'SINGLE';
export function strikeRoute(move: KfMove, i: number): StrikeRoute {
  if (i === 0) return move.aoe ? 'AOE' : 'SINGLE';
  return move.aoe ? 'AOE_LIGHT' : 'SINGLE';
}

// 第 i 擊可否擊飛：只有終結技主擊
export function strikeCanLaunch(move: KfMove, i: number): boolean {
  return move.finisher && i === 0;
}

// 玩家命中 NPC 的結算模式：LAUNCH 擊飛 (終結技主擊)、SHOVE 推開指定距離並打斷前搖、LIGHT 只扣血
export type PlayerHitMode = 'LIGHT' | 'SHOVE' | 'LAUNCH';
// 第 i 擊模式：終結技主擊擊飛；武器設 lightPush > 0 時非終結技改為推擊；其餘只扣血
export function strikeHitMode(move: KfMove, i: number, lightPush: number): PlayerHitMode {
  if (strikeCanLaunch(move, i)) return 'LAUNCH';
  return lightPush > 0 && !move.finisher ? 'SHOVE' : 'LIGHT';
}

// 扇形判定 (水平)：頂點 (cx, cz)、面向單位向量 (fx, fz)、半徑 radius、半角餘弦 cosHalf；
// 回傳點 (px, pz) 到頂點的距離，範圍外回傳 -1 (距頂點 ≤ FAN_ANGLE_MIN_DIST 時不檢查角度，避免貼身目標因方向抖動落空)
export const FAN_ANGLE_MIN_DIST = 0.6;
export function probeFan(cx: number, cz: number, fx: number, fz: number, radius: number, cosHalf: number, px: number, pz: number): number {
  const dx = px - cx;
  const dz = pz - cz;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d > radius) return -1;
  if (d > FAN_ANGLE_MIN_DIST && (dx * fx + dz * fz) / d < cosHalf) return -1;
  return d;
}

// 長條判定 (水平)：自 (ox, oz) 沿面向單位向量 (fx, fz) 長 len、半寬 halfWidth 的膠囊 (以 probePath 取中心線最近點)；
// 回傳沿長條方向的距離 (0..len)，範圍外回傳 -1；out 同 probePath (最近點 x / z、沿線比例)
export function probeLine(ox: number, oz: number, fx: number, fz: number, len: number, halfWidth: number, px: number, pz: number, out: Float32Array | number[]): number {
  const lateral = probePath(ox, oz, ox + fx * len, oz + fz * len, px, pz, out);
  if (lateral > halfWidth) return -1;
  return out[2] * len;
}

// 本幀跨過的額外命中時間點 (位元 i = 第 i 擊)；prevT / nowT 為圖層時間 (秒)，dur 為含節奏縮放的整招秒數
export function crossedExtraStrikes(move: KfMove, dur: number, prevT: number, nowT: number): number {
  let mask = 0;
  const extra = move.extraStrikes;
  for (let i = 0; i < extra.length; i++) {
    const at = extra[i] * dur;
    if (prevT < at && nowT >= at) mask |= 1 << (i + 1);
  }
  return mask;
}

// 待結算命中中時間最早者 (同時間取序號小者)；mask 需非 0
export function earliestStrike(move: KfMove, mask: number): number {
  let best = -1;
  let bestT = Infinity;
  for (let i = 0; i <= move.extraStrikes.length; i++) {
    if ((mask & (1 << i)) === 0) continue;
    const t = strikeFrac(move, i);
    if (t < bestT) { bestT = t; best = i; }
  }
  return best;
}

// 突進於圖層時間 t0 → t1 (秒) 間的位移 (公尺)：與突進區段重疊的比例 × dist (各幀加總恰為 dist)
export function lungeStep(move: KfMove, dur: number, t0: number, t1: number): number {
  const l = move.lunge;
  if (!l || dur <= 0 || l.to <= l.from) return 0;
  const a = l.from * dur;
  const b = l.to * dur;
  const overlap = Math.min(t1, b) - Math.max(t0, a);
  return overlap > 0 ? l.dist * overlap / (b - a) : 0;
}

// 點 (px, pz) 到突進路徑線段 (ox, oz) → (ex, ez) 的水平距離；最近點寫入 out[0] / out[1]，沿路徑比例 (0..1) 寫入 out[2]
export function probePath(ox: number, oz: number, ex: number, ez: number, px: number, pz: number, out: Float32Array | number[]): number {
  const dx = ex - ox;
  const dz = ez - oz;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 1e-8 ? Math.min(1, Math.max(0, ((px - ox) * dx + (pz - oz) * dz) / len2)) : 0;
  const cx = ox + dx * t;
  const cz = oz + dz * t;
  out[0] = cx;
  out[1] = cz;
  out[2] = t;
  return Math.hypot(px - cx, pz - cz);
}

const _top = new THREE.Vector3();

/**
 * 攻擊姿勢圖層：疊加在一般走路/待機動作之上 (0-GC)。
 * 每幀流程：擁有者先寫入一般動作 → update(delta) 推進時間 → apply(baseYaw) 以權重覆寫姿勢。
 * 根節點：航向 = baseYaw + 扭腰、俯仰朝目標插值、側傾直接寫入、高度以加法疊加 (擁有者需每幀重設 mesh.position)。
 */
export class KungFuLayer {
  public move: KfMove | null = null;
  public time = 0;
  private scale = 1;
  private tail = 0;
  private readonly snap = new Float32Array(CH);
  private readonly pose = new Float32Array(CH);
  private readonly base = new Float32Array(12);
  private readonly limbs: (THREE.Object3D | null)[] = [null, null, null, null];
  private mesh: THREE.Object3D | null = null;
  private appliedTwist = 0;
  private appliedRise = 0;

  public get active(): boolean { return this.move !== null || this.tail > 0; }
  // 圖層仍掛載於角色上 (含淡出結束當幀尚待還原)，擁有者需持續呼叫 apply 直到歸零
  public get engaged(): boolean { return this.mesh !== null; }
  // 已過出招點 (可接續下一招)
  public get canChain(): boolean { return !this.move || this.time >= this.move.cancel * this.move.dur * this.scale; }
  public get beforeStrike(): boolean { return !!this.move && this.time < this.move.strike * this.move.dur * this.scale; }
  public get rise(): number { return this.appliedRise; }
  // 整招進度：0 = 剛起手、1 = 收招 (含黃金雷霆棒等時間縮放；無招式時為 0)
  public get progress(): number { return this.move ? this.time / (this.move.dur * this.scale) : 0; }
  // 出招預備進度：0 = 剛起手、1 = 到達命中時間點 (無招式時為 0)
  public get strikeProgress(): number { return this.move ? this.time / (this.move.strike * this.move.dur * this.scale) : 0; }
  // 整招秒數 (含時間縮放；無招式時為 0)
  public get duration(): number { return this.move ? this.move.dur * this.scale : 0; }

  // twistFrom：指定起始扭腰 (例如角色朝向瞬間改變時帶入「舊畫面朝向 − 新朝向」，由招式平滑轉回)
  public start(move: KfMove, scale: number, mesh: THREE.Object3D, la?: THREE.Object3D | null, ra?: THREE.Object3D | null, ll?: THREE.Object3D | null, rl?: THREE.Object3D | null, twistFrom?: number) {
    const s = this.snap;
    if (!this.mesh) {
      this.mesh = mesh;
      this.limbs[0] = la ?? null;
      this.limbs[1] = ra ?? null;
      this.limbs[2] = ll ?? null;
      this.limbs[3] = rl ?? null;
      for (let i = 0; i < 4; i++) {
        const o = this.limbs[i];
        if (!o) continue;
        this.base[i * 3] = o.position.x;
        this.base[i * 3 + 1] = o.position.y;
        this.base[i * 3 + 2] = o.position.z;
      }
      this.appliedTwist = 0;
      this.appliedRise = 0;
    }
    // 以目前畫面姿勢為第 0 格，與前一招或走路動作無縫銜接
    s[0] = twistFrom ?? wrapAngle(this.appliedTwist);
    s[1] = mesh.rotation.x;
    s[2] = mesh.rotation.z;
    s[3] = this.appliedRise;
    for (let i = 0; i < 4; i++) {
      const o = this.limbs[i];
      s[4 + i * 3] = o ? o.rotation.x : 0;
      s[5 + i * 3] = o ? o.rotation.y : 0;
      s[6 + i * 3] = o ? o.rotation.z : 0;
    }
    this.move = move;
    this.scale = scale;
    this.time = 0;
    this.tail = 0;
    this.pose.set(s);
  }

  // 推進時間；本幀跨過命中時間點時回傳 true
  public update(delta: number): boolean {
    const move = this.move;
    if (!move) {
      if (this.tail > 0) this.tail = Math.max(0, this.tail - delta);
      return false;
    }
    const dur = move.dur * this.scale;
    const strikeAt = move.strike * dur;
    const prev = this.time;
    this.time += delta;
    const struck = prev < strikeAt && this.time >= strikeAt;
    if (this.time >= dur) {
      this.sample(move, 1);
      this.release();
    } else {
      this.sample(move, this.time / dur);
    }
    return struck;
  }

  // 提前收招：保留目前姿勢並淡出回一般動作
  public release() {
    if (!this.move) return;
    this.pose[0] = wrapAngle(this.pose[0]);
    this.move = null;
    this.tail = TAIL;
  }

  private sample(move: KfMove, t: number) {
    const k = move.keys;
    let i = 0;
    while (i < move.count - 1 && t > k[i * STRIDE]) i++;
    const b1 = i * STRIDE;
    const t0 = i === 0 ? 0 : k[b1 - STRIDE];
    const span = k[b1] - t0;
    const u = ease(k[b1 + 1], span > 0 ? Math.min(1, Math.max(0, (t - t0) / span)) : 1);
    const p = this.pose;
    if (i === 0) {
      const s = this.snap;
      for (let c = 0; c < CH; c++) p[c] = s[c] + (k[b1 + 2 + c] - s[c]) * u;
    } else {
      const b0 = b1 - STRIDE;
      for (let c = 0; c < CH; c++) p[c] = k[b0 + 2 + c] + (k[b1 + 2 + c] - k[b0 + 2 + c]) * u;
    }
  }

  // 擁有者更新肢體基準位置 (index 0~3 對應左臂/右臂/左腿/右腿；例如蹲姿時肩部隨身體下移)
  public setLimbBase(index: number, x: number, y: number, z: number) {
    const bi = index * 3;
    this.base[bi] = x;
    this.base[bi + 1] = y;
    this.base[bi + 2] = z;
  }

  // 套用姿勢 (skipMask: 位元 0~3 對應左臂/右臂/左腿/右腿，略過者維持一般動作，例如撐傘的手)
  // armPivot：雙臂以肩為軸的最低權重 (擁有者一般動作本身已以肩為軸時傳入，例如玩家蹲姿)，淡出時位置與一般動作一致
  public apply(baseYaw: number, skipMask: number = 0, armPivot: number = 0) {
    const mesh = this.mesh;
    if (!mesh) return;
    let w = 1;
    if (!this.move) {
      const u = this.tail / TAIL;
      w = u * u * (3 - 2 * u);
    }
    const p = this.pose;
    this.appliedTwist = p[0] * w;
    mesh.rotation.y = baseYaw + this.appliedTwist;
    mesh.rotation.x += (p[1] - mesh.rotation.x) * w;
    mesh.rotation.z = p[2] * w;
    this.appliedRise = p[3] * w;
    mesh.position.y += this.appliedRise;
    for (let i = 0; i < 4; i++) {
      const o = this.limbs[i];
      if (!o) continue;
      const bi = i * 3;
      const skip = (skipMask & (1 << i)) !== 0;
      const r = o.rotation;
      if (!skip) {
        const ci = 4 + bi;
        r.set(r.x + (p[ci] - r.x) * w, r.y + (p[ci + 1] - r.y) * w, r.z + (p[ci + 2] - r.z) * w);
      }
      // 肩/髖為軸：補償位移使肢體上端固定
      const pw = Math.max(skip ? 0 : w, i < 2 ? armPivot : 0);
      if (pw <= 0) {
        o.position.set(this.base[bi], this.base[bi + 1], this.base[bi + 2]);
        continue;
      }
      const h = (i < 2 ? ARM_HALF : LEG_HALF) * o.scale.y;
      _top.set(0, h, 0).applyEuler(r);
      o.position.set(this.base[bi] - _top.x * pw, this.base[bi + 1] + (h - _top.y) * pw, this.base[bi + 2] - _top.z * pw);
    }
    if (!this.move && this.tail <= 0) this.finish();
  }

  // 立即中止 (受擊、倒地、換世界等)：四肢位置還原，根節點姿勢交由擁有者重設
  public cancel() {
    if (!this.active && !this.mesh) return;
    this.move = null;
    this.tail = 0;
    this.finish();
  }

  private finish() {
    for (let i = 0; i < 4; i++) {
      const o = this.limbs[i];
      if (o) o.position.set(this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2]);
      this.limbs[i] = null;
    }
    this.mesh = null;
    this.appliedTwist = 0;
    this.appliedRise = 0;
  }
}

/**
 * 多段命中追蹤 (玩家連段)：推進出招圖層並依 prevT / nowT 判定本幀跨過的命中點 (主擊 + extraStrikes)。
 * 一幀至多送出一擊；同幀跨過多擊 (掉幀) 時依時間先後於後續幀補送，每擊恰好結算一次。
 */
export class StrikeTracker {
  // 待送出命中所屬的招式 (送出時一併取用)
  public move: KfMove | null = null;
  private pending = 0;

  // 推進圖層時間；回傳本幀送出的 strikeIndex (-1 = 無)
  public step(kf: KungFuLayer, delta: number): number {
    const move = kf.move;
    const prevT = kf.time;
    const dur = kf.duration;
    let crossed = kf.update(delta) ? 1 : 0;
    if (move && move.extraStrikes.length > 0) {
      const nowT = kf.move === move ? kf.time : dur;
      crossed |= crossedExtraStrikes(move, dur, prevT, nowT);
    }
    if (crossed && move) {
      if (this.move !== move) this.pending = 0;
      this.move = move;
      this.pending |= crossed;
    }
    if (!this.pending || !this.move) return -1;
    const i = earliestStrike(this.move, this.pending);
    this.pending &= ~(1 << i);
    return i;
  }

  // 中止出招時捨棄尚未送出的命中
  public reset() {
    this.move = null;
    this.pending = 0;
  }
}
