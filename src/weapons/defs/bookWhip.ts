import { PLAYER_COMBOS } from '../../entities/shared/kungfu';
import { soundManager } from '../../audio/SoundEffects';
import { buildBookWhip } from '../models/bookWhipModel';
import type { WeaponDefinition } from '../types';

// 綁帶捆書 (長鞭型，開發中 release 'dev')：第 1 段扇形橫掃、第 2 段前方長條抽擊 (+ 回彈追擊)，兩段皆為群攻推擊 (lightPush 0.5m，
// 打斷前搖、每 NPC 0.5 秒推擊免疫)，第 3 段旋身繞圈群攻並擊飛 (約 2.8m)。只限校園，贏游泳比賽 (小魚) 解鎖。
// 以函式包裝：頂層不執行物件建構，僅在 registry 呼叫時才建立。
export function createBookWhip(): WeaponDefinition {
  return {
    id: 'BOOK_WHIP',
    release: 'dev',
    slot: 5,
    icon: '📚',
    name: '綁帶捆書',
    banner: { campus: '📚 切換武器：綁帶捆書 (ATK 14 群攻長鞭，開發中)', detention: '' },
    stats: { damage: 14, reach: 4.2, knockback: 6.0 },
    launchCap: { h: 8, v: 4.6 }, // 旋鞭橫掃主目標約飛 2.8m
    combo: PLAYER_COMBOS.WHIP,
    tempo: 0.9,
    fxStyle: 'BOOK',
    finisherFx: { waistY: 1.0, feathers: true, featherColors: [0xf3efe2, 0xfaf7ee, 0x4f6fdc] },
    lightPush: 0.5,
    model: { mount: 'R', build: buildBookWhip },
    anchors: { R: { base: 0.3, tip: 1.5 } },
    sounds: {
      // 主擊甩鞭脆響，額外擊 (回彈) 書堆悶響
      strike: (i, pos) => { if (i === 0) soundManager.playWhipCrack(pos); else soundManager.playBookThud(pos); }
    },
    readyPose: 'WEAPON',
    unlock: {
      lockedHint: (_p, world) => world === 'DETENTION'
        ? '⚠️ 特訓院管制區：器材已遭沒收！'
        : '🔒 綁帶捆書未解鎖！需在游泳池贏得游泳比賽 (小魚)',
      steps: (p) => [{ label: '游泳比賽獲勝', cur: p.swimWon ? 1 : 0, max: 1 }]
    },
    worlds: { CAMPUS: true, DETENTION: false }
  };
}
