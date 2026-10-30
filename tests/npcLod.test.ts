import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NPC_LOD_DIST, applyNpcLodLevel, nextNpcLodLevel, type NpcLodLevel, type NpcLodRig } from '../src/entities/npc/lod';

const sq = (d: number) => d * d;

describe('nextNpcLodLevel 距離分級與遲滯', () => {
  it('完整模型依進入門檻降級', () => {
    expect(nextNpcLodLevel(0, sq(NPC_LOD_DIST.midEnter - 0.1), false)).toBe(0);
    expect(nextNpcLodLevel(0, sq(NPC_LOD_DIST.midEnter + 0.1), false)).toBe(1);
    expect(nextNpcLodLevel(0, sq(NPC_LOD_DIST.farEnter + 0.1), false)).toBe(2);
  });

  it('遲滯帶內維持目前分級 (不在門檻附近來回切換)', () => {
    const midBand = sq((NPC_LOD_DIST.midEnter + NPC_LOD_DIST.midExit) / 2);
    expect(nextNpcLodLevel(0, midBand, false)).toBe(0);
    expect(nextNpcLodLevel(1, midBand, false)).toBe(1);
    const farBand = sq((NPC_LOD_DIST.farEnter + NPC_LOD_DIST.farExit) / 2);
    expect(nextNpcLodLevel(1, farBand, false)).toBe(1);
    expect(nextNpcLodLevel(2, farBand, false)).toBe(2);
  });

  it('依離開門檻回升', () => {
    expect(nextNpcLodLevel(1, sq(NPC_LOD_DIST.midExit - 0.1), false)).toBe(0);
    expect(nextNpcLodLevel(2, sq(NPC_LOD_DIST.farExit - 0.1), false)).toBe(1);
    expect(nextNpcLodLevel(2, sq(NPC_LOD_DIST.midExit - 0.1), false)).toBe(0);
  });

  it('強制完整模型 (追捕/戰鬥/近距離例外) 一律回到 0', () => {
    for (const lv of [0, 1, 2] as NpcLodLevel[]) {
      expect(nextNpcLodLevel(lv, sq(200), true)).toBe(0);
    }
  });

  it('沿距離往返掃描時每個門檻只切換一次', () => {
    let lv: NpcLodLevel = 0;
    let switches = 0;
    const walk = (from: number, to: number) => {
      const step = from < to ? 0.25 : -0.25;
      for (let d = from; step > 0 ? d <= to : d >= to; d += step) {
        // 每一步加入 ±0.5m 抖動模擬來回踱步
        for (const jitter of [0.5, -0.5, 0]) {
          const next = nextNpcLodLevel(lv, sq(d + jitter), false);
          if (next !== lv) switches++;
          lv = next;
        }
      }
    };
    walk(0, 80);
    expect(lv).toBe(2);
    walk(80, 0);
    expect(lv).toBe(0);
    expect(switches).toBe(4);
  });
});

describe('applyNpcLodLevel 零件顯示切換', () => {
  const make = (): NpcLodRig => ({
    mid: new THREE.Mesh(),
    far: new THREE.Mesh(),
    upper: [new THREE.Mesh(), new THREE.Object3D()],
    legs: [new THREE.Object3D(), new THREE.Object3D()]
  });

  it('三個分級各自只顯示對應零件', () => {
    const rig = make();
    applyNpcLodLevel(rig, 1);
    expect(rig.upper.every(o => !o.visible)).toBe(true);
    expect(rig.legs.every(o => o.visible)).toBe(true);
    expect([rig.mid.visible, rig.far.visible]).toEqual([true, false]);
    applyNpcLodLevel(rig, 2);
    expect(rig.legs.every(o => !o.visible)).toBe(true);
    expect([rig.mid.visible, rig.far.visible]).toEqual([false, true]);
    applyNpcLodLevel(rig, 0);
    expect(rig.upper.every(o => o.visible) && rig.legs.every(o => o.visible)).toBe(true);
    expect([rig.mid.visible, rig.far.visible]).toEqual([false, false]);
  });
});
