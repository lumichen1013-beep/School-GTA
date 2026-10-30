import type { KfMove } from '../entities/shared/kungfu';
import { strikeDmg } from '../entities/shared/kungfu';
import { getWeapon, resolveVariant } from '../weapons/registry';
import type { WeaponId, WeaponWorld } from '../weapons/types';

// 大地圖【裝備】分頁用的連段估算 (純計算，不影響戰鬥數值)
export interface MoveSummary {
  name: string;
  finisher: boolean;
  mults: number[];   // 各擊傷害倍率 (主擊 + 額外命中)
  damage: number;    // 該招各擊取整後總傷
}

export interface WeaponSummary {
  moves: MoveSummary[];
  totalDamage: number;  // 一套連段總傷
  totalSeconds: number; // 一套連段耗時 (各招於 cancel 時間點接續下一招)
  dps: number;          // 估算秒傷 = 總傷 ÷ 耗時
}

// 逐擊 Math.round(基礎攻擊 × 倍率)；耗時 = Σ(cancel × dur × tempo)
export function summarizeCombo(combo: readonly KfMove[], baseDamage: number, tempo: number): WeaponSummary {
  let totalDamage = 0;
  let totalSeconds = 0;
  const moves = combo.map((m): MoveSummary => {
    const mults: number[] = [];
    for (let i = 0; i <= m.extraStrikes.length; i++) mults.push(strikeDmg(m, i));
    const damage = mults.reduce((sum, k) => sum + Math.round(baseDamage * k), 0);
    totalDamage += damage;
    totalSeconds += m.cancel * m.dur * tempo;
    return { name: m.name, finisher: m.finisher, mults, damage };
  });
  return { moves, totalDamage, totalSeconds, dps: totalSeconds > 0 ? totalDamage / totalSeconds : 0 };
}

const cache = new Map<string, WeaponSummary>();

// 指定武器於指定世界的連段估算 (依武器 / 世界快取，僅首次計算)
export function getWeaponSummary(id: WeaponId, world: WeaponWorld): WeaponSummary {
  const key = `${id}|${world}`;
  let summary = cache.get(key);
  if (!summary) {
    const resolved = resolveVariant(id, world);
    summary = summarizeCombo(resolved.combo, getWeapon(id).stats.damage, resolved.tempo);
    cache.set(key, summary);
  }
  return summary;
}
