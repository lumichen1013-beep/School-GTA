// 序章 12 鏡與 cs:ch2 三鏡的剪紙分鏡：虛擬座標安全區 900 × 700，構圖重點在安全區內 (字幕帶在安全區下方)
// 顏色一律取自主題 (render/themes)；畫面內的字由 labels 傳入 (文字表)；時間 t = 鏡頭秒數 (含轉場)
import type { Palette } from '../themes';
import {
  capsule, clamp01, cut, drafter, fillView, glow, hex, layer, motes, pen, rgba, rng, roughEllipse, roughPoly, roughRect,
  scribble, serif, sigil, smooth, standingFigure, tint, vGrad, type DrafterColors, type Pt
} from './paper';
import type { SceneCtx, SceneDraw } from './types';

const INK = '#3a2618';
const TAU = Math.PI * 2;
/** 畫滿可見範圍用的邊界 (含運鏡與視差的餘裕；向下延伸到字幕帶下方) */
const L = (s: SceneCtx): number => Math.min(-600, s.view.x0 - 300);
const R = (s: SceneCtx): number => Math.max(1500, s.view.x1 + 300);
const B = (s: SceneCtx): number => Math.max(1200, s.view.y1 + 200);

const drafterColors = (p: Palette): DrafterColors => ({
  coat: hex(p.coat), coatDark: hex(p.coatDark), scarf: hex(p.scarf), beret: hex(p.beret), trousers: hex(p.trousers),
  shoes: hex(p.shoes), skin: hex(p.skin), hair: hex(p.hair), cheek: hex(p.cheek)
});

/** 加亮疊色 (光暈)：fn 內的繪製以 lighter 合成 */
function additive(g: CanvasRenderingContext2D, fn: () => void): void {
  g.save();
  g.globalCompositeOperation = 'lighter';
  fn();
  g.restore();
}

/** 整個可見範圍蓋一層顏色 (暗場 / 泛黃) */
function wash(s: SceneCtx, color: string): void {
  s.g.fillStyle = color;
  s.g.fillRect(s.view.x0 - 80, s.view.y0 - 80, s.view.x1 - s.view.x0 + 160, s.view.y1 - s.view.y0 + 160);
}

/** 暈影 (中心亮、四周暗) */
function vignette(s: SceneCtx, cx: number, cy: number, inner: number, color: string, a: number): void {
  const { g, view } = s;
  const vg = g.createRadialGradient(cx, cy, inner, cx, cy, Math.max(view.x1 - view.x0, view.y1 - view.y0) * 0.7);
  vg.addColorStop(0, color.replace('A', '0'));
  vg.addColorStop(1, color.replace('A', String(a)));
  g.fillStyle = vg;
  g.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
}

/** 木紋：水平細線 */
function woodGrain(g: CanvasRenderingContext2D, x0: number, x1: number, y0: number, y1: number, seed: number, color: string): void {
  const r = rng(seed);
  g.strokeStyle = color;
  g.lineWidth = 1.6;
  for (let y = y0; y < y1; y += 26 + r() * 22) {
    g.beginPath();
    g.moveTo(x0, y);
    for (let x = x0; x < x1; x += 60) g.quadraticCurveTo(x + 30, y + (r() - 0.5) * 8, x + 60, y + (r() - 0.5) * 3);
    g.stroke();
  }
}

/** 直條紋壁紙 + 小圖樣 */
function wallpaper(s: SceneCtx, y1: number, stripeW: number, seed: number): void {
  const { g, pal, view } = s;
  g.fillStyle = hex(pal.wallpaper);
  g.fillRect(view.x0 - 80, view.y0 - 80, view.x1 - view.x0 + 160, y1 - view.y0 + 80);
  g.fillStyle = hex(pal.wallStripe);
  const start = Math.floor((view.x0 - 80) / (stripeW * 2)) * stripeW * 2;
  for (let x = start; x < view.x1 + 80; x += stripeW * 2) g.fillRect(x, view.y0 - 80, stripeW, y1 - view.y0 + 80);
  const r = rng(seed);
  g.fillStyle = rgba(pal.wallMotif, 0.55);
  for (let x = start + stripeW * 1.5; x < view.x1 + 80; x += stripeW * 2) {
    for (let y = Math.floor(view.y0 / 90) * 90 + 40; y < y1 - 20; y += 90) {
      g.beginPath(); g.arc(x + (r() - 0.5) * 2, y, 4, 0, TAU); g.fill();
    }
  }
}

/** 地板條 (水平) */
function planks(s: SceneCtx, y0: number, a: number, b: number, line: number, seed: number): void {
  const { g, view } = s;
  g.fillStyle = hex(a);
  g.fillRect(view.x0 - 80, y0, view.x1 - view.x0 + 160, view.y1 - y0 + 80);
  const r = rng(seed);
  let k = 0;
  for (let y = y0; y < view.y1 + 80; y += 34, k++) {
    if (k % 2) { g.fillStyle = hex(b); g.fillRect(view.x0 - 80, y, view.x1 - view.x0 + 160, 34); }
    g.fillStyle = hex(line);
    g.fillRect(view.x0 - 80, y, view.x1 - view.x0 + 160, 2);
    for (let x = Math.floor(view.x0 / 200) * 200 + r() * 200; x < view.x1 + 80; x += 160 + r() * 120) g.fillRect(x, y, 2, 34);
  }
}

/** 蜘蛛網 (角落)：x, y = 角點；sx, sy = 往畫面內的方向 */
function cobweb(g: CanvasRenderingContext2D, x: number, y: number, size: number, sx: number, sy: number): void {
  g.strokeStyle = 'rgba(255,250,240,0.45)';
  g.lineWidth = 1.1;
  g.beginPath();
  for (let i = 0; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * size * sx, y + Math.sin(a) * size * sy); }
  for (let k = 1; k <= 3; k++) {
    const rr = (size * k) / 3.4;
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI / 2, a1 = ((i + 1) / 4) * Math.PI / 2;
      const p0: Pt = [x + Math.cos(a0) * rr * sx, y + Math.sin(a0) * rr * sy], p1: Pt = [x + Math.cos(a1) * rr * sx, y + Math.sin(a1) * rr * sy];
      g.moveTo(p0[0], p0[1]);
      g.quadraticCurveTo(x + Math.cos((a0 + a1) / 2) * rr * 0.8 * sx, y + Math.sin((a0 + a1) / 2) * rr * 0.8 * sy, p1[0], p1[1]);
    }
  }
  g.stroke();
}

/** 一疊爸爸的筆記 (攤開的紙、草圖、問號)；中心 x, y */
function notesPile(g: CanvasRenderingContext2D, pal: Palette, x: number, y: number, k: number, seed: number): void {
  const r = rng(seed);
  const paper = hex(pal.paperNote);
  for (let i = 0; i < 5; i++) {
    g.save();
    g.translate(x + (r() - 0.5) * 60 * k, y + (r() - 0.5) * 16 * k);
    g.rotate((r() - 0.5) * 0.5);
    cut(g, roughRect(-58 * k, -16 * k, 116 * k, 32 * k, seed + i, 0.9), i % 2 ? paper : tint(pal.paperNote, -0.07), { shadow: 2.5, lw: 1.6 });
    scribble(g, -46 * k, -6 * k, 70 * k, seed + 10 + i, '#5a4030', 1.3);
    g.restore();
  }
  // 最上面：攤開的筆記本，左頁畫著圓圈草圖、右頁是字跡與問號
  g.save();
  g.translate(x, y - 6 * k);
  cut(g, roughPoly([[-70 * k, -14 * k], [0, -20 * k], [70 * k, -14 * k], [66 * k, 16 * k], [0, 12 * k], [-66 * k, 16 * k]], seed + 30, 0.8), paper, { shadow: 3, lw: 1.8 });
  g.strokeStyle = 'rgba(58,38,24,0.5)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(0, -20 * k); g.lineTo(0, 12 * k); g.stroke();
  g.save(); g.translate(-34 * k, -3 * k); g.scale(1, 0.42); sigil(g, 22 * k, rgba(pal.inkBlue, 0.7), 1.2); g.restore();
  scribble(g, 8 * k, -10 * k, 52 * k, seed + 31, '#5a4030', 1.2);
  scribble(g, 8 * k, 0, 40 * k, seed + 32, '#5a4030', 1.2);
  serif(g, '?', 56 * k, 2 * k, 14 * k, '#a5452d', { weight: 700 });
  g.restore();
}

/** 相框 (立在桌上)：爸爸的剪影 */
function photoFrame(g: CanvasRenderingContext2D, pal: Palette, x: number, y: number, h: number, seed: number, sepia = false): void {
  const w = h * 0.78;
  cut(g, roughRect(x - w / 2, y - h, w, h, seed, 0.8), hex(pal.goldDeep), { shadow: 3, lw: 1.8 });
  cut(g, roughRect(x - w / 2 + 6, y - h + 6, w - 12, h - 12, seed + 1, 0.5), sepia ? '#e9d3a8' : '#d9c7a4', { shadow: 0, lw: 1.2 });
  standingFigure(g, x, y + h * 0.35, h * 1.05, sepia ? '#7a5a3c' : '#6b5440', seed + 2, { outline: null, alpha: 0.85 });
}

// ── 1 空了三年的老宅 ──

/** 老宅正面 (老宅外觀與山上小屋共用的比例)；dark = 窗全暗、藤蔓 */
function houseFacade(g: CanvasRenderingContext2D, pal: Palette, dark: boolean): void {
  const wall = tint(pal.wallpaper, dark ? -0.18 : 0), roof = dark ? '#4e2f22' : '#6b3f2a';
  for (const [x, sd] of [[120, 1], [650, 2]] as const) {
    cut(g, roughRect(x, 270, 130, 200, 50 + sd), tint(pal.wallpaper, dark ? -0.24 : -0.06));
    cut(g, roughPoly([[x - 14, 276], [x + 65, 220], [x + 144, 276]], 52 + sd), roof);
  }
  cut(g, roughRect(250, 200, 400, 270, 55), wall);
  cut(g, roughPoly([[226, 208], [450, 86], [674, 208]], 56, 2.4), roof);
  cut(g, roughRect(560, 100, 28, 64, 57, 0.8), '#4a2c1f');
  g.strokeStyle = 'rgba(30,18,10,0.4)'; g.lineWidth = 1.6;
  for (let y = 130; y < 208; y += 18) { g.beginPath(); g.moveTo(450 - (y - 86) * 1.83, y); g.lineTo(450 + (y - 86) * 1.83, y); g.stroke(); }
  // 掉了幾片瓦
  if (dark) for (const [x, y] of [[380, 160], [520, 178], [300, 196]] as const) cut(g, roughRect(x, y, 26, 12, x, 0.6), '#2c1a12', { shadow: 0, lw: 1.2 });
  const win = (x: number, y: number, sd: number) => {
    cut(g, roughRect(x, y, 36, 48, sd, 0.8), dark ? '#2f2a3c' : '#4a3a4a', { shadow: 2, lw: 2 });
    // 玻璃上反射的天光
    g.fillStyle = 'rgba(230,170,150,0.28)';
    g.beginPath(); g.moveTo(x + 4, y + 44); g.lineTo(x + 20, y + 4); g.lineTo(x + 28, y + 4); g.lineTo(x + 12, y + 44); g.closePath(); g.fill();
    g.fillStyle = hex(pal.trim); g.fillRect(x + 16, y, 4, 48); g.fillRect(x, y + 22, 36, 4);
  };
  [[290, 240], [370, 240], [494, 240], [574, 240], [290, 350], [574, 350], [160, 320], [206, 320], [688, 320], [734, 320]].forEach(([x, y], i) => win(x, y, 60 + i));
  // 一扇百葉窗歪掉
  if (dark) {
    g.save(); g.translate(370 + 40, 240); g.rotate(0.22);
    cut(g, roughRect(0, 0, 16, 50, 69, 0.5), '#5b3b29', { shadow: 2, lw: 1.6 });
    g.restore();
  }
  cut(g, roughPoly([[390, 370], [510, 370], [522, 384], [378, 384]], 71), roof, { shadow: 2 });
  cut(g, roughRect(418, 384, 64, 86, 72), tint(pal.door, dark ? -0.3 : 0));
  cut(g, roughRect(400, 470, 100, 14, 73, 0.8), hex(pal.stone));
  cut(g, roughRect(388, 484, 124, 14, 74, 0.8), hex(pal.stoneDark));
  // 門廊燈：沒點
  cut(g, roughEllipse(450, 364, 7, 9, 75, 0.3), dark ? '#5d5248' : hex(pal.lampBulb), { shadow: 0, lw: 1.6 });
  if (dark) {
    // 藤蔓爬上左翼與正面
    g.lineCap = 'round';
    for (const [x0, y0, x1, y1, sd] of [[132, 470, 220, 250, 1], [262, 470, 300, 230, 2], [640, 470, 600, 260, 3], [770, 470, 720, 300, 4]] as const) {
      const r = rng(sd + 500);
      g.strokeStyle = '#3f5233'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + 40, (y0 + y1) / 2, x1 - 40, (y0 + y1) / 2, x1, y1); g.stroke();
      for (let k = 0; k < 9; k++) {
        const u = k / 8, x = x0 + (x1 - x0) * u + (r() - 0.5) * 24, y = y0 + (y1 - y0) * u;
        cut(g, roughEllipse(x, y, 7, 4.5, sd * 20 + k, 0.4), k % 2 ? '#56703f' : '#466236', { shadow: 1.5, lw: 1.1 });
      }
    }
  }
}

