// 展開圖疊層 (v0.3；規格 5.4.1、mobile-controls 2.5)：半透明紙卡蓋住畫面上方 60% (橫屏) / 50% (直屏)，Canvas 2D 繪製；
// 只畫 app/cubeMapModel 推導好的資料，不改世界。「圖」鍵 (≥ 56 px) 給觸控用，2D 且在魔方上才出現
import type { DoorKind, FrameKind, Side } from '../core/cube';
import type { Text } from '../text/text';

export type MapLink = 'room' | 'wall' | 'frame';
/** piece = 這間房地板上畫的圖的一角 (2-4a；整張圖的折線與這一角的格) */
/** short = 格子小時改寫的短名 (v0.4 第四章；沒給 = name)；corridor = 第五章的走廊格 (梁上走道：畫成木梁，beam = 連到哪幾側的鄰格，世界方位) */
export interface MapCell { x: number; y: number; kind: 'room' | 'empty' | 'solid' | 'corridor'; room: string | null; name: string; short?: string; current: boolean; piece?: { px: number; py: number; drawing: string }; beam?: Side[] }
/** via = 接通時通道的型別 (兩側較窄者；拱門對拱門才是 arch) */
export interface MapDoor { room: string; door: string; x: number; y: number; side: Side; kind: DoorKind; link: MapLink; via?: 'door' | 'arch' }
/** inCell = 寫在格內 (v0.4 第五章 三層並排：東 / 西兩側的屋框在層與層之間的空欄，寫在外面會壓到隔壁層) */
export interface MapFrame { x: number; y: number; side: Side; kind: FrameKind; name: string; inCell?: boolean }
export interface MapPreview {
  /** 說明列 (例：預覽：拉「上」之後) */
  caption: string;
  /** 轉不動 (預覽也照實顯示原因)；可轉時為 null */
  blocked: string | null;
  /** 被推動的房間：from → to (格位 x, y) */
  moved: { room: string; name: string; from: [number, number]; to: [number, number] } | null;
  /** 轉後的門 (只列出與現在不同的) */
  doors: MapDoor[];
}
/**
 * v0.4 第三章 光路圖層 (規格 6「3-2 玻璃長廊（細化）」、7.2)：座標 = 格單位 (格 (x, y) 的左上角 = (x, y))。
 * segs = 光路折線 (white = 天窗直射、還沒穿過任何房的那一段：點線；其餘 = 穿過玻璃的光：虛線 + 箭頭紋)；
 * stops = 光停下的地方 (wall = 撞上牆 / 空格 / 實心格：短橫槓；room = 停在房內：圓點)；glass = 窗記號 (房間那一側的邊)；prisms = 稜鏡記號 (兩側之間的角)
 */
export interface MapLight {
  segs: Array<{ x0: number; y0: number; x1: number; y1: number; white: boolean }>;
  stops: Array<{ x: number; y: number; kind: 'wall' | 'room'; side: Side }>;
  glass: Array<{ x: number; y: number; side: Side }>;
  prisms: Array<{ x: number; y: number; a: Side; b: Side }>;
}
/**
 * v0.4 第四章 墨流圖層 (規格 6「4-2 墨爐間（細化）」)：格單位座標。pipes = 每間房的一段管線 (從格中心到 a / b 兩側；U / D = 格內的小圓)，
 * lit = 墨此刻流過；stops = 墨停在牆外 (短橫槓)；sinks = 匯點 (lit = 收到墨：實心圓、沒有 = 空心圓)
 */
export interface MapInk {
  pipes: Array<{ x: number; y: number; a: Side; b: Side; lit: boolean }>;
  stops: Array<{ x: number; y: number; side: Side }>;
  sinks: Array<{ x: number; y: number; side: Side; lit: boolean }>;
}
/** 展開圖資料 (由 app/cubeMapModel 的 deriveCubeMap 產生；字串已解析) */
export interface CubeMapModel {
  title: string;
  cols: number;
  rows: number;
  cells: MapCell[];
  doors: MapDoor[];
  frames: MapFrame[];
  preview: MapPreview | null;
  /** 沒有預覽時的提示 (站到拉桿旁看預覽) */
  hint: string;
  /** white / stained = 光路圖例 (只有有彩繪玻璃的章節) */
  legend: { open: string; wall: string; arch: string; you: string; white?: string; stained?: string };
  /** v0.4 第三章：此刻的光路 (沒有彩繪玻璃的章節不給) */
  light?: MapLight;
  /** v0.4 第四章 墨流的管線圖層 (沒有管線的章節不給) */
  ink?: MapInk;
  /** v0.4 第四章 多層魔方：各層並排 (x = 起始欄、w = 欄數、name = 層名，畫在那一層上方)；單層不給 */
  layers?: Array<{ x: number; w: number; name: string }>;
  /** v0.4 控制盤章節：「轉」頁籤 (null = 本章不是控制盤章)；turn = 轉動模式中的資料 (deriveTurnMode) */
  tab?: { label: string; enabled: boolean; reason: string | null; active: boolean } | null;
  turn?: TurnModeModel | null;
}

// ── v0.4 轉動模式 (控制盤；規格 5.4.1、mobile-controls 2.5 / 3.3) ──

export type TurnDir = 1 | -1 | Side;
/** 一顆標頭箭頭 = 一組 + 一個方向 (列的左右端 ◀ ▶、行 ⇅ (兩列 = 對調) 或 ▲ ▼、層 / 切片 ↻ ↺)；at = 畫在展開圖哪一邊的第幾排 */
export interface TurnHeader {
  group: string;
  kind: 'row' | 'col' | 'slideCell' | 'layer' | 'slice' | 'spin';
  dir: TurnDir;
  state: 'ok' | 'locked' | 'jammed';
  /** cell = 滑動 (第三章)：畫在房間 (cell) 與 dir 那一側空格的交界上；ring = v0.4 第五章 星環盤 (轉動卡片上的列，ring 給位置) */
  at: { side: 'top' | 'bottom' | 'left' | 'right' | 'ring' | 'cell'; i: number };
  /** 滑動的標頭：房間此刻的格位 */
  cell?: { x: number; y: number };
  /** v0.4 第五章 星環盤的第幾列 (TurnModeModel.rings 的序號) 第幾顆；sub = 片名 (中 / 東…)；mark = 鎖住的記號 (星釘) */
  ring?: { row: number; col: number };
  sub?: string;
  mark?: string;
  glyph: string;
  /** 無障礙名稱 (含序號與方向) */
  label: string;
  selected: boolean;
}
/** 轉動預覽 (只算不寫)：轉後的格與門、哪些房間從哪格移到哪格 */
export interface TurnPreview {
  cells: MapCell[];
  doors: MapDoor[];
  moves: Array<{ room: string; name: string; from: [number, number]; to: [number, number] }>;
  /** 轉後的光路 (第三章；沒有彩繪玻璃的章節不給) */
  light?: MapLight;
  /** v0.4 第五章 被轉的那一片的格子 (三層並排的格座標；藍色虛線框) */
  slab?: Array<[number, number]>;
}
export interface TurnModeModel {
  headers: TurnHeader[];
  selected: { group: string; dir: TurnDir } | null;
  /** 選了可轉的組時的轉後樣子；轉不動 (blocked) 時為 null */
  preview: TurnPreview | null;
  ink: { left: number; max: number };
  canUndo: boolean;
  /** 選到的轉動若會被擋：原因代碼 (core DialBlock) 與訊息 (預覽時就顯示) */
  blocked: string | null;
  blockedText: string | null;
  /** 說明列 (沒選 = 怎麼操作；選了 = 預覽：第 1 列往右 (還沒轉) / 被擋的原因) */
  caption: string;
  text: { confirm: string; undo: string; exit: string; ink: string; keys: string };
  /** 滑動章節 (第三章)：此刻的格 (點格子選取用：房間 / 空格 / 實心)；列 / 行章節沒有 */
  cells?: MapCell[];
  /** v0.4 第五章 星環盤的列 (軸 / 原地轉)；標頭以 ring.row 對到這裡 */
  rings?: Array<{ name: string; kind: 'axis' | 'spin' }>;
}

