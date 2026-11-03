// 過場畫布 (Canvas 2D)：把剪紙分鏡畫到全螢幕畫布，處理轉場合成、紙紋與暈影
import type { Theme } from '../themes';
import { ease, rgba, rng } from './paper';
import { blankScene, PAPER_SCENES } from './scenes';
import { SAFE_H, SAFE_W, type CutTransitionKind, type CutsceneFrame, type SceneCtx, type ShotFrame } from './types';

/** 字幕帶佔畫面高度的比例：橫向 22%、直向 28% (cutscenes-v0.1 2.4) */
export const bandFraction = (w: number, h: number): number => (h > w ? 0.28 : 0.22);

const FADE_COLOR = '#1c130c';

let grainCanvas: HTMLCanvasElement | null = null;
/** 紙紋 (程式產生的雜訊，產生一次) */
function grainSource(): HTMLCanvasElement {
  if (grainCanvas) return grainCanvas;
  const c = document.createElement('canvas');
  c.width = c.height = 160;
  const g = c.getContext('2d')!;
  const img = g.createImageData(160, 160);
  const r = rng(2024);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r();
    const dark = v < 0.5;
    img.data[i] = dark ? 70 : 255; img.data[i + 1] = dark ? 45 : 250; img.data[i + 2] = dark ? 25 : 235;
    img.data[i + 3] = Math.floor(Math.abs(v - 0.5) * 2 * 60);
  }
  g.putImageData(img, 0, 0);
  // 幾條纖維
  g.strokeStyle = 'rgba(120,90,60,0.12)';
  for (let k = 0; k < 18; k++) { g.beginPath(); const x = r() * 160, y = r() * 160; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 14); g.stroke(); }
  grainCanvas = c;
  return c;
}

export class CutsceneCanvas {
  readonly el: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private bufA = document.createElement('canvas');
  private bufB = document.createElement('canvas');
  private w = 0;
  private h = 0;
  private dpr = 1;
  private grain: CanvasPattern | null = null;
  private vignette: CanvasGradient | null = null;

  constructor(host: HTMLElement, private theme: Theme) {
    this.el = document.createElement('canvas');
    this.el.className = 'pz-cs-canvas';
    host.append(this.el);
    this.g = this.el.getContext('2d')!;
  }

