// 音訊純邏輯：種子亂數、調式、動機、作曲、脈動 (audio-design 2、8)
import { describe, it, expect } from 'vitest';
import { hashSeed, mulberry32 } from '../../../src/puzzle/audio/rng';
import { MODES, degreeToMidi, fold, mtof } from '../../../src/puzzle/audio/theory';
import {
  FATHER, INSTRUMENTS, LAYERS, PULSE_MAX_BPM, SCORES, SCORE_IDS, THEME, THEME_RESOLVED, barSec, bpmAt, clearPhrase, composeBar, levelIntensity,
  motifBeats, motifNotes, pulseTimes, scoreForChapter, solvedPhrase
} from '../../../src/puzzle/audio/score';

describe('種子亂數', () => {
  it('mulberry32 同種子同序列、不同種子不同、值域 [0, 1)', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const sa = Array.from({ length: 100 }, a), sb = Array.from({ length: 100 }, b), sc = Array.from({ length: 100 }, c);
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    expect(sa.every(x => x >= 0 && x < 1)).toBe(true);
    expect(new Set(sa).size).toBe(100);
  });
  it('hashSeed 確定性、對參數敏感', () => {
    expect(hashSeed('ch1', 3)).toBe(hashSeed('ch1', 3));
    expect(hashSeed('ch1', 3)).not.toBe(hashSeed('ch1', 4));
    expect(hashSeed('ch1', 3)).not.toBe(hashSeed('ch2', 3));
  });
});

describe('調式與動機', () => {
  it('每個調式 7 級、從 0 遞增、在一個八度內', () => {
    for (const m of Object.values(MODES)) {
      expect(m).toHaveLength(7);
      expect(m[0]).toBe(0);
      expect(m.every((x, i) => i === 0 || x > m[i - 1])).toBe(true);
      expect(m[6]).toBeLessThan(12);
    }
  });
  it('級數 → MIDI：跨八度、負級數；利底亞第 4 級是升 4 (增四度)', () => {
    expect(degreeToMidi(62, 'ionian', 0)).toBe(62);
    expect(degreeToMidi(62, 'ionian', 7)).toBe(74);
    expect(degreeToMidi(62, 'ionian', -1)).toBe(61);
    expect(degreeToMidi(62, 'lydian', 3) - 62).toBe(6);
    expect(degreeToMidi(62, 'dorian', 2) - 62).toBe(3);
    expect(mtof(69)).toBeCloseTo(440);
    expect(fold(30, 52, 64)).toBe(54);
    expect(fold(80, 52, 64)).toBe(56);
  });
  it('圖紙主題停在第 2 級、還原落回主音；同一動機在各章調式下輪廓 (上下方向) 不變', () => {
    expect(THEME[THEME.length - 1][0]).toBe(1);
    expect(THEME_RESOLVED[THEME_RESOLVED.length - 1][0]).toBe(0);
    expect(motifBeats(THEME)).toBe(6);
    const contour = (id: keyof typeof SCORES) => {
      const ns = motifNotes(SCORES[id], THEME, 'celesta', 'melody').map(n => n.midi);
      return ns.slice(1).map((m, i) => Math.sign(m - ns[i]));
    };
    const ref = contour('ch1');
    for (const id of SCORE_IDS) expect(contour(id)).toEqual(ref);
    // 但音程不同 (章的顏色)：一 利底亞 vs 二 多利亞
    const iv = (id: keyof typeof SCORES) => motifNotes(SCORES[id], THEME, 'celesta', 'melody').map(n => n.midi - SCORES[id].tonic);
    expect(iv('ch1')).not.toEqual(iv('ch2'));
    expect(FATHER.map(n => n[0])).toEqual([2, 1, 0, -1, 0]);
  });
  it('每章 / 場景有配樂且各章調式或主音不同 (辨識度)', () => {
    const chapters = ['ch1', 'ch2', 'ch3', 'ch4', 'ch5', 'ch6'] as const;
    expect(new Set(chapters.map(c => `${SCORES[c].mode}:${SCORES[c].tonic % 12}`)).size).toBe(6);
    expect(scoreForChapter(2).id).toBe('ch2');
    expect(scoreForChapter(99).id).toBe('ch6');
    expect(scoreForChapter(0).id).toBe('ch1');
    expect(SCORES.ch4.noBgm).toBe(true);
    expect(SCORES.ch3.pulse).toBeDefined();
  });
});

