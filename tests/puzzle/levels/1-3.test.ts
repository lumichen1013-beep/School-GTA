// 1-3 衣帽間 (規格 v0.3 第一章；M1b / C8)：1-3a 連箱帶人 (P2 首次)、1-3b 回來的路 (P7 首次)
// 通關腳本 (跨三間房，從 1-2 開頭打到章末)、每題反例 (規格列的錯誤嘗試)、捷徑取樣、跨房快照往返、R、驚嚇、字卡匣、存檔、字條量表與預算
// (規格 6「1-3 衣帽間」、5.4.5 / 5.4.6 / 5.4.8、7.1、9.1；architecture 4.16 / 4.17、6.6；story-bible 7.3)
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { closet } from '../../../src/puzzle/content/levels/ch1/closet';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { LEVELS } from '../../../src/puzzle/content/levels';
import { CHAPTERS } from '../../../src/puzzle/content/chapters';
import { CH1_MODEL } from '../../../src/puzzle/content/cubes/ch1';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { hasItem } from '../../../src/puzzle/mechanics/items';
import { cardsOn, leverWord } from '../../../src/puzzle/mechanics/labels';
import { SCARE_DELAY } from '../../../src/puzzle/mechanics/coats';
import { findTarget, interact } from '../../../src/puzzle/core/interact';
import { resetCrates } from '../../../src/puzzle/core/push';
import { captureState, newChapterState, restartRoom, snapshotRoom, transferObject, type ChapterSession, type ChapterState } from '../../../src/puzzle/core/chapter';
import type { WorldCommand } from '../../../src/puzzle/core/actions';
import type { ObjDef, World } from '../../../src/puzzle/core/types';
import { deriveHud } from '../../../src/puzzle/app/hudModel';
import { closedTrayKey, deriveCardTray, slotCommand, uncardCommand } from '../../../src/puzzle/app/cardTrayModel';
import { deriveCubeMap, previewFor } from '../../../src/puzzle/app/cubeMapModel';
import { chapterSave, chapterStart, withChapter } from '../../../src/puzzle/meta/chapters';
import { defaultSave, loadSave, writeSave } from '../../../src/puzzle/meta/save';
import { memoryStorage } from '../../../src/puzzle/meta/storage';
import { isUnlocked, levelState, recordClear } from '../../../src/puzzle/meta/progress';
import { DEFAULT_BINDINGS } from '../../../src/puzzle/input/bindings';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { scanShortcuts, type ScanSpec } from '../../../src/puzzle/devtools/shortcutScan';
import { validateEntry, validateLevel } from '../../../src/puzzle/devtools/validateLevel';
import { chapterOneModel, validateCube } from '../../../src/puzzle/devtools/validateCube';
import { CH1_CUBE } from '../../../src/puzzle/content/cubes/ch1';
import { modelFor } from '../../../src/puzzle/render/models';
import { Painter } from '../../../src/puzzle/render/materials';
import { DEFAULT_THEME } from '../../../src/puzzle/render/themes';
import { TEXT } from '../msgs';
import { stubCanvas } from '../render/stubCanvas';
import {
  AT_CLOSET_LEVER, CH1, CHAPTER_DOOR, CLOSET_ARCH, FOYER_ARCH, FOYER_DOOR_E, FOYER_LEVER, OPTS, PUSH_CRATE_NORTH, PUSH_CRATE_TO_HOOK,
  R12_ABC, R12_D, S1, S2, SPEC, STAIR_DOOR_S, TAKE_KEY, open, pump, start
} from './ch1Routes';

const CARD = `card.${CH1_MODEL.card.word}`;
const KEY = 'key.brass';
const CRATE = CH1_MODEL.crate.id;
const def = (id: string): ObjDef => closet.objects.find(o => o.id === id)!;
const fdef = (id: string): ObjDef => foyer.objects.find(o => o.id === id)!;
const get = (cs: ChapterSession, id: string) => cs.world.byId.get(id)!;
const write = (label: string, card = CARD): Cmd => ({ hold: { commands: [{ t: 'card', label, card }] }, seconds: 1 / 60 });
const unwrite = (label: string, card = CARD): Cmd => ({ hold: { commands: [{ t: 'uncard', label, card }] }, seconds: 1 / 60 });

/** 章節狀態：在 room (從 door 進來)、魔方 cube、持有 items (其餘為開章初值) */
function at(room: string, door: string | null, cube: ChapterState['cube'], items: Record<string, number> = { nib: 1, [CARD]: 1 }): ChapterSession {
  const st = newChapterState(SPEC, room, door);
  st.cube = JSON.parse(JSON.stringify(cube));
  st.items = { ...items };
  return open(st);
}
/** S1、剛從樓梯間進衣帽間 (1-2 都做完：筆尖、詞卡) */
const closetS1 = (items?: Record<string, number>) => at('closet', 'archN', S1, items);
/** S2 (拉過「左」)、在衣帽間 */
const closetS2 = (items?: Record<string, number>) => at('closet', 'archN', S2, items);
/** 跑腳本後把事件交給章節層 */
function play(cs: ChapterSession, cmds: Cmd[]): { cs: ChapterSession; kinds: string[] } {
  runScript(cs.world, cmds);
  const r = pump(cs);
  return { cs: r.cs, kinds: r.kinds };
}

/** 1-3a：S1 衣帽間 → 拉「左」→ 推箱過拱門 → 跟過去 → 推到掛鉤下 → 2D 取鑰匙 (回傳在玄關、有鑰匙的 session) */
function solveA(cs: ChapterSession): ChapterSession {
  let r = play(cs, [...AT_CLOSET_LEVER, { act: 'interact' }]);
  expect(r.kinds).toEqual(['turn']);
  r = play(r.cs, PUSH_CRATE_NORTH);
  expect(r.kinds).toEqual(['state']);
  r = play(r.cs, CLOSET_ARCH);
  expect(r.kinds).toEqual(['enter']);
  runScript(r.cs.world, [...PUSH_CRATE_TO_HOOK, ...TAKE_KEY]);
  expect(hasItem(r.cs.world, KEY)).toBe(true);
  return r.cs;
}
/** 1-3b：玄關 → 南拱門回衣帽間 → 2D 在拉桿標籤貼「右」→ 3D 拉 → 章門 */
function solveB(cs: ChapterSession): ChapterSession {
  let r = play(cs, FOYER_ARCH);
  expect(r.kinds).toEqual(['enter']);
  r = play(r.cs, [...AT_CLOSET_LEVER, { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }, write('lever:closet'), { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }]);
  expect(r.kinds).toEqual(['labelOpen', 'card', 'turn']);
  runScript(r.cs.world, CHAPTER_DOOR);
  return r.cs;
}

