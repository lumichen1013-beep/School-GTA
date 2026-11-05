import * as THREE from 'three';
import type { Palette } from './themes';

const toCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

// 程序化 CanvasTexture (不使用圖檔)：木紋、地板、壁紙、地毯、掛畫、紙張、光暈、2D 背景

/** 固定種子亂數，讓每次產生的紋理一致 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const shade = (hex: number, k: number): string => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return `rgb(${r},${g},${b})`;
};

function grain(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: number, r: () => number): void {
  g.strokeStyle = shade(base, 0.82);
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const yy = y + h * (0.15 + r() * 0.7);
    g.beginPath();
    g.moveTo(x, yy);
    for (let xx = x; xx <= x + w; xx += 16) g.lineTo(xx, yy + Math.sin(xx * 0.05 + i) * 1.5);
    g.stroke();
  }
  if (r() < 0.5) { // 木節
    g.fillStyle = shade(base, 0.7);
    g.beginPath();
    g.ellipse(x + w * (0.2 + r() * 0.6), y + h / 2, 5, 2.5, 0, 0, Math.PI * 2);
    g.fill();
  }
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture): THREE.Texture {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
}

/** 依配色快取 (主題不同 → 紋理不同；同一主題全域共用) */
const palCaches = new WeakMap<Palette, Map<string, THREE.Texture>>();
function cachedFor(pal: Palette, key: string, make: () => THREE.Texture): THREE.Texture {
  let m = palCaches.get(pal);
  if (!m) { m = new Map(); palCaches.set(pal, m); }
  let t = m.get(key);
  if (!t) { t = make(); m.set(key, t); }
  return t;
}

/** 木箱：橫向木板，板縫深色 */
export const crateWood = (pal: Palette): THREE.Texture => cachedFor(pal, 'crate', () => canvas(256, 256, g => {
  const r = rng(7);
  const rows = 4;
  for (let i = 0; i < rows; i++) {
    const y = (i * 256) / rows;
    g.fillStyle = shade(pal.crate, 0.92 + r() * 0.14);
    g.fillRect(0, y, 256, 256 / rows);
    grain(g, 0, y, 256, 256 / rows, pal.crate, r);
    g.fillStyle = toCss(pal.crateDark);
    g.fillRect(0, y, 256, 3);
  }
}));

/** 地板：兩色木地板交錯 */
export function floorPlanks(pal: Palette, repeatX: number, repeatY: number): THREE.Texture {
  const base = cachedFor(pal, 'floor', () => canvas(256, 256, g => {
    const r = rng(11);
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      const y = (i * 256) / rows;
      const off = (i % 2) * 96;
      for (let k = -1; k < 3; k++) {
        const x = off + k * 128;
        g.fillStyle = toCss((i + k) % 2 === 0 ? pal.floorA : pal.floorB);
        g.fillRect(x, y, 128, 64);
        grain(g, x, y, 128, 64, (i + k) % 2 === 0 ? pal.floorA : pal.floorB, r);
        g.fillStyle = toCss(pal.floorLine);
        g.fillRect(x, y, 2, 64);
      }
      g.fillStyle = toCss(pal.floorLine);
      g.fillRect(0, y, 256, 2);
    }
  }));
  const t = base.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.needsUpdate = true;
  return t;
}

