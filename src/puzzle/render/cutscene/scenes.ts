// 序章 11 鏡的剪紙分鏡 (cutscenes-v0.1 4)：虛擬座標安全區 900 × 700，構圖重點在上方 3/4 (字幕帶在安全區下方)
// 顏色一律取自主題 (render/themes)；畫面內的字由 labels 傳入 (文字表)
import type { Palette } from '../themes';
import {
  clamp01, cut, drafter, envelope, fillView, glow, hex, key, layer, pen, rgba, rng, roughEllipse, roughPoly, roughRect,
  scribble, serif, smooth, standingFigure, tint, vGrad, waxSeal, type DrafterColors, type Pt
} from './paper';
import type { SceneCtx, SceneDraw } from './types';

const INK = '#3a2618';
/** 畫滿可見範圍用的邊界 (含運鏡與視差的餘裕；向下延伸到字幕帶下方) */
const L = (s: SceneCtx): number => Math.min(-600, s.view.x0 - 300);
const R = (s: SceneCtx): number => Math.max(1500, s.view.x1 + 300);
const B = (s: SceneCtx): number => Math.max(1200, s.view.y1 + 200);

const drafterColors = (p: Palette): DrafterColors => ({
  coat: hex(p.coat), coatDark: hex(p.coatDark), scarf: hex(p.scarf), beret: hex(p.beret), trousers: hex(p.trousers),
  shoes: hex(p.shoes), skin: hex(p.skin), hair: hex(p.hair), cheek: hex(p.cheek)
});

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
  g.fillRect(view.x0 - 40, view.y0 - 40, view.x1 - view.x0 + 80, y1 - view.y0 + 40);
  g.fillStyle = hex(pal.wallStripe);
  const start = Math.floor((view.x0 - 40) / (stripeW * 2)) * stripeW * 2;
  for (let x = start; x < view.x1 + 40; x += stripeW * 2) g.fillRect(x, view.y0 - 40, stripeW, y1 - view.y0 + 40);
  const r = rng(seed);
  g.fillStyle = rgba(pal.wallMotif, 0.55);
  for (let x = start + stripeW * 1.5; x < view.x1 + 40; x += stripeW * 2) {
    for (let y = Math.floor(view.y0 / 90) * 90 + 40; y < y1 - 20; y += 90) {
      g.beginPath(); g.arc(x + (r() - 0.5) * 2, y, 4, 0, Math.PI * 2); g.fill();
    }
  }
}

/** 地板條 */
function planks(s: SceneCtx, y0: number, a: number, b: number, line: number, seed: number): void {
  const { g, view } = s;
  g.fillStyle = hex(a);
  g.fillRect(view.x0 - 40, y0, view.x1 - view.x0 + 80, view.y1 - y0 + 40);
  const r = rng(seed);
  let k = 0;
  for (let y = y0; y < view.y1 + 40; y += 34, k++) {
    if (k % 2) { g.fillStyle = hex(b); g.fillRect(view.x0 - 40, y, view.x1 - view.x0 + 80, 34); }
    g.fillStyle = hex(line);
    g.fillRect(view.x0 - 40, y, view.x1 - view.x0 + 80, 2);
    for (let x = Math.floor(view.x0 / 200) * 200 + r() * 200; x < view.x1 + 40; x += 160 + r() * 120) g.fillRect(x, y, 2, 34);
  }
}

// ── 1 書桌上的信封 ──
const desk: SceneDraw = s => {
  const { g, pal } = s;
  fillView(s, vGrad(g, s.view.y0, 400, [[0, '#24180f'], [1, '#4a3322']]));
  layer(s, 0.55, () => {
    g.fillStyle = 'rgba(0,0,0,0.14)';
    for (let x = -400; x < 1400; x += 120) g.fillRect(x, -300, 3, 650);
    glow(g, 210, 200, 640, pal.lampLight, 0.5);
    cut(g, roughPoly([[L(s), 360], [R(s), 360], [R(s) + 200, B(s)], [L(s) - 200, B(s)]], 11, 3), vGrad(g, 360, 900, [[0, tint(pal.tableTop, 0.1)], [1, hex(pal.table)]]), { shadow: 0 });
    woodGrain(g, L(s), R(s), 380, B(s), 3, 'rgba(110,60,28,0.28)');
    // 檯燈
    g.fillStyle = rgba(pal.lampLight, 0.22);
    g.beginPath(); g.moveTo(72, 222); g.lineTo(222, 222); g.lineTo(420, 560); g.lineTo(-160, 560); g.closePath(); g.fill();
    cut(g, roughEllipse(150, 396, 78, 18, 4), hex(pal.trim));
    cut(g, roughPoly([[143, 392], [155, 392], [200, 230], [188, 226]], 5, 0.5, 1e9), hex(pal.brass));
    glow(g, 148, 224, 120, pal.lampBulb, 0.9);
    cut(g, roughPoly([[88, 140], [208, 140], [246, 222], [50, 222]], 6, 1.2), hex(pal.lampShade));
    // 墨水瓶與一疊紙
    cut(g, roughPoly([[640, 330], [880, 318], [890, 372], [650, 384]], 7, 1.5), tint(pal.paperNote, -0.06));
    cut(g, roughPoly([[660, 318], [890, 300], [900, 352], [668, 368]], 8, 1.5), hex(pal.paperNote));
    cut(g, roughRect(735, 262, 64, 62, 9, 1.2), '#2d3f8f');
    cut(g, roughRect(752, 244, 30, 20, 10, 0.8), hex(pal.trim));
    glow(g, 760, 280, 40, pal.inkGlow, 0.25);
  });
  layer(s, 1, () => {
    g.save();
    g.translate(450, 485);
    g.rotate(-0.05);
    const tip = envelope(g, 0, 0, 420, 260, 21, hex(pal.paperNote));
    scribble(g, -170, -78, 150, 5);
    scribble(g, -170, -50, 110, 6);
    waxSeal(g, tip[0], tip[1], 42, 9, s.labels.seal);
    g.restore();
  }, [450, 485]);
};

