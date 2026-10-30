import { beforeEach, describe, expect, it, vi } from 'vitest';

// SoundEffects 於模組載入時會存取 window / document，以最小 mock 取代並記錄呼叫的音效函式
const sfx = vi.hoisted(() => ({
  playPunch: vi.fn(),
  playBatHit: vi.fn(),
  playSpecialBatHit: vi.fn(),
  playBadmintonWhoosh: vi.fn(),
  playBadmintonHit: vi.fn()
}));
vi.mock('../src/audio/SoundEffects', () => ({ soundManager: sfx }));

import { PLAYER_COMBOS } from '../src/entities/shared/kungfu';
import { getWeapon, getWeaponBySlot, resolveLoadout, WEAPONS } from '../src/weapons/registry';
import { buildNormalBat, buildGoldBat } from '../src/weapons/models/batModels';
import { buildRacket, buildDualRackets } from '../src/weapons/models/racketModel';
import type { WeaponId, WeaponOverrideId, WeaponWorld } from '../src/weapons/types';
import type * as THREE from 'three';

type SfxName = keyof typeof sfx;

// 重構前常數表 (自重構前 Player.ts / CombatSystem.ts / kungfu.ts 實際讀出)：
//  數值       Player.getWeaponDamage / getWeaponReach / getWeaponKnockback
//  招式組     Player.startComboMove (羽球拍 → RACKET、拳 → FIST、第二世界普通棒 → BATON、其餘 → BAT)
//  節奏       startComboMove：BAT 套組且持黃金棒 ×1.14
//  拖尾樣式   resolveWeaponFxId(comboSet, currentWeapon === 'SPECIAL_BAT')
//  錨點       sampleSwingAnchors 'W'：羽球拍 0.66/0.98、黃金棒 0.4/1.02、普通棒 0.35/0.89 (拳無可見武器 → 不取樣)
//  打擊音效   playStrikeSound：羽球拍無、黃金棒 playSpecialBatHit、普通棒 playBatHit、拳 playPunch；羽球拍起手 playBadmintonWhoosh
//  待機姿勢   applyCrouchReadyPose：拳且未持拍 → READY_RIGHT_FIST
//  終結特效   CombatSystem.onFinisherImpact：SLAM gold 參數 = 持黃金棒；SPIN 拳 腰高 0.9 + 落地環 1.1、警棍 腰高 1.0
//  群攻覆寫   resolveFinisherAoe：持黃金棒改讀招式上的 maxGold / shakeGold / hitStopGold
interface Snapshot {
  damage: number;
  reach: number;
  knock: number;
  combo: readonly unknown[];
  comboNames: string[];
  tempo: number;
  fxId: string;
  anchors: { base: number; tip: number } | null;
  strike: SfxName | null;
  start: SfxName | null;
  readyPose: 'FIST' | 'WEAPON' | 'DUAL';
  slamBolt: boolean;
  spinWaistY: number | null;
  spinLandRadius: number;
  goldAoe: boolean;
}

const STATS = {
  FIST: { damage: 25, reach: 2.2, knock: 7.5 },
  NORMAL_BAT: { damage: 35, reach: 3.2, knock: 14.0 },
  SPECIAL_BAT: { damage: 68, reach: 3.8, knock: 22.0 },
  DUAL_RACKET: { damage: 25, reach: 2.6, knock: 10.0 }
} as const;

const FIST_COMBO = { combo: PLAYER_COMBOS.FIST, comboNames: ['弓步衝拳', '轉身鞭腿', '騰空旋風腿'] };
const BAT_COMBO = { combo: PLAYER_COMBOS.BAT, comboNames: ['橫掃千軍', '回身反掃', '躍起下劈'] };
const BATON_COMBO = { combo: PLAYER_COMBOS.BATON, comboNames: ['上步斜劈', '轉腕回挑', '旋身橫打'] };
const RACKET_COMBO = { combo: PLAYER_COMBOS.RACKET, comboNames: ['揮拍'] };
const DUAL_COMBO = { combo: PLAYER_COMBOS.DUAL, comboNames: ['二刀・快斬', '二刀・交叉斬', '鬼斬'] };

