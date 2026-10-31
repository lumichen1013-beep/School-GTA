import { describe, expect, it, vi } from 'vitest';

const sfx = vi.hoisted(() => ({
  playBatHit: vi.fn(), playSpecialBatHit: vi.fn(), playZap: vi.fn(), playFinisherThump: vi.fn(), playBatonHit: vi.fn(),
  playFistHit: vi.fn(), playKickHit: vi.fn(), playPunch: vi.fn(), playBadmintonHit: vi.fn(), playBadmintonWhoosh: vi.fn(),
  playWhipCrack: vi.fn(), playBookThud: vi.fn(), playThrowWhoosh: vi.fn()
}));
vi.mock('../src/audio/SoundEffects', () => ({ soundManager: sfx }));
vi.mock('../src/effects/SwingTrail', async (orig) => {
  const { MeshBasicMaterial } = await import('three');
  return { ...(await orig<typeof import('../src/effects/SwingTrail')>()), createTrailMaterial: () => new MeshBasicMaterial() };
});

import * as THREE from 'three';
import { WEAPONS, WEAPON_OVERRIDES, getWeapon, resolveLoadout, resolveVariant } from '../src/weapons/registry';
import { IMPACT_PROFILES, impactFeedback, type ImpactClass } from '../src/weapons/impactClass';
import { launchDistance, LAUNCH_GRAVITY, launchVertical } from '../src/weapons/launch';
import { WEAPON_FX_STYLES } from '../src/effects/weaponFxStyle';
import { bakeNode, getHitFlashMaterial } from '../src/entities/npc/modelCache';
import { npcHitFlash, FLASH_TIME } from '../src/effects/npcHitFlash';
import type { WeaponId, WeaponWorld } from '../src/weapons/types';

const ORDER: ImpactClass[] = ['LIGHT', 'MEDIUM', 'HEAVY', 'GOLD'];

