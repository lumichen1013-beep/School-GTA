import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/audio/SoundEffects', () => ({
  soundManager: new Proxy({}, { get: () => () => undefined })
}));
vi.mock('../src/effects/SlashFX', () => ({ slashFX: { hitFlash: vi.fn(), dashBand: vi.fn(), chargeRing: vi.fn() } }));
vi.mock('../src/effects/ComboFinisherFX', () => ({ comboFinisherFX: { groundSlam: vi.fn(), spinWave: vi.fn(), featherBurst: vi.fn() } }));

import {
  FENCER, SUNFLOWER_LINES, SunflowerTaunt, BossHealthBars, CombatRegen, canSkipIntro, victoryReward,
  clampToCircle, segmentExitCircleT, segmentPointDistance, bossBarLabel, REMATCH_LINE_AFTER_WIN, REMATCH_LINE_AFTER_LOSS,
  rayCircleDistance, thornCrossYaw, thornCrossHit, pinchClonePos, pinchHitMask
} from '../src/game/fencer/fencerRules';
import { AwakeningStats, PlayerAwakening, AWAKEN_INTRO_SEC } from '../src/game/fencer/PlayerAwakening';
import { BattleModeSwitch } from '../src/game/fencer/BattleMode';
import { FencerBoss, IMPLEMENTED_ATTACKS, PHASES, type FencerBossHost } from '../src/entities/FencerBoss';
import { BossFX } from '../src/effects/BossFX';
import { PlantAoeShape } from '../src/world/EcologicalGarden';
import { freezeStatic } from '../src/world/sceneUtils';

describe('太陽花 10 次計數與再戰規則', () => {
  it('台詞順序固定 10 句，第 10 句開戰', () => {
    const t = new SunflowerTaunt();
    const texts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = t.poke(i * 2);
      expect(r.accepted).toBe(true);
      expect(r.index).toBe(i + 1);
      expect(r.startFight).toBe(i === 9);
      texts.push(r.line!.text);
    }
    expect(texts).toEqual(SUNFLOWER_LINES.map((l) => l.text));
    expect(texts[0]).toBe('.');
    expect(texts[3]).toBe('嘖。');
    expect(texts[4]).toBe('滾');
    expect(texts[7]).toBe('我只是一朵花啊……');
    expect(texts[9]).toBe('看來不好好教訓你不行了');
  });

  it('1 秒冷卻內連點不計數', () => {
    const t = new SunflowerTaunt();
    expect(t.poke(0).accepted).toBe(true);
    expect(t.poke(0.5).accepted).toBe(false);
    expect(t.pokes).toBe(1);
    expect(t.poke(1.0).accepted).toBe(true);
    expect(t.pokes).toBe(2);
  });

  it('離開不歸零：計數持續累加', () => {
    const t = new SunflowerTaunt();
    for (let i = 0; i < 4; i++) t.poke(i * 5);
    expect(t.remaining).toBe(6);
  });

  it('首戰後 (勝或敗) 戳 1 次即可再戰，台詞依結果', () => {
    const win = new SunflowerTaunt();
    win.recordResult('WIN');
    const r1 = win.poke(100);
    expect(r1.startFight).toBe(true);
    expect(r1.line!.text).toBe(REMATCH_LINE_AFTER_WIN);
    const loss = new SunflowerTaunt();
    for (let i = 0; i < 10; i++) loss.poke(i * 2);
    loss.recordResult('LOSS');
    const r2 = loss.poke(100);
    expect(r2.startFight).toBe(true);
    expect(r2.line!.text).toBe(REMATCH_LINE_AFTER_LOSS);
  });

  it('開場過場第二次起可跳過；首勝 1500、再戰勝利 200', () => {
    expect(canSkipIntro(1)).toBe(false);
    expect(canSkipIntro(2)).toBe(true);
    expect(victoryReward(false)).toBe(1500);
    expect(victoryReward(true)).toBe(200);
  });
});

