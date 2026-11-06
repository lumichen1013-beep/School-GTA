// N22 標籤與字卡 (寫；v0.3 最小版：詞卡 + 方向字；architecture 4.17、規格 4 N22 / 5.4.5)
// 可寫的物件在藏寶圖 (2D) 畫出標籤；2D 站穩、範圍內按 E → 外殼開字卡匣 (labelOpen 事件)；
// 字卡匣選卡 → WorldCommand {t:'card'} → 這裡驗證 (2D、站穩、範圍內、有筆尖、持有卡片、詞典有效) → 貼上 / 回饋
import type { Mechanic } from '../core/registry';
import type { WorldCommand } from '../core/actions';
import type { ItemId, ObjId, ObjState, TextKey, World } from '../core/types';
import { INTERACT_RANGE, PLAYER_H } from '../core/constants';
import { distanceTo } from '../core/interact';
import { isActiveIn } from '../core/presence';
import { addItem, hasItem, say } from '../core/world';
import { LEVER_WORDS, type LeverWord } from './cube';
import { SCALE_CARDS, SCALE_GLYPHS, canResize, rescale } from './scale';
import { selfGrowOk } from './attic';

declare module '../core/types' {
  interface ObjBase {
    /**
     * 標籤 (只在 2D 看得到、寫得到)：id = 章節內唯一的標籤 id (存在 ChapterState.labels)；
     * kind 'dir' = 方向字 (原字 = 拉桿的 word)；'noun' = 名詞 (原字 = textKey，例「大衣」)；scale = 旁邊有尺度卡的方槽
     * (v0.4 第三章：名詞標籤 + scale 收尺度卡「大」「小」→ 物件縮放，mechanics/scale；第一章只鋪陳)；
     * noCardText = 這是謎題要寫的標籤：字卡匣空著時 2D 照樣提示「寫」，按 E 說缺什麼、去哪裡找 (沒有 → 空匣時 E 照舊「看得見，卻碰不到」)；
     * v0.4 'blank' = 字謎的空格 (P18；2-2b 下聯)：textKey 含 {c} (空格處)；answers = 詞典 (收的詞卡，D14 列同義字)；
     * 貼上收的卡 → 物件 used (doneFlag 成立 → done 事件)、opens 指向的物件 used、取得 reward、說 solvedText (只在第一次)；
     * v0.4 'plate' = 門牌 (規格「門牌「間」」)：textKey = 原字「門」；answers = 收的部件卡；forms[卡] = 貼上後的字 (「間」)；
     * 寫成 = 同 blank (第一次 used / done / solvedText)；門接到哪由章節層依標籤上的卡決定 (core/chapter activePlates)；
     * v0.4 'strip' = 拆字 (2-4c)：textKey = 原字「閉」；part = 原本就貼在上面的部件 (「才」，物件 used 前算貼著)；取下 part →
     * 物件 used、opens / reward / solvedText / done、part 進字卡匣；之後的字 = stripped (「門」)；拆過不收任何卡；
     * v0.4 after = 這個物件 used 之後標籤才看得到 (3-1b：花架門關著時，藏寶圖上的樹根被花架蓋住、標籤不在)
     */
    label?: {
      id: string; kind: 'dir' | 'noun' | 'blank' | 'plate' | 'strip'; textKey?: TextKey; scale?: boolean; noCardText?: TextKey;
      answers?: readonly ItemId[]; reward?: ItemId; solvedText?: TextKey; forms?: Readonly<Record<ItemId, TextKey>>;
      part?: ItemId; stripped?: TextKey; after?: ObjId;
      /** v0.4 純呈現：2D 標籤徽章往上抬的高度 (世界單位；3-3 苗圃的 potS 與 3-1 東盆在藏寶圖裡只隔 0.5，徽章錯開) */
      tagLift?: number;
      /**
       * v0.4 第五章 5-1 玩家自己的標籤「你」(mechanics/attic 的 selfTag 跟著玩家走)：只收 answers 的尺度卡；範圍內有別的標籤時讓位
       * (最低優先)；縮小時搆不到高處的標籤 (mechanics/attic 的 outOfReach)；站在縮影裡取不下「小」
       */
      self?: boolean;
      /** v0.4 第五章 5-1 不收任何尺度卡 (方槽照畫；貼上 = 說這句、卡片退回；例：把縮影本身標「小」) */
      refuse?: TextKey;
    };
  }
}

/** 寫的能力 (1-2a 筆尖) */
export const WRITE_ABILITY: ItemId = 'nib';

/** 能不能寫字：持有筆尖 (第一章道具)，或開場能力有筆尖 (第二章起：章節道具欄從空的開始，筆尖是存檔的能力) */
export const canWrite = (w: World): boolean => hasItem(w, WRITE_ABILITY) || w.abilities.includes('nib');