const INK = '#3a2618';
const PAPER = '#fdf4e1';
const PAPER2 = '#f6e2c0';
const BLUE = '#3d63ff';
/** 光路：穿過玻璃的光 (琥珀) / 白光 (淡褐)；窗與稜鏡記號 (青綠) */
const LIGHT = '#c98a1a';
const LIGHT_WHITE = '#9c8f6c';
const GLASS_MARK = '#3e8a7a';
/** 第四章墨流：有墨的管線 (墨藍) / 樹根管線 (褐) */
const INK_LINE = '#2c3fb0';
const ROOT_LINE = 'rgba(110,80,50,0.55)';
/** 光路走的「車道」：格內偏右下 (不壓房名中心、不壓邊上的門與箭頭) */
const LANE = 0.72;
const DIR: Readonly<Record<Side, [number, number]>> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0], U: [0, 0], D: [0, 0] };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/** 轉動模式的點擊 (ui 只回呼，不改 session；app 交給 reduceTurnMode → ChapterCommand) */
export type TurnClick = { t: 'pick'; group: string; dir: TurnDir } | { t: 'cell'; x: number; y: number } | { t: 'confirm' } | { t: 'undo' } | { t: 'exit' };
export interface TurnHandlers { tab(): void; input(i: TurnClick): void }

/** 進入轉動模式後這段時間內「確認」無效 (從互動鍵連點穿透；mobile-controls 2.5) */
const CONFIRM_GUARD_MS = 300;
/** 標頭箭頭的邊長 (≥ 44 CSS px；mobile-controls 2.5) 與到格子的間距 */
const HEAD = 44;
const HEAD_GAP = 8;
/** 滑動箭頭的最小邊長 (格子小時縮小，避免同一個角上的箭頭互相重疊；觸控區由格子負責) 與點格子時算「點到箭頭」的距離 (格) */
const SLIDE_MIN = 28;
const SLIDE_REACH = 0.4;

const LOCK_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="3" y="7" width="10" height="7.5" rx="1.2" fill="currentColor"/></svg>';
const WEDGE_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 13 L14 13 L14 4 Z" fill="currentColor"/></svg>';
/** v0.4 第五章 星釘 (星環盤的鎖：與鎖頭、楔形形狀不同) */
const STAR_SVG = '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1 L9.8 6.2 L15 8 L9.8 9.8 L8 15 L6.2 9.8 L1 8 L6.2 6.2 Z" fill="currentColor"/></svg>';
const UNDO_SVG = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M7 4 L3 8 L7 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.5 8 H12 a4.5 4.5 0 0 1 0 9 H8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

export class CubeMapOverlay {
  private card = el('div', 'pz-map');
  private head = el('div', 'pz-map-head');
  private titleEl = el('span', 'pz-map-title');
  private inkEl = el('span', 'pz-map-ink');
  private tab = el('button', 'pz-map-tab');
  private body = el('div', 'pz-map-body');
  private stage = el('div', 'pz-map-stage');
  private canvas = el('canvas', 'pz-map-canvas');
  private heads = el('div', 'pz-turn-heads');
  private btns = el('div', 'pz-turn-btns');
  /** v0.4 第五章 星環盤 (切片 / 原地轉的鈕；轉動卡片上，畫布與確認鈕之間) */
  private rings = el('div', 'pz-turn-rings');
  private exitBtn = el('button', 'pz-turn-btn exit');
  private undoBtn = el('button', 'pz-turn-btn undo');
  private okBtn = el('button', 'pz-turn-btn ok');
  private caption = el('div', 'pz-map-caption');
  private keys = el('div', 'pz-map-keys');
  private legend = el('div', 'pz-map-legend');
  private btn = el('button', 'pz-map-btn');
  private last = '';
  private shown = false;
  private turnSince = 0;

  constructor(root: HTMLElement, text: Text, onToggle: () => void, private turn?: TurnHandlers) {
    this.btn.type = 'button';
    this.btn.textContent = text('ui.map.btn');
    this.btn.setAttribute('aria-label', text('ui.map.open'));
    this.btn.addEventListener('click', e => { e.preventDefault(); onToggle(); this.btn.blur(); });
    for (const b of [this.tab, this.exitBtn, this.undoBtn, this.okBtn]) { b.type = 'button'; b.tabIndex = -1; }
    this.tab.addEventListener('click', e => { e.preventDefault(); this.turn?.tab(); });
    this.exitBtn.addEventListener('click', e => { e.preventDefault(); this.turn?.input({ t: 'exit' }); });
    this.undoBtn.addEventListener('click', e => { e.preventDefault(); this.turn?.input({ t: 'undo' }); });
    this.okBtn.addEventListener('click', e => {
      e.preventDefault();
      if (performance.now() - this.turnSince >= CONFIRM_GUARD_MS) this.turn?.input({ t: 'confirm' });
    });
    this.btns.append(this.exitBtn, this.undoBtn, this.okBtn);
    this.head.append(this.titleEl, this.inkEl, this.tab);
    this.stage.append(this.canvas, this.heads);
    this.body.append(this.stage, this.rings, this.btns);
    this.card.append(this.head, this.body, this.caption, this.keys, this.legend);
    root.append(this.card, this.btn);
  }

  /** 「圖」鍵：2D 且在魔方上才出現 */
  setButton(visible: boolean): void { this.btn.classList.toggle('show', visible); }

