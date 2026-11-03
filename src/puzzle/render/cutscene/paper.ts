// 剪紙圖形元件 (cutscenes-v0.1 5)：不規則紙邊、深棕描邊、偏移紙影、紙紋、人物剪影與常用物件
import type { SceneCtx } from './types';

export type Pt = readonly [number, number];

/** 0xRRGGBB → '#rrggbb' */
export const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
/** 0xRRGGBB 調亮 (f > 0) / 調暗 (f < 0) */
export function tint(c: number, f: number): string {
  const ch = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map(v => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}
export const rgba = (c: number, a: number): string => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

/** 可重現的亂數 (同一個 seed 每幀一樣：紙邊不閃) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);
export const ease = (x: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(x));
/** x 在 [a, b] 之間的平滑進度 */
export const smooth = (a: number, b: number, x: number): number => ease((x - a) / (b - a));

const pathCache = new Map<string, Path2D>();

/** 多邊形沿邊加細碎抖動 = 剪刀剪出來的紙邊 (結果快取) */
export function roughPoly(pts: readonly Pt[], seed: number, amp = 2.2, step = 22): Path2D {
  const key = `p${seed}:${amp}:${step}:${pts.map(p => p.join(',')).join(';')}`;
  const hit = pathCache.get(key);
  if (hit) return hit;
  const r = rng(seed);
  const p = new Path2D();
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / step));
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
      const j = k === 0 ? 0 : (r() - 0.5) * 2 * amp;
      const x = a[0] + (b[0] - a[0]) * u + nx * j, y = a[1] + (b[1] - a[1]) * u + ny * j;
      if (i === 0 && k === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
  });
  p.closePath();
  if (pathCache.size > 4000) pathCache.clear();
  pathCache.set(key, p);
  return p;
}

export const roughRect = (x: number, y: number, w: number, h: number, seed: number, amp = 2.2): Path2D =>
  roughPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], seed, amp);

export function roughEllipse(cx: number, cy: number, rx: number, ry: number, seed: number, amp = 1.6): Path2D {
  const n = Math.max(14, Math.round((rx + ry) / 8));
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return roughPoly(pts, seed, amp, 1e9);
}

export interface CutOpts { outline?: boolean; shadow?: number; lw?: number; alpha?: number; stroke?: string }

/** 剪紙一片：偏移紙影 → 色塊 → 描邊 */
export function cut(g: CanvasRenderingContext2D, path: Path2D, fill: string | CanvasGradient | CanvasPattern, o: CutOpts = {}): void {
  const sh = o.shadow ?? 5;
  if (o.alpha !== undefined) { g.save(); g.globalAlpha *= o.alpha; }
  if (sh > 0) {
    g.save();
    g.translate(sh * 0.7, sh);
    g.fillStyle = 'rgba(40,24,12,0.26)';
    g.fill(path);
    g.restore();
  }
  g.fillStyle = fill;
  g.fill(path);
  if (o.outline !== false) {
    g.lineWidth = o.lw ?? 2.6;
    g.lineJoin = 'round';
    g.strokeStyle = o.stroke ?? '#3a2618';
    g.stroke(path);
  }
  if (o.alpha !== undefined) g.restore();
}

/** 背景鋪滿目前可見範圍 */
export function fillView(s: SceneCtx, fill: string | CanvasGradient): void {
  const { x0, y0, x1, y1 } = s.view;
  s.g.fillStyle = fill;
  s.g.fillRect(x0 - 40, y0 - 40, x1 - x0 + 80, y1 - y0 + 80);
}

export function vGrad(g: CanvasRenderingContext2D, y0: number, y1: number, stops: ReadonlyArray<[number, string]>): CanvasGradient {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}

export function glow(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: number, a: number): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, a));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * 運鏡圖層：depth 越大越靠前 (緩推放大越多、平移越快)；減弱動態時 m = 0 → 靜止。
 * focus = 緩推的中心 (虛擬座標)
 */
export function layer(s: SceneCtx, depth: number, fn: () => void, focus: Pt = [450, 350]): void {
  const g = s.g;
  const push = (s.motion.push ?? 0) * depth * s.m;
  const pan = (s.motion.panX ?? 0) * 900 * depth * s.m;
  // 視差：parallax = 前後層相對位移佔安全區寬的比例 (例 0.02 = 2%)
  const par = (s.motion.parallax ?? 0) * 900 * (depth - 1) * (s.m - 0.5);
  g.save();
  g.translate(focus[0], focus[1]);
  g.scale(1 + push, 1 + push);
  g.translate(-focus[0] - pan - par, -focus[1]);
  fn();
  g.restore();
}

