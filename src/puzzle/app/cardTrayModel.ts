// 字卡匣的資料推導 (純函式，Node 可測；ui/cardTray.ts 只負責畫)：architecture 4.17、mobile-controls 2.5
import type { ObjState, World } from '../core/types';
import type { WorldCommand } from '../core/actions';
import type { Text } from '../text/text';
import { attachedCards, cardsOn, CARDS, labelTarget, TRAY_SLOTS, trayCards, writableTarget, type CardDef } from '../mechanics/labels';
import { findTarget } from '../core/interact';
import type { InputAction } from '../input/types';
import { WORD_KEYS } from '../mechanics/cube';
import { blankTextKey, leverWord } from '../mechanics/labels';
import type { CardTrayModel } from '../ui/cardTray';

export type { CardTrayModel } from '../ui/cardTray';

/** 字卡匣裡顯示的標籤訊息 (寫上 / 取下 / 無效 / 沒有筆尖) */
const LABEL_MSGS: ReadonlySet<string> = new Set(['msg.label.written', 'msg.label.removed', 'msg.label.invalid', 'msg.label.noNib', 'msg.scale.da', 'msg.scale.xiao', 'msg.scale.removed', 'msg.scale.noRoom']);

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
    // v0.4 第五章 5-2 換讀法：此刻的讀法 (blankTextKey)
    const key = blankTextKey(w, o);
    const fill = (c: string) => (key ? text(key, { c }) : c);
    return { now: fill(card ? cardGlyph(text, card) : text('ui.label.blank')), base: fill(text('ui.label.blank')) };
  }
  const t = l.textKey ? text(l.textKey) : '';
  // 名詞 + 尺度卡 (N23)：卡面的字貼在名詞前 (「大陶盆」)
  if (l.kind === 'noun' && l.scale) {
    const card = cardsOn(w, l.id).find(c => CARDS[c]?.slot === 'scale');
    return { now: card ? cardGlyph(text, card) + t : t, base: t };
  }
  if (l.kind === 'strip') return { now: text(o.used && l.stripped ? l.stripped : l.textKey ?? ''), base: t };
  if (l.kind === 'plate') {
    // 門牌 (2-3a)：原字「門」；貼了收的部件卡 = forms 裡的字 (「間」)
    const form = cardsOn(w, l.id).map(c => l.forms?.[c]).find(k => k !== undefined);
    return { now: form ? text(form) : t, base: t };
  }
  return { now: t, base: t };
}

/** 標籤在提示 / 卡匣標題上的名稱 (拉桿：「拉桿：左」；名詞：「大衣」) */
export function labelTitle(w: World, text: Text, o: ObjState): string {
  const g = labelGlyph(w, text, o);
  return o.def.label?.kind === 'dir' ? text('ui.label.dir', { name: text('term.lever'), word: g.now }) : g.now;
}

/** v0.4 H1 字卡匣的頁 (CardDef.slot 分組；mobile-controls 2.5)：依此順序 */
export type TrayTab = CardDef['slot'];
export const TRAY_TABS: readonly TrayTab[] = ['word', 'part', 'scale'];
const TAB_KEYS: Readonly<Record<TrayTab, string>> = { word: 'ui.cards.tab.word', part: 'ui.cards.tab.part', scale: 'ui.cards.tab.scale' };

/** 這個標籤收的那一組 (只依組別、不依答案)：方槽 → 尺度卡；門牌 / 拆字 → 部件卡；字謎空格 / 方向字 → 詞卡；其餘 (例：沒有方槽的名詞) = null */
export function labelTab(o: ObjState): TrayTab | null {
  const l = o.def.label;
  if (!l) return null;
  if (l.kind === 'noun') return l.scale ? 'scale' : null;
  if (l.kind === 'plate' || l.kind === 'strip') return 'part';
  return 'word';
}

/**
 * 字卡匣 (開著的對象 = 此刻 2D 範圍內可寫的標籤；離開 / 切回實景 → null，外殼關掉卡匣)：
 * 卡匣格 TRAY_SLOTS 格 (本頁持有的卡依序放，其餘空著)、標籤上貼著的卡、尺度卡槽 (只鋪陳)；
 * v0.4 H1 分頁：tabs = 持有或貼著的卡出現過的組 (TRAY_TABS 順序)；tab = 指定的頁 (不在 tabs 裡 / 沒給 = 這個標籤收的那一組；
 * 那一組沒有卡 (手上與這個標籤上都沒有) → 第一個有卡的組)
 */
export function deriveCardTray(w: World, text: Text, feedbackSeq: number, tab?: TrayTab): CardTrayModel | null {
  const t = writableTarget(w);
  if (!t || !t.def.label) return null;
  const all = trayCards(w);
  const id = t.def.label.id;
  const g = labelGlyph(w, text, t);
  const slotOf = (c: string): TrayTab | undefined => CARDS[c]?.slot;
  const placed = [...Object.values(w.ext.labels ?? {}).flat(), ...attachedCards(w, t)];
  const tabs = TRAY_TABS.filter(k => [...all, ...placed].some(c => slotOf(c) === k));
  const has = (k: TrayTab): boolean => all.some(c => slotOf(c) === k) || attachedCards(w, t).some(c => slotOf(c) === k);
  const own = labelTab(t);
  const fallback = own !== null && has(own) ? own : tabs.find(has) ?? tabs[0] ?? 'word';
  const active = tab !== undefined && tabs.includes(tab) ? tab : fallback;
  const held = all.filter(c => slotOf(c) === active);
  const howto = ['ui.cards.howto.paste', 'ui.cards.howto.remove', ...(tabs.length > 1 ? ['ui.cards.howto.tab'] : []), 'ui.cards.howto.close'];
  return {
    tabs,
    tab: active,
    label: id,
    title: labelTitle(w, text, t),
    glyph: g.now,
    base: g.base,
    covered: g.now !== g.base || attachedCards(w, t).length > 0,
    scale: !!t.def.label.scale,
    slots: Array.from({ length: TRAY_SLOTS }, (_, i) => {
      const card = held[i] ?? null;
      return card ? { card, glyph: cardGlyph(text, card), name: cardName(text, card), key: String(i + 1) } : { card: null, glyph: '', name: text('ui.cards.empty'), key: String(i + 1) };
    }),
    attached: attachedCards(w, t).map(card => ({ card, glyph: cardGlyph(text, card), name: cardName(text, card) })),
    message: LABEL_MSGS.has(w.msgKey) || w.msgKey === t.def.label.flip?.wrongText ? w.msg : '',
    feedbackSeq,
    text: {
      head: text('ui.cards.head', { title: labelTitle(w, text, t) }), close: text('ui.cards.close'),
      remove: text('ui.cards.remove', { word: attachedCards(w, t)[0] ? cardGlyph(text, attachedCards(w, t)[0]) : '' }), howto: howto.map(k => text(k)), scale: text('ui.cards.scale'),
      tabs: Object.fromEntries(tabs.map(k => [k, text(TAB_KEYS[k])]))
    }
  };
}

/** 換頁 (← = −1 / → = +1；循環)：只有一組 = 不換 */
export function shiftTab(m: CardTrayModel, dir: -1 | 1): TrayTab {
  const i = m.tabs.indexOf(m.tab);
  return m.tabs.length > 1 ? m.tabs[(i + dir + m.tabs.length) % m.tabs.length] : m.tab;
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
