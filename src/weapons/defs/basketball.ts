import { PLAYER_COMBOS } from '../../entities/shared/kungfu';
import { buildBasketball } from '../models/basketballModel';
import type { WeaponDefinition } from '../types';

// 籃球 (遠程回收型，開發中 release 'dev')：三投連段 (胸前推傳 / 地板彈傳 / 高拋灌籃)，球命中後彈回手上；第 1、2 投推開 1.2m 並打斷前搖，
// 第 3 投擊飛。投出到接回之前不能攻擊 (攻擊鍵進 0.25 秒預輸入)，飛行中可移動 / 跳 / 衝刺 / 閃身。只限校園，小遊戲投籃累計進 10 球解鎖。
// 以函式包裝：頂層不執行物件建構，正式版 (DEV_WEAPONS_BUILD 為 false) 未引用時整個檔案可被 tree-shake。
export const BASKETBALL_UNLOCK_GOAL = 10;
export const BASKETBALL_SHOVE_DIST = 1.2;
export const BASKETBALL_CHAIN_WINDOW = 0.8; // 連段接續窗：自接到球起算

export function createBasketball(): WeaponDefinition {
  return {
    id: 'BASKETBALL',
    release: 'dev',
    slot: 6,
    icon: '🏀',
    name: '籃球',
    banner: { campus: '🏀 切換武器：籃球 (ATK 45 遠程三連投，開發中)', detention: '' },
    stats: { damage: 45, reach: 18, knockback: 9.0 },
    launchCap: { h: 9, v: 5 }, // 第 3 投命中約飛 3.5m
    combo: PLAYER_COMBOS.BALL,
    tempo: 1,
    fxStyle: 'BALL',
    finisherFx: {},
    chainWindow: BASKETBALL_CHAIN_WINDOW,
    ranged: { speed: 24, range: 18, catchDelay: 0.1, dpsDistance: 8 },
    model: { mount: 'R', build: buildBasketball },
    anchors: {},
    sounds: {},
    readyPose: 'WEAPON',
    unlock: {
      lockedHint: (p, world) => world === 'DETENTION'
        ? '⚠️ 特訓院管制區：器材已遭沒收！'
        : `🔒 籃球未解鎖！需在籃球場累計投進 ${BASKETBALL_UNLOCK_GOAL} 球 (目前進度: ${Math.min(p.basketballMade, BASKETBALL_UNLOCK_GOAL)}/${BASKETBALL_UNLOCK_GOAL})`,
      steps: (p) => [{ label: '累計投進籃框', cur: Math.min(p.basketballMade, BASKETBALL_UNLOCK_GOAL), max: BASKETBALL_UNLOCK_GOAL }]
    },
    worlds: { CAMPUS: true, DETENTION: false }
  };
}
