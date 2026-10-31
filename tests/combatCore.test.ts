import { describe, expect, it, onTestFinished, vi } from 'vitest';
import * as THREE from 'three';

// SoundEffects 於模組載入時會存取 window / document，以任意方法皆為空函式的 mock 取代
vi.mock('../src/audio/SoundEffects', () => ({ soundManager: new Proxy({}, { get: () => () => {} }) }));

import {
  FAN_ANGLE_MIN_DIST, PLAYER_COMBOS, probeFan, probeLine, strikeCanLaunch, strikeHitMode, strikeRoute, type KfMove
} from '../src/entities/shared/kungfu';
import { NPC, SHOVE_IMMUNE_TIME, canBeShoved, type NPCRole } from '../src/entities/NPC';
import { isAttackFromBehind, isBehindFacing, isBehindNpc } from '../src/game/DetentionMode';
import { SerialSlot } from '../src/game/serialSlot';
import { ALL_WEAPONS } from '../src/weapons/registry';

const DEG = Math.PI / 180;

describe('FAN 扇形判定', () => {
  const cos70 = Math.cos(70 * DEG);
  it('正前方、半角內、半徑內命中，回傳距離', () => {
    expect(probeFan(0, 0, 0, 1, 4, cos70, 0, 3)).toBeCloseTo(3);
    // 60° 偏角 (半角 70° 內)
    expect(probeFan(0, 0, 0, 1, 4, cos70, Math.sin(60 * DEG) * 2, Math.cos(60 * DEG) * 2)).toBeCloseTo(2);
  });
  it('半角外、半徑外、正後方落空', () => {
    expect(probeFan(0, 0, 0, 1, 4, cos70, Math.sin(80 * DEG) * 2, Math.cos(80 * DEG) * 2)).toBe(-1);
    expect(probeFan(0, 0, 0, 1, 4, cos70, 0, 4.01)).toBe(-1);
    expect(probeFan(0, 0, 0, 1, 4, cos70, 0, -2)).toBe(-1);
  });
  it('貼身 (≤ FAN_ANGLE_MIN_DIST) 不檢查角度', () => {
    expect(probeFan(0, 0, 0, 1, 4, cos70, 0, -FAN_ANGLE_MIN_DIST * 0.9)).toBeCloseTo(FAN_ANGLE_MIN_DIST * 0.9);
  });
  it('頂點與面向任意 (非原點、斜向)', () => {
    const f = Math.SQRT1_2;
    expect(probeFan(10, 5, f, f, 3, Math.cos(30 * DEG), 12, 7)).toBeCloseTo(Math.hypot(2, 2));
    expect(probeFan(10, 5, f, f, 3, Math.cos(30 * DEG), 12, 5)).toBe(-1); // 偏 45°
  });
  it('半角 180° (cos = -1) 等同圓形', () => {
    expect(probeFan(0, 0, 0, 1, 4, -1, 0, -3)).toBeCloseTo(3);
  });
});

describe('LINE 長條判定 (probePath)', () => {
  const out = new Float32Array(3);
  it('中心線上 / 半寬內命中，回傳沿線距離與最近點', () => {
    expect(probeLine(0, 0, 0, 1, 4.8, 0.6, 0, 3, out)).toBeCloseTo(3);
    expect(probeLine(0, 0, 0, 1, 4.8, 0.6, 0.5, 2, out)).toBeCloseTo(2);
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(2);
    expect(out[2]).toBeCloseTo(2 / 4.8);
  });
  it('半寬外、後方超出半寬、前端超出半寬落空', () => {
    expect(probeLine(0, 0, 0, 1, 4.8, 0.6, 0.7, 2, out)).toBe(-1);
    expect(probeLine(0, 0, 0, 1, 4.8, 0.6, 0, -0.7, out)).toBe(-1);
    expect(probeLine(0, 0, 0, 1, 4.8, 0.6, 0, 5.5, out)).toBe(-1);
  });
  it('端點圓角 (膠囊) 內仍命中', () => {
    expect(probeLine(0, 0, 0, 1, 4.8, 0.6, 0, 5.2, out)).toBeCloseTo(4.8);
    expect(probeLine(0, 0, 0, 1, 4.8, 0.6, 0, -0.3, out)).toBeCloseTo(0);
  });
  it('斜向長條', () => {
    const f = Math.SQRT1_2;
    expect(probeLine(1, 1, f, f, 4, 0.5, 3, 3, out)).toBeCloseTo(Math.hypot(2, 2));
    expect(probeLine(1, 1, f, f, 4, 0.5, 3, 1, out)).toBe(-1);
  });
});