describe('三管血與換樂章', () => {
  it('3 管 × 2100，溢出傷害不跨管，換樂章期間無敵', () => {
    const b = new BossHealthBars();
    expect(b.totalRemaining).toBe(6300);
    expect(b.damage(2000)).toEqual({ applied: 2000, barBroken: false, defeated: false });
    const r = b.damage(500);
    expect(r).toEqual({ applied: 100, barBroken: true, defeated: false });
    b.invulnerable = true;
    expect(b.damage(999).applied).toBe(0);
    b.invulnerable = false;
    b.advanceBar();
    expect(b.bar).toBe(1);
    expect(b.hp).toBe(2100);
    expect(bossBarLabel(1)).toBe('花劍客・第二樂章 (2/3)');
  });

  it('最後一管打空才算擊敗', () => {
    const b = new BossHealthBars();
    b.damage(2100); b.advanceBar();
    expect(b.isDefeated).toBe(false);
    b.damage(2100); b.advanceBar();
    expect(b.bar).toBe(2);
    const r = b.damage(5000);
    expect(r.defeated).toBe(true);
    expect(b.isDefeated).toBe(true);
    expect(b.damage(10).applied).toBe(0);
    b.reset();
    expect(b.bar).toBe(0);
    expect(b.hp).toBe(FENCER.BAR_HP);
  });
});

describe('戰鬥回血：基礎 0.8/s + 脫戰 12/s', () => {
  const inp = (hp: number, dist: number, force = false) => ({ hp, maxHp: 200, distToBoss: dist, forceOutOfCombat: force });

  it('基礎回血任何狀態都在回 (受擊後也不暫停)', () => {
    const r = new CombatRegen();
    r.onPlayerHit();
    expect(r.update(1, inp(100, 3))).toBeCloseTo(0.8, 5);
    expect(r.outOfCombat).toBe(false);
  });

  it('脫戰需同時滿足：2s 未被打、2s 未出手、距離 > 8m', () => {
    const r = new CombatRegen();
    r.onPlayerHit();
    r.update(1.9, inp(60, 10));
    expect(r.outOfCombat).toBe(false);
    expect(r.update(0.2, inp(60, 10))).toBeCloseTo(12 * 0.2, 5);
    expect(r.outOfCombat).toBe(true);
    // 距離不夠
    expect(r.update(0.1, inp(60, 8))).toBeCloseTo(0.08, 5);
    expect(r.outOfCombat).toBe(false);
    // 遠程出手也算攻擊
    r.update(0.1, inp(60, 12));
    expect(r.outOfCombat).toBe(true);
    r.onPlayerAttack();
    r.update(1.0, inp(60, 12));
    expect(r.outOfCombat).toBe(false);
    r.update(1.0, inp(60, 12));
    expect(r.outOfCombat).toBe(true);
  });

  it('快速回血只到 80%，之後只剩基礎回血', () => {
    const r = new CombatRegen();
    const heal = r.update(1, inp(159, 20));
    expect(heal).toBeCloseTo(1 + 0.8, 5);
    expect(r.update(1, inp(160, 20))).toBeCloseTo(0.8, 5);
    expect(r.isFastRegen(160, 200)).toBe(false);
    expect(r.update(1, inp(199.9, 20))).toBeCloseTo(0.1, 5);
    expect(r.update(1, inp(200, 20))).toBe(0);
  });

  it('換樂章過場強制算脫戰；被打中會中斷脫戰', () => {
    const r = new CombatRegen();
    r.onPlayerAttack();
    r.update(0.1, inp(50, 1, true));
    expect(r.outOfCombat).toBe(true);
    expect(r.onPlayerHit()).toBe(true);
    expect(r.outOfCombat).toBe(false);
    expect(r.onPlayerHit()).toBe(false);
  });
});

