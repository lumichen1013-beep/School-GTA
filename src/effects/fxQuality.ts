// 連段特效品質等級 (僅影響視覺密度，遊戲規則不隨裝置變)。
// 物件池一律依 FX_POOL_MAX (各檔位最大值) 預建，執行期切換檔位只改變「實際使用量 / 尺寸 / 層數 / 開關」，不配置新物件。
export type FxTier = 'low' | 'medium' | 'high';

export interface FxQuality {
  chargeRingDouble: boolean; // 蓄力收束光環是否疊第二圈
  trailPoints: number;      // 揮擊拖尾歷史點數
  trailSubdiv: number;      // 每段 Catmull-Rom 插入點數 (0 = 不插值)
  crackPool: number;        // 地裂發光裂痕池
  crackLife: number;        // 裂痕壽命 (秒)
  crackMaxSize: number;     // 裂痕尺寸上限 (公尺)
  crackLayers: number;      // 每道裂痕疊層數 (3 = 焦黑底 / 色光 / 白熱芯；2 = 省略白熱芯)
  ringReach: number;        // 衝擊波環最大半徑倍率 (1 = 預設)
  slashLenScale: number;    // SlashFX 長條斬痕 / 光帶長度倍率
  slashWidthScale: number;  // SlashFX 長條斬痕 / 光帶寬度倍率
  ringPool: number;         // 衝擊波環池
  debrisCount: number;      // 碎石數
  dustPool: number;         // 塵土 billboard 數 (0 = 關閉)
  lightningStrands: number; // 雷電折線條數
  lightningSegments: number;// 每條折線段數
  slashPool: number;        // 斬痕 / 命中閃光實例池 (SlashFX)
  flashPerStrike: number;   // 每擊最多命中閃光數
  featherPool: number;      // 羽毛粒子池
  tracerPool: number;       // 投射物光痕槽數 (TracerFX；0 = 關閉)
  tracerLife: number;       // 光痕長度對應的秒數 (光痕長 = 彈速 × 此值)
  kiBeamLife: number;       // 籃球氣功彈光束殘影長度對應的秒數 (TracerFX 彗星樣式；低檔仍保留短光束)
  awakenMotes: number;      // 玩家向陽覺醒環身花瓣光點數 (不透明剪影，不混合)
  awakenPillar: boolean;    // 覺醒過場光柱 + 地面環 (加法混色，只在過場)
  sparkPool: number;        // 命中塊狀碎片池 (HitSparkFX，不透明低多邊形)
  sparkScale: number;       // 每次命中碎片數倍率 (impactClass 基準 × 此值)
  miniBolts: number;        // 小雷電 / 電弧同時存在條數 (黃金棒每擊落雷、棒身電弧、警棍電弧)
}

export const FX_PRESETS: Readonly<Record<FxTier, Readonly<FxQuality>>> = {
  high: {
    chargeRingDouble: true, trailPoints: 18, trailSubdiv: 2,
    crackPool: 3, crackLife: 1.8, crackMaxSize: 9, crackLayers: 3, ringReach: 1, slashLenScale: 1, slashWidthScale: 1, ringPool: 8, debrisCount: 24, dustPool: 8,
    lightningStrands: 5, lightningSegments: 6,
    slashPool: 20, flashPerStrike: 3, featherPool: 24,
    tracerPool: 8, tracerLife: 0.12, kiBeamLife: 0.11,
    awakenMotes: 16, awakenPillar: true,
    sparkPool: 64, sparkScale: 1, miniBolts: 6,
  },
  medium: {
    chargeRingDouble: true, trailPoints: 16, trailSubdiv: 1,
    crackPool: 3, crackLife: 1.5, crackMaxSize: 6, crackLayers: 3, ringReach: 0.88, slashLenScale: 0.9, slashWidthScale: 0.8, ringPool: 6, debrisCount: 18, dustPool: 4,
    lightningStrands: 4, lightningSegments: 6,
    slashPool: 14, flashPerStrike: 2, featherPool: 16,
    tracerPool: 8, tracerLife: 0.06, kiBeamLife: 0.075,
    awakenMotes: 12, awakenPillar: true,
    sparkPool: 40, sparkScale: 0.7, miniBolts: 4,
  },
  low: {
    chargeRingDouble: false, trailPoints: 14, trailSubdiv: 0,
    crackPool: 2, crackLife: 1.2, crackMaxSize: 3.6, crackLayers: 2, ringReach: 0.75, slashLenScale: 0.8, slashWidthScale: 0.6, ringPool: 4, debrisCount: 14, dustPool: 0,
    lightningStrands: 3, lightningSegments: 6,
    slashPool: 10, flashPerStrike: 1, featherPool: 10,
    tracerPool: 0, tracerLife: 0, kiBeamLife: 0.045,
    awakenMotes: 6, awakenPillar: false,
    sparkPool: 24, sparkScale: 0.45, miniBolts: 2,
  },
};

// 預建池容量：各數量欄位取所有檔位的最大值
type PoolField = 'trailPoints' | 'trailSubdiv' | 'crackPool' | 'crackLayers' | 'ringPool' | 'dustPool' | 'lightningStrands' | 'lightningSegments' | 'slashPool' | 'featherPool' | 'tracerPool' | 'awakenMotes' | 'sparkPool' | 'miniBolts';
const POOL_FIELDS: PoolField[] = ['trailPoints', 'trailSubdiv', 'crackPool', 'crackLayers', 'ringPool', 'dustPool', 'lightningStrands', 'lightningSegments', 'slashPool', 'featherPool', 'tracerPool', 'awakenMotes', 'sparkPool', 'miniBolts'];

export function computeFxPoolMax(presets: Readonly<Record<FxTier, Readonly<FxQuality>>>): Record<PoolField, number> {
  const out = {} as Record<PoolField, number>;
  for (const f of POOL_FIELDS) out[f] = Math.max(presets.high[f], presets.medium[f], presets.low[f]);
  return out;
}

export const FX_POOL_MAX: Readonly<Record<PoolField, number>> = computeFxPoolMax(FX_PRESETS);

let _tier: FxTier = 'medium';

// 目前檔位的特效參數 (每次呼叫皆回傳最新檔位，改檔後立即生效；呼叫端勿長期快取)
export function getFxQuality(): Readonly<FxQuality> {
  return FX_PRESETS[_tier];
}

export function getFxTier(): FxTier {
  return _tier;
}

export function setFxTier(tier: FxTier) {
  _tier = tier;
}