  /** model = null 收起；相同內容不重畫 */
  render(model: CubeMapModel | null): void {
    if (!model) {
      if (this.shown) { this.card.classList.remove('show', 'turning'); this.shown = false; this.last = ''; }
      return;
    }
    if (!this.shown) { this.card.classList.add('show'); this.shown = true; }
    // v0.4 第五章 三層並排 (11 欄)：卡片加寬，格子才讀得到房名
    this.card.classList.toggle('wide', model.cols >= 9);
    const t = model.turn ?? null;
    if (!!t !== this.card.classList.contains('turning')) {
      this.card.classList.toggle('turning', !!t);
      if (t) this.turnSince = performance.now();
    }
    const r = this.card.getBoundingClientRect();
    const key = JSON.stringify(model) + `|${Math.round(r.width)}x${Math.round(r.height)}`;
    if (key === this.last) return;
    this.last = key;
    this.titleEl.textContent = model.title;
    this.renderTab(model);
    const pv = model.preview;
    if (t) {
      this.caption.textContent = t.caption;
      this.caption.classList.toggle('pv', !!t.selected);
      this.caption.classList.toggle('bad', !!t.blocked);
      this.keys.textContent = t.text.keys;
      this.renderInk(t);
      this.renderButtons(t);
    } else {
      this.caption.textContent = pv ? (pv.blocked ? `${pv.caption} ${pv.blocked}` : pv.caption) : model.hint;
      this.caption.classList.toggle('pv', !!pv);
      this.caption.classList.remove('bad');
      this.keys.textContent = '';
      this.inkEl.textContent = '';
    }
    const lg = model.legend;
    this.legend.replaceChildren(...[['open', lg.open], ['wall', lg.wall], ['arch', lg.arch], ['you', lg.you], ['stained', lg.stained], ['white', lg.white]]
      .filter((e): e is [string, string] => typeof e[1] === 'string')
      .map(([k, tx]) => el('span', `pz-map-lg ${k}`, tx)));
    // 先排好版面 (三顆鈕顯示 / 隱藏) 再量畫布
    const geo = this.draw(model);
    this.renderHeads(t, geo);
  }

  private renderTab(m: CubeMapModel): void {
    const tab = m.tab ?? null;
    this.tab.classList.toggle('show', !!tab);
    if (!tab) return;
    this.tab.textContent = tab.label;
    this.tab.classList.toggle('active', tab.active);
    this.tab.classList.toggle('off', !tab.enabled && !tab.active);
    this.tab.setAttribute('aria-pressed', String(tab.active));
    this.tab.title = tab.reason ?? '';
  }

  /** 墨點 (實心 = 剩下、空心 = 用掉；剩 1 滴時外框加粗，不閃爍) + 「墨 3 / 6」 */
  private renderInk(t: TurnModeModel): void {
    const dots = el('span', 'pz-ink-dots');
    for (let i = 0; i < t.ink.max; i++) dots.append(el('i', i < t.ink.left ? 'full' : 'empty'));
    dots.classList.toggle('last', t.ink.left === 1);
    this.inkEl.replaceChildren(el('span', 'pz-ink-num', t.text.ink), dots);
  }

  private renderButtons(t: TurnModeModel): void {
    this.exitBtn.textContent = t.text.exit;
    this.undoBtn.innerHTML = `${UNDO_SVG}<span></span>`;
    this.undoBtn.querySelector('span')!.textContent = t.text.undo;
    this.undoBtn.disabled = !t.canUndo;
    this.okBtn.textContent = t.text.confirm;
    this.okBtn.disabled = !t.selected || !!t.blocked;
  }

  /** 標頭箭頭 (DOM 按鈕，疊在畫布上；位置依畫布上格子的實際位置) */
  private renderHeads(t: TurnModeModel | null, geo: Geo | null): void {
    this.renderRings(t);
    if (!t || !geo) { this.heads.replaceChildren(); return; }
    const { ox, oy, size, cols, rows } = geo;
    if (geo.stack) t = stackTurn(t, geo.stack);
    // 滑動章節 (第三章)：箭頭畫在房間與空格的交界；格子小 (手機) 時箭頭縮到 ≥ 28 px 不互相重疊，觸控區改由格子負責——
    // 每一格都是點擊區 (≥ 44 px)：點在某個箭頭附近 (0.4 格內) = 選那個箭頭；否則 = 點格子 (房間 / 空格選取、實心格說明)
    const arrow = Math.max(SLIDE_MIN, Math.min(HEAD, Math.floor(size * 0.46)));
    const slides = t.headers.filter(h => h.at.side === 'cell' && h.cell && typeof h.dir === 'string');
    const mid = (h: TurnHeader): [number, number] => { const [dx, dy] = DIR[h.dir as Side]; return [h.cell!.x + 0.5 + dx / 2, h.cell!.y + 0.5 + dy / 2]; };
    const cellBtns = (t.cells ?? []).map(c => {
      const b = el('button', `pz-turn-cell ${c.kind}`);
      b.type = 'button';
      b.tabIndex = -1;
      b.setAttribute('aria-label', c.name);
      b.dataset.cell = `${c.x},${c.y}`;
      b.style.left = `${Math.round(ox + c.x * size)}px`;
      b.style.top = `${Math.round(oy + c.y * size)}px`;
      b.style.width = b.style.height = `${Math.round(size)}px`;
      b.addEventListener('click', e => {
        e.preventDefault();
        const r = this.stage.getBoundingClientRect();
        const px = (e.clientX - r.left - ox) / size, py = (e.clientY - r.top - oy) / size;
        let best: TurnHeader | null = null;
        let bd = SLIDE_REACH;
        for (const h of slides) { const [mx, my] = mid(h); const d = Math.hypot(px - mx, py - my); if (d < bd) { bd = d; best = h; } }
        this.turn?.input(best ? { t: 'pick', group: best.group, dir: best.dir } : { t: 'cell', x: c.x, y: c.y });
      });
      return b;
    });
    const btns = t.headers.filter(h => !h.ring).map(h => {
      const b = el('button', `pz-turn-head ${h.state}${h.selected ? ' sel' : ''}`);
      b.type = 'button';
      b.tabIndex = -1;
      b.setAttribute('aria-label', h.label);
      b.setAttribute('aria-pressed', String(h.selected));
      b.title = h.label;
      b.dataset.group = h.group;
      b.dataset.dir = String(h.dir);
      b.innerHTML = `<b>${h.glyph}</b>${h.state === 'locked' ? `<i class="mark">${LOCK_SVG}</i>` : h.state === 'jammed' ? `<i class="mark">${WEDGE_SVG}</i>` : ''}`;
      let x = 0; let y = 0;
      const i = h.at.i;
      if (h.at.side === 'left') { x = ox - HEAD_GAP - HEAD; y = oy + (i + 0.5) * size - HEAD / 2; }
      else if (h.at.side === 'right') { x = ox + cols * size + HEAD_GAP; y = oy + (i + 0.5) * size - HEAD / 2; }
      else if (h.at.side === 'top') { x = ox + (i + 0.5) * size - HEAD / 2; y = oy - HEAD_GAP - HEAD; }
      else if (h.at.side === 'bottom' && geo.stack) {
        // v0.4 第四章 直屏的多層展開圖 (各層上下疊)：層轉標頭畫在那一層的右側 (↺ 上、↻ 下)
        const k = geo.stack.panels.findIndex(p => i >= p.x - 0.5 && i < p.x + p.w);
        x = ox + cols * size + HEAD_GAP;
        y = oy + (k * (geo.stack.rows + 1) + (h.dir === -1 ? 0.75 : 2.25)) * size - HEAD / 2;
      }
      else if (h.at.side === 'bottom') { x = ox + (i + 0.5) * size - HEAD / 2; y = oy + rows * size + HEAD_GAP; }
      else if (h.at.side === 'cell' && h.cell && typeof h.dir === 'string') {
        // 滑動：房間與空格交界線的中點 (一半在房間、一半在空格，不壓房名)
        const [mx, my] = mid(h);
        x = ox + mx * size - arrow / 2;
        y = oy + my * size - arrow / 2;
        b.classList.add('slide');
        b.style.width = b.style.height = `${arrow}px`;
      }
      else { x = ox + cols * size + HEAD_GAP; y = oy + i * (HEAD + HEAD_GAP); }
      b.style.left = `${Math.round(x)}px`;
      b.style.top = `${Math.round(y)}px`;
      b.addEventListener('click', e => { e.preventDefault(); this.turn?.input({ t: 'pick', group: h.group, dir: h.dir }); });
      return b;
    });
    this.heads.replaceChildren(...cellBtns, ...btns);
  }

