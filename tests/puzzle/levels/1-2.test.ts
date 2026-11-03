// 1-2 玄關 (改版)：1-2a～1-2c 的通關腳本 (題與題之間檢查中間狀態) + 數值 / 反例 + 字條量表與預算
// (規格 6「1-2 玄關」、3 D2 / D4 / D10、7.1.1 H1～H4 / H10、7.1.3；舊玄關測試 foyerSolution / puzzleLogic / shortcutScan 照舊保留)
// M-Cube C6：墨水閥 / 出口門與 1-2d 高處墨水閥題依規格 6「保留 / 改 / 廢」表廢除 → 1-2d 的數值驗算 / 反例 / 捷徑掃描刪除；
//   新 1-2c「門後是牆」(東門、拉桿「上」、魔方) 的通關與反例見 levels/ch1Cube.test.ts
import { describe, it, expect } from 'vitest';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { LEVELS } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { addItem, hasItem } from '../../../src/puzzle/mechanics/items';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { trySwitchMode } from '../../../src/puzzle/core/switchMode';
import { resetCrates } from '../../../src/puzzle/core/push';
import { type Cmd, runScript } from '../../../src/puzzle/devtools/runScript';
import { validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import type { ObjDef, World } from '../../../src/puzzle/core/types';
import { newWorld, place, run } from '../helpers';
import { MSG_PLATE_ON, TEXT } from '../msgs';

const def = (id: string): ObjDef => foyer.objects.find(o => o.id === id)!;
const get = (w: World, id: string) => w.byId.get(id)!;
const p = (w: World) => w.player;
const CRATE = def('crate');
const CRATE_TOP = CRATE.y + CRATE.h;
/** 出口區 (隔牆右側) */
const EXIT_MIN_X = 10.4;

/** 1-2c (踏板) 之後的狀態：已有筆尖、踏板已壓下 (鎖定)、鐵柵門已開；木箱在原位 */
function afterC(w: World): World {
  addItem(w, 'nib', 1);
  get(w, 'plate').used = true;
  get(w, 'gate').used = true;
  return w;
}

// ── 通關腳本 (與 runScript.test 的 FOYER 同一路線，拆成三題並在題與題之間檢查) ──
const SOLVE_A: Cmd[] = [
  { wait: 0.2 },
  { walkTo: [-10.3, 2], zFirst: true },
  { act: 'flip' }, { walkTo: [-4.5, null] },
  { expect: w => { expect(p(w).mode).toBe('2d'); expect(p(w).y).toBeCloseTo(0, 3); }, label: '藏寶圖沿書架走過缺口' },
  { act: 'flip' }, { wait: 0.2 },
  { expect: w => { expect(p(w).mode).toBe('3d'); expect(p(w).x).toBeGreaterThan(-6); expect(w.checkpoint).toBe(0); expect(hasItem(w, 'nib')).toBe(false); }, label: '1-2a 完成' }
];
const SOLVE_B: Cmd[] = [
  { walkTo: [null, -5.3] }, { walkTo: [2.5, null] }, { walkTo: [null, 2] }, { walkTo: [6.1, null] },
  { expect: w => expect(get(w, 'crate').x).toBeCloseTo(7, 1), label: '木箱推到高台旁' },
  { act: 'flip' },
  { hop: 1, until: w => p(w).onGround && p(w).y > 2.4 && p(w).x > 8.1, label: '藏寶圖踩木箱跳上高台' },
  { walkTo: [8.5, null] }, { act: 'interact' },
  { expect: w => { expect(hasItem(w, 'nib')).toBe(true); expect(w.msg).toBe(TEXT('lvl.1-2.key.use')); expect(get(w, 'plate').used).toBe(false); }, label: '1-2b 完成：筆尖' }
];
const SOLVE_C: Cmd[] = [
  { act: 'flip' },
  { walkTo: [null, 2] }, { walkTo: [5.4, null] }, { walkTo: [null, 3.5] }, { walkTo: [4.5, null] },
  { walkTo: [null, -4.5] }, { hold: { moveZ: -1 }, seconds: 0.3 },
  { walkTo: [5.6, null] }, { walkTo: [null, -5.4] }, { walkTo: [-0.1, null] },
  { expect: w => { const c = get(w, 'crate'); expect(c.x).toBeGreaterThan(-1.6); expect(c.x).toBeLessThan(-0.4); expect(c.z).toBeCloseTo(-5.4, 3); expect(get(w, 'gate').used).toBe(false); }, label: '木箱沿窄道到踏板' },
  { act: 'flip' }, { wait: 0.1 },
  { expect: w => { expect(get(w, 'plate').used).toBe(true); expect(get(w, 'gate').used).toBe(true); expect(w.msg).toBe(MSG_PLATE_ON); }, label: '踏板壓下、鐵柵門升起' },
  { act: 'flip' },
  { walkTo: [1.5, null] }, { walkTo: [null, 0] }, { walkTo: [12, null] },
  { expect: w => { expect(p(w).x).toBeCloseTo(12, 1); expect(w.cleared).toBe(false); }, label: '1-2c 完成：穿過門洞' }
];
describe('1-2 玄關：通關路徑', () => {
  it('runScript 1-2a → 1-2b → 1-2c (踏板) 一路到出口區；沒有切換被拒絕、房間不會「通關」(出口改由魔方門，見 ch1Cube.test)', () => {
    const w = newWorld();
    runScript(w, [...SOLVE_A, ...SOLVE_B, ...SOLVE_C]);
    expect(w.cleared).toBe(false);
    expect(p(w).x).toBeGreaterThan(EXIT_MIN_X);
    expect(w.events.some(e => e.t === 'switchDenied')).toBe(false);
  });
});

describe('1-2 玄關：資料與驗證器', () => {
  it('validateLevel / validateEntry 對 1-2 為 0 issue；謎題編號 1-2a～1-2c (1-2d 墨水閥題廢除；v0.3 改號於 M1a)、顯示名走文字表', () => {
    expect(validateLevel(foyer, { mechanics: DEFAULT_MECHANICS, bundle: zhHant })).toEqual([]);
    expect(validateEntry(LEVELS.find(e => e.id === '1-2')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(foyer.puzzles!.map(q => q.id)).toEqual(['1-2a', '1-2b', '1-2c']);
    expect(foyer.puzzles!.map(q => TEXT(q.titleKey))).toEqual(['1-2a 書架過缺口', '1-2b 推箱取筆尖', '1-2c 長桌下的機關踏板']);
    const bad = { ...foyer, puzzles: [{ id: '1-2x', titleKey: 'lvl.1-2.puzzle.nope' }] };
    expect(validateLevel(bad, { mechanics: DEFAULT_MECHANICS, bundle: zhHant }).map(i => i.code)).toEqual(['text.missing']);
  });

  it('內部物件 id 沿用 (M-Cube：墨水閥 / 出口門移除，加拉桿、東門、南拱門；其餘不動)', () => {
    expect(foyer.objects.map(o => o.id)).toEqual(['floorA', 'floorB', 'shelf', 'railFront', 'railL', 'railR', 'note', 'table', 'plate', 'note3',
      'crate', 'note2', 'plinth', 'key', 'partBack', 'partFront', 'lintel', 'gate', 'lever', 'doorE', 'archS']);
    const L = def('lever'); const E = def('doorE'); const S = def('archS');
    // 規格 6：拉桿「上」在出口區 (鐵柵門後)、E 門在出口區東端 x≈20、S 拱門在西區前緣 x≈-17
    expect([L.type === 'lever' && L.word, L.x > EXIT_MIN_X, L.interactIn]).toEqual(['up', true, '3d']);
    expect([E.type === 'cubeDoor' && E.side, E.type === 'cubeDoor' && E.kind, E.x]).toEqual(['E', 'door', 19.8]);
    expect([S.type === 'cubeDoor' && S.side, S.type === 'cubeDoor' && S.kind, S.x, S.z]).toEqual(['S', 'arch', -17, 5.8]);
  });

  it('開場旁白 / 筆尖取得 / 通關下一關文字 (story-bible 7.3、7.4)', () => {
    expect(TEXT(foyer.narrationKey)).toBe('鋼筆少了筆尖。墨線封住了門。');
    expect(TEXT('lvl.1-2.key.use')).toBe('拿到了「鋼筆筆尖」。筆尖還是濕的。像有人剛用過。');
    expect(TEXT(foyer.nextKey)).toBe('墨線像退潮一樣散開。門後的走廊很長。下一間房：衣帽間（尚未開放）');
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

describe('1-2 出口區與隔牆反例 (原 1-2d 反例中與墨水閥無關者保留)', () => {
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
      const w = afterC(newWorld());
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
      const w = afterC(newWorld());
      const c = get(w, 'crate');
      c.x = -0.1; c.z = -5.4;
      place(w, px, px > -2.5 && px < 0.5 ? 0.8 : 0, pz);
      run(w, { moveX: mx, moveZ: mz }, 2);
      run(w, { moveZ: 1 }, 2);
      expect(c.z).toBeLessThanOrEqual(-5.2 + 1e-6);
    }
    const w = afterC(newWorld());
    const c = get(w, 'crate');
    c.x = -0.1; c.z = -5.4;
    place(w, 14, 0, 0);
    resetCrates(w);
    expect([c.x, c.z]).toEqual([CRATE.x, CRATE.z]);
    expect(get(w, 'plate').used).toBe(true);
    expect(get(w, 'gate').used).toBe(true);
  });
});

// ── 字條 (規格 7.1.1 量表、7.1.3 預算；驗證器尚無字條規則 → 以資料檢查) ──
interface PuzzleMeta { id: string; difficulty: number; area: [number, number]; keyObjects: string[]; ahaTerms: string[]; notes: string[] }
/** 規格 6 的難度、謎題範圍 (x)、關鍵物件 (H4)、aha 詞表 (H10)；字條歸屬 */
const PUZZLES: PuzzleMeta[] = [
  { id: '1-2a', difficulty: 2, area: [-20, -5], keyObjects: ['shelf', 'railFront', 'railL', 'railR'], ahaTerms: ['書架', '欄', '圖', '紙', '路', '壓平'], notes: ['note'] },
  { id: '1-2b', difficulty: 3, area: [3, 10], keyObjects: ['crate', 'plinth', 'key'], ahaTerms: ['箱', '高台', '挨', '靠', '疊', '圖'], notes: ['note2'] },
  { id: '1-2c', difficulty: 3, area: [-2.5, 3], keyObjects: ['table', 'plate', 'gate'], ahaTerms: ['不存在', '踏板', '圖', '紙', '重量', '箱'], notes: ['note3'] }
];
const STORY_BIBLE_L1: Record<string, string> = {
  note: '缺口不寬。當年他們也是這樣走過去的？',
  note2: '想要高一點？我小時候都踩著朋友的肩膀。',
  note3: '桌子底下，好像有什麼不想讓人看？'
};
const notes = foyer.objects.filter(o => o.type === 'note');
const noteText = (o: ObjDef) => TEXT(o.type === 'note' ? o.textKey ?? '' : '');

describe('1-2 字條：量表 H1～H4、H10 與預算', () => {
  it('三張字條 = story-bible 7.3 的 1-2a / 1-2b / 1-2c L1 原文；1-2d 依預算不放', () => {
    expect(Object.fromEntries(notes.map(o => [o.id, noteText(o)]))).toEqual(STORY_BIBLE_L1);
    expect(PUZZLES.flatMap(q => q.notes).sort()).toEqual(notes.map(o => o.id).sort());
  });

  it('H1 字數 ≤ 24；H2 無祈使開頭與禁用動詞；H3 無按鍵名 / 「按」/ 方位精確詞 / 數字', () => {
    for (const o of notes) {
      const t = noteText(o);
      expect([...t].length).toBeLessThanOrEqual(24);
      expect(/^(把|先|去|到)/.test(t)).toBe(false);
      expect(/先.*再|推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|左邊第|最右邊|正下方/.test(t)).toBe(false);
      expect(/[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]/.test(t)).toBe(false);
    }
  });

  it('H4 不點名本題關鍵物件 (名稱與顯示名)；H10 不含本題 aha 詞表', () => {
    for (const q of PUZZLES) for (const id of q.notes) {
      const t = noteText(def(id));
      for (const k of q.keyObjects) expect(t.includes(TEXT(def(k).labelKey!))).toBe(false);
      for (const term of q.ahaTerms) expect(t.includes(term)).toBe(false);
    }
  });

  it('預算 (7.1.3)：每題張數符合難度 (< 3 → 0～1；3～4.5 → L1 1)、每關提示 ≤ 謎題數 + 1、總數 ≤ 謎題數 + 3', () => {
    for (const q of PUZZLES) expect(q.notes.length).toBeLessThanOrEqual(1);
    expect(notes.length).toBeLessThanOrEqual(PUZZLES.length + 1);
    expect(notes.length).toBeLessThanOrEqual(PUZZLES.length + 3);
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
      expect(findTarget(w)?.def.id).toBe(o.id);
      interact(w);
      expect(w.msg).toBe(noteText(o));
    }
  });
});

describe('1-2 起點與檢查點不受改版影響', () => {
  it('從起點 3D 切到藏寶圖再切回不被拒絕；1-2a 之後的檢查點照舊', () => {
    const w = newWorld();
    run(w, {}, 0.2);
    expect(trySwitchMode(w).ok).toBe(true);
    expect(trySwitchMode(w).ok).toBe(true);
    expect(foyer.checkpoints).toEqual([{ minX: -5.7, x: -4, y: 0, z: 2 }]);
  });
});
