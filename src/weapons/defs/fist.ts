import { PLAYER_COMBOS } from '../../entities/shared/kungfu';
import { soundManager } from '../../audio/SoundEffects';
import type { WeaponDefinition } from '../types';

// 徒手拳擊：無手持模型，連段為拳腳 (終結技騰空旋風腿：腰高衝擊環 + 著地補環)
export const FIST: WeaponDefinition = {
  id: 'FIST',
  release: 'released',
  slot: 1,
  icon: '🥊',
  name: '徒手拳擊',
  banner: { campus: '🥊 切換武器：徒手拳擊 (ATK 25)', detention: '🥊 切換模式：徒手潛入 (支援背後暗殺)' },
  stats: { damage: 25, reach: 2.2, knockback: 7.5 },
  launchCap: { h: 9.8, v: 5.3 }, // 終結技主目標約飛 4.0m
  combo: PLAYER_COMBOS.FIST,
  tempo: 1,
  fxStyle: 'FIST',
  impactClass: 'MEDIUM',
  finisherFx: { waistY: 0.9, landRadius: 1.1 },
  anchors: {},
  // 命中才出聲：第 1 段拳「啪」、第 2 / 3 段腿「嘭」(與 NPC 出拳的 playPunch 區隔)，終結技疊低頻重擊；揮空破風由 impactClass 預設
  sounds: {
    strike: (_i, pos, fin, step, landed) => {
      if (!landed) return;
      if (step === 0) soundManager.playFistHit(pos); else soundManager.playKickHit(pos);
      if (fin) soundManager.playFinisherThump(pos, false);
    }
  },
  readyPose: 'FIST',
  unlock: null,
  worlds: { CAMPUS: true, DETENTION: true }
};