// ── 2 信紙特寫 ──
const letter: SceneDraw = s => {
  const { g, pal, t } = s;
  layer(s, 0.4, () => {
    fillView(s, hex(pal.tableTop));
    woodGrain(g, s.view.x0 - 200, s.view.x1 + 200, s.view.y0 - 40, s.view.y1 + 40, 12, 'rgba(110,60,28,0.25)');
    glow(g, 120, 40, 700, pal.lampLight, 0.35);
  });
  layer(s, 1.6, () => {
    g.save();
    g.translate(450, 400);
    g.rotate(0.02);
    cut(g, roughRect(-260, -370, 520, 760, 31, 2), hex(pal.paperNote), { shadow: 8 });
    // 迴紋針
    g.strokeStyle = hex(pal.metal); g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-175, -390); g.lineTo(-175, -330); g.arc(-160, -330, 15, Math.PI, 0, true); g.lineTo(-145, -380); g.stroke();
    serif(g, s.labels.firm ?? '', 0, -300, 30, INK, { spacing: 10 });
    g.fillStyle = INK;
    g.fillRect(-200, -270, 400, 2.5);
    g.fillRect(-200, -263, 400, 1.2);
    serif(g, s.labels.will ?? '', 0, -205, 48, INK, { spacing: 26, weight: 700 });
    for (let i = 0; i < 6; i++) scribble(g, -200, -130 + i * 40, 300 + ((i * 53) % 110), 40 + i);
    // 只寫了一個名字：那一行慢慢被螢光筆劃過 (第 2 段)
    const hl = smooth(4.6, 6.4, t);
    g.fillStyle = rgba(pal.gold, 0.5 * hl);
    g.fillRect(-120, 128, 240 * hl, 34);
    g.fillStyle = INK;
    g.fillRect(-110, 158, 220, 2);
    g.beginPath(); g.arc(150, 250, 44, 0, Math.PI * 2); g.strokeStyle = 'rgba(184,51,46,0.75)'; g.lineWidth = 4; g.stroke();
    g.beginPath(); g.arc(150, 250, 34, 0, Math.PI * 2); g.lineWidth = 1.6; g.stroke();
    g.restore();
  });
};