describe('覺醒數值與血量上限恢復', () => {
  it('開戰上限 200 並補滿；勝利還原 100 並補滿', () => {
    const s = new AwakeningStats();
    const p = { hp: 37, maxHp: 100 };
    s.apply(p);
    expect(p).toEqual({ hp: 200, maxHp: 200 });
    p.hp = 150;
    s.remove(p, true);
    expect(p).toEqual({ hp: 100, maxHp: 100 });
  });

  it('死亡：先還原上限 (hp 0 維持)，之後復活補滿到 100 而非 200', () => {
    const s = new AwakeningStats();
    const p = { hp: 80, maxHp: 100 };
    s.apply(p);
    p.hp = 0;
    s.remove(p, false);
    expect(p.maxHp).toBe(100);
    expect(p.hp).toBe(0);
    p.hp = p.maxHp; // Player.respawn: hp = maxHp
    expect(p.hp).toBe(100);
    // 重複呼叫安全 (復活保險再呼叫一次)
    s.remove(p, false);
    expect(p).toEqual({ hp: 100, maxHp: 100 });
  });

  it('中途離開 (切世界)：血量截到原上限', () => {
    const s = new AwakeningStats();
    const p = { hp: 100, maxHp: 100 };
    s.apply(p);
    p.hp = 180;
    s.remove(p, false);
    expect(p).toEqual({ hp: 100, maxHp: 100 });
  });

  it('覺醒視覺四入口：播放變身 → 常駐、直接套用、播放還原、立即還原', () => {
    const scene = new THREE.Scene();
    const a = new PlayerAwakening(scene);
    const pos = new THREE.Vector3();
    const done = vi.fn();
    a.playIntro(done);
    expect(a.state).toBe('INTRO');
    for (let t = 0; t < AWAKEN_INTRO_SEC + 0.2; t += 0.1) a.update(0.1, pos, false);
    expect(a.state).toBe('ON');
    expect(done).toHaveBeenCalledTimes(1);
    a.playOutro();
    for (let t = 0; t < 1; t += 0.1) a.update(0.1, pos, false);
    expect(a.state).toBe('OFF');
    a.applyInstant();
    expect(a.state).toBe('ON');
    a.revertInstant();
    expect(a.state).toBe('OFF');
    expect(a.isOn).toBe(false);
  });
});

describe('解析式碰撞', () => {
  it('圓形夾回', () => {
    const out = { x: 0, z: 0, nx: 0, nz: 0 };
    expect(clampToCircle(5, 0, 0, 0, 10, out)).toBe(false);
    expect(clampToCircle(20, 0, 0, 0, 10, out)).toBe(true);
    expect(out.x).toBeCloseTo(10);
    expect(out.nx).toBeCloseTo(1);
  });
  it('線段穿出圓 (投射物撞結界牆)', () => {
    expect(segmentExitCircleT(0, 0, 5, 0, 0, 0, 10)).toBe(-1);
    expect(segmentExitCircleT(0, 0, 20, 0, 0, 0, 10)).toBeCloseTo(0.5);
  });
  it('突刺膠囊：線段到點距離', () => {
    expect(segmentPointDistance(0, 0, 6, 0, 3, 0.5)).toBeCloseTo(0.5);
    expect(segmentPointDistance(0, 0, 6, 0, 8, 0)).toBeCloseTo(2);
  });
});

