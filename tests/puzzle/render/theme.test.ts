// S7 主題：配色 / 燈光 / 過場集中在 Theme 物件，模型與紋理從主題取色 (architecture 4.5)
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import * as THREE from 'three';
import { DEFAULT_THEME, THEMES, resolveTheme, type Theme } from '../../../src/puzzle/render/themes';
import { FOYER_THEME } from '../../../src/puzzle/render/themes/foyer';
import { TRANSITIONS } from '../../../src/puzzle/render/transitions';
import { PuzzleScene } from '../../../src/puzzle/render/scene';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { PUZZLE_SRC, listTs } from '../sourceScan';
import { newWorld } from '../helpers';
import { stubCanvas } from './stubCanvas';

describe('渲染：主題', () => {
  beforeAll(stubCanvas);

  it('登錄表：玄關為預設主題；章節主題 id 都已登錄；未知 id 回預設', () => {
    expect(DEFAULT_THEME).toBe(FOYER_THEME);
    expect(THEMES.foyer).toBe(FOYER_THEME);
    for (const ch of CHAPTERS) expect(THEMES[ch.theme]).toBeDefined();
    expect(resolveTheme('foyer')).toBe(FOYER_THEME);
    expect(resolveTheme(undefined)).toBe(DEFAULT_THEME);
    expect(resolveTheme('noSuchTheme')).toBe(DEFAULT_THEME);
    for (const t of Object.values(THEMES)) expect(TRANSITIONS[t.transition]).toBeDefined();
  });

  it('只有 themes/ 擁有配色常數：其餘 render 檔不 import 具體主題 (themes/<id>.ts)', () => {
    const offenders = listTs(join(PUZZLE_SRC, 'render'))
      .map(f => relative(PUZZLE_SRC, f).split(sep).join('/'))
      .filter(f => !f.startsWith('render/themes/'))
      .filter(f => /from '[^']*themes\/(?!index')[^']+'/.test(readFileSync(join(PUZZLE_SRC, f), 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('場景取主題的配色與燈光 (換主題 = 換外觀，不必改模型)', () => {
    const alt: Theme = {
      ...FOYER_THEME, id: 'alt',
      pal: { ...FOYER_THEME.pal, crateDark: 0x123456, bg3d: 0x010203 },
      lights: { ...FOYER_THEME.lights, ambient: 0x0a0b0c }
    };
    const view = new PuzzleScene(newWorld(), alt);
    view.update('3d', 1 / 60, 0, new THREE.PerspectiveCamera());
    const colors = new Set<string>();
    let ambient = '';
    view.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) colors.add((m.material as THREE.MeshStandardMaterial).color.getHexString());
      if ((o as THREE.AmbientLight).isAmbientLight) ambient = (o as THREE.AmbientLight).color.getHexString();
    });
    expect(colors.has('123456')).toBe(true);
    expect(ambient).toBe('0a0b0c');
    expect((view.scene.background as THREE.Color).getHexString()).toBe('010203');
    view.dispose();
  });
});