/**
 * 字卡 (詞典最小版)：物品 id `card.<字>` = 詞卡；dir = 貼在方向字標籤上時的新方向 (第一章)；
 * glyph = 卡面的字 (文字 key；v0.4 第二章的字謎詞卡，例「內」)
 */
export interface CardDef { slot: 'word' | 'part' | 'scale'; dir?: LeverWord; glyph?: TextKey }
/** 第二章字謎的詞卡 (2-2b：外 / 內 / 前；裡 / 邊 = 詞典先列的同義字，本章目前沒有卡) */
const WORD_CARDS: Readonly<Record<string, TextKey>> = {
  wai: 'term.glyph.wai', nei: 'term.glyph.nei', qian: 'term.glyph.qian', li: 'term.glyph.li', bian: 'term.glyph.bian'
};
/** 部件卡 (門牌「門」+「日」=「間」；「才」=「閉」) */
const PART_CARDS: Readonly<Record<string, TextKey>> = { ri: 'term.glyph.ri', cai: 'term.glyph.cai' };
export const CARDS: Readonly<Record<ItemId, CardDef>> = Object.fromEntries([
  ...LEVER_WORDS.map(w => [`card.${w}`, { slot: 'word', dir: w } as CardDef]),
  ...Object.entries(WORD_CARDS).map(([w, glyph]) => [`card.${w}`, { slot: 'word', glyph } as CardDef]),
  // v0.4 部件卡 (活字的一個部件；2-3a 日、2-4c 才)
  ...Object.entries(PART_CARDS).map(([w, glyph]) => [`card.${w}`, { slot: 'part', glyph } as CardDef]),
  // v0.4 第三章 尺度卡 (3-1 建築比例尺：大 / 小；只貼在有方槽的名詞標籤上)
  ...Object.keys(SCALE_CARDS).map(id => [id, { slot: 'scale', glyph: SCALE_GLYPHS[id] } as CardDef])
]);
export const isCard = (id: string): boolean => id in CARDS;
/** 字卡匣的格數 (第一章：詞卡一格、第三格空著，鋪陳尺度卡；第三章：尺度卡「大」「小」) */
export const TRAY_SLOTS = 3;

/** 標籤上貼著的字卡 */
export const cardsOn = (w: World, label: string): readonly string[] => w.ext.labels?.[label] ?? [];

/** 物件標籤此刻貼著的卡：拆字標籤還沒拆 = 原本的部件；其餘 = cardsOn */
export const attachedCards = (w: World, o: ObjState): readonly string[] => {
  const l = o.def.label;
  if (!l) return [];
  if (l.kind === 'strip') return !o.used && l.part ? [l.part] : [];
  return cardsOn(w, l.id);
};

/** 詞典：這張卡貼在這個標籤上是否成立 (方向字 + 方向詞卡 = 新方向；字謎空格 + 詞典收的卡 = 成字；名詞配詞卡 = 不成字) */
export function accepts(o: ObjState, card: string): boolean {
  const c = CARDS[card];
  const l = o.def.label;
  if (!c || !l) return false;
  if (l.kind === 'blank' || l.kind === 'plate') return (l.answers ?? []).includes(card);
  // 尺度卡只收在有方槽的名詞標籤上 (其他標籤貼尺度卡 = 無效字；有方槽的標籤貼詞卡 = 無效字)；v0.4 第五章 方槽有 answers = 只收這幾張
  if (c.slot === 'scale') return l.kind === 'noun' && !!l.scale && (!l.answers || l.answers.includes(card));
  if (c.slot !== 'word') return false;
  return l.kind === 'dir' && c.dir !== undefined;
}

/** 字謎空格寫對了：物件 used (doneFlag → done)、opens 指向的物件 used、reward、solvedText (已解開過 → 只換卡，不再給) */
function solveBlank(w: World, o: ObjState): boolean {
  const l = o.def.label;
  if ((l?.kind !== 'blank' && l?.kind !== 'plate') || o.used) return false;
  o.used = true;
  const target = o.def.opens ? w.byId.get(o.def.opens) : undefined;
  if (target) target.used = true;
  if (l.reward) addItem(w, l.reward, 1);
  if (l.solvedText) say(w, l.solvedText);
  if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
  return true;
}

/** 拉桿此刻的方向字：標籤上貼了詞卡 → 詞卡的字；否則原字 (規格 5.4.5「用詞卡蓋掉原字即改變轉向；取下原字恢復」) */
export function leverWord(w: World, o: ObjState): LeverWord {
  const base: LeverWord = o.def.type === 'lever' ? o.def.word : 'up';
  const id = o.def.label?.id;
  if (!id) return base;
  for (const c of cardsOn(w, id)) { const d = CARDS[c]?.dir; if (d) return d; }
  return base;
}