describe('戰鬥模式卸載 / 恢復對稱', () => {
  it('掛回後場景子節點、visible、凍結旗標與開戰前完全相同', () => {
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    world.add(new THREE.Mesh(), new THREE.Group().add(new THREE.Mesh()));
    scene.add(world);
    freezeStatic(world);
    const garden = new THREE.Group();
    scene.add(garden);
    const npcs = [new THREE.Group(), new THREE.Group()];
    scene.add(...npcs);
    const bikeA = new THREE.Group();
    const bikeB = new THREE.Group();
    bikeB.visible = false; // 原本就隱藏者恢復後仍隱藏
    const ball = new THREE.Mesh();
    scene.add(bikeA, bikeB, ball);
    const player = new THREE.Group();
    scene.add(player);

    const snapshot = () => ({
      children: new Set(scene.children),
      visible: [world, garden, ...npcs, bikeA, bikeB, ball].map((o) => o.visible),
      frozen: world.children.map((c) => c.matrixWorldAutoUpdate),
      worldMatrix: world.children[0].matrixWorld.clone()
    });
    const before = snapshot();
    const sw = new BattleModeSwitch({
      actorsDetach: () => [garden, ...npcs],
      actorsHide: () => [bikeA, bikeB, ball],
      worldDetach: () => [world]
    });
    sw.unloadActors();
    expect(scene.children.includes(npcs[0])).toBe(false);
    expect(scene.children.includes(world)).toBe(true);
    expect(bikeA.visible).toBe(false);
    sw.unloadWorld();
    sw.unloadWorld();
    expect(scene.children).toEqual([bikeA, bikeB, ball, player]);
    expect(sw.active).toBe(true);
    sw.restore();
    sw.restore();
    const after = snapshot();
    expect(after.children).toEqual(before.children);
    expect(after.visible).toEqual(before.visible);
    expect(after.frozen).toEqual(before.frozen);
    expect(after.worldMatrix.equals(before.worldMatrix)).toBe(true);
    expect(sw.active).toBe(false);
  });
});

describe('花劍客本體', () => {
  function makeBoss() {
    const host: FencerBossHost & { damage: number[]; reasons: Set<string>; results: unknown[] } = {
      playerPos: new THREE.Vector3(FENCER.CENTER_X, 0, FENCER.CENTER_Z + 5),
      playerVel: new THREE.Vector3(),
      playerDead: false,
      isTouch: false,
      playerOutOfCombat: false,
      damage: [],
      reasons: new Set<string>(),
      results: [],
      damagePlayer(amount, _d, _h, _v, reason) { this.damage.push(amount); this.reasons.add(reason); },
      onBossDamaged(res) { this.results.push(res); },
      shake: () => undefined,
      hitStop: () => undefined
    };
    const boss = new FencerBoss(host, new BossFX());
    boss.resetForFight(FENCER.CENTER_X, FENCER.CENTER_Z);
    boss.startFight(0);
    return { boss, host };
  }

  it('招式插槽：S1~S5 全部啟用，S4 於第 2、3 管、S5 於第 3 管循環', () => {
    expect([...IMPLEMENTED_ATTACKS]).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
    expect(PHASES[0].rotation).not.toContain('S4');
    expect(PHASES[1].rotation).not.toContain('S5');
    expect(PHASES[2].rotation).toContain('S4');
    // 終樂章：S5 每輪、S4 隔輪
    expect(PHASES[2].rotation.filter((a) => a === 'S5').length).toBe(2);
    expect(PHASES[2].rotation.filter((a) => a === 'S4').length).toBe(1);
    expect(PHASES[0].rotation).toEqual(['S1', 'S2', 'S1', 'S3']);
    expect(PHASES[1].rotation).toContain('S4');
    expect(PHASES[2].rotation).toContain('S5');
  });

  it('近戰 / 投射物 / LINE 長條 (含突進起點) 都能命中；打空一管進入換樂章且無敵', () => {
    const { boss, host } = makeBoss();
    const c = new THREE.Vector3(FENCER.CENTER_X, 0, FENCER.CENTER_Z);
    expect(boss.tryHitMelee(new THREE.Vector3(c.x, 0, c.z + 1.5), 1.2, 100)?.applied).toBe(100);
    expect(boss.tryHitMelee(new THREE.Vector3(c.x, 0, c.z + 5), 1.2, 100)).toBeNull();
    expect(boss.tryHitAtPoint(new THREE.Vector3(c.x + 0.3, 1.2, c.z), 0.05, 50)?.applied).toBe(50);
    // LINE：自突進起點 (6.2m 外) 沿 -Z 貫穿 7m、半寬 0.6
    const line = new PlantAoeShape().set(1, c.x, c.z + 6.2, 0, -1, 0, 7, 0.6);
    const center = new THREE.Vector3(c.x, 0, c.z + 2.7);
    expect(boss.tryHitAoe(center, 4.2, 70, line)?.applied).toBe(70);
    // LINE 偏離 2m 打不到
    const miss = new PlantAoeShape().set(1, c.x + 2, c.z + 6.2, 0, -1, 0, 7, 0.6);
    expect(boss.tryHitAoe(new THREE.Vector3(c.x + 2, 0, c.z + 2.7), 4.2, 70, miss)).toBeNull();
    const r = boss.tryHitMelee(new THREE.Vector3(c.x, 0, c.z + 1), 1.2, 5000)!;
    expect(r.barBroken).toBe(true);
    expect(boss.isInTransition).toBe(true);
    expect(boss.tryHitMelee(new THREE.Vector3(c.x, 0, c.z + 1), 1.2, 10)).toBeNull();
    for (let i = 0; i < 100; i++) boss.update(0.1);
    expect(boss.currentBar).toBe(1);
    expect(boss.isInTransition).toBe(false);
    expect(host.results.length).toBeGreaterThan(0);
  });

  it('三管打完判定擊敗', () => {
    const { boss } = makeBoss();
    const near = new THREE.Vector3(FENCER.CENTER_X, 0, FENCER.CENTER_Z + 1);
    for (let bar = 0; bar < 3; bar++) {
      const r = boss.tryHitMelee(near, 1.2, 99999)!;
      expect(r.barBroken).toBe(true);
      if (bar < 2) for (let i = 0; i < 100; i++) boss.update(0.1);
      boss.position.set(FENCER.CENTER_X, 0, FENCER.CENTER_Z);
    }
    expect(boss.isDefeated).toBe(true);
  });

  it('AI 會出招並命中靜止玩家 (S1 / S3)，Boss 始終待在結界內', () => {
    const { boss, host } = makeBoss();
    for (let i = 0; i < 600; i++) {
      boss.update(1 / 30);
      const d = Math.hypot(boss.position.x - FENCER.CENTER_X, boss.position.z - FENCER.CENTER_Z);
      expect(d).toBeLessThanOrEqual(FENCER.ARENA_R - FENCER.BOSS_CLAMP_PAD + 1e-6);
    }
    // 中立期結束後確實輪替出招 (不只開場第一招)
    expect(host.reasons.size).toBeGreaterThanOrEqual(2);
  });
});