describe('1-3 衣帽間：資料與驗證器', () => {
  it('validateLevel / validateEntry 0 issue；謎題 1-3a / 1-3b；登錄表 1-3 前置 1-2、屬於第一章魔方的衣帽間', () => {
    expect(validateLevel(closet, { mechanics: DEFAULT_MECHANICS, bundle: zhHant })).toEqual([]);
    expect(validateEntry(LEVELS.find(e => e.id === '1-3')!, { mechanics: DEFAULT_MECHANICS, bundle: zhHant, levels: LEVELS, chapters: CHAPTERS })).toEqual([]);
    expect(closet.puzzles!.map(q => TEXT(q.titleKey))).toEqual(['1-3a 連箱帶人', '1-3b 回來的路']);
    expect(LEVELS.find(e => e.id === '1-3')!.unlock.after).toEqual(['1-2']);
    expect(CH1.levels).toEqual({ '1-2': 'foyer', '1-3': 'closet' });
  });

  it('與抽象模型一致：拉桿原字「左」、木箱 id、章門要的鑰匙 = 掛鉤給的鑰匙；兩支拉桿都有可寫的方向字標籤', () => {
    const L = def('lever');
    expect([L.type === 'lever' && L.word, L.label]).toEqual([CH1_MODEL.levers.closet, { id: 'lever:closet', kind: 'dir', noCardText: 'lvl.1-3.lever.noCard' }]);
    expect(fdef('lever').label).toEqual({ id: 'lever:foyer', kind: 'dir' });
    expect([...CH1_MODEL.card.levers].sort()).toEqual(['closet', 'foyer']);
    expect(def(CRATE).pushable).toBe(true);
    const E = def('chapterE');
    expect(E.type === 'cubeDoor' && E.key).toBe(fdef('hook').grants);
  });

  it('掛鉤 (規格 1-3a)：玄關西區高處 y=2.3、只在藏寶圖拿得到；在 1-2d 畫像 (x ≤ -15.5) 以東；一併給手記第一頁', () => {
    const h = fdef('hook');
    expect([h.y, h.interactIn, h.x >= -15, h.x < -10]).toEqual([2.3, '2d', true, true]);
    expect(Math.max(...foyer.objects.filter(o => o.type === 'portrait').map(o => o.x + o.w / 2))).toBeLessThan(h.x - h.w / 2);
    expect(h.type === 'hook' && h.also).toEqual(['diary.1']);
  });

  it('開場旁白 / 通關文字 (story-bible 7.3)；章門打開的訊息', () => {
    expect([TEXT(closet.narrationKey), TEXT(closet.nextKey)]).toEqual(['掛著三件大衣，只有一件是爸爸的。', '一本舊手記：「此宅會轉五次。」']);
    expect(TEXT('lvl.1-3.chapterE.open')).toBe('銅鑰匙轉了半圈。門外是一條走廊，通往書房。');
  });
});

describe('1-3 通關路徑 (跨三間房)', () => {
  it('第一章一氣呵成：從 1-2 開頭 (南拱門) → 1-2d → 1-2a / 1-2b → 1-2c → 樓梯間 → 衣帽間 → 1-3a → 1-3b → 章門打開 (通關)', () => {
    let cs = start();
    expect([cs.state.room, cs.state.door]).toEqual(['foyer', 'archS']);
    let r = play(cs, [...R12_D, ...R12_ABC, ...FOYER_LEVER]);
    expect(r.kinds).toEqual(['turn']);
    expect([hasItem(r.cs.world, 'nib'), hasItem(r.cs.world, CARD)]).toEqual([true, true]);
    r = play(r.cs, FOYER_DOOR_E);
    expect([r.kinds, r.cs.state.room]).toEqual([['enter'], 'stair']);
    r = play(r.cs, STAIR_DOOR_S);
    expect([r.kinds, r.cs.state.room, r.cs.state.door]).toEqual([['enter'], 'closet', 'archN']);
    cs = solveA(r.cs);
    expect(cs.state.cube).toEqual(S2);
    cs = solveB(cs);
    expect(cs.world.cleared).toBe(true);
    expect(cs.world.msg).toBe(TEXT('lvl.1-3.chapterE.open'));
    expect(cs.state.cube).toEqual(S1);
    expect(cs.world.events.some(e => e.t === 'switchDenied')).toBe(false);
  });

  it('1-3a 每一步：拉「左」→ 衣帽間 (連同玩家與木箱) 滑到 D、北拱門接上玄關南拱門 (拱門對拱門) → 推箱跨房 → 箱子出現在南拱門內側', () => {
    let cs = closetS1();
    expect(cs.world.ext.cube!.links.archN).toEqual({ to: 'room', room: 'stair', door: 'doorS', kind: 'door' });
    let r = play(cs, [...AT_CLOSET_LEVER, { act: 'interact' }]);
    cs = r.cs;
    expect(cs.state.cube).toEqual(S2);
    expect(cs.world.ext.cube!.links).toEqual({ archN: { to: 'room', room: 'foyer', door: 'archS', kind: 'arch' }, chapterE: { to: 'wall' } });
    expect(get(cs, CRATE).x).toBe(def(CRATE).x);
    r = play(cs, PUSH_CRATE_NORTH);
    cs = r.cs;
    expect(cs.world.msg).toBe('木箱滑過拱門，到了另一邊。');
    expect(cs.world.byId.has(CRATE)).toBe(false);
    expect(cs.state.moved[CRATE]).toEqual({ room: 'foyer', x: -17.6, y: 0, z: expect.closeTo(3.7, 6) });
    r = play(cs, CLOSET_ARCH);
    cs = r.cs;
    expect([cs.state.room, cs.state.door]).toEqual(['foyer', 'archS']);
    const c = get(cs, CRATE);
    expect([c.x, c.z]).toEqual([-17.6, expect.closeTo(3.7, 6)]);
    // 玩家站在拱門內側 (0.9)，箱子在更裡面一點 (不重疊)
    expect(cs.world.player.z).toBeCloseTo(4.7, 6);
    runScript(cs.world, PUSH_CRATE_TO_HOOK);
    expect(c.x).toBeCloseTo(-14.8, 1);
    runScript(cs.world, TAKE_KEY);
    expect([hasItem(cs.world, KEY), hasItem(cs.world, 'diary.1'), get(cs, 'hook').gone]).toEqual([true, true, true]);
    expect(cs.world.msg).toBe('取下了一把銅鑰匙。鑰匙下面，夾著一頁舊手記。');
  });

  it('1-3b：S2 時章門門後是牆；2D 寫「右」→ 3D 拉 → 衣帽間滑回 C、章門接上書房走廊；有鑰匙才開', () => {
    let cs = closetS2({ nib: 1, [CARD]: 1, [KEY]: 1 });
    runScript(cs.world, [{ walkTo: [6.3, 0] }, { act: 'interact' }]);
    expect([cs.world.msg, cs.world.cleared]).toEqual(['門後是牆。', false]);
    const r = play(cs, [...AT_CLOSET_LEVER, { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }, write('lever:closet'), { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }]);
    cs = r.cs;
    // 'state' = 有鑰匙進衣帽間 2.5 秒後大衣滑落 (驚嚇旗標)，與本題無關
    expect(r.kinds.filter(k => k !== 'state')).toEqual(['labelOpen', 'card', 'turn']);
    expect(cs.state.cube).toEqual(S1);
    expect(cs.world.ext.cube!.links.chapterE).toEqual({ to: 'frame', frame: 'study' });
    runScript(cs.world, CHAPTER_DOOR);
    expect(cs.world.cleared).toBe(true);
  });

  it('確定性：同一輸入序列 (1-3 全程) 兩次執行，章節狀態逐欄相同', () => {
    const once = () => JSON.stringify(captureState(solveB(solveA(closetS1()))));
    expect(once()).toBe(once());
  });
});

