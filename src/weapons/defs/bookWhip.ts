import { PLAYER_COMBOS } from '../../entities/shared/kungfu';
import { soundManager } from '../../audio/SoundEffects';
import { buildBookWhip } from '../models/bookWhipModel';
import type { WeaponDefinition } from '../types';

// 綁帶捆書 (溜溜球式長鞭，開發中 release 'dev')：平常手持書堆，出招時抓綁帶末端把書甩出、打完收回 (模型見 bookWhipModel)。
// 第 1 段扇形橫掃、第 2 段前方長條抽擊 (+ 回彈追擊)，兩段群攻只扣血不位移 (同全武器規則)；第 3 段旋身繞圈群攻並擊飛 (約 3.5 ~ 4m)。
// 定位：單發中等、出手慢 (每甩後有收書空檔)、範圍大，秒傷為近戰最低；「不易近身」靠 4.2m 距離與第 3 段擊飛體現。
// 判定形狀沿用扇形 / 長條 / 圓形 (外緣 = 書的甩出軌跡，內側 = 綁帶掃過)。只限校園，贏游泳比賽 (小魚) 解鎖。
// 以函式包裝：頂層不執行物件建構，僅在 registry 呼叫時才建立。
export function createBookWhip(): WeaponDefinition {
  return {
    id: 'BOOK_WHIP',
    release: 'dev',
    slot: 5,
    icon: '📚',
    name: '綁帶捆書',
    banner: { campus: '📚 切換武器：綁帶捆書 (ATK 30 群攻長鞭，開發中)', detention: '' },
    stats: { damage: 30, reach: 4.2, knockback: 7.5 },
    launchCap: { h: 9.5, v: 5.4 }, // 旋鞭橫掃 (慢招) 主目標約飛 3.5 ~ 4m、滯空約 0.4 秒 (只作用於第 3 段；第 1、2 段只扣血)
    combo: PLAYER_COMBOS.WHIP,
    tempo: 1,
    fxStyle: 'BOOK',
    finisherFx: { waistY: 1.0, feathers: true, featherColors: [0xf3efe2, 0xfaf7ee, 0x4f6fdc] },
    model: { mount: 'R', build: buildBookWhip },
    // 不設錨點：綁帶會彎曲，一般揮擊拖尾 (握把 → 尖端直線) 對不上，改由模型自繪書軌跡弧光
    anchors: {},
    sounds: {
      // 起手破空 (書甩出)、主擊鞭梢脆響、額外擊 (回彈) 書堆悶響
      start: (pos) => soundManager.playThrowWhoosh(pos),
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
