// D2：core/chapter.ts 控制盤 (墨量預算、回退堆疊、魔方儀啟動、鎖扣；architecture 4.16.1、規格 5.4.1 / 5.4.8)
import { describe, it, expect } from 'vitest';
import {
  activateDial, applyChapterCommand, captureState, clearUndo, dialTurn, enterRoom, isLocked, newChapterState, openChapter, refreshUnlocks,
  restartRoom, transferObject, turnBudgetFor, undoTurn, type ChapterCommand, type ChapterSession, type ChapterSpec, type ChapterState
} from '../../../src/puzzle/core/chapter';
import type { CubeDef, Side } from '../../../src/puzzle/core/cube';
import type { GameEvent, LevelDef, ObjDef } from '../../../src/puzzle/core/types';
import type { Mechanic } from '../../../src/puzzle/core/registry';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { CH1_CUBE } from '../../../src/puzzle/content/cubes/ch1';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { stair } from '../../../src/puzzle/content/levels/ch1/stair';
import { closet } from '../../../src/puzzle/content/levels/ch1/closet';
import { TEXT } from '../msgs';

const OPTS = { mechanics: DEFAULT_MECHANICS, text: TEXT };
const floor: ObjDef = { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 12, h: 1, d: 8, visible: 'both', solid: true };
const door = (id: string, side: Side, kind: 'door' | 'arch' = 'door'): ObjDef => {
  const ns = side === 'N' || side === 'S';
  const x = side === 'E' ? 5.8 : side === 'W' ? -5.8 : 0;
  const z = side === 'N' ? -3.8 : side === 'S' ? 3.8 : 0;
  return { id, type: 'cubeDoor', side, kind, x, y: 0, z, w: ns ? 1.6 : 0.4, h: 2.4, d: ns ? 0.4 : 1.6, visible: 'both', solid: false, interactable: true, interactIn: '3d' };
};
const crate = (id: string, x: number, z = 0): ObjDef => ({ id, type: 'crate', x, y: 0, z, w: 1.2, h: 1.1, d: 1.2, visible: 'both', solid: true, pushable: true });
const room = (id: string, extra: ObjDef[], turnBudget: LevelDef['turnBudget'] = { base: 6 }, puzzles?: LevelDef['puzzles']): LevelDef => ({
  id, titleKey: 'lvl.1-2.title', narrationKey: 'lvl.1-2.narration', nextKey: 'lvl.1-2.next',
  bounds: { minX: -6, maxX: 6, minZ: -4, maxZ: 4 }, voidY: -5, start: { x: -3, y: 0, z: 0 }, objects: [floor, ...extra], turnBudget, ...(puzzles ? { puzzles } : {})
});
// 開關 (謎題旗標)：used 時 doneFlag 成立 (D3 的 latch 類型；這裡用無行為的 wall 只驗章節層)
const flagObj = (id: string, flag: string): ObjDef => ({ id, type: 'wall', x: 0, y: 0, z: -3, w: 1, h: 1, d: 0.4, visible: 'both', solid: false, doneFlag: flag });

// 2×3：a b c / d e f；a 東拱門 ↔ b 西拱門 (跨房)、b 東門、d 東門、e 西門；d 房有木箱 (門口測試時以快照把它放到東門上)
const ROOMS = {
  a: room('a', [door('aE', 'E', 'arch'), crate('aCrate', 1.5), flagObj('aFlag', 'pa')]),
  b: room('b', [door('bW', 'W', 'arch'), door('bE', 'E')], { base: 5, puzzles: { p4: 2 } }, [{ id: 'p4', titleKey: 'lvl.1-2.title' }]),
  c: room('c', [door('cW', 'W')]),
  d: room('d', [door('dE', 'E'), crate('dCrate', 0)]),
  e: room('e', [door('eW', 'W'), flagObj('p4done', 'p4')]),
  f: room('f', [])
};
const CUBE: CubeDef = {
  id: 'td', dims: [3, 2, 1], ops: 'rowcol', control: 'dial', frame: [],
  cells: [
    { at: [0, 0, 0], room: 'a' }, { at: [1, 0, 0], room: 'b' }, { at: [2, 0, 0], room: 'c' },
    { at: [0, 1, 0], room: 'd' }, { at: [1, 1, 0], room: 'e' }, { at: [2, 1, 0], room: 'f' }
  ],
  dial: {
    entry: { room: 'a', obj: 'dial' },
    groups: [
      { id: 'row0', kind: 'row', index: 0 }, { id: 'row1', kind: 'row', index: 1 },
      { id: 'col0', kind: 'col', index: 0 }, { id: 'col1', kind: 'col', index: 1 }, { id: 'col2', kind: 'col', index: 2 }
    ],
    locks: [{ group: 'col0', until: 'pa' }, { group: 'col1', until: 'pa' }, { group: 'col2', until: 'item:key.t' }]
  }
};
const SPEC: ChapterSpec = { chapter: 90, cube: CUBE, rooms: ROOMS, doors: chapterDoors(ROOMS) };
const open = (state: ChapterState = newChapterState(SPEC, 'a', null), opts = OPTS): ChapterSession => openChapter(SPEC, state, opts);
const ok = (r: ChapterSession | { blocked: string }): ChapterSession => { if ('blocked' in r) throw new Error(r.blocked); return r; };
const pos = (cs: ChapterSession, r: string) => [...cs.state.cube!.pos[r]];
/** 回退堆疊以外的章節狀態 (JSON) */
const noUndo = (s: ChapterState) => JSON.stringify({ ...s, turns: s.turns && { left: s.turns.left } });