  private fit(): void {
    const w = this.el.clientWidth || window.innerWidth, h = this.el.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w; this.h = h; this.dpr = dpr;
    for (const c of [this.el, this.bufA, this.bufB]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    this.grain = this.g.createPattern(grainSource(), 'repeat');
    const W = this.el.width, H = this.el.height;
    const vg = this.g.createRadialGradient(W / 2, H * 0.42, Math.min(W, H) * 0.35, W / 2, H * 0.42, Math.hypot(W, H) * 0.62);
    vg.addColorStop(0, 'rgba(40,24,12,0)');
    vg.addColorStop(1, 'rgba(40,24,12,0.32)');
    this.vignette = vg;
  }

  /** 畫一個鏡頭到 g (整張清空重畫) */
  private drawShot(g: CanvasRenderingContext2D, f: ShotFrame, reduce: boolean): void {
    const { w, h, dpr } = this;
    const stageH = h * (1 - bandFraction(w, h));
    const k = Math.min(w / SAFE_W, stageH / SAFE_H);
    const ox = w / 2 - (SAFE_W / 2) * k, oy = stageH / 2 - (SAFE_H / 2) * k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
    const motion = f.motion ?? {};
    const ctx: SceneCtx = {
      g, t: f.shotSec, motion, labels: f.labels, pal: this.theme.pal, room2d: this.theme.room2d, reduce,
      m: reduce ? 0 : ease(f.motionSec / (motion.durSec ?? 8)),
      view: { x0: -ox / k, y0: -oy / k, x1: (w - ox) / k, y1: (h - oy) / k }
    };
    g.save();
    (PAPER_SCENES[f.sceneId] ?? blankScene)(ctx);
    g.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  draw(f: CutsceneFrame): void {
    this.fit();
    const g = this.g;
    const W = this.el.width, H = this.el.height;
    const tr = f.transition;
    if (!tr || tr.kind === 'cut' || tr.p >= 1) {
      this.drawShot(g, f.cur, f.reduceMotion);
    } else {
      const a = this.bufA.getContext('2d')!;
      this.drawShot(a, f.cur, f.reduceMotion);
      const b = this.bufB.getContext('2d')!;
      if (f.prev) this.drawShot(b, f.prev, f.reduceMotion);
      else { b.setTransform(1, 0, 0, 1, 0, 0); b.fillStyle = FADE_COLOR; b.fillRect(0, 0, W, H); }
      this.composite(tr.kind, tr.p, W, H);
    }
    // 紙紋與暈影
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (this.grain) { g.globalAlpha = 0.55; g.fillStyle = this.grain; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    if (this.vignette) { g.fillStyle = this.vignette; g.fillRect(0, 0, W, H); }
  }

  private composite(kind: CutTransitionKind, p: number, W: number, H: number): void {
    const g = this.g, A = this.bufA, B = this.bufB;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    const e = ease(p);
    switch (kind) {
      case 'fade': {
        if (p < 0.5) { g.drawImage(B, 0, 0); g.globalAlpha = ease(p * 2); }
        else { g.drawImage(A, 0, 0); g.globalAlpha = 1 - ease((p - 0.5) * 2); }
        g.fillStyle = FADE_COLOR; g.fillRect(0, 0, W, H);
        g.globalAlpha = 1;
        break;
      }
      case 'inkBleed': {
        g.drawImage(B, 0, 0);
        const cx = W / 2, cy = H * 0.4, maxR = Math.hypot(W, H) * 0.62;
        const r = e * maxR;
        const path = new Path2D();
        const n = 64;
        for (let i = 0; i <= n; i++) {
          const th = (i / n) * Math.PI * 2;
          const k = r * (1 + 0.07 * Math.sin(th * 5 + p * 3) + 0.04 * Math.sin(th * 11 + 1.3) + 0.03 * Math.sin(th * 17 + p * 5));
          const x = cx + Math.cos(th) * k, y = cy + Math.sin(th) * k;
          if (i) path.lineTo(x, y); else path.moveTo(x, y);
        }
        path.closePath();
        g.save(); g.clip(path); g.drawImage(A, 0, 0); g.restore();
        const lw = (1 - e) * 30 * this.dpr + 3;
        const pal = this.theme.pal;
        g.lineWidth = lw * 1.8; g.strokeStyle = rgba(pal.inkPurple, 0.35 * (1 - e * 0.6)); g.stroke(path);
        g.lineWidth = lw; g.strokeStyle = rgba(pal.inkBlue, 0.9 * (1 - e * 0.5)); g.stroke(path);
        const rr = rng(7);
        g.fillStyle = rgba(pal.inkBlue, 0.8 * (1 - e));
        for (let i = 0; i < 9; i++) {
          const th = rr() * Math.PI * 2, d = r * (1.08 + rr() * 0.12);
          g.beginPath(); g.arc(cx + Math.cos(th) * d, cy + Math.sin(th) * d, (4 + rr() * 9) * this.dpr * (1 - e * 0.7), 0, Math.PI * 2); g.fill();
        }
        break;
      }
      case 'pageTurn': {
        g.drawImage(A, 0, 0);
        const edge = W * (1 - e);
        g.save(); g.beginPath(); g.rect(0, 0, edge, H); g.clip(); g.drawImage(B, 0, 0); g.restore();
        const sh = g.createLinearGradient(edge - 50 * this.dpr, 0, edge + 40 * this.dpr, 0);
        sh.addColorStop(0, 'rgba(40,24,12,0)'); sh.addColorStop(0.55, 'rgba(40,24,12,0.35)'); sh.addColorStop(1, 'rgba(40,24,12,0)');
        g.fillStyle = sh; g.fillRect(edge - 50 * this.dpr, 0, 90 * this.dpr, H);
        break;
      }
      case 'paperTear': {
        g.drawImage(A, 0, 0);
        const off = e * W * 0.6;
        const tear = (side: -1 | 1) => {
          const p2 = new Path2D();
          const rr = rng(11);
          p2.moveTo(side < 0 ? 0 : W, 0);
          for (let y = 0; y <= H; y += 24 * this.dpr) p2.lineTo(W / 2 + (rr() - 0.5) * 30 * this.dpr, y);
          p2.lineTo(side < 0 ? 0 : W, H);
          p2.closePath();
          g.save(); g.translate(side * off, 0); g.clip(p2); g.drawImage(B, 0, 0); g.restore();
        };
        tear(-1); tear(1);
        break;
      }
      default: { // crossfade
        g.drawImage(B, 0, 0);
        g.globalAlpha = e;
        g.drawImage(A, 0, 0);
        g.globalAlpha = 1;
      }
    }
  }

  dispose(): void { this.el.remove(); }
}
