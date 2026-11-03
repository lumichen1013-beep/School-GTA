// 第三章 (滑動) 的轉動模式 (規格 6「第三章骨架與銜接」轉動模式 1～9；app/cubeMapModel)：slideCell 標頭 (每間鄰接空格的房 × 指向空格的方向)、
// 卡住的楔形、實心格名稱、預覽只算不寫、方向鍵 = 往那個方向滑、點格子選取 (房間 / 空格 / 實心格 / 不鄰接空格)、確認 → 一個指令
import { describe, it, expect } from 'vitest';
import { activateDial, captureState, dialTurn, openChapter, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import type { Mechanic } from '../../../src/puzzle/core/registry';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { chapterStart } from '../../../src/puzzle/meta/chapters';
import { defaultSave } from '../../../src/puzzle/meta/save';
import { deriveCubeMap, deriveTurnMode, inkHud, reduceTurnMode, type TurnModeInput, type TurnModeModel } from '../../../src/puzzle/app/cubeMapModel';
import { place, run } from '../helpers';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib' as const] };
const CH3 = CUBE_CHAPTERS.find(c => c.chapter === 3)!;
const SPEC: ChapterSpec = { chapter: 3, cube: CH3.cube, rooms: CH3.rooms, doors: chapterDoors(CH3.rooms) };
/** 第三章、園丁羅盤已啟動、玩家在苗圃中央 (藏寶圖、站穩)；3-1 細化起苗圃開場被樹根卡住 → 先把樹根貼上「小」(3-1b 的解法) */
const open = (opts = OPTS): ChapterSession => {
  const cs = activateDial(openChapter(SPEC, chapterStart(defaultSave(), SPEC, CH3.start), opts));
  cs.world.ext = { ...cs.world.ext, labels: { 'scale:root': ['card.xiao'] } };
  place(cs.world, 0, 0, 1.5, '2d');
  run(cs.world, {}, 0.05);
  return cs;
};
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };
const frozen = (cs: ChapterSession) => JSON.stringify({ s: captureState(cs), e: cs.entry, ext: cs.world.ext, p: cs.world.player });
const heads = (m: TurnModeModel) => m.headers.map(h => [h.group, h.dir, h.glyph, h.at.side, h.at.i, h.cell, h.state]);

describe('deriveTurnMode：滑動的標頭', () => {
  it('S0：只有苗圃 (往上 = 天窗下的空格) 與夜溫室 (往上) 兩顆；實心格、溫床、長廊、深處沒有；說明文字換成滑動版', () => {
    const m = deriveTurnMode(open(), TEXT, null);
    expect(heads(m)).toEqual([['c3', 'N', '▲', 'cell', 3, { x: 0, y: 1 }, 'ok'], ['c4', 'N', '▲', 'cell', 4, { x: 1, y: 1 }, 'ok']]);
    expect(m.headers.map(h => h.label)).toEqual(['苗圃往上滑', '夜溫室往上滑']);
    expect([m.caption, m.text.keys, m.ink]).toEqual(['點房間邊上的箭頭（或點房間、再點空格）看預覽，按「確認」才會滑。', '方向鍵 選往哪滑　Enter 確認　Z 回退　Esc 離開', { left: 8, max: 8 }]);
    expect(m.cells!.map(c => [c.x, c.y, c.kind, c.name])).toEqual([
      [0, 0, 'empty', '空格'], [1, 0, 'empty', '空格'], [2, 0, 'solid', '工具間'],
      [0, 1, 'room', '苗圃'], [1, 1, 'room', '夜溫室'], [2, 1, 'room', '玻璃長廊'],
      [0, 2, 'solid', '水塔'], [1, 2, 'room', '溫床'], [2, 2, 'room', '溫室深處']
    ]);
    // 一般展開圖也寫出實心格的名稱
    expect(deriveCubeMap(open(), TEXT)!.cells.filter(c => c.kind === 'solid').map(c => c.name)).toEqual(['工具間', '水塔']);
  });

  it('苗圃滑到 [0,0] 之後：苗圃 → 右 / 下兩個方向、夜溫室 → 上 / 左兩個方向 (依格號、N E S W)', () => {
    const cs = ok(dialTurn(open(), { group: 'c3', dir: 'N' }));
    expect(heads(deriveTurnMode(cs, TEXT, null)).map(h => h.slice(0, 3))).toEqual([['c0', 'E', '▶'], ['c0', 'S', '▼'], ['c4', 'N', '▲'], ['c4', 'W', '◀']]);
    expect(inkHud(cs, TEXT, '2d')).toBe('墨 ●●●●●●●○');
  });

  it('預覽只算不寫：苗圃 (0,1) → (0,0)，說明列「預覽：苗圃往上滑（還沒轉）」；session 與 World 逐欄不變', () => {
    const cs = open();
    const before = frozen(cs);
    const m = deriveTurnMode(cs, TEXT, { group: 'c3', dir: 'N' });
    expect(frozen(cs)).toBe(before);
    expect([m.caption, m.blocked, m.preview!.moves.map(v => [v.name, v.from, v.to])]).toEqual(['預覽：苗圃往上滑（還沒轉）', null, [['苗圃', [0, 1], [0, 0]]]]);
    expect(m.preview!.cells.find(c => c.x === 0 && c.y === 0)!.name).toBe('苗圃');
  });

  it('卡住 (卡榫：機制掛點 blocksTrack 回報)：你所在的苗圃畫楔形 (state jammed、◢)，選了預覽列說原因、不能確認；不在你房的夜溫室照常', () => {
    const jam: Mechanic = { id: 'jam', blocksTrack: () => true };
    const cs = open({ ...OPTS, mechanics: [...DEFAULT_MECHANICS, jam] });
    const m = deriveTurnMode(cs, TEXT, { group: 'c3', dir: 'N' });
    expect(heads(m)).toEqual([['c3', 'N', '◢', 'cell', 3, { x: 0, y: 1 }, 'jammed'], ['c4', 'N', '▲', 'cell', 4, { x: 1, y: 1 }, 'ok']]);
    expect([m.headers[0].label, m.blocked, m.caption, m.preview]).toEqual(['苗圃往上滑（卡住了）', 'jammed', '苗圃往上滑：軌道卡住了。', null]);
    expect(reduceTurnMode(m.selected, { t: 'confirm' }, m).command).toBeNull();
  });
});

