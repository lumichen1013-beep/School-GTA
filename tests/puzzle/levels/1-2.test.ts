// 1-2 玄關 (規格 v0.3 第一章版本；M1a / C7)：四題 1-2a 推箱取筆尖、1-2b 長桌下的踏板、1-2c 門後是牆、1-2d 三代的年份
// + 不計題的複習路段「書架過缺口」。通關腳本 (單房 + 章節從頭打到樓梯間)、每題反例 (含規格列的錯誤嘗試)、捷徑取樣、驗證器、字條量表與預算
// (規格 6「1-2 玄關」與保留 / 改 / 廢表、4 N27、4.4 P16、7.1.1 H1～H10、7.1.3；story-bible 7.3)
// 另有：1-2a / 1-2b 的捷徑取樣在 devtools/shortcutScan.test (KEY / PLATE / PLATE_SELF / PARTITION)；1-2c 的展開圖 / 轉動 / 換房 / R 在 levels/ch1Cube.test
// C7 相對 C6 的改動：原 1-2a「書架過缺口」不再計題 (腳本與斷言保留為路段)；原 1-2b / 1-2c 改號為 1-2a / 1-2b；字條改為 story-bible 7.3 版
import { describe, it, expect, beforeAll } from 'vitest';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { LEVELS } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { CH1_MODEL } from '../../../src/puzzle/content/cubes/ch1';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { addItem, hasItem } from '../../../src/puzzle/mechanics/items';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { CRATE_WEIGHT, PLAYER_WEIGHT } from '../../../src/puzzle/mechanics/plates';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { trySwitchMode } from '../../../src/puzzle/core/switchMode';
import { resetCrates } from '../../../src/puzzle/core/push';
import { captureState, openChapter, restartRoom, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import { applyChapterEvent } from '../../../src/puzzle/app/chapterEvents';
import { deriveCubeMap, previewFor } from '../../../src/puzzle/app/cubeMapModel';
import { chapterSave, chapterStart } from '../../../src/puzzle/meta/chapters';
import { defaultSave } from '../../../src/puzzle/meta/save';
import { type Cmd, runScript } from '../../../src/puzzle/devtools/runScript';
import { scanShortcuts, type ScanSpec } from '../../../src/puzzle/devtools/shortcutScan';
import { validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { modelFor } from '../../../src/puzzle/render/models';
import { Painter } from '../../../src/puzzle/render/materials';
import { DEFAULT_THEME } from '../../../src/puzzle/render/themes';
import type { LevelDef, Mode, ObjDef, World } from '../../../src/puzzle/core/types';
import { newWorld, place, run } from '../helpers';
import { MSG_PLATE_LIGHT, MSG_PLATE_ON, MSG_UNREACHABLE, TEXT } from '../msgs';
import { stubCanvas } from '../render/stubCanvas';

const def = (id: string): ObjDef => foyer.objects.find(o => o.id === id)!;
const get = (w: World, id: string) => w.byId.get(id)!;
const p = (w: World) => w.player;
const CRATE = def('crate');
const CRATE_TOP = CRATE.y + CRATE.h;
/** 出口區 (隔牆右側) */
const EXIT_MIN_X = 10.4;
/** 1-2d 的詞卡 (物品 id = card.<方向字>；抽象模型 CH1_MODEL.card.word) */
const CARD = `card.${CH1_MODEL.card.word}`;
const CORDS = ['cordL', 'cordM', 'cordR'] as const;
/** 正確順序 (年代由早到晚：右 1931 → 左 1958 → 中 1979)、照畫像左右位置、採用被劃掉的年份 (左 1926 → 右 1931 → 中 1979) */
const ORDER_RIGHT = ['cordR', 'cordL', 'cordM'];
const ORDER_BY_POSITION = ['cordL', 'cordM', 'cordR'];
const ORDER_STRUCK_YEAR = ['cordL', 'cordR', 'cordM'];

/** 1-2b (踏板) 之後的狀態：已有筆尖、踏板已壓下 (鎖定)、鐵柵門已開；木箱在原位 */
function afterB(w: World): World {
  addItem(w, 'nib', 1);
  get(w, 'plate').used = true;
  get(w, 'gate').used = true;
  return w;
}

// ── 通關腳本 (同 runScript.test 的 FOYER 路線，拆題並在題與題之間檢查) ──
/** 1-2d：站在繩前 (3D) 依序拉右 → 左 → 中 */
const pullAt = (id: string): Cmd[] => [
  { walkTo: [def(id).x, -5.3] },
  { expect: w => expect(findTarget(w)?.def.id).toBe(id), label: `站在 ${id} 前只對到它` },
  { act: 'interact' }
];
const SOLVE_D: Cmd[] = [
  ...pullAt('cordR'),
  { expect: w => { expect(get(w, 'cordR').used).toBe(true); expect(w.msg).toBe(TEXT('msg.cord.pulled')); }, label: '右繩停住' },
  ...pullAt('cordL'), ...pullAt('cordM'),
  { expect: w => {
    expect(get(w, 'drawer').used).toBe(true);
    expect(hasItem(w, CARD)).toBe(true);
    expect(w.msg).toBe('喀。畫像下的小抽屜彈開了，裡面是一張詞卡「右」。');
    expect(CORDS.every(id => get(w, id).used)).toBe(true);
    expect(hasItem(w, 'nib')).toBe(false);
  }, label: '1-2d 完成：詞卡「右」(不需要筆尖)' }
];
/** 不計題的路段：3D 走到缺口邊 → 2D 沿書架走過 → 回 3D */
const ROUTE_GAP: Cmd[] = [
  { wait: 0.2 },
  { walkTo: [-10.3, 2], zFirst: true },
  { act: 'flip' }, { walkTo: [-4.5, null] },
  { expect: w => { expect(p(w).mode).toBe('2d'); expect(p(w).y).toBeCloseTo(0, 3); }, label: '藏寶圖沿書架走過缺口' },
  { act: 'flip' }, { wait: 0.2 },
  { expect: w => { expect(p(w).mode).toBe('3d'); expect(p(w).x).toBeGreaterThan(-6); expect(w.checkpoint).toBe(0); expect(hasItem(w, 'nib')).toBe(false); }, label: '路段完成：過了缺口' }
];
const SOLVE_A: Cmd[] = [
  { walkTo: [null, -5.3] }, { walkTo: [2.5, null] }, { walkTo: [null, 2] }, { walkTo: [6.1, null] },
  { expect: w => expect(get(w, 'crate').x).toBeCloseTo(7, 1), label: '木箱推到高台旁' },
  { act: 'flip' },
  { hop: 1, until: w => p(w).onGround && p(w).y > 2.4 && p(w).x > 8.1, label: '藏寶圖踩木箱跳上高台' },
  { walkTo: [8.5, null] }, { act: 'interact' },
  { expect: w => { expect(hasItem(w, 'nib')).toBe(true); expect(w.msg).toBe(TEXT('lvl.1-2.key.use')); expect(get(w, 'plate').used).toBe(false); }, label: '1-2a 完成：筆尖' }
];
const SOLVE_B: Cmd[] = [
  { act: 'flip' },
  { walkTo: [null, 2] }, { walkTo: [5.4, null] }, { walkTo: [null, 3.5] }, { walkTo: [4.5, null] },
  { walkTo: [null, -4.5] }, { hold: { moveZ: -1 }, seconds: 0.3 },
  { walkTo: [5.6, null] }, { walkTo: [null, -5.4] }, { walkTo: [-0.1, null] },
  { expect: w => { const c = get(w, 'crate'); expect(c.x).toBeGreaterThan(-1.6); expect(c.x).toBeLessThan(-0.4); expect(c.z).toBeCloseTo(-5.4, 3); expect(get(w, 'gate').used).toBe(false); }, label: '木箱沿窄道到踏板' },
  { act: 'flip' }, { wait: 0.1 },
  { expect: w => { expect(get(w, 'plate').used).toBe(true); expect(get(w, 'gate').used).toBe(true); expect(w.msg).toBe(MSG_PLATE_ON); }, label: '踏板壓下、鐵柵門升起' },
  { act: 'flip' },
  { walkTo: [1.5, null] }, { walkTo: [null, 0] }, { walkTo: [12, null] },
  { expect: w => { expect(p(w).x).toBeCloseTo(12, 1); expect(w.cleared).toBe(false); }, label: '1-2b 完成：穿過門洞' }
];

// ── 章節 (第一章魔方；同 ch1Cube.test) ──
const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT };
const CH1 = CUBE_CHAPTERS[0];
const SPEC: ChapterSpec = { chapter: CH1.chapter, cube: CH1.cube, rooms: CH1.rooms, doors: chapterDoors(CH1.rooms) };
const start = (): ChapterSession => openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH1.start, CH1.legacy), OPTS);
/** 取走世界送出的章節事件並交給章節層 (同 LevelSession；切換事件略過) */
function pump(cs: ChapterSession): { cs: ChapterSession; kind: string } {
  const e = cs.world.events.splice(0).filter(x => x.t === 'door' || x.t === 'turnRequest');
  if (e.length === 0) return { cs, kind: 'none' };
  const r = applyChapterEvent(cs, e[0], OPTS);
  return { cs: r.kind === 'enter' ? r.next : r.kind === 'turn' ? r.cs : cs, kind: r.kind };
}
const AT_DOOR_E: Cmd[] = [{ walkTo: [19.3, 0] }, { expect: w => expect(findTarget(w)?.def.id).toBe('doorE'), label: '東門' }];
const AT_LEVER: Cmd[] = [{ walkTo: [15, -5.1] }, { expect: w => expect(findTarget(w)?.def.id).toBe('lever'), label: '拉桿' }];

