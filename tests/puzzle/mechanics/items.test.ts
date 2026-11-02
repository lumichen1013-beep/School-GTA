import { describe, it, expect } from 'vitest';
import { newWorld, place } from '../helpers';
import { interact } from '../../../src/puzzle/core/interact';
import { compileMechanics } from '../../../src/puzzle/core/registry';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import type { LevelDef, ObjDef } from '../../../src/puzzle/core/types';

const floor: ObjDef = { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 20, h: 1, d: 10, visible: 'both', solid: true };
const drop = (id: string, x: number): ObjDef =>
  ({ id, type: 'key', x, y: 0, z: 0, w: 0.3, h: 0.5, d: 0.3, visible: 'both', solid: false, interactable: true, grants: 'inkdrop', useText: `拿到墨滴 ${id}` });
const level: LevelDef = {
  ...foyer, bounds: { minX: -10, maxX: 10, minZ: -5, maxZ: 5 }, checkpoints: [],
  objects: [
    floor, drop('d1', -6), drop('d2', -3),
    { id: 'lock', type: 'valve', x: 3, y: 0, z: 0, w: 0.5, h: 0.5, d: 0.5, visible: 'both', solid: false, interactable: true,
      requires: { item: 'inkdrop', consume: true }, opens: 'gate', lockedText: '缺墨', useText: '墨流進去了' },
    { id: 'gate', type: 'gate', x: 6, y: 0, z: 0, w: 0.3, h: 3, d: 10, visible: 'both', solid: true, interactable: true }
  ]
};

describe('N9 通用鑰匙 / 鎖 (資料驅動)', () => {
  it('grants 累加數量；consume 鎖每次消耗一個並觸發 opens', () => {
    const w = newWorld(level);
    place(w, 3, 0, 0);
    interact(w);
    expect(w.msg).toBe('缺墨');
    expect(w.byId.get('lock')!.used).toBe(false);
    for (const x of [-6, -3]) { place(w, x, 0, 0); interact(w); }
    expect(w.inv).toEqual({ inkdrop: 2 });
    expect(w.msg).toBe('拿到墨滴 d2');
    place(w, 3, 0, 0);
    interact(w);
    expect(w.msg).toBe('墨流進去了');
    expect(w.inv).toEqual({ inkdrop: 1 });
    expect(hasItem(w, 'inkdrop')).toBe(true);
    expect(w.byId.get('lock')!.used).toBe(true);
    expect(w.byId.get('gate')!.used).toBe(true);
  });

  it('非消耗鎖 (玄關墨水閥) 不減少持有物', () => {
    const w = newWorld();
    place(w, 8.5, 2.5, -4.5, '2d'); interact(w);
    place(w, 15, 0, -5.2, '2d'); interact(w);
    expect(w.inv).toEqual({ nib: 1 });
  });
});

describe('預設機制表', () => {
  it('可編譯，玄關所有物件類型都有擁有者', () => {
    const c = compileMechanics(DEFAULT_MECHANICS);
    for (const o of foyer.objects) expect(c.types.has(o.type)).toBe(true);
  });
});
