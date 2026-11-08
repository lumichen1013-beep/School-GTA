// N22 標籤與字卡 (mechanics/labels；architecture 4.17、規格 5.4.5)：純邏輯 (確定性、無 DOM) 與反例
import { describe, it, expect } from 'vitest';
import { createWorld } from '../../../src/puzzle/core/world';
import { step } from '../../../src/puzzle/core/step';
import { interact } from '../../../src/puzzle/core/interact';
import type { WorldCommand } from '../../../src/puzzle/core/actions';
import type { LevelDef, ObjDef } from '../../../src/puzzle/core/types';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { accepts, CARDS, cardsOn, labelTarget, leverWord, trayCards, writableTarget } from '../../../src/puzzle/mechanics/labels';
import { LEVER_WORDS } from '../../../src/puzzle/mechanics/cube';
import { place } from '../helpers';
import { TEXT } from '../msgs';

const floor: ObjDef = { id: 'floor', type: 'floor', x: 0, y: -1, z: 0, w: 20, h: 1, d: 8, visible: 'both', solid: true };
const lever: ObjDef = { id: 'lv', type: 'lever', word: 'left', label: { id: 'lever:t', kind: 'dir' }, x: 0, y: 0.2, z: -3.7, w: 0.6, h: 1.4, d: 0.4, visible: 'both', solid: false, interactable: true, interactIn: '3d' };
const coat: ObjDef = { id: 'co', type: 'coatRack', fallWhen: 'key.x', scare: 't', fallText: 'msg.fell', label: { id: 'coat:t', kind: 'noun', textKey: 'lvl.1-3.coats.word', scale: true }, x: 6, y: 0, z: -3.5, w: 2, h: 2, d: 0.6, visible: 'both', solid: false };
const LEVEL: LevelDef = { id: 't', titleKey: 'lvl.1-2.title', narrationKey: 'lvl.1-2.narration', nextKey: 'lvl.1-2.next', bounds: { minX: -10, maxX: 10, minZ: -4, maxZ: 4 }, voidY: -5, start: { x: -6, y: 0, z: 0 }, objects: [floor, lever, coat] };
const world = (inv: Record<string, number> = { nib: 1, 'card.right': 1 }) => { const w = createWorld(LEVEL, { mechanics: DEFAULT_MECHANICS, text: TEXT }); w.inv = { ...inv }; return w; };
const cmd = (w: ReturnType<typeof world>, c: WorldCommand) => step(w, { moveX: 0, moveZ: 0, jump: false, pressed: [], commands: [c] }, 1 / 60);
const card = (label: string, c = 'card.right'): WorldCommand => ({ t: 'card', label, card: c });

describe('詞典 (最小版)', () => {
  it('詞卡 = 每個方向字一張 (card.<方向字>)；方向字標籤 + 詞卡 = 新方向；名詞 (大衣) + 詞卡 = 不成字', () => {
    // 方向詞卡 = 每個方向字一張；v0.4 另有第二章字謎的詞卡 (卡面字 glyph，沒有方向)
    expect(Object.keys(CARDS).filter(c => CARDS[c].dir !== undefined).sort()).toEqual(LEVER_WORDS.map(w => `card.${w}`).sort());
    expect(Object.keys(CARDS).filter(c => CARDS[c].dir === undefined && CARDS[c].slot === 'word').sort()).toEqual(['card.bian', 'card.chui', 'card.di', 'card.fu', 'card.li', 'card.nei', 'card.qian', 'card.tai', 'card.wai']); // 5-2 東窗加 抬 / 低 / 垂 / 俯
    expect(Object.keys(CARDS).filter(c => CARDS[c].slot === 'part').sort()).toEqual(['card.cai', 'card.ri']); // v0.4 部件卡 (2-3a 日、2-4c 才)
    const w = world();
    expect(accepts(w.byId.get('lv')!, 'card.right')).toBe(true);
    expect(accepts(w.byId.get('co')!, 'card.right')).toBe(false);
    expect(accepts(w.byId.get('lv')!, 'card.nope')).toBe(false);
  });

  it('拉桿的方向字：沒貼卡 = 原字；貼了詞卡 = 詞卡的字；取下 = 原字恢復', () => {
    const w = world();
    const o = w.byId.get('lv')!;
    expect(leverWord(w, o)).toBe('left');
    w.ext = { labels: { 'lever:t': ['card.right'] } };
    expect(leverWord(w, o)).toBe('right');
    w.ext = { labels: {} };
    expect(leverWord(w, o)).toBe('left');
  });
});