describe('S4 玫瑰荊棘十字 / S5 花影雙人舞 判定', () => {
  const cx = FENCER.CENTER_X;
  const cz = FENCER.CENTER_Z;
  const R = FENCER.ARENA_R;

  it('荊棘臂長 = 插劍點到結界牆的距離', () => {
    expect(rayCircleDistance(cx, cz, 0, 1, cx, cz, R)).toBeCloseTo(R);
    expect(rayCircleDistance(cx, cz + 4, 0, 1, cx, cz, R)).toBeCloseTo(R - 4);
    expect(rayCircleDistance(cx, cz + 4, 0, -1, cx, cz, R)).toBeCloseTo(R + 4);
    expect(rayCircleDistance(cx, cz + 20, 0, 1, cx, cz, R)).toBe(0);
  });

  it('十字四臂命中、臂間安全，旋轉中途 45° 掃到原本的安全位置', () => {
    // yaw 0：四臂沿 +Z / +X / -Z / -X
    expect(thornCrossHit(cx, cz, 0, 1, cx, cz, R, cx, cz + 6, 0.6)).toBe(0);
    expect(thornCrossHit(cx, cz, 0, 1, cx, cz, R, cx + 8, cz + 0.3, 0.6)).toBe(1);
    expect(thornCrossHit(cx, cz, 0, 1, cx, cz, R, cx - 5, cz, 0.6)).toBe(3);
    const safeX = cx + 4 * Math.SQRT1_2;
    const safeZ = cz + 4 * Math.SQRT1_2;
    expect(thornCrossHit(cx, cz, 0, 1, cx, cz, R, safeX, safeZ, 0.6)).toBe(-1);
    // 旋轉一半 (2.5s 中的 1.25s) = 45°：原安全點被掃到
    const mid = thornCrossYaw(0, 1, 1.25, 2.5);
    expect(mid).toBeCloseTo(Math.PI / 4);
    expect(thornCrossHit(cx, cz, mid, 1, cx, cz, R, safeX, safeZ, 0.6)).toBeGreaterThanOrEqual(0);
    // 跟著轉 (角度同步 +45°) 的玩家仍在兩臂之間
    const followX = cx + 4 * Math.sin(Math.PI / 4 + Math.PI / 4);
    const followZ = cz + 4 * Math.cos(Math.PI / 4 + Math.PI / 4);
    expect(thornCrossHit(cx, cz, mid, 1, cx, cz, R, followX, followZ, 0.6)).toBe(-1);
    // 轉完 90° 十字與起始重合；超出時間夾住
    expect(thornCrossYaw(0, -1, 9, 2.5)).toBeCloseTo(-Math.PI / 2);
    // 生長中 (reach 0.5) 尚未長到 10m 外
    expect(thornCrossHit(cx, cz, 0, 0.5, cx, cz, R, cx, cz + 10, 0.6)).toBe(-1);
    expect(thornCrossHit(cx, cz, 0, 1, cx, cz, R, cx, cz + 10, 0.6)).toBe(0);
  });

  it('夾擊：分身站在玩家另一側 100°、兩線交叉於玩家；共用位元遮罩判定', () => {
    const out = { x: 0, z: 0 };
    const px = cx, pz = cz;
    pinchClonePos(px, pz, px, pz + 6, 1, (100 * Math.PI) / 180, 5, cx, cz, R - 0.8, out);
    expect(Math.hypot(out.x - px, out.z - pz)).toBeCloseTo(5);
    const cosAng = ((out.x - px) * 0 + (out.z - pz) * 1) / 5;
    expect(Math.acos(cosAng)).toBeCloseTo((100 * Math.PI) / 180);
    // 夾回結界內
    pinchClonePos(cx + 14, cz, cx + 8, cz, 1, Math.PI, 5, cx, cz, R - 0.8, out);
    expect(Math.hypot(out.x - cx, out.z - cz)).toBeLessThanOrEqual(R - 0.8 + 1e-6);
    // 本體 (0,6)→(0,-2.5)、分身 out→穿過玩家
    pinchClonePos(px, pz, px, pz + 6, -1, (100 * Math.PI) / 180, 5, cx, cz, R - 0.8, out);
    const ex = px + (px - out.x) * 0.5, ez = pz + (pz - out.z) * 0.5;
    expect(pinchHitMask(px, pz + 6, px, pz - 2.5, out.x, out.z, ex, ez, px, pz, 0.7)).toBe(3);
    // 往兩線夾角外側閃 3m：兩邊都閃過
    const bis = Math.atan2((0 + (out.x - px) / 5), (1 + (out.z - pz) / 5));
    const dodgeX = px - Math.sin(bis) * 3, dodgeZ = pz - Math.cos(bis) * 3;
    expect(pinchHitMask(px, pz + 6, px, pz - 2.5, out.x, out.z, ex, ez, dodgeX, dodgeZ, 0.7)).toBe(0);
    // 只在本體線上
    expect(pinchHitMask(px, pz + 6, px, pz - 2.5, out.x, out.z, ex, ez, px, pz + 4, 0.7)).toBe(1);
  });

  function makeBossAt(bar: number, playerPos: THREE.Vector3) {
    const host: FencerBossHost & { damage: Array<[number, string]> } = {
      playerPos, playerVel: new THREE.Vector3(), playerDead: false, isTouch: false, playerOutOfCombat: false,
      damage: [],
      damagePlayer(amount, _d, _h, _v, reason) { this.damage.push([amount, reason]); },
      onBossDamaged: () => undefined, shake: () => undefined, hitStop: () => undefined
    };
    const fx = new BossFX();
    const boss = new FencerBoss(host, fx);
    boss.resetForFight(cx, cz);
    boss.startFight(0);
    (boss as unknown as { phase: number }).phase = bar;
    return { boss, host, fx };
  }

  it('S4：靜止玩家被爆發 + 旋轉掃過各命中一次 (9)；跳起 (腳高 > 0.6m) 全程不受傷；收招後荊棘收起', () => {
    const player = new THREE.Vector3(cx, 0, cz + 6);
    const { boss, host, fx } = makeBossAt(1, player);
    (boss as unknown as { beginAttack(id: string, c: boolean): void }).beginAttack('S4', false);
    let sawThorns = false;
    for (let i = 0; i < 180 && boss.act === 'ATTACK'; i++) {
      boss.update(1 / 30);
      if ((fx as unknown as { thornMesh: THREE.Mesh }).thornMesh.visible) sawThorns = true;
    }
    expect(sawThorns).toBe(true);
    expect(host.damage).toEqual([[9, '玫瑰荊棘十字'], [9, '玫瑰荊棘十字']]);
    expect(boss.act).toBe('RECOVER');
    expect((fx as unknown as { thornMesh: THREE.Mesh }).thornMesh.visible).toBe(false);

    const jumper = new THREE.Vector3(cx, 1.0, cz + 6);
    const b2 = makeBossAt(1, jumper);
    (b2.boss as unknown as { beginAttack(id: string, c: boolean): void }).beginAttack('S4', false);
    for (let i = 0; i < 180; i++) b2.boss.update(1 / 30);
    expect(b2.host.damage.length).toBe(0);
  });

  it('S4：跟著旋轉移動 (停在兩臂之間) 的玩家不受傷；插劍期間 Boss 可被打 (破綻)', () => {
    const follower = new THREE.Vector3(cx, 0, cz + 6);
    const f = makeBossAt(1, follower);
    const fb = f.boss as unknown as { beginAttack(id: string, c: boolean): void; s4Yaw: number; s4Dir: number; s4Anchor: THREE.Vector3; atkStep: number; atkTimer: number };
    fb.beginAttack('S4', false);
    for (let i = 0; i < 180 && f.boss.act === 'ATTACK'; i++) {
      // 插劍後站到兩臂中間 (半徑 5m)，旋轉中同步跟轉
      if (fb.atkStep >= 1) {
        const yaw = fb.atkStep === 3 ? thornCrossYaw(fb.s4Yaw, fb.s4Dir, fb.atkTimer, 2.5) : fb.atkStep >= 4 ? fb.s4Yaw + fb.s4Dir * Math.PI / 2 : fb.s4Yaw;
        follower.set(fb.s4Anchor.x + Math.sin(yaw + Math.PI / 4) * 5, 0, fb.s4Anchor.z + Math.cos(yaw + Math.PI / 4) * 5);
      }
      f.boss.update(1 / 30);
    }
    expect(f.host.damage.length).toBe(0);

    const player = new THREE.Vector3(cx + 1.4, 0, cz + 1.4);
    const { boss } = makeBossAt(1, player);
    (boss as unknown as { beginAttack(id: string, c: boolean): void }).beginAttack('S4', false);
    for (let i = 0; i < 45; i++) boss.update(1 / 30); // 已插劍、旋轉中
    expect(boss.tryHitMelee(new THREE.Vector3(boss.position.x + 1, 0, boss.position.z), 1.2, 30)?.applied).toBe(30);
  });

  it('S5：靜止玩家兩回合各吃一次 8 (被夾也只算一次)；分身不可被攻擊、刺完即散', () => {
    const player = new THREE.Vector3(cx, 0, cz + 2);
    const { boss, host } = makeBossAt(2, player);
    boss.position.set(cx, 0, cz + 8);
    (boss as unknown as { beginAttack(id: string, c: boolean): void }).beginAttack('S5', false);
    expect(boss.clone.visible).toBe(true);
    // 打分身位置：分身不是受擊體
    const cp = boss.clone.position.clone().setY(1.2);
    expect(Math.hypot(cp.x - boss.position.x, cp.z - boss.position.z)).toBeGreaterThan(2);
    expect(boss.tryHitAtPoint(cp, 0.1, 50)).toBeNull();
    for (let i = 0; i < 120 && boss.act === 'ATTACK'; i++) boss.update(1 / 30);
    expect(host.damage).toEqual([[8, '花影雙人舞'], [8, '花影雙人舞']]);
    for (let i = 0; i < 30; i++) boss.update(1 / 30);
    expect(boss.clone.visible).toBe(false);
  });

  it('第 2、3 管 AI 循環確實放出 S4 / S5，Boss 待在結界內', () => {
    for (const [bar, reason] of [[1, '玫瑰荊棘十字'], [2, '花影雙人舞']] as const) {
      const player = new THREE.Vector3(cx + 0.5, 0, cz + 5);
      const { boss, host } = makeBossAt(bar, player);
      for (let i = 0; i < 30 * 60; i++) {
        boss.update(1 / 30);
        expect(Math.hypot(boss.position.x - cx, boss.position.z - cz)).toBeLessThanOrEqual(R - FENCER.BOSS_CLAMP_PAD + 1e-6);
      }
      expect(host.damage.some(([, r]) => r === reason)).toBe(true);
    }
  });
});