describe('控制盤：開章與魔方儀', () => {
  it('開章：墨 = 這間房的預算、堆疊空、魔方儀未啟動 (ext.dial.active = false)；沒啟動轉不動 (noDial)', () => {
    const cs = open();
    expect(cs.state.turns).toEqual({ left: 6, undo: [] });
    expect(cs.state.dial).toBeUndefined();
    expect(cs.world.ext.dial).toEqual({ active: false });
    expect(dialTurn(cs, { group: 'row0', dir: 1 })).toEqual({ blocked: 'noDial' });
  });

  it('activateDial：state 與 entry 都記 dial = true (R 不還原)、ext 更新、墨滿額', () => {
    const cs = activateDial(open());
    expect([cs.state.dial, cs.entry.dial, cs.world.ext.dial]).toEqual([true, true, { active: true }]);
    const r = restartRoom(cs, OPTS);
    expect([r.state.dial, r.world.ext.dial]).toEqual([true, { active: true }]);
  });

  it('第一章 (拉桿章，control 未給)：章節狀態不出現 dial / unlocked / turns 欄位，ext 沒有 dial', () => {
    const rooms = { foyer, stair, closet };
    const spec: ChapterSpec = { chapter: 1, cube: CH1_CUBE, rooms, doors: chapterDoors(rooms) };
    let cs = openChapter(spec, newChapterState(spec, 'foyer', 'archS'), OPTS);
    cs = enterRoom(cs, 'foyer', 'archS', OPTS);
    const keys = Object.keys(captureState(cs));
    expect(keys.filter(k => ['dial', 'unlocked', 'turns'].includes(k))).toEqual([]);
    expect('dial' in cs.world.ext).toBe(false);
    expect(dialTurn(cs, { group: 'row0', dir: 1 })).toEqual({ blocked: 'noCube' });
  });
});