/** 壁紙：直條紋 + 小花 */
export function wallpaper(pal: Palette, repeatX: number, repeatY: number): THREE.Texture {
  const base = cachedFor(pal, 'wall', () => canvas(128, 128, g => {
    g.fillStyle = toCss(pal.wallpaper);
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = toCss(pal.wallStripe);
    g.fillRect(0, 0, 22, 128);
    g.fillRect(64, 0, 22, 128);
    g.fillStyle = toCss(pal.wallMotif);
    for (const [x, y] of [[43, 30], [107, 94]]) {
      for (let a = 0; a < 5; a++) {
        g.beginPath();
        g.arc(x + Math.cos(a * 1.257) * 4, y + Math.sin(a * 1.257) * 4, 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }));
  const t = base.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.needsUpdate = true;
  return t;
}

/** 地毯：外框 + 菱形 */
export const rug = (pal: Palette): THREE.Texture => cachedFor(pal, 'rug', () => canvas(256, 160, g => {
  g.fillStyle = toCss(pal.rugBorder); g.fillRect(0, 0, 256, 160);
  g.fillStyle = toCss(pal.rug); g.fillRect(10, 10, 236, 140);
  g.strokeStyle = toCss(pal.rugBorder); g.lineWidth = 4; g.strokeRect(22, 22, 212, 116);
  g.fillStyle = toCss(pal.rugInner);
  g.beginPath(); g.moveTo(128, 34); g.lineTo(200, 80); g.lineTo(128, 126); g.lineTo(56, 80); g.closePath(); g.fill();
  g.fillStyle = toCss(pal.rugBorder);
  g.beginPath(); g.moveTo(128, 58); g.lineTo(164, 80); g.lineTo(128, 102); g.lineTo(92, 80); g.closePath(); g.fill();
}));

/** 掛畫：簡單風景 (天空、山丘、太陽 / 月亮) */
export const painting = (variant: number): THREE.Texture => cached(`paint${variant}`, () => canvas(160, 120, g => {
  const skies = [['#9fd3e8', '#fbe3b0'], ['#f4b38a', '#fde7c4'], ['#5c6fa8', '#c5b7e0']];
  const [top, bottom] = skies[variant % skies.length];
  const grad = g.createLinearGradient(0, 0, 0, 120);
  grad.addColorStop(0, top); grad.addColorStop(1, bottom);
  g.fillStyle = grad; g.fillRect(0, 0, 160, 120);
  g.fillStyle = variant === 2 ? '#fff6d0' : '#ffd36b';
  g.beginPath(); g.arc(variant === 1 ? 40 : 118, 34, 14, 0, Math.PI * 2); g.fill();
  const hills = ['#6aa84f', '#4f8a5f', '#3d6e57'];
  hills.forEach((c, i) => {
    g.fillStyle = c;
    g.beginPath(); g.moveTo(0, 120);
    for (let x = 0; x <= 160; x += 8) g.lineTo(x, 70 + i * 14 + Math.sin(x * 0.04 + i * 2 + variant) * 12);
    g.lineTo(160, 120); g.closePath(); g.fill();
  });
}));

/** 紙條：手寫橫線 */
export const notePaper = (pal: Palette): THREE.Texture => cachedFor(pal, 'note', () => canvas(64, 80, g => {
  g.fillStyle = toCss(pal.paperNote); g.fillRect(0, 0, 64, 80);
  g.strokeStyle = '#8a6a4a'; g.lineWidth = 2;
  for (let y = 22; y < 74; y += 11) {
    g.beginPath(); g.moveTo(8, y); g.quadraticCurveTo(32, y + 2, 56 - (y % 3) * 6, y - 1); g.stroke();
  }
}));

/** 柔和放射光暈 (加法混合的 Sprite 用) */
export const glow = (): THREE.Texture => cached('glow', () => canvas(64, 64, g => {
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
}));

/** 發光的單字 (透明底；3-4a 花窗上亮起的「許」字)：字由呼叫方從文字表取 */
export const glyphGlow = (text: string, color: number): THREE.Texture => cached(`glyph|${text}|${color}`, () => canvas(128, 128, g => {
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = toCss(color);
  g.font = 'bold 104px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 70);
}));

/** 2D 背景：奶油色紙張漸層 + 細顆粒 + 淡淡的水彩暈染 */
export const paperBackground = (pal: Palette): THREE.Texture => cachedFor(pal, 'bg2d', () => canvas(512, 512, g => {
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, pal.bgTop); grad.addColorStop(1, pal.bgBottom);
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  const r = rng(3);
  for (const [x, y, rad, col] of [[90, 120, 140, 'rgba(255,214,150,0.25)'], [420, 90, 120, 'rgba(176,214,220,0.22)'], [300, 380, 180, 'rgba(250,190,170,0.18)']] as const) {
    const rg = g.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 512, 512);
  }
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = `rgba(120,80,40,${0.03 + r() * 0.05})`;
    g.fillRect(r() * 512, r() * 512, 1.5, 1.5);
  }
}));

/** 石階：錯縫砌石塊 + 灰縫 + 斑點 */
export function stoneBlocks(pal: Palette, repeatX: number, repeatY: number): THREE.Texture {
  const base = cachedFor(pal, 'stone', () => canvas(256, 128, g => {
    const r = rng(23);
    g.fillStyle = toCss(pal.stoneDark);
    g.fillRect(0, 0, 256, 128);
    const rows = 2;
    for (let i = 0; i < rows; i++) {
      const y = (i * 128) / rows;
      const off = (i % 2) * 64;
      for (let k = -1; k < 3; k++) {
        const x = off + k * 128;
        g.fillStyle = shade(pal.stone, 0.9 + r() * 0.16);
        g.fillRect(x + 3, y + 3, 122, 58);
        for (let n = 0; n < 14; n++) {
          g.fillStyle = shade(pal.stone, 0.78 + r() * 0.1);
          g.fillRect(x + 6 + r() * 112, y + 6 + r() * 50, 3, 3);
        }
      }
    }
  }));
  const t = base.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.needsUpdate = true;
  return t;
}

/** 一行字拆成「照常 / 劃掉」片段 (`~~x~~` = 劃掉) */
const strikeParts = (text: string): { s: string; struck: boolean }[] =>
  text.split(/(~~.+?~~)/).filter(s => s !== '').map(s => (s.startsWith('~~') && s.endsWith('~~') ? { s: s.slice(2, -2), struck: true } : { s, struck: false }));

