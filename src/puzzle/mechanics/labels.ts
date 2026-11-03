// N22 標籤與字卡 (寫；v0.3 最小版：詞卡 + 方向字；architecture 4.17、規格 4 N22 / 5.4.5)
// 可寫的物件在藏寶圖 (2D) 畫出標籤；2D 站穩、範圍內按 E → 外殼開字卡匣 (labelOpen 事件)；
// 字卡匣選卡 → WorldCommand {t:'card'} → 這裡驗證 (2D、站穩、範圍內、有筆尖、持有卡片、詞典有效) → 貼上 / 回饋
import type { Mechanic } from '../core/registry';
import type { WorldCommand } from '../core/actions';
import type { ItemId, ObjState, TextKey, World } from '../core/types';
import { INTERACT_RANGE } from '../core/constants';
import { distanceTo } from '../core/interact';
import { isActiveIn } from '../core/presence';
import { addItem, hasItem, say } from '../core/world';
import { LEVER_WORDS, type LeverWord } from './cube';

declare module '../core/types' {
  interface ObjBase {
    /**
     * 標籤 (只在 2D 看得到、寫得到)：id = 章節內唯一的標籤 id (存在 ChapterState.labels)；
     * kind 'dir' = 方向字 (原字 = 拉桿的 word)；'noun' = 名詞 (原字 = textKey，例「大衣」)；scale = 旁邊有空的尺度卡槽 (只鋪陳)
     */
    label?: { id: string; kind: 'dir' | 'noun'; textKey?: TextKey; scale?: boolean };
  }
}

/** 寫的能力 (1-2a 筆尖) */
export const WRITE_ABILITY: ItemId = 'nib';

/** 字卡 (詞典最小版)：物品 id `card.<方向字>` = 詞卡；dir = 貼在方向字標籤上時的新方向 */
export interface CardDef { slot: 'word'; dir?: LeverWord }
export const CARDS: Readonly<Record<ItemId, CardDef>> = Object.fromEntries(LEVER_WORDS.map(w => [`card.${w}`, { slot: 'word', dir: w }]));
export const isCard = (id: string): boolean => id in CARDS;
/** 字卡匣的格數 (第一章：詞卡一格、第三格空著，鋪陳尺度卡) */
export const TRAY_SLOTS = 3;

/** 標籤上貼著的字卡 */
export const cardsOn = (w: World, label: string): readonly string[] => w.ext.labels?.[label] ?? [];

/** 詞典：這張卡貼在這個標籤上是否成立 (方向字 + 詞卡 = 新方向；名詞配詞卡 = 不成字) */
export function accepts(o: ObjState, card: string): boolean {
  const c = CARDS[card];
  return !!c && o.def.label?.kind === 'dir' && c.slot === 'word' && c.dir !== undefined;
}

/** 拉桿此刻的方向字：標籤上貼了詞卡 → 詞卡的字；否則原字 (規格 5.4.5「用詞卡蓋掉原字即改變轉向；取下原字恢復」) */
export function leverWord(w: World, o: ObjState): LeverWord {
  const base: LeverWord = o.def.type === 'lever' ? o.def.word : 'up';
  const id = o.def.label?.id;
  if (!id) return base;
  for (const c of cardsOn(w, id)) { const d = CARDS[c]?.dir; if (d) return d; }
  return base;
}

/** 2D、站穩時範圍內最近、有標籤的物件 (C9 同規則：空中不能寫；3D 看不到標籤) */
export function labelTarget(w: World): ObjState | null {
  const p = w.player;
  if (p.mode !== '2d' || !p.onGround) return null;
  let best: ObjState | null = null;
  let bd = INTERACT_RANGE;
  for (const o of w.objs) {
    if (!o.def.label || !isActiveIn(w, o, '2d')) continue;
    const d = distanceTo(w, o);
    if (d <= bd) { bd = d; best = o; }
  }
  return best;
}

/** 字卡匣裡的卡 (持有的字卡，依 id 排序；貼出去的不在匣裡) */
export const trayCards = (w: World): string[] => Object.keys(w.inv).filter(id => isCard(id) && hasItem(w, id)).sort();

function setCards(w: World, label: string, cards: string[]): void {
  const next = { ...(w.ext.labels ?? {}) };
  if (cards.length) next[label] = cards; else delete next[label];
  w.ext = { ...w.ext, labels: next };
}

/** 指令的對象：必須就是此刻 2D 範圍內的那個標籤 (UI 開著卡匣時走開 / 切回實景 → 指令無效) */
function targetFor(w: World, label: string): ObjState | null {
  const t = labelTarget(w);
  return t && t.def.label?.id === label ? t : null;
}

function card(w: World, cmd: Extract<WorldCommand, { t: 'card' }>): void {
  const o = targetFor(w, cmd.label);
  if (!o) return;
  if (!hasItem(w, WRITE_ABILITY)) { say(w, 'msg.label.noNib'); return; }
  if (!hasItem(w, cmd.card)) return;
  if (!accepts(o, cmd.card)) {
    // 無效字：不生效、卡片留在匣裡 (規格 D15：字顫動、墨色變淡、輕音效由 UI / 呈現層播)
    say(w, 'msg.label.invalid');
    w.events.push({ t: 'card', label: cmd.label, ok: false });
    return;
  }
  // 每張卡同時只貼一處 (從匣裡拿出來)；同一個字槽已有卡 → 換下來放回匣裡
  for (const old of cardsOn(w, cmd.label)) addItem(w, old, 1);
  addItem(w, cmd.card, -1);
  setCards(w, cmd.label, [cmd.card]);
  say(w, 'msg.label.written');
  w.events.push({ t: 'card', label: cmd.label, ok: true });
}

function uncard(w: World, cmd: Extract<WorldCommand, { t: 'uncard' }>): void {
  if (!targetFor(w, cmd.label)) return;
  const cur = cardsOn(w, cmd.label);
  if (!cur.includes(cmd.card)) return;
  setCards(w, cmd.label, cur.filter(c => c !== cmd.card));
  addItem(w, cmd.card, 1);
  say(w, 'msg.label.removed');
  w.events.push({ t: 'card', label: cmd.label, ok: true });
}

/**
 * 此刻按 E 會打開字卡匣的標籤：範圍內有標籤，且匣裡有卡或這個標籤上貼著卡 (什麼都沒得貼 / 取 → null，
 * E 照舊說「看得見，卻碰不到」)；HUD 的「寫」提示也用它
 */
export function writableTarget(w: World): ObjState | null {
  const t = labelTarget(w);
  if (!t) return null;
  return trayCards(w).length > 0 || cardsOn(w, t.def.label!.id).length > 0 ? t : null;
}

/** N22：2D 對標籤按 E → labelOpen (沒有筆尖：說明寫不上去)；貼卡 / 取卡指令 */
export const labels: Mechanic = {
  id: 'labels',
  interactFallback: w => {
    const t = writableTarget(w);
    if (!t) return false;
    if (!hasItem(w, WRITE_ABILITY)) { say(w, 'msg.label.noNib'); return true; }
    w.events.push({ t: 'labelOpen', label: t.def.label!.id, obj: t.def.id });
    return true;
  },
  command: (w, cmd) => {
    if (cmd.t === 'card') card(w, cmd); else uncard(w, cmd);
    return true;
  }
};
