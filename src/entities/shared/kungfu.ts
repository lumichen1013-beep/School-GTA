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
interface PoseSpec { tw?: number; ln?: number; rl?: number; h?: number; la?: V3; ra?: V3; ll?: V3; rr?: V3 }
type KeySpec = readonly [t: number, ease: number, pose: PoseSpec];

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
  readonly keys: Float32Array;
  readonly count: number;
}

interface MoveOpts { dur: number; strike: number; cancel?: number; reach?: number; arc?: number; dmg?: number; knock?: number; finisher?: boolean; extraStrikes?: readonly number[] }

function defineMove(name: string, o: MoveOpts, keys: readonly KeySpec[]): KfMove {
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
    keys: data,
    count: keys.length
  };
}

const REST: PoseSpec = {};

// ───────────── 玩家：徒手 ─────────────
// 1 弓步衝拳：沉身扭腰蓄勢 → 擰腰送肩直拳、另一拳收抱腰間
const FIST_1 = defineMove('弓步衝拳', { dur: 0.4, strike: 0.4, cancel: 0.62 }, [
  [0.25, E_SMOOTH, { tw: 0.55, ln: -0.04, h: -0.07, la: [-1.15, 0, 0.1], ra: [0.7, 0, 0.12], ll: [-0.5, 0, -0.06], rr: [0.42, 0, 0.06] }],
  [0.4, E_IN, { tw: -0.42, ln: 0.16, h: -0.12, la: [0.75, 0, -0.12], ra: [-1.58, 0, -0.14], ll: [-0.68, 0, -0.08], rr: [0.58, 0, 0.08] }],
  [0.68, E_OUT, { tw: -0.36, ln: 0.13, h: -0.11, la: [0.7, 0, -0.12], ra: [-1.5, 0, -0.12], ll: [-0.64, 0, -0.08], rr: [0.55, 0, 0.08] }],
  [1, E_SMOOTH, { ln: 0.02, la: [-0.2, 0, 0], ra: [-0.25, 0, 0] }]
]);
// 2 轉身鞭腿：扭身蓄力 → 後腿掄圓橫掃，雙臂展開平衡
const FIST_2 = defineMove('轉身鞭腿', { dur: 0.48, strike: 0.42, cancel: 0.62, reach: 1.15, arc: -0.2 }, [
  [0.26, E_SMOOTH, { tw: -1.05, ln: 0.02, h: -0.07, la: [-1.0, 0, -0.2], ra: [-0.5, 0, 0.35], ll: [-0.2, 0, -0.05], rr: [0.45, 0, 0.05] }],
  [0.42, E_IN, { tw: 0.2, ln: -0.3, rl: 0.3, h: 0.04, la: [-0.2, 0, -1.2], ra: [0.3, 0, 1.0], ll: [0.15, 0, -0.06], rr: [-1.95, 0, 0.35] }],
  [0.66, E_OUT, { tw: 0.85, ln: -0.22, rl: 0.22, h: 0.02, la: [-0.15, 0, -1.05], ra: [0.25, 0, 0.9], ll: [0.12, 0, -0.05], rr: [-1.5, 0, 0.25] }],
  [1, E_SMOOTH, { la: [-0.25, 0, 0], ra: [-0.2, 0, 0] }]
]);
// 3 騰空旋風腿：下沉蓄勢 → 騰空 360° 旋身甩腿 → 落地馬步亮相 (終結技)
const FIST_3 = defineMove('騰空旋風腿', { dur: 0.72, strike: 0.46, cancel: 0.74, reach: 1.2, arc: -1, dmg: 1.25, knock: 1.6, finisher: true }, [
  [0.16, E_SMOOTH, { tw: -0.55, ln: 0.14, h: -0.17, la: [0.75, 0, -0.15], ra: [0.75, 0, 0.15], ll: [-0.35, 0, -0.08], rr: [0.3, 0, 0.08] }],
  [0.3, E_OUT, { tw: 1.4, ln: -0.06, h: 0.38, la: [-2.6, 0, -0.3], ra: [-2.6, 0, 0.3], ll: [-1.0, 0, -0.05], rr: [0.25, 0, 0.05] }],
  [0.46, E_LINEAR, { tw: 4.71, ln: -0.08, rl: 0.32, h: 0.62, la: [-0.2, 0, -1.35], ra: [-0.2, 0, 1.35], ll: [-0.95, 0, -0.1], rr: [-0.25, 0, 1.35] }],
  [0.62, E_OUT, { tw: 5.9, ln: 0, rl: 0.1, h: 0.25, la: [-0.6, 0, -0.9], ra: [-0.6, 0, 0.9], ll: [-0.35, 0, -0.2], rr: [-0.2, 0, 0.35] }],
  [0.8, E_OUT, { tw: TWO_PI, ln: 0.06, h: -0.16, la: [0.65, 0, -0.15], ra: [-1.5, 0, -0.1], ll: [-0.05, 0, -0.5], rr: [-0.05, 0, 0.5] }],
  [1, E_SMOOTH, { tw: TWO_PI, ln: 0.02, la: [-0.15, 0, 0], ra: [-0.3, 0, 0] }]
]);

