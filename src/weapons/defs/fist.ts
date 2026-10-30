import { PLAYER_COMBOS } from '../../entities/shared/kungfu';
import { soundManager } from '../../audio/SoundEffects';
import type { WeaponDefinition } from '../types';

// 徒手拳擊：無手持模型，連段為拳腳 (終結技騰空旋風腿：腰高衝擊環 + 著地補環)
export const FIST: WeaponDefinition = {
  id: 'FIST',
  slot: 1,
  icon: '🥊',
  name: '徒手拳擊',
  banner: { campus: '🥊 切換武器：徒手拳擊 (ATK 25)', detention: '🥊 切換模式：徒手潛入 (支援背後暗殺)' },
  stats: { damage: 25, reach: 2.2, knockback: 7.5 },
  combo: PLAYER_COMBOS.FIST,
  tempo: 1,
  fxStyle: 'FIST',
  finisherFx: { waistY: 0.9, landRadius: 1.1 },
  anchors: {},
  sounds: { strike: () => soundManager.playPunch() },
  readyPose: 'FIST',
  unlock: null,
  worlds: { CAMPUS: true, DETENTION: true }
};