describe('1-3a 連箱帶人：規格列的錯誤嘗試與驗證重點', () => {
  it('S1 時箱子出不了衣帽間：推進北拱門 (對面是樓梯間的門) → 只說明、不跨房；接著拉桿 → 門口有東西卡著；T 物歸原處後才拉得動', () => {
    let cs = closetS1();
    let r = play(cs, PUSH_CRATE_NORTH);
    cs = r.cs;
    expect([r.kinds, cs.world.msg, cs.world.byId.has(CRATE), cs.state.moved]).toEqual([[], '對面是一扇門，只容得下人。箱子過不去。', true, {}]);
    r = play(cs, [{ walkTo: [2.5, null] }, ...AT_CLOSET_LEVER, { act: 'interact' }]);
    expect([r.kinds, r.cs.world.msg, r.cs.state.cube]).toEqual([['blocked'], '門口有東西卡著。', S1]);
    cs = r.cs;
    resetCrates(cs.world);
    expect([get(cs, CRATE).x, get(cs, CRATE).z]).toEqual([def(CRATE).x, def(CRATE).z]);
    r = play(cs, [{ act: 'interact' }]);
    expect([r.kinds, r.cs.state.cube]).toEqual([['turn'], S2]);
  });

  it('從樓梯間的門推箱：S1 衣帽間各處取樣 × 推向北拱門 / 章門，兩模式都不會跨房 (捷徑取樣)', () => {
    const scan: ScanSpec = {
      level: closet, mechanics: DEFAULT_MECHANICS, text: TEXT,
      setup: w => { w.ext = { cube: { links: { archN: { to: 'room', room: 'stair', door: 'doorS', kind: 'door' }, chapterE: { to: 'frame', frame: 'study' } } } }; },
      movable: [{ id: CRATE, xs: [-2.2, -1.6, -1, -0.4, 5.6], zs: [-3, 0, 1.2] }],
      playerAt: [{ on: CRATE, dz: 1.2 }, { x: -1, y: 0, z: 3 }, { x: 4.5, y: 0, z: 0 }],
      probes: [
        [{ hold: { moveZ: -1 }, seconds: 3 }, { hold: { moveZ: -1, moveX: 0.4 }, seconds: 1 }],
        [{ hold: { moveX: 1 }, seconds: 3 }, { act: 'interact' }],
        [{ act: 'flip' }, { hold: { moveZ: -1, moveX: 1, jump: true }, seconds: 2 }]
      ],
      forbidden: [{ id: 'objCross', holds: w => w.events.some(e => e.t === 'objCross') }, 'cleared']
    };
    const r = scanShortcuts(scan);
    expect(r.runs).toBeGreaterThan(40);
    expect(r.hits).toEqual([]);
  });

  it('把玄關的箱子推向西區：缺口邊各處取樣 × 往西推 / 邊推邊跳，箱子都停在缺口東側、拿不到鑰匙 (捷徑取樣：玄關木箱 × 缺口)', () => {
    const scan: ScanSpec = {
      level: foyer, mechanics: DEFAULT_MECHANICS, text: TEXT,
      setup: w => { w.inv = { nib: 1 }; },
      modes: ['3d'],
      movable: [{ id: 'crate', xs: [-5.3, -4.5, -3], zs: [-3.5, -1, 2, 4.5] }],
      playerAt: [{ on: 'crate', dx: 1.2 }, { x: -2, y: 0, z: 0 }],
      probes: [
        [{ hold: { moveX: -1 }, seconds: 4 }],
        [{ hold: { moveX: -1, jump: true }, seconds: 4 }, { act: 'flip' }, { hold: { moveX: -1, jump: true }, seconds: 3 }, { act: 'interact' }]
      ],
      forbidden: [{ id: 'crateWest', holds: w => w.byId.get('crate')!.x < -6 }, `item:${KEY}`]
    };
    const r = scanShortcuts(scan);
    expect(r.runs).toBeGreaterThan(10);
    expect(r.hits).toEqual([]);
  });

  it('掛鉤兩模式在地板都搆不到 (2D 身體中心差 1.85 > 1.5)；西區地板各處 × 跳 + 按 E 取樣都拿不到 (C9：空中不能互動)', () => {
    const scan: ScanSpec = {
      level: foyer, mechanics: DEFAULT_MECHANICS, text: TEXT,
      movable: [],
      playerAt: [-15.6, -15.2, -14.8, -14.4, -14].map(x => ({ x, y: 0, z: -5.4 })),
      probes: [[{ act: 'interact' }], ...[0.1, 0.2, 0.3].map(t => [{ hold: { jump: true }, seconds: t }, { act: 'interact' }] as Cmd[]),
        [{ hold: { jump: true, pressed: ['interact'] }, seconds: 1.5 }]],
      forbidden: [`item:${KEY}`, 'gone:hook']
    };
    const r = scanShortcuts(scan);
    expect(r.runs).toBe(5 * 2 * 5);
    expect(r.hits).toEqual([]);
    // 實景站在掛鉤下、離牆一點 (z=-4.6：拉繩與字條都在範圍外，E 只會說「看得見，卻碰不到」)；藏寶圖站在掛鉤正下方
    for (const mode of ['3d', '2d'] as const) {
      const cs = at('foyer', null, S2);
      runScript(cs.world, [{ place: [-14.8, 0, -4.6], mode }, { act: 'interact' }]);
      expect([mode, cs.world.msgKey, hasItem(cs.world, KEY)]).toEqual([mode, 'msg.unreachable', false]);
    }
  });

  it('3D 站在箱頂也拿不到 (只在藏寶圖)；同一位置切 2D 就拿得到 (正對照)', () => {
    const cs = at('foyer', null, S2);
    const c = get(cs, 'crate');
    c.x = -14.8; c.z = -4.2;
    runScript(cs.world, [{ place: [-14.8, 1.1, -4.2] }, { act: 'interact' }]);
    expect([hasItem(cs.world, KEY), cs.world.msgKey]).toEqual([false, 'msg.unreachable']);
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.1 }, { act: 'interact' }]);
    expect(hasItem(cs.world, KEY)).toBe(true);
  });

  it('S2 時拱門雙向可通過：箱子從玄關推回南拱門 → 回到衣帽間 (北拱門內側)；T 在玄關 = 回到它進玄關時的拱門內側', () => {
    let cs = closetS1();
    cs = play(cs, [...AT_CLOSET_LEVER, { act: 'interact' }]).cs;
    cs = play(cs, PUSH_CRATE_NORTH).cs;
    cs = play(cs, CLOSET_ARCH).cs;
    const c = get(cs, CRATE);
    runScript(cs.world, [{ wait: 0.1 }, { walkTo: [-18.6, null] }, { walkTo: [null, 3.7] }, { walkTo: [-16.5, null] }]);
    expect(c.x).toBeGreaterThan(-16.4);
    resetCrates(cs.world);
    expect([c.x, c.z]).toEqual([-17.6, expect.closeTo(3.7, 6)]);
    // 從北側推向南拱門 (+z)
    const r = play(cs, [{ place: [-17.6, 0, 2] }, { walkTo: [null, 5.2] }]);
    expect([r.kinds, r.cs.world.byId.has(CRATE)]).toEqual([['state'], false]);
    expect(r.cs.state.moved).toEqual({});
    expect(r.cs.state.rooms.closet.objs.find(o => o.id === CRATE)).toMatchObject({ x: expect.closeTo(-1.6, 6), z: expect.closeTo(-4.8 + 0.2 + 1.3 + 0.6, 6) });
    cs = play(r.cs, [{ walkTo: [-17, 5.2] }, { act: 'interact' }]).cs;
    expect(cs.state.room).toBe('closet');
    expect(get(cs, CRATE).z).toBeCloseTo(-2.7, 6);
  });

  it('拱門那一頭被占住 → 推不過去 (箱子留在原房、魔方與快照不變)', () => {
    const st = closetS2().state;
    st.rooms.foyer = { objs: [{ id: 'crate', x: -17.6, y: 0, z: 3.7, gone: false, used: false, touched: false }], flags: [] };
    const cs = open(st);
    const before = JSON.stringify(captureState(cs));
    const r = transferObject(cs, CRATE, 'archN', OPTS);
    expect(r).toEqual({ blocked: 'occupied' });
    expect(JSON.stringify(captureState(cs))).toBe(before);
    const p = play(cs, PUSH_CRATE_NORTH);
    expect([p.kinds, p.cs.world.msg, p.cs.world.byId.has(CRATE)]).toEqual([['blocked'], '拱門那一頭被擋住了。', true]);
  });

  it('跨房快照往返：箱子在玄關時走去樓梯間再回來，箱子、掛鉤、拉繩都和離開時逐欄相同', () => {
    let cs = solveA(closetS1());
    // 玄關在 A：東門接樓梯間；走過去再回來
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.2 }]);
    const left = snapshotRoom(cs.world);
    cs.world.byId.get('gate')!.used = true;
    left.objs.find(o => o.id === 'gate')!.used = true;
    cs = play(cs, [{ place: [19.3, 0, 0] }, { act: 'interact' }]).cs;
    expect(cs.state.room).toBe('stair');
    cs = play(cs, [{ wait: 0.1 }, { walkTo: [-5.3, 0] }, { act: 'interact' }]).cs;
    expect(cs.state.room).toBe('foyer');
    expect(snapshotRoom(cs.world)).toEqual(left);
    expect(cs.world.byId.get(CRATE)!.def.x).toBe(-17.6);
  });
});

