// D4：轉動模式的純函式模型 (app/cubeMapModel deriveTurnMode / reduceTurnMode / turnModeFrame / inkHud)、
// ChapterCommand 佇列 (LevelLoop：只送進下一個固定步)、HUD 墨量、按鍵 (architecture 4.16.1、7.4.1 D4)
import { describe, it, expect } from 'vitest';
import { activateDial, captureState, dialTurn, newChapterState, openChapter, type ChapterCommand, type ChapterSession, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import type { Mechanic } from '../../../src/puzzle/core/registry';
import { TEST_DIAL_CHAPTER, TEST_DIAL_CUBE } from '../../../src/puzzle/content/cubes/test-dial';
import { PROTO_DIAL_ROOMS } from '../../../src/puzzle/content/levels/proto/dial';
import { deriveCubeMap, deriveTurnMode, inkDots, inkHud, reduceTurnMode, turnModeFrame, turnTab, type TurnModeInput, type TurnModeModel } from '../../../src/puzzle/app/cubeMapModel';
import { deriveHud } from '../../../src/puzzle/app/hudModel';
import { LevelLoop, FIXED_DT } from '../../../src/puzzle/app/loop';
import { DEFAULT_BINDINGS, INPUT_ACTIONS } from '../../../src/puzzle/input/bindings';
import type { InputFrame } from '../../../src/puzzle/input/types';
import { newWorld, place, run } from '../helpers';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT };
const SPEC: ChapterSpec = { chapter: TEST_DIAL_CHAPTER, cube: TEST_DIAL_CUBE, rooms: PROTO_DIAL_ROOMS, doors: chapterDoors(PROTO_DIAL_ROOMS) };
const open = (opts = OPTS): ChapterSession => {
  const cs = activateDial(openChapter(SPEC, newChapterState(SPEC, 'protoA', null), opts));
  place(cs.world, -2, 0, 1.5, '2d');
  run(cs.world, {}, 0.05);
  return cs;
};
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };
const frozen = (cs: ChapterSession) => JSON.stringify({ s: captureState(cs), e: cs.entry, ext: cs.world.ext, p: cs.world.player });
const frame = (f: Partial<InputFrame>): InputFrame => ({ moveX: 0, moveZ: 0, jump: false, pressed: [], anyKey: false, ...f });

