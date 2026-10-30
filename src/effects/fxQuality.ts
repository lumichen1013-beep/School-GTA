import { Engine } from '../core/Engine';

// 連段特效品質等級 (僅影響視覺密度，遊戲規則不隨裝置變)
export interface FxQuality {
  mobile: boolean;
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
}

const HIGH: FxQuality = {
  mobile: false, trailPoints: 14, trailSubdiv: 2,
  crackPool: 3, crackLife: 1.8, crackMaxSize: 9, crackLayers: 3, ringReach: 1, slashLenScale: 1, slashWidthScale: 1, ringPool: 8, debrisCount: 24, dustPool: 8,
  lightningStrands: 5, lightningSegments: 6,
  slashPool: 20, flashPerStrike: 3, featherPool: 24,
};

const MOBILE: FxQuality = {
  mobile: true, trailPoints: 14, trailSubdiv: 0,
  crackPool: 2, crackLife: 1.2, crackMaxSize: 3.6, crackLayers: 2, ringReach: 0.75, slashLenScale: 0.8, slashWidthScale: 0.6, ringPool: 4, debrisCount: 14, dustPool: 0,
  lightningStrands: 3, lightningSegments: 6,
  slashPool: 10, flashPerStrike: 1, featherPool: 10,
};

let _quality: FxQuality | null = null;

// 依裝置取得品質等級 (首次呼叫時決定並快取)
export function getFxQuality(): FxQuality {
  if (!_quality) _quality = Engine.isMobileDevice() ? MOBILE : HIGH;
  return _quality;
}