describe('1-2 玄關：通關路徑', () => {
  it('單房 runScript：1-2d → 路段 (缺口) → 1-2a → 1-2b 一路到出口區；沒有切換被拒絕、房間不會「通關」(出口是魔方門)', () => {
    const w = newWorld();
    runScript(w, [{ wait: 0.2 }, ...SOLVE_D, ...ROUTE_GAP, ...SOLVE_A, ...SOLVE_B]);
    expect(w.cleared).toBe(false);
    expect(p(w).x).toBeGreaterThan(EXIT_MIN_X);
    expect([hasItem(w, 'nib'), hasItem(w, CARD)]).toEqual([true, true]);
    expect(w.events.some(e => e.t === 'switchDenied')).toBe(false);
  });

  it('章節從頭打：南拱門進 → 1-2d 取詞卡 → 路段 → 1-2a → 1-2b → 1-2c (門後是牆 → 3D 拉「上」→ 東門接通) → 樓梯間；筆尖與詞卡跟著進樓梯間、寫進存檔', () => {
    let cs = start();
    expect([cs.state.room, cs.state.door]).toEqual(['foyer', 'archS']);
    runScript(cs.world, [{ wait: 0.2 }, ...SOLVE_D, ...ROUTE_GAP, ...SOLVE_A, ...SOLVE_B, ...AT_DOOR_E, { act: 'interact' }]);
    expect(cs.world.msg).toBe('門後是牆。');
    expect(pump(cs).kind).toBe('none');
    runScript(cs.world, [...AT_LEVER, { act: 'interact' }]);
    const t = pump(cs);
    expect(t.kind).toBe('turn');
    cs = t.cs;
    runScript(cs.world, [...AT_DOOR_E, { act: 'interact' }]);
    const e = pump(cs);
    expect(e.kind).toBe('enter');
    cs = e.cs;
    expect([cs.state.room, cs.state.door]).toEqual(['stair', 'doorW']);
    expect([hasItem(cs.world, 'nib'), hasItem(cs.world, CARD)]).toEqual([true, true]);
    const saved = chapterSave(captureState(cs));
    expect(saved.items).toEqual({ nib: 1, [CARD]: 1 });
    expect(saved.rooms.foyer.objs.filter(o => o.id === 'drawer' || o.id.startsWith('cord')).map(o => [o.id, o.used])).toEqual([['cordL', true], ['cordM', true], ['cordR', true], ['drawer', true]]);
  });
});

