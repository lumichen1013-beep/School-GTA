// 武器連段特效樣式表 (拖尾與武器發光共用；地裂特效可沿用 color)；各武器 / 世界變體使用哪一組見 src/weapons/defs
export type WeaponFxId = 'FIST' | 'BAT' | 'GOLD' | 'BATON' | 'RACKET' | 'DUAL_R' | 'DUAL_L' | 'BOOK' | 'BALL';

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
  // 雙燕羽刃：右拍青綠、左拍櫻粉
  DUAL_R: { color: 0x2ef2c8, tipColor: 0xeafffb, intensity: 1.3,  life: 0.22, glow: 0.9, impact: 0x2ef2c8 },
  DUAL_L: { color: 0xff6fcf, tipColor: 0xfff0fa, intensity: 1.3,  life: 0.22, glow: 0.9, impact: 0xff6fcf },
  // 綁帶捆書：握把端紙白、尖端墨藍；模型不發光 (glow 0)
  BOOK:   { color: 0xf3efe2, tipColor: 0x3d5fd0, intensity: 1.25, life: 0.2,  glow: 0,   impact: 0x4f6fdc },
  // 籃球：橘色 (命中閃光 / 第 3 投衝擊環)；球不揮拖尾 (光痕由投射物 TracerFX 負責)
  BALL:   { color: 0xff8a2a, tipColor: 0xffd0a0, intensity: 1.0, life: 0.15, glow: 0,   impact: 0xff8a2a },
};

// 拖尾條帶寬度倍率 (以握把 → 尖端線段長為基準，兩端外擴)：一般招式 / 第三段 (終結技)
export const TRAIL_WIDTH = 1.6;
// 第三段 (終結技) 加強倍率
export const FINISHER_FX_BOOST = { width: 2.0, life: 1.9, brightness: 1.5, glow: 2 } as const;
