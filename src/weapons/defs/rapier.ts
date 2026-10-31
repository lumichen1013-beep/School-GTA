import { PLAYER_COMBOS } from '../../entities/shared/kungfu';
import { soundManager } from '../../audio/SoundEffects';
import { buildRapier, RAPIER_BLADE_BASE, RAPIER_BLADE_TIP } from '../models/rapierModel';
import type { WeaponDefinition } from '../types';
import { RAPIER_UNLOCK_BANNER } from '../../game/fencer/fencerStory';

// 玫瑰細劍 (花劍客首勝獎勵；release 與世界 Boss 花劍客同步：Boss 對所有玩家開放 → 正式)：快、準、遠的決鬥武器。
// 第 1 段「含苞點刺」2 刺、第 2 段「薔薇三重奏」3 刺：窄錐單體 (3.6m、±45°)，只扣血不位移 (同全武器規則)；
// 第 3 段「謝幕禮・千瓣綻放」突進 3.2m 後一線貫穿 (LINE 自突進起點起算，最多 4 人)，主擊沿面向擊飛約 6.0m。
// 秒傷約 140 (介於雙燕羽刃 132 與黃金雷霆棒 150)；群攻只有終結技且限一直線，清群仍以黃金棒為王。只限校園。
// 劇情文案集中於 fencerStory.ts (首勝過場「劍借你」的回禮)，這裡只補操作說明
export const RAPIER_UNLOCK_TEXT = `${RAPIER_UNLOCK_BANNER}(滾輪或大地圖【裝備】切換，ATK 30 突刺連段)`;

export function createRapier(): WeaponDefinition {
  return {
    id: 'RAPIER',
    release: 'released',
    slot: 8,
    icon: '🤺',
    name: '玫瑰細劍',
    banner: { campus: '🤺 切換神兵：玫瑰細劍 (ATK 30 突刺連段)', detention: '' },
    stats: { damage: 30, reach: 3.0, knockback: 12 },
    launchCap: { h: 12, v: 6.5 }, // 終結技主目標約飛 6.0m (滯空 0.5 秒)
    combo: PLAYER_COMBOS.RAPIER,
    tempo: 1,
    // 偶數擊玫瑰紅、奇數擊燃金 (命中星芒 / 碎片依命中序號分色；拖尾與發光取 R)
    fxStyle: { R: 'RAPIER', L: 'RAPIER_GOLD' },
    impactClass: 'HEAVY',
    finisherFx: { waistY: 1.1, feathers: true, featherColors: [0xe8173a, 0xff7aa2, 0xfff0f3, 0xffb000] },
    model: { mount: 'R', build: buildRapier },
    anchors: { R: { base: RAPIER_BLADE_BASE, tip: RAPIER_BLADE_TIP } },
    sounds: {
      // 起手：輕快高頻破風 (細劍不用 HEAVY 預設的低沉揮空音)
      start: (pos) => soundManager.playSwingWhoosh(pos, 1900, 0.09, false),
      // 每刺都有細劍金屬破空 (揮空也響，刺擊節奏感)；打中疊刀刃命中；終結技主擊花瓣綻放 + 打中再疊低頻重擊
      strike: (_i, pos, fin, _s, landed) => {
        soundManager.playRapierThrust(pos);
        if (landed) soundManager.playBanditSlash(pos);
        if (fin) {
          soundManager.playPetalBloom(pos);
          if (landed) soundManager.playFinisherThump(pos, false);
        }
      }
    },
    readyPose: 'FENCE',
    unlock: {
      lockedHint: (_p, world) => world === 'DETENTION'
        ? '⚠️ 特訓院管制區：器材已遭沒收！'
        : '🔒 玫瑰細劍未解鎖！需在操場擊敗世界 Boss【🎩 花劍客】(先去操場找那朵太陽花)',
      steps: (p) => [{ label: '擊敗花劍客', cur: p.fencerDefeated ? 1 : 0, max: 1 }]
    },
    worlds: { CAMPUS: true, DETENTION: false }
  };
}
