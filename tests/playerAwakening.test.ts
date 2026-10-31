import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// SoundEffects / SlashFX / ComboFinisherFX 於模組載入或執行時需要瀏覽器環境，以空函式 mock 取代
vi.mock('../src/audio/SoundEffects', () => ({ soundManager: new Proxy({}, { get: () => () => undefined }) }));
vi.mock('../src/effects/SlashFX', () => ({ slashFX: new Proxy({}, { get: () => () => undefined }) }));
vi.mock('../src/effects/ComboFinisherFX', () => ({ comboFinisherFX: new Proxy({}, { get: () => () => undefined }) }));
// 頭頂氣泡 / 拖尾貼圖建構時需要 canvas：以 2D context 全為空函式的假 canvas 取代
const noop: object = new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => noop) });
vi.stubGlobal('document', {
  createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => noop })
});

import { Player } from '../src/entities/Player';
import {
  PlayerAwakening, AWAKEN_INTRO_SEC, AWAKEN_OUTRO_SEC, AWAKEN_GOLD, AWAKEN_SKY, SUN_PETALS, ECLIPSE_RATIO, litPetalCount, buildSunWheelGeometry
} from '../src/game/fencer/PlayerAwakening';
import { WEAPON_FX_STYLES, weaponFxStyle, hasWeaponFxOverride } from '../src/effects/weaponFxStyle';

type Node = { mesh: THREE.Mesh; land: THREE.BufferGeometry; swim: THREE.BufferGeometry; awake: THREE.BufferGeometry };
const nodesOf = (p: Player) => (p as unknown as { outfitNodes: Node[] }).outfitNodes;

function setup() {
  const scene = new THREE.Scene();
  const player = new Player(scene);
  const a = new PlayerAwakening(scene, player);
  return { scene, player, a };
}

function run(a: PlayerAwakening, player: Player, sec: number, hpRatio = 1, fast = false) {
  for (let t = 0; t < sec - 1e-6; t += 0.05) a.update(0.05, player.position, false, hpRatio, fast);
}

// 未覺醒原貌快照：每個節點的幾何參考、材質參考、軀幹子物件、uniform、拖尾取色、殘影色
function snapshot(player: Player, a: PlayerAwakening) {
  const u = player.awakenUniforms;
  return {
    geos: nodesOf(player).map((n) => n.mesh.geometry),
    mats: nodesOf(player).map((n) => n.mesh.material),
    anchorChildren: player.awakenAnchor.children.length,
    wheelVisible: a.wheel.parent!.visible,
    motesVisible: a.motes.visible,
    uniforms: [u.uReveal.value, u.uGlowK.value, u.uGlowColor.value.getHex(), u.uPetalLit.value, u.uEclipse.value],
    fx: weaponFxStyle('BAT'),
    override: hasWeaponFxOverride(),
    tint: player.afterimageTint
  };
}

