import { PLAYER_COMBOS } from '../../entities/shared/kungfu';
import { soundManager } from '../../audio/SoundEffects';
import { buildRacket } from '../models/racketModel';
import type { WeaponOverrideDefinition } from '../types';

// 4F 羽球賽場景覆寫：只換外觀 / 招式 / 拖尾 / 錨點 / 音效 (起手破風聲、打中人時清脆擊球聲；擊中羽球的聲音由 TennisGame 負責)，數值仍取目前武器
export const OVERRIDE_RACKET: WeaponOverrideDefinition = {
  id: 'RACKET',
  name: '羽球拍',
  combo: PLAYER_COMBOS.RACKET,
  tempo: 1,
  fxStyle: 'RACKET',
  impactClass: 'LIGHT',
  model: { mount: 'R', build: buildRacket },
  anchors: { R: { base: 0.66, tip: 0.98 } },
  sounds: { start: (pos) => soundManager.playBadmintonWhoosh(pos), strike: (_i, pos, _f, _s, landed) => { if (landed) soundManager.playBadmintonHit(pos); } },
  readyPose: 'WEAPON'
};