/** 標籤此刻看不到 (label.after 指向的物件還沒 used) */
export const labelCovered = (w: World, o: ObjState): boolean => {
  const after = o.def.label?.after;
  return after !== undefined && !w.byId.get(after)?.used;
};

/** 2D、站穩時範圍內最近、有標籤的物件 (C9 同規則：空中不能寫；3D 看不到標籤；被蓋住的標籤不算) */
export function labelTarget(w: World): ObjState | null {
  const p = w.player;
  if (p.mode !== '2d' || !p.onGround) return null;
  let best: ObjState | null = null;
  let self: ObjState | null = null;
  let bd = INTERACT_RANGE;
  for (const o of w.objs) {
    if (!o.def.label || !isActiveIn(w, o, '2d') || labelCovered(w, o)) continue;
    // v0.4 第五章 5-1：自己的標籤「你」最低優先 (範圍內有別的標籤 → 讓位)；縮小時搆不到的標籤不算
    if (o.def.label.self) { self = o; continue; }
    if (outOfReach(w, o)) continue;
    const d = distanceTo(w, o);
    if (d <= bd) { bd = d; best = o; }
  }
  // 在縮影裡：外面的標籤都不算 (只剩自己的標籤；「這裡太窄，變不回去」)
  if (w.ext.mini && self) return self;
  return best ?? (self && !reachBlocked(w) ? self : null);
}

/** v0.4 第五章 5-1 縮小 (Player.scale < 1) 時搆不到的標籤：標籤物件的底比你的頭頂高 0.3 以上 (桌上的齒輪、縮影) */
export function outOfReach(w: World, o: ObjState): boolean {
  const k = w.player.scale ?? 1;
  return k < 1 && !o.def.label?.self && o.y > w.player.y + PLAYER_H * k + 0.3;
}

/** 縮小時範圍內有搆不到的標籤 (按 E = 「太小了，搆不到」；自己的標籤也先讓位，離開桌邊才打得開) */
function reachBlocked(w: World): boolean {
  return w.objs.some(o => !!o.def.label && !o.def.label.self && isActiveIn(w, o, '2d') && !labelCovered(w, o) && outOfReach(w, o) && distanceTo(w, o) <= INTERACT_RANGE);
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
  if (!canWrite(w)) { say(w, 'msg.label.noNib'); return; }
  if (!hasItem(w, cmd.card)) return;
  if (!accepts(o, cmd.card)) {
    // 無效字：不生效、卡片留在匣裡 (規格 D15：字顫動、墨色變淡、輕音效由 UI / 呈現層播)
    say(w, 'msg.label.invalid');
    w.events.push({ t: 'card', label: cmd.label, ok: false });
    return;
  }
  const sized = CARDS[cmd.card].slot === 'scale';
  // v0.4 第五章 不收尺度卡的方槽 (縮影本身)：說明、卡片退回
  if (sized && o.def.label?.refuse) {
    say(w, o.def.label.refuse);
    w.events.push({ t: 'card', label: cmd.label, ok: false });
    return;
  }
  // 量 (N23)：放大前卡牆檢查——放不下 → 卡片退回 (同無效字的回饋)
  if (sized && !o.def.label?.self && !canResize(w, o, SCALE_CARDS[cmd.card])) {
    say(w, 'msg.scale.noRoom');
    w.events.push({ t: 'card', label: cmd.label, ok: false });
    return;
  }
  // 每張卡同時只貼一處 (從匣裡拿出來)；同一個字槽已有卡 → 換下來放回匣裡
  for (const old of cardsOn(w, cmd.label)) addItem(w, old, 1);
  addItem(w, cmd.card, -1);
  setCards(w, cmd.label, [cmd.card]);
  if (sized && o.def.label?.self) say(w, 'msg.scale.self');
  else if (sized) { rescale(w); say(w, SCALE_CARDS[cmd.card] > 1 ? 'msg.scale.da' : 'msg.scale.xiao'); }
  else if (!solveBlank(w, o)) say(w, 'msg.label.written');
  w.events.push({ t: 'card', label: cmd.label, ok: true });
}

/** 拆字 (2-4c)：取下原本的部件 → 物件 used、opens 的物件 used、取得部件與 reward、solvedText、done */
function strip(w: World, o: ObjState, card: string): void {
  const l = o.def.label;
  if (l?.kind !== 'strip' || o.used || card !== l.part) return;
  o.used = true;
  addItem(w, card, 1);
  const target = o.def.opens ? w.byId.get(o.def.opens) : undefined;
  if (target) target.used = true;
  if (l.reward) addItem(w, l.reward, 1);
  say(w, l.solvedText ?? 'msg.label.removed');
  if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
  w.events.push({ t: 'card', label: l.id, ok: true });
}