describe('impactClass 分級', () => {
  it('每把武器 (含場景覆寫) 都有分級，對應表固定', () => {
    const map: Record<string, ImpactClass> = {};
    for (const w of WEAPONS) map[w.id] = w.impactClass;
    expect(map).toMatchObject({ FIST: 'MEDIUM', NORMAL_BAT: 'HEAVY', SPECIAL_BAT: 'GOLD', DUAL_RACKET: 'MEDIUM', BOOK_WHIP: 'MEDIUM', BASKETBALL: 'MEDIUM', SLINGSHOT: 'LIGHT' });
    expect(WEAPON_OVERRIDES.RACKET.impactClass).toBe('LIGHT');
    expect(resolveVariant('NORMAL_BAT', 'DETENTION').impactClass).toBe('HEAVY'); // 警棍沿用定義
  });

  it('越重越久越震、碎片越多、揮空音越低 (嚴格遞增 / 遞減)', () => {
    for (let i = 1; i < ORDER.length; i++) {
      const a = IMPACT_PROFILES[ORDER[i - 1]], b = IMPACT_PROFILES[ORDER[i]];
      for (const k of ['hitStop', 'extraHitStop', 'shake', 'finisherHitStop', 'finisherShake', 'sparks', 'finisherSparks'] as const) expect(b[k]).toBeGreaterThan(a[k]);
      expect(b.whooshHz).toBeLessThan(a.whooshHz);
      expect(b.flashes).toBeGreaterThanOrEqual(a.flashes);
    }
    for (const c of ORDER) {
      const p = IMPACT_PROFILES[c];
      expect(p.extraHitStop).toBeLessThan(p.hitStop);
      expect(p.finisherHitStop).toBeGreaterThan(p.hitStop);
      expect(p.finisherHitStopMulti).toBeGreaterThanOrEqual(p.finisherHitStop);
      expect(p.finisherShake).toBeGreaterThan(p.shake);
    }
  });

  it('impactFeedback：第 1、2 段讀表；額外擊較短；終結技取 max(分級下限, 招式覆寫)、黃金改讀 *Gold', () => {
    const out = { hitStop: 0, shake: 0 };
    expect(impactFeedback('HEAVY', false, false, false, 0, null, false, out)).toEqual({ hitStop: 0.055, shake: 0.3 });
    expect(impactFeedback('MEDIUM', false, true, false, 0, null, false, out)).toEqual({ hitStop: 0.027, shake: 0.17 });
    expect(impactFeedback('MEDIUM', false, false, false, 0.5, null, false, out).shake).toBe(0.5); // 招式 hitShake 較大時保留
    const aoe = { hitStop: 0.08, hitStopMulti: 0.1, shake: 0.6, hitStopGold: 0.11, shakeGold: 0.8 };
    expect(impactFeedback('HEAVY', true, false, false, 0, aoe, false, out)).toEqual({ hitStop: 0.09, shake: 0.6 });
    expect(impactFeedback('HEAVY', true, false, true, 0, aoe, false, out)).toEqual({ hitStop: 0.1, shake: 0.6 });
    expect(impactFeedback('GOLD', true, false, false, 0, aoe, true, out)).toEqual({ hitStop: 0.11, shake: 0.8 });
    const dualAoe = { hitStop: 0.12, hitStopMulti: 0.14, shake: 0.75 };
    expect(impactFeedback('MEDIUM', true, false, true, 0, dualAoe, false, out)).toEqual({ hitStop: 0.14, shake: 0.75 }); // 鬼斬原值較大 → 保留
  });

  it('每把近戰武器的終結技 (含世界變體) 經分級後停格 / 震動不低於下限', () => {
    for (const w of WEAPONS) {
      for (const world of ['CAMPUS', 'DETENTION'] as WeaponWorld[]) {
        const lo = resolveVariant(w.id, world);
        const fin = lo.combo.find((m) => m.finisher);
        if (!fin || !fin.aoe) continue;
        const fb = impactFeedback(lo.impactClass, true, false, false, 0, fin.aoe, w.useGoldAoe === true, { hitStop: 0, shake: 0 });
        expect(fb.hitStop).toBeGreaterThanOrEqual(IMPACT_PROFILES[lo.impactClass].finisherHitStop);
        expect(fb.shake).toBeGreaterThanOrEqual(IMPACT_PROFILES[lo.impactClass].finisherShake);
      }
    }
  });
});

// 終結技收招僵直 vs 擊退：被擊飛的敵人滯空 + 跑回攻擊距離所需時間 ≥ 收招僵直 (命中 → 可取消) + 0.3 秒反應餘裕。
// 最壞情況：追擊最快 16.5 m/s (強盜衝刺)、攻擊距離最遠 2.4m (自行車騎士)；主目標距離自 0.6m 掃到群攻外緣 (含擊退距離衰減)
const WORST_CHASE = 16.5;
const WORST_ATTACK_DIST = 2.4;
const DEFAULT_CAP = { h: 10, v: 7 };
function finisherCheck(id: WeaponId, world: WeaponWorld) {
  const def = getWeapon(id);
  const lo = resolveVariant(id, world);
  const fin = lo.combo.find((m) => m.finisher)!;
  const recovery = (fin.cancel - fin.strike) * fin.dur * lo.tempo;
  const cap = lo.launchCap ?? DEFAULT_CAP;
  const reach = def.stats.reach;
  const range = fin.aoe ? (fin.aoe.shape === 'PATH' ? 4.5 : fin.aoe.radius * reach + (fin.aoe.center === 'FRONT' ? fin.aoe.offset * reach : 0)) : 1;
  let minBack = Infinity, minDist = Infinity;
  for (let d = 0.6; d <= Math.max(0.6, range) + 1e-6; d += 0.2) {
    const fall = fin.aoe ? fin.aoe.falloff * Math.min(1, d / Math.max(range, 0.001)) : 0;
    const force = def.stats.knockback * fin.knock * (1 - fall);
    const dist = launchDistance(force, cap);
    const air = 2 * launchVertical(force, cap.v) / LAUNCH_GRAVITY;
    const back = air + Math.max(0, d + dist - WORST_ATTACK_DIST) / WORST_CHASE;
    if (back < minBack) { minBack = back; minDist = dist; }
  }
  return { recovery, need: recovery + 0.3, back: minBack, dist: minDist };
}

