import type { KfMove } from '../entities/shared/kungfu';
import { AOE_SECONDARY_DMG, strikeDmg, strikeRoute } from '../entities/shared/kungfu';
import { getWeapon, resolveVariant } from '../weapons/registry';
import { returnDuration } from '../weapons/projectiles/collide';
import type { WeaponId, WeaponRanged, WeaponWorld } from '../weapons/types';

// 大地圖【裝備】分頁用的連段估算 (純計算，不影響戰鬥數值)
export interface MoveSummary {
  name: string;
  finisher: boolean;
  mults: number[];   // 各擊傷害倍率 (主擊 + 額外命中)
  damage: number;    // 該招各擊取整後總傷
}

// 遠程口徑秒傷：單發期望傷害 ÷ (前搖 + 去程 + 回程 + 接後緩衝)，依目標距離列出；dps 欄位取 standardDistance 的值
export const RANGED_DISTANCES: readonly number[] = [4, 8, 15];
export interface RangedSummary {
  standardDistance: number;
  distances: readonly number[];
  dpsAt: readonly number[]; // 與 distances 對應
}

export interface WeaponSummary {
  moves: MoveSummary[];
  totalDamage: number;  // 一套連段總傷
  totalSeconds: number; // 一套連段耗時 (各招於 cancel 時間點接續下一招)
  dps: number;          // 估算秒傷 = 總傷 ÷ 耗時
  // 群攻估算：只有帶非終結技群攻 (aoe) 招式的武器 (如綁帶捆書) 才有，null = 不顯示；人數 = GROUP_TARGETS
  groupDps: number | null;
  groupTargets: number;
  ranged: RangedSummary | null; // 遠程回收型武器才有 (dps 即為 standardDistance 的遠程秒傷)；近戰為 null
}

// 群攻秒傷估算的目標人數 (主目標全額，其餘 × AOE_SECONDARY_DMG，逐人取整同 CombatSystem.applyPlayerHitToNpc)
export const GROUP_TARGETS = 3;

// 逐擊 Math.round(基礎攻擊 × 倍率)；耗時 = Σ(cancel × dur × tempo)
// 一套連段於目標距離 d (m) 的耗時：Σ(前搖 strike × dur × tempo + 去程 d / 初速 + 回程 returnDuration(d) + 接後緩衝)
export function rangedSeconds(combo: readonly KfMove[], tempo: number, ranged: WeaponRanged, d: number): number {
  let seconds = 0;
  for (const m of combo) seconds += m.strike * m.dur * tempo + d / ranged.speed + returnDuration(d) + ranged.catchDelay;
  return seconds;
}

export function summarizeCombo(combo: readonly KfMove[], baseDamage: number, tempo: number, ranged?: WeaponRanged): WeaponSummary {
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
  if (ranged) {
    const dpsAt = RANGED_DISTANCES.map((d) => totalDamage / rangedSeconds(combo, tempo, ranged, d));
    totalSeconds = rangedSeconds(combo, tempo, ranged, ranged.dpsDistance);
    return {
      moves, totalDamage, totalSeconds, dps: totalDamage / totalSeconds, groupDps: null, groupTargets: GROUP_TARGETS,
      ranged: { standardDistance: ranged.dpsDistance, distances: RANGED_DISTANCES, dpsAt }
    };
  }
  return {
    moves, totalDamage, totalSeconds, dps: totalSeconds > 0 ? totalDamage / totalSeconds : 0,
    groupDps: hasGroupMove && totalSeconds > 0 ? groupDamage / totalSeconds : null, groupTargets: GROUP_TARGETS, ranged: null
  };
}

const cache = new Map<string, WeaponSummary>();

// 指定武器於指定世界的連段估算 (依武器 / 世界快取，僅首次計算)
export function getWeaponSummary(id: WeaponId, world: WeaponWorld): WeaponSummary {
  const key = `${id}|${world}`;
  let summary = cache.get(key);
  if (!summary) {
    const resolved = resolveVariant(id, world);
    summary = summarizeCombo(resolved.combo, getWeapon(id).stats.damage, resolved.tempo, getWeapon(id).ranged);
    cache.set(key, summary);
  }
  return summary;
}