describe('命中模式 (strikeHitMode) 與群攻分流', () => {
  const base = PLAYER_COMBOS.BAT[0];
  const aoe = { shape: 'FAN' as const, center: 'SELF' as const, offset: 0, radius: 1, halfAngle: 70 * DEG, max: 4, falloff: 0.35, shake: 0, hitStop: 0.03, hitStopMulti: 0.03, missShake: 0 };
  const LIGHT_AOE: KfMove = { ...base, aoe, extraStrikes: [0.6], extraDmg: [0.5] };
  const FINISHER_AOE: KfMove = { ...base, aoe, finisher: true, extraStrikes: [0.6], extraDmg: [0.5] };

  it('帶 aoe 的非終結技：主擊與額外擊都走群攻，但不擊飛', () => {
    expect(strikeRoute(LIGHT_AOE, 0)).toBe('AOE');
    expect(strikeRoute(LIGHT_AOE, 1)).toBe('AOE_LIGHT');
    expect(strikeHitMode(LIGHT_AOE, 0, 0)).toBe('LIGHT');
    expect(strikeHitMode(LIGHT_AOE, 1, 0)).toBe('LIGHT');
  });
  it('lightPush > 0：非終結技改推擊，終結技主擊照常擊飛、額外擊只扣血', () => {
    expect(strikeHitMode(LIGHT_AOE, 0, 0.5)).toBe('SHOVE');
    expect(strikeHitMode(LIGHT_AOE, 1, 0.5)).toBe('SHOVE');
    expect(strikeHitMode(FINISHER_AOE, 0, 0.5)).toBe('LAUNCH');
    expect(strikeHitMode(FINISHER_AOE, 1, 0.5)).toBe('LIGHT');
  });
  it('現有武器不設 lightPush；現有招式模式與改前 strikeCanLaunch 一致', () => {
    for (const w of ALL_WEAPONS.filter((x) => x.release === 'released')) expect(w.lightPush ?? 0).toBe(0);
    // 開發中的綁帶捆書 (WHIP) 另有專屬測試 tests/bookWhip.test.ts
    for (const [k, set] of Object.entries(PLAYER_COMBOS)) {
      if (k === 'WHIP') continue;
      for (const m of set) {
        // 現有群攻皆為終結技 (AOE_LIGHT 路由不擴及現有招式)
        if (m.aoe) expect(m.finisher).toBe(true);
        for (let i = 0; i <= m.extraStrikes.length; i++) {
          expect(strikeHitMode(m, i, 0)).toBe(strikeCanLaunch(m, i) ? 'LAUNCH' : 'LIGHT');
          expect(strikeRoute(m, i)).toBe(i === 0 ? (m.aoe ? 'AOE' : 'SINGLE') : m.finisher && m.aoe ? 'AOE_LIGHT' : 'SINGLE');
        }
      }
    }
  });
});

describe('SerialSlot：通緝 / 正面提示每個出招序號一次', () => {
  it('同序號只放行一次，換序號再放行', () => {
    const slot = new SerialSlot();
    expect(slot.take(3)).toBe(true);
    expect(slot.take(3)).toBe(false);
    expect(slot.take(3)).toBe(false);
    expect(slot.take(4)).toBe(true);
    // 投射物帶發射當下序號：舊序號在新招之後命中仍會結算一次
    expect(slot.take(3)).toBe(true);
    expect(slot.take(3)).toBe(false);
  });
  it('初始 -1 以外的序號 0 也可結算', () => {
    expect(new SerialSlot().take(0)).toBe(true);
  });
});

describe('背後判定：外部攻擊來源方向', () => {
  // 面向 +Z (rotationY = 0)
  const npc = { rotationY: 0, position: new THREE.Vector3(0, 0, 0) } as unknown as NPC;
  it('isBehindNpc 行為不變 (來源點)', () => {
    expect(isBehindNpc(npc, 0, -2)).toBe(true);
    expect(isBehindNpc(npc, 0, 2)).toBe(false);
    expect(isBehindNpc(npc, 0, 0)).toBe(false);
    expect(isBehindFacing(0, 0, -1)).toBe(true);
  });
  it('isAttackFromBehind 取行進方向反向為來源', () => {
    expect(isAttackFromBehind(npc, 0, 1)).toBe(true); // 由後往前飛 (自 -Z 射來)
    expect(isAttackFromBehind(npc, 0, -1)).toBe(false); // 迎面射來
    expect(isAttackFromBehind(npc, 1, 0)).toBe(false); // 側面
  });
});