const BASELINE = {
  FIST: {
    ...STATS.FIST, ...FIST_COMBO, tempo: 1, fxId: 'FIST', anchors: null, strike: 'playPunch', start: null,
    readyPose: 'FIST', slamBolt: false, spinWaistY: 0.9, spinLandRadius: 1.1, goldAoe: false
  },
  NORMAL_BAT_CAMPUS: {
    ...STATS.NORMAL_BAT, ...BAT_COMBO, tempo: 1, fxId: 'BAT', anchors: { base: 0.35, tip: 0.89 }, strike: 'playBatHit', start: null,
    readyPose: 'WEAPON', slamBolt: false, spinWaistY: null, spinLandRadius: 0, goldAoe: false
  },
  NORMAL_BAT_DETENTION: {
    ...STATS.NORMAL_BAT, ...BATON_COMBO, tempo: 1, fxId: 'BATON', anchors: { base: 0.35, tip: 0.89 }, strike: 'playBatHit', start: null,
    readyPose: 'WEAPON', slamBolt: false, spinWaistY: 1.0, spinLandRadius: 0, goldAoe: false
  },
  SPECIAL_BAT: {
    ...STATS.SPECIAL_BAT, ...BAT_COMBO, tempo: 1.14, fxId: 'GOLD', anchors: { base: 0.4, tip: 1.02 }, strike: 'playSpecialBatHit', start: null,
    readyPose: 'WEAPON', slamBolt: true, spinWaistY: null, spinLandRadius: 0, goldAoe: true
  },
  // 雙燕羽刃 (右拍主錨點；左拍錨點 / 雙色樣式另於專屬測試斷言)，兩個世界套組相同 (特訓院由 worlds 限制不可用)
  DUAL_RACKET: {
    ...STATS.DUAL_RACKET, ...DUAL_COMBO, tempo: 1, fxId: 'DUAL_R', anchors: { base: 0.5, tip: 1.0 }, strike: 'playBadmintonHit', start: 'playBadmintonWhoosh',
    readyPose: 'DUAL', slamBolt: false, spinWaistY: 1.0, spinLandRadius: 0, goldAoe: false
  }
} satisfies Record<string, Snapshot>;

// 羽球拍覆寫：招式 / 樣式 / 錨點 / 音效取自羽球拍，數值與群攻覆寫仍取目前武器
const racketBaseline = (current: WeaponId): Snapshot => ({
  ...STATS[current], ...RACKET_COMBO, tempo: 1, fxId: 'RACKET', anchors: { base: 0.66, tip: 0.98 }, strike: null, start: 'playBadmintonWhoosh',
  readyPose: 'WEAPON', slamBolt: false, spinWaistY: null, spinLandRadius: 0, goldAoe: current === 'SPECIAL_BAT'
});

// 依模組查表組出與常數表相同形狀的快照 (數值 / 群攻覆寫取目前武器定義，其餘取實際生效的套組)
function snapshot(current: WeaponId, override: WeaponOverrideId | null, world: WeaponWorld): Snapshot {
  const def = getWeapon(current);
  const lo = resolveLoadout(current, override, world);
  const callSfx = (fn: ((i: number) => void) | (() => void) | undefined): SfxName | null => {
    for (const k of Object.keys(sfx) as SfxName[]) sfx[k].mockClear();
    if (!fn) return null;
    fn(0);
    const called = (Object.keys(sfx) as SfxName[]).filter((k) => sfx[k].mock.calls.length > 0);
    expect(called.length).toBe(1);
    return called[0];
  };
  return {
    damage: def.stats.damage,
    reach: def.stats.reach,
    knock: def.stats.knockback,
    combo: lo.combo,
    comboNames: lo.combo.map((m) => m.name),
    tempo: lo.tempo,
    fxId: lo.fx.R,
    anchors: lo.anchors.R ? { base: lo.anchors.R.base, tip: lo.anchors.R.tip } : null,
    strike: callSfx(lo.sounds.strike),
    start: callSfx(lo.sounds.start),
    readyPose: lo.readyPose as Snapshot['readyPose'],
    slamBolt: lo.finisherFx.slamBolt === true,
    spinWaistY: lo.finisherFx.waistY ?? null,
    spinLandRadius: lo.finisherFx.landRadius ?? 0,
    goldAoe: def.useGoldAoe === true
  };
}

// 比對時招式陣列以物件參照 (toBe) 斷言，其餘欄位深比對
function expectSame(actual: Snapshot, expected: Snapshot) {
  expect(actual.combo).toBe(expected.combo);
  for (let i = 0; i < expected.combo.length; i++) expect(actual.combo[i]).toBe(expected.combo[i]);
  const { combo: _a, ...restA } = actual;
  const { combo: _e, ...restE } = expected;
  expect(restA).toEqual(restE);
}