/** 手寫字跡 (不可讀的波浪線)：用在筆記、字條上；文字本身在字幕帶 */
export function scribble(g: CanvasRenderingContext2D, x: number, y: number, w: number, seed: number, color = '#4a3220', lw = 2.2): void {
  const r = rng(seed);
  g.beginPath();
  g.moveTo(x, y);
  let cx = x;
  while (cx < x + w) {
    const step = 7 + r() * 9;
    const up = (r() - 0.5) * 10;
    g.quadraticCurveTo(cx + step / 2, y + up - 5, cx + step, y + (r() - 0.5) * 3);
    cx += step;
    if (r() < 0.12) { cx += 10; g.moveTo(cx, y); }
  }
  g.strokeStyle = color;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.stroke();
}

/** 襯線字 (畫面內的標題 / 印字) */
export function serif(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, o: { align?: CanvasTextAlign; spacing?: number; weight?: number } = {}): void {
  g.font = `${o.weight ?? 400} ${size}px "Songti TC", "Noto Serif TC", "STSong", serif`;
  g.textAlign = o.align ?? 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  const sp = o.spacing ?? 0;
  if (!sp) { g.fillText(text, x, y); return; }
  const chars = [...text];
  const widths = chars.map(c => g.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + sp * (chars.length - 1);
  let cx = (o.align ?? 'center') === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
  g.textAlign = 'left';
  chars.forEach((c, i) => { g.fillText(c, cx, y); cx += widths[i] + sp; });
}

// ── 常用物件 ──

/** 圓角長條 (手指、紙條)：中心 x, y、長 len、粗 th、角度 a */
export function capsule(g: CanvasRenderingContext2D, x: number, y: number, len: number, th: number, a: number, fill: string, seed: number, o: CutOpts = {}): void {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  const r = th / 2, h = len / 2 - r;
  const pts: Pt[] = [];
  for (let i = 0; i <= 8; i++) { const u = -Math.PI / 2 + (i / 8) * Math.PI; pts.push([h + Math.cos(u) * r, Math.sin(u) * r]); }
  for (let i = 0; i <= 8; i++) { const u = Math.PI / 2 + (i / 8) * Math.PI; pts.push([-h + Math.cos(u) * r, Math.sin(u) * r]); }
  cut(g, roughPoly(pts, seed, 0.4, 1e9), fill, o);
  g.restore();
}

/**
 * 魔法陣 (以原點為中心、半徑 r)：外圈刻度、七芒星、頂點小圓、內圈方格與中心圓；
 * 只描線，呼叫端決定顏色 / 粗細 / 透視 (例：scale(1, 0.32) = 地板上的透視)
 */
export function sigil(g: CanvasRenderingContext2D, r: number, stroke: string, lw: number): void {
  const TAU = Math.PI * 2;
  g.strokeStyle = stroke;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const ring = (k: number) => { g.beginPath(); g.arc(0, 0, r * k, 0, TAU); g.stroke(); };
  ring(1); ring(0.9); ring(0.58); ring(0.14);
  g.beginPath();
  for (let i = 0; i < 84; i++) {
    const a = (i / 84) * TAU, k = i % 12 === 0 ? 0.86 : i % 3 === 0 ? 0.93 : 0.96;
    g.moveTo(Math.cos(a) * r * k, Math.sin(a) * r * k); g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.lineWidth = lw * 0.6; g.stroke(); g.lineWidth = lw;
  // 七芒星 {7/3}
  g.beginPath();
  for (let i = 0; i <= 7; i++) {
    const a = -Math.PI / 2 + (((i * 3) % 7) / 7) * TAU;
    if (i) g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); else g.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
  }
  g.stroke();
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i / 7) * TAU;
    g.beginPath(); g.arc(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, r * 0.055, 0, TAU); g.stroke();
    // 內圈與七芒星之間的小記號 (像製圖符號，不是文字)
    const b = a + Math.PI / 7, m = r * 0.72;
    g.beginPath();
    g.moveTo(Math.cos(b) * m - Math.sin(b) * r * 0.03, Math.sin(b) * m + Math.cos(b) * r * 0.03);
    g.lineTo(Math.cos(b) * m + Math.sin(b) * r * 0.03, Math.sin(b) * m - Math.cos(b) * r * 0.03);
    g.moveTo(Math.cos(b) * (m - r * 0.04), Math.sin(b) * (m - r * 0.04));
    g.lineTo(Math.cos(b) * (m + r * 0.04), Math.sin(b) * (m + r * 0.04));
    g.stroke();
  }
  // 內圈：兩個交錯的方格
  for (const rot of [0, Math.PI / 4]) {
    g.beginPath();
    for (let i = 0; i <= 4; i++) { const a = rot + (i / 4) * TAU; const x = Math.cos(a) * r * 0.5, y = Math.sin(a) * r * 0.5; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  }
  g.beginPath(); g.moveTo(-r * 0.14, 0); g.lineTo(r * 0.14, 0); g.moveTo(0, -r * 0.14); g.lineTo(0, r * 0.14); g.stroke();
}

