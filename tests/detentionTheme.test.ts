import { describe, it, expect, vi } from 'vitest';

// 假 AudioContext：計數建立的音源節點，驗證排程實際發聲與手機負擔
const fake = vi.hoisted(() => {
  const counts = { osc: 0, src: 0 };
  const param = () => ({
    setValueAtTime() { return this; }, linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; }, cancelScheduledValues() { return this; }
  });
  const node = () => ({
    connect() {}, start() {}, stop() {}, type: '', buffer: null,
    frequency: param(), gain: param(), Q: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param()
  });
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'running', destination: {},
    resume() {},
    createOscillator() { counts.osc++; return node(); },
    createBufferSource() { counts.src++; return node(); },
    createGain: node, createBiquadFilter: node, createDynamicsCompressor: node,
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) })
  };
  return { counts, ctx };
});
vi.mock('../src/audio/audioContext', () => ({ getAudioContext: () => fake.ctx, resumeAudioContext: () => undefined }));
vi.stubGlobal('window', { setInterval: () => 1 });
import {
  detentionStep, detentionMusicPhase, detentionNeedsStinger, detentionMidiToFreq,
  DET_LOOP_STEPS, DET_STEPS_PER_BAR, DET_TEMPO, DET_LABEL, type DetentionPhase, type DetentionNote
} from '../src/audio/detentionTheme';
import { BGMManager } from '../src/audio/BGMManager';

const PHASES: DetentionPhase[] = ['INTRO', 'SNEAK', 'SEARCH', 'ALERT', 'BOSS', 'ESCAPED'];
const PITCHED = new Set(['BASS', 'PBASS', 'PAD', 'CHORD', 'LEAD', 'BOX', 'STAB']);

function loopNotes(phase: DetentionPhase): DetentionNote[][] {
  const all: DetentionNote[][] = [];
  for (let s = 0; s < DET_LOOP_STEPS; s++) all.push(detentionStep(s, phase, []).slice());
  return all;
}

describe('鐵窗夜行：段落判斷', () => {
  const base = { cutscene: false, escaped: false, bossEngaged: false, alertPhase: 'NORMAL' as const };
  it('警戒階段對應段落', () => {
    expect(detentionMusicPhase(base)).toBe('SNEAK');
    expect(detentionMusicPhase({ ...base, alertPhase: 'ALERT' })).toBe('ALERT');
    expect(detentionMusicPhase({ ...base, alertPhase: 'EVASION' })).toBe('SEARCH');
    expect(detentionMusicPhase({ ...base, alertPhase: 'CAUTION' })).toBe('SEARCH');
  });
  it('優先序：開場 > 通關 > 總教官 > 警戒', () => {
    expect(detentionMusicPhase({ cutscene: true, escaped: true, bossEngaged: true, alertPhase: 'ALERT' })).toBe('INTRO');
    expect(detentionMusicPhase({ ...base, escaped: true, bossEngaged: true, alertPhase: 'ALERT' })).toBe('ESCAPED');
    expect(detentionMusicPhase({ ...base, bossEngaged: true, alertPhase: 'ALERT' })).toBe('BOSS');
  });
  it('突發重音只在警戒 / 總教官 / 通關進場，總教官轉警戒不重打', () => {
    expect(detentionNeedsStinger('SNEAK', 'ALERT')).toBe(true);
    expect(detentionNeedsStinger('SEARCH', 'ALERT')).toBe(true);
    expect(detentionNeedsStinger('ALERT', 'BOSS')).toBe(true);
    expect(detentionNeedsStinger('BOSS', 'ALERT')).toBe(false);
    expect(detentionNeedsStinger('ALERT', 'SEARCH')).toBe(false);
    expect(detentionNeedsStinger('SEARCH', 'SNEAK')).toBe(false);
    expect(detentionNeedsStinger('INTRO', 'SNEAK')).toBe(false);
    expect(detentionNeedsStinger('ALERT', 'ALERT')).toBe(false);
  });
});