describe('deriveTurnMode：標頭、預覽、阻擋', () => {
  it('標頭：每組 × 方向一顆 (列 ◀ ▶ 在左右、兩列的行 ⇅ 在下)；啟動時只開上列，下列與三行畫鎖扣', () => {
    const m = deriveTurnMode(open(), TEXT, null);
    expect(m.headers.map(h => [h.group, h.dir, h.glyph, h.at.side, h.at.i, h.state])).toEqual([
      ['row0', -1, '◀', 'left', 0, 'ok'], ['row0', 1, '▶', 'right', 0, 'ok'],
      ['row1', -1, '◀', 'left', 1, 'locked'], ['row1', 1, '▶', 'right', 1, 'locked'],
      ['col0', 1, '⇅', 'bottom', 0, 'locked'], ['col1', 1, '⇅', 'bottom', 1, 'locked'], ['col2', 1, '⇅', 'bottom', 2, 'locked']
    ]);
    expect(m.headers.map(h => h.label).slice(0, 5)).toEqual(['第 1 列往左', '第 1 列往右', '第 2 列往左（鎖著）', '第 2 列往右（鎖著）', '第 1 行上下對調（鎖著）']);
    expect([m.selected, m.preview, m.ink, m.canUndo, m.blocked, m.caption]).toEqual([null, null, { left: 6, max: 6 }, false, null, '點一排的箭頭看預覽，按「確認」才會轉。']);
    expect(m.text).toEqual({ confirm: '確認', undo: '回退', exit: '離開', ink: '墨 6 / 6', keys: '方向鍵 選一排　Enter 確認　Z 回退　Esc 離開' });
  });

  it('預覽只算不寫：deriveTurnMode / deriveCubeMap 前後 session 與 World 逐欄相同；預覽 = 轉後的格與門、三間房的移動', () => {
    const cs = open();
    const before = frozen(cs);
    const m = deriveTurnMode(cs, TEXT, { group: 'row0', dir: 1 });
    deriveCubeMap(cs, TEXT);
    expect(frozen(cs)).toBe(before);
    expect(m.caption).toBe('預覽：第 1 列往右（還沒轉）');
    expect(m.preview!.moves.map(v => [v.name, v.from, v.to])).toEqual([['甲室', [0, 0], [1, 0]], ['乙室', [1, 0], [2, 0]], ['丙室', [2, 0], [0, 0]]]);
    expect(m.preview!.cells.filter(c => c.y === 0).map(c => c.name)).toEqual(['丙室', '甲室', '乙室']);
    // 轉後：丙室東門 ↔ 甲室西門接通
    expect(m.preview!.doors.find(d => d.room === 'protoC' && d.door === 'doorE')!.link).toBe('room');
    expect(m.headers.find(h => h.selected)).toMatchObject({ group: 'row0', dir: 1 });
  });

  it('鎖住 / 卡住 / 沒墨：選到時預覽就帶原因 (不必按確認才知道)', () => {
    const locked = deriveTurnMode(open(), TEXT, { group: 'row1', dir: 1 });
    expect([locked.blocked, locked.blockedText, locked.preview, locked.caption]).toEqual(['locked', '這一排鎖著。', null, '第 2 列往右：這一排鎖著。']);
    const jam: Mechanic = { id: 'jam', blocksTrack: () => true };
    const j = deriveTurnMode(open({ ...OPTS, mechanics: [...DEFAULT_MECHANICS, jam] }), TEXT, { group: 'row0', dir: -1 });
    expect([j.blocked, j.headers[0].state, j.blockedText]).toEqual(['jammed', 'jammed', '軌道卡住了。']);
    let cs = open();
    for (let i = 0; i < 6; i++) cs = ok(dialTurn(cs, { group: 'row0', dir: 1 }));
    const dry = deriveTurnMode(cs, TEXT, { group: 'row0', dir: 1 });
    expect([dry.blocked, dry.blockedText, dry.ink, dry.canUndo, dry.text.ink]).toEqual(['noInk', '墨乾了。', { left: 0, max: 6 }, true, '墨 0 / 6']);
  });

  it('「轉」頁籤：控制盤章節才有；未啟動 / 實景 / 疊層時反灰並說明原因', () => {
    expect(turnTab(open(), TEXT, false)).toEqual({ label: '轉', enabled: true, reason: null, active: false });
    expect(turnTab(open(), TEXT, false, true)!.enabled).toBe(false);
    const off = openChapter(SPEC, newChapterState(SPEC, 'protoA', null), OPTS);
    expect(turnTab(off, TEXT, false)).toEqual({ label: '轉', enabled: false, reason: '控制盤還沒啟動。', active: false });
    const cs = open();
    place(cs.world, -2, 0, 1.5, '3d');
    expect(turnTab(cs, TEXT, false)!.reason).toBe('控制盤畫在藏寶圖上。');
  });
});