describe('寫 (2D、站穩、範圍內、有筆尖)', () => {
  it('2D 站在拉桿前：labelTarget = 拉桿；E → labelOpen (不轉動)；貼卡 → 詞卡離開字卡匣、標籤上貼著它', () => {
    const w = world();
    place(w, 0, 0, -3, '2d');
    expect([labelTarget(w)?.def.id, writableTarget(w)?.def.id]).toEqual(['lv', 'lv']);
    interact(w);
    expect(w.events).toEqual([{ t: 'labelOpen', label: 'lever:t', obj: 'lv' }]);
    w.events.length = 0;
    cmd(w, card('lever:t'));
    expect([cardsOn(w, 'lever:t'), trayCards(w), w.msgKey, w.events]).toEqual([['card.right'], [], 'msg.label.written', [{ t: 'card', label: 'lever:t', ok: true }]]);
  });

  it('每張卡同時只貼一處：貼在拉桿後再對衣架送指令 → 沒有卡 (不生效)；取下 → 回到字卡匣', () => {
    const w = world();
    place(w, 0, 0, -3, '2d');
    cmd(w, card('lever:t'));
    place(w, 6, 0, -3, '2d');
    cmd(w, card('coat:t'));
    expect([cardsOn(w, 'coat:t'), cardsOn(w, 'lever:t')]).toEqual([[], ['card.right']]);
    place(w, 0, 0, -3, '2d');
    cmd(w, { t: 'uncard', label: 'lever:t', card: 'card.right' });
    expect([cardsOn(w, 'lever:t'), trayCards(w), w.msgKey]).toEqual([[], ['card.right'], 'msg.label.removed']);
  });

  it('換卡：同一個字槽已有卡 → 新卡貼上、舊卡回字卡匣', () => {
    const w = world({ nib: 1, 'card.right': 1, 'card.up': 1 });
    place(w, 0, 0, -3, '2d');
    cmd(w, card('lever:t'));
    cmd(w, card('lever:t', 'card.up'));
    expect([cardsOn(w, 'lever:t'), trayCards(w), leverWord(w, w.byId.get('lv')!)]).toEqual([['card.up'], ['card.right'], 'up']);
  });

  it('反例：實景 / 空中 / 範圍外 / 標籤 id 不對 / 沒持有的卡 → 指令不生效；沒有筆尖 → 寫不上去', () => {
    for (const setup of [
      (w: ReturnType<typeof world>) => place(w, 0, 0, -3, '3d'),
      (w: ReturnType<typeof world>) => { place(w, 0, 0, -3, '2d'); w.player.onGround = false; w.player.y = 0.6; },
      (w: ReturnType<typeof world>) => place(w, 3, 0, -3, '2d')
    ]) {
      const w = world();
      setup(w);
      w.rt.mechanics.command.forEach(m => m.command!(w, card('lever:t')));
      expect(cardsOn(w, 'lever:t')).toEqual([]);
    }
    const w = world();
    place(w, 0, 0, -3, '2d');
    cmd(w, card('coat:t'));
    cmd(w, card('lever:t', 'card.up'));
    expect(cardsOn(w, 'lever:t')).toEqual([]);
    const noNib = world({ 'card.right': 1 });
    place(noNib, 0, 0, -3, '2d');
    interact(noNib);
    cmd(noNib, card('lever:t'));
    expect([noNib.msgKey, cardsOn(noNib, 'lever:t'), noNib.events.some(e => e.t === 'labelOpen')]).toEqual(['msg.label.noNib', [], false]);
  });

  it('無效字：詞卡貼「大衣」→ 不生效、卡片留在匣裡、回饋事件 ok=false', () => {
    const w = world();
    place(w, 6, 0, -3, '2d');
    cmd(w, card('coat:t'));
    expect([cardsOn(w, 'coat:t'), trayCards(w), w.msgKey, w.events]).toEqual([[], ['card.right'], 'msg.label.invalid', [{ t: 'card', label: 'coat:t', ok: false }]]);
  });

  it('確定性：同一序列 (貼、換、取) 兩次，標籤與持有物逐欄相同', () => {
    const run = () => {
      const w = world({ nib: 1, 'card.right': 1, 'card.up': 1 });
      place(w, 0, 0, -3, '2d');
      cmd(w, card('lever:t'));
      cmd(w, card('lever:t', 'card.up'));
      cmd(w, { t: 'uncard', label: 'lever:t', card: 'card.up' });
      return JSON.stringify([w.ext.labels, w.inv]);
    };
    expect(run()).toBe(run());
  });
});
