// 字卡匣的資料推導 (純函式，Node 可測；ui/cardTray.ts 只負責畫)：architecture 4.17、mobile-controls 2.5
import type { ObjState, World } from '../core/types';
import type { WorldCommand } from '../core/actions';
import type { Text } from '../text/text';
import { cardsOn, CARDS, labelTarget, TRAY_SLOTS, trayCards, writableTarget } from '../mechanics/labels';
import { findTarget } from '../core/interact';
import type { InputAction } from '../input/types';
import { WORD_KEYS } from '../mechanics/cube';
import { leverWord } from '../mechanics/labels';
import type { CardTrayModel } from '../ui/cardTray';

export type { CardTrayModel } from '../ui/cardTray';

/** 字卡匣裡顯示的標籤訊息 (寫上 / 取下 / 無效 / 沒有筆尖) */
const LABEL_MSGS: ReadonlySet<string> = new Set(['msg.label.written', 'msg.label.removed', 'msg.label.invalid', 'msg.label.noNib']);

/** 詞卡的字 (卡面大字) 與名稱 (例：右 / 詞卡「右」) */
const cardGlyph = (text: Text, card: string): string => { const c = CARDS[card]; return c?.dir ? text(WORD_KEYS[c.dir]) : c?.glyph ? text(c.glyph) : card; };
const cardName = (text: Text, card: string): string => text(`term.${card}`);

/** 標籤此刻的字 (拉桿：方向字 / 名詞：textKey) 與原字 */
export function labelGlyph(w: World, text: Text, o: ObjState): { now: string; base: string } {
  const l = o.def.label;
  if (!l) return { now: '', base: '' };
  if (l.kind === 'dir' && o.def.type === 'lever') return { now: text(WORD_KEYS[leverWord(w, o)]), base: text(WORD_KEYS[o.def.word]) };
  if (l.kind === 'blank') {
    // 字謎空格 (2-2b)：原字 = 空格「＿」；貼了詞卡 = 卡面的字填進去
    const card = cardsOn(w, l.id)[0];
    const fill = (c: string) => (l.textKey ? text(l.textKey, { c }) : c);
    return { now: fill(card ? cardGlyph(text, card) : text('ui.label.blank')), base: fill(text('ui.label.blank')) };
  }
  const t = l.textKey ? text(l.textKey) : '';
  return { now: t, base: t };
}

/** 標籤在提示 / 卡匣標題上的名稱 (拉桿：「拉桿：左」；名詞：「大衣」) */
export function labelTitle(w: World, text: Text, o: ObjState): string {
  const g = labelGlyph(w, text, o);
  return o.def.label?.kind === 'dir' ? text('ui.label.dir', { name: text('term.lever'), word: g.now }) : g.now;
}

/**
 * 字卡匣 (開著的對象 = 此刻 2D 範圍內可寫的標籤；離開 / 切回實景 → null，外殼關掉卡匣)：
 * 卡匣格 TRAY_SLOTS 格 (持有的卡依序放，其餘空著)、標籤上貼著的卡、尺度卡槽 (只鋪陳)
 */
export function deriveCardTray(w: World, text: Text, feedbackSeq: number): CardTrayModel | null {
  const t = writableTarget(w);
  if (!t || !t.def.label) return null;
  const held = trayCards(w);
  const id = t.def.label.id;
  const g = labelGlyph(w, text, t);
  return {
    label: id,
    title: labelTitle(w, text, t),
    glyph: g.now,
    base: g.base,
    covered: g.now !== g.base || cardsOn(w, id).length > 0,
    scale: !!t.def.label.scale,
    slots: Array.from({ length: TRAY_SLOTS }, (_, i) => {
      const card = held[i] ?? null;
      return card ? { card, glyph: cardGlyph(text, card), name: cardName(text, card), key: String(i + 1) } : { card: null, glyph: '', name: text('ui.cards.empty'), key: String(i + 1) };
    }),
    attached: cardsOn(w, id).map(card => ({ card, glyph: cardGlyph(text, card), name: cardName(text, card) })),
    message: LABEL_MSGS.has(w.msgKey) ? w.msg : '',
    feedbackSeq,
    text: {
      head: text('ui.cards.head', { title: labelTitle(w, text, t) }), close: text('ui.cards.close'),
      remove: text('ui.cards.remove', { word: cardsOn(w, id)[0] ? cardGlyph(text, cardsOn(w, id)[0]) : '' }), howto: ['ui.cards.howto.paste', 'ui.cards.howto.remove', 'ui.cards.howto.close'].map(k => text(k)), scale: text('ui.cards.scale')
    }
  };
}

/** 卡匣第 n 格 (1 起算) 的貼卡指令；空格 → null */
export function slotCommand(m: CardTrayModel, n: number): WorldCommand | null {
  const s = m.slots[n - 1];
  return s?.card ? { t: 'card', label: m.label, card: s.card } : null;
}

/** 取下標籤上的卡 (第一張) */
export function uncardCommand(m: CardTrayModel): WorldCommand | null {
  const a = m.attached[0];
  return a ? { t: 'uncard', label: m.label, card: a.card } : null;
}

/**
 * 字卡匣關著時按了 1～3 / X (n = 第幾格；0 = 取下；沒按 → null)：
 * open = 2D 站在標籤前、沒有別的互動目標 → 等同按 E 打開 (缺卡 / 缺筆尖照 E 的說明)，打開後補做這一下；
 * howto = 不在標籤前、但房裡有標籤 → 說明怎麼打開 (房裡沒有標籤 = 這些鍵沒有用途，不出聲)
 */
export function closedTrayKey(w: World, pressed: readonly InputAction[]): { n: number; open: boolean; howto: boolean } | null {
  const slot = (['slot1', 'slot2', 'slot3'] as const).findIndex(a => pressed.includes(a));
  const n = slot >= 0 ? slot + 1 : pressed.includes('uncard') ? 0 : null;
  if (n === null) return null;
  const open = !!labelTarget(w) && !findTarget(w);
  return { n, open, howto: !open && w.objs.some(o => !!o.def.label) };
}
