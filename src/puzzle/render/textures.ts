import * as THREE from 'three';
import { PAL, toCss } from './palette';

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

/** 木箱：橫向木板，板縫深色 */
export const crateWood = (): THREE.Texture => cached('crate', () => canvas(256, 256, g => {
  const r = rng(7);
  const rows = 4;
  for (let i = 0; i < rows; i++) {
    const y = (i * 256) / rows;
    g.fillStyle = shade(PAL.crate, 0.92 + r() * 0.14);
    g.fillRect(0, y, 256, 256 / rows);
    grain(g, 0, y, 256, 256 / rows, PAL.crate, r);
    g.fillStyle = toCss(PAL.crateDark);
    g.fillRect(0, y, 256, 3);
  }
}));

/** 地板：兩色木地板交錯 */
export function floorPlanks(repeatX: number, repeatY: number): THREE.Texture {
  const base = cached('floor', () => canvas(256, 256, g => {
    const r = rng(11);
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      const y = (i * 256) / rows;
      const off = (i % 2) * 96;
      for (let k = -1; k < 3; k++) {
        const x = off + k * 128;
        g.fillStyle = toCss((i + k) % 2 === 0 ? PAL.floorA : PAL.floorB);
        g.fillRect(x, y, 128, 64);
        grain(g, x, y, 128, 64, (i + k) % 2 === 0 ? PAL.floorA : PAL.floorB, r);
        g.fillStyle = toCss(PAL.floorLine);
        g.fillRect(x, y, 2, 64);
      }
      g.fillStyle = toCss(PAL.floorLine);
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
export function wallpaper(repeatX: number, repeatY: number): THREE.Texture {
  const base = cached('wall', () => canvas(128, 128, g => {
    g.fillStyle = toCss(PAL.wallpaper);
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = toCss(PAL.wallStripe);
    g.fillRect(0, 0, 22, 128);
    g.fillRect(64, 0, 22, 128);
    g.fillStyle = toCss(PAL.wallMotif);
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
export const rug = (): THREE.Texture => cached('rug', () => canvas(256, 160, g => {
  g.fillStyle = toCss(PAL.rugBorder); g.fillRect(0, 0, 256, 160);
  g.fillStyle = toCss(PAL.rug); g.fillRect(10, 10, 236, 140);
  g.strokeStyle = toCss(PAL.rugBorder); g.lineWidth = 4; g.strokeRect(22, 22, 212, 116);
  g.fillStyle = toCss(PAL.rugInner);
  g.beginPath(); g.moveTo(128, 34); g.lineTo(200, 80); g.lineTo(128, 126); g.lineTo(56, 80); g.closePath(); g.fill();
  g.fillStyle = toCss(PAL.rugBorder);
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
export const notePaper = (): THREE.Texture => cached('note', () => canvas(64, 80, g => {
  g.fillStyle = toCss(PAL.paperNote); g.fillRect(0, 0, 64, 80);
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

/** 2D 背景：奶油色紙張漸層 + 細顆粒 + 淡淡的水彩暈染 */
export const paperBackground = (): THREE.Texture => cached('bg2d', () => canvas(512, 512, g => {
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, PAL.bgTop); grad.addColorStop(1, PAL.bgBottom);
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