// 以原型建立最小 NPC (不建模型)：只填 launchFlying / takeDamage / 踉蹌所需欄位
type FakeNpc = NPC & Record<string, unknown>;
function makeNpc(role: NPCRole, opts: { aggressive?: boolean; hp?: number } = {}): FakeNpc {
  const npc = Object.create(NPC.prototype) as FakeNpc;
  const hp = opts.hp ?? 100;
  Object.assign(npc, {
    role, hp, maxHp: hp,
    position: new THREE.Vector3(), rotationY: 0, baseFloorY: 0,
    isKnockedDown: false, isPermanentlyKnockedOut: false, isDodging: false, isBearShaking: false,
    isBossStunned: false, isBossInvulnerable: false, isPaused: false, isChasing: false, isKnockedFlying: false,
    isBurstSprinting: false, speed: 1, dynamicSpeed: 1, whistleCooldown: 0, reviveTimer: 0, lastKoBadgeSec: -1,
    hitCooldown: 0, attackCooldown: 0, staggerTimer: 0, staggerDirX: 0, staggerDirZ: 0, staggerDist: 0.4, shoveImmune: 0,
    lastHitResult: 'HIT', knockVelocity: new THREE.Vector3(), lastColliders: [],
    kf: { move: null, strikeProgress: 0, cancel: vi.fn() },
    mesh: { rotation: { set: vi.fn() } },
    hpBarMesh: { scale: { x: 1 }, material: null, visible: true },
    hpBarBgMesh: { visible: true }, koBadgeSprite: { visible: false },
    updateKOBadge: vi.fn(), zeroLimbs: vi.fn(), applyDownPose: vi.fn(),
    tryEnforcerDefense: () => false, tryShieldBlock: () => false, tryBossFlashStep: () => false,
    performFlashStep: vi.fn(), performBearShake: vi.fn()
  });
  // cfg 為原型上的 getter (依角色查表)，改以實例屬性覆寫
  Object.defineProperty(npc, 'cfg', { value: { aggressiveCombat: opts.aggressive ?? false, isDetention: false, isCanine: false } });
  return npc;
}
const DIR = new THREE.Vector3(0, 0, 1);
// 推進踉蹌直到結束，回傳水平位移
function runStagger(npc: FakeNpc): number {
  const start = npc.position.clone();
  const step = (npc as unknown as { updateStagger(d: number, c: unknown[]): void });
  for (let i = 0; i < 200 && npc.staggerTimer > 0; i++) step.updateStagger(1 / 60, []);
  return Math.hypot(npc.position.x - start.x, npc.position.z - start.z);
}

describe('NPC.lastHitResult：launchFlying 各分支', () => {
  it('一般命中 HIT、擊倒 KO', () => {
    const a = makeNpc('STUDENT');
    a.launchFlying(DIR, 5, 10, false, false, true);
    expect(a.lastHitResult).toBe('HIT');
    expect(a.hp).toBe(90);
    const b = makeNpc('STUDENT', { hp: 5 });
    expect(b.launchFlying(DIR, 5, 10, true, false, true)).toBe(true);
    expect(b.lastHitResult).toBe('KO');
  });
  it('盾擋 / 執法者格擋 / 閃身 / 哆嗦毛 / 受擊保護 / 金鐘護盾 / 已倒地 → BLOCKED 且不扣血', () => {
    const shield = makeNpc('DETENTION_GUARD');
    shield.tryShieldBlock = () => true;
    const parry = makeNpc('INSTRUCTOR');
    parry.tryEnforcerDefense = () => true;
    const bossFlash = makeNpc('DETENTION_BOSS');
    bossFlash.tryBossFlashStep = () => true;
    const dodge = makeNpc('DODGE_TEACHER');
    const bear = makeNpc('DETENTION_SENIOR');
    bear.isBearShaking = true;
    const cooldown = makeNpc('STUDENT');
    cooldown.hitCooldown = 0.3;
    const gold = makeNpc('DETENTION_BOSS');
    gold.isBossInvulnerable = true;
    const down = makeNpc('STUDENT');
    down.isKnockedDown = true;
    for (const npc of [shield, parry, bossFlash, dodge, bear, cooldown, gold, down]) {
      npc.lastHitResult = 'HIT';
      const ko = npc.launchFlying(DIR, 5, 10, true, false, true);
      expect(ko, npc.role).toBe(false);
      expect(npc.lastHitResult, npc.role).toBe('BLOCKED');
      expect(npc.hp, npc.role).toBe(100);
    }
  });
  it('只扣血命中不吃受擊保護 (HIT)、擊飛命中吃保護 (BLOCKED)', () => {
    const a = makeNpc('STUDENT');
    a.hitCooldown = 0.3;
    a.launchFlying(DIR, 5, 10, false, false, true);
    expect(a.lastHitResult).toBe('HIT');
    a.launchFlying(DIR, 5, 10, true, false, true);
    expect(a.lastHitResult).toBe('BLOCKED');
  });
});