// ── 3 律師的手：鑰匙、鋼筆、五個信封 ──
const lawyer: SceneDraw = s => {
  const { g, pal, t } = s;
  const r = rng(77);
  fillView(s, vGrad(g, s.view.y0, 400, [[0, '#6f8578'], [1, '#86998a']]));
  // 書架
  cut(g, roughRect(30, 40, 330, 300, 70), hex(pal.shelf));
  for (let row = 0; row < 3; row++) {
    const y = 60 + row * 92;
    g.fillStyle = hex(pal.shelfDark);
    g.fillRect(44, y + 78, 302, 10);
    let x = 52;
    while (x < 330) {
      const w = 14 + r() * 14, h = 50 + r() * 26;
      cut(g, roughRect(x, y + 78 - h, w, h, 100 + row * 40 + Math.round(x), 0.8), hex(pal.books[Math.floor(r() * pal.books.length)]), { shadow: 2, lw: 1.6 });
      x += w + 3;
    }
  }
  // 窗
  cut(g, roughRect(560, 50, 270, 220, 71), '#cfe3e6');
  glow(g, 700, 140, 220, 0xfff4d8, 0.5);
  cut(g, roughPoly([[600, 270], [640, 150], [680, 270]], 72, 1.5), '#5d7b5f', { shadow: 0 });
  g.fillStyle = hex(pal.trim);
  g.fillRect(690, 50, 8, 220); g.fillRect(560, 155, 270, 8);
  // 桌面
  cut(g, roughPoly([[L(s), 380], [R(s), 380], [R(s) + 100, B(s)], [L(s) - 100, B(s)]], 73, 3), vGrad(g, 380, 900, [[0, tint(pal.tableTop, -0.05)], [1, hex(pal.table)]]), { shadow: 0 });
  woodGrain(g, L(s), R(s), 400, B(s), 74, 'rgba(90,50,25,0.3)');
  const dx = s.reduce ? -70 : -70 * smooth(0, 2.6, t);
  // 五個信封
  for (let i = 0; i < 5; i++) {
    g.save();
    g.translate(300 + dx + i * 22, 520 - i * 8);
    g.rotate(-0.32 + i * 0.12);
    envelope(g, 0, 0, 170, 110, 80 + i, i % 2 ? hex(pal.paperNote) : tint(pal.paperNote, -0.05));
    waxSeal(g, 0, 8, 13, 90 + i);
    g.restore();
  }
  // 鑰匙圈
  const sway = s.reduce ? 0 : Math.sin(t * 2.4) * 0.16 * Math.exp(-t * 0.3);
  g.beginPath(); g.arc(560 + dx, 455, 24, 0, Math.PI * 2); g.strokeStyle = hex(pal.goldDeep); g.lineWidth = 6; g.stroke();
  key(g, 560 + dx, 478, 120, 0.35 + sway, hex(pal.brass), 60);
  key(g, 560 + dx, 478, 100, -0.05 + sway * 1.3, hex(pal.gold), 63);
  key(g, 560 + dx, 478, 110, -0.45 + sway * 0.8, tint(pal.brass, -0.15), 66);
  pen(g, 380 + dx, 630, 230, 22, hex(pal.pen), hex(pal.brass), 50);
  // 律師的手 (西裝袖 + 手)
  const hx = 690 + dx;
  cut(g, roughPoly([[hx + 40, 470], [1300, 430], [1300, 640], [hx + 50, 600]], 81, 1.5), '#2c2b36');
  cut(g, roughPoly([[hx + 24, 476], [hx + 52, 472], [hx + 60, 598], [hx + 32, 602]], 82, 0.8), '#f4efe4');
  cut(g, roughPoly([[hx + 28, 486], [hx - 30, 500], [hx - 70, 520], [hx - 72, 534], [hx - 40, 536], [hx - 74, 552], [hx - 70, 566], [hx - 30, 566], [hx - 60, 582], [hx - 50, 594], [hx + 30, 590]], 83, 0.8, 1e9), hex(pal.skin));
};