function uncard(w: World, cmd: Extract<WorldCommand, { t: 'uncard' }>): void {
  const o = targetFor(w, cmd.label);
  if (!o) return;
  if (o.def.label?.kind === 'strip') { strip(w, o, cmd.card); return; }
  const cur = cardsOn(w, cmd.label);
  if (!cur.includes(cmd.card)) return;
  const sized = CARDS[cmd.card]?.slot === 'scale';
  // v0.4 第五章 自己的「小」：站在縮影裡 / 長回去會撞到東西 → 取不下 (mechanics/attic selfGrowOk)
  if (sized && o.def.label?.self && !selfGrowOk(w)) {
    say(w, 'msg.scale.tooTight');
    w.events.push({ t: 'card', label: cmd.label, ok: false });
    return;
  }
  // 取下「小」= 長回原尺寸：同樣要放得下 (放不下 → 卡片留在標籤上)
  if (sized && !o.def.label?.self && !canResize(w, o, 1)) {
    say(w, 'msg.scale.noRoom');
    w.events.push({ t: 'card', label: cmd.label, ok: false });
    return;
  }
  setCards(w, cmd.label, cur.filter(c => c !== cmd.card));
  addItem(w, cmd.card, 1);
  if (sized) rescale(w);
  say(w, sized ? (o.def.label?.self ? 'msg.scale.selfBack' : 'msg.scale.removed') : 'msg.label.removed');
  w.events.push({ t: 'card', label: cmd.label, ok: true });
}

/**
 * 此刻按 E 會打開字卡匣的標籤：範圍內有標籤，且匣裡有卡或這個標籤上貼著卡 (什麼都沒得貼 / 取 → null，
 * E 照舊說「看得見，卻碰不到」)；HUD 的「寫」提示也用它
 */
export function writableTarget(w: World): ObjState | null {
  const t = labelTarget(w);
  if (!t) return null;
  const held = trayCards(w);
  if (attachedCards(w, t).length > 0) return t;
  // v0.4 H1：要量的謎題標籤 (方槽 + noCardText) 在匣裡沒有尺度卡時 = 缺卡 (第二章回來前：手上只有詞卡 / 部件卡，打開匣也沒有一張貼得上)
  // v0.4 第五章：方槽有 answers (齒輪只收「小」) → 匣裡沒有它收的卡 = 缺卡 (手上只剩「大」，「小」貼在自己身上)
  if (t.def.label?.scale && t.def.label.noCardText && !held.some(c => CARDS[c].slot === 'scale' && accepts(t, c))) return null;
  return held.length > 0 ? t : null;
}

/**
 * 2D 範圍內、匣裡沒有卡可貼的謎題標籤 (有 noCardText)：HUD 照樣提示「寫」，按 E 說明缺卡
 * (卡貼在別的標籤上 → 說卡在哪裡；否則 noCardText 指路)
 */
export function missingCardTarget(w: World): ObjState | null {
  const t = labelTarget(w);
  return t?.def.label?.noCardText && !writableTarget(w) ? t : null;
}

/** HUD 的「寫」提示對象：可寫的標籤，或缺卡的謎題標籤 */
export const promptLabelTarget = (w: World): ObjState | null => writableTarget(w) ?? missingCardTarget(w);

/** 缺卡時按 E 的說明 */
function sayMissingCard(w: World, t: ObjState): void {
  // 貼在別處、而且這個標籤收得下的卡 (v0.4 H1：門牌上的「日」不是書櫃方槽要的卡)
  const away = Object.values(w.ext.labels ?? {}).flat().find(c => isCard(c) && accepts(t, c));
  if (away) say(w, 'msg.label.cardElsewhere', { card: w.rt.text(`term.${away}`) });
  else say(w, t.def.label!.noCardText!);
}

/** N22：2D 對標籤按 E → labelOpen (沒有筆尖：說明寫不上去；謎題標籤缺卡：說明缺什麼)；貼卡 / 取卡指令 */
export const labels: Mechanic = {
  id: 'labels',
  interactFallback: w => {
    // v0.4 第五章 5-1 縮小時，範圍內的標籤都在桌上 (搆不到)、而且沒有搆得到的 → 說明
    if (w.player.mode === '2d' && w.player.onGround && !labelTarget(w) && reachBlocked(w)) { say(w, 'msg.scale.tooSmall'); return true; }
    const miss = missingCardTarget(w);
    if (miss) { sayMissingCard(w, miss); return true; }
    const t = writableTarget(w);
    if (!t) return false;
    if (!canWrite(w)) { say(w, 'msg.label.noNib'); return true; }
    w.events.push({ t: 'labelOpen', label: t.def.label!.id, obj: t.def.id });
    return true;
  },
  command: (w, cmd) => {
    if (cmd.t === 'card') card(w, cmd);
    else if (cmd.t === 'uncard') uncard(w, cmd);
    else return false;
    return true;
  }
};
