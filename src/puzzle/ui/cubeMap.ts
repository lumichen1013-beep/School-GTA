// 展開圖疊層 (v0.3；規格 5.4.1、mobile-controls 2.5)：半透明紙卡蓋住畫面上方 60% (橫屏) / 50% (直屏)，Canvas 2D 繪製；
// 只畫 app/cubeMapModel 推導好的資料，不改世界。「圖」鍵 (≥ 56 px) 給觸控用，2D 且在魔方上才出現
import type { DoorKind, FrameKind, Side } from '../core/cube';
import type { Text } from '../text/text';

export type MapLink = 'room' | 'wall' | 'frame';
/** piece = 這間房地板上畫的圖的一角 (2-4a；整張圖的折線與這一角的格) */
export interface MapCell { x: number; y: number; kind: 'room' | 'empty' | 'solid'; room: string | null; name: string; current: boolean; piece?: { px: number; py: number; drawing: string } }
/** via = 接通時通道的型別 (兩側較窄者；拱門對拱門才是 arch) */
export interface MapDoor { room: string; door: string; x: number; y: number; side: Side; kind: DoorKind; link: MapLink; via?: 'door' | 'arch' }
export interface MapFrame { x: number; y: number; side: Side; kind: FrameKind; name: string }
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
  legend: { open: string; wall: string; arch: string; you: string };
  /** v0.4 控制盤章節：「轉」頁籤 (null = 本章不是控制盤章)；turn = 轉動模式中的資料 (deriveTurnMode) */
  tab?: { label: string; enabled: boolean; reason: string | null; active: boolean } | null;
  turn?: TurnModeModel | null;
}

// ── v0.4 轉動模式 (控制盤；規格 5.4.1、mobile-controls 2.5 / 3.3) ──

export type TurnDir = 1 | -1 | Side;
/** 一顆標頭箭頭 = 一組 + 一個方向 (列的左右端 ◀ ▶、行 ⇅ (兩列 = 對調) 或 ▲ ▼、層 / 切片 ↻ ↺)；at = 畫在展開圖哪一邊的第幾排 */
export interface TurnHeader {
  group: string;
  kind: 'row' | 'col' | 'slideCell' | 'layer' | 'slice';
  dir: TurnDir;
  state: 'ok' | 'locked' | 'jammed';
  /** cell = 滑動 (第三章)：畫在房間 (cell) 與 dir 那一側空格的交界上 */
  at: { side: 'top' | 'bottom' | 'left' | 'right' | 'ring' | 'cell'; i: number };
  /** 滑動的標頭：房間此刻的格位 */
  cell?: { x: number; y: number };
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
}

const INK = '#3a2618';
const PAPER = '#fdf4e1';
const PAPER2 = '#f6e2c0';
const BLUE = '#3d63ff';
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
    this.body.append(this.stage, this.btns);
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
    this.legend.replaceChildren(...[['open', model.legend.open], ['wall', model.legend.wall], ['arch', model.legend.arch], ['you', model.legend.you]]
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
  private renderHeads(t: TurnModeModel | null, geo: { ox: number; oy: number; size: number; cols: number; rows: number } | null): void {
    if (!t || !geo) { this.heads.replaceChildren(); return; }
    const { ox, oy, size, cols, rows } = geo;
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
    const btns = t.headers.map(h => {
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

  private draw(m: CubeMapModel): { ox: number; oy: number; size: number; cols: number; rows: number } | null {
    const cv = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (W < 10 || H < 10) return null;
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
    const side = (ds: Side[]) => Math.max(0, ...m.frames.filter(f => ds.includes(f.side)).map(f => g.measureText(f.name).width + 18));
    const t = m.turn ?? null;
    const hx = t?.headers.some(h => h.at.side === 'left' || h.at.side === 'right') ? HEAD + HEAD_GAP + 4 : 0;
    const hy = (s: 'top' | 'bottom') => (t?.headers.some(h => h.at.side === s) ? HEAD + HEAD_GAP + 4 : 0);
    const mx = Math.max(24, hx || side(['E', 'W']));
    const fy = m.frames.some(f => f.side === 'N' || f.side === 'S') ? labelPx * 2 + 8 : 0;
    const mt = Math.max(t ? 10 : 24, fy, hy('top'));
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
    for (const c of cells) this.cell(g, c, ox + c.x * size, oy + c.y * size, size, nameSize, font, m.legend.you);
    // 轉動模式有列標頭時，左右兩側的屋框標籤會被箭頭蓋住 → 不畫 (門的接線照畫；一般展開圖照常標)
    for (const f of m.frames) if (!(hx && (f.side === 'E' || f.side === 'W'))) this.frame(g, f, cx(f.x), cy(f.y), size, font(labelPx));
    if (tp) {
      for (const d of tp.doors) this.door(g, d, cx(d.x), cy(d.y), size, 1);
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
        if (Math.abs(tx - fx) + Math.abs(ty - fy) === 1) this.arrow(g, ax(fx), ay(fy), ax(tx), ay(ty), size * 0.6);
        else {
          // 繞回 (列循環)：從原位往外指、再從另一端指進新位置
          const sx = Math.sign(fx - tx); const sy = Math.sign(fy - ty);
          this.arrow(g, ax(fx), ay(fy), ax(fx) + sx * size * 0.62, ay(fy) + sy * size * 0.62, size * 0.25);
          this.arrow(g, ax(tx) - sx * size * 0.62, ay(ty) - sy * size * 0.62, ax(tx), ay(ty), size * 0.25);
        }
      }
      g.restore();
      return { ox, oy, size, cols: m.cols, rows: m.rows };
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
    return { ox, oy, size, cols: m.cols, rows: m.rows };
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

  private cell(g: CanvasRenderingContext2D, c: MapCell, x: number, y: number, s: number, nameSize: number, font: (px: number, bold?: boolean) => string, you: string): void {
    const pad = 4;
    g.save();
    if (c.kind === 'room') {
      g.fillStyle = c.current ? '#f7d58e' : PAPER;
      g.strokeStyle = INK;
      g.lineWidth = 2.5;
      g.fillRect(x + pad, y + pad, s - pad * 2, s - pad * 2);
      g.strokeRect(x + pad, y + pad, s - pad * 2, s - pad * 2);
      if (c.piece) this.piece(g, c.piece, x + pad, y + pad, s - pad * 2);
      g.fillStyle = INK;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      // 房名放不下格子 (窄螢幕、四字房名) → 字縮小到留 10px 邊
      const room = s - pad * 2 - 10;
      const fit = (px: number, bold: boolean, str: string) => { g.font = font(px, bold); const w = g.measureText(str).width; if (w > room) g.font = font(px * room / w, bold); };
      fit(nameSize, true, c.name);
      g.fillText(c.name, x + s / 2, y + s / 2 - (c.current ? nameSize * 0.45 : 0));
      if (c.current) {
        fit(nameSize * 0.72, false, `● ${you}`);
        g.fillStyle = '#a8640f';
        g.fillText(`● ${you}`, x + s / 2, y + s / 2 + nameSize * 0.75);
      }
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
    if (dx === 0 && dy === 0) return;
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

  private frame(g: CanvasRenderingContext2D, f: MapFrame, cx: number, cy: number, s: number, font: string): void {
    const [dx, dy] = DIR[f.side];
    g.save();
    g.fillStyle = INK;
    g.font = font;
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