// ── 4 回憶：倒著看地圖 (泛黃剪紙) ──
const memory: SceneDraw = s => {
  const { g, t } = s;
  const SEP = { light: 0xf1dfb8, mid: 0xd8b98a, wood: 0xc9a671, wood2: 0xb8925c, dark: 0x8a6440, deeper: 0x6e5034 };
  layer(s, 1, () => {
    fillView(s, vGrad(g, s.view.y0, 460, [[0, hex(SEP.light)], [1, hex(SEP.mid)]]));
    const r = rng(5);
    g.fillStyle = rgba(SEP.dark, 0.18);
    for (let x = -300; x < 1300; x += 70) for (let y = -200; y < 440; y += 70) { g.beginPath(); g.arc(x + r() * 6, y + (x % 140 ? 35 : 0), 5, 0, Math.PI * 2); g.fill(); }
    planks(s, 450, SEP.wood, SEP.wood2, SEP.dark, 6);
    g.fillStyle = 'rgba(255,240,200,0.35)';
    g.beginPath(); g.moveTo(80, 450); g.lineTo(330, 450); g.lineTo(240, 700); g.lineTo(-60, 700); g.closePath(); g.fill();
    // 倒過來的地圖
    g.save();
    g.translate(330, 520);
    g.rotate(0.06);
    cut(g, roughRect(-140, -62, 280, 124, 7, 1.6), hex(0xf6e7c4), { stroke: hex(SEP.deeper) });
    g.rotate(Math.PI);
    g.strokeStyle = hex(SEP.dark); g.lineWidth = 2.4; g.setLineDash([8, 7]);
    g.beginPath(); g.moveTo(-110, 30); g.bezierCurveTo(-60, -30, 0, 40, 60, -10); g.lineTo(90, -20); g.stroke();
    g.setLineDash([]);
    g.beginPath(); g.moveTo(80, -32); g.lineTo(100, -8); g.moveTo(100, -32); g.lineTo(80, -8); g.lineWidth = 4; g.strokeStyle = '#a5452d'; g.stroke();
    cut(g, roughPoly([[-120, 10], [-100, -12], [-80, 10], [-80, 34], [-120, 34]], 8, 0.5, 1e9), hex(SEP.mid), { shadow: 0, lw: 1.6, stroke: hex(SEP.deeper) });
    g.beginPath(); g.moveTo(0, -40); g.lineTo(-7, -22); g.lineTo(7, -22); g.closePath(); g.fillStyle = hex(SEP.deeper); g.fill();
    serif(g, 'N', 0, -50, 16, hex(SEP.deeper), { weight: 700 });
    g.restore();
    // 小時候的你：趴在地上，小腿在空中晃
    const kick = s.reduce ? 0 : Math.sin(t * 1.6);
    const kid = hex(SEP.dark);
    cut(g, roughEllipse(560, 512, 78, 26, 10, 1), kid, { stroke: hex(SEP.deeper) });
    cut(g, roughEllipse(482, 488, 28, 27, 11, 0.8), kid, { stroke: hex(SEP.deeper) });
    cut(g, roughPoly([[500, 520], [450, 536], [446, 548], [505, 538]], 12, 0.5, 1e9), kid, { stroke: hex(SEP.deeper) });
    for (const [i, ph] of [[0, kick], [1, -kick]] as const) {
      const a = -1.0 + ph * 0.25 + i * 0.2;
      g.save(); g.translate(625 + i * 10, 505); g.rotate(a);
      cut(g, roughRect(0, -9, 70, 18, 13 + i, 0.6), kid, { stroke: hex(SEP.deeper) });
      g.restore();
    }
    // 叔公 (剪影)：在旁邊笑 (第 2 段時肩膀抖動)
    const laugh = s.reduce ? 0 : smooth(5.0, 5.6, t) * Math.abs(Math.sin(t * 9)) * 3;
    standingFigure(g, 790, 560, 320, hex(SEP.deeper), 14, { bob: laugh, lean: -0.06, outline: hex(0x4e3824) });
  }, [450, 470]);
  // 回憶的暈影與焦邊
  const { x0, y0, x1, y1 } = s.view;
  const vg = g.createRadialGradient(450, 380, 180, 450, 380, Math.max(x1 - x0, y1 - y0) * 0.62);
  vg.addColorStop(0, 'rgba(120,80,30,0)');
  vg.addColorStop(1, 'rgba(110,70,30,0.6)');
  g.fillStyle = vg;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
};

// ── 5 山路三層 ──
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
    // 山頂的老宅
    cut(g, roughRect(612, 140, 62, 32, 22, 0.8), '#5a3f2c', { shadow: 2, lw: 1.8 });
    cut(g, roughPoly([[604, 142], [643, 116], [682, 142]], 23, 0.6), '#3f2b1f', { shadow: 2, lw: 1.8 });
    cut(g, roughRect(660, 112, 9, 18, 24, 0.4), '#3f2b1f', { shadow: 0, lw: 1.4 });
    glow(g, 632, 156, 16, pal.lampBulb, 0.9);
    g.fillStyle = hex(pal.lampBulb); g.fillRect(628, 150, 9, 9);
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