/**
 * 牌子上的一行字 (1-2d 畫像的年份)：carved = 黃銅牌上的刻字 (實景)、ink = 紙籤上的墨字 (藏寶圖)；
 * 劃掉的片段畫單條橫線、字仍可辨識 (story-bible 7.1)
 */
export const inscription = (pal: Palette, text: string, look: 'carved' | 'ink' | 'pencil', width = 256): THREE.Texture => cachedFor(pal, `ins|${look}|${width}|${text}`, () => canvas(width, 80, g => {
  if (look === 'carved') {
    const grad = g.createLinearGradient(0, 0, 0, 80);
    grad.addColorStop(0, shade(pal.brass, 1.15)); grad.addColorStop(1, shade(pal.brass, 0.8));
    g.fillStyle = grad; g.fillRect(0, 0, width, 80);
    g.strokeStyle = shade(pal.brass, 0.55); g.lineWidth = 4; g.strokeRect(4, 4, width - 8, 72);
  } else {
    g.fillStyle = toCss(pal.paperNote); g.fillRect(0, 0, width, 80);
  }
  // pencil = 實景書架上爸爸的鉛筆字 (灰)；ink = 藏寶圖上的墨字
  const ink = look === 'carved' ? shade(pal.brass, 0.35) : look === 'pencil' ? '#5a554e' : toCss(pal.inkBlue);
  const font = (px: number) => (look === 'carved' ? `bold ${px}px Georgia, serif` : `italic bold ${px}px Georgia, serif`);
  g.textBaseline = 'middle';
  const parts = strikeParts(text);
  const gap = 14;
  const measure = () => parts.map(p => g.measureText(p.s).width);
  const total = (ws: number[]) => ws.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
  // 一行放不下 (例：劃掉的年份 + 改寫的年份) → 字縮小到留 12px 邊
  g.font = font(50);
  const fit = Math.min(1, (width - 24) / Math.max(1, total(measure())));
  g.font = font(Math.floor(50 * fit));
  const widths = measure();
  let x = (width - total(widths)) / 2;
  parts.forEach((p, i) => {
    g.fillStyle = ink;
    g.globalAlpha = p.struck ? 0.75 : 1;
    g.fillText(p.s, x, 42);
    if (p.struck) {
      g.strokeStyle = ink; g.lineWidth = 4;
      g.beginPath(); g.moveTo(x - 4, 40); g.lineTo(x + widths[i] + 4, 38); g.stroke();
    }
    g.globalAlpha = 1;
    x += widths[i] + gap;
  });
}));

/** 畫像 (1-2d)：深色底 + 半身剪影；variant 0 = 成人、1 = 小孩、2 = 白髮老人 */
export const portraitCanvas = (variant: number): THREE.Texture => cached(`portrait${variant}`, () => canvas(120, 150, g => {
  const bgs = ['#5b4a6e', '#6e5a3e', '#3e5a52'];
  const grad = g.createRadialGradient(60, 60, 10, 60, 75, 90);
  grad.addColorStop(0, '#d8c39a'); grad.addColorStop(1, bgs[variant % bgs.length]);
  g.fillStyle = grad; g.fillRect(0, 0, 120, 150);
  const child = variant === 1;
  const headR = child ? 17 : 20;
  const headY = child ? 72 : 60;
  g.fillStyle = '#2f2622';
  g.beginPath(); g.ellipse(60, 150, child ? 34 : 46, child ? 46 : 58, 0, Math.PI, 0); g.fill(); // 肩
  g.fillStyle = '#e6c8a8';
  g.beginPath(); g.arc(60, headY, headR, 0, Math.PI * 2); g.fill(); // 臉
  g.fillStyle = variant === 2 ? '#e8e4dc' : '#3a2a20';
  g.beginPath(); g.arc(60, headY - 6, headR + 1, Math.PI, 0); g.fill(); // 髮
  if (variant === 2) { g.fillStyle = '#e8e4dc'; g.fillRect(48, headY + 10, 24, 6); } // 白鬍
}));

/**
 * 標籤 (N22；只畫在藏寶圖)：墨框 + 字；covered = 原字被詞卡蓋住 (卡片底色 + 卡角)；
 * scale = 字旁多一格空著的方槽 (尺度卡槽，規格 7.2：可貼尺度卡的標籤多一格方槽；第一章只鋪陳)
 */