describe('終結技驗算：擊退覆蓋收招僵直 (+0.3 秒反應)', () => {
  const cases: [WeaponId, WeaponWorld][] = [
    ['FIST', 'CAMPUS'], ['NORMAL_BAT', 'CAMPUS'], ['NORMAL_BAT', 'DETENTION'], ['SPECIAL_BAT', 'CAMPUS'],
    ['DUAL_RACKET', 'CAMPUS'], ['BOOK_WHIP', 'CAMPUS'], ['BASKETBALL', 'CAMPUS']
  ];
  for (const [id, world] of cases) {
    it(`${id} / ${world}`, () => {
      const r = finisherCheck(id, world);
      expect(r.back).toBeGreaterThanOrEqual(r.need);
    });
  }
});

describe('拖尾外延：誇大揮擊範圍感，但外緣不超過判定距離', () => {
  // 實測揮擊中武器尖端離玩家中心的最大水平距離 (dev server 取樣，棒長已含 batModels 加長倍率)
  const TIP_RADIUS = { NORMAL_BAT: 1.17, SPECIAL_BAT: 1.3, DUAL_RACKET: 1.5, FIST: 0.92 } as const;
  const NPC_RADIUS = 0.35;
  const GRACE = 0.3; // resolveSingleHit 判定寬容
  for (const [id, fx] of [['NORMAL_BAT', 'BAT'], ['SPECIAL_BAT', 'GOLD'], ['DUAL_RACKET', 'DUAL_R'], ['FIST', 'FIST']] as const) {
    it(`${id}：尖端 + tipExt ≤ 判定外緣，棒類 ≥ 判定外緣 80%`, () => {
      const lo = resolveLoadout(id, null, 'CAMPUS');
      const moveReach = Math.min(...lo.combo.filter((m) => !m.finisher).map((m) => m.reach));
      const edge = getWeapon(id).stats.reach * moveReach + GRACE - NPC_RADIUS;
      const outer = TIP_RADIUS[id] + WEAPON_FX_STYLES[fx].tipExt!;
      expect(outer).toBeLessThanOrEqual(edge);
      if (id === 'NORMAL_BAT' || id === 'SPECIAL_BAT') expect(outer).toBeGreaterThanOrEqual(edge * 0.8);
    });
  }

  it('配色：近戰武器拖尾三色 (核心 / 主色 / 尾端) 互不相同，且主色非白', () => {
    for (const k of ['FIST', 'BAT', 'GOLD', 'BATON', 'RACKET', 'DUAL_R', 'DUAL_L'] as const) {
      const s = WEAPON_FX_STYLES[k];
      expect(new Set([s.color, s.tipColor, s.tail]).size).toBe(3);
      const r = (s.color >> 16) & 255, g = (s.color >> 8) & 255, b = s.color & 255;
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(120); // 高飽和
    }
    expect(WEAPON_FX_STYLES.BAT.element).toBe('WOOD');
    expect(WEAPON_FX_STYLES.GOLD.element).toBe('THUNDER');
    expect(WEAPON_FX_STYLES.GOLD.tipExt!).toBeGreaterThan(WEAPON_FX_STYLES.BAT.tipExt!);
  });
});