// ───────────── 玩家：球棒 ─────────────
// 1 橫掃千軍：腰身右轉蓄勢 → 帶動球棒自右向左大幅橫掃
const BAT_1 = defineMove('橫掃千軍', { dur: 0.48, strike: 0.42, cancel: 0.62, arc: -0.3 }, [
  [0.28, E_SMOOTH, { tw: 1.3, ln: -0.06, rl: -0.08, h: -0.08, la: [-1.3, 0, 0.3], ra: [-0.15, 0, 1.45], ll: [-0.45, 0, -0.15], rr: [0.35, 0, 0.15] }],
  [0.42, E_IN, { tw: -0.5, ln: 0.12, rl: 0.1, h: -0.12, la: [0.5, 0, -0.6], ra: [-0.15, -0.25, 1.5], ll: [-0.55, 0, -0.2], rr: [0.45, 0, 0.2] }],
  [0.68, E_OUT, { tw: -1.3, ln: 0.1, rl: 0.14, h: -0.1, la: [0.6, 0, -0.8], ra: [-0.3, -0.45, 1.25], ll: [-0.5, 0, -0.2], rr: [0.45, 0, 0.2] }],
  [1, E_SMOOTH, { tw: -0.15, la: [-0.1, 0, 0], ra: [-0.2, 0, 0.15] }]
]);
// 2 回身反掃：轉身背對收棒 → 反手自左向右回掃
const BAT_2 = defineMove('回身反掃', { dur: 0.5, strike: 0.42, cancel: 0.62, arc: -0.3 }, [
  [0.26, E_SMOOTH, { tw: -2.0, ln: 0.05, rl: 0.08, h: -0.08, la: [0.4, 0, -0.7], ra: [-1.25, 0.8, -0.55], ll: [0.35, 0, -0.2], rr: [-0.45, 0, 0.15] }],
  [0.42, E_IN, { tw: 0.35, ln: 0.1, rl: -0.12, h: -0.12, la: [0.5, 0, -1.0], ra: [-0.35, 0.2, 1.45], ll: [0.45, 0, -0.25], rr: [-0.5, 0, 0.2] }],
  [0.66, E_OUT, { tw: 1.2, ln: 0.08, rl: -0.14, h: -0.1, la: [0.45, 0, -0.9], ra: [-0.4, 0, 1.3], ll: [0.4, 0, -0.25], rr: [-0.45, 0, 0.2] }],
  [1, E_SMOOTH, { tw: 0.1, la: [-0.1, 0, 0], ra: [-0.2, 0, 0.15] }]
]);
// 3 躍起下劈：屈膝起跳、雙手舉棒過頂 → 落地沉身全力下劈 (終結技)
const BAT_3 = defineMove('躍起下劈', { dur: 0.66, strike: 0.5, cancel: 0.95, reach: 1.05, arc: 0.1, dmg: 1.1, knock: 1.5, finisher: true }, [
  [0.18, E_SMOOTH, { ln: 0.1, h: -0.15, la: [0.55, 0, -0.1], ra: [0.55, 0, 0.1], ll: [-0.3, 0, -0.05], rr: [0.3, 0, 0.05] }],
  [0.36, E_OUT, { tw: 0.15, ln: -0.28, h: 0.45, la: [-2.85, 0, 0.3], ra: [-2.9, 0, -0.1], ll: [-0.85, 0, -0.05], rr: [-0.25, 0, 0.05] }],
  [0.5, E_IN, { tw: -0.05, ln: 0.42, h: -0.06, la: [-1.0, 0, 0.35], ra: [-0.15, 0, -0.05], ll: [-0.6, 0, -0.08], rr: [0.6, 0, 0.08] }],
  [0.72, E_OUT, { tw: -0.05, ln: 0.4, h: -0.2, la: [-0.85, 0, 0.3], ra: [0.25, 0, -0.05], ll: [-0.75, 0, -0.12], rr: [0.75, 0, 0.12] }],
  [1, E_SMOOTH, { ln: 0.02, la: [-0.1, 0, 0], ra: [-0.15, 0, 0.1] }]
]);

