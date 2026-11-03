// 混音曲線與音效配方的規格上限 (規格 9.1 聲音表；audio-design 3、4)
import { describe, it, expect } from 'vitest';
import {
  CLIP_CEIL, DEFAULT_VOLUMES, LIMITER, LIMITS, MUSIC_CONTEXTS, busGains, clipCurve, compressorMakeup, crossfade, dbToGain, fadeCurve, gainToDb, layerMix, volumeGain
} from '../../../src/puzzle/audio/mix';
import { SFX, SFX_IDS, peakShare, sfxAttack, sfxDuration } from '../../../src/puzzle/audio/sfx';
import { INSTRUMENT_SPECS } from '../../../src/puzzle/audio/engine';
import { LAYERS, SCORES, composeBar } from '../../../src/puzzle/audio/score';

describe('音量曲線與淡入淡出', () => {
  it('volumeGain：0 → 0、1 → 1、單調、越界夾住、NaN → 0', () => {
    expect(volumeGain(0)).toBe(0);
    expect(volumeGain(1)).toBe(1);
    expect(volumeGain(0.5)).toBeCloseTo(0.25);
    expect(volumeGain(2)).toBe(1);
    expect(volumeGain(-1)).toBe(0);
    expect(volumeGain(Number.NaN)).toBe(0);
    const xs = Array.from({ length: 21 }, (_, i) => volumeGain(i / 20));
    expect(xs.every((x, i) => i === 0 || x > xs[i - 1])).toBe(true);
  });
  it('busGains：mute → master 0，其餘照舊；預設音量合理 (0 < 音樂 < 音效 ≤ 總 ≤ 1)', () => {
    expect(busGains({ ...DEFAULT_VOLUMES, mute: true }).master).toBe(0);
    expect(busGains(DEFAULT_VOLUMES).master).toBeCloseTo(0.64);
    expect(DEFAULT_VOLUMES.music).toBeGreaterThan(0);
    expect(DEFAULT_VOLUMES.music).toBeLessThan(DEFAULT_VOLUMES.sfx);
    expect(DEFAULT_VOLUMES.sfx).toBeLessThanOrEqual(DEFAULT_VOLUMES.master);
  });
  it('fadeCurve：端點精確、單調 (淡入 / 淡出)；crossfade 等功率', () => {
    for (const [a, b] of [[0, 1], [1, 0], [0.2, 0.9]] as const) {
      const c = fadeCurve(a, b, 16);
      expect(c[0]).toBeCloseTo(a);
      expect(c[15]).toBeCloseTo(b);
      expect(Array.from(c).every((x, i) => i === 0 || (b > a ? x >= c[i - 1] : x <= c[i - 1]))).toBe(true);
    }
    expect(crossfade(0)).toEqual([1, 0]);
    expect(crossfade(1)[0]).toBeCloseTo(0);
    for (const p of [0.1, 0.5, 0.9]) { const [o, n] = crossfade(p); expect(o * o + n * n).toBeCloseTo(1); }
  });
  it('dB 轉換', () => {
    expect(dbToGain(-6)).toBeCloseTo(0.501, 3);
    expect(gainToDb(1)).toBe(0);
    expect(gainToDb(0)).toBe(-Infinity);
  });
});

describe('限幅器與削波 (規格 9.1：門檻 −6 dBFS、比例 ≥ 20:1、攻擊 ≤ 3 ms、釋放約 250 ms)', () => {
  it('限幅器參數', () => {
    expect(LIMITER.threshold).toBe(-6);
    expect(LIMITER.ratio).toBeGreaterThanOrEqual(20);
    expect(LIMITER.attack).toBeLessThanOrEqual(0.003);
    expect(LIMITER.release).toBeCloseTo(0.25);
  });
  it('削波曲線：峰值 ≤ −6 dBFS、門檻以下線性、奇對稱、單調', () => {
    const c = clipCurve(1025);
    const peak = Math.max(...Array.from(c, Math.abs));
    expect(peak).toBeLessThanOrEqual(CLIP_CEIL);
    expect(gainToDb(peak)).toBeLessThanOrEqual(LIMITS.peakDb);
    expect(c[512]).toBeCloseTo(0);
    expect(c[512 + 128]).toBeCloseTo(0.25, 5); // x = 0.25 在線性區
    for (let i = 0; i < 1025; i++) expect(c[i]).toBeCloseTo(-c[1024 - i], 6);
    expect(Array.from(c).every((x, i) => i === 0 || x >= c[i - 1])).toBe(true);
  });
  it('自動補償增益公式 (Web Audio 規格)：門檻 −6、20:1 → 約 1.48 倍 (瀏覽器實測抵消後 −20 dBFS 進 = −20 出)', () => {
    expect(compressorMakeup(-6, 20)).toBeCloseTo(1.482, 2);
  });
});