describe('控制盤：轉動與阻擋順序', () => {
  it('列轉成功：墨 −1、推進堆疊；玩家所在房在組內就跟著移動 (本地座標不變)，門接法重算', () => {
    const cs0 = activateDial(open());
    const px = cs0.world.player.x;
    expect(cs0.world.ext.cube!.links.aE).toEqual({ to: 'room', room: 'b', door: 'bW', kind: 'arch' });
    const cs = ok(dialTurn(cs0, { group: 'row0', dir: 1 }));
    expect([pos(cs, 'a'), pos(cs, 'b'), pos(cs, 'c')]).toEqual([[1, 0, 0], [2, 0, 0], [0, 0, 0]]);
    expect(cs.state.turns).toEqual({ left: 5, undo: [{ group: 'row0', dir: 1 }] });
    expect(cs.world.player.x).toBe(px);
    expect(cs.world.ext.cube!.links.aE).toEqual({ to: 'room', room: 'b', door: 'bW', kind: 'arch' });
    // 下列轉：玩家所在的上列不動
    const cs2 = ok(dialTurn(cs, { group: 'row1', dir: -1 }));
    expect([pos(cs2, 'a'), pos(cs2, 'd')]).toEqual([[1, 0, 0], [2, 1, 0]]);
  });

  it('阻擋順序：noDial → noGroup → locked → jammed → doorway → noInk', () => {
    const base = open();
    expect(dialTurn(base, { group: 'nope', dir: 1 })).toEqual({ blocked: 'noDial' });
    const cs = activateDial(base);
    expect(dialTurn(cs, { group: 'nope', dir: 1 })).toEqual({ blocked: 'noGroup' });
    expect(dialTurn(cs, { group: 'col0', dir: 1 })).toEqual({ blocked: 'locked' });
    // 卡榫：當前房在組內、機制回報伸進軌道 → jammed (優先於門口)；當前房不在組內 → 不受影響
    const jam: Mechanic = { id: 'jam', blocksTrack: () => true };
    const jcs = activateDial(open(undefined, { ...OPTS, mechanics: [...DEFAULT_MECHANICS, jam] }));
    jcs.world.byId.get('aCrate')!.x = 5.4; // 同時壓在門口
    expect(dialTurn(jcs, { group: 'row0', dir: 1 })).toEqual({ blocked: 'jammed' });
    // 門口卡著：下列的 d 房 (不是當前房；快照裡) 木箱壓在東門上 → 下列轉不動；當前房木箱推上門口 → 上列轉不動
    const st = newChapterState(SPEC, 'a', null);
    st.rooms.d = { objs: [{ id: 'dCrate', x: 5.4, y: 0, z: 0, gone: false, used: false, touched: false }], flags: [] };
    const dcs = activateDial(open(st));
    expect(dialTurn(dcs, { group: 'row1', dir: 1 })).toEqual({ blocked: 'doorway' });
    expect(isLocked(SPEC, dcs.state, 'row1', dcs.world)).toBe(false);
    expect('blocked' in dialTurn(cs, { group: 'row1', dir: 1 })).toBe(false);
    cs.world.byId.get('aCrate')!.x = 5.4;
    expect(dialTurn(cs, { group: 'row0', dir: 1 })).toEqual({ blocked: 'doorway' });
    cs.world.byId.get('aCrate')!.x = 1.5;
    // 玩家自己站在門位上 (2D：以進入 2D 前的 z 判定)
    const p = cs.world.player;
    p.x = 5.7; p.mode = '2d'; p.z3d = 0; p.z = 0;
    expect(dialTurn(cs, { group: 'row0', dir: 1 })).toEqual({ blocked: 'doorway' });
    p.x = -3; p.mode = '3d';
    // 墨乾了：轉六次後第七次 noInk (回退仍可用)
    let s = cs;
    for (let i = 0; i < 6; i++) s = ok(dialTurn(s, { group: 'row0', dir: i % 2 ? -1 : 1 }));
    expect(s.state.turns!.left).toBe(0);
    expect(dialTurn(s, { group: 'row0', dir: 1 })).toEqual({ blocked: 'noInk' });
    expect(ok(undoTurn(s)).state.turns!.left).toBe(1);
  });

  it('鎖扣：謎題旗標成立 (doneFlag 物件 used) → 解開；道具條件 item:<id>；refreshUnlocks 寫回 unlocked 並清空堆疊；R 還原 unlocked', () => {
    let cs = ok(dialTurn(activateDial(open()), { group: 'row0', dir: 1 }));
    expect(refreshUnlocks(cs).added).toEqual([]);
    cs.world.byId.get('aFlag')!.used = true;
    expect(isLocked(SPEC, cs.state, 'col0', cs.world)).toBe(false); // 條件成立即可轉 (不必等寫回)
    const r = refreshUnlocks(cs);
    expect(r.added).toEqual(['col0', 'col1']);
    expect(r.cs.state.unlocked).toEqual(['col0', 'col1']);
    expect(r.cs.state.turns!.undo).toEqual([]);
    cs = ok(dialTurn(r.cs, { group: 'col1', dir: 1 }));
    expect(dialTurn(cs, { group: 'col2', dir: 1 })).toEqual({ blocked: 'locked' });
    cs.world.inv['key.t'] = 1;
    expect(refreshUnlocks(cs).added).toEqual(['col2']);
    const back = restartRoom(refreshUnlocks(cs).cs, OPTS);
    expect([back.state.unlocked, back.world.byId.get('aFlag')!.used, isLocked(SPEC, back.state, 'col0', back.world)]).toEqual([undefined, false, true]);
  });
});