describe('投射物：打 Boss (hitBossAt) 與撞結界牆', () => {
  async function makeSys(withBoss: boolean) {
    const { ProjectileSystem, PROJ_STONE, createProjectileSpawnOpts } = await import('../src/weapons/projectiles/ProjectileSystem');
    const events: string[] = [];
    const bossHits: number[] = [];
    const host = {
      targets: [], colliders: [], cameraPosition: new THREE.Vector3(0, 5, -10),
      hitTarget: () => true,
      hitGardenAt: () => null,
      hitBossAt: (p: THREE.Vector3, _r: number, dmg: number) => {
        if (!withBoss) return null;
        if (Math.hypot(p.x, p.z - 6) < 0.8 && p.y < 2.3) { bossHits.push(dmg); return { hit: true, name: '花劍客', defeated: false, isBoss: true, damage: dmg }; }
        return { hit: false, name: '', defeated: false, isBoss: false, damage: 0 };
      },
      arena: { x: 0, z: 0, r: 16 },
      requestHitStop: () => undefined, playSound: () => undefined, hitFlash: () => undefined, dust: () => undefined
    };
    const sys = new ProjectileSystem(host as never);
    const op = createProjectileSpawnOpts(PROJ_STONE);
    op.maxRange = 1000;
    op.onEvent = (e) => { events.push(e.type); };
    sys.spawn(PROJ_STONE, { x: 0, y: 1.2, z: 0 }, { x: 0, y: 0, z: 40 }, op);
    for (let i = 0; i < 30; i++) sys.update(1 / 60);
    return { events, bossHits, sys };
  }
  it('彈弓石子命中 Boss (GARDEN 事件、isBoss)', async () => {
    const { events, bossHits } = await makeSys(true);
    expect(bossHits.length).toBe(1);
    expect(events[0]).toBe('GARDEN');
  });
  it('沒打到 Boss 時撞上結界牆 (WALL 事件)，不飛出圓外', async () => {
    const { events, sys } = await makeSys(false);
    expect(events[0]).toBe('WALL');
    expect(Math.abs(sys.pos[2])).toBeLessThanOrEqual(16);
  });
});