describe('R 重進房間 (規格 5.4.8：整章狀態回到本次進房時)', () => {
  it('S1 進衣帽間後拉「左」→ R：魔方回 S1、木箱回原位；S2 進衣帽間後寫字、拉「右」→ R：回到 S2 (不會回到 S1)、詞卡回字卡匣', () => {
    let cs = closetS1();
    cs = play(cs, [...AT_CLOSET_LEVER, { act: 'interact' }]).cs;
    cs = restartRoom(cs, OPTS);
    expect([cs.state.cube, get(cs, CRATE).x]).toEqual([S1, def(CRATE).x]);
    cs = closetS2({ nib: 1, [CARD]: 1, [KEY]: 1 });
    cs = play(cs, [...AT_CLOSET_LEVER, { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }, write('lever:closet'), { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }]).cs;
    expect(cs.state.cube).toEqual(S1);
    cs = restartRoom(cs, OPTS);
    expect(cs.state.cube).toEqual(S2);
    expect([cardsOn(cs.world, 'lever:closet'), hasItem(cs.world, CARD)]).toEqual([[], true]);
    expect(leverWord(cs.world, get(cs, 'lever'))).toBe('left');
  });

  it('推箱過拱門後 R (還在衣帽間)：箱子回到衣帽間、玄關沒有箱子', () => {
    let cs = closetS2();
    cs = play(cs, PUSH_CRATE_NORTH).cs;
    expect(cs.world.byId.has(CRATE)).toBe(false);
    cs = restartRoom(cs, OPTS);
    expect(cs.world.byId.has(CRATE)).toBe(true);
    expect([cs.state.moved, cs.state.rooms.foyer]).toEqual([{}, undefined]);
  });

  it('跟到玄關後 R：回到進玄關時 (箱子在南拱門內側、鑰匙還在掛鉤上)', () => {
    let cs = closetS2();
    cs = play(cs, [...PUSH_CRATE_NORTH, ...CLOSET_ARCH]).cs;
    runScript(cs.world, [...PUSH_CRATE_TO_HOOK, ...TAKE_KEY]);
    expect(hasItem(cs.world, KEY)).toBe(true);
    cs = restartRoom(cs, OPTS);
    expect([cs.state.room, hasItem(cs.world, KEY), get(cs, 'hook').gone, get(cs, CRATE).x]).toEqual(['foyer', false, false, -17.6]);
  });
});