describe('控制盤：回退、預算、穿門、R', () => {
  it('「轉 t 再回退」與「沒轉 t」的章節狀態逐欄相同 (JSON；墨退回、堆疊彈出)', () => {
    const cs1 = ok(dialTurn(activateDial(open()), { group: 'row1', dir: -1 }));
    const before = captureState(cs1);
    const after = captureState(ok(undoTurn(ok(dialTurn(cs1, { group: 'row0', dir: 1 })))));
    expect(noUndo(after)).toBe(noUndo(before));
    expect(JSON.stringify(after)).toBe(JSON.stringify(before));
    expect(undoTurn(activateDial(open()))).toEqual({ blocked: 'nothingToUndo' });
  });

  it('回退的反向轉動照樣檢查門口：門口有東西 → 退不回去 (doorway)', () => {
    const cs = ok(dialTurn(activateDial(open()), { group: 'row0', dir: 1 }));
    cs.world.byId.get('aCrate')!.x = 5.4;
    expect(undoTurn(cs)).toEqual({ blocked: 'doorway' });
  });

  it('穿門補滿到新房的預算、堆疊清空；R 回到本次進房時 (墨滿額、魔方排列還原、dial 保留)', () => {
    let cs = ok(dialTurn(ok(dialTurn(activateDial(open()), { group: 'row1', dir: 1 })), { group: 'row1', dir: 1 }));
    expect(cs.state.turns).toEqual({ left: 4, undo: [{ group: 'row1', dir: 1 }, { group: 'row1', dir: 1 }] });
    cs = enterRoom(cs, 'c', 'cW', OPTS);
    expect(cs.state.turns).toEqual({ left: 6, undo: [] });
    const entryCube = JSON.stringify(cs.state.cube);
    cs = ok(dialTurn(ok(dialTurn(cs, { group: 'row0', dir: -1 })), { group: 'row1', dir: 1 }));
    const r = restartRoom(cs, OPTS);
    expect([r.state.turns, JSON.stringify(r.state.cube), r.state.dial]).toEqual([{ left: 6, undo: [] }, entryCube, true]);
  });

  it('turnBudgetFor：P4 題 (本房 puzzles 有 P4 預算、doneFlag 未成立) 用 P4 預算；完成後用房間基礎預算；沒設定 = 0', () => {
    const cs = activateDial(open());
    const inB = enterRoom(cs, 'b', 'bW', OPTS);
    expect(inB.state.turns!.left).toBe(2);
    // p4 的 doneFlag 物件在 e 房的快照裡 used → 回到 b 房用基礎預算 5
    const st = captureState(inB);
    st.rooms.e = { objs: [{ id: 'p4done', x: 0, y: 0, z: -3, gone: false, used: true, touched: false }], flags: [] };
    expect(turnBudgetFor(SPEC, st)).toBe(5);
    expect(turnBudgetFor(SPEC, { ...st, room: 'f' })).toBe(6);
    const none: ChapterSpec = { ...SPEC, rooms: { ...ROOMS, f: { ...ROOMS.f, turnBudget: undefined } } };
    expect(turnBudgetFor(none, { ...st, room: 'f' })).toBe(0);
  });

  it('房內讀檔不補墨：openChapter 遇到已有 turns 的狀態照原樣', () => {
    const cs = ok(dialTurn(activateDial(open()), { group: 'row0', dir: 1 }));
    const re = openChapter(SPEC, captureState(cs), OPTS);
    expect(re.state.turns).toEqual({ left: 5, undo: [{ group: 'row0', dir: 1 }] });
    expect(restartRoom(re, OPTS).state.turns).toEqual({ left: 5, undo: [{ group: 'row0', dir: 1 }] });
  });
});

describe('控制盤：回退堆疊清空 (規格 5.4.1「本段」)', () => {
  const turned = () => ok(dialTurn(activateDial(open()), { group: 'row1', dir: 1 }));

  it('旗標 / 謎題完成 / 寫上字卡 / 拱門跨房事件、取得道具 → 清空；無效字 (card ok=false) 與一般事件 → 不清空', () => {
    const clears: GameEvent[] = [{ t: 'flag', flag: 'scare:x' }, { t: 'done', flag: 'pa' }, { t: 'card', label: 'l', ok: true }, { t: 'objCross', obj: 'o', door: 'd' }];
    for (const e of clears) expect([e.t, clearUndo(turned(), [e]).state.turns!.undo]).toEqual([e.t, []]);
    const keeps: GameEvent[] = [{ t: 'card', label: 'l', ok: false }, { t: 'switch', to: '2d' }, { t: 'door', door: 'aE' }];
    for (const e of keeps) expect(clearUndo(turned(), [e]).state.turns!.undo.length).toBe(1);
    expect(clearUndo(turned(), [], true).state.turns!.undo).toEqual([]);
    const cs = turned();
    expect(clearUndo(cs, [])).toBe(cs);
  });

  it('transferObject (拱門跨房) 清空堆疊', () => {
    const cs = turned();
    cs.world.byId.get('aCrate')!.x = 5.4;
    const r = ok(transferObject(cs, 'aCrate', 'aE', OPTS));
    expect(r.state.turns).toEqual({ left: 5, undo: [] });
    expect(r.state.moved.aCrate.room).toBe('b');
  });
});

describe('確定性', () => {
  it('同一串 ChapterCommand 永遠得到同一個章節狀態 (含被擋的指令)', () => {
    const cmds: ChapterCommand[] = [
      { t: 'turn', turn: { group: 'row0', dir: 1 } }, { t: 'turn', turn: { group: 'col0', dir: 1 } }, { t: 'undo' },
      { t: 'turn', turn: { group: 'row0', dir: -1 } }, { t: 'turn', turn: { group: 'row0', dir: -1 } }, { t: 'undo' }, { t: 'undo' }, { t: 'undo' }
    ];
    const run = () => {
      let cs = activateDial(open());
      for (const c of cmds) { const r = applyChapterCommand(cs, c); if (!('blocked' in r)) cs = r; }
      return JSON.stringify(captureState(cs));
    };
    expect(run()).toBe(run());
    expect(JSON.parse(run()).turns).toEqual({ left: 6, undo: [] });
  });
});