export const labelTag = (pal: Palette, text: string, covered: boolean, scale: boolean, slot = ''): THREE.Texture => cachedFor(pal, `label|${text}|${covered}|${scale}|${slot}`, () => canvas(256, 112, g => {
  const ink = toCss(pal.inkBlue);
  const w = scale ? 176 : 248;
  g.fillStyle = toCss(pal.paperNote); g.fillRect(4, 4, w - 8, 104);
  g.strokeStyle = ink; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, 100);
  if (covered) {
    g.fillStyle = '#fff6dc'; g.fillRect(24, 16, w - 48, 80);
    g.strokeStyle = shade(pal.brass, 0.7); g.lineWidth = 3; g.strokeRect(24, 16, w - 48, 80);
    g.fillStyle = shade(pal.brass, 0.7); g.beginPath(); g.moveTo(w - 24, 16); g.lineTo(w - 40, 16); g.lineTo(w - 24, 32); g.closePath(); g.fill();
  }
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  // 長的字 (2-2b 下聯五個字) 縮小字級放進框裡；一兩個字照舊
  g.font = `bold ${text.length > 1 ? Math.min(54, Math.floor((w - 28) / text.length)) : 66}px "PingFang TC", "Noto Sans TC", "Songti TC", serif`;
  g.fillText(text, w / 2, 60);
  if (scale && slot) {
    // 方槽貼了尺度卡 (N23)：實線方框 + 卡面的字 (大 / 小；形狀與字區分，不只靠顏色)
    g.fillStyle = '#fff6dc'; g.fillRect(w + 6, 22, 64, 68);
    g.strokeStyle = ink; g.lineWidth = 5; g.strokeRect(w + 6, 22, 64, 68);
    g.fillStyle = ink; g.font = 'bold 50px "PingFang TC", "Noto Sans TC", "Songti TC", serif';
    g.fillText(slot, w + 38, 58);
  } else if (scale) {
    g.setLineDash([10, 8]); g.strokeStyle = ink; g.lineWidth = 5; g.strokeRect(w + 6, 22, 64, 68); g.setLineDash([]);
  }
}));

/** 縮放中的物件的角標 (規格 7.2「縮放中的物件標「大 / 小」角標」；只在藏寶圖)：方框 + 字 */
export const scaleCornerTag = (pal: Palette, glyph: string): THREE.Texture => cachedFor(pal, `scaleCorner|${glyph}`, () => canvas(64, 64, g => {
  const ink = toCss(pal.inkBlue);
  g.fillStyle = '#fff6dc'; g.fillRect(4, 4, 56, 56);
  g.strokeStyle = ink; g.lineWidth = 5; g.strokeRect(5, 5, 54, 54);
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 42px "PingFang TC", "Noto Sans TC", "Songti TC", serif';
  g.fillText(glyph, 32, 35);
}));

/** 空白的提示字條 (L2 / L3 浮現前)：只有紙，沒有字跡 */
export const blankNotePaper = (pal: Palette): THREE.Texture => cachedFor(pal, 'noteBlank', () => canvas(64, 80, g => {
  g.fillStyle = toCss(pal.paperNote); g.fillRect(0, 0, 64, 80);
}));

/**
 * 一排書 (第二章書牆；貼在書櫃每一層的平面上，水平重複)：spine = 書背朝外 (彩色書背、金色橫條)；
 * back = 書背朝牆 (只看得到書口：米白的紙頁 + 深色書殼邊；「書都背對著你」)。依配色與種子快取
 */
export const bookRow = (pal: Palette, seed: number, look: 'spine' | 'back'): THREE.Texture => {
  const t = cachedFor(pal, `books|${look}|${seed}`, () => canvas(512, 128, g => {
    const r = rng(seed * 977 + (look === 'back' ? 31 : 7));
    g.fillStyle = shade(pal.shelfDark, 0.7); g.fillRect(0, 0, 512, 128);
    let x = 0;
    while (x < 512) {
      const bw = 14 + Math.floor(r() * 18);
      const bh = 128 * (0.62 + r() * 0.38);
      const col = pal.books[Math.floor(r() * pal.books.length)];
      const top = 128 - bh;
      if (look === 'spine') {
        g.fillStyle = toCss(col); g.fillRect(x, top, bw - 2, bh);
        g.fillStyle = shade(col, 0.7); g.fillRect(x + bw - 4, top, 2, bh);
        g.fillStyle = toCss(pal.gold); g.fillRect(x + 2, top + bh * 0.18, bw - 6, 3); g.fillRect(x + 2, top + bh * 0.78, bw - 6, 3);
      } else {
        g.fillStyle = shade(col, 0.6); g.fillRect(x, top, bw - 2, bh);
        g.fillStyle = toCss(pal.paperNote); g.fillRect(x + 2, top + 3, bw - 6, bh - 6);
        g.strokeStyle = shade(pal.paperNote, 0.82); g.lineWidth = 1;
        for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + 2 + (bw - 6) * k / 4, top + 4); g.lineTo(x + 2 + (bw - 6) * k / 4, 124); g.stroke(); }
      }
      x += bw;
    }
  }));
  t.wrapS = THREE.RepeatWrapping;
  return t;
};