describe('驚嚇：1-3a 完成後三件大衣同時滑落 (規格 9.1)', () => {
  it('沒拿到鑰匙前不會滑落；拿到鑰匙後回衣帽間，安靜 2.5 秒才滑落 (只滑一次、不擋路、記章節旗標)', () => {
    let cs = closetS1();
    runScript(cs.world, [{ wait: 10 }]);
    expect(get(cs, 'coats').used).toBe(false);
    cs = solveA(cs);
    cs = play(cs, FOYER_ARCH).cs;
    expect(cs.state.room).toBe('closet');
    runScript(cs.world, [{ wait: SCARE_DELAY - 0.2 }]);
    expect(get(cs, 'coats').used).toBe(false);
    const r = play(cs, [{ wait: 0.4 }]);
    cs = r.cs;
    expect([get(cs, 'coats').used, cs.world.msg, r.kinds]).toEqual([true, '身後一沉。三件大衣，同時從衣架上滑了下來。', ['state']]);
    expect([cs.state.flags, cs.entry.flags]).toEqual([['scare:coats'], ['scare:coats']]);
    expect(def('coats').solid).toBe(false);
  });

  it('演出過就不再演：R 之後 / 再進房 → 一開始 (1 秒內) 就安靜地倒在地上，不再說話；存檔帶著旗標', () => {
    let cs = closetS2({ nib: 1, [CARD]: 1, [KEY]: 1 });
    cs = play(cs, [{ wait: 3 }]).cs;
    expect(cs.state.flags).toEqual(['scare:coats']);
    cs = restartRoom(cs, OPTS);
    const seq = cs.world.msgSeq;
    runScript(cs.world, [{ wait: 0.1 }]);
    expect([get(cs, 'coats').used, cs.world.msgSeq, cs.world.events.some(e => e.t === 'flag')]).toEqual([true, seq, false]);
    expect(chapterSave(captureState(cs)).flags).toEqual(['scare:coats']);
  });

  describe('呈現：一般 / 減弱緊張效果 (calm)', () => {
    beforeAll(stubCanvas);
    const coatY = (root: THREE.Object3D) => root.children.filter(c => c.name === 'coat').map(c => c.position.y);
    const run = (calm: boolean, seconds: number, startTime = 3) => {
      const cs = closetS2();
      const o = get(cs, 'coats');
      const m = modelFor('coatRack')(new Painter(DEFAULT_THEME.pal.outline), o.def, DEFAULT_THEME);
      cs.world.time = startTime;
      const ctx = (dt: number) => ({ obj: o, world: cs.world, mode: '3d' as const, t: 0, dt, calm });
      m.update!(ctx(1 / 60));
      const hang = coatY(m.root);
      o.used = true;
      for (let t = 0; t < seconds; t += 1 / 60) m.update!(ctx(1 / 60));
      return { hang, now: coatY(m.root) };
    };
    it('三件同時：一般 0.45 秒內落到地上；calm 同一時間還在緩緩滑落、1.8 秒後才落地 (平靜版)', () => {
      const fast = run(false, 0.5);
      expect(fast.now.every(y => y < 0.6)).toBe(true);
      expect(new Set(fast.now.map(y => y.toFixed(3))).size).toBe(1);
      const calmEarly = run(true, 0.5);
      expect(calmEarly.now.every((y, i) => y > 0.6 && y < calmEarly.hang[i])).toBe(true);
      expect(run(true, 1.9).now.every(y => y < 0.6)).toBe(true);
    });
    it('進房 1 秒內就已滑落 (演出過) → 直接擺成倒下，不播動畫', () => {
      expect(run(false, 1 / 60, 0.02).now.every(y => y < 0.6)).toBe(true);
    });
  });
});

describe('1-3b 回來的路：規格列的錯誤嘗試', () => {
  it('不寫字：S2 衣帽間的拉桿只會「左」→ 再過去就是屋外，拉不動；章門門後是牆 (BFS ④ 另證不寫字無解)', () => {
    const cs = closetS2({ nib: 1, [CARD]: 1, [KEY]: 1 });
    const r = play(cs, [...AT_CLOSET_LEVER, { act: 'interact' }]);
    expect([r.kinds, r.cs.world.msg, r.cs.state.cube]).toEqual([['blocked'], '拉桿拉不動。再過去就是屋外了。', S2]);
    expect(validateCube(chapterOneModel(CH1_CUBE, CH1_MODEL), ['write:closet']).solvable).toBe(false);
  });

  it('把「右」貼在玄關的拉桿上：玄關在 A，往右是樓梯間 → 拉不動 (那一邊有房間擋著)；取下後原字「上」恢復', () => {
    let cs = at('foyer', null, S2);
    cs.world.byId.get('gate')!.used = true;
    const r = play(cs, [{ place: [15, 0, -5.1], mode: '2d' }, { act: 'interact' }, write('lever:foyer'), { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }]);
    cs = r.cs;
    expect([r.kinds, cs.world.msg]).toEqual([['labelOpen', 'card', 'blocked'], '拉桿拉不動。那一邊有房間擋著。']);
    expect(leverWord(cs.world, get(cs, 'lever'))).toBe('right');
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.1 }, unwrite('lever:foyer')]);
    expect([leverWord(cs.world, get(cs, 'lever')), hasItem(cs.world, CARD), cs.world.msg]).toEqual(['up', true, '字卡取了下來，原來的字還在。']);
  });

  it('在 3D 找按鈕 (標籤只在 2D)：3D 站在拉桿前送貼卡指令 → 無效 (沒有寫、卡片還在)；3D 按 E 是拉，不是寫', () => {
    const cs = closetS2();
    runScript(cs.world, [...AT_CLOSET_LEVER, write('lever:closet')]);
    expect([cardsOn(cs.world, 'lever:closet'), hasItem(cs.world, CARD)]).toEqual([[], true]);
    runScript(cs.world, [{ act: 'interact' }]);
    expect(cs.world.events.map(e => e.t)).toEqual(['turnRequest']);
  });

  it('填錯字 (無效字)：把「右」貼在衣架的「大衣」上 → 不成字：顫動 / 墨色變淡的回饋事件、卡片退回字卡匣', () => {
    const cs = closetS2();
    runScript(cs.world, [{ place: [-4.6, 0, -3], mode: '2d' }, { act: 'interact' }, write('coats')]);
    expect(cs.world.events.filter(e => e.t !== 'switch')).toEqual([{ t: 'labelOpen', label: 'coats', obj: 'coats' }, { t: 'card', label: 'coats', ok: false }]);
    expect([cardsOn(cs.world, 'coats'), hasItem(cs.world, CARD), cs.world.msg]).toEqual([[], true, '字抖了一下，墨色淡了。卡片退了回來。']);
  });

  it('沒有鑰匙：寫字、拉「右」接上書房走廊後，章門鎖著 (不通關)', () => {
    let cs = closetS2();
    cs = play(cs, [...AT_CLOSET_LEVER, { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }, write('lever:closet'), { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }]).cs;
    runScript(cs.world, CHAPTER_DOOR);
    expect([cs.world.msg, cs.world.cleared]).toEqual(['門鎖著。鑰匙孔是銅的。', false]);
  });

  it('展開圖預覽跟著標籤：寫「右」之前預覽「左」(轉不動：屋外)、之後預覽「右」(衣帽間 D → C)', () => {
    const cs = closetS2();
    runScript(cs.world, [...AT_CLOSET_LEVER, { act: 'flip' }, { wait: 0.1 }]);
    expect(deriveCubeMap(cs, TEXT, previewFor(cs))!.preview!.blocked).toBe('拉桿拉不動。再過去就是屋外了。');
    runScript(cs.world, [{ act: 'interact' }, write('lever:closet')]);
    const pv = deriveCubeMap(cs, TEXT, previewFor(cs))!.preview!;
    expect([pv.caption, pv.moved]).toEqual(['預覽：拉「右」之後（還沒拉）', { room: 'closet', name: '衣帽間', from: [0, 1], to: [1, 1] }]);
  });
});