  /**
   * v0.4 第五章 星環盤：每一列 = 一個軸 (東西軸 / 南北軸 / 上下軸) 或一個原地轉 (東窗的窗框…)，列名 + 這一列的鈕 (片名 + ↺ / ↻)；
   * 鎖住 = 星釘、卡住 = 楔形 (形狀區分)；選中 = 實心藍。沒有星環盤的章節 = 收起
   */
  private renderRings(t: TurnModeModel | null): void {
    const rings = t?.rings;
    this.rings.classList.toggle('show', !!rings?.length);
    if (!t || !rings?.length) { this.rings.replaceChildren(); return; }
    const rows = rings.map((r, row) => {
      const line = el('div', `pz-ring-row ${r.kind}`);
      line.append(el('span', 'pz-ring-name', r.name));
      const btns = el('div', 'pz-ring-btns');
      for (const h of t.headers.filter(x => x.ring?.row === row).sort((a, b) => a.ring!.col - b.ring!.col)) {
        const b = el('button', `pz-turn-head ring ${h.state}${h.selected ? ' sel' : ''}`);
        b.type = 'button';
        b.tabIndex = -1;
        b.setAttribute('aria-label', h.label);
        b.setAttribute('aria-pressed', String(h.selected));
        b.title = h.label;
        b.dataset.group = h.group;
        b.dataset.dir = String(h.dir);
        const mark = h.state === 'locked' ? `<i class="mark">${STAR_SVG}</i>` : h.state === 'jammed' ? `<i class="mark">${WEDGE_SVG}</i>` : '';
        b.innerHTML = `${h.sub ? '<small></small>' : ''}<b>${h.glyph}</b>${mark}`;
        if (h.sub) b.querySelector('small')!.textContent = h.sub;
        b.addEventListener('click', e => { e.preventDefault(); this.turn?.input({ t: 'pick', group: h.group, dir: h.dir }); });
        btns.append(b);
      }
      line.append(btns);
      return line;
    });
    this.rings.replaceChildren(...rows);
  }

