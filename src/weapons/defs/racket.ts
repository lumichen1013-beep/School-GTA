import { PLAYER_COMBOS } from '../../entities/shared/kungfu';
import { soundManager } from '../../audio/SoundEffects';
import { buildRacket } from '../models/racketModel';
import type { WeaponOverrideDefinition } from '../types';

// 4F 羽球賽場景覆寫：只換外觀 / 招式 / 拖尾 / 錨點 / 音效 (起手破風聲、命中無打擊聲)，數值仍取目前武器
export const OVERRIDE_RACKET: WeaponOverrideDefinition = {
  id: 'RACKET',
  name: '羽球拍',
  combo: PLAYER_COMBOS.RACKET,
  tempo: 1,
  fxStyle: 'RACKET',
  model: { mount: 'R', build: buildRacket },
  anchors: { R: { base: 0.66, tip: 0.98 } },
  sounds: { start: (pos) => soundManager.playBadmintonWhoosh(pos) },
  readyPose: 'WEAPON'
};