describe('字卡匣 (UI 模型) 與 HUD', () => {
  const hud = (w: World) => deriveHud(w, TEXT, { renderMode: w.player.mode, locked: false, bindings: DEFAULT_BINDINGS }).prompt;

  it('2D 靠近拉桿：提示「寫　拉桿：左」；字卡匣 = 三格 (詞卡「右」+ 兩格空著)、衣架標籤多一格空的尺度卡槽；選第 1 格 = 一個貼卡指令', () => {
    const cs = closetS2();
    runScript(cs.world, [...AT_CLOSET_LEVER]);
    expect(hud(cs.world)).toBe('[E] 拉　拉桿「左」');
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.1 }]);
    expect(hud(cs.world)).toBe('[E] 寫　拉桿：左');
    const m = deriveCardTray(cs.world, TEXT, 0)!;
    expect([m.label, m.text.head, m.glyph, m.covered, m.scale]).toEqual(['lever:closet', '字卡匣　·　拉桿：左', '左', false, false]);
    expect(m.slots.map(s => [s.card, s.glyph, s.name])).toEqual([[CARD, '右', '詞卡「右」'], [null, '', '（空）'], [null, '', '（空）']]);
    // 衣架：名詞標籤 + 空的尺度卡槽 (只鋪陳)
    runScript(cs.world, [{ place: [-4.6, 0, -3], mode: '2d' }]);
    const coat = deriveCardTray(cs.world, TEXT, 0)!;
    expect([hud(cs.world), coat.glyph, coat.scale]).toEqual(['[E] 寫　大衣', '大衣', true]);
    runScript(cs.world, [...AT_CLOSET_LEVER.slice(0, 2).map(c => ('walkTo' in c ? { place: [2.5, 0, -4.1] as [number, number, number], mode: '2d' as const } : c))]);
    const cmd = slotCommand(m, 1) as WorldCommand;
    expect([cmd, slotCommand(m, 2), uncardCommand(m)]).toEqual([{ t: 'card', label: 'lever:closet', card: CARD }, null, null]);
    runScript(cs.world, [{ hold: { commands: [cmd] }, seconds: 1 / 60 }]);
    const after = deriveCardTray(cs.world, TEXT, 0)!;
    expect([after.glyph, after.covered, after.attached.map(a => a.glyph), after.slots[0].card, after.text.remove, after.message]).toEqual(['右', true, ['右'], null, '取下「右」', '字蓋上去了，墨還沒乾。']);
    expect(uncardCommand(after)).toEqual({ t: 'uncard', label: 'lever:closet', card: CARD });
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.1 }]);
    expect(hud(cs.world)).toBe('[E] 拉　拉桿「右」');
  });

  it('沒有卡可貼 (字卡匣空) → 不開匣：拉桿是謎題標籤 → 照樣提示「寫」、E 說缺一張字卡與去哪裡找 (不是「看得見，卻碰不到」)；有卡但沒有筆尖 → 寫不上去', () => {
    let cs = closetS2({ nib: 1 });
    runScript(cs.world, [...AT_CLOSET_LEVER, { act: 'flip' }, { wait: 0.1 }]);
    expect([hud(cs.world), deriveCardTray(cs.world, TEXT, 0)]).toEqual(['[E] 寫　拉桿：左', null]);
    runScript(cs.world, [{ act: 'interact' }]);
    expect([cs.world.msgKey, cs.world.msg, cs.world.events.some(e => e.t === 'labelOpen')])
      .toEqual(['lvl.1-3.lever.noCard', '手上少一張字卡。玄關後牆的畫像下面，好像有什麼。', false]);
    // 衣架的「大衣」不是謎題標籤 (沒有缺卡說明)：空匣時不提示、不開匣
    runScript(cs.world, [{ place: [-4.6, 0, -3], mode: '2d' }]);
    expect([hud(cs.world), deriveCardTray(cs.world, TEXT, 0)]).toEqual([null, null]);
    cs = closetS2({ [CARD]: 1 });
    runScript(cs.world, [...AT_CLOSET_LEVER, { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }, write('lever:closet')]);
    expect([cs.world.msg, cardsOn(cs.world, 'lever:closet'), cs.world.events.some(e => e.t === 'labelOpen')]).toEqual(['少了筆尖，寫不上去。', [], false]);
  });

  it('詞卡「右」貼在玄關的拉桿上、人在衣帽間：拉桿前按 E 說卡貼在別處 (要先取下)；取回來之後照常開匣', () => {
    const st = newChapterState(SPEC, 'closet', 'archN');
    st.cube = JSON.parse(JSON.stringify(S2));
    st.items = { nib: 1 };
    st.labels = { 'lever:foyer': [CARD] };
    const cs = open(st);
    runScript(cs.world, [...AT_CLOSET_LEVER, { act: 'flip' }, { wait: 0.1 }]);
    expect(hud(cs.world)).toBe('[E] 寫　拉桿：左');
    runScript(cs.world, [{ act: 'interact' }]);
    expect([cs.world.msgKey, cs.world.msg]).toEqual(['msg.label.cardElsewhere', '詞卡「右」還貼在別的標籤上。先去把它取下來。']);
    cs.world.ext = { ...cs.world.ext, labels: {} };
    cs.world.inv[CARD] = 1;
    runScript(cs.world, [{ act: 'interact' }]);
    expect(cs.world.events.filter(e => e.t === 'labelOpen')).toEqual([{ t: 'labelOpen', label: 'lever:closet', obj: 'lever' }]);
  });

  it('字卡匣關著時按 1～3 / X：2D 站在標籤前 = 按 E 打開並補做這一下；不在標籤前 → 說明怎麼打開；房裡沒有標籤 → 不出聲', () => {
    const cs = closetS2();
    runScript(cs.world, [...AT_CLOSET_LEVER]);
    // 3D (看不到標籤)：說明
    expect(closedTrayKey(cs.world, ['slot1'])).toEqual({ n: 1, open: false, howto: true });
    expect(TEXT('msg.cards.howto')).toBe('字卡匣要在藏寶圖裡、站在標籤前按 E 打開。');
    runScript(cs.world, [{ act: 'flip' }, { wait: 0.1 }]);
    expect([closedTrayKey(cs.world, ['slot1']), closedTrayKey(cs.world, ['slot3']), closedTrayKey(cs.world, ['uncard']), closedTrayKey(cs.world, ['map'])])
      .toEqual([{ n: 1, open: true, howto: false }, { n: 3, open: true, howto: false }, { n: 0, open: true, howto: false }, null]);
    // 2D 走開 (範圍外)：說明
    runScript(cs.world, [{ walkTo: [5.6, null] }]);
    expect(closedTrayKey(cs.world, ['slot2'])).toEqual({ n: 2, open: false, howto: true });
    // 2D 標籤旁有別的互動目標 (字條) → 不搶 E，只說明
    runScript(cs.world, [{ walkTo: [5, null] }]);
    expect([findTarget(cs.world)?.def.id, closedTrayKey(cs.world, ['slot1'])]).toEqual(['noteB', { n: 1, open: false, howto: true }]);
    // 沒有標籤的房間 (樓梯間)：不出聲
    const stairCs = at('stair', 'doorS', S1);
    expect(closedTrayKey(stairCs.world, ['slot1'])).toEqual({ n: 1, open: false, howto: false });
  });

  it('指令只對此刻範圍內的那個標籤有效：空中 / 走開 / 標籤 id 不對 / 沒持有的卡 → 不生效', () => {
    const cs = closetS2();
    runScript(cs.world, [...AT_CLOSET_LEVER, { act: 'flip' }, { wait: 0.1 }]);
    runScript(cs.world, [{ hold: { jump: true }, seconds: 0.05 }, write('lever:closet')]);
    expect(cardsOn(cs.world, 'lever:closet')).toEqual([]);
    runScript(cs.world, [{ wait: 0.8 }, write('lever:foyer'), write('lever:closet', 'card.left')]);
    expect([cardsOn(cs.world, 'lever:closet'), cardsOn(cs.world, 'lever:foyer')]).toEqual([[], []]);
    runScript(cs.world, [{ walkTo: [5, null] }, write('lever:closet')]);
    expect(cardsOn(cs.world, 'lever:closet')).toEqual([]);
  });
});