/** 一片落葉的形狀 */
function leaf(g: CanvasRenderingContext2D, x: number, y: number, size: number, a: number, color: string, seed: number): void {
  g.save(); g.translate(x, y); g.rotate(a);
  cut(g, roughPoly([[-size, 0], [-size * 0.2, -size * 0.45], [size, 0], [-size * 0.2, size * 0.45]], seed, 0.3, 1e9), color, { shadow: 2, lw: 1.2 });
  g.beginPath(); g.moveTo(-size, 0); g.lineTo(size, 0); g.strokeStyle = 'rgba(58,38,24,0.5)'; g.lineWidth = 1; g.stroke();
  g.restore();
}

const emptyHouse: SceneDraw = s => {
  const { g, pal, t } = s;
  fillView(s, vGrad(g, s.view.y0, 480, [[0, '#4a3f63'], [0.45, '#9c6a72'], [0.8, '#d99a74'], [1, '#ebbd88']]));
  layer(s, 0.2, () => {
    glow(g, 740, 110, 150, 0xfff1d0, 0.4);
    cut(g, roughEllipse(740, 110, 30, 30, 20, 0.8), '#f8edd2', { outline: false, shadow: 0 });
    for (const [x, y, w, sd] of [[140, 80, 160, 1], [560, 150, 200, 2], [330, 40, 110, 3]] as const) cut(g, roughEllipse(x, y, w, w * 0.16, 40 + sd, 2), 'rgba(250,205,190,0.45)', { outline: false, shadow: 0 });
    cut(g, roughPoly([[L(s), 430], [-100, 360], [140, 330], [380, 350], [600, 300], [860, 340], [1100, 310], [R(s), 360], [R(s), 600], [L(s), 600]], 21, 3), '#6f6378', { shadow: 0, outline: false });
  });
  layer(s, 0.55, () => {
    cut(g, roughPoly([[L(s), 480], [0, 420], [250, 440], [450, 400], [700, 430], [950, 410], [R(s), 440], [R(s), 700], [L(s), 700]], 22, 3), '#4b4a45', { shadow: 0 });
    // 屋後的樹影
    for (const [x, h, sd] of [[60, 330, 1], [840, 370, 2], [700, 260, 3]] as const) {
      cut(g, roughEllipse(x, 470 - h * 0.55, h * 0.3, h * 0.45, 80 + sd, 4), '#333a30');
      cut(g, roughRect(x - 8, 470 - h * 0.2, 16, h * 0.2, 82 + sd, 0.6), '#2a2018');
    }
  });
  layer(s, 1, () => {
    houseFacade(g, pal, true);
    // 前院的雜草地
    cut(g, roughPoly([[L(s), 500], [R(s), 500], [R(s), B(s)], [L(s), B(s)]], 41, 3), vGrad(g, 500, 760, [[0, '#5f6a3c'], [1, '#434c2b']]), { shadow: 0 });
    cut(g, roughPoly([[410, 498], [490, 498], [560, B(s)], [340, B(s)]], 42, 2.5), '#8f7f63', { shadow: 0 });
    const r = rng(43);
    g.strokeStyle = '#2f3a1f'; g.lineWidth = 2;
    for (let i = 0; i < 70; i++) {
      const x = -100 + r() * 1100, y = 505 + r() * 160, h = 14 + r() * 26;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 4, y - h * 0.6, x + (r() - 0.5) * 14, y - h); g.stroke();
    }
  }, [450, 430]);
  layer(s, 1.6, () => {
    // 前景：生鏽的鐵柵欄 + 半開的院門 + 高草
    const iron = tint(pal.iron, -0.2);
    g.fillStyle = iron;
    for (const yy of [520, 600]) { cut(g, roughRect(L(s), yy, 372 - L(s), 9, yy, 0.6), iron, { shadow: 4, lw: 1.6 }); cut(g, roughRect(548, yy + 6, R(s) - 548, 9, yy + 1, 0.6), iron, { shadow: 4, lw: 1.6 }); }
    for (let x = Math.floor(s.view.x0 / 46) * 46 - 46; x < s.view.x1 + 60; x += 46) {
      if (x > 372 && x < 548) continue;
      cut(g, roughPoly([[x - 5, 680], [x - 5, 488], [x, 470], [x + 5, 488], [x + 5, 680]], 600 + x, 0.4, 1e9), iron, { shadow: 4, lw: 1.6 });
    }
    // 院門 (斜開)
    cut(g, roughPoly([[548, 470], [628, 500], [628, 690], [548, 690]], 61, 0.6, 1e9), 'rgba(0,0,0,0)', { shadow: 0, lw: 5, stroke: iron });
    g.strokeStyle = iron; g.lineWidth = 4;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(548 + k * 20, 470 + k * 7.5); g.lineTo(548 + k * 20, 690); g.stroke(); }
    const r = rng(62);
    for (let i = 0; i < 26; i++) {
      const x = s.view.x0 - 40 + r() * (s.view.x1 - s.view.x0 + 80), base = 720, h = 70 + r() * 110, lean = (r() - 0.5) * 50;
      cut(g, roughPoly([[x - 7, base], [x + lean, base - h], [x + 7, base]], 700 + i, 0.6, 1e9), i % 3 ? '#3a4a2a' : '#4f5f34', { shadow: 3, lw: 1.4 });
    }
  }, [450, 430]);
  // 落葉 (緩緩飄落；減弱動態時停在半空)
  const r = rng(90);
  for (let i = 0; i < 9; i++) {
    const x0 = r() * 1000 - 50, sp = 18 + r() * 16, ph = r() * TAU, life = 640;
    const tt = s.reduce ? 3 : t;
    const y = ((r() * life + tt * sp) % life) - 40;
    leaf(g, x0 + Math.sin(tt * 0.9 + ph) * 30, y, 9 + r() * 5, Math.sin(tt * 1.4 + ph) * 1.2, i % 2 ? '#b8743a' : '#9a5a2c', 900 + i);
  }
  vignette(s, 450, 330, 220, 'rgba(30,18,30,A)', 0.45);
};

// ── 2 山路三層、訊號消失 ──
const ROAD: readonly Pt[] = [[-200, 700], [120, 640], [420, 590], [300, 520], [540, 470], [720, 440], [600, 395], [660, 360]];
function roadAt(u: number): Pt {
  const seg = ROAD.length - 1;
  const f = clamp01(u) * seg;
  const i = Math.min(Math.floor(f), seg - 1);
  const k = f - i;
  return [ROAD[i][0] + (ROAD[i + 1][0] - ROAD[i][0]) * k, ROAD[i][1] + (ROAD[i + 1][1] - ROAD[i][1]) * k];
}
const mountain: SceneDraw = s => {
  const { g, t, pal } = s;
  fillView(s, vGrad(g, s.view.y0, 420, [[0, '#f2cf9b'], [1, '#fbe9c9']]));
  layer(s, 0.15, () => {
    glow(g, 260, 120, 180, 0xfff3c8, 0.8);
    cut(g, roughEllipse(260, 120, 46, 46, 20, 1), '#fff1c4', { outline: false, shadow: 0 });
  });
  layer(s, 0.35, () => {
    cut(g, roughPoly([[L(s), 430], [-200, 300], [60, 330], [300, 250], [460, 200], [640, 160], [800, 230], [1000, 190], [1300, 300], [R(s), 280], [R(s), 520], [L(s), 520]], 21, 3), '#9fb3a6');
    // 山頂的老宅：窗是暗的 (沒有人住)
    cut(g, roughRect(612, 140, 62, 32, 22, 0.8), '#5a3f2c', { shadow: 2, lw: 1.8 });
    cut(g, roughPoly([[604, 142], [643, 116], [682, 142]], 23, 0.6), '#3f2b1f', { shadow: 2, lw: 1.8 });
    cut(g, roughRect(660, 112, 9, 18, 24, 0.4), '#3f2b1f', { shadow: 0, lw: 1.4 });
    g.fillStyle = '#2f2a3c'; g.fillRect(628, 150, 9, 9); g.fillRect(648, 150, 9, 9);
  });
  layer(s, 1, () => {
    cut(g, roughPoly([[L(s), B(s)], [L(s), 480], [-100, 440], [200, 470], [480, 400], [760, 380], [1000, 420], [R(s), 380], [R(s), B(s)]], 25, 3), '#86a96f');
    cut(g, roughPoly([[L(s), B(s)], [L(s), 600], [0, 560], [300, 620], [700, 560], [R(s), 600], [R(s), B(s)]], 26, 3), '#6f9459');
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = new Path2D();
    ROAD.forEach((p, i) => (i ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1])));
    g.strokeStyle = INK; g.lineWidth = 34; g.stroke(path);
    g.strokeStyle = '#ecd9a8'; g.lineWidth = 28; g.stroke(path);
    g.strokeStyle = 'rgba(160,120,70,0.6)'; g.lineWidth = 2; g.setLineDash([10, 12]); g.stroke(path); g.setLineDash([]);
    // 小車沿山路往上
    const [cx, cy] = roadAt(0.18 + 0.42 * smooth(0, 8, t));
    g.save(); g.translate(cx, cy - 12);
    cut(g, roughPoly([[-26, 8], [-24, -6], [-12, -8], [-6, -20], [14, -20], [22, -8], [28, -6], [28, 8]], 27, 0.5, 1e9), '#2f4a4f', { shadow: 3, lw: 2 });
    g.fillStyle = '#cfe3e6'; g.fillRect(-3, -17, 14, 9);
    cut(g, roughEllipse(-14, 9, 6, 6, 28, 0.3), INK, { shadow: 0, lw: 1 });
    cut(g, roughEllipse(18, 9, 6, 6, 29, 0.3), INK, { shadow: 0, lw: 1 });
    g.restore();
  });
  layer(s, 2.6, () => {
    const pine = (x: number, base: number, h: number, seed: number, c: string) => {
      for (let k = 0; k < 3; k++) {
        const y = base - h * (0.3 + k * 0.28), w = h * (0.32 - k * 0.07);
        cut(g, roughPoly([[x - w, y + h * 0.3], [x, y - h * 0.12], [x + w, y + h * 0.3]], seed + k, 1.4), c);
      }
      cut(g, roughRect(x - 9, base - h * 0.08, 18, h * 0.12, seed + 9, 0.6), hex(pal.trim));
    };
    pine(-60, 820, 520, 30, '#3f6b4a');
    pine(110, 850, 360, 40, '#2f5a3c');
    pine(1060, 830, 480, 50, '#2f5a3c');
    pine(1220, 820, 560, 60, '#3f6b4a');
  });
  // 手機訊號一格一格消失 (第 2 段)
  const bars = t < 3.6 ? 3 : Math.max(0, 3 - Math.floor((t - 3.6) / 0.9) - 1);
  g.save(); g.translate(760, 40);
  cut(g, roughRect(0, 0, 104, 64, 31, 1), hex(pal.paperNote), { shadow: 3 });
  for (let i = 0; i < 4; i++) {
    const h = 12 + i * 10;
    g.beginPath(); g.rect(18 + i * 18, 52 - h, 12, h);
    g.fillStyle = i < bars ? INK : 'rgba(58,38,24,0.12)'; g.fill();
    g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
  }
  g.restore();
};

// ── 3 書房 (地毯、書桌、爸爸的筆記) ──

const RUG: readonly Pt[] = [[170, 545], [700, 545], [800, 690], [70, 690]];

/** 地毯 (透視梯形，邊框 + 內圈菱形花樣)；dust = 灰塵量 */
function rug(g: CanvasRenderingContext2D, pal: Palette, dust: number): void {
  cut(g, roughPoly(RUG, 140, 1.4), hex(pal.rugBorder), { shadow: 6 });
  const inset = (k: number): Pt[] => {
    const cx = 435, cy = 617;
    return RUG.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as Pt);
  };
  cut(g, roughPoly(inset(0.86), 141, 1), hex(pal.rug), { shadow: 0, lw: 2 });
  cut(g, roughPoly(inset(0.6), 142, 0.8), hex(pal.rugInner), { shadow: 0, lw: 1.8 });
  // 中央菱形
  cut(g, roughPoly([[435, 585], [530, 617], [435, 650], [340, 617]], 143, 0.6), hex(pal.rugBorder), { shadow: 0, lw: 1.6 });
  cut(g, roughPoly([[435, 600], [480, 617], [435, 634], [390, 617]], 144, 0.4), hex(pal.rug), { shadow: 0, lw: 1.4 });
  // 流蘇
  g.strokeStyle = hex(pal.rugBorder); g.lineWidth = 2;
  for (let x = 74; x < 798; x += 12) { g.beginPath(); g.moveTo(x, 690); g.lineTo(x + 1, 702); g.stroke(); }
  if (dust > 0) { g.fillStyle = `rgba(230,220,200,${0.22 * dust})`; g.fill(roughPoly(RUG, 140, 1.4)); }
}