describe('情境層 (layerMix)', () => {
  it('強度 0 只有墊音與低音；強度越高層越多；強度 3 才有脈動 (第三章輕脈動例外)', () => {
    const on = (m: Record<string, number>) => LAYERS.filter(l => m[l] > 0);
    expect(on(layerMix('explore', 0, false))).toEqual(['pad', 'bass']);
    expect(on(layerMix('explore', 1, false))).toEqual(['pad', 'bass', 'melody', 'arp']);
    expect(on(layerMix('explore', 2, false))).toEqual(['pad', 'bass', 'melody', 'arp', 'texture']);
    expect(on(layerMix('explore', 3, false))).toContain('pulse');
    expect(layerMix('explore', 1, false, true).pulse).toBeGreaterThan(0);
  });
  it('calmTension：脈動 0、低音 (低頻衝擊) 降 6 dB；各情境都成立', () => {
    for (const c of MUSIC_CONTEXTS) for (const i of [0, 1, 2, 3]) {
      const calm = layerMix(c, i, true, true), normal = layerMix(c, i, false, true);
      expect(calm.pulse).toBe(0);
      expect(calm.bass).toBeCloseTo(normal.bass * 0.5);
    }
  });
  it('情境：tension 開脈動關旋律、turn 旋律變輕琶音變重、quiet 只剩墊音與低音、solved 全部壓低', () => {
    const e = layerMix('explore', 2, false);
    expect(layerMix('tension', 2, false).pulse).toBeGreaterThan(0);
    expect(layerMix('tension', 2, false).melody).toBe(0);
    expect(layerMix('turn', 2, false).melody).toBeLessThan(e.melody);
    expect(layerMix('turn', 2, false).arp).toBeGreaterThan(e.arp);
    const q = layerMix('quiet', 3, false);
    expect(LAYERS.filter(l => q[l] > 0)).toEqual(['pad', 'bass']);
    const s = layerMix('solved', 2, false);
    for (const l of LAYERS) expect(s[l]).toBeCloseTo(e[l] * 0.35);
  });
  it('低頻持續音 (第四章 drone) 的總增益 ≤ 0.03', () => {
    const maxVel = Math.max(...Array.from({ length: 16 }, (_, b) => composeBar(SCORES.ch4, b)).flat().map(n => n.vel));
    const g = layerMix('explore', 3, false).bass * maxVel * INSTRUMENT_SPECS.drone.gain;
    expect(g).toBeLessThanOrEqual(LIMITS.droneGain + 1e-9);
  });
});

