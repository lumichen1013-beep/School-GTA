import { createSlingRelease } from '../slingshot/releaseMove';
import { SLING } from '../slingshot/ballistics';
import { buildSlingshot } from '../models/slingshotModel';
import type { WeaponDefinition } from '../types';

// 彈弓 (狙擊型遠程，遠程)：單發加蓄力 (不走三段連段)。按住左鍵 / F (手機長按攻擊鍵) 蓄力並開鏡，放開射擊；
// 蓄力 0.25 秒起可射 (傷害 40%)，0.7 秒滿蓄力 (100%)，彈速 40 → 70 m/s，30m 內全額、30 → 50m 線性衰減到 70%，爆頭 ×1.6。
// 不穿透、不擊退 (LIGHT)，被打的 NPC 照常轉為追擊。只限校園，跑操場贏阿凱解鎖。
// 以函式包裝：頂層不執行物件建構，僅在 registry 呼叫時才建立。
export function createSlingshot(): WeaponDefinition {
  return {
    id: 'SLINGSHOT',
    slot: 7,
    icon: '🎯',
    name: '彈弓',
    banner: { campus: '🎯 切換武器：彈弓 (ATK 60 蓄力狙擊，按住左鍵 / F 開鏡)', detention: '' },
    stats: { damage: SLING.damage, reach: SLING.range, knockback: 0 },
    combo: createSlingRelease(),
    tempo: 1,
    fxStyle: 'STONE',
    impactClass: 'LIGHT',
    finisherFx: {},
    ranged: { speed: SLING.speedMax, range: SLING.range, catchDelay: SLING.afterShot, dpsDistance: SLING.falloffNear, charged: true },
    model: { mount: 'R', build: buildSlingshot },
    anchors: {},
    sounds: {},
    readyPose: 'SLING_AIM',
    unlock: {
      lockedHint: (_p, world) => world === 'DETENTION'
        ? '⚠️ 特訓院管制區：器材已遭沒收！'
        : '🔒 彈弓未解鎖！需在操場贏得跑操場比賽 (阿凱)',
      steps: (p) => [{ label: '跑操場比賽獲勝', cur: p.trackWon ? 1 : 0, max: 1 }]
    },
    worlds: { CAMPUS: true, DETENTION: false }
  };
}