describe('composeBar (確定性作曲)', () => {
  it('同配樂 / 同小節兩次結果相同；不同小節不同', () => {
    for (const id of SCORE_IDS) {
      expect(composeBar(SCORES[id], 5)).toEqual(composeBar(SCORES[id], 5));
    }
    const bars = Array.from({ length: 8 }, (_, i) => JSON.stringify(composeBar(SCORES.ch3, i)));
    expect(new Set(bars).size).toBeGreaterThan(4);
  });
  it('音符欄位合法：層 / 樂器存在、拍 ≥ 0、長度 > 0、vel 0～1、音高在可聽範圍 (MIDI 24～108)', () => {
    for (const id of SCORE_IDS) for (let bar = 0; bar < 32; bar++) {
      for (const n of composeBar(SCORES[id], bar, { transpose: -1 })) {
        expect(LAYERS).toContain(n.layer);
        expect(INSTRUMENTS).toContain(n.inst);
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(8);
        expect(n.dur).toBeGreaterThan(0);
        expect(n.vel).toBeGreaterThan(0);
        expect(n.vel).toBeLessThanOrEqual(1);
        expect(n.midi).toBeGreaterThanOrEqual(24);
        expect(n.midi).toBeLessThanOrEqual(108);
      }
    }
  });
  it('第四章不放 BGM：只有低音 (drone) 層，音高 40～80 Hz', () => {
    for (let bar = 0; bar < 16; bar++) {
      const ns = composeBar(SCORES.ch4, bar);
      expect(ns.map(n => n.layer)).toEqual(['bass']);
      expect(ns[0].inst).toBe('drone');
      const hz = mtof(ns[0].midi);
      expect(hz).toBeGreaterThanOrEqual(40);
      expect(hz).toBeLessThanOrEqual(80);
    }
  });
  it('章動機每 motifEvery 小節出現在第 0 小節；過場選項：降半音、轉暖改進行、低八度', () => {
    const s = SCORES.ch1;
    const mel = (bar: number) => composeBar(s, bar).filter(n => n.layer === 'melody').map(n => n.midi);
    expect(mel(0)).toEqual(motifNotes(s, s.motif!, 'glock', 'melody').map(n => n.midi));
    expect(mel(4)).toEqual(motifNotes(s, s.theme!, 'glock', 'melody').map(n => n.midi));
    const p = SCORES.prologue;
    const base = composeBar(p, 0), down = composeBar(p, 0, { transpose: -1 });
    expect(down.map((n, i) => (((base[i].midi - n.midi) % 12) + 12) % 12)).toEqual(base.map(() => 1)); // 每個音降半音 (低音摺回音域)
    const padRoot = (o = {}) => composeBar(p, 0, o).filter(n => n.layer === 'bass')[0].midi;
    expect(padRoot({ warm: true })).not.toBe(padRoot());
    expect(composeBar(p, 1, { low: true }).filter(n => n.layer === 'pad').map(n => n.midi)).toEqual(composeBar(p, 1).filter(n => n.layer === 'pad').map(n => n.midi - 12));
  });
  it('第三章琶音每小節多長一個音 (2 → 6 循環)；琶音 ≤ 8 分音符', () => {
    const n = (bar: number) => composeBar(SCORES.ch3, bar).filter(x => x.layer === 'arp').length;
    expect([0, 1, 2, 3, 4, 5].map(n)).toEqual([2, 3, 4, 5, 6, 2]);
    for (const id of SCORE_IDS) expect(SCORES[id].arpRate).toBeLessThanOrEqual(2);
  });
  it('小節長度 = 4 拍', () => { expect(barSec(SCORES.prologue)).toBeCloseTo(4); });
});

describe('脈動低音 (規格 9.1：≤ 96 BPM、變速漸變 ≥ 2 秒)', () => {
  it('bpmAt 夾在上限、漸變至少 2 秒', () => {
    const r = { from: 60, to: 90, t0: 10, ramp: 0.5 };
    expect(bpmAt(r, 9)).toBe(60);
    expect(bpmAt(r, 11)).toBeCloseTo(60 + 30 * 0.5); // ramp 被拉長為 2 秒
    expect(bpmAt({ ...r, to: 200 }, 100)).toBe(PULSE_MAX_BPM);
  });
  it('pulseTimes：拍距 ≥ 60/96 秒、遞增、確定性', () => {
    const r = { from: 60, to: 96, t0: 0, ramp: 4 };
    const ts = pulseTimes(0, 20, r);
    expect(ts).toEqual(pulseTimes(0, 20, r));
    expect(ts.every((t, i) => i === 0 || t - ts[i - 1] >= 60 / PULSE_MAX_BPM - 1e-9)).toBe(true);
    expect(ts[1] - ts[0]).toBeCloseTo(1);
    expect(ts[ts.length - 1] - ts[ts.length - 2]).toBeCloseTo(60 / 96);
  });
});

describe('短旋律與強度', () => {
  it('完成謎題 / 通關旋律在目前章節的調上、確定性', () => {
    expect(solvedPhrase(SCORES.ch2)).toEqual(solvedPhrase(SCORES.ch2));
    expect(solvedPhrase(SCORES.ch1)[0].midi).not.toBe(solvedPhrase(SCORES.ch2)[0].midi);
    const c = clearPhrase(SCORES.ch1).filter(n => n.layer === 'melody');
    expect(c[c.length - 1].midi % 12).toBe(SCORES.ch1.tonic % 12); // 落回主音
  });
  it('強度依規格 9.1 曲線 (0～3)', () => {
    expect(levelIntensity('1-3')).toBe(1);
    expect(levelIntensity('2-4')).toBe(2);
    expect(levelIntensity('4-3')).toBe(3);
    expect(levelIntensity('unknown')).toBe(1);
  });
});