// ── 6 老宅正面、傍晚 ──
const mansion: SceneDraw = s => {
  const { g, pal } = s;
  fillView(s, vGrad(g, s.view.y0, 470, [[0, '#d9734f'], [0.55, '#f0a865'], [1, '#f8d9a0']]));
  glow(g, 450, 360, 420, 0xffd27a, 0.45);
  layer(s, 0.5, () => {
    for (const [x, y, w, sd] of [[120, 90, 120, 1], [700, 60, 150, 2], [430, 40, 90, 3]] as const) cut(g, roughEllipse(x, y, w, w * 0.28, 40 + sd, 2), 'rgba(255,226,190,0.8)', { outline: false, shadow: 0 });
    cut(g, roughPoly([[L(s), 470], [R(s), 470], [R(s), B(s)], [L(s), B(s)]], 41, 3), vGrad(g, 470, 800, [[0, '#7a6f3e'], [1, '#585230']]), { shadow: 0 });
  });
  layer(s, 1, () => {
    const wall = hex(pal.wallpaper), roof = '#6b3f2a';
    // 兩翼
    for (const [x, sd] of [[120, 1], [650, 2]] as const) {
      cut(g, roughRect(x, 270, 130, 200, 50 + sd), tint(pal.wallpaper, -0.06));
      cut(g, roughPoly([[x - 14, 276], [x + 65, 220], [x + 144, 276]], 52 + sd), roof);
    }
    cut(g, roughRect(250, 200, 400, 270, 55), wall);
    cut(g, roughPoly([[226, 208], [450, 86], [674, 208]], 56, 2.4), roof);
    cut(g, roughRect(560, 100, 28, 64, 57, 0.8), '#5a3424');
    g.strokeStyle = 'rgba(40,24,12,0.35)'; g.lineWidth = 1.6;
    for (let y = 130; y < 208; y += 18) { g.beginPath(); g.moveTo(450 - (y - 86) * 1.83, y); g.lineTo(450 + (y - 86) * 1.83, y); g.stroke(); }
    // 窗：亮與暗
    const win = (x: number, y: number, lit: boolean, sd: number) => {
      if (lit) glow(g, x + 18, y + 24, 46, pal.lampLight, 0.5);
      cut(g, roughRect(x, y, 36, 48, sd, 0.8), lit ? hex(pal.lampBulb) : '#4a3a4a', { shadow: 2, lw: 2 });
      g.fillStyle = hex(pal.trim); g.fillRect(x + 16, y, 4, 48); g.fillRect(x, y + 22, 36, 4);
    };
    [[290, 240, true], [370, 240, false], [494, 240, false], [574, 240, true], [290, 350, false], [574, 350, true], [160, 320, false], [206, 320, true], [688, 320, true], [734, 320, false]]
      .forEach(([x, y, lit], i) => win(x as number, y as number, lit as boolean, 60 + i));
    // 門廊與燈
    cut(g, roughPoly([[390, 370], [510, 370], [522, 384], [378, 384]], 71), roof, { shadow: 2 });
    cut(g, roughRect(418, 384, 64, 86, 72), hex(pal.door));
    cut(g, roughRect(400, 470, 100, 14, 73, 0.8), hex(pal.stone));
    cut(g, roughRect(388, 484, 124, 14, 74, 0.8), hex(pal.stoneDark));
    glow(g, 450, 362, 70, pal.lampLight, 0.9);
    cut(g, roughEllipse(450, 364, 7, 9, 75, 0.3), hex(pal.lampBulb), { shadow: 0, lw: 1.6 });
    // 兩側樹影
    for (const [x, h, sd] of [[60, 300, 1], [840, 340, 2]] as const) {
      cut(g, roughEllipse(x, 470 - h * 0.55, h * 0.32, h * 0.45, 80 + sd, 4), '#3d4a35');
      cut(g, roughRect(x - 8, 470 - h * 0.2, 16, h * 0.2, 82 + sd, 0.6), '#3a2a1e');
    }
  }, [450, 430]);
  layer(s, 1.4, () => {
    // 律師的小車 (不下車)
    g.save(); g.translate(170, 585);
    glow(g, 96, -6, 90, 0xfff0b0, 0.45);
    cut(g, roughPoly([[-90, 30], [-88, -12], [-50, -18], [-28, -56], [44, -56], [66, -18], [96, -12], [98, 30]], 90, 1, 1e9), '#2f4a4f');
    cut(g, roughPoly([[-20, -50], [16, -50], [16, -20], [-36, -20]], 91, 0.5, 1e9), '#cfe3e6', { shadow: 0, lw: 2 });
    cut(g, roughPoly([[24, -50], [40, -50], [58, -20], [24, -20]], 92, 0.5, 1e9), '#cfe3e6', { shadow: 0, lw: 2 });
    cut(g, roughEllipse(-2, -34, 9, 10, 93, 0.3), '#2c2b36', { shadow: 0, lw: 1.4 });
    cut(g, roughEllipse(-52, 30, 20, 20, 94, 0.6), '#2a1d14', { shadow: 0 });
    cut(g, roughEllipse(60, 30, 20, 20, 95, 0.6), '#2a1d14', { shadow: 0 });
    cut(g, roughEllipse(92, -2, 8, 6, 96, 0.3), hex(pal.lampBulb), { shadow: 0, lw: 1.4 });
    g.restore();
  }, [450, 430]);
};