describe('reduceTurnMode：選取與指令', () => {
  const m0 = deriveTurnMode(open(), TEXT, null);
  const step = (sel: TurnModeModel['selected'], i: TurnModeInput, m: TurnModeModel = m0) => reduceTurnMode(sel, i, m);

  it('pick 選取 / 再點同一顆取消 / 點別顆換選；不存在的標頭不理會', () => {
    let r = step(null, { t: 'pick', group: 'row0', dir: 1 });
    expect(r).toEqual({ sel: { group: 'row0', dir: 1 }, command: null, exit: false });
    r = step(r.sel, { t: 'pick', group: 'row0', dir: 1 });
    expect(r.sel).toBeNull();
    expect(step({ group: 'row0', dir: 1 }, { t: 'pick', group: 'col1', dir: 1 }).sel).toEqual({ group: 'col1', dir: 1 });
    expect(step(null, { t: 'pick', group: 'col9', dir: 1 }).sel).toBeNull();
  });

  it('方向鍵：↑↓ 換一組 (循環)；←→ 列 = 選方向、行 = 換到左右相鄰的行 (循環)', () => {
    let sel = step(null, { t: 'step', axis: 'v', d: 1 }).sel;
    expect(sel).toEqual({ group: 'row0', dir: 1 });
    sel = step(sel, { t: 'step', axis: 'h', d: -1 }).sel;
    expect(sel).toEqual({ group: 'row0', dir: -1 });
    sel = step(sel, { t: 'step', axis: 'v', d: 1 }).sel;
    expect(sel).toEqual({ group: 'row1', dir: -1 });
    sel = step(sel, { t: 'step', axis: 'v', d: 1 }).sel;
    expect(sel).toEqual({ group: 'col0', dir: 1 });
    sel = step(sel, { t: 'step', axis: 'h', d: -1 }).sel;
    expect(sel).toEqual({ group: 'col2', dir: 1 });
    sel = step(sel, { t: 'step', axis: 'v', d: 1 }).sel;
    expect(sel).toEqual({ group: 'row0', dir: 1 });
    expect(step(null, { t: 'step', axis: 'h', d: -1 }).sel).toEqual({ group: 'row0', dir: -1 });
  });

  it('確認：選了可轉的組 → 恰好一個 turn 指令 (取消選取，圖回到現況)；被擋 / 沒選 → 沒有指令 (選取保留)；回退：有可退的才有指令；離開', () => {
    const cs = open();
    const sel = { group: 'row0', dir: 1 as const };
    const m = deriveTurnMode(cs, TEXT, sel);
    expect(reduceTurnMode(sel, { t: 'confirm' }, m)).toEqual({ sel: null, command: { t: 'turn', turn: { group: 'row0', dir: 1 } }, exit: false });
    const lsel = { group: 'row1', dir: 1 as const };
    expect(reduceTurnMode(lsel, { t: 'confirm' }, deriveTurnMode(cs, TEXT, lsel))).toEqual({ sel: lsel, command: null, exit: false });
    expect(reduceTurnMode(null, { t: 'confirm' }, deriveTurnMode(cs, TEXT, null)).command).toBeNull();
    expect(reduceTurnMode(sel, { t: 'undo' }, m).command).toBeNull();
    const turned = ok(dialTurn(cs, sel));
    expect(reduceTurnMode(sel, { t: 'undo' }, deriveTurnMode(turned, TEXT, sel)).command).toEqual({ t: 'undo' });
    expect(reduceTurnMode(sel, { t: 'exit' }, m)).toEqual({ sel: null, command: null, exit: true });
  });
});

