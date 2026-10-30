// 武器連段特效樣式表 (拖尾與武器發光共用；地裂特效可沿用 color)
export type WeaponFxId = 'FIST' | 'BAT' | 'GOLD' | 'BATON' | 'RACKET';

export interface WeaponFxStyle {
  color: number;     // 拖尾握把端 / 主色
  tipColor: number;  // 拖尾尖端色
  intensity: number; // 拖尾亮度
  life: number;      // 拖尾壽命 (秒)
  glow: number;      // 武器 emissive 脈衝峰值 (0 = 不發光)
  impact: number;    // 終結技地裂 / 衝擊波環顏色
}

export const WEAPON_FX_STYLES: Record<WeaponFxId, WeaponFxStyle> = {
  FIST:   { color: 0x9be7ff, tipColor: 0x9be7ff, intensity: 0.9,  life: 0.16, glow: 0, impact: 0x7fe8ff },
  BAT:    { color: 0xffb060, tipColor: 0xffd49a, intensity: 1.1,  life: 0.18, glow: 0.6, impact: 0xff8a3d },
  GOLD:   { color: 0xffc94a, tipColor: 0xfff3b0, intensity: 1.4,  life: 0.21, glow: 1.6, impact: 0xffc94a },
  BATON:  { color: 0x4da3ff, tipColor: 0x4da3ff, intensity: 1.15, life: 0.18, glow: 0.6, impact: 0x4da3ff },
  RACKET: { color: 0x6dffb0, tipColor: 0x6dffb0, intensity: 0.8,  life: 0.13, glow: 0, impact: 0x6dffb0 },
};

// 拖尾條帶寬度倍率 (以握把 → 尖端線段長為基準，兩端外擴)：一般招式 / 第三段 (終結技)
export const TRAIL_WIDTH = 1.6;
// 第三段 (終結技) 加強倍率
export const FINISHER_FX_BOOST = { width: 2.0, life: 1.9, brightness: 1.5, glow: 2 } as const;

// 由連段套組與武器判定樣式：警棍 = 第二世界 (DETENTION) 持普通棒，Player 以 BATON 套組表示
export function resolveWeaponFxId(comboSet: 'FIST' | 'BAT' | 'BATON' | 'RACKET', gold: boolean): WeaponFxId {
  if (comboSet === 'BAT') return gold ? 'GOLD' : 'BAT';
  return comboSet;
}
