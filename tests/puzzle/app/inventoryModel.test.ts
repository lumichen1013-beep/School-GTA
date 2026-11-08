// 道具欄 popup (app/inventoryModel + ui/icons itemIcon)：每個關卡拿得到的道具都有名稱 + 說明 + 專屬圖示 (缺一則失敗)；
// 格子 ≥ 12 (整列增列)、點選的說明、字卡標「可在字卡匣使用」、後備圖示與說明；LevelSession：I / Esc、角色不動但世界照常、疊層打開時收起
import { describe, it, expect } from 'vitest';
import { LEVELS } from '../../../src/puzzle/content/levels';
import { CUBE_CHAPTERS } from '../../../src/puzzle/content/cubes';
import { RECIPES } from '../../../src/puzzle/mechanics/combine';
import { deriveInventory, MIN_SLOTS } from '../../../src/puzzle/app/inventoryModel';
import { itemIcon } from '../../../src/puzzle/ui/icons';
import { activateDial, captureState, newChapterState, openChapter, type ChapterSpec } from '../../../src/puzzle/core/chapter';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { chapterDoors } from '../../../src/puzzle/mechanics/cube';
import { TEST_DIAL_CHAPTER, TEST_DIAL_CUBE } from '../../../src/puzzle/content/cubes/test-dial';
import { PROTO_DIAL_ROOMS } from '../../../src/puzzle/content/levels/proto/dial';
import { LevelSession, type SessionContext } from '../../../src/puzzle/app/levelSession';
import { DEFAULT_BINDINGS, INPUT_ACTIONS } from '../../../src/puzzle/input/bindings';
import type { InputFrame } from '../../../src/puzzle/input/types';
import type { Transition } from '../../../src/puzzle/render/transitions';
import type { PuzzleHud } from '../../../src/puzzle/ui/hud';
import { resolveTheme } from '../../../src/puzzle/render/themes';
import { place } from '../helpers';
import { TEXT } from '../msgs';

/** 物件定義裡指向道具的欄位 (給 / 收 / 需要)：拾取 grants、hook / latticeBox also、gives、cards、reward、合成 out / parts、item、answers、part、need、門的 key */
const ITEM_FIELDS = new Set(['grants', 'also', 'gives', 'cards', 'reward', 'out', 'item', 'parts', 'answers', 'part', 'need', 'key']);
function obtainable(): Map<string, string> {
  const ids = new Map<string, string>();
  const walk = (v: unknown, field: string, src: string): void => {
    if (typeof v === 'string') { if (ITEM_FIELDS.has(field) && !ids.has(v)) ids.set(v, src); return; }
    if (Array.isArray(v)) { for (const x of v) walk(x, field, src); return; }
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, ITEM_FIELDS.has(field) && k === 'item' ? 'item' : k, src);
  };
  for (const e of LEVELS) for (const o of e.load().objects) walk(o, '', `${e.id}:${o.id}`);
  for (const c of CUBE_CHAPTERS) for (const [room, d] of Object.entries(c.rooms)) for (const o of d.objects) walk(o, '', `ch${c.chapter}:${room}:${o.id}`);
  for (const r of RECIPES) for (const id of [r.out, ...r.parts]) if (!ids.has(id)) ids.set(id, 'recipe');
  return ids;
}

describe('所有拿得到的道具：名稱 + 說明 + 圖示', () => {
  const ids = obtainable();
  it('收集到的道具 (筆尖、鑰匙、齒、手記、殘片、字卡、部件卡、尺度卡、放大鏡、校樣、手稿…) ≥ 39 種 (2026-11-08 的數量；之後只增不減)', () => {
    expect(ids.size).toBeGreaterThanOrEqual(39);
    for (const id of ['nib', 'key.brass', 'tooth.shelf', 'diary.1', 'scrap.1', 'card.wai', 'card.ri', 'card.da', 'magnifier', 'proof', 'ms.father', 'notes.father']) expect([id, ids.has(id)]).toEqual([id, true]);
  });
  it('每一種都有 term 名稱、item 說明、專屬圖示 (不是後備)', () => {
    const missing = [...ids].flatMap(([id, src]) => [
      ...(TEXT.has(`term.${id}`) ? [] : [`${id} (${src})：沒有名稱 term.${id}`]),
      ...(TEXT.has(`item.${id}.desc`) ? [] : [`${id} (${src})：沒有說明 item.${id}.desc`]),
      ...(itemIcon(id).generic ? [`${id} (${src})：沒有專屬圖示`] : [])
    ]);
    expect(missing).toEqual([]);
  });
  it('說明不劇透：不提到解法用語 (答案 / 解法 / 密碼是)', () => {
    for (const id of ids.keys()) expect([id, /答案|解法|密碼是/.test(TEXT(`item.${id}.desc`))]).toEqual([id, false]);
  });
  it('之後新增、沒有專屬圖示 / 說明的道具：後備圖示 + 後備說明 (不會壞)', () => {
    expect(itemIcon('mystery.box').generic).toBe(true);
    expect(itemIcon('mystery.box').svg).toContain('<svg');
    const v = deriveInventory({ 'mystery.box': 1 }, TEXT, 'mystery.box');
    expect(v.detail!.desc).toBe('老宅裡找到的東西。');
  });
});