describe('舊存檔 (1-2 已通關、沒有詞卡「右」) 從選單進 1-3：不會無解，缺卡時有指路', () => {
  const ENTRY = LEVELS.find(e => e.id === '1-3')!;
  /** 同 app.chapterFor：在魔方上的關卡 → 整章 (接著存檔玩)，沒有章節快照 → 從大門進玄關 (舊存檔套預設旗標) */
  const enter = (raw: unknown): ChapterSession => {
    const s = memoryStorage();
    s.set('puzzle:save', JSON.stringify(raw));
    const save = loadSave(s);
    expect([isUnlocked(ENTRY, save), levelState(ENTRY, save)]).toEqual([true, 'open']);
    return open(chapterStart(save, SPEC, CH1.start, CH1.legacy));
  };
  const BACK_TO_CLOSET: Cmd[] = [{ walkTo: [-17, 5.2] }, { expect: w => expect(findTarget(w)?.def.id).toBe('archS'), label: '南拱門' }, { act: 'interact' }];

  it('v2 存檔 (舊玄關通關、只有筆尖)：從玄關南拱門進章，1-2a / 1-2b 免做、1-2d 的畫像原封不動 → 照常取得詞卡「右」', () => {
    const cs = enter({ v: 2, cleared: ['1-1', '1-2'], current: '1-2', abilities: ['nib'], diary: [], scraps: [], endings: { A: false, B: false }, name: '舊' });
    expect([cs.state.room, cs.state.door, cs.world.inv]).toEqual(['foyer', 'archS', { nib: 1 }]);
    expect([get(cs, 'key').gone, get(cs, 'plate').used, get(cs, 'gate').used, get(cs, 'drawer').used]).toEqual([true, true, true, false]);
    runScript(cs.world, R12_D);
    expect(hasItem(cs.world, CARD)).toBe(true);
  });

  it('M1b 之前的章節快照 (人在衣帽間 S1、沒有詞卡、沒有 labels / moved 欄)：拉桿前按 E 指路 → 拉「左」→ 拱門回玄關解 1-2d → 回衣帽間寫「右」→ 拉桿轉回', () => {
    let cs = enter({
      v: 3, cleared: ['1-1', '1-2'], current: '1-2', abilities: ['nib'], diary: [], scraps: [], endings: { A: false, B: false }, name: '舊',
      chapters: { 1: { cube: S1, rooms: {}, at: { room: 'closet', door: 'archN' }, items: { nib: 1 }, flags: [] } }
    });
    expect([cs.state.room, cs.state.cube, cs.state.labels, cs.state.moved, cs.world.inv]).toEqual(['closet', S1, {}, {}, { nib: 1 }]);
    runScript(cs.world, [...AT_CLOSET_LEVER, { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }]);
    expect(cs.world.msg).toBe('手上少一張字卡。玄關後牆的畫像下面，好像有什麼。');
    let r = play(cs, [{ act: 'flip' }, { wait: 0.1 }, { act: 'interact' }]);
    expect([r.kinds, r.cs.state.cube]).toEqual([['turn'], S2]);
    r = play(r.cs, CLOSET_ARCH);
    expect([r.kinds, r.cs.state.room]).toEqual([['enter'], 'foyer']);
    runScript(r.cs.world, R12_D);
    expect(hasItem(r.cs.world, CARD)).toBe(true);
    r = play(r.cs, BACK_TO_CLOSET);
    expect([r.kinds, r.cs.state.room]).toEqual([['enter'], 'closet']);
    r = play(r.cs, [...AT_CLOSET_LEVER, { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }, write('lever:closet'), { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }]);
    expect([r.kinds, r.cs.state.cube, cardsOn(r.cs.world, 'lever:closet')]).toEqual([['labelOpen', 'card', 'turn'], S1, [CARD]]);
  });
});

describe('存檔 v3 往返 (標籤上的字卡、跨房物件)', () => {
  it('箱子在玄關、詞卡貼在衣帽間拉桿上 → 寫入存檔 → 讀回 → 開章：箱子仍在玄關、標籤仍是「右」、詞卡不在匣裡', () => {
    let cs = closetS2();
    cs = play(cs, PUSH_CRATE_NORTH).cs;
    runScript(cs.world, [...AT_CLOSET_LEVER, { act: 'flip' }, { wait: 0.1 }, { act: 'interact' }, write('lever:closet')]);
    const save = withChapter(defaultSave(), captureState(cs));
    const s = memoryStorage();
    writeSave(s, save);
    const back = loadSave(s);
    expect(back).toEqual(save);
    expect(back.chapters!['1'].labels).toEqual({ 'lever:closet': [CARD] });
    expect(back.chapters!['1'].moved![CRATE]).toMatchObject({ room: 'foyer', x: -17.6 });
    const again = open(chapterStart(back, SPEC, CH1.start, CH1.legacy));
    expect([again.state.room, again.world.byId.has(CRATE), leverWord(again.world, again.world.byId.get('lever')!), hasItem(again.world, CARD)]).toEqual(['closet', false, 'right', false]);
    const foyerCs = open({ ...chapterStart(back, SPEC, CH1.start, CH1.legacy), room: 'foyer', door: 'archS' });
    expect(foyerCs.world.byId.get(CRATE)!.x).toBe(-17.6);
  });

  it('M1b 之前的章節存檔 (沒有 labels / moved 欄)：讀回 = 空，照常開章', () => {
    const old = { ...defaultSave(), chapters: { 1: { cube: S1, rooms: {}, at: { room: 'closet', door: 'archN' }, items: { nib: 1 }, flags: [] } } };
    const s = memoryStorage({ 'puzzle:save': JSON.stringify(old) });
    const st = chapterStart(loadSave(s), SPEC, CH1.start, CH1.legacy);
    expect([st.labels, st.moved, st.room]).toEqual([{}, {}, 'closet']);
  });

  it('章門打開 = 本章通關：1-3 與同章的 1-2 都記為通關、手記第一頁寫進 save.diary', () => {
    const cs = solveB(solveA(closetS1()));
    const save = recordClear({ ...defaultSave(), cleared: ['1-1'] }, '1-3', cs.world, Object.keys(CH1.levels));
    expect([save.cleared, save.current, save.diary, save.abilities]).toEqual([['1-1', '1-2', '1-3'], '1-3', [1], ['nib']]);
  });
});

