// N23 尺度三檔 (mechanics/scale；規格 6「第三章共用規則」量)：尺度卡只收在有方槽的名詞標籤、以底部中心改寫 def 的 w / h / d、
// 放大前卡牆 (實體 / 出界 → 「這裡放不下。」卡片退回；卡榫物件不查出界)、取下「小」長回原尺寸也要放得下、壓到玩家 → 挪開、重量、卡榫
import { describe, it, expect } from 'vitest';
import type { LevelDef, ObjDef, World } from '../../../src/puzzle/core/types';
import { createWorld } from '../../../src/puzzle/core/world';
import { boxAt, objBox, overlaps } from '../../../src/puzzle/core/geometry';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { accepts } from '../../../src/puzzle/mechanics/labels';
import { canResize, jamQuery, roomJammed, weightOf, worldJammed } from '../../../src/puzzle/mechanics/scale';
import { newChapterState } from '../../../src/puzzle/core/chapter';
import { runScript, type Cmd } from '../../../src/puzzle/devtools/runScript';
import { TEXT } from '../msgs';

const floor: ObjDef = { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 12, h: 1, d: 8, visible: 'both', solid: true };
const scaled = (id: string, x: number, z: number, extra: Partial<ObjDef> = {}): ObjDef => ({
  id, type: 'crate', x, y: 0, z, w: 1, h: 1, d: 1, visible: 'both', solid: false, label: { id: `scale:${id}`, kind: 'noun', textKey: 'lvl.3-1.pot', scale: true }, ...extra
} as ObjDef);
const room = (objects: ObjDef[]): LevelDef => ({
  id: 't', titleKey: 'lvl.3-1.title', narrationKey: 'lvl.3-1.narration', nextKey: 'lvl.3-1.next',
  bounds: { minX: -6, maxX: 6, minZ: -4, maxZ: 4 }, voidY: -5, start: { x: -4, y: 0, z: 0 }, objects: [floor, ...objects]
});
const world = (objects: ObjDef[]): World => {
  const w = createWorld(room(objects), { mechanics: DEFAULT_MECHANICS, text: TEXT, abilities: ['nib'] });
  w.inv = { 'card.da': 1, 'card.xiao': 1, 'card.right': 1 };
  return w;
};
const in2d = (x: number): Cmd[] => [{ place: [x, 0, 0], mode: '2d' }, { wait: 0.05 }];
const card = (label: string, c: string, t: 'card' | 'uncard' = 'card'): Cmd => ({ hold: { commands: [{ t, label, card: c }] }, seconds: 1 / 60 });

describe('尺度卡貼在哪裡 (詞典)', () => {
  it('只收在有方槽的名詞標籤上；方槽的標籤貼詞卡 = 無效；沒有方槽的名詞貼尺度卡 = 無效 (字顫動、卡片退回)', () => {
    const w = world([scaled('a', 0, 0), { ...scaled('b', 3, 0), label: { id: 'noun:b', kind: 'noun', textKey: 'lvl.3-1.pot' } } as ObjDef]);
    const a = w.byId.get('a')!, b = w.byId.get('b')!;
    expect([accepts(a, 'card.da'), accepts(a, 'card.xiao'), accepts(a, 'card.right'), accepts(b, 'card.da')]).toEqual([true, true, false, false]);
    runScript(w, [...in2d(3), card('noun:b', 'card.da')]);
    expect([w.msgKey, w.inv['card.da'], w.events.filter(e => e.t === 'card').map(e => e.t === 'card' && e.ok)]).toEqual(['msg.label.invalid', 1, [false]]);
  });
});

describe('縮放：底部中心、def 改寫、重量', () => {
  it('「大」×1.5 / 「小」×0.5 / 取下 = 原尺寸 (x、y、z 不動)；重量 3 / 1 / 2；沒有標籤的物件用 weight 欄', () => {
    const w = world([scaled('a', 0, 0), { ...scaled('c', 3, 2), label: undefined, weight: 5 } as ObjDef]);
    const a = w.byId.get('a')!;
    runScript(w, [...in2d(0), card('scale:a', 'card.da')]);
    expect([a.def.w, a.def.h, a.def.d, a.x, a.y, a.z, weightOf(w, a), w.msg]).toEqual([1.5, 1.5, 1.5, 0, 0, 0, 3, '量過了。它照著刻度，長大了。']);
    runScript(w, [card('scale:a', 'card.xiao')]);
    expect([a.def.w, weightOf(w, a), w.inv['card.da'], w.msg]).toEqual([0.5, 1, 1, '量過了。它照著刻度，縮小了。']); // 換卡：「大」退回匣裡
    runScript(w, [card('scale:a', 'card.xiao', 'uncard')]);
    expect([a.def.w, weightOf(w, a), w.msg, weightOf(w, w.byId.get('c')!)]).toEqual([1, 2, '尺度卡取了下來。它回到原來的大小。', 5]);
  });

  it('縮放 = 標籤的函式：直接改 ext.labels (讀檔 / 換房) → 下一步重算 (beforePhysics)；關卡資料的定義不被改', () => {
    const level = room([scaled('a', 0, 0)]);
    const w = createWorld(level, { mechanics: DEFAULT_MECHANICS, text: TEXT });
    w.ext = { labels: { 'scale:a': ['card.da'] } };
    runScript(w, [{ wait: 1 / 60 }]);
    expect([w.byId.get('a')!.def.w, level.objects[1].w]).toEqual([1.5, 1]);
  });
});