describe('1-2 玄關：資料與驗證器', () => {
  it('validateLevel / validateEntry 對 1-2 為 0 issue；謎題 1-2a～1-2d (書架過缺口不計題)、顯示名走文字表', () => {
    expect(validateLevel(foyer, { mechanics: DEFAULT_MECHANICS, bundle: zhHant })).toEqual([]);
    expect(validateEntry(LEVELS.find(e => e.id === '1-2')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(foyer.puzzles!.map(q => q.id)).toEqual(['1-2a', '1-2b', '1-2c', '1-2d']);
    expect(foyer.puzzles!.map(q => TEXT(q.titleKey))).toEqual(['1-2a 推箱取筆尖', '1-2b 長桌下的踏板', '1-2c 門後是牆', '1-2d 三代的年份']);
    const bad = { ...foyer, puzzles: [{ id: '1-2x', titleKey: 'lvl.1-2.puzzle.nope' }] };
    expect(validateLevel(bad, { mechanics: DEFAULT_MECHANICS, bundle: zhHant }).map(i => i.code)).toEqual(['text.missing']);
  });

  it('內部物件 id 沿用 (存檔 / 房間快照以 id 對應)：v0.2 書架字條 note 移除；加 1-2c 字條、1-2d 畫像 / 拉繩 / 抽屜 / 字條', () => {
    expect(foyer.objects.map(o => o.id)).toEqual(['floorA', 'floorB', 'shelf', 'railFront', 'railL', 'railR', 'table', 'plate', 'note3',
      'crate', 'note2', 'plinth', 'key', 'partBack', 'partFront', 'lintel', 'gate', 'lever', 'doorE', 'archS',
      'noteC', 'portraitL', 'portraitM', 'portraitR', 'cordL', 'cordM', 'cordR', 'drawer', 'noteD']);
    const L = def('lever'); const E = def('doorE'); const S = def('archS');
    // 規格 6：拉桿「上」在出口區 (鐵柵門後)、E 門在出口區東端 x≈20、S 拱門在西區前緣 x≈-17
    expect([L.type === 'lever' && L.word, L.x > EXIT_MIN_X, L.interactIn]).toEqual(['up', true, '3d']);
    expect([E.type === 'cubeDoor' && E.side, E.type === 'cubeDoor' && E.kind, E.x]).toEqual(['E', 'door', 19.8]);
    expect([S.type === 'cubeDoor' && S.side, S.type === 'cubeDoor' && S.kind, S.x, S.z]).toEqual(['S', 'arch', -17, 5.8]);
  });

  it('1-2a 筆尖 = 能力 nib (兼開字卡匣)；1-2b 踏板 weight 2 = 一個原尺寸木箱、玩家 1 (行為不變)；1-2d 在西區、獎勵 = 抽象模型的詞卡', () => {
    const key = def('key');
    expect([key.grants, key.interactIn]).toEqual(['nib', '2d']);
    const plate = def('plate');
    expect([plate.type === 'plate' && plate.weight, CRATE_WEIGHT, PLAYER_WEIGHT]).toEqual([2, 2, 1]);
    for (const id of ['portraitL', 'portraitM', 'portraitR', ...CORDS, 'drawer']) {
      const o = def(id);
      expect([id, o.x >= -20 && o.x <= -10]).toEqual([id, true]);
    }
    const drawer = def('drawer');
    expect(drawer.type === 'drawer' && [drawer.order, drawer.reward]).toEqual([ORDER_RIGHT, CARD]);
    expect(CH1_MODEL.card.room).toBe('foyer');
    for (const id of CORDS) { const c = def(id); expect([c.type === 'cord' && c.lock, c.interactIn]).toEqual(['drawer', '3d']); }
  });

  it('驗證器 ref.sequence：順序少於 3 條、拉繩的鎖不對都會回報', () => {
    const patch = (id: string, f: Partial<ObjDef>): LevelDef => ({ ...foyer, objects: foyer.objects.map(o => (o.id === id ? { ...o, ...f } as ObjDef : o)) });
    const codes = (l: LevelDef) => validateLevel(l, { mechanics: DEFAULT_MECHANICS, bundle: zhHant }).map(i => [i.code, i.obj]);
    expect(codes(patch('drawer', { order: ['cordR', 'cordL'] } as Partial<ObjDef>))).toEqual([['ref.sequence', 'cordM'], ['ref.sequence', 'drawer']]);
    expect(codes(patch('cordL', { lock: 'gate' } as Partial<ObjDef>))).toEqual([['ref.sequence', 'cordL'], ['ref.sequence', 'drawer']]);
  });

  it('開場旁白 / 筆尖取得 / 通關文字 (story-bible 7.3、7.4)', () => {
    expect(TEXT(foyer.narrationKey)).toBe('鋼筆少了筆尖。門後，是一面牆。');
    expect(TEXT('lvl.1-2.key.use')).toBe('拿到了「鋼筆筆尖」，筆桿上多了一個空的字卡匣。筆尖還是濕的。圖上的字，好像改得動。');
    expect(TEXT(foyer.nextKey)).toBe('牆不見了。門的另一邊，換了一間房。');
  });
});

/** 平地原地跳的最高點 (y 增量) */
function apex(mode: '3d' | '2d'): number {
  const w = newWorld();
  place(w, -17, 0, 2, mode);
  let top = 0;
  run(w, { jump: true }, 0.05);
  run(w, {}, 1, () => { top = Math.max(top, w.player.y); });
  return top;
}

describe('1-2 數值驗算 (實測跳高、D10)', () => {
  it('實測跳高 3D ≈1.18、2D ≈1.52；2D 跳上箱頂 (1.1) 餘裕 ≥ 0.15', () => {
    const a3 = apex('3d');
    const a2 = apex('2d');
    expect(a3).toBeCloseTo(1.18, 1);
    expect(a2).toBeCloseTo(1.52, 1);
    expect(a2 - CRATE_TOP).toBeGreaterThanOrEqual(0.15);
  });
});

describe('1-2a 推箱取筆尖：規格列的錯誤嘗試', () => {
  it('3D 站箱頂跳 (1.1 + 1.18 ≈ 2.3 < 2.5) 上不了高台；同一位置切 2D 就上得去 (正對照)', () => {
    for (const mode of ['3d', '2d'] as const) {
      const w = newWorld();
      const c = get(w, 'crate');
      c.x = 7; c.z = -4.5;
      place(w, 7, CRATE_TOP, -4.5, mode);
      let up = false;
      run(w, { moveX: 1, jump: true }, 2, () => { if (p(w).onGround && p(w).y > 2.4) up = true; });
      expect([mode, up]).toEqual([mode, mode === '2d']);
    }
  });

  it('2D 在高台旁跳起、空中連按 E 拿不到筆尖 (C9：雙腳站穩才能互動)', () => {
    const w = newWorld();
    place(w, 7.7, 0, 0, '2d');
    run(w, { jump: true }, 0.6, () => interact(w));
    expect(hasItem(w, 'nib')).toBe(false);
    expect(get(w, 'key').gone).toBe(false);
  });
});

describe('1-2b 長桌下的踏板：規格列的錯誤嘗試', () => {
  it('從桌前推：木箱從長桌側面往踏板推，被長桌擋在桌外 (長桌從前牆一路延伸到 z=-4.6)，切藏寶圖也壓不下', () => {
    for (const z of [-3.5, 0, 2]) {
      const w = newWorld();
      const c = get(w, 'crate');
      c.x = 2.5; c.z = z;
      place(w, 3.4, 0, z);
      run(w, { moveX: -1 }, 3);
      expect(c.x).toBeGreaterThanOrEqual(def('table').x + def('table').w / 2 + CRATE.w / 2 - 1e-6);
      trySwitchMode(w);
      run(w, {}, 0.2);
      expect([z, get(w, 'plate').used]).toEqual([z, false]);
    }
  });

  it('自己站 (太輕，玩家 1 < 2)：2D 站在踏板上只有「你太輕了」；只在 3D 把木箱推上去也不算 (踏板只在藏寶圖)', () => {
    const w = newWorld();
    place(w, -1, 0, -5.3, '2d');
    run(w, {}, 0.2);
    expect(get(w, 'plate').used).toBe(false);
    expect(w.msg).toBe(MSG_PLATE_LIGHT);
    const v = newWorld();
    const c = get(v, 'crate');
    c.x = -1; c.z = -5.4;
    place(v, 2, 0, 0);
    run(v, {}, 0.5);
    expect([p(v).mode, get(v, 'plate').used, get(v, 'gate').used]).toEqual(['3d', false, false]);
    trySwitchMode(v);
    run(v, {}, 0.1);
    expect(get(v, 'plate').used).toBe(true);
  });
});

describe('1-2 出口區與隔牆反例 (C6 保留)', () => {
  it('鐵柵門未開：木箱在門洞深度怎麼推都進不了出口區 (實景推 / 邊推邊跳、藏寶圖推不動)；門開了同一推法就過得去 (正對照)', () => {
    const gateFace = def('gate').x - def('gate').w / 2;
    for (const open of [false, true]) for (const z of [-0.4, 0, 0.4]) for (const input of [{ moveX: 1 }, { moveX: 1, jump: true }]) {
      const w = newWorld();
      get(w, 'gate').used = open;
      const c = get(w, 'crate');
      c.x = 8; c.z = z;
      place(w, 7.05, 0, z);
      run(w, input, 4);
      if (!open) expect(c.x).toBeLessThanOrEqual(gateFace - 0.6 + 1e-6);
      else if (!input.jump) expect(c.x).toBeGreaterThan(EXIT_MIN_X + 0.6); // 邊推邊跳會跳上箱頂、不再推 (不是對照組)
    }
    const w = newWorld();
    const c = get(w, 'crate');
    c.x = 9.4; c.z = 0;
    place(w, 8.5, 0, 0, '2d');
    run(w, { moveX: 1 }, 3);
    expect(c.x).toBe(9.4);
  });

  it('門洞 z∈[-1,1]、箱深 1.2：箱心 |z| ≤ 0.4 才推得過 (水平容許 0.8)；偏出去會卡在隔牆', () => {
    for (const [z, pass] of [[-0.4, true], [0.4, true], [-0.6, false], [0.5, false], [1.2, false]] as const) {
      const w = afterB(newWorld());
      const c = get(w, 'crate');
      c.x = 8; c.z = z;
      place(w, 7.05, 0, z);
      run(w, { moveX: 1 }, 4);
      expect(c.x > EXIT_MIN_X + 0.6).toBe(pass);
    }
  });

  it('2D 從高台頂越不過隔牆 (閘門開或關)，到不了出口區', () => {
    for (const open of [false, true]) {
      const w = newWorld();
      addItem(w, 'nib', 1);
      get(w, 'gate').used = open;
      place(w, 8.7, 2.5, -4.5, '2d');
      run(w, { moveX: 1, jump: true }, 3, () => interact(w));
      expect(w.player.x).toBeLessThan(9.71);
    }
  });

  it('木箱鎖在窄道 (踏板上) 時推不回來：玩家站不到它後方 (緊貼後牆)，四面怎麼推箱心 z 都 ≤ -5.2；物歸原處才能再用 (規格差異)', () => {
    const tries: [number, number, number, number][] = [[-2.4, -5.4, 1, 0], [1.2, -5.4, -1, 0], [-0.1, -3.9, 0, -1], [-0.1, -4.3, 0, -1]];
    for (const [px, pz, mx, mz] of tries) {
      const w = afterB(newWorld());
      const c = get(w, 'crate');
      c.x = -0.1; c.z = -5.4;
      place(w, px, px > -2.5 && px < 0.5 ? 0.8 : 0, pz);
      run(w, { moveX: mx, moveZ: mz }, 2);
      run(w, { moveZ: 1 }, 2);
      expect(c.z).toBeLessThanOrEqual(-5.2 + 1e-6);
    }
    const w = afterB(newWorld());
    const c = get(w, 'crate');
    c.x = -0.1; c.z = -5.4;
    place(w, 14, 0, 0);
    resetCrates(w);
    expect([c.x, c.z]).toEqual([CRATE.x, CRATE.z]);
    expect(get(w, 'plate').used).toBe(true);
    expect(get(w, 'gate').used).toBe(true);
  });
});

describe('1-2c 門後是牆 (P1 首次)：驗證重點', () => {
  /** 開章後直接把鐵柵門打開 (1-2a / 1-2b 的結果)，站到出口區 */
  const atExit = (): ChapterSession => { const cs = start(); get(cs.world, 'gate').used = true; return cs; };

  it('拉桿前東門不可通行：出口區各處兩模式按 E 都不會換房 (3D 說「門後是牆。」、2D 東門只在實景開得了)', () => {
    for (const mode of ['3d', '2d'] as const) for (const [x, z] of [[19.3, 0], [19.3, 0.6], [19.3, -0.6], [18.9, 0]]) {
      const cs = atExit();
      runScript(cs.world, [{ place: [x, 0, z], mode }, { act: 'interact' }]);
      expect([mode, x, z, pump(cs).kind]).toEqual([mode, x, z, 'none']);
      expect(cs.world.msgKey).toBe(mode === '3d' ? 'msg.cube.wall' : 'msg.unreachable');
    }
  });

  it('展開圖預覽不改狀態；2D 拉不動拉桿 (只在 3D)', () => {
    const cs = atExit();
    runScript(cs.world, [{ place: [15, 0, -5.1], mode: '2d' }]);
    const before = JSON.stringify(captureState(cs));
    const map = deriveCubeMap(cs, TEXT, previewFor(cs))!;
    expect(map.preview!.moved).toEqual({ room: 'foyer', name: '玄關', from: [0, 1], to: [0, 0] });
    expect(JSON.stringify(captureState(cs))).toBe(before);
    runScript(cs.world, [{ act: 'interact' }]);
    expect([pump(cs).kind, cs.world.msg]).toEqual(['none', MSG_UNREACHABLE]);
    expect(cs.state.cube!.pos.foyer).toEqual([0, 1, 0]);
  });

  it('教學題豁免「只用 3D」反例 (D2 v0.3)：全程不切換也解得開 — 3D 拉「上」→ 東門接上樓梯間', () => {
    let cs = atExit();
    runScript(cs.world, [{ place: [12, 0, 0] }, ...AT_LEVER, { act: 'interact' }]);
    expect([cs.world.player.mode, cs.world.events.some(e => e.t === 'switch' || e.t === 'switchDenied')]).toEqual(['3d', false]);
    cs = pump(cs).cs;
    expect(cs.world.ext.cube!.links.doorE).toEqual({ to: 'room', room: 'stair', door: 'doorW', kind: 'door' });
  });
});

/** 在 3D 依序拉繩 (每條：走到繩前 → E) */
const pulls = (order: readonly string[]): Cmd[] => order.flatMap(id => [{ walkTo: [def(id).x, -5.3] }, { act: 'interact' }] as Cmd[]);
/** 從 1-2d 前面 (西區後牆前) 開始的世界 */
const atPortraits = (mode: Mode = '3d'): World => { const w = newWorld(); place(w, -17.5, 0, -5.3, mode); return w; };

describe('1-2d 三代的年份 (P16 首次；N27 順序鎖)', () => {
  it('三種順序取樣：只有「年代由早到晚」(右 → 左 → 中) 打開抽屜；照畫像左右位置、採用被劃掉的年份都不開', () => {
    for (const [order, opens] of [[ORDER_RIGHT, true], [ORDER_BY_POSITION, false], [ORDER_STRUCK_YEAR, false]] as const) {
      const w = atPortraits();
      runScript(w, pulls(order));
      expect([order.join(','), get(w, 'drawer').used, hasItem(w, CARD)]).toEqual([order.join(','), opens, opens]);
    }
  });

  it('六種排列窮舉：只有一種打開 (順序長度 3、選項 3)', () => {
    const perms = (xs: string[]): string[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(r => [x, ...r])));
    const opened = perms([...CORDS]).filter(order => { const w = atPortraits(); runScript(w, pulls(order)); return hasItem(w, CARD); });
    expect(opened).toEqual([ORDER_RIGHT]);
  });

  it('拉對一條：停住 (已拉著的繩不再是互動目標)；拉錯：繩子全部彈回、無懲罰 (其他物件與持有物不變)，馬上照正確順序重拉就開', () => {
    const w = atPortraits();
    runScript(w, pulls(['cordR']));
    expect([get(w, 'cordR').used, w.msg]).toEqual([true, '繩子拉下去，停住了。']);
    runScript(w, [{ walkTo: [-16, -5.3] }]);
    expect(findTarget(w)?.def.id).not.toBe('cordR');
    const others = () => w.objs.filter(o => !CORDS.includes(o.def.id as never)).map(o => [o.def.id, o.x, o.z, o.used, o.gone]);
    const before = others();
    runScript(w, pulls(['cordM']));
    expect(CORDS.map(id => get(w, id).used)).toEqual([false, false, false]);
    expect(w.msg).toBe('喀一聲，繩子全部彈了回去。');
    expect(others()).toEqual(before);
    expect(w.inv).toEqual({});
    runScript(w, pulls(ORDER_RIGHT));
    expect(hasItem(w, CARD)).toBe(true);
  });

  it('兩模式反例：藏寶圖裡拉不動任何一條繩 (看得見、碰不到)；抽屜打開後繩子都停在拉下的位置、不能再拉', () => {
    for (const id of CORDS) {
      const w = atPortraits('2d');
      runScript(w, [{ walkTo: [def(id).x, null] }]);
      expect(findTarget(w)).toBeNull();
      interact(w);
      expect([id, w.msg, get(w, id).used]).toEqual([id, MSG_UNREACHABLE, false]);
    }
    const w = atPortraits();
    runScript(w, pulls(ORDER_RIGHT));
    for (const id of CORDS) { runScript(w, [{ walkTo: [def(id).x, -5.3] }]); expect(findTarget(w)).toBeNull(); }
    expect(w.inv).toEqual({ [CARD]: 1 });
  });

  it('年份分在兩個視角：實景只有左、右的刻字 (中是空白牌)；藏寶圖只有左 (劃掉改寫)、中的墨字；順序 = 依實景刻字 (劃掉的不算) 由早到晚', () => {
    const portraits = ['portraitL', 'portraitM', 'portraitR'].map(def);
    const shown = (mode: Mode) => portraits.map(o => (o.type === 'portrait' ? (mode === '3d' ? o.carved : o.ink) : undefined)).map(k => (k ? TEXT(k) : null));
    expect(shown('3d')).toEqual(['1958', null, '1931']);
    expect(shown('2d')).toEqual(['~~1926~~ 1958', '1979', null]);
    // 單看一個視角，都缺一幅的年份 (排不出順序)
    expect(shown('3d').filter(y => y === null).length).toBe(1);
    expect(shown('2d').filter(y => y === null).length).toBe(1);
    const truth = (o: ObjDef) => (o.type === 'portrait' ? TEXT(o.carved ?? o.ink!).replace(/~~.+?~~\s*/g, '') : '');
    const struck = (o: ObjDef) => (o.type === 'portrait' ? (/~~(.+?)~~/.exec(o.ink ? TEXT(o.ink) : '')?.[1] ?? truth(o)) : '');
    const sortBy = (year: (o: ObjDef) => string) => [...portraits].sort((a, b) => Number(year(a)) - Number(year(b))).map(o => o.id.replace('portrait', 'cord'));
    expect(sortBy(truth)).toEqual(ORDER_RIGHT);
    expect(sortBy(struck)).toEqual(ORDER_STRUCK_YEAR);
    expect(ORDER_BY_POSITION).toEqual(CORDS.slice());
  });

  describe('渲染：年份牌只在對應視角出現', () => {
    beforeAll(stubCanvas);
    it('實景：每幅都有黃銅牌、沒有墨字；藏寶圖：沒有黃銅牌，只有寫了墨字的兩幅有紙籤', () => {
      const w = newWorld();
      const paint = new Painter(DEFAULT_THEME.pal.outline);
      for (const id of ['portraitL', 'portraitM', 'portraitR']) {
        const o = get(w, id);
        const m = modelFor('portrait')(paint, o.def, DEFAULT_THEME);
        const vis = (mode: Mode) => {
          m.update!({ obj: o, world: w, mode, t: 0, dt: 1 / 60 });
          return ['carved', 'ink'].map(n => m.root.getObjectByName(n)?.visible ?? null);
        };
        expect([id, vis('3d')]).toEqual([id, [true, id === 'portraitR' ? null : false]]);
        expect([id, vis('2d')]).toEqual([id, [false, id === 'portraitR' ? null : true]]);
      }
    });
  });

  it('R 重進房間：回到本次進房時 (繩子彈回、抽屜關、詞卡不在)；任何時候都可做 (開章就能拉，不需筆尖)', () => {
    let cs = start();
    runScript(cs.world, [{ wait: 0.2 }, ...SOLVE_D]);
    expect(hasItem(cs.world, CARD)).toBe(true);
    cs = restartRoom(cs, OPTS);
    expect([hasItem(cs.world, CARD), get(cs.world, 'drawer').used, ...CORDS.map(id => get(cs.world, id).used)]).toEqual([false, false, false, false, false]);
  });
});

// ── 捷徑取樣 (規格 M1 / D4；只證明取樣到的配置 × 探針沒有捷徑) ──
const flip: Cmd = { act: 'flip' };
const use: Cmd = { act: 'interact' };
const doorEvent = { id: 'doorEvent', holds: (w: World) => w.events.some(e => e.t === 'door') };

describe('1-2 捷徑取樣', () => {
  it('1-2c：魔方 S0 (東門門後是牆) 時，出口區任何取樣點兩模式怎麼按都不會換房；木箱推到門口也一樣', () => {
    const spec: ScanSpec = {
      level: foyer, mechanics: DEFAULT_MECHANICS, text: TEXT,
      setup: w => { afterB(w); w.ext = { cube: { links: { doorE: { to: 'wall' }, archS: { to: 'frame', frame: 'porch' } } } }; },
      movable: [{ id: 'crate', xs: [4.5, 18.5], zs: [0, 2] }],
      playerAt: [{ x: 19.3, y: 0, z: 0 }, { x: 18.9, y: 0, z: 1.2 }, { x: 15, y: 0, z: -5.1 }, { on: 'crate' }],
      probes: [[use], [{ walkTo: [19.3, null] }, use, flip, { wait: 0.1 }, use], [{ hold: { moveX: 1, jump: true }, seconds: 1 }, use]],
      forbidden: [doorEvent]
    };
    const r = scanShortcuts(spec);
    expect(r.hits).toEqual([]);
    expect(r.runs).toBeGreaterThanOrEqual(30);
  });

  it('1-2d：五種錯誤順序 × 兩模式 × 起點取樣都拿不到詞卡；正確順序在 3D 拿得到 (對照組)', () => {
    const wrong = [['cordL', 'cordM', 'cordR'], ['cordL', 'cordR', 'cordM'], ['cordM', 'cordL', 'cordR'], ['cordM', 'cordR', 'cordL'], ['cordR', 'cordM', 'cordL']];
    const press = (order: readonly string[]): Cmd[] => order.flatMap(id => [{ walkTo: [def(id).x, null] }, { walkTo: [null, -5.3] }, use, { hold: { jump: true }, seconds: 0.3 }, use] as Cmd[]);
    const spec: ScanSpec = {
      level: foyer, mechanics: DEFAULT_MECHANICS, text: TEXT,
      movable: [],
      playerAt: [{ x: -17.5, y: 0, z: -5.3 }, { x: -14, y: 0, z: 2 }],
      probes: [...wrong.map(press), [...press(['cordR', 'cordL']), flip, ...press(['cordM'])]],
      forbidden: [`item:${CARD}`, 'used:drawer']
    };
    const r = scanShortcuts(spec);
    expect(r.hits).toEqual([]);
    expect(r.runs).toBeGreaterThanOrEqual(20);
    const ok = scanShortcuts({ ...spec, modes: ['3d'], probes: [press(ORDER_RIGHT)] });
    expect(ok.hits.map(h => h.flag)).toEqual([`item:${CARD}`, 'used:drawer', `item:${CARD}`, 'used:drawer']);
  });
});

// ── 字條 (規格 7.1.1 量表、7.1.3 預算；驗證器尚無字條規則 → 以資料檢查) ──
interface PuzzleMeta { id: string; difficulty: number; area: [number, number]; keyObjects: string[]; ahaTerms: string[]; notes: string[] }
/** 規格 6 的難度、謎題範圍 (x)、關鍵物件 (H4)、aha 詞表 (H10，7.1 的魔方題預設詞含方向字)；字條歸屬 */
const PUZZLES: PuzzleMeta[] = [
  { id: '1-2a', difficulty: 3, area: [3, 10], keyObjects: ['crate', 'plinth', 'key'], ahaTerms: ['箱', '高台', '挨', '靠', '疊', '圖'], notes: ['note2'] },
  { id: '1-2b', difficulty: 3, area: [-2.5, 3], keyObjects: ['table', 'plate', 'gate'], ahaTerms: ['不存在', '踏板', '圖', '紙', '重量', '箱'], notes: ['note3'] },
  { id: '1-2c', difficulty: 2.5, area: [10.4, 20], keyObjects: ['lever', 'doorE'], ahaTerms: ['轉', '滑', '排列', '魔方', '拉', '移', '對齊', '跟著', '一起', '上'], notes: ['noteC'] },
  { id: '1-2d', difficulty: 3, area: [-20, -10], keyObjects: ['portraitL', 'portraitM', 'portraitR', 'cordL', 'cordM', 'cordR', 'drawer'],
    ahaTerms: ['年', '順序', '先後', '早', '晚', '劃', '視角', '圖', '拉', '繩', '刻', '墨'], notes: ['noteD'] }
];
/** story-bible 7.3 提示字條 (題號依規格 v0.3) 的 L1 原文 */
const STORY_BIBLE_L1: Record<string, string> = {
  note2: '太高了。你小時候，都踩著我的肩膀。',
  note3: '桌子底下。~~什麼都沒有~~ 我好像漏看了什麼？',
  noteC: '這扇門後面，以前不是牆。',
  noteD: '爺爺總說，家裡的事要從頭講起。'
};
const notes = foyer.objects.filter(o => o.type === 'note');
const noteText = (o: ObjDef) => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
/** 劃掉的字不計 (H1)、也不參與禁用詞比對以外的語意 */
const unstruck = (t: string) => t.replace(/~~.+?~~/g, '').replace(/\s+/g, '');

describe('1-2 字條：量表 H1～H4、H9、H10 與預算', () => {
  it('四張字條 = story-bible 7.3 的 1-2a～1-2d L1 原文；路段 (書架過缺口) 不放提示字條', () => {
    expect(Object.fromEntries(notes.map(o => [o.id, noteText(o)]))).toEqual(STORY_BIBLE_L1);
    expect(PUZZLES.flatMap(q => q.notes).sort()).toEqual(notes.map(o => o.id).sort());
  });

  it('H1 字數 ≤ 24 (劃掉的字不計)；H2 無祈使開頭與禁用動詞；H3 無按鍵名 / 「按」/ 方位精確詞 / 數字', () => {
    for (const o of notes) {
      const t = noteText(o);
      expect([...unstruck(t)].length).toBeLessThanOrEqual(24);
      expect(/^(把|先|去|到)/.test(t)).toBe(false);
      expect(/先.*再|推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|左邊第|最右邊|正下方/.test(t)).toBe(false);
      expect(/[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]/.test(t)).toBe(false);
    }
  });

  it('H9 劃掉重寫：每張至多一段、≤ 6 字；未劃掉的部分本身是一句完整的話 (以句號 / 問號結尾)', () => {
    for (const o of notes) {
      const t = noteText(o);
      const struck = [...t.matchAll(/~~(.+?)~~/g)].map(m => m[1]);
      expect(struck.length).toBeLessThanOrEqual(1);
      for (const s of struck) expect([...s].length).toBeLessThanOrEqual(6);
      expect(/[。？]$/.test(unstruck(t))).toBe(true);
    }
  });

  it('H4 不點名本題關鍵物件 (名稱與顯示名)；H10 不含本題 aha 詞表', () => {
    for (const q of PUZZLES) for (const id of q.notes) {
      const t = noteText(def(id));
      for (const k of q.keyObjects) expect([id, t.includes(TEXT(def(k).labelKey!))]).toEqual([id, false]);
      for (const term of q.ahaTerms) expect([id, term, t.includes(term)]).toEqual([id, term, false]);
    }
  });

  it('預算 (7.1.3)：每題張數符合難度 (< 3 → 0～1；3～4.5 → L1 1)、每關提示 ≤ 謎題數 + 1、總數 ≤ 謎題數 + 3', () => {
    for (const q of PUZZLES) expect(q.notes.length).toBe(q.difficulty < 3 ? Math.min(q.notes.length, 1) : 1);
    expect(notes.length).toBeLessThanOrEqual(PUZZLES.length + 1);
    expect(notes.length).toBeLessThanOrEqual(PUZZLES.length + 3);
    expect(PUZZLES.map(q => q.id)).toEqual(foyer.puzzles!.map(q => q.id));
  });

  it('位置：每張在所屬謎題範圍內；兩張間距 ≥ 3；任一 16 單位寬畫面 ≤ 3 張', () => {
    for (const q of PUZZLES) for (const id of q.notes) {
      const x = def(id).x;
      expect(x).toBeGreaterThanOrEqual(q.area[0]);
      expect(x).toBeLessThanOrEqual(q.area[1]);
    }
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    for (let x0 = foyer.bounds.minX; x0 <= foyer.bounds.maxX; x0 += 0.5) {
      expect(xs.filter(x => x >= x0 && x <= x0 + 16).length).toBeLessThanOrEqual(3);
    }
  });

  it('兩模式都讀得到 (站在字條前的地板，站穩按 E 讀出本文)', () => {
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const w = newWorld();
      place(w, o.x, 0, -5.2, mode);
      expect([o.id, mode, findTarget(w)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(w);
      expect(w.msg).toBe(noteText(o));
    }
  });
});

describe('1-2 起點與檢查點不受改版影響', () => {
  it('從起點 3D 切到藏寶圖再切回不被拒絕；過缺口之後的檢查點照舊', () => {
    const w = newWorld();
    run(w, {}, 0.2);
    expect(trySwitchMode(w).ok).toBe(true);
    expect(trySwitchMode(w).ok).toBe(true);
    expect(foyer.checkpoints).toEqual([{ minX: -5.7, x: -4, y: 0, z: 2 }]);
  });
});