describe('deriveInventory', () => {
  it('什麼都沒有：12 格空格 + 一句話；角標 0', () => {
    const v = deriveInventory({}, TEXT, null);
    expect([v.title, v.cells.length, v.slots, v.count, v.empty, v.detail]).toEqual(['道具欄', 0, MIN_SLOTS, 0, '還沒有拿到任何東西。', null]);
  });
  it('格子依持有順序；數量 > 1 有角標；點選 = 名稱 + 說明；字卡另標「可在字卡匣使用」', () => {
    const v = deriveInventory({ nib: 1, 'card.wai': 2, 'key.brass': 1 }, TEXT, 'card.wai');
    expect(v.cells.map(c => [c.id, c.name, c.n, c.card, c.selected])).toEqual([['nib', '鋼筆筆尖', 1, false, false], ['card.wai', '詞卡「外」', 2, true, true], ['key.brass', '銅鑰匙', 1, false, false]]);
    expect(v.cells[1].icon).toContain('外');
    expect(v.detail).toEqual({ name: '詞卡「外」', desc: '一張詞卡，寫著「外」。', count: '× 2', note: '可在字卡匣使用（藏寶圖裡對標籤按 E）。' });
    expect(v.count).toBe(4);
    expect(deriveInventory({ nib: 1 }, TEXT, 'nib').detail!.note).toBeNull();
    expect(deriveInventory({ nib: 1 }, TEXT, null).detail).toBeNull();
  });
  it('超過 12 樣：增列到整列 (4 欄)', () => {
    const inv = Object.fromEntries([...obtainable().keys()].slice(0, 13).map(id => [id, 1]));
    expect(deriveInventory(inv, TEXT, null).slots).toBe(16);
  });
  it('I 是道具欄的鍵 (不與其他動作重疊)', () => {
    expect(DEFAULT_BINDINGS.inventory).toEqual(['KeyI']);
    const all = Object.entries(DEFAULT_BINDINGS).filter(([k]) => !['navLeft', 'navRight', 'navUp', 'navDown'].includes(k)).flatMap(([, v]) => v);
    expect(all.filter(c => c === 'KeyI')).toEqual(['KeyI']);
    expect(INPUT_ACTIONS).toContain('inventory');
  });
});

// ── LevelSession ──
const sink: unknown = new Proxy(function () { /* noop */ }, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : sink), apply: () => sink, set: () => true });
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => sink }) };

describe('LevelSession 道具欄', () => {
  const SPEC: ChapterSpec = { chapter: TEST_DIAL_CHAPTER, cube: TEST_DIAL_CUBE, rooms: PROTO_DIAL_ROOMS, doors: chapterDoors(PROTO_DIAL_ROOMS) };
  const SNAP: Transition = { duration: 0, start: () => {}, tick: () => ({ done: true, swapNow: true }), cancel: () => {} };
  const frame = (f: Partial<InputFrame> = {}): InputFrame => ({ moveX: 0, moveZ: 0, jump: false, pressed: [], anyKey: false, ...f });
  const make = () => {
    const cs = activateDial(openChapter(SPEC, newChapterState(SPEC, 'protoA', null), { mechanics: DEFAULT_MECHANICS, text: TEXT }));
    const ctx: SessionContext = { renderer: {} as SessionContext['renderer'], text: TEXT, hud: { reset: () => {} } as unknown as PuzzleHud, bindings: DEFAULT_BINDINGS, transition: SNAP, theme: resolveTheme(undefined) };
    const s = new LevelSession(ctx, SPEC, captureState(cs), { abilities: ['nib'], onCleared: () => {} });
    place(s.world, -2, 0, 1.5, '3d');
    s.world.inv = { nib: 1, 'card.wai': 1 };
    return s;
  };

  it('I 打開：角色不動、世界照常推進；再按 I / Esc 關閉；工具列角標 = 持有總數', () => {
    const s = make();
    s.update(1 / 60, frame({ pressed: ['inventory'] }));
    expect([s.isInventoryOpen, s.toolbarContext.itemCount, s.toolbarContext.itemsOpen]).toEqual([true, 2, true]);
    const x = s.world.player.x, t = s.world.time;
    for (let i = 0; i < 30; i++) s.update(1 / 60, frame({ moveX: 1, jump: true }));
    expect(s.world.player.x).toBe(x);
    expect(s.world.time).toBeGreaterThan(t + 0.4);
    s.inventoryPick('nib');
    expect(s.inventoryModel()!.detail!.name).toBe('鋼筆筆尖');
    s.update(1 / 60, frame({ pressed: ['cancel'] }));
    expect([s.isInventoryOpen, s.inventoryModel()]).toEqual([false, null]);
    s.update(1 / 60, frame({ pressed: ['inventory'] }));
    s.update(1 / 60, frame({ pressed: ['inventory'] }));
    expect(s.isInventoryOpen).toBe(false);
    for (let i = 0; i < 30; i++) s.update(1 / 60, frame({ moveX: 1 }));
    expect(s.world.player.x).toBeGreaterThan(x);
  });

  it('打開展開圖 / 進轉動模式 → 道具欄收起；道具欄打開 → 轉動模式收起', () => {
    const s = make();
    s.requestMode('2d');
    for (let i = 0; i < 10; i++) s.update(1 / 60, frame());
    s.toggleInventory();
    s.toggleMap();
    expect([s.isInventoryOpen, s.isMapOpen]).toEqual([false, true]);
    s.toggleMap();
    s.toggleTurnMode();
    expect(s.isTurnMode).toBe(true);
    s.update(1 / 60, frame({ pressed: ['inventory'] }));
    expect([s.isInventoryOpen, s.isTurnMode]).toEqual([true, false]);
    s.update(1 / 60, frame({ pressed: ['turnMode'] }));
    expect([s.isInventoryOpen, s.isTurnMode]).toEqual([false, true]);
  });
});