describe('音效配方 (規格 9.1 上限)', () => {
  it('id 都帶 sfx. 前綴、不重複；每個配方有聲部 (旋律類除外)；聲部比例 > 0', () => {
    expect(new Set(SFX_IDS).size).toBe(SFX_IDS.length);
    for (const id of SFX_IDS) {
      expect(id.startsWith('sfx.')).toBe(true);
      const d = SFX[id];
      if (d.cat === 'phrase') { expect(d.phrase).toBeDefined(); continue; }
      expect(d.parts.length).toBeGreaterThan(0);
      expect(d.parts.every(p => p.g > 0)).toBe(true);
    }
  });
  it('正規化：先後出現、不重疊的聲部各自用滿音量 (碎石腳步)；同時發聲的聲部分攤 (比例總和)', () => {
    const gravel = SFX['sfx.cs.gravel'];
    expect(peakShare(gravel)).toBeCloseTo(gravel.parts[0].g);
    const scare = SFX['sfx.scare.coats'];
    expect(peakShare(scare)).toBeCloseTo(scare.parts.reduce((a, p) => a + p.g, 0)); // 0.12 秒時六個聲部都在響
    for (const id of SFX_IDS) if (SFX[id].parts.length) expect(peakShare(SFX[id])).toBeGreaterThan(0);
  });
  it('所有聲音起音 ≥ 5 ms 或由引擎補到 5 ms；峰值設計 ≤ −6 dBFS', () => {
    for (const id of SFX_IDS) {
      const d = SFX[id];
      expect(d.db).toBeLessThanOrEqual(LIMITS.peakDb);
      for (const p of d.parts) { expect(p.env.a).toBeGreaterThan(0); expect(p.env.d).toBeGreaterThan(0); }
    }
    expect(LIMITS.minAttackSec).toBe(0.005);
  });
  it('環境音：峰值 ≤ −24 dBFS、起音 ≥ 150 ms', () => {
    const amb = SFX_IDS.map(id => SFX[id]).filter(d => d.cat === 'ambient');
    expect(amb.length).toBeGreaterThan(8);
    for (const d of amb) {
      expect(d.db, d.id).toBeLessThanOrEqual(LIMITS.ambientDb);
      expect(sfxAttack(d), d.id).toBeGreaterThanOrEqual(LIMITS.ambientAttackSec);
    }
  });
  it('關鍵動作回饋音：≤ −18 dBFS、含 80～120 Hz 的低沉「咚」', () => {
    const fb = SFX_IDS.map(id => SFX[id]).filter(d => d.cat === 'feedback');
    expect(fb.map(d => d.id)).toEqual(expect.arrayContaining(['sfx.cube.turn', 'sfx.card.stick', 'sfx.plate.press']));
    for (const d of fb) {
      expect(d.db).toBeLessThanOrEqual(LIMITS.feedbackDb);
      expect(d.parts.some(p => p.src === 'sine' && p.f! >= LIMITS.feedbackHz[0] && p.f! <= LIMITS.feedbackHz[1])).toBe(true);
    }
  });
  it('驚嚇：≤ 1.2 秒、設計峰值 −6 dBFS；平靜版 ≤ −24 dBFS 且起音緩 (≥ 150 ms 的主聲部)', () => {
    const s = SFX['sfx.scare.coats'], g = SFX['sfx.scare.gentle'];
    expect(sfxDuration(s)).toBeLessThanOrEqual(LIMITS.scareMaxSec);
    expect(s.db).toBeLessThanOrEqual(LIMITS.peakDb);
    expect(g.db).toBeLessThanOrEqual(LIMITS.scareCalmDb);
    expect(Math.max(...g.parts.map(p => p.env.a))).toBeGreaterThanOrEqual(0.15);
  });
  it('過場撕紙聲 ≤ −18 dBFS、起音 ≥ 150 ms (分鏡 2.5)；過場音效名稱不含驚嚇字樣', () => {
    const t = SFX['sfx.cs.paper.tear'];
    expect(t.db).toBeLessThanOrEqual(-18);
    expect(sfxAttack(t)).toBeGreaterThanOrEqual(0.15);
    for (const id of SFX_IDS.filter(i => i.startsWith('sfx.cs.'))) expect(/scare|jump|shriek|scream/i.test(id)).toBe(false);
  });
  it('規格列出的互動都有音效 (腳步、跳、切換、拾取、拉桿、魔方 / 控制盤轉動、墨、字卡、門、書擋、燈書、驚嚇、完成、UI、過場紙聲)', () => {
    for (const id of ['sfx.step.wood', 'sfx.step.paper', 'sfx.jump', 'sfx.land', 'sfx.switch.to2d', 'sfx.switch.to3d', 'sfx.pickup', 'sfx.pickup.key', 'sfx.lever.pull',
      'sfx.cube.turn', 'sfx.dial.turn', 'sfx.dial.activate', 'sfx.ink.drop', 'sfx.card.stick', 'sfx.card.wrong', 'sfx.door.open', 'sfx.bookend.fall', 'sfx.lamp.on', 'sfx.lamp.off',
      'sfx.scare.coats', 'sfx.scare.gentle', 'sfx.puzzle.solved', 'sfx.level.clear', 'sfx.ui.click', 'sfx.cs.paper.flutter', 'sfx.cs.flatten']) expect(SFX[id], id).toBeDefined();
  });
});
