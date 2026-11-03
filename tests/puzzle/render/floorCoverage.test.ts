// 地板覆蓋與舊快照 (使用者回報「2-2 閱覽室右側地板有洞、地板跑到左側牆外」)：
// 成因 = 舊存檔裡閱覽室還是占位房時的房間快照 (地板 x=0) 被 restoreRoom 原樣寫回，蓋掉改版後的地板 x=4 (x∈[-6,14])
import { describe, it, expect, beforeAll } from 'vitest';
import { LEVELS } from '../../../src/puzzle/content/levels';
import { CUBE_CHAPTERS, PROTO_CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { openChapter, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import { chapterStart } from '../../../src/puzzle/meta/chapters';
import { defaultSave } from '../../../src/puzzle/meta/save';
import type { LevelDef } from '../../../src/puzzle/core/types';
import * as THREE from 'three';
import { PuzzleScene } from '../../../src/puzzle/render/scene';
import { PuzzleCameras } from '../../../src/puzzle/render/cameras';
import { THEMES } from '../../../src/puzzle/render/themes';
import { TEXT } from '../msgs';
import { stubCanvas } from './stubCanvas';

const ALL: LevelDef[] = [
  ...LEVELS.map(e => e.load()),
  ...[...CUBE_CHAPTERS, ...PROTO_CUBE_CHAPTERS].flatMap(c => Object.values(c.rooms))
].filter((l, i, a) => a.indexOf(l) === i);

/** 地板 (type floor) 在 x 上的聯集沒蓋到的區間 */
function gaps(l: LevelDef): Array<[number, number]> {
  const spans = l.objects.filter(o => o.type === 'floor').map(o => [o.x - o.w / 2, o.x + o.w / 2] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let at = l.bounds.minX;
  for (const [a, b] of spans) { if (a > at + 1e-6) out.push([at, a]); at = Math.max(at, b); }
  if (at < l.bounds.maxX - 1e-6) out.push([at, l.bounds.maxX]);
  return out;
}

describe('地板覆蓋：每間房的地板聯集蓋滿 bounds.minX..maxX (有意留的坑洞 = 房間有 pits 裝飾，且兩端仍有地板)', () => {
  it('所有關卡與魔方房間', () => {
    expect(ALL.length).toBeGreaterThan(10);
    for (const l of ALL) {
      const g = gaps(l);
      const pits = (l.decor ?? []).some(d => d.kind === 'pits');
      if (!pits) expect([l.id, g]).toEqual([l.id, []]);
      else expect([l.id, g.some(([a, b]) => a <= l.bounds.minX + 1e-6 || b >= l.bounds.maxX - 1e-6)]).toEqual([l.id, false]);
    }
  });
});

describe('舊存檔的房間快照不搬動地形 (restoreRoom 只覆寫可推物的位置)', () => {
  beforeAll(stubCanvas);
  const CH2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
  const SPEC: ChapterSpec = { chapter: 2, cube: CH2.cube, rooms: CH2.rooms, doors: chapterDoors(CH2.rooms) };

  it('閱覽室占位版的快照 (地板 x=0) → 開章後地板仍在 x=4、模型的世界座標與資料一致；物件旗標照快照', () => {
    const st = chapterStart(defaultSave(), SPEC, { room: 'reading', door: 'doorW' });
    st.rooms.reading = { objs: [{ id: 'floor', x: 0, y: -1, z: 0, gone: false, used: false, touched: false }, { id: 'veil', x: 0, y: 0, z: 0, gone: false, used: true, touched: false }], flags: [] };
    const cs = openChapter(SPEC, st, { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib'] });
    const floor = cs.world.byId.get('floor')!;
    expect([floor.x, floor.def.x, cs.world.byId.get('veil')!.used, cs.world.byId.get('veil')!.x]).toEqual([4, 4, true, -1]);
    const view = new PuzzleScene(cs.world, THEMES.study);
    view.update('3d', 1 / 60, 0, new PuzzleCameras(cs.world).active('3d'));
    view.scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(view.modelRoot('floor')!);
    expect([view.modelRoot('floor')!.getWorldPosition(new THREE.Vector3()).x, Math.round(box.min.x * 100) / 100, Math.round(box.max.x * 100) / 100]).toEqual([4, -6.04, 14.04]) // 地板盒 ±10 + 2D 描邊網格的外擴 0.04;
    view.dispose();
  });

  it('可推物照舊依快照放回 (第一章衣帽間的木箱推過之後離開再回來)', () => {
    const CH1 = CUBE_CHAPTERS[0];
    const spec: ChapterSpec = { chapter: 1, cube: CH1.cube, rooms: CH1.rooms, doors: chapterDoors(CH1.rooms) };
    const st = chapterStart(defaultSave(), spec, { room: 'closet', door: null });
    st.rooms.closet = { objs: [{ id: 'closetCrate', x: 1.4, y: 0, z: -2, gone: false, used: false, touched: false }], flags: [] };
    const cs = openChapter(spec, st, { mechanics: DEFAULT_MECHANICS, text: TEXT });
    const c = cs.world.byId.get('closetCrate')!;
    expect([c.def.pushable, c.x, c.z]).toEqual([true, 1.4, -2]);
  });
});