/** 書房 (側面)：書架、窗、書桌與筆記、相框、蓋白布的椅子、牆上停住的鐘；light = 窗光強度 */
function studyRoom(s: SceneCtx, light: number, withRug = true): void {
  const { g, pal, t } = s;
  wallpaper(s, 470, 52, 211);
  wash(s, 'rgba(70,50,40,0.16)');
  cut(g, roughRect(s.view.x0 - 80, 400, s.view.x1 - s.view.x0 + 160, 72, 212, 1.4), hex(pal.wainscot), { shadow: 0 });
  g.fillStyle = hex(pal.trim); g.fillRect(s.view.x0 - 80, 397, s.view.x1 - s.view.x0 + 160, 8);
  planks(s, 472, pal.floorA, pal.floorB, pal.floorLine, 213);
  g.fillStyle = 'rgba(40,24,12,0.18)'; g.fillRect(s.view.x0 - 80, 472, s.view.x1 - s.view.x0 + 160, 18);
  // 窗 (傍晚)
  cut(g, roughRect(318, 82, 196, 262, 214, 1.2), hex(pal.trim), { shadow: 6 });
  cut(g, roughRect(332, 96, 168, 234, 215, 1), vGrad(g, 96, 330, [[0, '#8e6c8c'], [0.6, '#e09a72'], [1, '#f2c48c']]), { shadow: 0 });
  cut(g, roughPoly([[332, 300], [380, 270], [430, 288], [470, 262], [500, 280], [500, 330], [332, 330]], 216, 1), '#5a4c58', { shadow: 0, lw: 1.6 });
  g.fillStyle = hex(pal.trim); g.fillRect(412, 96, 8, 234); g.fillRect(332, 206, 168, 8);
  cobweb(g, 334, 98, 46, 1, 1);
  // 窗簾 (褪色)
  for (const [x, dir, sd] of [[300, -1, 217], [532, 1, 218]] as const) {
    cut(g, roughPoly([[x - 26 * dir, 70], [x + 22 * dir, 70], [x + 30 * dir, 250], [x + 10 * dir, 360], [x - 30 * dir, 360]], sd, 1.4), tint(pal.rug, -0.15), { shadow: 4 });
    g.strokeStyle = 'rgba(40,20,10,0.3)'; g.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x - 14 * dir + k * 12 * dir, 78); g.lineTo(x - 18 * dir + k * 14 * dir, 352); g.stroke(); }
  }
  cut(g, roughRect(270, 62, 290, 12, 219, 0.6), hex(pal.brass), { shadow: 3, lw: 1.6 });
  // 書架
  cut(g, roughRect(30, 64, 230, 412, 220), hex(pal.shelf), { shadow: 7 });
  const r = rng(221);
  for (let row = 0; row < 4; row++) {
    const y = 84 + row * 96;
    g.fillStyle = hex(pal.shelfDark); g.fillRect(44, y + 80, 202, 10);
    g.fillStyle = 'rgba(30,16,8,0.35)'; g.fillRect(44, y, 202, 80);
    let x = 50;
    while (x < 232) {
      const w = 12 + r() * 14, h = 48 + r() * 28;
      if (row === 2 && x > 160 && x < 200) { // 倒下的幾本
        cut(g, roughRect(x, y + 80 - 16, 58, 16, 300 + Math.round(x), 0.6), tint(pal.books[2], -0.25), { shadow: 2, lw: 1.4 });
        x += 62; continue;
      }
      cut(g, roughRect(x, y + 80 - h, w, h, 230 + row * 40 + Math.round(x), 0.7), tint(pal.books[Math.floor(r() * pal.books.length)], -0.28), { shadow: 2, lw: 1.4 });
      x += w + 2;
    }
  }
  cobweb(g, 260, 64, 54, -1, 1);
  // 牆上的鐘 (停在同一個時間)
  cut(g, roughEllipse(620, 170, 40, 40, 222, 0.8), hex(pal.trim), { shadow: 5 });
  cut(g, roughEllipse(620, 170, 31, 31, 223, 0.5), hex(pal.paperNote), { shadow: 0, lw: 1.6 });
  g.strokeStyle = INK; g.lineWidth = 3; g.lineCap = 'round';
  g.beginPath(); g.moveTo(620, 170); g.lineTo(608, 154); g.moveTo(620, 170); g.lineTo(640, 178); g.stroke();
  // 書桌
  cut(g, roughRect(560, 392, 320, 24, 224, 1), hex(pal.tableTop), { shadow: 5 });
  cut(g, roughRect(574, 416, 292, 54, 225, 1), hex(pal.table), { shadow: 3 });
  for (const x of [590, 730]) { cut(g, roughRect(x, 426, 120, 34, 226 + x, 0.6), tint(pal.table, -0.12), { shadow: 0, lw: 1.6 }); cut(g, roughEllipse(x + 60, 443, 5, 5, 228 + x, 0.3), hex(pal.brass), { shadow: 0, lw: 1.2 }); }
  for (const x of [578, 846]) cut(g, roughRect(x, 470, 18, 74, 229 + x, 0.6), tint(pal.table, -0.18), { shadow: 3 });
  // 桌上：沒點的檯燈、筆記、墨水瓶、空筆架、相框
  cut(g, roughEllipse(604, 390, 26, 6, 231, 0.4), hex(pal.trim), { shadow: 2 });
  cut(g, roughPoly([[600, 388], [608, 388], [626, 310], [618, 306]], 232, 0.4, 1e9), hex(pal.brass), { shadow: 2, lw: 1.8 });
  cut(g, roughPoly([[590, 268], [646, 268], [662, 310], [576, 310]], 233, 0.8), tint(pal.lampShade, -0.25), { shadow: 3 });
  notesPile(g, pal, 728, 380, 1, 234);
  cut(g, roughRect(800, 356, 22, 30, 235, 0.6), '#2d3f8f', { shadow: 2, lw: 1.6 });
  cut(g, roughRect(805, 348, 12, 9, 236, 0.4), hex(pal.trim), { shadow: 0, lw: 1.2 });
  photoFrame(g, pal, 852, 388, 52, 237);
  // 蓋著白布的扶手椅 (左下)
  cut(g, roughPoly([[64, 560], [70, 470], [110, 440], [190, 436], [236, 470], [244, 560], [220, 572], [90, 574]], 238, 2.4), '#ece4d6', { shadow: 6 });
  g.strokeStyle = 'rgba(120,100,80,0.45)'; g.lineWidth = 1.8;
  for (const [a, b, c, d] of [[100, 450, 120, 568], [150, 440, 160, 570], [200, 444, 210, 566]] as const) { g.beginPath(); g.moveTo(a, b); g.quadraticCurveTo((a + c) / 2 + 8, (b + d) / 2, c, d); g.stroke(); }
  if (withRug) rug(g, pal, 1);
  // 窗光斜照 + 光裡的灰塵
  if (light > 0) {
    additive(g, () => {
      g.fillStyle = vGrad(g, 330, 700, [[0, rgba(pal.lampLight, 0.2 * light)], [1, rgba(pal.lampLight, 0.02 * light)]]);
      g.beginPath(); g.moveTo(332, 330); g.lineTo(500, 330); g.lineTo(780, 700); g.lineTo(470, 700); g.closePath(); g.fill();
      g.save();
      g.beginPath(); g.moveTo(332, 330); g.lineTo(500, 330); g.lineTo(780, 700); g.lineTo(470, 700); g.closePath(); g.clip();
      motes(g, 320, 320, 470, 380, 46, t, 239, rgba(0xfff1d0, 0.9 * light), 1.8, s.reduce);
      g.restore();
    });
  }
}

const study: SceneDraw = s => {
  const { g } = s;
  layer(s, 1, () => studyRoom(s, 1), [720, 380]);
  // 第 2 段：桌上的筆記被窗光照亮
  const hl = smooth(4.4, 6.2, s.t);
  if (hl > 0) layer(s, 1, () => additive(g, () => glow(g, 728, 376, 130, s.pal.lampLight, 0.22 * hl)), [720, 380]);
  vignette(s, 520, 360, 200, 'rgba(30,18,10,A)', 0.5);
};

// ── 4 回憶 (泛黃剪紙)：爸爸說祖先是魔法師，默默收起筆記 ──

/** 坐著的人 (側面朝右)：x, y = 椅面前緣；k = 比例 */
function seatedFigure(g: CanvasRenderingContext2D, x: number, y: number, k: number, color: string, stroke: string, headTilt: number): void {
  const o = { stroke, lw: 2.2, shadow: 4 };
  g.save(); g.translate(x, y); g.scale(k, k);
  // 腿 (大腿水平、小腿下垂)
  cut(g, roughPoly([[-40, -22], [40, -24], [44, -4], [-40, 0]], 400, 0.5, 1e9), color, o);
  cut(g, roughPoly([[26, -16], [46, -16], [50, 70], [32, 70]], 401, 0.5, 1e9), color, o);
  cut(g, roughPoly([[30, 64], [66, 64], [68, 76], [30, 76]], 402, 0.4, 1e9), color, o);
  // 身體 (略前傾)
  cut(g, roughPoly([[-46, -20], [-36, -120], [4, -128], [16, -108], [10, -18]], 403, 0.6, 1e9), color, o);
  // 手臂伸向桌面
  cut(g, roughPoly([[-10, -110], [8, -112], [70, -70], [66, -56], [-14, -84]], 404, 0.5, 1e9), color, o);
  // 頭
  g.save(); g.translate(-8, -146); g.rotate(headTilt);
  cut(g, roughEllipse(0, 0, 20, 23, 405, 0.6), color, o);
  cut(g, roughPoly([[14, -6], [26, 2], [16, 8]], 406, 0.2, 1e9), color, { ...o, shadow: 0 });
  g.restore();
  g.restore();
}

const memory: SceneDraw = s => {
  const { g, t } = s;
  const SEP = { light: 0xf1dfb8, mid: 0xd8b98a, wood: 0xc9a671, wood2: 0xb8925c, dark: 0x8a6440, deeper: 0x6e5034, deepest: 0x4e3824 };
  const dk = hex(SEP.deeper), st = hex(SEP.deepest);
  const close = s.reduce ? smooth(6.0, 6.1, t) : smooth(6.4, 7.6, t);
  fillView(s, hex(SEP.mid));
  layer(s, 1, () => {
    // 鏡頭靠近書桌：整個回憶畫面放大 1.45 倍
    g.translate(450, 350); g.scale(1.45, 1.45); g.translate(-560, -330);
    fillView(s, vGrad(g, s.view.y0, 470, [[0, hex(SEP.light)], [1, hex(SEP.mid)]]));
    const r = rng(5);
    g.fillStyle = rgba(SEP.dark, 0.16);
    for (let x = -300; x < 1300; x += 70) for (let y = -200; y < 440; y += 70) { g.beginPath(); g.arc(x + r() * 6, y + (x % 140 ? 35 : 0), 5, 0, TAU); g.fill(); }
    planks(s, 470, SEP.wood, SEP.wood2, SEP.dark, 6);
    // 那時候的書架與窗 (淡)
    cut(g, roughRect(40, 80, 200, 390, 410, 1.6), hex(SEP.mid), { stroke: dk, shadow: 4 });
    for (let row = 0; row < 4; row++) { g.fillStyle = rgba(SEP.dark, 0.45); g.fillRect(52, 100 + row * 92, 176, 70); }
    cut(g, roughRect(300, 90, 170, 230, 411, 1.2), 'rgba(255,246,220,0.9)', { stroke: dk, shadow: 4 });
    g.fillStyle = dk; g.fillRect(381, 90, 7, 230); g.fillRect(300, 200, 170, 7);
    // 檯燈的暖光 (光錐)
    additive(g, () => {
      glow(g, 800, 300, 360, 0xffe0a0, 0.4);
      g.fillStyle = 'rgba(255,226,170,0.18)';
      g.beginPath(); g.moveTo(764, 302); g.lineTo(836, 302); g.lineTo(900, 396); g.lineTo(640, 396); g.closePath(); g.fill();
    });
    // 書桌
    cut(g, roughRect(540, 390, 330, 22, 412, 1), hex(SEP.wood), { stroke: dk, shadow: 5 });
    cut(g, roughRect(556, 412, 298, 62, 413, 1), hex(SEP.wood2), { stroke: dk, shadow: 3 });
    for (const x of [560, 834]) cut(g, roughRect(x, 474, 16, 70, 414 + x, 0.5), hex(SEP.dark), { stroke: dk, shadow: 2 });
    cut(g, roughEllipse(820, 388, 24, 6, 415, 0.4), dk, { stroke: st, shadow: 2 });
    cut(g, roughPoly([[816, 386], [824, 386], [806, 300], [798, 302]], 416, 0.4, 1e9), dk, { stroke: st, shadow: 2 });
    cut(g, roughPoly([[770, 262], [826, 262], [842, 302], [756, 302]], 417, 0.8), hex(SEP.mid), { stroke: st, shadow: 3 });
    // 桌上的書堆與茶杯
    for (let k = 0; k < 3; k++) cut(g, roughRect(712 + k * 3, 376 - k * 12, 58 - k * 6, 12, 423 + k, 0.4), hex(k % 2 ? SEP.mid : SEP.wood2), { stroke: st, shadow: 2, lw: 1.6 });
    cut(g, roughPoly([[600, 372], [622, 372], [619, 390], [603, 390]], 426, 0.3, 1e9), hex(SEP.light), { stroke: st, shadow: 2, lw: 1.6 });
    // 牆上的相框
    cut(g, roughRect(660, 150, 70, 54, 427, 0.6), hex(SEP.dark), { stroke: st, shadow: 3 });
    cut(g, roughRect(668, 158, 54, 38, 428, 0.4), hex(SEP.light), { stroke: st, shadow: 0, lw: 1.2 });
    // 椅子
    cut(g, roughRect(452, 452, 90, 12, 418, 0.6), hex(SEP.dark), { stroke: st, shadow: 3 });
    cut(g, roughRect(452, 330, 12, 214, 419, 0.6), hex(SEP.dark), { stroke: st, shadow: 3 });
    cut(g, roughRect(528, 464, 10, 80, 420, 0.5), hex(SEP.dark), { stroke: st, shadow: 2 });
    // 爸爸：坐著，第 2 段時低頭收起筆記
    seatedFigure(g, 510, 452, 1.15, hex(SEP.deeper), st, 0.1 + close * 0.22);
    // 桌上的筆記本：攤開 → 闔上
    g.save(); g.translate(660, 386);
    const w = 70 * (1 - close * 0.5);
    cut(g, roughPoly([[-w, -6], [0, -12], [w * (1 - close), -6 - close * 4], [w * (1 - close), 4], [0, 2], [-w, 4]], 421, 0.5, 1e9), hex(0xf6e7c4), { stroke: st, shadow: 3 });
    if (close < 0.6) {
      g.globalAlpha = 1 - close / 0.6;
      g.save(); g.translate(-34, -3); g.scale(1, 0.25); sigil(g, 26, rgba(SEP.deepest, 0.8), 1.6); g.restore();
      g.globalAlpha = 1;
    }
    if (close > 0) cut(g, roughRect(-w, -14, w, 14, 422, 0.4), hex(SEP.dark), { stroke: st, shadow: 2, alpha: close });
    g.restore();
    // 小時候的你：站在椅邊抬頭，第 1 段末笑出來
    const laugh = s.reduce ? 0 : smooth(5.5, 5.9, t) * (1 - smooth(6.6, 7.0, t)) * Math.abs(Math.sin(t * 9)) * 4;
    standingFigure(g, 340, 548, 168, hex(SEP.dark), 14, { bob: laugh, lean: 0.05 - smooth(5.5, 5.9, t) * 0.08, outline: st });
    // 爸爸說話時，牆上浮著淡淡的魔法陣 (他說的話)
    const talk = smooth(1.0, 2.4, t) * (1 - close);
    if (talk > 0.01) {
      g.save(); g.translate(560, 200); g.globalAlpha = 0.35 * talk; g.rotate(s.reduce ? 0 : t * 0.08);
      sigil(g, 70, st, 1.6);
      g.restore();
    }
  }, [450, 420]);
  // 回憶的暈影與焦邊
  vignette(s, 450, 360, 160, 'rgba(110,70,30,A)', 0.7);
  const { x0, y0, x1, y1 } = s.view;
  g.strokeStyle = 'rgba(90,55,25,0.35)'; g.lineWidth = 26;
  g.strokeRect(x0 + 6, y0 + 6, x1 - x0 - 12, y1 - y0 - 12);
};

