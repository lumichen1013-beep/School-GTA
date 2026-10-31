import type { KfMove } from '../entities/shared/kungfu';
import { AOE_SECONDARY_DMG, strikeDmg, strikeRoute } from '../entities/shared/kungfu';
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
  // 群攻估算：只有帶非終結技群攻 (aoe) 招式的武器 (如綁帶捆書) 才有，null = 不顯示；人數 = GROUP_TARGETS
  groupDps: number | null;
  groupTargets: number;
}

// 群攻秒傷估算的目標人數 (主目標全額，其餘 × AOE_SECONDARY_DMG，逐人取整同 CombatSystem.applyPlayerHitToNpc)
export const GROUP_TARGETS = 3;

// 逐擊 Math.round(基礎攻擊 × 倍率)；耗時 = Σ(cancel × dur × tempo)
export function summarizeCombo(combo: readonly KfMove[], baseDamage: number, tempo: number): WeaponSummary {
  let totalDamage = 0;
  let totalSeconds = 0;
  let groupDamage = 0;
  let hasGroupMove = false;
  const moves = combo.map((m): MoveSummary => {
    const mults: number[] = [];
    for (let i = 0; i <= m.extraStrikes.length; i++) mults.push(strikeDmg(m, i));
    const damage = mults.reduce((sum, k) => sum + Math.round(baseDamage * k), 0);
    totalDamage += damage;
    if (!m.finisher && m.aoe) hasGroupMove = true;
    for (let i = 0; i <= m.extraStrikes.length; i++) {
      const hit = baseDamage * strikeDmg(m, i);
      const targets = strikeRoute(m, i) === 'SINGLE' ? 1 : Math.min(GROUP_TARGETS, m.aoe!.max);
      groupDamage += Math.round(hit) + (targets - 1) * Math.max(1, Math.round(hit * AOE_SECONDARY_DMG));
    }
    totalSeconds += m.cancel * m.dur * tempo;
    return { name: m.name, finisher: m.finisher, mults, damage };
  });
  return {
    moves, totalDamage, totalSeconds, dps: totalSeconds > 0 ? totalDamage / totalSeconds : 0,
    groupDps: hasGroupMove && totalSeconds > 0 ? groupDamage / totalSeconds : null, groupTargets: GROUP_TARGETS
  };
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
