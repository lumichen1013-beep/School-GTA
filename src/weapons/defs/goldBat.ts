import { PLAYER_COMBOS } from '../../entities/shared/kungfu';
import { soundManager } from '../../audio/SoundEffects';
import { buildGoldBat } from '../models/batModels';
import type { WeaponDefinition } from '../types';

// 特殊黃金雷霆棒球棍：沿用球棒連段但較沉重 (整體節奏放慢，沿用原本 0.48 / 0.42 揮棒間隔比例)，
// 下劈地裂附帶雷電、終結技群攻改讀招式上的黃金欄位
export const SPECIAL_BAT: WeaponDefinition = {
  id: 'SPECIAL_BAT',
  slot: 3,
  icon: '⚡',
  name: '黃金雷霆棒球棍',
  banner: { campus: '⚡ 切換神兵：黃金雷霆棒球棍 (ATK 68)', detention: '⚡ 切換神兵：黃金雷霆防暴棍 (ATK 68)' },
  stats: { damage: 68, reach: 3.8, knockback: 22.0 },
  launchCap: { h: 14, v: 6.5 }, // 終結技主目標約飛 7.0m
  combo: PLAYER_COMBOS.BAT,
  tempo: 1.14,
  fxStyle: 'GOLD',
  impactClass: 'GOLD',
  finisherFx: { slamBolt: true },
  useGoldAoe: true,
  model: { mount: 'R', build: buildGoldBat },
  anchors: { R: { base: 0.4, tip: 1.02 } },
  // 命中才出聲：雷霆轟擊 + 每擊雷電劈啪，終結技疊低頻重擊 (落地另有地裂音)；揮空破風 (低沉) 由 impactClass 預設
  sounds: {
    strike: (_i, pos, fin, _s, landed) => {
      if (!landed) return;
      soundManager.playSpecialBatHit(pos);
      soundManager.playZap(pos);
      if (fin) soundManager.playFinisherThump(pos, true);
    }
  },
  readyPose: 'WEAPON',
  unlock: {
    lockedHint: (p, world) => world === 'DETENTION'
      ? '⚠️ 特訓院管制區：重型管制武器已遭沒收封存！'
      : `🔒 特殊棒球棍未解鎖！需擊敗生教(1)、校犬(1)、火柴人自行車騎士(5) (目前: 教${p.teacherDefeatedCount}/1 犬${p.dogDefeatedCount}/1 車${p.bikePatrolDefeatedCount}/5)`
  },
  worlds: { CAMPUS: true, DETENTION: false }
};
