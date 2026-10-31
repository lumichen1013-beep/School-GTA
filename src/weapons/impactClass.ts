// 命中回饋分級 (純資料 + 純函式，可單元測試)：依武器重量統一停格、鏡頭震動、命中星芒數、碎片量與揮空破風音高。
// 武器定義以 impactClass 指定等級；招式上的 aoe.hitStop / shake (含黃金覆寫) 只作為終結技的「下限以上覆寫值」(取較大者)，
// 第 1、2 段與額外擊一律讀表。停格與震動屬遊戲手感，不隨 fxQuality 降級；星芒 / 碎片數量另受 fxQuality 上限約束。
//
// 新武器接入：在 WeaponDefinition 設 impactClass (LIGHT / MEDIUM / HEAVY / GOLD)，fxStyle 指到 WEAPON_FX_STYLES 一組 (含 element)，
// sounds.strike 依 (strikeIndex, pos, isFinisher, step, landed) 自行分層；未設 sounds.start 時由 impactClass 自動播揮空破風音。

export type ImpactClass = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'GOLD';

export interface ImpactProfile {
  readonly hitStop: number;          // 第 1、2 段主擊命中停格 (真實秒)
  readonly extraHitStop: number;     // 額外擊 (多段招式的追擊 / 終結技衝刺小擊) 停格
  readonly shake: number;            // 第 1、2 段主擊鏡頭震動 (trauma 0..1；實際位移 ≈ trauma² × 0.35m)
  readonly extraShake: number;       // 額外擊鏡頭震動
  readonly finisherHitStop: number;  // 終結技主擊停格下限 (單人)
  readonly finisherHitStopMulti: number; // 終結技主擊停格下限 (≥ 2 人)
  readonly finisherShake: number;    // 終結技主擊鏡頭震動下限
  readonly flashes: number;          // 每次命中星芒數 (另受 fxQuality.flashPerStrike 上限)
  readonly sparks: number;           // 每次命中塊狀碎片數 (高檔基準；fxQuality.sparkScale 縮放)
  readonly finisherSparks: number;   // 終結技主擊碎片數 (高檔基準)
  readonly ring: boolean;            // 第 1、2 段命中是否加徑向衝擊小環 (終結技一律加)
  readonly whooshHz: number;         // 揮空破風音中心頻率 (越重越低)
  readonly whooshLen: number;        // 揮空破風音長度 (秒)
}

export const IMPACT_PROFILES: Readonly<Record<ImpactClass, ImpactProfile>> = {
  LIGHT:  { hitStop: 0.04,  extraHitStop: 0.024, shake: 0.2,  extraShake: 0.14, finisherHitStop: 0.07, finisherHitStopMulti: 0.08, finisherShake: 0.4,  flashes: 1, sparks: 4,  finisherSparks: 10, ring: false, whooshHz: 1500, whooshLen: 0.12 },
  MEDIUM: { hitStop: 0.045, extraHitStop: 0.027, shake: 0.24, extraShake: 0.17, finisherHitStop: 0.08, finisherHitStopMulti: 0.09, finisherShake: 0.45, flashes: 1, sparks: 6,  finisherSparks: 14, ring: false, whooshHz: 1050, whooshLen: 0.15 },
  HEAVY:  { hitStop: 0.055, extraHitStop: 0.033, shake: 0.3,  extraShake: 0.2,  finisherHitStop: 0.09, finisherHitStopMulti: 0.1,  finisherShake: 0.6,  flashes: 2, sparks: 9,  finisherSparks: 20, ring: true,  whooshHz: 650,  whooshLen: 0.2 },
  GOLD:   { hitStop: 0.065, extraHitStop: 0.04,  shake: 0.36, extraShake: 0.24, finisherHitStop: 0.11, finisherHitStopMulti: 0.12, finisherShake: 0.8,  flashes: 2, sparks: 12, finisherSparks: 26, ring: true,  whooshHz: 480,  whooshLen: 0.24 },
};

// 終結技群攻覆寫欄位 (kungfu FinisherAoe 的子集)
export interface ImpactAoeOverride {
  readonly hitStop: number;
  readonly hitStopMulti: number;
  readonly shake: number;
  readonly hitStopGold?: number;
  readonly shakeGold?: number;
}

export interface ImpactFeedback { hitStop: number; shake: number }

// 命中回饋：finisherMain = 終結技主擊 (strikeIndex 0)；extra = 額外擊；multi = 本招命中 ≥ 2 人；
// hitShake = 招式自帶的一般命中震動 (取較大者)；aoe / gold = 終結技覆寫值 (黃金棒改讀 *Gold 欄位)。結果寫入 out (零配置)
export function impactFeedback(cls: ImpactClass, finisherMain: boolean, extra: boolean, multi: boolean,
  hitShake: number, aoe: ImpactAoeOverride | null, gold: boolean, out: ImpactFeedback): ImpactFeedback {
  const p = IMPACT_PROFILES[cls];
  if (finisherMain) {
    const aoeStop = aoe ? (gold && aoe.hitStopGold !== undefined ? aoe.hitStopGold : multi ? aoe.hitStopMulti : aoe.hitStop) : 0;
    const aoeShake = aoe ? (gold && aoe.shakeGold !== undefined ? aoe.shakeGold : aoe.shake) : 0;
    out.hitStop = Math.max(multi ? p.finisherHitStopMulti : p.finisherHitStop, aoeStop);
    out.shake = Math.max(p.finisherShake, aoeShake);
  } else if (extra) {
    out.hitStop = p.extraHitStop;
    out.shake = Math.max(p.extraShake, hitShake);
  } else {
    out.hitStop = p.hitStop;
    out.shake = Math.max(p.shake, hitShake);
  }
  return out;
}
