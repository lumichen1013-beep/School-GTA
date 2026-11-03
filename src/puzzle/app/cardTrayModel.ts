// 字卡匣的資料推導 (純函式，Node 可測；ui/cardTray.ts 只負責畫)：architecture 4.17、mobile-controls 2.5
import type { ObjState, World } from '../core/types';
import type { WorldCommand } from '../core/actions';
import type { Text } from '../text/text';
import { cardsOn, CARDS, TRAY_SLOTS, trayCards, writableTarget } from '../mechanics/labels';
import { WORD_KEYS } from '../mechanics/cube';
import { leverWord } from '../mechanics/labels';
import type { CardTrayModel } from '../ui/cardTray';

export type { CardTrayModel } from '../ui/cardTray';

/** 字卡匣裡顯示的標籤訊息 (寫上 / 取下 / 無效 / 沒有筆尖) */
const LABEL_MSGS: ReadonlySet<string> = new Set(['msg.label.written', 'msg.label.removed', 'msg.label.invalid', 'msg.label.noNib']);

/** 詞卡的字 (卡面大字) 與名稱 (例：右 / 詞卡「右」) */
const cardGlyph = (text: Text, card: string): string => { const d = CARDS[card]?.dir; return d ? text(WORD_KEYS[d]) : card; };
const cardName = (text: Text, card: string): string => text(`term.${card}`);

/** 標籤此刻的字 (拉桿：方向字 / 名詞：textKey) 與原字 */
export function labelGlyph(w: World, text: Text, o: ObjState): { now: string; base: string } {
  const l = o.def.label;
  if (!l) return { now: '', base: '' };
  if (l.kind === 'dir' && o.def.type === 'lever') return { now: text(WORD_KEYS[leverWord(w, o)]), base: text(WORD_KEYS[o.def.word]) };
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
      remove: text('ui.cards.remove', { word: cardsOn(w, id)[0] ? cardGlyph(text, cardsOn(w, id)[0]) : '' }), hint: text('ui.cards.hint'), scale: text('ui.cards.scale')
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