// ── 5 捲起地毯：地板上刻著圖案 (俯視) ──

/** 刻在地板上的魔法陣 (凹痕：深色刻線 + 錯位的亮邊) */
function carvedSigil(g: CanvasRenderingContext2D, x: number, y: number, r: number, sy: number, shimmer: number): void {
  g.save(); g.translate(x + 1.6, y + 2); g.scale(1, sy);
  sigil(g, r, 'rgba(255,232,196,0.4)', 2.2);
  g.restore();
  g.save(); g.translate(x, y); g.scale(1, sy);
  sigil(g, r, 'rgba(48,24,10,0.9)', 5.2);
  g.restore();
  if (shimmer > 0) {
    g.save(); g.translate(x, y); g.scale(1, sy);
    g.globalAlpha = shimmer;
    sigil(g, r, 'rgba(255,214,140,0.55)', 1.6);
    g.restore();
  }
}

const rugRoll: SceneDraw = s => {
  const { g, pal, t } = s;
  const p = s.reduce ? 0.85 : smooth(0.3, 4.2, t);
  const x0 = 120, x1 = 790, y0 = 96, y1 = 574;
  const rollX = x0 + (x1 - x0 - 90) * p;
  const rr = 16 + 30 * p;
  layer(s, 1, () => {
    // 俯視地板 (直條木板)
    fillView(s, hex(pal.floorA));
    const r = rng(500);
    for (let x = Math.floor(s.view.x0 / 72) * 72 - 72; x < s.view.x1 + 72; x += 72) {
      if ((x / 72) % 2 === 0) { g.fillStyle = hex(pal.floorB); g.fillRect(x, s.view.y0 - 80, 72, s.view.y1 - s.view.y0 + 160); }
      g.fillStyle = hex(pal.floorLine); g.fillRect(x, s.view.y0 - 80, 2.4, s.view.y1 - s.view.y0 + 160);
      for (let y = s.view.y0 - 80 + r() * 300; y < s.view.y1 + 80; y += 220 + r() * 200) { g.fillRect(x, y, 72, 2.4); g.beginPath(); g.arc(x + 8, y + 8, 2, 0, TAU); g.arc(x + 64, y + 8, 2, 0, TAU); g.fill(); }
    }
    woodGrain(g, s.view.x0 - 80, s.view.x1 + 80, s.view.y0 - 80, s.view.y1 + 80, 501, 'rgba(110,60,28,0.16)');
    // 刻痕：陣內木頭顏色較深 (長年被地毯蓋住)；第 2 段時一道光從刻線上掃過
    g.fillStyle = 'rgba(80,45,20,0.18)';
    g.beginPath(); g.arc(450, 335, 205, 0, TAU); g.fill();
    const sh = smooth(4.4, 5.2, t) * (1 - smooth(6.6, 7.8, t));
    carvedSigil(g, 450, 335, 205, 1, s.reduce ? 0.4 : sh);
    // 地毯長年壓出的淡色框線
    g.strokeStyle = 'rgba(255,240,210,0.25)'; g.lineWidth = 10; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    // 還沒捲起的地毯
    g.save();
    g.beginPath(); g.rect(rollX, y0 - 20, x1 - rollX + 40, y1 - y0 + 40); g.clip();
    cut(g, roughRect(x0, y0, x1 - x0, y1 - y0, 502, 1.2), hex(pal.rugBorder), { shadow: 7 });
    cut(g, roughRect(x0 + 28, y0 + 28, x1 - x0 - 56, y1 - y0 - 56, 503, 1), hex(pal.rug), { shadow: 0, lw: 2 });
    cut(g, roughRect(x0 + 74, y0 + 74, x1 - x0 - 148, y1 - y0 - 148, 504, 0.8), hex(pal.rugInner), { shadow: 0, lw: 1.8 });
    for (let k = 0; k < 6; k++) {
      const cx = x0 + 120 + k * 92, cy = (y0 + y1) / 2;
      cut(g, roughPoly([[cx, cy - 70], [cx + 34, cy], [cx, cy + 70], [cx - 34, cy]], 505 + k, 0.5), hex(pal.rugBorder), { shadow: 0, lw: 1.6 });
    }
    g.fillStyle = 'rgba(230,220,200,0.2)'; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.restore();
    // 捲起的筒
    const lg = g.createLinearGradient(rollX - rr * 2, 0, rollX, 0);
    lg.addColorStop(0, tint(pal.rug, -0.35)); lg.addColorStop(0.45, tint(pal.rug, 0.15)); lg.addColorStop(1, tint(pal.rug, -0.25));
    cut(g, roughRect(rollX - rr * 2, y0 - 10, rr * 2, y1 - y0 + 20, 506, 1), lg, { shadow: 8 });
    g.strokeStyle = rgba(pal.rugBorder, 0.8); g.lineWidth = 3;
    for (const yy of [y0 + 14, y1 - 14]) { g.beginPath(); g.moveTo(rollX - rr * 2 + 2, yy); g.lineTo(rollX - 2, yy); g.stroke(); }
    // 筒端的螺旋
    for (const yy of [y0 - 10, y1 + 10]) {
      g.save(); g.translate(rollX - rr, yy); g.scale(1, 0.35);
      cut(g, roughEllipse(0, 0, rr, rr, 507, 0.4), tint(pal.rugBorder, -0.1), { shadow: 0, lw: 2 });
      g.beginPath(); for (let a = 0; a < TAU * 3; a += 0.3) { const k = (a / (TAU * 3)) * rr * 0.9; g.lineTo(Math.cos(a) * k, Math.sin(a) * k); }
      g.strokeStyle = 'rgba(58,38,24,0.6)'; g.lineWidth = 1.6; g.stroke();
      g.restore();
    }
    // 揚起的灰塵
    motes(g, rollX - rr * 2 - 70, y0, 90, y1 - y0, 28, t, 508, 'rgba(250,240,220,0.7)', 2.6, s.reduce, 12);
    // 你 (俯視)：跪在地毯筒左邊，雙手推著筒
    const c = drafterColors(pal);
    const hx = rollX - rr * 2 - 8, bx = hx - 190, by = 340;
    for (const [hy, sd] of [[262, 510], [418, 520]] as const) {
      const sy = by + (hy < by ? -46 : 46);
      const a = Math.atan2(hy - sy, hx - 30 - bx), len = Math.hypot(hx - 30 - bx, hy - sy);
      g.save(); g.translate(bx, sy); g.rotate(a);
      cut(g, roughPoly([[0, -22], [len - 8, -17], [len - 8, 17], [0, 24]], sd, 0.8, 1e9), c.coat, { shadow: 6 });
      cut(g, roughRect(len - 14, -20, 14, 40, sd + 1, 0.5), c.coatDark, { shadow: 0, lw: 1.8 });
      g.restore();
      cut(g, roughEllipse(hx - 14, hy, 22, 20, sd + 2, 0.6), c.skin, { shadow: 3 });
      for (let f = 0; f < 4; f++) capsule(g, hx + 4, hy - 13 + f * 9, 20, 8, 0.1, c.skin, sd + 3 + f, { shadow: 0, lw: 1.3 });
    }
    cut(g, roughEllipse(bx - 10, by, 62, 84, 530, 1), c.coat, { shadow: 8 });
    g.strokeStyle = 'rgba(58,38,24,0.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(bx - 60, by); g.lineTo(bx + 40, by); g.stroke();
    cut(g, roughEllipse(bx + 28, by, 30, 40, 531, 0.6), c.scarf, { shadow: 3 });
    cut(g, roughEllipse(bx + 34, by, 30, 30, 532, 0.6), c.hair, { shadow: 3 });
    cut(g, roughEllipse(bx + 30, by, 30, 33, 533, 0.6), c.beret, { shadow: 4 });
    cut(g, roughEllipse(bx + 30, by, 4, 4, 534, 0.2), tint(pal.beret, -0.3), { shadow: 0, lw: 1.2 });
  }, [450, 335]);
  vignette(s, 450, 335, 200, 'rgba(30,18,10,A)', 0.55);
};

// ── 6 踩上去：圖案亮起，鋼筆從中央升起 ──

/** 發光的魔法陣 (地板透視)：a = 亮度 0..1 */
function glowingSigil(s: SceneCtx, x: number, y: number, r: number, sy: number, a: number, spin: number): void {
  const { g, pal } = s;
  g.save(); g.translate(x, y); g.scale(1, sy); g.rotate(spin);
  sigil(g, r, 'rgba(40,20,10,0.8)', 4.4);
  additive(g, () => {
    g.globalAlpha = a;
    sigil(g, r, rgba(pal.inkHalo, 0.35), 16);
    sigil(g, r, rgba(pal.inkGlow, 0.6), 7);
    g.shadowColor = hex(pal.inkGlow); g.shadowBlur = 18;
    sigil(g, r, rgba(0xeaf6ff, 0.95), 2.6);
  });
  g.restore();
}

