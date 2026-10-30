import { PLAYER_COMBOS } from '../../entities/shared/kungfu';
import { soundManager } from '../../audio/SoundEffects';
import { buildDualRackets } from '../models/racketModel';
import type { WeaponDefinition } from '../types';

// 雙燕羽刃 (雙羽球拍二刀流)：每段多擊的輕快連段 (3 段共 7 擊，整套約 106 傷害)，右拍青綠、左拍櫻粉；
// 終結技「鬼斬」突進穿過敵群後收刀爆開，只有主擊擊飛。左手持械不撐傘，只限校園，擊敗羽球大如老師解鎖
export const DUAL_RACKET: WeaponDefinition = {
  id: 'DUAL_RACKET',
  slot: 4,
  icon: '🏸🏸',
  name: '雙燕羽刃',
  banner: { campus: '🏸🏸 切換神兵：雙燕羽刃 (ATK 16×7 連擊)', detention: '' },
  stats: { damage: 16, reach: 2.6, knockback: 9.0 },
  combo: PLAYER_COMBOS.DUAL,
  tempo: 1,
  fxStyle: { R: 'DUAL_R', L: 'DUAL_L' },
  finisherFx: { waistY: 1.0, feathers: true },
  model: { mount: 'BOTH', build: buildDualRackets },
  anchors: { R: { base: 0.5, tip: 1.0 }, L: { base: 0.5, tip: 1.0 } },
  sounds: { start: () => soundManager.playBadmintonWhoosh(), strike: () => soundManager.playBadmintonHit() },
  readyPose: 'DUAL',
  suppressUmbrella: true,
  unlock: {
    lockedHint: (_p, world) => world === 'DETENTION'
      ? '⚠️ 特訓院管制區：器材已遭沒收！'
      : '🔒 雙燕羽刃未解鎖！需在 4F 羽球賽擊敗羽球大如老師'
  },
  worlds: { CAMPUS: true, DETENTION: false }
};