/** 飄浮的灰塵 / 光點：在 (x, y, w, h) 範圍內，t 推動；減弱動態時靜止 */
export function motes(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, n: number, t: number, seed: number, color: string, size = 2.2, reduce = false, rise = 0): void {
  const r = rng(seed);
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const px = r(), py = r(), ph = r() * 6.28, sz = size * (0.5 + r());
    const tt = reduce ? 0 : t;
    const yy = (((py * h - tt * rise * (0.6 + r() * 0.8)) % h) + h) % h;
    g.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(ph + tt * 0.8));
    g.beginPath(); g.arc(x + px * w + Math.sin(ph + tt * 0.5) * 8, y + yy + Math.cos(ph + tt * 0.4) * 5, sz, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

/** 鋼筆 (水平，筆尖朝右)；length = 全長 */
export function pen(g: CanvasRenderingContext2D, x: number, y: number, length: number, thick: number, body: string, band: string, seed: number): void {
  const capL = length * 0.36;
  cut(g, roughPoly([[x, y - thick / 2], [x + length * 0.82, y - thick / 2], [x + length * 0.82, y + thick / 2], [x, y + thick / 2]], seed, 0.8), body);
  cut(g, roughRect(x + capL, y - thick / 2 - 1, thick * 0.35, thick + 2, seed + 1, 0.4), band, { shadow: 0 });
  cut(g, roughRect(x - thick * 0.2, y - thick * 0.3, thick * 0.25, thick * 0.6, seed + 2, 0.4), band, { shadow: 0 });
  cut(g, roughPoly([[x + length * 0.82, y - thick * 0.38], [x + length, y], [x + length * 0.82, y + thick * 0.38]], seed + 3, 0.6), band);
  g.beginPath();
  g.moveTo(x + length * 0.86, y);
  g.lineTo(x + length * 0.97, y);
  g.strokeStyle = 'rgba(58,38,24,0.8)';
  g.lineWidth = 1.6;
  g.stroke();
  // 筆夾
  cut(g, roughRect(x + thick * 0.4, y - thick / 2 - thick * 0.16, capL * 0.7, thick * 0.16, seed + 4, 0.3), band, { shadow: 2, lw: 1.6 });
}

/** 人物剪影 (正面站姿，平滑輪廓)：x, y = 腳底中心；h = 身高；bob = 上下晃動；lean = 前傾角 */
export function standingFigure(g: CanvasRenderingContext2D, x: number, y: number, h: number, color: string, _seed: number, o: { bob?: number; lean?: number; alpha?: number; outline?: string | null } = {}): void {
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  g.translate(x, y - (o.bob ?? 0));
  g.rotate(o.lean ?? 0);
  g.scale(h / 100, h / 100);
  const p = new Path2D();
  p.moveTo(-4, -81); p.lineTo(4, -81);
  p.quadraticCurveTo(15, -79, 16, -70); p.lineTo(18, -45); p.quadraticCurveTo(18, -41, 14.5, -41.5);
  p.lineTo(13, -60); p.lineTo(12.5, -30); p.lineTo(7.5, -29); p.lineTo(7, 0); p.lineTo(1, 0); p.lineTo(0, -27);
  p.lineTo(-1, 0); p.lineTo(-7, 0); p.lineTo(-7.5, -29); p.lineTo(-12.5, -30); p.lineTo(-13, -60);
  p.lineTo(-14.5, -41.5); p.quadraticCurveTo(-18, -41, -18, -45); p.lineTo(-16, -70); p.quadraticCurveTo(-15, -79, -4, -81);
  p.closePath();
  p.moveTo(9.5, -90.5);
  p.ellipse(0, -90.5, 9.5, 10.5, 0, 0, Math.PI * 2);
  if (o.outline !== null) { g.save(); g.translate(1.2, 1.6); g.fillStyle = 'rgba(40,24,12,0.26)'; g.fill(p); g.restore(); }
  g.fillStyle = color;
  g.fill(p);
  if (o.outline !== null) { g.lineWidth = 2.6 * 100 / h; g.strokeStyle = o.outline ?? '#3a2618'; g.lineJoin = 'round'; g.stroke(p); }
  g.restore();
}

export interface DrafterColors { coat: string; coatDark: string; scarf: string; beret: string; trousers: string; shoes: string; skin: string; hair: string; cheek: string }

/**
 * 製圖員 (玩家角色) 剪紙版，側面朝右：x, y = 腳底中心；h = 身高；walk = 步伐相位 (0 = 站立)
 * 配色取自主題 (與遊戲角色同色：橘大衣、紅圍巾、藍綠貝雷帽)
 */
export function drafter(g: CanvasRenderingContext2D, x: number, y: number, h: number, walk: number, c: DrafterColors, seed: number, flat = false): void {
  const st = Math.sin(walk) * (walk === 0 ? 0 : 1);
  const bob = walk === 0 ? 0 : Math.abs(Math.cos(walk)) * 2;
  const o = flat ? { shadow: 0, lw: 2.4, stroke: '#2c3fb0' } : { shadow: 3, lw: 2.2 };
  g.save();
  g.translate(x, y - bob);
  g.scale(h / 100, h / 100);
  // 後腿 / 前腿
  const leg = (dx: number, sw: number, sd: number) => {
    cut(g, roughPoly([[-5 + dx, -40], [5 + dx, -40], [5 + dx + sw * 9, -4], [-4 + dx + sw * 9, -4]], sd, 0.4, 1e9), c.trousers, o);
    cut(g, roughPoly([[-5 + dx + sw * 9, -5], [9 + dx + sw * 9, -5], [10 + dx + sw * 9, 0], [-5 + dx + sw * 9, 0]], sd + 1, 0.3, 1e9), c.shoes, o);
  };
  leg(-1, -st, seed);
  // 後手臂
  cut(g, roughPoly([[-4, -74], [4, -74], [2 - st * 7, -50], [-6 - st * 7, -50]], seed + 2, 0.4, 1e9), c.coatDark, o);
  leg(1, st, seed + 4);
  // 大衣
  cut(g, roughPoly([[-12, -78], [12, -78], [16, -36], [-15, -36]], seed + 6, 0.6, 1e9), c.coat, o);
  g.beginPath(); g.moveTo(3, -76); g.lineTo(4, -38); g.strokeStyle = 'rgba(58,38,24,0.5)'; g.lineWidth = 1.4; g.stroke();
  // 圍巾
  cut(g, roughPoly([[-11, -80], [11, -80], [12, -74], [-11, -73]], seed + 7, 0.3, 1e9), c.scarf, o);
  cut(g, roughPoly([[-10, -76], [-5, -76], [-9, -60], [-14, -62]], seed + 8, 0.3, 1e9), c.scarf, o);
  // 前手臂
  cut(g, roughPoly([[-3, -74], [5, -74], [5 + st * 7, -50], [-3 + st * 7, -50]], seed + 9, 0.4, 1e9), c.coat, o);
  cut(g, roughEllipse(1 + st * 7, -48, 3.4, 3.4, seed + 10, 0.2), c.skin, o);
  // 頭、頭髮、貝雷帽
  cut(g, roughEllipse(1, -90, 10, 11, seed + 11, 0.5), c.skin, o);
  cut(g, roughPoly([[-11, -90], [-7, -100], [5, -101], [9, -96], [-1, -95], [-5, -85], [-11, -82]], seed + 12, 0.3, 1e9), c.hair, o);
  cut(g, roughEllipse(0, -100, 12, 4.5, seed + 13, 0.4), c.beret, o);
  g.beginPath(); g.arc(6, -88, 1.3, 0, Math.PI * 2); g.fillStyle = '#2a1d14'; g.fill();
  g.beginPath(); g.arc(4, -84, 2.4, 0, Math.PI * 2); g.fillStyle = c.cheek; g.globalAlpha *= 0.6; g.fill();
  g.restore();
}