  private draw(model: CubeMapModel): Geo | null {
    const cv = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (W < 10 || H < 10) return null;
    // v0.4 第四章 多層魔方在直屏 (手機) 上改為上下疊 (上層在上)：格子才夠大，房名讀得到
    // (只在上下疊的格子明顯比較大時才疊：並排 = 寬 / 欄數、高 / 列數取小；疊 = 反過來)
    const L = model.layers?.length ?? 1;
    const sideBySide = Math.min(W / model.cols, H / model.rows);
    // v0.4 第五章 三層：直屏另試「兩層一排 + 一層」(per = 2)；取格子最大的排法 (明顯比並排大才換)
    const fit = (per: number) => { const w = Math.max(...model.layers!.map(p => p.w)), r = Math.ceil(L / per); return Math.min(W / (per * w + per - 1), H / (r * model.rows + r - 1)); };
    const pers = model.layers ? (L === 3 ? [1, 2] : [1]) : [];
    const per = pers.reduce((best, p) => (fit(p) > fit(best) ? p : best), pers[0] ?? 1);
    const stacked = model.layers ? fit(per) : 0;
    const stack = model.layers && stacked > sideBySide * 1.15 ? { panels: model.layers, rows: model.rows, per } : null;
    const m = stack ? stackModel(model, stack) : model;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d');
    if (!g) return null;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const font = (px: number, bold = false) => `${bold ? '700 ' : ''}${Math.round(px)}px "PingFang TC", "Noto Sans TC", sans-serif`;
    // 留邊給屋框標籤 (左右依標籤實際寬度，標籤不被裁掉)；轉動模式另留標頭箭頭的位置
    const labelPx = 14;
    g.font = font(labelPx);
    const side = (ds: Side[]) => Math.max(0, ...m.frames.filter(f => ds.includes(f.side) && !f.inCell).map(f => g.measureText(f.name).width + 18));
    const t = m.turn ?? null;
    const hx = t?.headers.some(h => h.at.side === 'left' || h.at.side === 'right' || (stack && h.at.side === 'bottom')) ? HEAD + HEAD_GAP + 4 : 0;
    const hy = (s: 'top' | 'bottom') => (t?.headers.some(h => h.at.side === s && !(stack && s === 'bottom')) ? HEAD + HEAD_GAP + 4 : 0);
    const mx = Math.max(24, hx || side(['E', 'W']));
    const fy = m.frames.some(f => f.side === 'N' || f.side === 'S') ? labelPx * 2 + 8 : 0;
    // 多層：層名寫在各層上方 (與北側屋框標籤分兩行)
    const ly = m.layers ? labelPx + 10 + fy : 0;
    const mt = Math.max(t ? 10 : 24, fy, ly, hy('top'));
    const mb = Math.max(t ? 10 : 24, fy, hy('bottom'));
    const size = Math.min((W - mx * 2) / m.cols, (H - mt - mb) / m.rows);
    const ox = (W - size * m.cols) / 2;
    const oy = mt + (H - mt - mb - size * m.rows) / 2;
    const cx = (x: number) => ox + (x + 0.5) * size;
    const cy = (y: number) => oy + (y + 0.5) * size;
    const nameSize = Math.max(14, Math.min(22, size * 0.15));
    const tp = t?.preview ?? null;

    // 轉動模式的預覽：直接畫轉後的樣子 (格、門)；移動的房間加藍色虛線框，虛線箭頭由原位指向新位置
    const cells = tp ? tp.cells : m.cells;
    for (const c of cells) this.cell(g, c, ox + c.x * size, oy + c.y * size, size, nameSize, font, m.legend.you, 'bg');
    // 第三章光路圖層 (轉動預覽 = 轉後的光路)：畫在格底之上、房名之下 (房名另描紙色邊，線經過也讀得到)
    // 第四章墨流圖層 (現況；畫在光路之下)
    if (m.ink && !tp) this.ink(g, m.ink, ox, oy, size);
    const light = tp ? tp.light : m.light;
    if (light) this.light(g, light, ox, oy, size);
    for (const c of cells) this.cell(g, c, ox + c.x * size, oy + c.y * size, size, nameSize, font, m.legend.you, 'text', !!light);
    // 轉動模式有列標頭時，左右兩側的屋框標籤會被箭頭蓋住 → 不畫 (門的接線照畫；一般展開圖照常標)
    for (const f of m.frames) if (f.inCell || !(hx && (f.side === 'E' || f.side === 'W'))) this.frame(g, f, cx(f.x), cy(f.y), size, font(labelPx));
    if (m.layers) {
      g.save();
      g.font = font(labelPx, true);
      g.fillStyle = INK;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      for (const [k, L] of m.layers.entries()) {
        if (stack) { const gy = Math.floor(k / stack.per); g.textAlign = 'left'; g.fillText(L.name, ox + L.x * size, oy + gy * (stack.rows + 1) * size - 4 - (gy === 0 ? fy : 0)); }
        else g.fillText(L.name, ox + (L.x + L.w / 2) * size, oy - 4 - fy);
      }
      g.restore();
    }
    if (tp) {
      for (const d of tp.doors) this.door(g, d, cx(d.x), cy(d.y), size, 1);
      // v0.4 第五章 星環盤：被轉的那一片 (三層裡的格子) 描藍色虛線框
      if (tp.slab) {
        g.save();
        g.setLineDash([6, 5]);
        g.strokeStyle = BLUE;
        g.lineWidth = 2.5;
        for (const [sx, sy] of tp.slab) g.strokeRect(ox + sx * size + 2, oy + sy * size + 2, size - 4, size - 4);
        g.restore();
      }
      const panelOf = (x: number, y: number): number => (stack ? Math.floor(y / (stack.rows + 1)) * 8 + Math.floor(x / (m.layers![0].w + 1)) : m.layers ? m.layers.findIndex(p => x >= p.x - 1e-6 && x < p.x + p.w + 1e-6) : 0);
      g.save();
      // 箭頭半透明：房名與門的記號仍讀得到 (小螢幕的格子小，箭頭難免經過字旁)
      g.globalAlpha = 0.6;
      for (const mv of tp.moves) {
        g.setLineDash([8, 6]);
        g.strokeStyle = BLUE;
        g.lineWidth = 3;
        g.strokeRect(ox + mv.to[0] * size + 6, oy + mv.to[1] * size + 6, size - 12, size - 12);
        g.setLineDash([]);
        const [fx, fy] = mv.from;
        const [tx, ty] = mv.to;
        // 箭頭畫在房名下方 (橫移) / 右側 (直移)，不壓到字
        const ax = (x: number) => cx(x) + (fx === tx ? size * 0.27 : 0);
        const ay = (y: number) => cy(y) + (fy === ty ? size * 0.27 : 0);
        // v0.4 第四章 層轉：原地只換朝向 (中心格) 不畫箭頭；邊格 → 斜對角的下一格 = 直接一支箭頭
        if (fx === tx && fy === ty) continue;
        // v0.4 第五章 切片轉：換了層 (跨面板) 不畫箭頭 (三層並排時箭頭會橫過別的層；框住的轉後位置照畫)
        if (m.layers && panelOf(fx, fy) !== panelOf(tx, ty)) continue;
        if (Math.abs(tx - fx) + Math.abs(ty - fy) === 1 || (Math.abs(tx - fx) === 1 && Math.abs(ty - fy) === 1)) this.arrow(g, ax(fx), ay(fy), ax(tx), ay(ty), size * 0.6);
        else {
          // 繞回 (列循環)：從原位往外指、再從另一端指進新位置
          const sx = Math.sign(fx - tx); const sy = Math.sign(fy - ty);
          this.arrow(g, ax(fx), ay(fy), ax(fx) + sx * size * 0.62, ay(fy) + sy * size * 0.62, size * 0.25);
          this.arrow(g, ax(tx) - sx * size * 0.62, ay(ty) - sy * size * 0.62, ax(tx), ay(ty), size * 0.25);
        }
      }
      g.restore();
      return { ox, oy, size, cols: m.cols, rows: m.rows, ...(stack ? { stack } : {}) };
    }
    // 預覽中會改變的門 (同一格) 只畫轉後的樣子，不與現況疊在一起
    const replaced = (d: MapDoor) => !!m.preview?.doors.some(p => p.door === d.door && p.room === d.room && p.x === d.x && p.y === d.y);
    for (const d of m.doors) if (!replaced(d)) this.door(g, d, cx(d.x), cy(d.y), size, 1);

    const pv = m.preview;
    if (pv?.moved) {
      const { from, to } = pv.moved;
      // 轉後的房間：半透明虛線框 + 房名 + 轉後的門；虛線箭頭由原位指向新位置
      g.save();
      g.globalAlpha = 0.85;
      g.setLineDash([8, 6]);
      g.strokeStyle = BLUE;
      g.lineWidth = 3;
      g.fillStyle = 'rgba(61,99,255,0.12)';
      const x0 = ox + to[0] * size + 6;
      const y0 = oy + to[1] * size + 6;
      g.fillRect(x0, y0, size - 12, size - 12);
      g.strokeRect(x0, y0, size - 12, size - 12);
      g.setLineDash([]);
      g.fillStyle = BLUE;
      g.font = font(nameSize, true);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(pv.moved.name, cx(to[0]), cy(to[1]));
      this.arrow(g, cx(from[0]), cy(from[1]), cx(to[0]), cy(to[1]), size);
      g.restore();
    }
    if (pv) for (const d of pv.doors) this.door(g, d, cx(d.x), cy(d.y), size, 2);
    return { ox, oy, size, cols: m.cols, rows: m.rows, ...(stack ? { stack } : {}) };
  }

  /**
   * v0.4 第四章 梯口 (U / D)：格內右側的小方框 (U = 上半格、D = 下半格)；接通 = 實線框 + 墨點、門後是土 = 虛線框 + ×；拱門形 = 雙線框；
   * 框裡一個小箭頭 (U ▲ / D ▼) 指出往上 / 往下 (形狀區分，不只靠顏色)
   */
  private hatch(g: CanvasRenderingContext2D, d: MapDoor, cx: number, cy: number, s: number, style: 1 | 2): void {
    // 角落 (U = 右上角、D = 右下角)：不壓房名與「你在這裡」
    const k = Math.max(5, s * 0.085);
    const hx = cx + s / 2 - 4 - k - 3;
    const hy = d.side === 'U' ? cy - s / 2 + 4 + k + 3 : cy + s / 2 - 4 - k - 3;
    const open = d.link !== 'wall';
    const color = style === 2 ? BLUE : INK;
    g.save();
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = 2;
    if (!open) g.setLineDash([3, 3]);
    g.strokeRect(hx - k, hy - k, k * 2, k * 2);
    const wide = d.link === 'room' ? d.via === 'arch' : d.kind === 'arch';
    if (wide) g.strokeRect(hx - k + 3, hy - k + 3, k * 2 - 6, k * 2 - 6);
    g.setLineDash([]);
    const up = d.side === 'U' ? -1 : 1;
    g.beginPath(); g.moveTo(hx - k * 0.45, hy - up * k * 0.25); g.lineTo(hx + k * 0.45, hy - up * k * 0.25); g.lineTo(hx, hy + up * k * 0.45); g.closePath(); g.fill();
    if (open) { g.beginPath(); g.arc(hx + k, hy - k, 3.5, 0, Math.PI * 2); g.fill(); }
    else { g.lineWidth = 2; g.beginPath(); g.moveTo(hx + k - 4, hy - k - 4); g.lineTo(hx + k + 4, hy - k + 4); g.moveTo(hx + k + 4, hy - k - 4); g.lineTo(hx + k - 4, hy - k + 4); g.stroke(); }
    g.restore();
  }