describe('命中音：打中才出聲、終結技加低頻重擊、拳腳分音', () => {
  const pos = { x: 0, y: 0, z: 0 };
  it('普通棒揮空不出打擊聲；黃金棒每擊疊雷電劈啪；終結技疊重擊', () => {
    for (const f of Object.values(sfx)) f.mockClear();
    getWeapon('NORMAL_BAT').sounds.strike!(0, pos, false, 0, false);
    expect(sfx.playBatHit).not.toHaveBeenCalled();
    getWeapon('SPECIAL_BAT').sounds.strike!(0, pos, false, 0, true);
    expect(sfx.playSpecialBatHit).toHaveBeenCalledTimes(1);
    expect(sfx.playZap).toHaveBeenCalledTimes(1);
    expect(sfx.playFinisherThump).not.toHaveBeenCalled();
    getWeapon('NORMAL_BAT').sounds.strike!(0, pos, true, 2, true);
    expect(sfx.playFinisherThump).toHaveBeenCalledWith(pos, true);
  });
  it('拳：第 1 段拳音、第 2 / 3 段腿音；警棍金屬電擊；羽球拍打中有聲', () => {
    for (const f of Object.values(sfx)) f.mockClear();
    const fist = getWeapon('FIST').sounds.strike!;
    fist(0, pos, false, 0, true); fist(0, pos, false, 1, true); fist(0, pos, true, 2, true);
    expect(sfx.playFistHit).toHaveBeenCalledTimes(1);
    expect(sfx.playKickHit).toHaveBeenCalledTimes(2);
    expect(sfx.playPunch).not.toHaveBeenCalled();
    resolveVariant('NORMAL_BAT', 'DETENTION').sounds.strike!(0, pos, false, 0, true);
    expect(sfx.playBatonHit).toHaveBeenCalledTimes(1);
    WEAPON_OVERRIDES.RACKET.sounds.strike!(0, pos, false, 0, true);
    expect(sfx.playBadmintonHit).toHaveBeenCalledTimes(1);
  });
});

describe('NPC 受擊閃白：不破壞共用材質 / 不增 draw call', () => {
  function makeNpc(key: string): THREE.Group {
    const root = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), new THREE.MeshLambertMaterial({ color: 0x3366cc }));
    torso.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshLambertMaterial({ color: 0xffcc99 })));
    bakeNode(torso, key);
    root.add(torso);
    return root;
  }
  it('只換受擊者部位材質為共用發光版 (同類型 / 同 defines)，其他 NPC 與共用材質不變，時間到還原', () => {
    const a = makeNpc('flash-test');
    const b = makeNpc('flash-test');
    const meshA = a.children[0] as THREE.Mesh;
    const meshB = b.children[0] as THREE.Mesh;
    const shared = meshA.material as THREE.MeshLambertMaterial;
    expect(meshB.material).toBe(shared); // 同外觀共用材質 (合批前提)
    const flash = getHitFlashMaterial(shared) as THREE.MeshLambertMaterial;
    expect(flash).not.toBeNull();
    expect(flash.type).toBe(shared.type);
    expect(flash.vertexColors).toBe(shared.vertexColors);
    expect(flash.side).toBe(shared.side);
    expect(flash.transparent).toBe(shared.transparent);
    expect(getHitFlashMaterial(shared)).toBe(flash); // 全體共用一份
    let meshesA = 0;
    a.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshesA++; });

    npcHitFlash.flash(a);
    expect(meshA.material).toBe(flash);
    expect(meshB.material).toBe(shared);
    expect(shared.emissive.getHex()).toBe(0x000000);
    let after = 0;
    a.traverse((o) => { if ((o as THREE.Mesh).isMesh) after++; });
    expect(after).toBe(meshesA); // 不新增 Mesh (draw call 數不變)

    npcHitFlash.update(FLASH_TIME * 0.5);
    expect(npcHitFlash.isFlashing(a)).toBe(true);
    npcHitFlash.update(FLASH_TIME);
    expect(npcHitFlash.isFlashing(a)).toBe(false);
    expect(meshA.material).toBe(shared);
  });
  it('非共用烘焙材質 (透明 / 自訂) 不換；reset 全部還原', () => {
    const own = new THREE.MeshLambertMaterial();
    expect(getHitFlashMaterial(own)).toBeNull();
    const a = makeNpc('flash-test');
    const shared = (a.children[0] as THREE.Mesh).material;
    npcHitFlash.flash(a);
    npcHitFlash.reset();
    expect((a.children[0] as THREE.Mesh).material).toBe(shared);
  });
});