/** 直立的鋼筆 (筆尖朝下)，四周有光 */
function risingPen(s: SceneCtx, x: number, y: number, len: number, th: number, a: number, sway: number): void {
  const { g, pal } = s;
  additive(g, () => { glow(g, x, y, len * 0.75, pal.inkGlow, 0.45 * a); glow(g, x, y + len * 0.5, len * 0.3, pal.gold, 0.5 * a); });
  g.save(); g.translate(x, y); g.rotate(Math.PI / 2 + sway);
  pen(g, -len / 2, 0, len, th, hex(pal.pen), hex(pal.brass), 70);
  // 筆身高光
  const clip = new Path2D(); clip.rect(-len / 2, -th / 2, len * 0.82, th);
  g.save(); g.clip(clip);
  g.fillStyle = vGrad(g, -th / 2, th / 2, [[0, 'rgba(255,255,255,0.3)'], [0.45, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,30,0.35)']]);
  g.fillRect(-len / 2, -th / 2, len, th);
  g.restore();
  g.restore();
}

const circle: SceneDraw = s => {
  const { g, pal, t } = s;
  const lit = s.reduce ? smooth(0, 0.6, t) : smooth(0.4, 1.8, t);
  const rise = s.reduce ? smooth(4.0, 4.4, t) : smooth(4.2, 8.0, t);
  layer(s, 0.8, () => {
    studyRoom(s, 0.3, false);
    wash(s, 'rgba(14,10,28,0.62)');
    // 魔法陣的光照到牆上
    additive(g, () => glow(g, 450, 560, 520, pal.inkHalo, 0.28 * lit));
  }, [450, 420]);
  layer(s, 1, () => {
    // 地板上的陣 (透視)
    g.fillStyle = 'rgba(10,6,20,0.35)';
    g.beginPath(); g.ellipse(450, 590, 340, 104, 0, 0, TAU); g.fill();
    glowingSigil(s, 450, 590, 320, 0.3, lit, s.reduce ? 0 : t * 0.04);
    // 捲起的地毯 (右側)
    cut(g, roughRect(760, 600, 260, 46, 610, 1), vGrad(g, 600, 646, [[0, tint(pal.rug, 0.05)], [1, tint(pal.rug, -0.35)]]), { shadow: 6 });
    g.save(); g.translate(760, 623); g.scale(0.4, 1);
    cut(g, roughEllipse(0, 0, 23, 23, 611, 0.4), tint(pal.rugBorder, -0.2), { shadow: 0, lw: 2 });
    g.restore();
    // 光柱
    additive(g, () => {
      const col = g.createLinearGradient(0, 590, 0, 60);
      col.addColorStop(0, rgba(pal.inkGlow, 0.32 * lit)); col.addColorStop(0.6, rgba(pal.inkGlow, 0.08 * lit)); col.addColorStop(1, rgba(pal.inkGlow, 0));
      g.fillStyle = col;
      g.beginPath(); g.moveTo(330, 590); g.lineTo(570, 590); g.lineTo(520, 60); g.lineTo(380, 60); g.closePath(); g.fill();
      motes(g, 300, 120, 300, 470, 40, t, 612, rgba(0xdff4ff, 0.9 * lit), 2.4, s.reduce, 40);
    });
    // 你：踩在陣的邊上
    drafter(g, 214, 600, 220, 0, drafterColors(pal), 300);
    additive(g, () => glow(g, 230, 520, 120, pal.inkGlow, 0.18 * lit));
    // 鋼筆升起
    if (rise > 0) risingPen(s, 450, 560 - 250 * rise, 230, 26, rise, s.reduce ? 0 : Math.sin(t * 1.6) * 0.04);
  }, [450, 470]);
  vignette(s, 450, 450, 180, 'rgba(6,4,16,A)', 0.7);
};

// ── 7 握住鋼筆：書房開始轉動 ──
const grasp: SceneDraw = s => {
  const { g, pal, t } = s;
  const turn = s.reduce ? 0.14 : smooth(3.6, 8.0, t) * 0.9;
  const shake = s.reduce ? 0 : smooth(3.6, 4.2, t) * Math.sin(t * 30) * 1.5;
  layer(s, 0.7, () => {
    g.save();
    g.translate(450 + shake, 350);
    g.rotate(turn);
    g.scale(1.12, 1.12);
    g.translate(-450, -350);
    studyRoom(s, 0.2, false);
    wash(s, 'rgba(14,10,28,0.55)');
    glowingSigil(s, 450, 600, 320, 0.3, 1, s.reduce ? 0 : t * 0.04);
    g.restore();
    // 旋轉的紙條弧線
    if (turn > 0.02) {
      g.save(); g.translate(450, 350);
      for (const [rad, a0, sd] of [[300, 0.2, 1], [360, 2.4, 2], [250, 4.1, 3]] as const) {
        const a = a0 + turn * 1.6;
        g.lineCap = 'round';
        g.strokeStyle = INK; g.lineWidth = 16; g.beginPath(); g.arc(0, 0, rad, a, a + 0.9); g.stroke();
        g.strokeStyle = sd % 2 ? hex(pal.paperNote) : hex(pal.wallStripe); g.lineWidth = 11; g.beginPath(); g.arc(0, 0, rad, a, a + 0.9); g.stroke();
      }
      g.restore();
    }
  }, [450, 350]);
  layer(s, 1, () => {
    additive(g, () => glow(g, 450, 330, 340, pal.inkGlow, 0.38));
    risingPen(s, 450, 330, 380, 44, 1, 0);
    // 手從右下伸進來握住筆 (第 1 段開頭)
    const reach = s.reduce ? 1 : smooth(0.2, 1.6, t);
    const ox = (1 - reach) * 260, oy = (1 - reach) * 200;
    const c = drafterColors(pal);
    g.save(); g.translate(ox, oy);
    // 袖子沿手臂方向 (手腕 → 右下畫面外)
    g.save(); g.translate(500, 410); g.rotate(0.52);
    cut(g, roughPoly([[34, -52], [Math.max(900, R(s)), -96], [Math.max(900, R(s)), 110], [34, 56]], 700, 1.4, 1e9), c.coat, { shadow: 8 });
    g.strokeStyle = 'rgba(58,38,24,0.35)'; g.lineWidth = 2;
    for (const k of [180, 320]) { g.beginPath(); g.moveTo(k, -60); g.quadraticCurveTo(k + 30, 0, k + 10, 64); g.stroke(); }
    cut(g, roughRect(18, -58, 40, 118, 701, 0.8), c.coatDark, { shadow: 3 });
    g.restore();
    cut(g, roughEllipse(484, 400, 46, 54, 702, 0.8), c.skin, { shadow: 5 });
    // 四根手指從前面繞過筆身
    for (let f = 0; f < 4; f++) capsule(g, 446, 362 + f * 23, 64, 22, 0.08, tint(pal.skin, -0.02 * f), 703 + f, { shadow: 3, lw: 1.8 });
    capsule(g, 462, 342, 56, 22, -0.55, c.skin, 708, { shadow: 3, lw: 1.8 });
    g.fillStyle = rgba(pal.cheek, 0.35);
    for (let f = 0; f < 4; f++) { g.beginPath(); g.arc(420, 362 + f * 23, 4, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(58,38,24,0.45)'; g.lineWidth = 1.6;
    for (let f = 0; f < 4; f++) { g.beginPath(); g.moveTo(462, 356 + f * 23); g.quadraticCurveTo(468, 362 + f * 23, 462, 368 + f * 23); g.stroke(); }
    g.restore();
    // 指縫透出的光
    additive(g, () => glow(g, 440, 400, 90, pal.gold, 0.3 * reach));
  }, [450, 360]);
  vignette(s, 450, 360, 160, 'rgba(6,4,16,A)', 0.65);
};

// ── 8 老宅剖面像魔方重組 ──

/** 剖面裡的一格房間：wallpaper 色、家具圖示 */
interface Cell { id: number; wall: number; icon: 'shelf' | 'bed' | 'lamp' | 'stairs' | 'table' | 'clock' | 'door' | 'frame' | 'window' }
const CELL_W = 170, CELL_H = 132, HOUSE_X = 195, HOUSE_Y = 210;

function drawCell(g: CanvasRenderingContext2D, pal: Palette, c: Cell, x: number, y: number, flipX: number): void {
  g.save(); g.translate(x + CELL_W / 2, y + CELL_H / 2); g.scale(flipX, 1); g.translate(-CELL_W / 2, -CELL_H / 2);
  cut(g, roughRect(0, 0, CELL_W, CELL_H, 800 + c.id, 1), hex(c.wall), { shadow: 7, lw: 3 });
  g.fillStyle = 'rgba(40,24,12,0.14)'; g.fillRect(4, 4, CELL_W - 8, 12);
  cut(g, roughRect(0, CELL_H - 18, CELL_W, 18, 820 + c.id, 0.6), hex(pal.floorB), { shadow: 0, lw: 2 });
  const ink = { shadow: 2, lw: 1.8 };
  switch (c.icon) {
    case 'shelf':
      cut(g, roughRect(18, 20, 56, 94, 840 + c.id, 0.5), hex(pal.shelf), ink);
      for (let k = 0; k < 3; k++) for (let b = 0; b < 4; b++) cut(g, roughRect(24 + b * 12, 26 + k * 30, 9, 24, 850 + k * 4 + b, 0.3), hex(pal.books[(k * 4 + b) % pal.books.length]), { shadow: 0, lw: 1 });
      break;
    case 'bed':
      cut(g, roughRect(30, 76, 110, 38, 841, 0.5), hex(pal.paperNote), ink);
      cut(g, roughRect(24, 60, 14, 54, 842, 0.4), hex(pal.trim), ink);
      cut(g, roughRect(40, 70, 30, 14, 843, 0.3), hex(pal.rugBorder), { shadow: 0, lw: 1.2 });
      break;
    case 'lamp':
      g.fillStyle = hex(pal.cord); g.fillRect(CELL_W / 2 - 1.5, 0, 3, 34);
      cut(g, roughPoly([[60, 34], [110, 34], [124, 58], [46, 58]], 844, 0.5), hex(pal.lampShade), ink);
      cut(g, roughRect(50, 86, 70, 28, 845, 0.5), hex(pal.crate), ink);
      break;
    case 'stairs':
      for (let k = 0; k < 5; k++) cut(g, roughRect(20 + k * 26, 114 - (k + 1) * 19, 130 - k * 26, 19, 846 + k, 0.4), hex(pal.railDark), { shadow: 2, lw: 1.6 });
      g.strokeStyle = hex(pal.rail); g.lineWidth = 3; g.beginPath(); g.moveTo(26, 70); g.lineTo(150, -4); g.stroke();
      break;
    case 'table':
      cut(g, roughRect(36, 70, 100, 10, 851, 0.4), hex(pal.tableTop), ink);
      cut(g, roughRect(44, 80, 8, 34, 852, 0.3), hex(pal.table), ink); cut(g, roughRect(120, 80, 8, 34, 853, 0.3), hex(pal.table), ink);
      break;
    case 'clock':
      cut(g, roughRect(66, 24, 38, 90, 854, 0.4), hex(pal.trim), ink);
      cut(g, roughEllipse(85, 46, 13, 13, 855, 0.3), hex(pal.paperNote), { shadow: 0, lw: 1.4 });
      break;
    case 'door':
      cut(g, roughRect(56, 28, 58, 86, 856, 0.5), hex(pal.door), ink);
      cut(g, roughEllipse(104, 74, 4, 4, 857, 0.2), hex(pal.brass), { shadow: 0, lw: 1 });
      break;
    case 'frame':
      cut(g, roughRect(50, 26, 70, 52, 858, 0.4), hex(pal.goldDeep), ink);
      cut(g, roughRect(58, 34, 54, 36, 859, 0.3), '#9fb3a6', { shadow: 0, lw: 1.2 });
      cut(g, roughRect(30, 92, 110, 22, 860, 0.3), hex(pal.crateDark), ink);
      break;
    case 'window':
      cut(g, roughRect(50, 22, 70, 60, 861, 0.4), hex(pal.trim), ink);
      cut(g, roughRect(56, 28, 58, 48, 862, 0.3), '#8e6c8c', { shadow: 0, lw: 1.2 });
      g.fillStyle = hex(pal.trim); g.fillRect(83, 28, 4, 48);
      break;
  }
  g.restore();
}

/** 每格在四個時間點的位置 (col, row)：第 1 步上排右移、第 2 步樓梯翻面、第 3 步右欄下移 */
const CUBE: ReadonlyArray<{ cell: Cell; keys: readonly Pt[] }> = [
  { cell: { id: 0, wall: 0xe9c9a0, icon: 'shelf' }, keys: [[0, 0], [1, 0], [1, 0], [1, 0]] },
  { cell: { id: 1, wall: 0xc9d7c0, icon: 'clock' }, keys: [[1, 0], [2, 0], [2, 0], [2, 1]] },
  { cell: { id: 2, wall: 0xe5b9a8, icon: 'lamp' }, keys: [[2, 0], [0, 0], [0, 0], [0, 0]] },
  { cell: { id: 3, wall: 0xd8c6e0, icon: 'bed' }, keys: [[0, 1], [0, 1], [0, 1], [0, 1]] },
  { cell: { id: 4, wall: 0xf0dcb8, icon: 'stairs' }, keys: [[1, 1], [1, 1], [1, 1], [1, 1]] },
  { cell: { id: 5, wall: 0xbfd6dc, icon: 'frame' }, keys: [[2, 1], [2, 1], [2, 1], [2, 2]] },
  { cell: { id: 6, wall: 0xe8d4a2, icon: 'table' }, keys: [[0, 2], [0, 2], [0, 2], [0, 2]] },
  { cell: { id: 7, wall: 0xd9b48c, icon: 'door' }, keys: [[1, 2], [1, 2], [1, 2], [1, 2]] },
  { cell: { id: 8, wall: 0xc7c9e6, icon: 'window' }, keys: [[2, 2], [2, 2], [2, 2], [2, 0]] }
];
const CUBE_STEPS: ReadonlyArray<[number, number]> = [[0.6, 2.6], [3.6, 5.2], [5.6, 7.6]];

const rearrange: SceneDraw = s => {
  const { g, pal, t } = s;
  const tt = s.reduce ? 6.6 : t;
  fillView(s, vGrad(g, s.view.y0, s.view.y1, [[0, '#2c2846'], [0.6, '#5a4060'], [1, '#7a5060']]));
  layer(s, 0.3, () => {
    const r = rng(870);
    g.fillStyle = 'rgba(255,240,210,0.8)';
    for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(r() * 1300 - 200, r() * 300 - 50, 1 + r() * 1.6, 0, TAU); g.fill(); }
    cut(g, roughPoly([[L(s), 660], [-50, 600], [250, 630], [600, 590], [950, 620], [R(s), 600], [R(s), B(s)], [L(s), B(s)]], 871, 3), '#3a3a3a', { shadow: 0 });
  });
  layer(s, 1, () => {
    // 剖面的外框：屋頂 + 外牆
    cut(g, roughPoly([[HOUSE_X - 40, HOUSE_Y + 4], [450, 40], [HOUSE_X + CELL_W * 3 + 40, HOUSE_Y + 4]], 872, 2), '#5b3424', { shadow: 8 });
    cut(g, roughRect(HOUSE_X - 16, HOUSE_Y - 6, CELL_W * 3 + 32, CELL_H * 3 + 22, 873, 1.4), '#4a2f22', { shadow: 8 });
    // 格子的空位 (陰影)
    g.fillStyle = '#20141c'; g.fillRect(HOUSE_X, HOUSE_Y, CELL_W * 3, CELL_H * 3);
    // 依移動狀態排序：移動中的格子畫在最上面
    const items = CUBE.map(({ cell, keys }) => {
      let k = 0, u = 0;
      CUBE_STEPS.forEach(([a, b], i) => { if (tt >= b) k = i + 1; else if (tt > a && k === i) u = smooth(a, b, tt); });
      const p0 = keys[Math.min(k, 3)], p1 = keys[Math.min(k + 1, 3)];
      const moving = u > 0 && (p0[0] !== p1[0] || p0[1] !== p1[1]);
      const col = p0[0] + (p1[0] - p0[0]) * u, row = p0[1] + (p1[1] - p0[1]) * u;
      // 跨越其他格的那一格抬起來繞過去 (像魔方轉一圈)
      const far = Math.abs(p1[0] - p0[0]) + Math.abs(p1[1] - p0[1]) > 1;
      const lift = moving ? Math.sin(u * Math.PI) * (far ? 1 : 0.25) : 0;
      const dx = p1[1] !== p0[1] && far ? lift * 150 : 0, dy = p1[0] !== p0[0] && far ? -lift * 150 : -lift * 20;
      const flip = cell.icon === 'stairs' && tt > CUBE_STEPS[1][0] && tt < CUBE_STEPS[1][1] ? Math.cos(smooth(CUBE_STEPS[1][0], CUBE_STEPS[1][1], tt) * Math.PI) : cell.icon === 'stairs' && tt >= CUBE_STEPS[1][1] ? -1 : 1;
      return { cell, x: HOUSE_X + col * CELL_W + dx, y: HOUSE_Y + row * CELL_H + dy, z: moving || flip !== 1 && flip !== -1 ? 1 : 0, flip, lift };
    }).sort((a, b) => a.z - b.z);
    for (const it of items) {
      if (it.lift > 0.05) { g.fillStyle = `rgba(0,0,0,${0.25 * it.lift})`; g.fillRect(it.x + 14, it.y + 18, CELL_W, CELL_H); }
      drawCell(g, pal, it.cell, it.x, it.y, Math.abs(it.flip) < 0.05 ? 0.05 : it.flip);
    }
    // 動作提示的紙箭頭
    const arrow = (x: number, y: number, a: number, alpha: number, sd: number) => {
      if (alpha <= 0.01) return;
      g.save(); g.translate(x, y); g.rotate(a); g.globalAlpha = alpha;
      cut(g, roughPoly([[-50, -9], [24, -9], [24, -22], [54, 0], [24, 22], [24, 9], [-50, 9]], sd, 0.6, 1e9), hex(pal.paperNote), { shadow: 4, lw: 2 });
      g.restore();
    };
    const pulse = (a: number, b: number) => (s.reduce ? 0.9 : smooth(a - 0.4, a, tt) * (1 - smooth(b, b + 0.4, tt)));
    arrow(450, HOUSE_Y - 40, 0, pulse(...CUBE_STEPS[0]), 880);
    arrow(HOUSE_X + CELL_W * 3 + 80, HOUSE_Y + CELL_H * 1.5, Math.PI / 2, pulse(...CUBE_STEPS[2]), 881);
    if (s.reduce || (tt > CUBE_STEPS[1][0] - 0.4 && tt < CUBE_STEPS[1][1] + 0.4)) {
      g.save(); g.translate(450, HOUSE_Y + CELL_H * 1.5); g.globalAlpha = pulse(...CUBE_STEPS[1]);
      g.strokeStyle = hex(pal.paperNote); g.lineWidth = 8; g.lineCap = 'round';
      g.beginPath(); g.ellipse(0, 0, CELL_W * 0.62, 22, 0, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
      g.restore();
    }
  }, [450, 380]);
  // 晃動的灰
  motes(g, 150, 150, 600, 450, 30, t, 890, 'rgba(255,236,200,0.5)', 2, s.reduce, -20);
  vignette(s, 450, 380, 220, 'rgba(10,6,20,A)', 0.55);
};

// ── 9 門窗鎖死；筆身浮現刻字 (1-1 門廊) ──

/** 門廊 (1-1) 剪紙版：壁紙、護牆板、地板、吊燈、通往玄關的門與畫在牆上的門把 */
function porchRoom(s: SceneCtx, flat: boolean): void {
  const { g, pal } = s;
  wallpaper(s, 400, 46, 33);
  cut(g, roughRect(s.view.x0 - 80, 400, s.view.x1 - s.view.x0 + 160, 74, 34, 1.4), hex(pal.wainscot), { shadow: 0 });
  g.fillStyle = hex(pal.trim); g.fillRect(s.view.x0 - 80, 398, s.view.x1 - s.view.x0 + 160, 8);
  planks(s, 474, pal.floorA, pal.floorB, pal.floorLine, 35);
  g.fillStyle = hex(pal.cord); g.fillRect(448, s.view.y0 - 80, 4, 160 - s.view.y0);
  glow(g, 450, 120, 220, pal.lampLight, flat ? 0 : 0.55);
  cut(g, roughPoly([[410, 80], [490, 80], [520, 124], [380, 124]], 36, 1), hex(pal.lampShade));
  cut(g, roughRect(548, 216, 152, 262, 37, 1.2), hex(pal.doorFrame));
  cut(g, roughRect(562, 230, 124, 248, 38, 1.2), hex(pal.door));
  cut(g, roughRect(580, 250, 88, 90, 39, 1), hex(pal.doorPanel), { shadow: 2, lw: 2 });
  cut(g, roughRect(580, 356, 88, 100, 40, 1), hex(pal.doorPanel), { shadow: 2, lw: 2 });
  g.strokeStyle = hex(pal.inkBlue); g.lineWidth = 3.4;
  g.beginPath(); g.arc(732, 352, 13, 0, TAU); g.stroke();
  g.beginPath(); g.moveTo(719, 352); g.lineTo(706, 352); g.stroke();
  g.fillStyle = hex(pal.inkPurple);
  for (const [x, y] of [[752, 330], [758, 372], [716, 378]] as const) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
  cut(g, roughRect(740, 452, 190, 24, 41, 1), hex(pal.stone));
  cut(g, roughRect(770, 430, 160, 24, 42, 1), hex(pal.stoneTop));
}

/** 墨線封印 (門窗上的發光網格)：x, y, w, h；a = 亮度 */
function inkSeal(s: SceneCtx, x: number, y: number, w: number, h: number, a: number): void {
  const { g, pal } = s;
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  additive(g, () => {
    g.strokeStyle = rgba(pal.inkGlow, 0.5 * a); g.lineWidth = 7;
    g.beginPath();
    for (let k = -h; k < w; k += 34) { g.moveTo(x + k, y); g.lineTo(x + k + h, y + h); g.moveTo(x + k + h, y); g.lineTo(x + k, y + h); }
    g.stroke();
    g.strokeStyle = rgba(0xeaf6ff, 0.8 * a); g.lineWidth = 1.8; g.stroke();
  });
  g.restore();
  g.strokeStyle = rgba(pal.inkBlue, 0.9 * a); g.lineWidth = 3; g.strokeRect(x, y, w, h);
}

const locked: SceneDraw = s => {
  const { g, pal, t } = s;
  const pull = s.reduce ? 0 : smooth(0.2, 0.5, t) * (1 - smooth(1.8, 2.2, t));
  const rattle = pull * Math.sin(t * 38) * 3;
  const seal = s.reduce ? 1 : smooth(1.0, 2.2, t) * (0.8 + 0.2 * Math.sin(t * 3));
  layer(s, 1, () => {
    porchRoom(s, false);
    // 窗 (左)：推不動
    cut(g, roughRect(120, 130, 210, 230, 900, 1.2), hex(pal.trim), { shadow: 6 });
    cut(g, roughRect(134, 144, 182, 202, 901, 1), vGrad(g, 144, 346, [[0, '#5a4c78'], [1, '#c58a7a']]), { shadow: 0 });
    g.fillStyle = hex(pal.trim); g.fillRect(221, 144, 8, 202); g.fillRect(134, 240, 182, 8);
    cut(g, roughRect(204, 232, 42, 24, 902, 0.5), hex(pal.brass), { shadow: 2, lw: 1.6 });
    inkSeal(s, 134, 144, 182, 202, seal);
    // 門上的封印與晃動的門把
    inkSeal(s, 562, 230, 124, 248, seal);
    g.save(); g.translate(rattle, 0);
    cut(g, roughEllipse(586, 360, 9, 9, 903, 0.3), hex(pal.brass), { shadow: 2, lw: 1.6 });
    g.restore();
    if (pull > 0.1) {
      g.strokeStyle = INK; g.lineWidth = 2.4; g.lineCap = 'round';
      for (const [a, b] of [[548, 330], [544, 362], [548, 394]] as const) { g.beginPath(); g.moveTo(a, b); g.lineTo(a - 18, b + (b - 362) * 0.3); g.stroke(); }
    }
    // 你：拉著門把
    drafter(g, 512, 566, 230, 0, drafterColors(pal), 300);
  }, [450, 360]);
  // 第 2 段：切到鋼筆特寫 (房間暗下去)，筆身轉過來、浮現刻字
  vignette(s, 450, 360, 220, 'rgba(30,18,10,A)', 0.5);
  const close = s.reduce ? smooth(3.4, 3.8, t) : smooth(3.4, 4.4, t);
  if (close > 0) {
    g.save();
    g.globalAlpha = close;
    fillView(s, vGrad(g, s.view.y0, s.view.y1, [[0, '#1c130c'], [0.55, '#2e2016'], [1, '#160f0a']]));
    woodGrain(g, s.view.x0 - 40, s.view.x1 + 40, 430, s.view.y1 + 40, 50, 'rgba(0,0,0,0.3)');
    additive(g, () => { glow(g, 450, 330, 460, pal.inkHalo, 0.22); glow(g, 450, 120, 520, pal.lampLight, 0.16); });
    layer(s, 1.3, () => {
      const px = 70, py = 350, len = 780, th = 96;
      // 落在桌上的影子
      g.save(); g.translate(0, py + th * 1.5); g.scale(1, 0.18);
      const sh = g.createRadialGradient(px + len * 0.5, 0, 10, px + len * 0.5, 0, len * 0.55);
      sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = sh; g.fillRect(px - 100, -len * 0.6, len + 200, len * 1.2);
      g.restore();
      pen(g, px, py, len, th, hex(pal.pen), hex(pal.brass), 70);
      const rot = s.reduce ? 1 : smooth(3.6, 6.0, t);
      const clip = new Path2D(); clip.rect(px, py - th / 2, len * 0.82, th);
      g.save(); g.clip(clip);
      g.fillStyle = vGrad(g, py - th / 2, py + th / 2, [[0, 'rgba(255,255,255,0.14)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,20,0.34)']]);
      g.fillRect(px, py - th / 2, len, th);
      const hy = py - th / 2 + th * (0.15 + 0.6 * rot);
      const hg = g.createLinearGradient(0, hy - 16, 0, hy + 16);
      hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.5, 'rgba(220,230,255,0.38)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hg; g.fillRect(px, hy - 16, len, 32);
      const ea = s.reduce ? close : smooth(4.6, 6.2, t);
      g.globalAlpha = ea;
      const tx = px + len * 0.6, ty = py + 3 + (1 - rot) * 10;
      serif(g, s.labels.engrave ?? '', tx + 1.5, ty + 1.5, 26, 'rgba(10,14,40,0.75)', { spacing: 4, weight: 700 });
      g.shadowColor = '#f6dc8c'; g.shadowBlur = 16 * ea;
      serif(g, s.labels.engrave ?? '', tx, ty, 26, '#f8e3a0', { spacing: 4, weight: 700 });
      g.restore();
      additive(g, () => glow(g, px + len * 0.97, py, 50, pal.gold, 0.4));
    }, [450, 320]);
    g.restore();
  }
};

// ── 10 按下鋼筆：老宅被壓平成圖；角落站著一個人影 ──
const flatten: SceneDraw = s => {
  const { g, pal, t, view } = s;
  fillView(s, hex(s.room2d.paper));
  g.strokeStyle = rgba(pal.inkBlue, 0.09); g.lineWidth = 1.2;
  for (let x = Math.floor(view.x0 / 30) * 30; x < view.x1; x += 30) { g.beginPath(); g.moveTo(x, view.y0); g.lineTo(x, view.y1); g.stroke(); }
  for (let y = Math.floor(view.y0 / 30) * 30; y < view.y1; y += 30) { g.beginPath(); g.moveTo(view.x0, y); g.lineTo(view.x1, y); g.stroke(); }
  const ink = hex(pal.inkBlue);
  // 圖紙的雙線外框
  g.strokeStyle = rgba(pal.inkBlue, 0.55); g.lineWidth = 2.4; g.strokeRect(24, 14, 852, 686);
  g.lineWidth = 1; g.strokeRect(34, 24, 832, 666);
  // 線條逐步畫上 (第 2 段：整棟老宅被壓平)
  const draw = s.reduce ? 1 : smooth(1.4, 5.6, t);
  const wash2 = s.reduce ? 1 : smooth(3.0, 6.0, t);
  const pale = (c: number) => tint(c, 0.6);
  const X0 = 70, Y0 = 50, CW = 230, CH = 186;
  // 淡彩：九間房 (重組後的順序)
  const walls = [0xe5b9a8, 0xe9c9a0, 0xc7c9e6, 0xd8c6e0, 0xf0dcb8, 0xc9d7c0, 0xe8d4a2, 0xd9b48c, 0xbfd6dc];
  g.globalAlpha = wash2;
  walls.forEach((w, i) => cut(g, roughRect(X0 + (i % 3) * CW, Y0 + Math.floor(i / 3) * CH, CW, CH, 950 + i, 1), pale(w), { shadow: 0, outline: false }));
  g.globalAlpha = 1;
  // 墨線：外牆、隔間、門弧、樓梯
  g.save();
  g.setLineDash([2400 * draw, 2400]);
  g.strokeStyle = ink; g.lineWidth = 4; g.lineJoin = 'round';
  g.strokeRect(X0, Y0, CW * 3, CH * 3);
  g.lineWidth = 2.6;
  for (let k = 1; k < 3; k++) {
    g.beginPath(); g.moveTo(X0 + k * CW, Y0); g.lineTo(X0 + k * CW, Y0 + CH * 3); g.stroke();
    g.beginPath(); g.moveTo(X0, Y0 + k * CH); g.lineTo(X0 + CW * 3, Y0 + k * CH); g.stroke();
  }
  g.restore();
  const det = s.reduce ? 1 : smooth(3.0, 5.6, t);
  g.globalAlpha = det;
  g.strokeStyle = ink; g.lineWidth = 2.2;
  // 門 (缺口 + 四分之一圓弧)
  for (const [x, y, a] of [[X0 + CW, Y0 + 40, 0], [X0 + CW * 2, Y0 + CH + 50, 0], [X0 + 60, Y0 + CH * 2, Math.PI / 2], [X0 + CW + 80, Y0 + CH * 3, Math.PI / 2]] as const) {
    g.save(); g.translate(x, y); g.rotate(a);
    g.fillStyle = hex(s.room2d.paper); g.fillRect(-3, 0, 6, 46);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(42, 0); g.arc(0, 0, 42, 0, Math.PI / 2); g.stroke();
    g.restore();
  }
  // 樓梯 (中間那格，翻過來)
  for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(X0 + CW + 40 + k * 18, Y0 + CH + 30); g.lineTo(X0 + CW + 40 + k * 18, Y0 + CH * 2 - 30); g.stroke(); }
  g.beginPath(); g.moveTo(X0 + CW + 36, Y0 + CH * 1.5); g.lineTo(X0 + CW + 170, Y0 + CH * 1.5); g.lineTo(X0 + CW + 156, Y0 + CH * 1.5 - 10); g.stroke();
  // 家具輪廓
  g.strokeRect(X0 + 20, Y0 + 20, 60, 24); g.strokeRect(X0 + CW * 2 + 120, Y0 + 20, 60, 90);
  g.strokeRect(X0 + 30, Y0 + CH + 40, 110, 50); g.strokeRect(X0 + CW * 2 + 40, Y0 + CH * 2 + 50, 100, 40);
  g.beginPath(); g.arc(X0 + CW + 100, Y0 + 70, 26, 0, TAU); g.stroke();
  // 只在圖上的墨點符號
  g.fillStyle = hex(pal.inkPurple);
  const r = rng(96);
  for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(X0 + 30 + r() * 540, Y0 + 30 + r() * 390, 2 + r() * 2.5, 0, TAU); g.fill(); }
  // 標題欄 (右下角的格線)
  g.lineWidth = 1.6;
  g.strokeRect(X0 + CW * 3 - 170, Y0 + CH * 3 + 14, 170, 44);
  g.beginPath(); g.moveTo(X0 + CW * 3 - 170, Y0 + CH * 3 + 36); g.lineTo(X0 + CW * 3, Y0 + CH * 3 + 36); g.moveTo(X0 + CW * 3 - 70, Y0 + CH * 3 + 14); g.lineTo(X0 + CW * 3 - 70, Y0 + CH * 3 + 58); g.stroke();
  // 壓在圖上的尺 (剪紙)
  g.save(); g.translate(X0 + CW * 3 + 44, 190); g.rotate(0.04);
  cut(g, roughRect(-20, 0, 40, 400, 960, 0.8), 'rgba(250,240,210,0.92)', { shadow: 5, lw: 2, stroke: ink });
  g.strokeStyle = ink; g.lineWidth = 1.4;
  for (let k = 0; k <= 40; k++) { g.beginPath(); g.moveTo(-20, 10 + k * 9.5); g.lineTo(-20 + (k % 5 ? 8 : 15), 10 + k * 9.5); g.stroke(); }
  g.restore();
  // 羅盤
  g.save(); g.translate(X0 + CW * 3 + 50, Y0 + 70);
  g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, 32, 0, TAU); g.stroke();
  cut(g, roughPoly([[0, -44], [8, 0], [0, 44], [-8, 0]], 97, 0.3, 1e9), ink, { shadow: 0, lw: 1.6, stroke: ink });
  serif(g, 'N', 0, -56, 18, ink, { weight: 700 });
  g.restore();
  g.globalAlpha = 1;
  // 圖上的你 (扁平描邊)
  drafter(g, X0 + CW * 1.5, Y0 + CH * 2 - 18, 116, 0, drafterColors(pal), 300, true);
  // 筆尖點下：墨水暈開 (第 1 段)
  const sp = s.reduce ? 1 : clamp01((t - 0.9) / 1.5);
  if (sp > 0 && sp < 1) {
    g.fillStyle = rgba(pal.inkBlue, 0.5 * (1 - sp));
    g.beginPath(); g.arc(X0 + CW * 1.5, Y0 + CH * 2 - 50, 30 + sp * 560, 0, TAU); g.fill();
    g.strokeStyle = rgba(pal.inkPurple, 0.6 * (1 - sp)); g.lineWidth = 8 * (1 - sp) + 1;
    g.beginPath(); g.arc(X0 + CW * 1.5, Y0 + CH * 2 - 50, 20 + sp * 460, 0, TAU); g.stroke();
  }
  // 第 3 段：左上角那間房，好像站著一個人 (祖先的守衛殘影：淡紫、三重錯位、微微閃爍；出現後不再消失)
  const a = s.reduce ? smooth(7.6, 8.2, t) : smooth(7.8, 9.4, t) * (0.75 + 0.25 * Math.sin(t * 5.3) * Math.sin(t * 2.1));
  if (a > 0.001) {
    for (const [dx, dy] of [[-3, 0], [3, 1], [0, -2]] as const) {
      standingFigure(g, X0 + 60 + dx, Y0 + CH - 16 + dy, 140, 'rgb(118,98,160)', 400, { alpha: a * 0.32, outline: null });
    }
    additive(g, () => glow(g, X0 + 60, Y0 + CH - 84, 90, pal.inkPurple, 0.14 * a));
  }
};

// ── 11 回到實景：牆上爸爸的字條 ──
const note: SceneDraw = s => {
  const { g, pal, t } = s;
  layer(s, 0.6, () => {
    wallpaper(s, 620, 60, 51);
    cut(g, roughRect(s.view.x0 - 80, 620, s.view.x1 - s.view.x0 + 160, B(s) - 620, 52, 1.4), hex(pal.wainscot), { shadow: 0 });
    g.fillStyle = hex(pal.trim); g.fillRect(s.view.x0 - 80, 616, s.view.x1 - s.view.x0 + 160, 10);
    // 壁燈
    for (const x of [40, 860]) {
      additive(g, () => glow(g, x, 260, 190, pal.lampLight, 0.42));
      cut(g, roughRect(x - 8, 270, 16, 40, 60 + x, 0.4), hex(pal.brass), { shadow: 3, lw: 1.6 });
      cut(g, roughPoly([[x - 26, 220], [x + 26, 220], [x + 16, 272], [x - 16, 272]], 62 + x, 0.6), hex(pal.lampShade), { shadow: 3 });
    }
    // 以前貼過又撕掉的字條痕跡 (爸爸試了很多次)
    for (const [x, y, a, sd] of [[190, 190, -0.12, 1], [720, 180, 0.1, 2], [180, 470, 0.08, 3], [730, 490, -0.06, 4]] as const) {
      g.save(); g.translate(x, y); g.rotate(a);
      cut(g, roughRect(-60, -40, 120, 84, 70 + sd, 1.4), tint(pal.paperNote, -0.12), { shadow: 3, alpha: 0.75 });
      for (let i = 0; i < 3; i++) scribble(g, -46, -16 + i * 20, 80 - i * 12, 74 + sd * 3 + i, 'rgba(74,50,32,0.55)', 1.6);
      if (sd % 2) { g.strokeStyle = 'rgba(165,69,45,0.6)'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(-40, -26); g.lineTo(40, 30); g.moveTo(40, -26); g.lineTo(-40, 30); g.stroke(); }
      g.restore();
      cut(g, roughEllipse(x, y - 38, 6, 6, 80 + sd, 0.3), tint(pal.pin, -0.2), { shadow: 2, lw: 1.2 });
    }
  }, [450, 330]);
  layer(s, 1, () => {
    const f = s.reduce ? 0 : Math.sin((t - 3.9) * 7) * 0.04 * Math.exp(-Math.max(t - 3.9, 0) * 1.1) * (t > 3.9 ? 1 : 0);
    g.save();
    g.translate(450, 190);
    g.rotate(0.03 + f);
    g.scale(1.22, 1.22);
    cut(g, roughRect(-200, 0, 400, 300, 53, 1.8), hex(pal.paperNote), { shadow: 10 });
    g.fillStyle = 'rgba(160,120,70,0.12)'; g.fillRect(-196, 4, 392, 292);
    // 橫格線
    g.strokeStyle = 'rgba(61,99,255,0.18)'; g.lineWidth = 1.2;
    for (let y = 44; y < 290; y += 30) { g.beginPath(); g.moveTo(-184, y); g.lineTo(184, y); g.stroke(); }
    for (let i = 0; i < 4; i++) scribble(g, -164, 56 + i * 30, 250 - (i % 2) * 70, 54 + i, '#4a3220', 2.6);
    scribble(g, -164, 186, 200, 58, '#4a3220', 2.6);
    // 爸爸畫的小魔法陣草圖、箭頭與問號
    g.save(); g.translate(110, 196); g.scale(1, 0.9);
    sigil(g, 44, rgba(pal.inkBlue, 0.75), 1.6);
    g.restore();
    g.strokeStyle = 'rgba(74,50,32,0.8)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(40, 250); g.quadraticCurveTo(70, 270, 100, 250); g.lineTo(92, 246); g.stroke();
    serif(g, '?', 170, 150, 30, '#a5452d', { weight: 700 });
    serif(g, '?', 40, 200, 22, '#a5452d', { weight: 700 });
    scribble(g, 70, 274, 90, 59, '#4a3220', 2.2);
    g.restore();
    // 膠帶與圖釘
    for (const [x, y, a, sd] of [[220, 200, -0.5, 1], [684, 212, 0.45, 2]] as const) {
      g.save(); g.translate(x, y); g.rotate(a);
      cut(g, roughRect(-34, -11, 68, 22, 90 + sd, 0.8), 'rgba(240,228,190,0.82)', { shadow: 2, lw: 1.2 });
      g.restore();
    }
    cut(g, roughEllipse(450, 202, 12, 12, 59, 0.4), hex(pal.pin), { shadow: 4 });
    glow(g, 446, 198, 10, 0xffffff, 0.5);
  }, [450, 330]);
  vignette(s, 450, 330, 200, 'rgba(30,18,10,A)', 0.55);
};

// ── 12 標題卡 ──
const title: SceneDraw = s => {
  const { g, pal, t, view } = s;
  fillView(s, vGrad(g, view.y0, view.y1, [[0, pal.bgTop], [1, pal.bgBottom]]));
  g.strokeStyle = rgba(pal.inkBlue, 0.07); g.lineWidth = 1.2;
  for (let x = Math.floor(view.x0 / 50) * 50; x < view.x1; x += 50) { g.beginPath(); g.moveTo(x, view.y0); g.lineTo(x, view.y1); g.stroke(); }
  for (let y = Math.floor(view.y0 / 50) * 50; y < view.y1; y += 50) { g.beginPath(); g.moveTo(view.x0, y); g.lineTo(view.x1, y); g.stroke(); }
  // 背景：淡淡轉著的魔法陣
  g.save(); g.translate(450, 330); g.globalAlpha = 0.1; g.rotate(s.reduce ? 0 : t * 0.05);
  sigil(g, 250, hex(pal.inkBlue), 3);
  g.restore();
  // 四角剪紙裝飾
  for (const [x, y, sx, sy, sd] of [[60, 60, 1, 1, 1], [840, 60, -1, 1, 2], [60, 640, 1, -1, 3], [840, 640, -1, -1, 4]] as const) {
    cut(g, roughPoly([[x, y], [x + sx * 110, y], [x, y + sy * 110]], 120 + sd, 1.2), hex(sd % 2 ? pal.inkBlue : pal.coat), { shadow: 3 });
    cut(g, roughPoly([[x + sx * 14, y + sy * 14], [x + sx * 70, y + sy * 14], [x + sx * 14, y + sy * 70]], 130 + sd, 0.8), hex(pal.paperNote), { shadow: 0, lw: 1.6 });
  }
  const a = smooth(0.4, 1.8, t);
  g.globalAlpha = a;
  serif(g, s.labels.title ?? '', 452, 322, 104, 'rgba(40,24,12,0.25)', { spacing: 30 });
  serif(g, s.labels.title ?? '', 450, 318, 104, INK, { spacing: 30 });
  g.fillStyle = INK; g.fillRect(250, 404, 400, 2.4);
  // 標題下的鋼筆
  pen(g, 330, 450, 240, 18, hex(pal.pen), hex(pal.brass), 70);
  additive(g, () => glow(g, 570, 450, 40, pal.inkGlow, 0.5 * a));
  g.globalAlpha = 1;
};

// ── cs:ch2 爸爸的書房「第四十一次」(3 鏡；cutscenes-v0.1 4) ──

/** cs:ch2 鏡 1：書桌上攤開的爸爸筆記 (魔法陣草圖、日期、問號、劃掉的字)；第 2 段時最後一行 (labels.note) 被檯燈照亮 */
const ch2Notebook: SceneDraw = s => {
  const { g, pal, t } = s;
  // 桌面 (胡桃木) 蓋滿畫面
  fillView(s, hex(pal.tableTop));
  woodGrain(g, L(s), R(s), s.view.y0 - 80, B(s), 1201, 'rgba(70,40,20,0.22)');
  layer(s, 0.5, () => {
    // 桌角：墨水瓶、鋼筆架、散落的便條
    cut(g, roughRect(760, 90, 70, 86, 1202, 0.8), '#2d3f8f', { shadow: 5 });
    cut(g, roughRect(774, 70, 42, 24, 1203, 0.5), hex(pal.trim), { shadow: 2, lw: 1.6 });
    for (const [x, y, a, sd] of [[90, 120, -0.2, 1], [120, 560, 0.15, 2], [790, 560, -0.1, 3]] as const) {
      g.save(); g.translate(x, y); g.rotate(a);
      cut(g, roughRect(-60, -40, 120, 80, 1210 + sd, 1.2), tint(pal.paperNote, -0.08), { shadow: 3 });
      for (let i = 0; i < 3; i++) scribble(g, -46, -18 + i * 18, 84 - i * 14, 1220 + sd * 3 + i, 'rgba(74,50,32,0.55)', 1.5);
      g.restore();
    }
  }, [450, 340]);
  layer(s, 1, () => {
    // 攤開的筆記本 (兩頁)
    g.save();
    g.translate(450, 330);
    g.rotate(-0.04);
    cut(g, roughPoly([[-330, -230], [0, -246], [330, -230], [322, 236], [0, 222], [-322, 236]], 1230, 1.6), hex(pal.paperNote), { shadow: 10 });
    g.fillStyle = 'rgba(160,120,70,0.10)'; g.fillRect(-320, -228, 640, 460);
    g.strokeStyle = 'rgba(58,38,24,0.45)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -246); g.lineTo(0, 222); g.stroke();
    // 左頁：三個大小不一的魔法陣草圖 (一個被劃掉)
    for (const [x, y, r, sd] of [[-170, -120, 78, 1], [-230, 70, 52, 2], [-96, 92, 60, 3]] as const) {
      g.save(); g.translate(x, y); g.scale(1, 0.92);
      sigil(g, r, rgba(pal.inkBlue, 0.6 + 0.1 * sd), 1.4);
      g.restore();
      if (sd === 2) { g.strokeStyle = 'rgba(165,69,45,0.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - r, y - r * 0.8); g.lineTo(x + r, y + r * 0.8); g.stroke(); }
    }
    serif(g, '?', -40, -170, 34, '#a5452d', { weight: 700 });
    serif(g, '?', -300, -10, 26, '#a5452d', { weight: 700 });
    // 右頁：日期 + 字跡 + 劃掉的字，一行一行往下
    for (let i = 0; i < 8; i++) {
      const y = -196 + i * 46;
      serif(g, `${3 + (i % 9)}/${10 + i * 2}`, 44, y, 15, 'rgba(74,50,32,0.7)', { align: 'left' });
      scribble(g, 100, y, 150 - (i % 3) * 30, 1240 + i, '#4a3220', 2);
      if (i % 3 === 1) { g.strokeStyle = 'rgba(74,50,32,0.8)'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(96, y - 2); g.lineTo(240 - (i % 3) * 30, y + 2); g.stroke(); }
      if (i % 4 === 2) serif(g, '?', 280, y, 22, '#a5452d', { weight: 700 });
    }
    // 最後一行：爸爸寫的「第四十一次。還是不亮？」(畫面字；第 2 段時被檯燈照亮)
    const hl = smooth(4.0, 5.6, t);
    if (hl > 0) additive(g, () => glow(g, 170, 196, 190, pal.lampLight, 0.32 * hl));
    serif(g, s.labels.note ?? '', 172, 196, 24, INK, { weight: 600 });
    g.strokeStyle = 'rgba(74,50,32,0.55)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(40, 214); g.lineTo(306, 212); g.stroke();
    g.restore();
  }, [560, 520]);
  // 檯燈的暖光 (左上)
  additive(g, () => glow(g, 180, 60, 420, pal.lampLight, 0.16));
  vignette(s, 450, 360, 220, 'rgba(30,18,10,A)', 0.55);
};

/** 殘影 (只在 2D：半透明灰藍；story-bible 8.2)：手裡一本書，phase 0..1 = 翻一頁、搖一次頭 */
function readingGhost(g: CanvasRenderingContext2D, x: number, y: number, h: number, phase: number, flip: number, reduce: boolean): void {
  const ghost = 'rgba(138,150,176,0.42)';
  const shake = reduce ? 0 : Math.sin(clamp01((phase - 0.55) / 0.4) * TAU * 2) * 0.12 * (phase > 0.55 && phase < 0.95 ? 1 : 0);
  g.save();
  g.translate(x, y);
  g.scale(flip, 1);
  standingFigure(g, 0, 0, h, ghost, 1300, { outline: 'rgba(90,100,130,0.55)', lean: shake * 0.3 });
  // 書 (攤在手上)：翻頁 = 右頁抬起翻到左邊
  const by = -h * 0.5, bx = h * 0.2;
  g.fillStyle = 'rgba(230,226,236,0.55)'; g.strokeStyle = 'rgba(90,100,130,0.6)'; g.lineWidth = 1.6;
  g.beginPath(); g.rect(bx - 22, by - 14, 44, 28); g.fill(); g.stroke();
  const turn = reduce ? 0 : clamp01(phase / 0.45);
  const fx = bx + Math.cos(turn * Math.PI) * 20;
  g.beginPath(); g.moveTo(bx, by - 14); g.lineTo(fx, by - 16 + Math.sin(turn * Math.PI) * -10); g.lineTo(fx, by + 12); g.lineTo(bx, by + 14); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

/** cs:ch2 鏡 2：藏寶圖風格的書庫 (奶油紙、淡墨格線、扁平書架)：兩道殘影在書架之間來回翻書、搖頭 (2.4 秒一輪；靜止長鏡頭) */
const ch2Shadows: SceneDraw = s => {
  const { g, pal, t, view } = s;
  fillView(s, vGrad(g, view.y0, view.y1, [[0, pal.bgTop], [1, pal.bgBottom]]));
  g.strokeStyle = rgba(pal.inkBlue, 0.06); g.lineWidth = 1.2;
  for (let x = Math.floor(view.x0 / 50) * 50; x < view.x1; x += 50) { g.beginPath(); g.moveTo(x, view.y0); g.lineTo(x, view.y1); g.stroke(); }
  for (let y = Math.floor(view.y0 / 50) * 50; y < view.y1; y += 50) { g.beginPath(); g.moveTo(view.x0, y); g.lineTo(view.x1, y); g.stroke(); }
  // 地板線
  g.fillStyle = 'rgba(58,38,24,0.12)'; g.fillRect(L(s), 560, R(s) - L(s), B(s) - 560);
  g.strokeStyle = INK; g.lineWidth = 2.4; g.beginPath(); g.moveTo(L(s), 560); g.lineTo(R(s), 560); g.stroke();
  // 三座高書架 (扁平色 + 描邊，同遊戲裡的藏寶圖)
  for (const [x, w, sd] of [[60, 200, 1], [350, 200, 2], [640, 200, 3]] as const) {
    cut(g, roughRect(x, 60, w, 500, 1310 + sd, 1.2), hex(pal.shelf), { shadow: 4, lw: 2.4 });
    const r = rng(1320 + sd);
    for (let row = 0; row < 5; row++) {
      const y = 76 + row * 96;
      g.fillStyle = hex(pal.shelfDark); g.fillRect(x + 12, y + 80, w - 24, 8);
      let bx = x + 16;
      while (bx < x + w - 24) {
        const bw = 12 + r() * 12, bh = 52 + r() * 24;
        cut(g, roughRect(bx, y + 80 - bh, bw, bh, 1330 + row * 40 + Math.round(bx), 0.5), hex(pal.books[Math.floor(r() * pal.books.length)]), { shadow: 0, lw: 1.3 });
        bx += bw + 3;
      }
    }
  }
  // 兩道殘影 (書架之間的走道)，錯開半輪：翻一頁、搖一次頭
  const k = s.reduce ? 0.3 : (t % 2.4) / 2.4;
  readingGhost(g, 305, 560, 170, k, 1, s.reduce);
  readingGhost(g, 595, 560, 165, (k + 0.5) % 1, -1, s.reduce);
  vignette(s, 450, 330, 240, 'rgba(60,48,30,A)', 0.35);
};

/** 剖面魔方的一格：書庫 (書架) 或溫室 (玻璃格 + 植物)；x, y = 左上角 */
function ch2Block(g: CanvasRenderingContext2D, pal: Palette, kind: 'study' | 'greenhouse', x: number, y: number, w: number, h: number, seed: number): void {
  cut(g, roughRect(x, y, w, h, seed, 1.2), kind === 'study' ? '#e9c9a0' : '#cfe3c6', { shadow: 8, lw: 3 });
  g.fillStyle = 'rgba(40,24,12,0.14)'; g.fillRect(x + 4, y + 4, w - 8, 12);
  cut(g, roughRect(x, y + h - 20, w, 20, seed + 1, 0.6), hex(pal.floorB), { shadow: 0, lw: 2 });
  const r = rng(seed + 2);
  if (kind === 'study') {
    for (const sx of [0.08, 0.56]) {
      const bx = x + w * sx, bw = w * 0.36;
      cut(g, roughRect(bx, y + 26, bw, h - 52, seed + 3 + sx * 10, 0.6), hex(pal.shelf), { shadow: 2, lw: 1.8 });
      for (let row = 0; row < 3; row++) for (let b = 0; b < 4; b++) {
        cut(g, roughRect(bx + 6 + b * (bw - 12) / 4, y + 32 + row * (h - 60) / 3, (bw - 12) / 4 - 2, (h - 60) / 3 - 8, seed + 20 + row * 4 + b, 0.3), hex(pal.books[Math.floor(r() * pal.books.length)]), { shadow: 0, lw: 1 });
      }
    }
    // 書庫的門 (右下)
    cut(g, roughRect(x + w - 40, y + h - 84, 30, 64, seed + 40, 0.4), hex(pal.door), { shadow: 2, lw: 1.6 });
  } else {
    // 玻璃屋頂 (斜格) + 彩繪玻璃窗 + 幾盆植物
    const colors = ['#3e8a5a', '#d9a441', '#6aa84f', '#9fe3d0'];
    for (let c = 0; c < 4; c++) for (let k = 0; k < 2; k++) {
      cut(g, roughRect(x + 14 + c * (w - 28) / 4, y + 24 + k * 46, (w - 28) / 4 - 6, 40, seed + 50 + c * 2 + k, 0.4), colors[(c + k * 2 + Math.floor(r() * 2)) % 4], { shadow: 0, lw: 1.6, alpha: 0.9 });
    }
    for (let i = 0; i < 3; i++) {
      const px = x + 30 + i * (w - 60) / 2, py = y + h - 20;
      cut(g, roughPoly([[px - 16, py - 30], [px + 16, py - 30], [px + 11, py], [px - 11, py]], seed + 60 + i, 0.4), hex(pal.crate), { shadow: 2, lw: 1.6 });
      cut(g, roughEllipse(px, py - 46, 22, 20, seed + 70 + i, 1.2), '#5f8a3a', { shadow: 2, lw: 1.6 });
    }
  }
}

/** cs:ch2 鏡 3：剖面魔方——書庫方塊與溫室方塊沿格線對調 (2.5 秒：一個從上面繞、一個從下面繞)；交換後彩繪玻璃的綠光照進書庫的門 */
const ch2Swap: SceneDraw = s => {
  const { g, pal, t } = s;
  const tt = s.reduce ? 6 : t;
  fillView(s, vGrad(g, s.view.y0, s.view.y1, [[0, '#24303a'], [0.6, '#3c4a46'], [1, '#4a5a48']]));
  layer(s, 0.3, () => {
    const r = rng(1400);
    g.fillStyle = 'rgba(230,240,220,0.7)';
    for (let i = 0; i < 36; i++) { g.beginPath(); g.arc(r() * 1300 - 200, r() * 280 - 40, 1 + r() * 1.5, 0, TAU); g.fill(); }
  });
  const W = 260, H = 200, Y = 240, AX = 150, BX = 490;
  layer(s, 1, () => {
    // 外框 (老宅剖面)
    cut(g, roughPoly([[AX - 50, Y + 4], [450, Y - 170], [BX + W + 50, Y + 4]], 1401, 2), '#5b3424', { shadow: 8 });
    cut(g, roughRect(AX - 20, Y - 10, BX + W - AX + 40, H + 30, 1402, 1.4), '#4a2f22', { shadow: 8 });
    g.fillStyle = '#20141c'; g.fillRect(AX, Y, W, H); g.fillRect(BX, Y, W, H);
    // 對調：0.8～3.3 秒；書庫從上面繞到右邊、溫室從下面繞到左邊
    const u = smooth(0.8, 3.3, tt);
    const lift = Math.sin(u * Math.PI);
    const studyX = AX + (BX - AX) * u, greenX = BX + (AX - BX) * u;
    const items = [{ kind: 'greenhouse' as const, x: greenX, y: Y + lift * 70, sd: 1450 }, { kind: 'study' as const, x: studyX, y: Y - lift * 90, sd: 1410 }];
    for (const it of items) {
      if (lift > 0.05) { g.fillStyle = `rgba(0,0,0,${0.22 * lift})`; g.fillRect(it.x + 14, it.y + 18, W, H); }
      ch2Block(g, pal, it.kind, it.x, it.y, W, H, it.sd);
    }
    // 交換後：彩繪玻璃的綠光從溫室 (左) 照進書庫 (右) 的門
    const green = smooth(3.4, 5.0, tt);
    if (green > 0) {
      additive(g, () => {
        g.fillStyle = rgba(0x3e8a5a, 0.35 * green);
        g.beginPath(); g.moveTo(AX + W - 10, Y + 40); g.lineTo(BX + W - 40, Y + H - 84); g.lineTo(BX + W - 10, Y + H - 20); g.lineTo(AX + W - 10, Y + H - 30); g.closePath(); g.fill();
        glow(g, BX + W - 25, Y + H - 52, 90, 0x6aa84f, 0.45 * green);
      });
    }
  }, [450, 340]);
  motes(g, 150, 160, 600, 380, 24, t, 1490, 'rgba(210,240,200,0.5)', 2, s.reduce, -16);
  vignette(s, 450, 360, 220, 'rgba(8,14,12,A)', 0.55);
};

/** 未登錄 sceneId 的退回畫面：素紙 */
export const blankScene: SceneDraw = s => fillView(s, vGrad(s.g, s.view.y0, s.view.y1, [[0, s.pal.bgTop], [1, s.pal.bgBottom]]));

/** sceneId → 繪製函式 (新增過場時在這裡登錄) */
export const PAPER_SCENES: Readonly<Record<string, SceneDraw>> = {
  'prologue.emptyHouse': emptyHouse,
  'prologue.mountain': mountain,
  'prologue.study': study,
  'prologue.memory': memory,
  'prologue.rug': rugRoll,
  'prologue.circle': circle,
  'prologue.grasp': grasp,
  'prologue.rearrange': rearrange,
  'prologue.locked': locked,
  'prologue.flatten': flatten,
  'prologue.note': note,
  'prologue.title': title,
  'ch2.notebook': ch2Notebook,
  'ch2.shadows': ch2Shadows,
  'ch2.swap': ch2Swap
};