  /** 地板上那一角的圖 (淡墨線；房名蓋在上面)：整張圖的 [px, py]～[px + 1, py + 1] 畫進邊長 s 的格子 */
  private piece(g: CanvasRenderingContext2D, pc: NonNullable<MapCell['piece']>, x: number, y: number, s: number): void {
    g.save();
    g.beginPath(); g.rect(x, y, s, s); g.clip();
    g.strokeStyle = 'rgba(58,43,28,0.38)'; g.lineWidth = Math.max(1.5, s / 40); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const line of pc.drawing.split(';')) {
      g.beginPath();
      line.trim().split(/\s+/).forEach((pt, i) => { const [px, py] = pt.split(',').map(Number); const X = x + (px - pc.px) * s, Y = y + (py - pc.py) * s; if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
      g.stroke();
    }
    g.restore();
  }

  /** 一格：phase 'bg' = 底與框 (房間 / 空格的虛框 / 實心格的斜線)、'text' = 房名與「你」(halo = 描紙色邊：光路線從底下經過也讀得到) */
  private cell(g: CanvasRenderingContext2D, c: MapCell, x: number, y: number, s: number, nameSize: number, font: (px: number, bold?: boolean) => string, you: string, phase: 'bg' | 'text', halo = false): void {
    const pad = 4;
    g.save();
    if (c.kind === 'room' && phase === 'bg') {
      g.fillStyle = c.current ? '#f7d58e' : PAPER;
      g.strokeStyle = INK;
      g.lineWidth = 2.5;
      g.fillRect(x + pad, y + pad, s - pad * 2, s - pad * 2);
      g.strokeRect(x + pad, y + pad, s - pad * 2, s - pad * 2);
      if (c.piece) this.piece(g, c.piece, x + pad, y + pad, s - pad * 2);
    } else if (c.kind === 'room') {
      g.fillStyle = INK;
      g.lineJoin = 'round';
      const say = (str: string, tx: number, ty: number) => {
        if (halo) { g.strokeStyle = c.current ? '#f7d58e' : PAPER; g.lineWidth = 5; g.strokeText(str, tx, ty); }
        g.fillText(str, tx, ty);
      };
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // 房名放不下格子 (窄螢幕、四字房名) → 字縮小到留 10px 邊
      const room = s - pad * 2 - 10;
      const fit = (px: number, bold: boolean, str: string) => { g.font = font(px, bold); const w = g.measureText(str).width; if (w > room) g.font = font(px * room / w, bold); };
      // 格子小 (手機的兩層並排) 且有短名：寫短名 (房名縮到讀不出來之前先換字)
      const label = c.short && s < 64 ? c.short : c.name;
      fit(nameSize, true, label);
      say(label, x + s / 2, y + s / 2 - (c.current ? nameSize * 0.45 : 0));
      if (c.current) {
        fit(nameSize * 0.72, false, `● ${you}`);
        g.fillStyle = '#a8640f';
        say(`● ${you}`, x + s / 2, y + s / 2 + nameSize * 0.75);
      }
    } else if (phase === 'text') {
      // 空格 / 實心格 / 走廊格的字跟底一起畫 (bg)
    } else if (c.kind === 'corridor') {
      // v0.4 第五章 走廊格 (梁上走道)：一段木梁 (格中央的粗棕條) + 連到兩頭的線 (平面的方位畫到格邊、U / D 畫到右上 / 右下角) + 「梁」字
      const mx = x + s / 2, my = y + s / 2;
      g.strokeStyle = 'rgba(110,80,50,0.85)';
      g.lineCap = 'round';
      g.lineWidth = Math.max(3, s * 0.07);
      for (const side of c.beam ?? []) {
        const [dx, dy] = DIR[side];
        const ex = dx || dy ? mx + dx * (s / 2 - pad) : mx + s * 0.3;
        const ey = dx || dy ? my + dy * (s / 2 - pad) : my + (side === 'U' ? -s * 0.3 : s * 0.3);
        g.beginPath(); g.moveTo(mx, my); g.lineTo(ex, ey); g.stroke();
      }
      g.fillStyle = '#8a6a48';
      g.strokeStyle = INK;
      g.lineWidth = 1.5;
      const bw = s * 0.56, bh = Math.max(8, s * 0.2);
      g.fillRect(mx - bw / 2, my - bh / 2, bw, bh);
      g.strokeRect(mx - bw / 2, my - bh / 2, bw, bh);
      g.fillStyle = PAPER;
      g.font = font(Math.max(10, bh * 0.8), true);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(c.short ?? c.name, mx, my + 1);
    } else if (c.kind === 'empty') {
      g.strokeStyle = 'rgba(58,38,24,0.45)';
      g.setLineDash([6, 6]);
      g.lineWidth = 1.5;
      g.strokeRect(x + pad, y + pad, s - pad * 2, s - pad * 2);
      g.setLineDash([]);
      g.fillStyle = 'rgba(58,38,24,0.5)';
      g.font = font(nameSize * 0.8);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(c.name, x + s / 2, y + s / 2);
    } else {
      g.fillStyle = PAPER2;
      g.fillRect(x + pad, y + pad, s - pad * 2, s - pad * 2);
      g.beginPath();
      g.rect(x + pad, y + pad, s - pad * 2, s - pad * 2);
      g.clip();
      g.strokeStyle = 'rgba(58,38,24,0.35)';
      g.lineWidth = 1;
      for (let k = -s; k < s; k += 10) { g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + k + s, y + s); g.stroke(); }
      // 有名字的實心格 (第三章：工具間 / 水塔) 寫上名字 (白底，不被斜線吃掉)
      if (c.name) {
        g.font = font(nameSize * 0.8, true);
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const tw = g.measureText(c.name).width;
        g.fillStyle = 'rgba(246,226,192,0.92)';
        g.fillRect(x + s / 2 - tw / 2 - 6, y + s / 2 - nameSize * 0.55, tw + 12, nameSize * 1.1);
        g.fillStyle = 'rgba(58,38,24,0.8)';
        g.fillText(c.name, x + s / 2, y + s / 2);
      }
    }
    g.restore();
  }