describe('SHOVE 推擊與 shoveImmune', () => {
  it('推開指定距離、設推擊免疫、不設 0.65 秒受擊保護、不擊飛', () => {
    const npc = makeNpc('STUDENT');
    npc.launchFlying(DIR, 5, 10, false, false, true, 10, 7, 1.2);
    expect(npc.lastHitResult).toBe('HIT');
    expect(npc.shoveImmune).toBe(SHOVE_IMMUNE_TIME);
    expect(npc.hitCooldown).toBe(0);
    expect(npc.isKnockedFlying).toBe(false);
    expect(runStagger(npc)).toBeCloseTo(1.2, 5);
    expect(npc.position.z).toBeCloseTo(1.2, 5);
  });
  it('推擊免疫期間只扣血不再推；免疫結束可再推', () => {
    const npc = makeNpc('STUDENT');
    npc.launchFlying(DIR, 5, 10, false, false, true, 10, 7, 0.5);
    runStagger(npc);
    npc.launchFlying(DIR, 5, 10, false, false, true, 10, 7, 0.5);
    expect(npc.hp).toBe(80);
    expect(npc.staggerTimer).toBe(0);
    npc.shoveImmune = 0;
    npc.launchFlying(DIR, 5, 10, false, false, true, 10, 7, 0.5);
    expect(npc.staggerTimer).toBeGreaterThan(0);
    expect(runStagger(npc)).toBeCloseTo(0.5, 5);
  });
  it('打斷前搖 (未過半)，過半霸體不打斷', () => {
    const early = makeNpc('STUDENT');
    (early.kf as { move: unknown; strikeProgress: number }).move = { dmg: 1 };
    (early.kf as { strikeProgress: number }).strikeProgress = 0.3;
    early.launchFlying(DIR, 5, 10, false, false, true, 10, 7, 0.5);
    expect((early.kf as { cancel: ReturnType<typeof vi.fn> }).cancel).toHaveBeenCalled();
    const late = makeNpc('STUDENT');
    (late.kf as { move: unknown; strikeProgress: number }).move = { dmg: 1 };
    (late.kf as { strikeProgress: number }).strikeProgress = 0.7;
    late.launchFlying(DIR, 5, 10, false, false, true, 10, 7, 0.5);
    expect((late.kf as { cancel: ReturnType<typeof vi.fn> }).cancel).not.toHaveBeenCalled();
  });
  it('重訓霸榜生與總教官不吃推；擊倒與被擋不推', () => {
    // 重訓霸榜生受擊有 30% 機率施展狗熊哆嗦毛 (Math.random)：固定亂數避免測試不穩定
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    onTestFinished(() => vi.restoreAllMocks());
    for (const role of ['DETENTION_HEAVY', 'DETENTION_BOSS'] as NPCRole[]) {
      const npc = makeNpc(role, { aggressive: true });
      npc.launchFlying(DIR, 5, 10, false, false, true, 10, 7, 1.2);
      expect(npc.lastHitResult, role).toBe('HIT');
      expect(npc.staggerTimer, role).toBe(0);
      expect(npc.shoveImmune, role).toBe(0);
    }
    const ko = makeNpc('STUDENT', { hp: 5 });
    ko.launchFlying(DIR, 5, 10, false, false, true, 10, 7, 1.2);
    expect(ko.staggerTimer).toBe(0);
    const blocked = makeNpc('DETENTION_GUARD');
    blocked.tryShieldBlock = () => true;
    blocked.launchFlying(DIR, 5, 10, false, false, true, 10, 7, 1.2);
    expect(blocked.staggerTimer).toBe(0);
    expect(canBeShoved('STUDENT', 0)).toBe(true);
    expect(canBeShoved('STUDENT', 0.1)).toBe(false);
    expect(canBeShoved('DETENTION_HEAVY', 0)).toBe(false);
    expect(canBeShoved('DETENTION_BOSS', 0)).toBe(false);
  });
  it('未傳 shoveDist：只扣血命中不位移 (現有行為)；積極角色一般踉蹌仍為 0.4m', () => {
    const light = makeNpc('STUDENT');
    light.launchFlying(DIR, 5, 10, false, false, true);
    expect(light.staggerTimer).toBe(0);
    expect(light.shoveImmune).toBe(0);
    const guard = makeNpc('DETENTION_GUARD', { aggressive: true });
    guard.launchFlying(DIR, 5, 10, false, false, false); // 非玩家來源、不可擊飛 → 一般踉蹌
    expect(guard.hitCooldown).toBe(0.65);
    expect(runStagger(guard)).toBeCloseTo(0.4, 5);
  });
});