describe('鐵窗夜行：音符表', () => {
  it('8 小節 128 步一循環，循環邊界一致', () => {
    expect(DET_LOOP_STEPS).toBe(DET_STEPS_PER_BAR * 8);
    for (const p of PHASES) {
      expect(detentionStep(DET_LOOP_STEPS + 5, p, []).length).toBe(detentionStep(5, p, []).length);
      expect(detentionStep(-1, p, []).length).toBe(detentionStep(DET_LOOP_STEPS - 1, p, []).length);
    }
  });

  it('每段都有聲音、單步音符數有上限 (手機 CPU)，音高在合理範圍', () => {
    for (const p of PHASES) {
      const all = loopNotes(p);
      expect(all.flat().length).toBeGreaterThan(0);
      for (const step of all) {
        expect(step.length).toBeLessThanOrEqual(7);
        for (const n of step) {
          expect(n.dur).toBeGreaterThan(0);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
          if (PITCHED.has(n.voice)) {
            expect(n.midi).toBeGreaterThanOrEqual(28);
            expect(n.midi).toBeLessThanOrEqual(96);
          }
        }
      }
    }
  });

  it('潛入比追捕稀疏、速度慢；速度遞增：序曲 < 潛入 < 搜索 < 進行曲 < 追捕', () => {
    const count = (p: DetentionPhase) => loopNotes(p).flat().length;
    expect(count('SNEAK')).toBeLessThan(count('SEARCH'));
    expect(count('SEARCH')).toBeLessThan(count('ALERT'));
    expect(DET_TEMPO.INTRO).toBeLessThan(DET_TEMPO.SNEAK);
    expect(DET_TEMPO.SNEAK).toBeLessThan(DET_TEMPO.SEARCH);
    expect(DET_TEMPO.SEARCH).toBeLessThan(DET_TEMPO.BOSS);
    expect(DET_TEMPO.BOSS).toBeLessThan(DET_TEMPO.ALERT);
    // 和校園 (108) 區隔
    expect(DET_TEMPO.SNEAK).not.toBe(108);
  });

  it('潛入：主題只在前半段由音樂盒演奏，後半段留白', () => {
    const all = loopNotes('SNEAK');
    const firstBox = all.slice(0, 64).flat().filter(n => n.voice === 'BOX').length;
    const secondBox = all.slice(64).flat().filter(n => n.voice === 'BOX').length;
    expect(firstBox).toBeGreaterThan(0);
    expect(secondBox).toBe(0);
  });

  it('破曉越獄轉大調：旋律與和聲不含 G、C、F (E 大調音階外音)', () => {
    const pcs = loopNotes('ESCAPED').flat().filter(n => PITCHED.has(n.voice)).map(n => n.midi % 12);
    expect(pcs).not.toContain(7);
    expect(pcs).not.toContain(0);
    expect(pcs).not.toContain(5);
    const minorPcs = loopNotes('SNEAK').flat().filter(n => PITCHED.has(n.voice)).map(n => n.midi % 12);
    expect(minorPcs).toContain(7); // 小調有 G
  });

  it('警戒 / 總教官 / 通關重音只在小節第一拍追加', () => {
    for (const p of ['ALERT', 'BOSS', 'ESCAPED'] as DetentionPhase[]) {
      expect(detentionStep(0, p, [], true).length).toBeGreaterThan(detentionStep(0, p, []).length);
      expect(detentionStep(3, p, [], true).length).toBe(detentionStep(3, p, []).length);
    }
    expect(detentionStep(0, 'ALERT', [], true).some(n => n.voice === 'STAB' && n.midi === 82)).toBe(true);
  });

  it('out 陣列重用', () => {
    const out: DetentionNote[] = [];
    const r = detentionStep(0, 'ALERT', out);
    expect(r).toBe(out);
    detentionStep(1, 'SNEAK', out);
    expect(out.length).toBe(0);
    expect(detentionMidiToFreq(69)).toBeCloseTo(440, 5);
  });
});

