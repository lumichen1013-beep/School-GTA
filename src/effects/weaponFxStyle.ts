// 武器連段特效樣式表 (拖尾與武器發光共用；地裂特效可沿用 color)；各武器 / 世界變體使用哪一組見 src/weapons/defs
export type WeaponFxId = 'FIST' | 'BAT' | 'GOLD' | 'BATON' | 'RACKET' | 'DUAL_R' | 'DUAL_L' | 'BOOK' | 'BALL' | 'STONE';

// 元素主題：決定命中特效的附加層 (見 effects/meleeHitFx)
// IMPACT 氣勁 (拳)、WOOD 木屑重擊塵 (普通棒)、THUNDER 落雷 (黃金棒)、ELECTRIC 電弧 (警棍)、WIND 羽毛風切 (羽球拍 / 雙燕)、
// PAGE 書頁紛飛 (綁帶捆書)、KI 氣功波 (籃球)、STONE 石屑 (彈弓)
export type FxElement = 'IMPACT' | 'WOOD' | 'THUNDER' | 'ELECTRIC' | 'WIND' | 'PAGE' | 'KI' | 'STONE';

// 拖尾三色漸層：tipColor = 亮核心 (外緣亮帶)、color = 主色外層、tail = 尾端變色 (殘影越舊越偏此色)。
// 皆為高飽和色；拖尾以預乘 alpha 近乎不透明地蓋住背景，白地磚與暮紅結界下都看得到 (不靠加法發光)
export interface WeaponFxStyle {
  color: number;     // 主色 (拖尾外層 / 命中星芒 / 碎片主色)
  tipColor: number;  // 亮核心色 (拖尾外緣亮帶 / 星芒白熱芯)
  tail?: number;     // 尾端變色 (拖尾殘影尾段 / 碎片副色)；未設 = 主色
  intensity: number; // 拖尾覆蓋率 (0..1.5，越高越不透明)
  life: number;      // 拖尾壽命 (秒)
  tipExt?: number;   // 拖尾自武器尖端再往外延伸的長度 (公尺)；誇大揮擊範圍感，外緣不超過判定距離 (見 tests/weaponFx.test.ts)；未設 = 0.3
  glow: number;      // 武器 emissive 脈衝峰值 (0 = 不發光)
  impact: number;    // 終結技地裂 / 衝擊波環顏色
  element?: FxElement; // 未設 = IMPACT
}

export const WEAPON_FX_STYLES: Record<WeaponFxId, WeaponFxStyle> = {
  // 拳：氣勁 — 白青核心、天青外層、尾端轉靛藍
  FIST:   { color: 0x22d3ff, tipColor: 0xe6fdff, tail: 0x4b4dff, intensity: 1.15, life: 0.2,  tipExt: 0.8, glow: 0,   impact: 0x3fdcff, element: 'IMPACT' },
  // 普通棒：木屑重擊 — 奶油核心、烈橙外層、尾端轉焦木棕
  BAT:    { color: 0xff7a14, tipColor: 0xfff0c2, tail: 0x9a4a12, intensity: 1.2,  life: 0.24, tipExt: 1.55,  glow: 0.6, impact: 0xff7a14, element: 'WOOD' },
  // 黃金雷霆棒：落雷 — 純白核心、亮金外層、尾端轉電光藍 (與普通棒的橙 → 棕明顯區隔)
  GOLD:   { color: 0xffcc00, tipColor: 0xffffff, tail: 0x2fb8ff, intensity: 1.35, life: 0.28, tipExt: 2.05, glow: 1.6, impact: 0xffd21a, element: 'THUNDER' },
  // 防暴警棍 (特訓院)：電弧 — 冰白核心、警示藍外層、尾端轉電紫
  BATON:  { color: 0x2f7bff, tipColor: 0xe6f4ff, tail: 0x9b3dff, intensity: 1.2,  life: 0.22, tipExt: 1.4,  glow: 0.6, impact: 0x3d8bff, element: 'ELECTRIC' },
  // 羽球拍 (4F 賽)：風切 — 薄荷白核心、翠綠外層、尾端轉天藍
  RACKET: { color: 0x14e07a, tipColor: 0xeafff4, tail: 0x12a8ff, intensity: 1.1,  life: 0.2,  tipExt: 0.45, glow: 0,   impact: 0x14e07a, element: 'WIND' },
  // 雙燕羽刃：右拍青綠 → 尾端海藍、左拍櫻粉 → 尾端紫
  DUAL_R: { color: 0x2ef2c8, tipColor: 0xeafffb, tail: 0x1d6bff, intensity: 1.3,  life: 0.22, tipExt: 0.55,  glow: 0.9, impact: 0x2ef2c8, element: 'WIND' },
  DUAL_L: { color: 0xff6fcf, tipColor: 0xfff0fa, tail: 0x8b3dff, intensity: 1.3,  life: 0.22, tipExt: 0.55,  glow: 0.9, impact: 0xff6fcf, element: 'WIND' },
  // 綁帶捆書：紙白 / 墨藍；模型不發光，glow 1 只作出招進度訊號 (終結技 ×2 供模型辨識，見 bookWhipModel)；書軌跡弧光由模型自繪 (不走拖尾)
  BOOK:   { color: 0xf3efe2, tipColor: 0x3d5fd0, tail: 0x4f6fdc, intensity: 1.25, life: 0.2,  tipExt: 0,    glow: 1,   impact: 0x4f6fdc, element: 'PAGE' },
  // 籃球：橘色 (命中閃光 / 第 3 投衝擊環)；球不揮拖尾 (光痕由投射物 TracerFX 負責)
  BALL:   { color: 0xff8a2a, tipColor: 0xffd0a0, tail: 0xff4d1a, intensity: 1.0,  life: 0.15, tipExt: 0,    glow: 0,   impact: 0xff8a2a, element: 'KI' },
  // 彈弓：淡金 / 米白 (蓄力光環 / 光痕 / 命中閃光)；不揮拖尾
  STONE:  { color: 0xffd98a, tipColor: 0xfff4d6, tail: 0xc9a25a, intensity: 1.0,  life: 0.15, tipExt: 0,    glow: 0,   impact: 0xffd98a, element: 'STONE' },
};

// 第三段 (終結技) 加強倍率：ext = 尖端外延長度、life = 拖尾壽命、brightness = 覆蓋率、glow = 武器發光
export const FINISHER_FX_BOOST = { ext: 1.45, life: 1.7, brightness: 1.25, glow: 2 } as const;

// 取色單一入口：一般直接查 WEAPON_FX_STYLES；覺醒等暫時狀態可登記覆寫 (玩家向陽覺醒改朝陽配色)，清除後回原表
export type WeaponFxOverride = (id: WeaponFxId, base: WeaponFxStyle) => WeaponFxStyle;
let fxOverride: WeaponFxOverride | null = null;

export function weaponFxStyle(id: WeaponFxId): WeaponFxStyle {
  const base = WEAPON_FX_STYLES[id];
  return fxOverride ? fxOverride(id, base) : base;
}

export function setWeaponFxOverride(fn: WeaponFxOverride | null) {
  fxOverride = fn;
}

export function hasWeaponFxOverride(): boolean {
  return fxOverride !== null;
}
