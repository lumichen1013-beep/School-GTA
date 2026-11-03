// S7 LevelDef.decor：玄關的裝飾座標由關卡資料提供，render/decor 登錄表解讀；純呈現，不進碰撞
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { DECOR, buildDecor } from '../../../src/puzzle/render/decor';
import { Painter } from '../../../src/puzzle/render/materials';
import { DEFAULT_THEME } from '../../../src/puzzle/render/themes';
import { solidsFor } from '../../../src/puzzle/core/presence';
import type { LevelDef } from '../../../src/puzzle/core/types';
import { newWorld } from '../helpers';
import { stubCanvas } from './stubCanvas';

const paint = () => new Painter(DEFAULT_THEME.pal.outline);
const meshCount = (o: THREE.Object3D) => { let n = 0; o.traverse(c => { if ((c as THREE.Mesh).isMesh) n++; }); return n; };

describe('渲染：關卡裝飾 (LevelDef.decor)', () => {
  beforeAll(stubCanvas);

  it('玄關的裝飾都是已登錄的 kind (牆、掛畫 ×3、牆上書架 ×3、地毯 ×2、吊燈 ×4、坑洞)', () => {
    const kinds = (foyer.decor ?? []).map(d => d.kind);
    expect(kinds.filter(k => !DECOR[k])).toEqual([]);
    const count = (k: string) => kinds.filter(x => x === k).length;
    expect([count('walls'), count('painting'), count('wallShelf'), count('rug'), count('pendant'), count('pits')]).toEqual([1, 3, 3, 2, 4, 1]);
  });

  it('裝飾不進碰撞、不成為物件：有無 decor 的世界，物件與兩模式實體完全相同', () => {
    const bare: LevelDef = { ...foyer, decor: undefined };
    const a = newWorld(foyer);
    const b = newWorld(bare);
    expect(a.objs.map(o => o.def.id)).toEqual(b.objs.map(o => o.def.id));
    for (const m of ['3d', '2d'] as const) expect(solidsFor(a, m).map(o => o.def.id)).toEqual(solidsFor(b, m).map(o => o.def.id));
  });

  it('沒有 decor 的關卡不會長出玄關的裝飾 (H21)', () => {
    const d = buildDecor(paint(), { ...foyer, decor: [] }, DEFAULT_THEME);
    expect(d.root.children).toEqual([]);
    expect(d.only3d).toEqual([]);
    expect(d.occluders).toEqual([]);
  });

  it('座標來自資料：掛畫位置 = 資料 (z 掛在後牆)，圖紙裡隨後牆往後推，回現實歸位', () => {
    const level: LevelDef = { ...foyer, decor: [{ kind: 'painting', x: 3, y: 2, w: 1, h: 1, variant: 1 }] };
    const d = buildDecor(paint(), level, DEFAULT_THEME);
    const g = d.root.children[0];
    d.update(0, false);
    expect(g.position.toArray()).toEqual([3, 2, foyer.bounds.minZ + 0.05]);
    d.update(0, true);
    expect(g.position.z).toBeCloseTo(foyer.bounds.minZ + 0.05 - 0.8, 9);
    d.update(0, false);
    expect(g.position.z).toBe(foyer.bounds.minZ + 0.05);
  });

  it('只在現實的裝飾 (書架、地毯、吊燈光) 在圖紙裡隱藏；吊燈網格可淡出', () => {
    const level: LevelDef = { ...foyer, decor: [{ kind: 'rug', x: 0, z: 0, w: 2, d: 1 }, { kind: 'pendant', x: 1, z: 0 }, { kind: 'wallShelf', x: 0, y: 3, w: 2, seed: 2 }] };
    const d = buildDecor(paint(), level, DEFAULT_THEME);
    expect(d.occluders.length).toBe(4);
    d.update(0, true);
    expect(d.only3d.every(o => !o.visible)).toBe(true);
    expect(d.occluders.every(m => m.visible)).toBe(true); // 燈罩在圖紙裡當淡色背景
    d.update(0, false);
    expect(d.only3d.every(o => o.visible)).toBe(true);
  });

  it('坑洞依地板缺口自動鋪設 (玄關一個缺口 x∈[-10,-6])', () => {
    const d = buildDecor(paint(), { ...foyer, decor: [{ kind: 'pits' }] }, DEFAULT_THEME);
    expect(meshCount(d.root)).toBe(1);
    const pit = d.root.children[0].children[0];
    expect(pit.position.x).toBe(-8);
  });

  it('欄位缺漏丟錯 (關卡資料寫錯在開發期就看到)；未登錄的 kind 略過並警告', () => {
    expect(() => buildDecor(paint(), { ...foyer, decor: [{ kind: 'rug', x: 0, z: 0, w: 2 }] }, DEFAULT_THEME)).toThrow(/rug.*"d"/);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = buildDecor(paint(), { ...foyer, decor: [{ kind: 'noSuchDecor' }] }, DEFAULT_THEME);
    expect(d.root.children).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('浮書 (floatBooks) 平常緩慢上下浮動；減弱動態 (still) 時靜止 (story-bible 8.3)', () => {
    const level: LevelDef = { ...foyer, decor: [{ kind: 'floatBooks', x: 0, y: 3, z: 0, w: 4, seed: 2 }] };
    const ys = (still: boolean) => {
      const d = buildDecor(paint(), level, DEFAULT_THEME, { still });
      const g = d.root.children[0];
      const at = (t: number) => { d.update(t, false); return g.children.map(c => c.position.y); };
      return [at(0), at(1.7)];
    };
    const [a0, a1] = ys(false);
    expect(a0).not.toEqual(a1);
    const [b0, b1] = ys(true);
    expect(b0).toEqual(b1);
  });
});
