// N29 天平 (mechanics/balance；規格 6「第三章共用規則」天平)：兩盤重量 (尺度卡決定)、傾向、want 成立 → 閂住 (used、opens、doneFlag、done 事件)、
// 倒向另一邊時說 wrongText (每次變過去一次；閂住之後不說)、不在場的物件不算、玩家不算重量、陶盆 3D 按 E = 說明
import { describe, it, expect } from 'vitest';
import type { LevelDef, ObjDef, World } from '../../../src/puzzle/core/types';
import { createWorld } from '../../../src/puzzle/core/world';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { panWeight, tiltOf } from '../../../src/puzzle/mechanics/balance';
import { runScript } from '../../../src/puzzle/devtools/runScript';
import { TEXT } from '../msgs';

const floor: ObjDef = { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 12, h: 1, d: 8, visible: 'both', solid: true };
const pot = (id: string, x: number): ObjDef => ({
  id, type: 'pot', fixedText: 'lvl.3-1.pot.fixed', x, y: 0.72, z: 0, w: 0.5, h: 0.5, d: 0.5, visible: 'both', solid: false, interactable: true, interactIn: '3d',
  label: { id: `scale:${id}`, kind: 'noun', textKey: 'lvl.3-1.pot', scale: true }
});
const gate: ObjDef = { id: 'gate', type: 'trellis', lockedRead: 'lvl.3-1.trellis.closed', x: 4, y: 0, z: 0, w: 0.2, h: 2, d: 2, visible: 'both', solid: true };
const level = (want: 'W' | 'E' | 'level', pans = { W: ['a'], E: ['b'] }): LevelDef => ({
  id: 't', titleKey: 'lvl.3-1.title', narrationKey: 'lvl.3-1.narration', nextKey: 'lvl.3-1.next',
  bounds: { minX: -6, maxX: 6, minZ: -4, maxZ: 4 }, voidY: -5, start: { x: -4, y: 0, z: 0 },
  objects: [floor, pot('a', -1), pot('b', 1), pot('c', 2.2), gate,
    { id: 'bal', type: 'balance', pans, want, opens: 'gate', doneFlag: 'p', solvedText: 'lvl.3-1.balance.solved', wrongText: 'lvl.3-1.balance.wrong',
      x: 0, y: 0, z: 0, w: 2.4, h: 1.1, d: 0.8, visible: 'both', solid: false } as ObjDef]
});
const world = (l: LevelDef): World => createWorld(l, { mechanics: DEFAULT_MECHANICS, text: TEXT });
const set = (w: World, labels: Record<string, string[]>) => { w.ext = { labels }; runScript(w, [{ wait: 1 / 60 }]); };

describe('天平 (N29)', () => {
  it('重量和 (尺度卡決定；同盤多個相加) 與傾向', () => {
    const w = world(level('W', { W: ['a'], E: ['b', 'c'] }));
    const bal = w.byId.get('bal')!;
    runScript(w, [{ wait: 1 / 60 }]);
    expect([panWeight(w, bal, 'W'), panWeight(w, bal, 'E'), tiltOf(w, bal)]).toEqual([2, 4, 'E']);
    set(w, { 'scale:b': ['card.xiao'], 'scale:c': ['card.xiao'] });
    expect([panWeight(w, bal, 'E'), tiltOf(w, bal)]).toEqual([2, 'level']);
    w.byId.get('c')!.gone = true; // 不在場的物件不算
    expect([panWeight(w, bal, 'E'), tiltOf(w, bal)]).toEqual([1, 'W']);
  });

  it('want 成立 → 閂住 (used、opens 的花架門 used = 不擋路、doneFlag → done、solvedText)；之後取下卡片也不再關上、不再說 wrongText', () => {
    const w = world(level('W'));
    runScript(w, [{ wait: 1 / 60 }]);
    set(w, { 'scale:a': ['card.da'] });
    expect([w.byId.get('bal')!.used, w.byId.get('gate')!.used, w.events.filter(e => e.t === 'done').map(e => e.t === 'done' && e.flag), w.msg])
      .toEqual([true, true, ['p'], '秤往西倒了下去。繩子一緊，花架門被拉了起來。']);
    w.msg = ''; w.msgKey = '';
    set(w, { 'scale:b': ['card.da'] });
    expect([w.byId.get('gate')!.used, w.msgKey]).toEqual([true, '']);
  });

  it('倒向另一邊 → wrongText (每次變過去說一次；平 = 不說)；want 為「平」的天平：兩盤一樣才成立', () => {
    const w = world(level('W'));
    runScript(w, [{ wait: 1 / 60 }]);
    set(w, { 'scale:b': ['card.da'] });
    expect([w.msg, w.byId.get('gate')!.used]).toEqual(['秤往東倒了。花架門被壓得更緊。', false]);
    const seq = w.msgSeq;
    set(w, { 'scale:b': ['card.da'], 'scale:a': ['card.xiao'] });
    expect(w.msgSeq).toBe(seq); // 還是往東：不重複說
    const lv = world(level('level'));
    runScript(lv, [{ wait: 1 / 60 }]);
    expect(lv.byId.get('bal')!.used).toBe(true); // 開場就平 = 成立 (3-3a 的配平題用)
  });

  it('玩家不算重量 (站在盤下 / 盤旁都一樣)；陶盆 3D 按 E = 「釘在秤盤上，搬不動。」', () => {
    const w = world(level('W'));
    runScript(w, [{ place: [-1, 0, 0.5] }, { wait: 0.2 }]);
    expect(tiltOf(w, w.byId.get('bal')!)).toBe('level');
    runScript(w, [{ act: 'interact' }]);
    expect(w.msg).toBe('陶盆釘在秤盤上，搬不動。');
  });
});