describe('BGMManager：世界切換', () => {
  it('進特訓院依段落切模式與名稱、追捕切換暫停；回校園恢復', () => {
    const bgm = new BGMManager();
    const log: Array<[string, string | undefined]> = [];
    bgm.onModeChange = (m, _muted, label) => log.push([m, label]);

    bgm.setDetention('INTRO');
    expect(bgm.getMode()).toBe('EXPLORE');
    expect(bgm.getModeLabel()).toBe(DET_LABEL.INTRO);
    bgm.setDetention('SNEAK');
    bgm.setDetention('SNEAK'); // 相同段落不重複切換
    bgm.setPursuitMode(true, true); // 特訓院中由 setDetention 控制
    expect(bgm.getMode()).toBe('EXPLORE');
    bgm.setDetention('ALERT');
    expect(bgm.getMode()).toBe('PURSUIT');
    bgm.setDetention('BOSS');
    expect(bgm.getMode()).toBe('PURSUIT');
    expect(bgm.getModeLabel()).toBe('鐵面進行曲');
    bgm.setDetention('SEARCH');
    expect(bgm.getMode()).toBe('EXPLORE');
    expect(log.map(l => l[1])).toEqual([DET_LABEL.INTRO, DET_LABEL.SNEAK, DET_LABEL.ALERT, DET_LABEL.BOSS, DET_LABEL.SEARCH]);

    bgm.setDetention(null);
    expect(bgm.getDetentionPhase()).toBeNull();
    expect(bgm.getModeLabel()).toBeUndefined();
    expect(bgm.getMode()).toBe('EXPLORE');
    expect(log[log.length - 1]).toEqual(['EXPLORE', undefined]);
    bgm.setPursuitMode(true);
    expect(bgm.getMode()).toBe('PURSUIT');
  });

  it('校園追捕中進特訓院：直接切成特訓院段落', () => {
    const bgm = new BGMManager();
    bgm.setPursuitMode(true);
    bgm.setDetention('SNEAK');
    expect(bgm.getMode()).toBe('EXPLORE');
    expect(bgm.getModeLabel()).toBe(DET_LABEL.SNEAK);
  });
});

describe('BGMManager：排程實際發聲', () => {
  /** 以假時鐘推進 sec 秒排程，回傳期間建立的音源節點數 */
  function run(bgm: BGMManager, sec: number) {
    const before = fake.counts.osc + fake.counts.src;
    const end = fake.ctx.currentTime + sec;
    while (fake.ctx.currentTime < end) {
      fake.ctx.currentTime += 0.025;
      (bgm as unknown as { scheduler(): void }).scheduler();
    }
    return fake.counts.osc + fake.counts.src - before;
  }

  it('各段落排程無錯誤且有發聲；每秒音源數在手機可承受範圍；靜音不建節點', () => {
    const bgm = new BGMManager();
    bgm.start();
    const campus = run(bgm, 8);
    expect(campus).toBeGreaterThan(0);
    const perSec: Record<string, number> = {};
    for (const p of PHASES) {
      bgm.setDetention(p);
      const n = run(bgm, 8);
      perSec[p] = n / 8;
      expect(n).toBeGreaterThan(0);
    }
    // 不超過校園追捕 (現行最密集) 的量級
    bgm.setDetention(null);
    bgm.setPursuitMode(true, true);
    const pursuitPerSec = run(bgm, 8) / 8;
    for (const p of PHASES) expect(perSec[p]).toBeLessThanOrEqual(pursuitPerSec * 1.1);
    expect(perSec.SNEAK).toBeLessThan(perSec.ALERT);

    bgm.setDetention('ALERT');
    bgm.toggleMute();
    expect(run(bgm, 4)).toBe(0);
    bgm.toggleMute();
    expect(run(bgm, 1)).toBeGreaterThan(0);
    bgm.stop();
  });
});