describe('放大前卡牆 (「這裡放不下。」)', () => {
  it('新盒碰到實體 (任一模式) → 放不下、卡片退回匣裡；縮小一律可以', () => {
    const wall: ObjDef = { id: 'wall', type: 'wall', x: 0.9, y: 0, z: 0, w: 0.4, h: 2, d: 2, visible: '3d', solid: true };
    const w = world([scaled('a', 0, 0), wall]);
    const a = w.byId.get('a')!;
    expect([canResize(w, a, 1.5), canResize(w, a, 0.5)]).toEqual([false, true]);
    runScript(w, [...in2d(-1.2), card('scale:a', 'card.da')]);
    expect([w.msg, a.def.w, w.inv['card.da'], w.ext.labels?.['scale:a']]).toEqual(['這裡放不下。', 1, 1, undefined]);
    runScript(w, [card('scale:a', 'card.xiao')]);
    expect(a.def.w).toBe(0.5);
  });

  it('出界 (伸出房間) → 放不下；卡榫物件 (jam) 不查出界 (它本來就伸出去)', () => {
    const w = world([scaled('a', 5.4, 0), scaled('j', -5.4, 0, { jam: true })]);
    expect([canResize(w, w.byId.get('a')!, 1.5), canResize(w, w.byId.get('j')!, 1.5)]).toEqual([false, true]);
  });

  it('取下「小」= 長回原尺寸：旁邊被占了就取不下來 (卡片留在標籤上)', () => {
    const w = world([scaled('a', 0, 0)]);
    const a = w.byId.get('a')!;
    runScript(w, [...in2d(-1.2), card('scale:a', 'card.xiao')]);
    w.objs.push({ def: { id: 'block', type: 'wall', x: 0.6, y: 0, z: 0, w: 0.3, h: 1, d: 1, visible: '3d', solid: true }, x: 0.6, y: 0, z: 0, gone: false, used: false, touched: false });
    runScript(w, [card('scale:a', 'card.xiao', 'uncard')]);
    expect([w.msg, a.def.w, w.ext.labels?.['scale:a']]).toEqual(['這裡放不下。', 0.5, ['card.xiao']]);
  });

  it('實體的可量物放大壓到玩家 → 玩家挪到最近空位 (resolvePlayerOverlap)', () => {
    const w = world([scaled('s', 0, 0, { solid: true, h: 0.6 })]);
    runScript(w, [...in2d(-1.15), card('scale:s', 'card.da')]);
    const s = w.byId.get('s')!;
    const p = w.player;
    expect([s.def.w, overlaps(objBox(s), boxAt(p.x, p.y, p.z), '2d')]).toEqual([1.5, false]);
  });
});

describe('卡榫 (P3)', () => {
  it('jam 物件伸出房間 = 卡住 (blocksTrack)；縮到房內 = 鬆開；不在場的房以關卡資料 + 章節標籤判定 (jamQuery)', () => {
    const root = scaled('r', 0, -3.6, { jam: true, d: 1.2 }); // z∈[-4.2, -3.0]：越過後牆 -4
    const level = room([root]);
    const w = createWorld(level, { mechanics: DEFAULT_MECHANICS, text: TEXT });
    expect([worldJammed(w), w.rt.mechanics.blocksTrack.some(m => m.blocksTrack!(w))]).toEqual([true, true]);
    w.ext = { labels: { 'scale:r': ['card.xiao'] } };
    expect(worldJammed(w)).toBe(false);
    expect([roomJammed(level, {}), roomJammed(level, { 'scale:r': ['card.xiao'] }), roomJammed(level, { 'scale:r': ['card.da'] })]).toEqual([true, false, true]);
    const q = jamQuery({ t: level });
    const st = newChapterState({ chapter: 9, cube: null, rooms: { t: level }, doors: [] }, 't', null);
    expect([q('t', st), q('t', { ...st, labels: { 'scale:r': ['card.xiao'] } }), q('nope', st)]).toEqual([true, false, false]);
  });
});