  /**
   * 門位：接通 = 畫在兩格交界上 (兩側重合成一條；拱門對拱門 = 雙線) + 墨點；門後是牆 = 房內側斷線 + ×；
   * 章門加小方框；style 2 = 預覽的轉後門 (藍色)
   */
  private door(g: CanvasRenderingContext2D, d: MapDoor, cx: number, cy: number, s: number, style: 1 | 2): void {
    const [dx, dy] = DIR[d.side];
    if (dx === 0 && dy === 0) { this.hatch(g, d, cx, cy, s, style); return; }
    const open = d.link !== 'wall';
    const edge = open ? s / 2 : s / 2 - 5;
    const ex = cx + dx * edge;
    const ey = cy + dy * edge;
    const half = s * 0.17;
    const tx = -dy; const ty = dx; // 沿邊方向
    const color = style === 2 ? BLUE : INK;
    g.save();
    g.lineCap = 'round';
    const seg = (off: number) => { g.beginPath(); g.moveTo(ex - tx * half + dx * off, ey - ty * half + dy * off); g.lineTo(ex + tx * half + dx * off, ey + ty * half + dy * off); g.stroke(); };
    // 門洞底色 (蓋掉房框線)
    g.strokeStyle = style === 2 ? '#e3e8ff' : PAPER;
    g.lineWidth = open ? 12 : 6;
    seg(0);
    g.strokeStyle = color;
    g.fillStyle = color;
    if (!open) {
      g.lineWidth = 3;
      g.setLineDash([5, 5]);
      seg(0);
      g.setLineDash([]);
      const k = s * 0.055;
      const mx = ex - dx * k * 1.8; const my = ey - dy * k * 1.8;
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(mx - k, my - k); g.lineTo(mx + k, my + k); g.moveTo(mx + k, my - k); g.lineTo(mx - k, my + k); g.stroke();
    } else {
      const wide = d.link === 'room' ? d.via === 'arch' : d.kind === 'arch';
      g.lineWidth = wide ? 2.5 : 4;
      if (wide) { seg(-3.5); seg(3.5); } else seg(0);
      g.beginPath();
      g.arc(ex, ey, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    if (d.kind === 'chapter') {
      g.lineWidth = 2;
      g.strokeRect(ex - dx * 14 - 4, ey - dy * 14 - 4, 8, 8);
    }
    g.restore();
  }

  /**
   * 光路圖層：窗記號 (房間那一側的邊上、靠一端的小窗格，不壓邊中央的門)、稜鏡 (兩側之間的角上的小三角)、
   * 光路 (白光 = 點線；穿過玻璃的光 = 虛線 + 每段中點一個箭頭紋 ›)、停下的地方 (牆外 = 垂直於光的短橫槓；房內 = 圓點)
   */
  /** 墨流圖層：管線 = 格中心到管口 (根色細線；有墨 = 墨藍粗線)、U / D 管口 = 小圓、匯點 = 圓 (收到墨實心)、停住 = 短橫槓 */
  private ink(g: CanvasRenderingContext2D, k: MapInk, ox: number, oy: number, s: number): void {
    const C = (x: number, y: number): [number, number] => [ox + (x + 0.32) * s, oy + (y + 0.68) * s];
    const end = (x: number, y: number, side: Side): [number, number] => { const [dx, dy] = DIR[side]; const [cx, cy] = C(x, y); return dx || dy ? [ox + (x + 0.5 + dx * 0.5) * s + (dx ? 0 : -0.18 * s), oy + (y + 0.5 + dy * 0.5) * s + (dy ? 0 : 0.18 * s)] : [cx + (side === 'U' ? -0.1 : 0.1) * s, cy]; };
    g.save();
    g.lineCap = 'round';
    for (const p of k.pipes) {
      g.strokeStyle = p.lit ? INK_LINE : ROOT_LINE;
      g.lineWidth = p.lit ? 4 : 2;
      g.beginPath();
      const [ax, ay] = end(p.x, p.y, p.a); const [cx, cy] = C(p.x, p.y); const [bx, by] = end(p.x, p.y, p.b);
      g.moveTo(ax, ay); g.lineTo(cx, cy); g.lineTo(bx, by); g.stroke();
      for (const sd of [p.a, p.b]) if (sd === 'U' || sd === 'D') { const [ux, uy] = end(p.x, p.y, sd); g.fillStyle = p.lit ? INK_LINE : ROOT_LINE; g.beginPath(); g.arc(ux, uy, 4, 0, Math.PI * 2); g.fill(); }
    }
    for (const sk of k.sinks) {
      const [sx, sy] = end(sk.x, sk.y, sk.side);
      g.strokeStyle = INK_LINE; g.fillStyle = INK_LINE; g.lineWidth = 2;
      g.beginPath(); g.arc(sx, sy, 5, 0, Math.PI * 2); if (sk.lit) g.fill(); else g.stroke();
    }
    for (const st of k.stops) {
      const [dx, dy] = DIR[st.side];
      const [sx, sy] = end(st.x, st.y, st.side);
      g.strokeStyle = INK_LINE; g.lineWidth = 3;
      g.beginPath();
      if (dx || dy) { g.moveTo(sx - dy * 7, sy - dx * 7); g.lineTo(sx + dy * 7, sy + dx * 7); } else { g.moveTo(sx - 7, sy); g.lineTo(sx + 7, sy); }
      g.stroke();
    }
    g.restore();
  }

  private light(g: CanvasRenderingContext2D, l: MapLight, ox: number, oy: number, s: number): void {
    const X = (x: number) => ox + x * s;
    const Y = (y: number) => oy + y * s;
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = GLASS_MARK;
    g.fillStyle = GLASS_MARK;
    for (const w of l.glass) {
      const [dx, dy] = DIR[w.side];
      if (dx === 0 && dy === 0) continue;
      // 窗：沿邊、從靠左 / 靠上那一端 0.1～0.3 格；往房內縮 7px
      const inset = 7;
      const ex = X(w.x + 0.5 + dx * 0.5) - dx * inset;
      const ey = Y(w.y + 0.5 + dy * 0.5) - dy * inset;
      const tx = -dy, ty = dx;
      const a0 = -0.4 * s, a1 = -0.2 * s;
      g.lineWidth = 2;
      g.beginPath();
      for (const off of [-2.5, 2.5]) { g.moveTo(ex + tx * a0 - dx * off, ey + ty * a0 - dy * off); g.lineTo(ex + tx * a1 - dx * off, ey + ty * a1 - dy * off); }
      for (const t of [a0, (a0 + a1) / 2, a1]) { g.moveTo(ex + tx * t - dx * 2.5, ey + ty * t - dy * 2.5); g.lineTo(ex + tx * t + dx * 2.5, ey + ty * t + dy * 2.5); }
      g.stroke();
    }
    for (const p of l.prisms) {
      const [ax, ay] = DIR[p.a], [bx, by] = DIR[p.b];
      const cx = X(p.x + 0.5 + (ax + bx) * 0.36), cy = Y(p.y + 0.5 + (ay + by) * 0.36);
      const k = s * 0.09;
      g.beginPath();
      g.moveTo(cx + ax * k, cy + ay * k);
      g.lineTo(cx + bx * k, cy + by * k);
      g.lineTo(cx - (ax + bx) * k * 0.6, cy - (ay + by) * k * 0.6);
      g.closePath();
      g.globalAlpha = 0.85;
      g.fill();
      g.globalAlpha = 1;
    }
    for (const seg of l.segs) {
      const x0 = X(seg.x0), y0 = Y(seg.y0), x1 = X(seg.x1), y1 = Y(seg.y1);
      g.strokeStyle = seg.white ? LIGHT_WHITE : LIGHT;
      g.lineWidth = 3.5;
      g.setLineDash(seg.white ? [1, 6] : [7, 5]);
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      g.setLineDash([]);
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (seg.white || len < 14) continue;
      // 箭頭紋 › (指向光前進的方向)
      const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
      const mx = (x0 + x1) / 2 + ux * 3, my = (y0 + y1) / 2 + uy * 3;
      const h = 7;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(mx - ux * h - uy * h, my - uy * h + ux * h);
      g.lineTo(mx, my);
      g.lineTo(mx - ux * h + uy * h, my - uy * h - ux * h);
      g.stroke();
    }
    for (const st of l.stops) {
      const x = X(st.x), y = Y(st.y);
      g.fillStyle = LIGHT;
      g.strokeStyle = LIGHT;
      if (st.kind === 'room') { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); continue; }
      const [dx, dy] = DIR[st.side];
      const k = 7;
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + dy * k, y - dx * k); g.lineTo(x - dy * k, y + dx * k); g.stroke();
    }
    g.restore();
  }

