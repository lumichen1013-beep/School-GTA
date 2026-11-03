// 展開圖疊層 (v0.3；規格 5.4.1、mobile-controls 2.5)：半透明紙卡蓋住畫面上方 60% (橫屏) / 50% (直屏)，Canvas 2D 繪製；
// 只畫 app/cubeMapModel 推導好的資料，不改世界。「圖」鍵 (≥ 56 px) 給觸控用，2D 且在魔方上才出現
import type { DoorKind, FrameKind, Side } from '../core/cube';
import type { Text } from '../text/text';

export type MapLink = 'room' | 'wall' | 'frame';
export interface MapCell { x: number; y: number; kind: 'room' | 'empty' | 'solid'; room: string | null; name: string; current: boolean }
export interface MapDoor { room: string; door: string; x: number; y: number; side: Side; kind: DoorKind; link: MapLink }
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

export class CubeMapOverlay {
  private card = el('div', 'pz-map');
  private head = el('div', 'pz-map-head');
  private canvas = el('canvas', 'pz-map-canvas');
  private caption = el('div', 'pz-map-caption');
  private legend = el('div', 'pz-map-legend');
  private btn = el('button', 'pz-map-btn');
  private last = '';
  private shown = false;

  constructor(root: HTMLElement, text: Text, onToggle: () => void) {
    this.btn.type = 'button';
    this.btn.textContent = text('ui.map.btn');
    this.btn.setAttribute('aria-label', text('ui.map.open'));
    this.btn.addEventListener('click', e => { e.preventDefault(); onToggle(); this.btn.blur(); });
    this.card.append(this.head, this.canvas, this.caption, this.legend);
    root.append(this.card, this.btn);
  }

  /** 「圖」鍵：2D 且在魔方上才出現 */
  setButton(visible: boolean): void { this.btn.classList.toggle('show', visible); }

  /** model = null 收起；相同內容不重畫 */
  render(model: CubeMapModel | null): void {
    if (!model) {
      if (this.shown) { this.card.classList.remove('show'); this.shown = false; }
      return;
    }
    if (!this.shown) { this.card.classList.add('show'); this.shown = true; }
    const r = this.card.getBoundingClientRect();
    const key = JSON.stringify(model) + `|${Math.round(r.width)}x${Math.round(r.height)}`;
    if (key === this.last) return;
    this.last = key;
    this.head.textContent = model.title;
    const pv = model.preview;
    this.caption.textContent = pv ? (pv.blocked ? `${pv.caption} ${pv.blocked}` : pv.caption) : model.hint;
    this.caption.classList.toggle('pv', !!pv);
    this.legend.replaceChildren(...[['open', model.legend.open], ['wall', model.legend.wall], ['arch', model.legend.arch], ['you', model.legend.you]]
      .map(([k, t]) => el('span', `pz-map-lg ${k}`, t)));
    this.draw(model);
  }

  private draw(m: CubeMapModel): void {
    const cv = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (W < 10 || H < 10) return;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // 留邊給屋框標籤
    const margin = Math.max(30, Math.min(W, H) * 0.12);
    const size = Math.min((W - margin * 2) / m.cols, (H - margin * 2) / m.rows);
    const ox = (W - size * m.cols) / 2;
    const oy = (H - size * m.rows) / 2;
    const cx = (x: number) => ox + (x + 0.5) * size;
    const cy = (y: number) => oy + (y + 0.5) * size;
    const font = (px: number, bold = false) => `${bold ? '700 ' : ''}${Math.round(px)}px "PingFang TC", "Noto Sans TC", sans-serif`;
    const nameSize = Math.max(14, Math.min(22, size * 0.15));

    for (const c of m.cells) this.cell(g, c, ox + c.x * size, oy + c.y * size, size, nameSize, font, m.legend.you);
    for (const f of m.frames) this.frame(g, f, cx(f.x), cy(f.y), size, font(Math.max(12, nameSize * 0.75)));
    for (const d of m.doors) this.door(g, d, cx(d.x), cy(d.y), size, 1);

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
      g.fillStyle = INK;
      g.font = font(nameSize, true);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(c.name, x + s / 2, y + s / 2 - (c.current ? nameSize * 0.45 : 0));
      if (c.current) {
        g.font = font(nameSize * 0.72);
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
    }
    g.restore();
  }

  /** 門位：接通 = 實線 + 墨點；門後是牆 = 斷線 + ×；拱門 = 雙線；屋框接通 = 實線指向外 (style 2 = 預覽的轉後門，藍色) */
  private door(g: CanvasRenderingContext2D, d: MapDoor, cx: number, cy: number, s: number, style: 1 | 2): void {
    const [dx, dy] = DIR[d.side];
    if (dx === 0 && dy === 0) return;
    const ex = cx + dx * (s / 2 - 4);
    const ey = cy + dy * (s / 2 - 4);
    const half = s * 0.17;
    const tx = -dy; const ty = dx; // 沿邊方向
    const color = style === 2 ? BLUE : INK;
    g.save();
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineCap = 'round';
    const seg = (off: number) => { g.beginPath(); g.moveTo(ex - tx * half + dx * off, ey - ty * half + dy * off); g.lineTo(ex + tx * half + dx * off, ey + ty * half + dy * off); g.stroke(); };
    // 門洞底色 (蓋掉房框線)
    g.strokeStyle = style === 2 ? '#e3e8ff' : PAPER;
    g.lineWidth = 6;
    seg(0);
    g.strokeStyle = color;
    if (d.link === 'wall') {
      g.lineWidth = 3;
      g.setLineDash([5, 5]);
      seg(0);
      g.setLineDash([]);
      const k = s * 0.06;
      const mx = ex - dx * k * 1.6; const my = ey - dy * k * 1.6;
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(mx - k, my - k); g.lineTo(mx + k, my + k); g.moveTo(mx + k, my - k); g.lineTo(mx - k, my + k); g.stroke();
    } else {
      g.lineWidth = 4;
      if (d.kind === 'arch') { seg(-3); seg(3); } else seg(0);
      g.beginPath();
      g.arc(ex + dx * 7, ey + dy * 7, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    if (d.kind === 'chapter') {
      g.lineWidth = 2;
      g.strokeRect(ex - dx * 12 - 4, ey - dy * 12 - 4, 8, 8);
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
    const x = cx + dx * (s / 2 + 10);
    const y = cy + dy * (s / 2 + 14);
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