/** 門廊 (1-1) 剪紙版：壁紙、護牆板、地板、吊燈、通往玄關的門與畫在牆上的門把 */
function porchRoom(s: SceneCtx, flat: boolean): void {
  const { g, pal } = s;
  wallpaper(s, 400, 46, 33);
  cut(g, roughRect(s.view.x0 - 60, 400, s.view.x1 - s.view.x0 + 120, 74, 34, 1.4), hex(pal.wainscot), { shadow: 0 });
  g.fillStyle = hex(pal.trim); g.fillRect(s.view.x0 - 60, 398, s.view.x1 - s.view.x0 + 120, 8);
  planks(s, 474, pal.floorA, pal.floorB, pal.floorLine, 35);
  // 吊燈
  g.fillStyle = hex(pal.cord); g.fillRect(448, s.view.y0 - 40, 4, 120 - s.view.y0);
  glow(g, 450, 120, 220, pal.lampLight, flat ? 0 : 0.55);
  cut(g, roughPoly([[410, 80], [490, 80], [520, 124], [380, 124]], 36, 1), hex(pal.lampShade));
  // 往玄關的門
  cut(g, roughRect(548, 216, 152, 262, 37, 1.2), hex(pal.doorFrame));
  cut(g, roughRect(562, 230, 124, 248, 38, 1.2), hex(pal.door));
  cut(g, roughRect(580, 250, 88, 90, 39, 1), hex(pal.doorPanel), { shadow: 2, lw: 2 });
  cut(g, roughRect(580, 356, 88, 100, 40, 1), hex(pal.doorPanel), { shadow: 2, lw: 2 });
  // 畫在牆上的門把 (藏寶圖的墨線)
  g.strokeStyle = hex(pal.inkBlue); g.lineWidth = 3.4;
  g.beginPath(); g.arc(732, 352, 13, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(719, 352); g.lineTo(706, 352); g.stroke();
  g.fillStyle = hex(pal.inkPurple);
  for (const [x, y] of [[752, 330], [758, 372], [716, 378]] as const) { g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
  // 石階
  cut(g, roughRect(740, 452, 190, 24, 41, 1), hex(pal.stone));
  cut(g, roughRect(770, 430, 160, 24, 42, 1), hex(pal.stoneTop));
}

// ── 7 走進門廊 ──
const porch: SceneDraw = s => {
  const { g, pal, t } = s;
  const close = smooth(4.4, 5.6, t);
  layer(s, 1, () => {
    porchRoom(s, false);
    // 門外透進來的光 (門關上時收起)
    g.fillStyle = rgba(pal.lampLight, 0.32 * (1 - close));
    g.beginPath(); g.moveTo(40, 474); g.lineTo(40 + 120, 474); g.lineTo(380, s.view.y1 + 40); g.lineTo(40, s.view.y1 + 40); g.closePath(); g.fill();
    const walk = smooth(0.4, 3.8, t);
    const phase = walk > 0 && walk < 1 ? t * 7 : 0;
    drafter(g, 80 + 330 * walk, 566, 230, phase, drafterColors(pal), 300);
  }, [450, 420]);
  layer(s, 1.6, () => {
    // 身後的門 (畫面左緣)：悄悄關上
    const x0 = s.view.x0;
    cut(g, roughRect(x0 - 40, s.view.y0 - 40, 70 + 20, s.view.y1 - s.view.y0 + 80, 43, 1), hex(pal.doorFrame), { shadow: 6 });
    const w = 30 + 170 * close;
    cut(g, roughPoly([[x0 + 50, 60 - close * 30], [x0 + 50 + w, 80 - close * 40], [x0 + 50 + w, 640 + close * 40], [x0 + 50, 680]], 44, 1, 1e9), tint(pal.door, -0.25 + close * 0.2));
    if (close > 0.98) glow(g, x0 + 50 + w - 16, 380, 22, pal.brass, 0.6);
  }, [450, 420]);
};

// ── 8 鋼筆特寫 ──
const penShot: SceneDraw = s => {
  const { g, pal, t } = s;
  fillView(s, vGrad(g, s.view.y0, s.view.y1, [[0, '#24180f'], [0.6, '#3b2a1d'], [1, '#2a1d14']]));
  glow(g, 450, 120, 520, pal.lampLight, 0.32);
  woodGrain(g, s.view.x0, s.view.x1, 470, s.view.y1, 50, 'rgba(0,0,0,0.25)');
  const rot = s.reduce ? 1 : smooth(0, 3.6, t);
  const x = 70, y = 320, L = 780, th = 96;
  g.save();
  // 落在桌上的影子
  const sh = g.createRadialGradient(x + L * 0.5, y + th * 1.6, 10, x + L * 0.5, y + th * 1.6, L * 0.55);
  sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.scale(1, 0.25); g.fillStyle = sh; g.translate(0, (y + th * 1.6) * 3); g.fillRect(x - 100, y + th * 1.6 - L * 0.55, L + 200, L * 1.1); g.restore();
  pen(g, x, y, L, th, hex(pal.pen), hex(pal.brass), 70);
  // 筆身轉過來：高光帶由上往下掃
  const clip = new Path2D(); clip.rect(x, y - th / 2, L * 0.82, th);
  g.save(); g.clip(clip);
  g.fillStyle = vGrad(g, y - th / 2, y + th / 2, [[0, 'rgba(255,255,255,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,20,0.32)']]);
  g.fillRect(x, y - th / 2, L, th);
  const hy = y - th / 2 + th * (0.15 + 0.6 * rot);
  const hg = g.createLinearGradient(0, hy - 16, 0, hy + 16);
  hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(0.5, 'rgba(220,230,255,0.38)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hg; g.fillRect(x, hy - 16, L, 32);
  // 刻字 (轉到正面時浮現)
  g.globalAlpha = smooth(0.8, 2.8, t * (s.reduce ? 10 : 1));
  const tx = x + L * 0.59, ty = y + 3 + (1 - rot) * 12;
  serif(g, s.labels.engrave ?? '', tx + 1.5, ty + 1.5, 25, 'rgba(10,14,40,0.75)', { spacing: 4, weight: 700 });
  serif(g, s.labels.engrave ?? '', tx, ty, 25, '#f6dc8c', { spacing: 4, weight: 700 });
  g.restore();
  g.restore();
  glow(g, x + L * 0.97, y, 40, pal.gold, 0.35);
};

// ── 9 門廊被壓平成藏寶圖；角落兩道輪廓 ──
const flatten: SceneDraw = s => {
  const { g, pal, t, view } = s;
  fillView(s, hex(s.room2d.paper));
  g.strokeStyle = rgba(pal.inkBlue, 0.1); g.lineWidth = 1.2;
  for (let x = Math.floor(view.x0 / 40) * 40; x < view.x1; x += 40) { g.beginPath(); g.moveTo(x, view.y0); g.lineTo(x, view.y1); g.stroke(); }
  for (let y = Math.floor(view.y0 / 40) * 40; y < view.y1; y += 40) { g.beginPath(); g.moveTo(view.x0, y); g.lineTo(view.x1, y); g.stroke(); }
  const ink = hex(pal.inkBlue), o = { shadow: 0, lw: 3, stroke: ink };
  const pale = (c: number) => tint(c, 0.62);
  cut(g, roughRect(30, 60, 840, 410, 90, 1.5), pale(pal.wallpaper), o);
  cut(g, roughRect(30, 400, 840, 70, 91, 1.2), pale(pal.wainscot), o);
  cut(g, roughRect(30, 470, 840, 40, 92, 1.2), pale(pal.floorA), o);
  cut(g, roughRect(562, 230, 124, 240, 93, 1.2), pale(pal.door), o);
  cut(g, roughRect(770, 430, 100, 40, 94, 1), pale(pal.stone), o);
  cut(g, roughPoly([[410, 60], [490, 60], [520, 104], [380, 104]], 95, 1), pale(pal.lampShade), o);
  // 只在圖上的墨點符號
  g.fillStyle = hex(pal.inkPurple);
  const r = rng(96);
  for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(560 + r() * 130, 226 + r() * 250, 2 + r() * 2.5, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = ink; g.lineWidth = 3.4;
  g.beginPath(); g.arc(732, 352, 13, 0, Math.PI * 2); g.stroke();
  drafter(g, 420, 470, 190, 0, drafterColors(pal), 300, true);
  // 羅盤
  g.save(); g.translate(800, 120);
  g.strokeStyle = ink; g.lineWidth = 2;
  g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.stroke();
  cut(g, roughPoly([[0, -46], [8, 0], [0, 46], [-8, 0]], 97, 0.3, 1e9), hex(pal.inkBlue), { shadow: 0, lw: 1.6, stroke: ink });
  serif(g, 'N', 0, -58, 18, ink, { weight: 700 });
  g.restore();
  // 筆尖點下：墨水暈開
  const sp = clamp01(t / 1.4);
  if (sp < 1) {
    g.fillStyle = rgba(pal.inkBlue, 0.55 * (1 - sp));
    g.beginPath(); g.arc(450, 330, 40 + sp * 520, 0, Math.PI * 2); g.fill();
  }
  // 圖的角落，好像有人 (淡入 1.5 秒、停 1 秒、淡出 1.5 秒)
  const a = smooth(1.5, 3.0, t) * (1 - smooth(4.0, 5.5, t));
  if (a > 0.001) {
    for (const [dx, dy] of [[-3, 0], [3, 1], [0, -2]] as const) {
      standingFigure(g, 120 + dx, 400 + dy, 220, 'rgb(118,98,160)', 400, { alpha: a * 0.3, outline: null });
      standingFigure(g, 196 + dx, 402 + dy, 188, 'rgb(118,98,160)', 410, { alpha: a * 0.3, outline: null });
    }
  }
};

// ── 10 牆上叔公的字條 ──
const note: SceneDraw = s => {
  const { g, pal, t } = s;
  layer(s, 1, () => {
    wallpaper(s, 560, 60, 51);
    cut(g, roughRect(s.view.x0 - 60, 560, s.view.x1 - s.view.x0 + 120, B(s) - 560, 52, 1.4), hex(pal.wainscot), { shadow: 0 });
    g.fillStyle = hex(pal.trim); g.fillRect(s.view.x0 - 60, 556, s.view.x1 - s.view.x0 + 120, 10);
    const f = s.reduce ? 0 : Math.sin((t - 4.6) * 7) * 0.04 * Math.exp(-Math.max(t - 4.6, 0) * 1.1) * (t > 4.6 ? 1 : 0);
    g.save();
    g.translate(450, 150);
    g.rotate(0.035 + f);
    cut(g, roughRect(-190, 0, 380, 250, 53, 1.8), hex(pal.paperNote), { shadow: 7 });
    for (let i = 0; i < 4; i++) scribble(g, -150, 50 + i * 36, 240 - (i % 2) * 70, 54 + i, '#4a3220', 2.6);
    scribble(g, 30, 205, 110, 58, '#4a3220', 2.6);
    g.strokeStyle = hex(pal.inkBlue); g.lineWidth = 2.4;
    g.beginPath(); g.moveTo(-160, 210); g.lineTo(-130, 190); g.lineTo(-100, 210); g.lineTo(-100, 232); g.lineTo(-160, 232); g.closePath(); g.stroke();
    g.restore();
    cut(g, roughEllipse(450, 156, 11, 11, 59, 0.4), hex(pal.pin), { shadow: 3 });
  }, [450, 280]);
};

// ── 11 標題卡 ──
const title: SceneDraw = s => {
  const { g, pal, t, view } = s;
  fillView(s, vGrad(g, view.y0, view.y1, [[0, pal.bgTop], [1, pal.bgBottom]]));
  g.strokeStyle = rgba(pal.inkBlue, 0.07); g.lineWidth = 1.2;
  for (let x = Math.floor(view.x0 / 50) * 50; x < view.x1; x += 50) { g.beginPath(); g.moveTo(x, view.y0); g.lineTo(x, view.y1); g.stroke(); }
  for (let y = Math.floor(view.y0 / 50) * 50; y < view.y1; y += 50) { g.beginPath(); g.moveTo(view.x0, y); g.lineTo(view.x1, y); g.stroke(); }
  g.save(); g.translate(450, 330); g.globalAlpha = 0.08;
  g.strokeStyle = hex(pal.inkBlue); g.lineWidth = 4;
  g.beginPath(); g.arc(0, 0, 230, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, 180, 0, Math.PI * 2); g.stroke();
  g.fillStyle = hex(pal.inkBlue);
  for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -260); g.lineTo(24, 0); g.lineTo(-24, 0); g.closePath(); g.fill(); }
  g.restore();
  // 四角剪紙裝飾
  for (const [x, y, sx, sy, sd] of [[60, 60, 1, 1, 1], [840, 60, -1, 1, 2], [60, 640, 1, -1, 3], [840, 640, -1, -1, 4]] as const) {
    cut(g, roughPoly([[x, y], [x + sx * 110, y], [x, y + sy * 110]], 120 + sd, 1.2), hex(sd % 2 ? pal.inkBlue : pal.coat), { shadow: 3 });
    cut(g, roughPoly([[x + sx * 14, y + sy * 14], [x + sx * 70, y + sy * 14], [x + sx * 14, y + sy * 70]], 130 + sd, 0.8), hex(pal.paperNote), { shadow: 0, lw: 1.6 });
  }
  const a = smooth(0.4, 1.8, t);
  g.globalAlpha = a;
  serif(g, s.labels.title ?? '', 450, 318, 104, INK, { spacing: 30 });
  g.fillStyle = INK; g.fillRect(250, 404, 400, 2.4);
  g.save(); g.translate(450, 405); g.rotate(Math.PI / 4);
  g.fillStyle = hex(pal.inkBlue); g.fillRect(-9, -9, 18, 18); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(-9, -9, 18, 18);
  g.restore();
  g.globalAlpha = 1;
};

/** 未登錄 sceneId 的退回畫面：素紙 */
export const blankScene: SceneDraw = s => fillView(s, vGrad(s.g, s.view.y0, s.view.y1, [[0, s.pal.bgTop], [1, s.pal.bgBottom]]));

/** sceneId → 繪製函式 (新增過場時在這裡登錄) */
export const PAPER_SCENES: Readonly<Record<string, SceneDraw>> = {
  'prologue.desk': desk,
  'prologue.letter': letter,
  'prologue.lawyer': lawyer,
  'prologue.memory': memory,
  'prologue.mountain': mountain,
  'prologue.mansion': mansion,
  'prologue.porch': porch,
  'prologue.pen': penShot,
  'prologue.flatten': flatten,
  'prologue.note': note,
  'prologue.title': title
};