// ───────────── 玩家：特訓院防暴警棍 ─────────────
// 1 上步斜劈：持棍高舉 → 上步沉身自右上向左下斜劈
const BATON_1 = defineMove('上步斜劈', { dur: 0.46, strike: 0.42, cancel: 0.62 }, [
  [0.26, E_SMOOTH, { tw: 0.6, ln: -0.1, h: -0.04, la: [-0.9, 0, -0.3], ra: [-2.6, 0, 0.55], ll: [0.3, 0, -0.05], rr: [-0.2, 0, 0.05] }],
  [0.42, E_IN, { tw: -0.4, ln: 0.22, h: -0.12, la: [0.55, 0, -0.35], ra: [0.1, 0, -0.35], ll: [0.45, 0, -0.08], rr: [-0.6, 0, 0.08] }],
  [0.66, E_OUT, { tw: -0.5, ln: 0.18, h: -0.11, la: [0.6, 0, -0.4], ra: [0.35, 0, -0.45], ll: [0.42, 0, -0.08], rr: [-0.55, 0, 0.08] }],
  [1, E_SMOOTH, { la: [-0.1, 0, 0], ra: [-0.2, 0, 0.1] }]
]);
// 2 轉腕回挑：棍收左下 → 翻腕自下而上挑擊
const BATON_2 = defineMove('轉腕回挑', { dur: 0.42, strike: 0.42, cancel: 0.62 }, [
  [0.26, E_SMOOTH, { tw: -0.55, ln: 0.12, h: -0.1, la: [-0.6, 0, -0.3], ra: [0.35, 0.6, -0.5], ll: [-0.35, 0, -0.08], rr: [0.35, 0, 0.08] }],
  [0.42, E_IN, { tw: 0.35, ln: -0.1, h: 0.03, la: [0.5, 0, -0.5], ra: [-2.1, -0.3, 0.45], ll: [-0.2, 0, -0.05], rr: [0.25, 0, 0.05] }],
  [0.68, E_OUT, { tw: 0.45, ln: -0.12, h: 0.02, la: [0.55, 0, -0.55], ra: [-2.4, -0.4, 0.5], ll: [-0.2, 0, -0.05], rr: [0.25, 0, 0.05] }],
  [1, E_SMOOTH, { la: [-0.1, 0, 0], ra: [-0.2, 0, 0.1] }]
]);
// 3 旋身橫打：蓄勢後旋身一圈，警棍平舉橫打 (終結技)
const BATON_3 = defineMove('旋身橫打', { dur: 0.66, strike: 0.5, cancel: 1, reach: 1.1, arc: -1, dmg: 1.1, knock: 1.5, finisher: true }, [
  [0.2, E_SMOOTH, { tw: 0.8, ln: -0.04, h: -0.1, la: [-1.1, 0, 0.2], ra: [-0.2, 0, 1.2], ll: [-0.35, 0, -0.15], rr: [0.3, 0, 0.15] }],
  [0.5, E_IN, { tw: -TWO_PI - 0.35, ln: 0.1, rl: 0.12, h: -0.12, la: [0.3, 0, -1.2], ra: [-0.2, -0.3, 1.5], ll: [-0.45, 0, -0.25], rr: [0.4, 0, 0.25] }],
  [0.72, E_OUT, { tw: -TWO_PI - 1.0, ln: 0.08, rl: 0.14, h: -0.12, la: [0.35, 0, -1.1], ra: [-0.3, -0.4, 1.3], ll: [-0.45, 0, -0.25], rr: [0.4, 0, 0.25] }],
  [1, E_SMOOTH, { tw: -TWO_PI, la: [-0.1, 0, 0], ra: [-0.2, 0, 0.1] }]
]);

// 羽球拍：側身引拍 → 轉腰揮拍 (4F 羽球賽，不連段)
const RACKET = defineMove('揮拍', { dur: 0.38, strike: 0.36, cancel: 1 }, [
  [0.22, E_SMOOTH, { tw: 0.6, ln: -0.05, la: [-0.9, 0, -0.2], ra: [-1.6, 0, 0.9], ll: [-0.25, 0, 0], rr: [0.2, 0, 0] }],
  [0.36, E_IN, { tw: -0.35, ln: 0.12, la: [0.3, 0, -0.3], ra: [-1.3, 0, -0.2], ll: [-0.3, 0, 0], rr: [0.25, 0, 0] }],
  [0.65, E_OUT, { tw: -0.45, ln: 0.1, la: [0.35, 0, -0.3], ra: [-0.6, 0, -0.3], ll: [-0.3, 0, 0], rr: [0.25, 0, 0] }],
  [1, E_SMOOTH, REST]
]);

export const PLAYER_COMBOS = {
  FIST: [FIST_1, FIST_2, FIST_3],
  BAT: [BAT_1, BAT_2, BAT_3],
  BATON: [BATON_1, BATON_2, BATON_3],
  RACKET: [RACKET]
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
  // 出招預備進度：0 = 剛起手、1 = 到達命中時間點 (無招式時為 0)
  public get strikeProgress(): number { return this.move ? this.time / (this.move.strike * this.move.dur * this.scale) : 0; }

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