describe('武器查表快照 (階段 0：與重構前常數表一致)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('FIST (兩個世界相同)', () => {
    expectSame(snapshot('FIST', null, 'CAMPUS'), BASELINE.FIST);
    expectSame(snapshot('FIST', null, 'DETENTION'), BASELINE.FIST);
  });

  it('NORMAL_BAT × CAMPUS', () => {
    expectSame(snapshot('NORMAL_BAT', null, 'CAMPUS'), BASELINE.NORMAL_BAT_CAMPUS);
  });

  it('NORMAL_BAT × DETENTION (警棍)', () => {
    expectSame(snapshot('NORMAL_BAT', null, 'DETENTION'), BASELINE.NORMAL_BAT_DETENTION);
  });

  it('SPECIAL_BAT (第二世界仍為黃金棒套組)', () => {
    expectSame(snapshot('SPECIAL_BAT', null, 'CAMPUS'), BASELINE.SPECIAL_BAT);
    expectSame(snapshot('SPECIAL_BAT', null, 'DETENTION'), BASELINE.SPECIAL_BAT);
  });

  it('DUAL_RACKET (兩個世界套組相同)', () => {
    expectSame(snapshot('DUAL_RACKET', null, 'CAMPUS'), BASELINE.DUAL_RACKET);
    expectSame(snapshot('DUAL_RACKET', null, 'DETENTION'), BASELINE.DUAL_RACKET);
  });

  it('RACKET 覆寫 (持任一武器、任一世界)', () => {
    for (const current of ['FIST', 'NORMAL_BAT', 'SPECIAL_BAT', 'DUAL_RACKET'] as const) {
      for (const world of ['CAMPUS', 'DETENTION'] as const) {
        expectSame(snapshot(current, 'RACKET', world), racketBaseline(current));
      }
    }
  });

  it('武器槽順序與切換提示', () => {
    expect(WEAPONS.map((w) => w.id)).toEqual(['FIST', 'NORMAL_BAT', 'SPECIAL_BAT', 'DUAL_RACKET']);
    expect(getWeaponBySlot(1)?.id).toBe('FIST');
    expect(getWeaponBySlot(2)?.id).toBe('NORMAL_BAT');
    expect(getWeaponBySlot(3)?.id).toBe('SPECIAL_BAT');
    expect(getWeaponBySlot(4)?.id).toBe('DUAL_RACKET');
    expect(getWeaponBySlot(5)).toBeUndefined();
    expect(getWeapon('FIST').banner).toEqual({ campus: '🥊 切換武器：徒手拳擊 (ATK 25)', detention: '🥊 切換模式：徒手潛入 (支援背後暗殺)' });
    expect(getWeapon('NORMAL_BAT').banner).toEqual({ campus: '🏏 切換武器：普通木質棒球棍 (ATK 35)', detention: '🏏 切換裝備：特訓防暴警棍 (ATK 35)' });
    expect(getWeapon('SPECIAL_BAT').banner).toEqual({ campus: '⚡ 切換神兵：黃金雷霆棒球棍 (ATK 68)', detention: '⚡ 切換神兵：黃金雷霆防暴棍 (ATK 68)' });
    const p = { studentDefeatedCount: 3, teacherDefeatedCount: 1, dogDefeatedCount: 0, bikePatrolDefeatedCount: 2 };
    expect(getWeapon('FIST').unlock).toBeNull();
    expect(getWeapon('NORMAL_BAT').unlock?.lockedHint(p, 'CAMPUS')).toBe('🔒 普通球棒未解鎖！需擊敗 5 位普通同學 (目前進度: 3/5)');
    expect(getWeapon('NORMAL_BAT').unlock?.lockedHint(p, 'DETENTION')).toBe('🔒 防暴警棍未配發！完成特訓即可獲取裝備！');
    expect(getWeapon('SPECIAL_BAT').unlock?.lockedHint(p, 'CAMPUS')).toBe('🔒 特殊棒球棍未解鎖！需擊敗生教(1)、校犬(1)、火柴人自行車騎士(5) (目前: 教1/1 犬0/1 車2/5)');
    expect(getWeapon('SPECIAL_BAT').unlock?.lockedHint(p, 'DETENTION')).toBe('⚠️ 特訓院管制區：重型管制武器已遭沒收封存！');
    expect(getWeapon('DUAL_RACKET').icon).toBe('🏸🏸');
    expect(getWeapon('DUAL_RACKET').banner.campus).toBe('🏸🏸 切換神兵：雙燕羽刃 (ATK 25×7 連擊)');
    expect(getWeapon('DUAL_RACKET').unlock?.lockedHint(p, 'CAMPUS')).toBe('🔒 雙燕羽刃未解鎖！需在 4F 羽球賽擊敗羽球大如老師');
    expect(getWeapon('DUAL_RACKET').unlock?.lockedHint(p, 'DETENTION')).toBe('⚠️ 特訓院管制區：器材已遭沒收！');
  });

  it('查表結果為預建物件 (執行期不配置)', () => {
    expect(resolveLoadout('NORMAL_BAT', null, 'CAMPUS')).toBe(resolveLoadout('NORMAL_BAT', null, 'CAMPUS'));
    expect(resolveLoadout('SPECIAL_BAT', 'RACKET', 'DETENTION')).toBe(resolveLoadout('FIST', 'RACKET', 'CAMPUS'));
  });
});