  private frame(g: CanvasRenderingContext2D, f: MapFrame, cx: number, cy: number, s: number, font: string): void {
    const [dx, dy] = DIR[f.side];
    g.save();
    g.fillStyle = INK;
    g.font = font;
    // v0.4 第五章 三層並排的東 / 西屋框 (落在層間的空欄)：寫在格內那一側的邊上 (直書兩三字太擠 → 縮字橫寫，貼著那一側)
    if (f.inCell) {
      const px = Math.max(9, Math.round(s * 0.12));
      g.font = font.replace(/\d+px/, `${px}px`);
      g.textBaseline = 'bottom';
      g.textAlign = dx > 0 ? 'right' : 'left';
      const label = `\u263C ${f.name}`;
      const room = s - 12;
      const w = g.measureText(label).width;
      if (w > room) g.font = font.replace(/\d+px/, `${Math.max(7, Math.floor(px * room / w))}px`);
      g.fillText(label, cx + dx * (s / 2 - 6), cy + s / 2 - 6);
      g.restore();
      return;
    }
    // v0.4 第四章 天花板 / 地板上的屋框 (天窗在上層的上側)：格內左上角的小字 (☼ + 名稱)，不壓房名
    if (dx === 0 && dy === 0) {
      g.font = font.replace(/\d+px/, `${Math.max(10, Math.round(s * 0.13))}px`);
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(`\u263C ${f.name}`, cx - s / 2 + 8, cy - s / 2 + 7);
      g.restore();
      return;
    }
    g.textBaseline = 'middle';
    g.textAlign = dx > 0 ? 'left' : dx < 0 ? 'right' : 'center';
    const x = cx + dx * (s / 2 + 12);
    const y = cy + dy * (s / 2 + 18);
    g.fillText(f.name, x, y);
    g.restore();
  }

  private arrow(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, s: number): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1) return;
    const ux = (x1 - x0) / len; const uy = (y1 - y0) / len;
    const a = { x: x0 + ux * s * 0.28, y: y0 + uy * s * 0.28 };
    const b = { x: x1 - ux * s * 0.22, y: y1 - uy * s * 0.22 };
    g.strokeStyle = BLUE;
    g.fillStyle = BLUE;
    g.lineWidth = 3;
    g.setLineDash([7, 5]);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.setLineDash([]);
    const h = 12;
    g.beginPath();
    g.moveTo(b.x + ux * h, b.y + uy * h);
    g.lineTo(b.x - uy * h * 0.7, b.y + ux * h * 0.7);
    g.lineTo(b.x + uy * h * 0.7, b.y - ux * h * 0.7);
    g.closePath();
    g.fill();
  }
}

/** 畫布上的版面 (標頭與格子按鈕依此定位)；stack = 直屏的多層上下疊 (各層的原始欄位與每層列數) */
interface Geo { ox: number; oy: number; size: number; cols: number; rows: number; stack?: Stack }
/** per = 每一排放幾層 (1 = 全部上下疊；v0.4 第五章 三層在直屏可以 2 + 1 排) */
interface Stack { panels: NonNullable<CubeMapModel['layers']>; rows: number; per: number }

/** 並排座標 (x 含層位移) → 上下疊座標：第 k 層放在第 ⌊k / per⌋ 排、第 k mod per 個；ref = 判斷屬於哪一層的參考 x (預設 = x) */
function stackXY(st: Stack, x: number, y: number, ref = x): [number, number] {
  const k = Math.max(0, st.panels.findIndex(p => ref >= p.x - 1e-6 && ref < p.x + p.w + 1e-6));
  const w = Math.max(...st.panels.map(p => p.w));
  return [x - st.panels[k].x + (k % st.per) * (w + 1), y + Math.floor(k / st.per) * (st.rows + 1)];
}
const stackRows = (st: Stack): number => Math.ceil(st.panels.length / st.per);
function stackModel(m: CubeMapModel, st: Stack): CubeMapModel {
  const xy = <T extends { x: number; y: number }>(o: T): T => { const [x, y] = stackXY(st, o.x, o.y, Math.floor(o.x)); return { ...o, x, y }; };
  const light = (l: MapLight | undefined) => l && stackLight(l, st);
  const mv = (v: { from: [number, number]; to: [number, number] }) => ({ from: stackXY(st, v.from[0], v.from[1]) as [number, number], to: stackXY(st, v.to[0], v.to[1]) as [number, number] });
  const out: CubeMapModel = {
    ...m,
    cols: st.per * Math.max(...st.panels.map(p => p.w)) + st.per - 1, rows: stackRows(st) * st.rows + stackRows(st) - 1,
    cells: m.cells.map(xy), doors: m.doors.map(xy), frames: m.frames.map(xy),
    layers: st.panels.map((p, k) => ({ x: (k % st.per) * (Math.max(...st.panels.map(q => q.w)) + 1), w: p.w, name: p.name, k })),
    preview: m.preview && { ...m.preview, doors: m.preview.doors.map(xy), moved: m.preview.moved && { ...m.preview.moved, ...mv(m.preview.moved) } },
    ...(m.light ? { light: light(m.light) } : {}),
    turn: m.turn ? stackTurn(m.turn, st) : m.turn
  };
  return out;
}
/** 轉動模式的預覽 / 格子按鈕跟著上下疊 (標頭的 i 照舊是並排的欄位；renderHeads 另依層換位置) */
function stackTurn(t: TurnModeModel, st: Stack): TurnModeModel {
  if ((t as TurnModeModel & { stacked?: boolean }).stacked) return t;
  const xy = <T extends { x: number; y: number }>(o: T): T => { const [x, y] = stackXY(st, o.x, o.y, Math.floor(o.x)); return { ...o, x, y }; };
  const pv = t.preview;
  return {
    ...t,
    ...(pv ? { preview: { ...pv, ...(pv.slab ? { slab: pv.slab.map(([x, y]) => stackXY(st, x, y, Math.floor(x)) as [number, number]) } : {}), cells: pv.cells.map(xy), doors: pv.doors.map(xy), moves: pv.moves.map(v => ({ ...v, from: stackXY(st, v.from[0], v.from[1]) as [number, number], to: stackXY(st, v.to[0], v.to[1]) as [number, number] })), ...(pv.light ? { light: stackLight(pv.light, st) } : {}) } } : {}),
    ...(t.cells ? { cells: t.cells.map(xy) } : {}),
    stacked: true
  } as TurnModeModel;
}
/** 光路圖層跟著上下疊 (線段以較左的端點判斷屬於哪一層) */
function stackLight(l: MapLight, st: Stack): MapLight {
  const xy = <T extends { x: number; y: number }>(o: T): T => { const [x, y] = stackXY(st, o.x, o.y, Math.floor(o.x)); return { ...o, x, y }; };
  return {
    segs: l.segs.map(s => { const ref = Math.floor(Math.min(s.x0, s.x1) + 1e-6); const [x0, y0] = stackXY(st, s.x0, s.y0, ref); const [x1, y1] = stackXY(st, s.x1, s.y1, ref); return { ...s, x0, y0, x1, y1 }; }),
    stops: l.stops.map(xy), glass: l.glass.map(xy), prisms: l.prisms.map(xy)
  };
}
