import { PLAYER_COMBOS } from '../../entities/shared/kungfu';
import { soundManager } from '../../audio/SoundEffects';
import { buildNormalBat } from '../models/batModels';
import type { WeaponDefinition } from '../types';

// 普通木質棒球棍；第二世界 (特訓院) 同一把武器改以特訓防暴警棍連段呈現 (終結技旋身橫打：腰高衝擊環)
export const NORMAL_BAT: WeaponDefinition = {
  id: 'NORMAL_BAT',
  release: 'released',
  slot: 2,
  icon: '🏏',
  name: '普通木質棒球棍',
  banner: { campus: '🏏 切換武器：普通木質棒球棍 (ATK 35)', detention: '🏏 切換裝備：特訓防暴警棍 (ATK 35)' },
  stats: { damage: 35, reach: 3.2, knockback: 14.0 },
  combo: PLAYER_COMBOS.BAT,
  tempo: 1,
  fxStyle: 'BAT',
  model: { mount: 'R', build: buildNormalBat },
  anchors: { R: { base: 0.35, tip: 0.89 } },
  sounds: { strike: (_i, pos) => soundManager.playBatHit(pos) },
  readyPose: 'WEAPON',
  unlock: {
    lockedHint: (p, world) => world === 'DETENTION'
      ? '🔒 防暴警棍未配發！完成特訓即可獲取裝備！'
      : `🔒 普通球棒未解鎖！需擊敗 5 位普通同學 (目前進度: ${p.studentDefeatedCount}/5)`
  },
  worlds: {
    CAMPUS: true,
    DETENTION: { name: '特訓防暴警棍', combo: PLAYER_COMBOS.BATON, fxStyle: 'BATON', finisherFx: { waistY: 1.0 } }
  }
};
