import { PLAYER_COMBOS } from '../../entities/shared/kungfu';
import { buildBasketball } from '../models/basketballModel';
import type { WeaponDefinition } from '../types';

// 籃球氣功彈 (遠程回收型，開發中 release 'dev')：三投連段 (氣勁推傳 / 迴旋快傳 / 灌籃氣功砲)，球灌氣化為 60 m/s 直線光束，
// 命中後化光極速收回手上 (0.1~0.3 秒)；第 1、2 投只扣血不位移，第 3 投擊飛約 5.5m 並以小範圍爆風推開近旁至多 2 人 (2.5m)。
// 投出到接回之前不能攻擊 (攻擊鍵進 0.25 秒預輸入，接球即自動接投)，飛行中可移動 / 跳 / 衝刺 / 閃身。只限校園，小遊戲投籃累計進 10 球解鎖。
// 以函式包裝：頂層不執行物件建構，僅在 registry 呼叫時才建立。
export const BASKETBALL_UNLOCK_GOAL = 10;
export const BASKETBALL_BLAST_RADIUS = 2.2;    // 終結段爆風半徑 (m，水平)
export const BASKETBALL_BLAST_MAX = 2;         // 爆風最多波及人數 (不含主目標)
export const BASKETBALL_BLAST_DMG = 0.5;       // 爆風傷害倍率 (相對終結段主擊)
export const BASKETBALL_BLAST_SHOVE = 2.5;     // 爆風推開距離 (m)：踉蹌 0.3 秒 + 2.5m ÷ 10 m/s ≥ 收招 0.22 秒 + 反應 0.3 秒
export const BASKETBALL_CHAIN_WINDOW = 0.8; // 連段接續窗：自接到球起算

export function createBasketball(): WeaponDefinition {
  return {
    id: 'BASKETBALL',
    release: 'dev',
    slot: 6,
    icon: '🏀',
    name: '籃球',
    banner: { campus: '🏀 切換武器：籃球氣功彈 (ATK 45 遠程光束三連投，開發中)', detention: '' },
    stats: { damage: 45, reach: 18, knockback: 11.0 },
    launchCap: { h: 11.5, v: 6.2 }, // 第 3 投命中約飛 5.5m (拳 4 / 雙拍 5 / 棒 5.4 / 黃金棒 7)
    combo: PLAYER_COMBOS.BALL,
    tempo: 1,
    fxStyle: 'BALL',
    finisherFx: {},
    chainWindow: BASKETBALL_CHAIN_WINDOW,
    ranged: { speed: 60, range: 18, catchDelay: 0.06, dpsDistance: 8 },
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