describe('reduceTurnMode：滑動的選取', () => {
  const m0 = deriveTurnMode(open(), TEXT, null);
  const step = (sel: TurnModeModel['selected'], i: TurnModeInput, m: TurnModeModel = m0) => reduceTurnMode(sel, i, m);
  const N3 = { group: 'c3', dir: 'N' as const }, N4 = { group: 'c4', dir: 'N' as const };

  it('方向鍵 = 選往那個方向滑的房：↑ 苗圃 → 再按 夜溫室 → 再按回到苗圃；→ (沒有房間能往右滑) 說明、選取不變', () => {
    let r = step(null, { t: 'step', axis: 'v', d: -1 });
    expect(r).toEqual({ sel: N3, command: null, exit: false });
    r = step(r.sel, { t: 'step', axis: 'v', d: -1 });
    expect(r.sel).toEqual(N4);
    expect(step(r.sel, { t: 'step', axis: 'v', d: -1 }).sel).toEqual(N3);
    expect(step(N4, { t: 'step', axis: 'h', d: 1 })).toEqual({ sel: N4, command: null, exit: false, note: { key: 'msg.dial.noDir' } });
    expect(TEXT('msg.dial.noDir')).toBe('沒有房間能往那邊滑。');
  });

  it('點格子：點苗圃 = 選它 (只有一個方向 → 再點取消)；點空格 = 選滑進來的房；點實心格 → 「工具間是實心的，不會動。」；點不鄰接空格的房 → 「旁邊沒有空格。」', () => {
    let r = step(null, { t: 'cell', x: 0, y: 1 });
    expect(r.sel).toEqual(N3);
    expect(step(r.sel, { t: 'cell', x: 0, y: 1 }).sel).toBeNull();
    expect(step(null, { t: 'cell', x: 1, y: 0 }).sel).toEqual(N4);
    expect(step(null, { t: 'cell', x: 0, y: 0 }).sel).toEqual(N3);
    r = step(N4, { t: 'cell', x: 2, y: 0 });
    expect([r.sel, r.note, TEXT(r.note!.key, r.note!.params)]).toEqual([N4, { key: 'msg.dial.solid', params: { name: '工具間' } }, '工具間是實心的，不會動。']);
    r = step(null, { t: 'cell', x: 2, y: 1 });
    expect([r.sel, r.note, TEXT(r.note!.key)]).toEqual([null, { key: 'msg.dial.noEmpty' }, '旁邊沒有空格。']);
    expect(step(null, { t: 'cell', x: 9, y: 9 })).toEqual({ sel: null, command: null, exit: false });
  });

  it('兩個方向的房：點苗圃依序 右 → 下 → 取消；點空格 (0,1) 依序 苗圃往下 → 夜溫室往左；確認 → 恰好一個 turn 指令', () => {
    const cs = ok(dialTurn(open(), { group: 'c3', dir: 'N' }));
    const m = deriveTurnMode(cs, TEXT, null);
    let sel = reduceTurnMode(null, { t: 'cell', x: 0, y: 0 }, m).sel;
    expect(sel).toEqual({ group: 'c0', dir: 'E' });
    sel = reduceTurnMode(sel, { t: 'cell', x: 0, y: 0 }, m).sel;
    expect(sel).toEqual({ group: 'c0', dir: 'S' });
    expect(reduceTurnMode(sel, { t: 'cell', x: 0, y: 0 }, m).sel).toBeNull();
    sel = reduceTurnMode(null, { t: 'cell', x: 0, y: 1 }, m).sel;
    expect(sel).toEqual({ group: 'c0', dir: 'S' });
    expect(reduceTurnMode(sel, { t: 'cell', x: 0, y: 1 }, m).sel).toEqual({ group: 'c4', dir: 'W' });
    const pv = deriveTurnMode(cs, TEXT, { group: 'c4', dir: 'W' });
    expect(reduceTurnMode({ group: 'c4', dir: 'W' }, { t: 'confirm' }, pv)).toEqual({ sel: null, command: { t: 'turn', turn: { group: 'c4', dir: 'W' } }, exit: false });
  });

  it('第二章 (列 / 行) 的方向鍵與點格子不受影響：沒有 cells、點格子不做事', () => {
    const ch2 = CUBE_CHAPTERS.find(c => c.chapter === 2)!;
    const spec2: ChapterSpec = { chapter: 2, cube: ch2.cube, rooms: ch2.rooms, doors: chapterDoors(ch2.rooms) };
    const cs2 = activateDial(openChapter(spec2, chapterStart(defaultSave(), spec2, ch2.start), OPTS));
    const m2 = deriveTurnMode(cs2, TEXT, null);
    expect([m2.cells, m2.caption]).toEqual([undefined, '點一排的箭頭看預覽，按「確認」才會轉。']);
    expect(reduceTurnMode(null, { t: 'cell', x: 0, y: 0 }, m2)).toEqual({ sel: null, command: null, exit: false });
    expect(reduceTurnMode(null, { t: 'step', axis: 'v', d: 1 }, m2).sel).toEqual({ group: 'row0', dir: 1 });
  });
});