describe('武器模型 (mesh 數不變 → draw call 不變；發光基準值還原)', () => {
  const meshCount = (o: THREE.Object3D) => { let n = 0; o.traverse((c) => { if ((c as THREE.Mesh).isMesh) n++; }); return n; };
  const firstMat = (o: THREE.Object3D, i: number) => (o.children[i] as THREE.Mesh).material as THREE.MeshStandardMaterial;

  it('普通棒：握把 + 棒身，木質 emissive 發光後還原為 0', () => {
    const h = buildNormalBat();
    const root = h.parts.R!;
    expect(meshCount(root)).toBe(2);
    expect(root.visible).toBe(false);
    expect(root.position.toArray()).toEqual([0, -0.28, 0.12]);
    expect(root.rotation.x).toBeCloseTo(Math.PI / 3);
    h.glow!(0.5, 0.6, 0xffb060);
    expect(firstMat(root, 1).emissiveIntensity).toBeCloseTo(0.3);
    expect(firstMat(root, 1).emissive.getHex()).toBe(0xffb060);
    h.resetGlow();
    expect(firstMat(root, 1).emissiveIntensity).toBe(0);
  });

  it('黃金棒：握把 + 棒身 + 冠環，金屬 emissive 基準 0.4', () => {
    const h = buildGoldBat();
    const root = h.parts.R!;
    expect(meshCount(root)).toBe(3);
    expect(firstMat(root, 1).emissiveIntensity).toBe(0.4);
    h.glow!(0.5, 3.2, 0xffc94a);
    expect(firstMat(root, 1).emissiveIntensity).toBeCloseTo(0.4 + (3.2 - 0.4) * 0.5);
    h.resetGlow();
    expect(firstMat(root, 1).emissiveIntensity).toBe(0.4);
  });

  it('羽球拍：握把 + 中桿 + 拍框 + 網線，不發光', () => {
    const h = buildRacket();
    expect(meshCount(h.parts.R!)).toBe(4);
    expect(h.glow).toBeNull();
  });

  it('雙燕羽刃：每支 握把+中桿+拍框+網線烘焙頂點色 共 1 mesh，掛點同其他武器，各以自己的拍框色發光', () => {
    const h = buildDualRackets();
    const { R, L } = h.parts;
    expect(R && L).toBeTruthy();
    expect(meshCount(R!)).toBe(1);
    expect(meshCount(L!)).toBe(1);
    for (const root of [R!, L!]) {
      expect(root.visible).toBe(false);
      expect(root.position.toArray()).toEqual([0, -0.28, 0.12]);
      expect(root.rotation.x).toBeCloseTo(Math.PI / 3);
    }
    expect(firstMat(R!, 0).emissive.getHex()).toBe(0x2ef2c8);
    expect(firstMat(L!, 0).emissive.getHex()).toBe(0xff6fcf);
    h.glow!(0.5, 1.0, 0xffffff);
    expect(firstMat(R!, 0).emissiveIntensity).toBeCloseTo(0.25);
    expect(firstMat(L!, 0).emissiveIntensity).toBeCloseTo(0.25);
    h.resetGlow();
    expect(firstMat(R!, 0).emissiveIntensity).toBe(0);
    expect(firstMat(L!, 0).emissiveIntensity).toBe(0);
  });
});