describe('玩家向陽覺醒外觀 (完整版)', () => {
  it('三份造型幾何的 aGlow 屬性長度與頂點數一致；陸上 / 泳裝全 0，覺醒有發光紋路', () => {
    const { player } = setup();
    for (const n of nodesOf(player)) {
      for (const g of [n.land, n.swim, n.awake]) {
        expect(g.getAttribute('aGlow').count).toBe(g.getAttribute('position').count);
      }
      for (const g of [n.land, n.swim]) expect(Array.from(g.getAttribute('aGlow').array as Float32Array).every((v) => v === 0)).toBe(true);
      expect(n.awake).not.toBe(n.land);
      const glow = n.awake.getAttribute('aGlow');
      let lit = 0;
      for (let i = 0; i < glow.count; i++) {
        if (glow.getX(i) > 0) lit++;
        expect(glow.getY(i)).toBeGreaterThanOrEqual(0);
        expect(glow.getY(i)).toBeLessThanOrEqual(1);
      }
      expect(lit).toBeGreaterThan(0);
    }
    expect(player.outfitGeometryKinds()).toEqual(['land', 'land', 'land', 'land', 'land', 'land']);
  });

  it('日輪花冠：12 片花瓣編號 1..12 + 日心 13 + 日冕環 14，三角形數在預算內', () => {
    const g = buildSunWheelGeometry();
    const ids = new Set<number>();
    const glow = g.getAttribute('aGlow');
    for (let i = 0; i < glow.count; i++) ids.add(glow.getZ(i));
    expect([...ids].sort((x, y) => x - y)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(g.getAttribute('position').count / 3).toBeLessThanOrEqual(260);
  });

  it('多次進出戰鬥 (播放變身 / 直接套用 / 勝利還原 / 死亡立即還原) 後模型參考、材質、附件、拖尾與殘影色皆恢復', () => {
    const { player, a } = setup();
    const before = snapshot(player, a);
    expect(before.override).toBe(false);
    expect(before.tint).toBeNull();
    const landGeos = nodesOf(player).map((n) => n.land);
    expect(before.geos).toEqual(landGeos);

    const paths: ((done: () => void) => void)[] = [
      // 1. 完整變身 → 勝利播放還原
      () => { a.playIntro(); run(a, player, AWAKEN_INTRO_SEC + 0.1); expect(a.state).toBe('ON'); a.playOutro(); run(a, player, AWAKEN_OUTRO_SEC + 0.1); },
      // 2. 跳過過場直接套用 → 戰鬥中死亡立即還原
      () => { a.applyInstant(); run(a, player, 1, 0.3); a.revertInstant(); },
      // 3. 變身途中切換世界 (中止)
      () => { a.playIntro(); run(a, player, 1.0); a.revertInstant(); },
      // 4. 低血量日蝕中切世界
      () => { a.applyInstant(); run(a, player, 1, 0.1); expect(player.awakenUniforms.uEclipse.value).toBeGreaterThan(0.9); a.revertInstant(); }
    ];
    for (const path of paths) {
      path(() => undefined);
      expect(a.state).toBe('OFF');
      expect(snapshot(player, a)).toEqual(before);
      // 幾何參考完全是原本那一份 (不是重建的新物件)
      nodesOf(player).forEach((n, i) => expect(n.mesh.geometry).toBe(landGeos[i]));
    }
  });

  it('覺醒中：換上覺醒幾何、日輪顯示、拖尾改朝陽配色 (雙燕左拍天空藍)、殘影改金', () => {
    const { player, a } = setup();
    a.applyInstant();
    run(a, player, 0.2);
    expect(player.outfitGeometryKinds()).toEqual(['awake', 'awake', 'awake', 'awake', 'awake', 'awake']);
    expect(a.wheel.parent!.visible).toBe(true);
    expect(a.wheel.material).toBe(player.awakenMaterial);
    expect(weaponFxStyle('BAT').color).toBe(AWAKEN_GOLD);
    expect(weaponFxStyle('DUAL_L').color).toBe(AWAKEN_SKY);
    expect(weaponFxStyle('BAT').life).toBeCloseTo(WEAPON_FX_STYLES.BAT.life * 1.15);
    expect(weaponFxStyle('RACKET').glow).toBe(WEAPON_FX_STYLES.RACKET.glow); // 不會發光的模型維持不發光
    expect(player.afterimageTint).toBe(AWAKEN_GOLD);
    expect(player.awakenUniforms.uReveal.value).toBe(1);
    a.revertInstant();
    expect(weaponFxStyle('BAT')).toBe(WEAPON_FX_STYLES.BAT);
  });

  it('泳裝優先於覺醒造型，上岸後回到覺醒造型', () => {
    const { player, a } = setup();
    a.applyInstant();
    const priv = player as unknown as { setSwimOutfit(s: boolean): void };
    priv.setSwimOutfit(true);
    expect(player.outfitGeometryKinds()).toEqual(['swim', 'land', 'swim', 'swim', 'swim', 'swim']); // 頭部無泳裝層 (同陸上)
    priv.setSwimOutfit(false);
    expect(player.outfitGeometryKinds()).toEqual(['awake', 'awake', 'awake', 'awake', 'awake', 'awake']);
    a.revertInstant();
  });

  it('日輪亮瓣數 = ceil(血量比例 × 12)，<25% 日蝕；脫戰回氣時花瓣逐片亮回', () => {
    expect(litPetalCount(1)).toBe(12);
    expect(litPetalCount(0.5)).toBe(6);
    expect(litPetalCount(0.51)).toBe(7);
    expect(litPetalCount(0.01)).toBe(1);
    expect(litPetalCount(0)).toBe(0);
    expect(litPetalCount(1.2)).toBe(12);

    const { player, a } = setup();
    const u = player.awakenUniforms;
    a.applyInstant();
    run(a, player, 0.5, 1);
    expect(u.uPetalLit.value).toBe(SUN_PETALS);
    run(a, player, 2, 0.5);
    expect(u.uPetalLit.value).toBeCloseTo(6);
    expect(u.uEclipse.value).toBeLessThan(0.01);
    run(a, player, 2, ECLIPSE_RATIO - 0.05);
    expect(u.uPetalLit.value).toBeCloseTo(litPetalCount(ECLIPSE_RATIO - 0.05));
    expect(u.uEclipse.value).toBeGreaterThan(0.95);
    // 回氣：血量瞬間回滿，花瓣以有限速率一片片亮回 (不會同一幀全亮)
    const seq: number[] = [];
    for (let i = 0; i < 40; i++) { a.update(0.05, player.position, false, 1, true); seq.push(u.uPetalLit.value); }
    expect(seq[0]).toBeLessThan(4);
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
    expect(seq[seq.length - 1]).toBe(SUN_PETALS);
    expect(u.uEclipse.value).toBeLessThan(0.05);
    a.revertInstant();
  });

  it('無 Player 時 (純狀態機) 仍可跑完四入口', () => {
    const scene = new THREE.Scene();
    const a = new PlayerAwakening(scene);
    const pos = new THREE.Vector3();
    a.playIntro();
    for (let t = 0; t < AWAKEN_INTRO_SEC + 0.1; t += 0.05) a.update(0.05, pos, false);
    expect(a.state).toBe('ON');
    a.playOutro();
    for (let t = 0; t < AWAKEN_OUTRO_SEC + 0.1; t += 0.05) a.update(0.05, pos, false);
    expect(a.state).toBe('OFF');
    expect(hasWeaponFxOverride()).toBe(false);
  });
});