// ── 字條 (規格 7.1.1 H1～H10、7.1.3 預算；story-bible 7.3 的 1-3 版本) ──
const noteText = (o: ObjDef): string => TEXT(o.type === 'note' ? o.textKey ?? '' : '');
const notes = closet.objects.filter(o => o.type === 'note');
const unstruck = (t: string) => t.replace(/~~.+?~~/g, '').replace(/\s+/g, '');
const CUBE_AHA = ['轉', '魔方', '排列', '滑', '對齊', '跟著', '一起'];
/** 每題：難度、提示字條 (L1 / L2)、關鍵物件 (H4)、aha 詞表 (H10，規格 7.1 v0.3 預設 + 方向字 / 寫題詞)、範圍 (x) */
const PUZZLES = [
  { id: '1-3a', difficulty: 3.5, hardToSolve: true, notes: ['noteA', 'noteA2'], keyObjects: ['lever', CRATE, 'archN'], foyerKeys: ['hook'], ahaTerms: [...CUBE_AHA, '左'], area: [-7, 1] as const },
  { id: '1-3b', difficulty: 3, hardToSolve: false, notes: ['noteB'], keyObjects: ['lever', 'chapterE'], foyerKeys: [], ahaTerms: [...CUBE_AHA, '字', '寫', '改', '右', '左'], area: [1, 7] as const }
];

describe('1-3 字條：量表 H1～H4、H9、H10 與預算', () => {
  it('三張字條 = story-bible 7.3 的 1-3a L1 / L2、1-3b L1 原文；L2 一開始是空白的', () => {
    expect(Object.fromEntries(notes.map(o => [o.id, noteText(o)]))).toEqual({
      noteA: '小時候搬家，你坐在紙箱裡。', noteA2: '拱門那一邊，缺了什麼？', noteB: '回來的路，和去的路不一樣？'
    });
    expect(notes.map(o => o.type === 'note' && o.revealAfter)).toEqual([undefined, 240, undefined]);
  });

  it('H1 字數 (L1 ≤ 24、L2 ≤ 30)；H2 無祈使開頭與禁用動詞；H3 無按鍵名 / 「按」/ 方位精確詞 / 數字', () => {
    for (const o of notes) {
      const t = noteText(o);
      const level2 = o.type === 'note' && o.revealAfter !== undefined;
      expect([...unstruck(t)].length).toBeLessThanOrEqual(level2 ? 30 : 24);
      expect(/^(把|先|去|到)/.test(t)).toBe(false);
      expect(/先.*再|推到|推去|推過|站上|走到|跳上|切到/.test(t)).toBe(false);
      expect(/[A-Za-z]|按|左邊第|最右邊|正下方/.test(t)).toBe(false);
      expect(/[0-9０-９]|[一二兩三四五六七八九十幾][個次格步塊公尺米下]/.test(t)).toBe(false);
    }
  });

  it('H9 口吻：沒有劃掉的字；每張是一句完整的話 (句號 / 問號結尾)、有觀察或猜測 (L2 是問句)', () => {
    for (const o of notes) {
      const t = noteText(o);
      expect(t.includes('~~')).toBe(false);
      expect(/[。？]$/.test(t)).toBe(true);
    }
    expect(noteText(notes.find(o => o.id === 'noteA2')!).endsWith('？')).toBe(true);
  });

  it('H4 不點名本題關鍵物件 (名稱與顯示名)；H10 不含本題 aha 詞表', () => {
    for (const q of PUZZLES) for (const id of q.notes) {
      const t = noteText(def(id));
      for (const k of q.keyObjects) expect([id, k, t.includes(TEXT(def(k).labelKey!))]).toEqual([id, k, false]);
      for (const k of q.foyerKeys) expect([id, k, t.includes(TEXT(fdef(k).labelKey!))]).toEqual([id, k, false]);
      for (const term of [...q.ahaTerms, TEXT('term.key.brass')]) expect([id, term, t.includes(term)]).toEqual([id, term, false]);
    }
  });

  it('預算 (7.1.3)：難度 3～4.5 → L1 一張、標「易卡關」才放 L2；每關提示 ≤ 謎題數 + 1、總數 ≤ 謎題數 + 3', () => {
    for (const q of PUZZLES) {
      const l2 = q.notes.filter(id => { const o = def(id); return o.type === 'note' && o.revealAfter !== undefined; });
      expect([q.id, q.notes.length - l2.length, l2.length]).toEqual([q.id, 1, q.hardToSolve ? 1 : 0]);
    }
    expect(notes.length).toBeLessThanOrEqual(PUZZLES.length + 1);
    expect(PUZZLES.map(q => q.id)).toEqual(closet.puzzles!.map(q => q.id));
  });

  it('位置：每張在所屬謎題範圍內；兩張間距 ≥ 3；整間房 (14 寬) 至多 3 張；兩模式都讀得到 (L2 空白時讀到「紙上還是空白的。」)', () => {
    for (const q of PUZZLES) for (const id of q.notes) expect(def(id).x >= q.area[0] && def(id).x <= q.area[1]).toBe(true);
    const xs = notes.map(o => o.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(3);
    expect(notes.length).toBeLessThanOrEqual(3);
    for (const o of notes) for (const mode of ['3d', '2d'] as const) {
      const cs = closetS2();
      runScript(cs.world, [{ place: [o.x, 0, -4.4], mode }]);
      expect([o.id, mode, findTarget(cs.world)?.def.id]).toEqual([o.id, mode, o.id]);
      interact(cs.world);
      const blank = o.type === 'note' && o.revealAfter !== undefined;
      expect(cs.world.msg).toBe(blank ? '紙上還是空白的。' : noteText(o));
      if (blank) { cs.world.time = 240; interact(cs.world); expect(cs.world.msg).toBe(noteText(o)); }
    }
  });
});
