// S7 渲染登錄表：物件類型 → 模型工廠 (architecture 4.5)
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { porch } from '../../../src/puzzle/content/levels/ch1/1-1-porch';
import { MODELS, boxModel, modelFor } from '../../../src/puzzle/render/models';
import { Painter } from '../../../src/puzzle/render/materials';
import type { ObjDef } from '../../../src/puzzle/core/types';
import { DEFAULT_THEME } from '../../../src/puzzle/render/themes';
import { stubCanvas } from './stubCanvas';

describe('渲染：模型登錄表', () => {
  beforeAll(stubCanvas);

  it('玄關所有物件類型都有登錄的模型工廠', () => {
    const types = [...new Set(foyer.objects.map(o => o.type))];
    expect(types.filter(t => !MODELS[t])).toEqual([]);
    for (const t of types) expect(modelFor(t)).toBe(MODELS[t]);
  });

  it('門廊所有物件類型 (含新增的鐵柵 / 墨牆 / 玻璃牆 / 木板橋 / 石階) 都有登錄的模型工廠，不落到洋紅後備盒', () => {
    const types = [...new Set(porch.objects.map(o => o.type))];
    expect(types.filter(t => !MODELS[t])).toEqual([]);
    for (const t of ['bars', 'inkwall', 'glass', 'plank', 'stone']) expect(types).toContain(t);
    const p = new Painter(DEFAULT_THEME.pal.outline);
    for (const d of porch.objects) {
      const root = modelFor(d.type)(p, d, DEFAULT_THEME).root;
      const colors = new Set<string>();
      root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) colors.add((m.material as THREE.MeshStandardMaterial).color.getHexString()); });
      expect(colors.has('ff00ff')).toBe(false);
    }
  });

  it('未登錄類型改用後備盒模型 (不隱形)，尺寸同邏輯盒、原點在底面中心', () => {
    expect(modelFor('noSuchType')).toBe(boxModel);
    const def = { id: 'x', type: 'noSuchType', x: 0, y: 0, z: 0, w: 1, h: 2, d: 3, visible: 'both', solid: true } as unknown as ObjDef;
    const m = modelFor(def.type)(new Painter(DEFAULT_THEME.pal.outline), def, DEFAULT_THEME);
    const bb = new THREE.Box3();
    m.root.updateMatrixWorld(true);
    m.root.traverse(o => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh.material as THREE.Material).side === THREE.BackSide) return; // 略過 2D 描邊
      mesh.geometry.computeBoundingBox();
      bb.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
    });
    expect(bb.min.y).toBeCloseTo(0, 6);
    expect(bb.max.y).toBeCloseTo(2, 6);
    expect(bb.max.x - bb.min.x).toBeCloseTo(1, 6);
    expect(bb.max.z - bb.min.z).toBeCloseTo(3, 6);
  });

  it('每個工廠都產生 root；有動畫的模型以 update(ctx) 更新 (鑰匙不再是 scene 特例)', () => {
    const p = new Painter(DEFAULT_THEME.pal.outline);
    for (const o of foyer.objects) {
      const m = modelFor(o.type)(p, o, DEFAULT_THEME);
      expect(m.root).toBeInstanceOf(THREE.Object3D);
    }
    expect(MODELS.key!(p, foyer.objects.find(o => o.type === 'key')!, DEFAULT_THEME).update).toBeTypeOf('function');
  });
});