describe('轉動模式的輸入與世界', () => {
  it('turnModeFrame：移動軸 / 跳 / 世界動作不送進世界；剛按下的方向 = 一步 (按住不重複)；Enter / Z / Esc / Tab', () => {
    let r = turnModeFrame(frame({ moveX: 1, jump: true, pressed: ['interact', 'flip'] }), { x: 0, z: 0 });
    expect(r.loop).toEqual({ moveX: 0, moveZ: 0, jump: false, pressed: [] });
    expect(r.inputs).toEqual([{ t: 'step', axis: 'h', d: 1 }]);
    r = turnModeFrame(frame({ moveX: 1 }), r.axes);
    expect(r.inputs).toEqual([]);
    r = turnModeFrame(frame({ moveZ: -1, pressed: ['confirm', 'undo'] }), { x: 0, z: 0 });
    expect(r.inputs).toEqual([{ t: 'step', axis: 'v', d: -1 }, { t: 'confirm' }, { t: 'undo' }]);
    expect(turnModeFrame(frame({ pressed: ['cancel'] }), { x: 0, z: 0 }).inputs).toEqual([{ t: 'exit' }]);
    expect(turnModeFrame(frame({ pressed: ['turnMode'] }), { x: 0, z: 0 }).inputs).toEqual([{ t: 'exit' }]);
    // 方向鍵快速點按 (按下又放開，取樣時軸已是 0) 也算一步；同幀方向鍵 + 軸不重複
    expect(turnModeFrame(frame({ pressed: ['navRight'] }), { x: 0, z: 0 }).inputs).toEqual([{ t: 'step', axis: 'h', d: 1 }]);
    expect(turnModeFrame(frame({ moveZ: 1, pressed: ['navDown'] }), { x: 0, z: 0 }).inputs).toEqual([{ t: 'step', axis: 'v', d: 1 }]);
  });

  it('轉動模式中世界照常推進 (時間、機制逐幀與不開圖時相同)，只是玩家不動 (規格 Q-AF)', () => {
    const a = newWorld(); const b = newWorld();
    place(a, -2, 0, 0, '2d'); place(b, -2, 0, 0, '2d');
    const la = new LevelLoop(a, null); const lb = new LevelLoop(b, null);
    let axes = { x: 0, z: 0 };
    for (let i = 0; i < 60; i++) {
      const f = turnModeFrame(frame({ moveX: 1, jump: i % 7 === 0 }), axes);
      axes = f.axes;
      la.frame(FIXED_DT, f.loop);
      lb.frame(FIXED_DT, { moveX: 0, moveZ: 0, jump: false, pressed: [] });
    }
    expect(a.time).toBeGreaterThan(0.99);
    expect(JSON.stringify([a.player, a.time, a.objs.map(o => [o.x, o.y, o.z, o.used])])).toBe(JSON.stringify([b.player, b.time, b.objs.map(o => [o.x, o.y, o.z, o.used])]));
  });

  it('LevelLoop 的章節指令：只送進下一個固定步 (沒有步數的幀不遺失、也不提早)，依序交出；halt 則本步不推進世界', () => {
    const w = newWorld();
    const got: ChapterCommand[] = [];
    const loop = new LevelLoop(w, null, { onChapterCommand: c => { got.push(c); if (c.t === 'undo') loop.halt(); } });
    const t: ChapterCommand = { t: 'turn', turn: { group: 'row0', dir: 1 } };
    expect(loop.frame(0.001, { moveX: 0, moveZ: 0, jump: false, pressed: [], chapter: [t] })).toBe(0);
    expect(got).toEqual([]);
    loop.frame(1 / 30, { moveX: 0, moveZ: 0, jump: false, pressed: [] });
    expect(got).toEqual([t]);
    const time = w.time;
    loop.frame(1 / 20, { moveX: 0, moveZ: 0, jump: false, pressed: [], chapter: [{ t: 'undo' }, t] });
    expect(got).toEqual([t, { t: 'undo' }]);
    expect(w.time).toBe(time);
  });
});

describe('HUD 墨量與按鍵', () => {
  it('inkHud：控制盤章節、已啟動、藏寶圖才顯示 (●○ 形狀區分)；轉一次少一滴；第一章 / 實景 / 未啟動 = null', () => {
    const cs = open();
    expect(inkHud(cs, TEXT, '2d')).toBe('墨 ●●●●●●');
    expect(inkHud(cs, TEXT, '3d')).toBeNull();
    expect(inkHud(ok(dialTurn(cs, { group: 'row0', dir: 1 })), TEXT, '2d')).toBe('墨 ●●●●●○');
    expect(inkHud(openChapter(SPEC, newChapterState(SPEC, 'protoA', null), OPTS), TEXT, '2d')).toBeNull();
    expect(inkDots(1, 3)).toBe('●○○');
  });

  it('deriveHud：給了 ink 才多 ink 欄位 (第一章的 HUD 形狀不變)', () => {
    const w = newWorld();
    const view = { renderMode: '2d' as const, locked: false, bindings: DEFAULT_BINDINGS };
    expect('ink' in deriveHud(w, TEXT, view)).toBe(false);
    expect('ink' in deriveHud(w, TEXT, { ...view, ink: null })).toBe(false);
    expect(deriveHud(w, TEXT, { ...view, ink: '墨 ●○' }).ink).toBe('墨 ●○');
  });

  it('按鍵：Tab = 轉動模式、Z = 回退、方向鍵 = 選標頭 (外殼動作，不進世界)', () => {
    expect([DEFAULT_BINDINGS.turnMode, DEFAULT_BINDINGS.undo, DEFAULT_BINDINGS.navLeft, DEFAULT_BINDINGS.navDown]).toEqual([['Tab'], ['KeyZ'], ['ArrowLeft'], ['ArrowDown']]);
    expect(INPUT_ACTIONS.slice(-6)).toEqual(['turnMode', 'undo', 'navLeft', 'navRight', 'navUp', 'navDown']);
  });
});
