import { describe, it, expect, beforeAll } from 'vitest';
import { CUTSCENES } from '../../../src/puzzle/content/cutscenes';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { PAPER_SCENES } from '../../../src/puzzle/render/cutscene/scenes';
import { roughPoly, rng } from '../../../src/puzzle/render/cutscene/paper';
import { bandFraction } from '../../../src/puzzle/render/cutscene/canvas';
import { FOYER_THEME } from '../../../src/puzzle/render/themes/foyer';
import type { SceneCtx } from '../../../src/puzzle/render/cutscene/types';

/** node 沒有 Canvas / Path2D：用吞掉所有呼叫、但記錄呼叫次數的假 context */
function fakeCtx(): { g: CanvasRenderingContext2D; calls: () => number } {
  let n = 0;
  const grad = { addColorStop: () => undefined };
  const g = new Proxy({}, {
    get: (_t, k) => {
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      return (..._a: unknown[]) => { n++; return undefined; };
    },
    set: () => true
  }) as unknown as CanvasRenderingContext2D;
  return { g, calls: () => n };
}

beforeAll(() => {
  (globalThis as { Path2D?: unknown }).Path2D ??= class { moveTo() {} lineTo() {} closePath() {} quadraticCurveTo() {} ellipse() {} rect() {} addPath() {} };
});

describe('過場剪紙分鏡 (render/cutscene)', () => {
  it('每個過場鏡頭的 sceneId 都有繪製函式；畫面字 (labels) 的 key 都在文字表', () => {
    const ids = CUTSCENES.flatMap(c => c.shots.map(s => s.art.sceneId));
    expect(ids.length).toBe(12);
    expect(ids.filter(id => !(id in PAPER_SCENES))).toEqual([]);
    const labels = CUTSCENES.flatMap(c => c.shots.flatMap(s => Object.values(s.art.labels ?? {})));
    expect(labels.filter(k => !(k in zhHant))).toEqual([]);
  });

  it('每個分鏡在各時間點、一般 / 減弱動態、橫 / 直畫面都能畫 (不丟例外、確實有繪製呼叫)', () => {
    for (const [id, draw] of Object.entries(PAPER_SCENES)) {
      for (const t of [0, 1.3, 4.5, 30]) {
        for (const reduce of [false, true]) {
          for (const view of [{ x0: -170, y0: 0, x1: 1070, y1: 900 }, { x0: 0, y0: -350, x1: 900, y1: 1600 }]) {
            const { g, calls } = fakeCtx();
            const s: SceneCtx = { g, t, m: reduce ? 0 : 0.5, motion: { push: 0.05, panX: 0.05, parallax: 0.02 }, labels: { title: 'x', engrave: 'x' }, pal: FOYER_THEME.pal, room2d: FOYER_THEME.room2d, reduce, view };
            expect(() => draw(s), `${id} t=${t}`).not.toThrow();
            expect(calls()).toBeGreaterThan(10);
          }
        }
      }
    }
  });

  it('紙邊抖動可重現 (同 seed 同路徑 = 不閃爍)；字幕帶比例：橫 22%、直 28%', () => {
    const a = rng(5), b = rng(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(roughPoly([[0, 0], [100, 0], [100, 100]], 3)).toBe(roughPoly([[0, 0], [100, 0], [100, 100]], 3));
    expect([bandFraction(1280, 720), bandFraction(390, 844)]).toEqual([0.22, 0.28]);
  });
});
