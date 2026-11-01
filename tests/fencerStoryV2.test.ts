import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/audio/SoundEffects', () => ({
  soundManager: new Proxy({}, { get: () => () => undefined })
}));
vi.mock('../src/audio/audioContext', () => ({ getAudioContext: () => null, resumeAudioContext: () => undefined }));

import { duelStep, duelTempo, duelMidiToFreq, DUEL_LOOP_STEPS, DUEL_STEPS_PER_BAR, DUEL_TEMPO, DUEL_INTERLUDE_TEMPO, type DuelState } from '../src/audio/duelWaltz';
import { BGMManager } from '../src/audio/BGMManager';
import { FencerVoiceStrip } from '../src/ui/fencerVoice';
import { subtitleSpeaker } from '../src/ui/fencerVoice';

const st = (movement: number, dawn = false, interlude = false): DuelState => ({ movement, dawn, interlude });
const voicesAt = (step: number, s: DuelState) => duelStep(step, s).map((n) => n.voice);

describe('向日圓舞曲 (3/4 華爾滋)', () => {
  it('一小節 12 步、4 小節 48 步；蹦 (低音) 在第一拍、恰 (和弦) 在第二三拍', () => {
    expect(DUEL_STEPS_PER_BAR).toBe(12);
    expect(DUEL_LOOP_STEPS).toBe(48);
    for (let bar = 0; bar < 4; bar++) {
      const b0 = bar * 12;
      expect(voicesAt(b0, st(0))).toContain('BASS');
      expect(voicesAt(b0 + 4, st(0)).filter((v) => v === 'CHORD').length).toBe(3);
      expect(voicesAt(b0 + 8, st(0)).filter((v) => v === 'CHORD').length).toBe(3);
      expect(voicesAt(b0 + 2, st(0))).not.toContain('CHORD');
    }
    // 循環
    expect(duelStep(48, st(0))).toEqual(duelStep(0, st(0)));
  });

  it('三樂章換速度與配器：舊夢 = 音樂盒主旋律、落日 = 定音鼓', () => {
    expect(duelTempo(st(0))).toBe(DUEL_TEMPO[0]);
    expect(duelTempo(st(1))).toBeLessThan(duelTempo(st(0)));
    expect(duelTempo(st(2))).toBeGreaterThan(duelTempo(st(0)));
    expect(voicesAt(0, st(0))).toContain('LEAD');
    expect(voicesAt(0, st(1))).toContain('BOX');
    expect(voicesAt(0, st(1))).not.toContain('LEAD');
    expect(voicesAt(0, st(2))).toContain('TIMPANI');
    expect(voicesAt(0, st(0))).not.toContain('TIMPANI');
  });

  it('過場 = 只剩音樂盒 + 輕低音；黎明轉大調 (F → F#)', () => {
    for (let i = 0; i < 48; i++) for (const v of voicesAt(i, st(2, true, true))) expect(['BOX', 'BASS']).toContain(v);
    expect(duelTempo(st(2, false, true))).toBe(DUEL_INTERLUDE_TEMPO);
    const minor = duelStep(0, st(2)).filter((n) => n.voice === 'CHORD' || n.voice === 'LEAD').map((n) => n.midi % 12);
    const chordMinor = duelStep(4, st(2)).filter((n) => n.voice === 'CHORD').map((n) => n.midi % 12);
    const chordMajor = duelStep(4, st(2, true)).filter((n) => n.voice === 'CHORD').map((n) => n.midi % 12);
    expect(chordMinor).toContain(5);   // F
    expect(chordMajor).toContain(6);   // F#
    expect(chordMajor).not.toContain(5);
    expect(minor.length).toBeGreaterThan(0);
    expect(duelMidiToFreq(69)).toBeCloseTo(440, 5);
  });

  it('BGMManager：進入決鬥改 DUEL (追捕切換暫停)，離開回校園', () => {
    const bgm = new BGMManager();
    const modes: string[] = [];
    bgm.onModeChange = (m) => modes.push(m);
    bgm.setDuel(st(0));
    expect(bgm.getMode()).toBe('DUEL');
    bgm.setPursuitMode(true, true);
    expect(bgm.getMode()).toBe('DUEL');
    bgm.setDuel(st(1, false, true));
    bgm.setDuel(st(1, false, true)); // 相同狀態不重複切換
    expect(modes).toEqual(['DUEL']);
    bgm.setDuel(null);
    expect(bgm.getMode()).toBe('EXPLORE');
    bgm.setPursuitMode(true);
    expect(bgm.getMode()).toBe('PURSUIT');
  });
});

describe('字幕呈現', () => {
  it('說話者配色依首字判斷', () => {
    expect(subtitleSpeaker('🎩「午茶時間到了。」')).toBe('boss');
    expect(subtitleSpeaker('☀️「別怕！」')).toBe('heart');
    expect(subtitleSpeaker('🌻「看來…」')).toBe('flower');
    expect(subtitleSpeaker('（回禮）')).toBe('player');
    expect(subtitleSpeaker('')).toBe('');
  });

  it('戰鬥字幕條：依序播放、佇列上限 3、時間到換下一則', () => {
    const v = new FencerVoiceStrip();
    v.show('a', 1, 'heart');
    v.show('b', 1, 'heart');
    expect(v.busy).toBe(true);
    v.update(1.3);
    expect(v.busy).toBe(true);  // 換到 b
    v.update(1.3);
    expect(v.busy).toBe(false);
    for (let i = 0; i < 6; i++) v.show(`x${i}`, 1, 'boss');
    let n = 0;
    while (v.busy && n < 20) { v.update(1.3); n++; }
    expect(n).toBeLessThanOrEqual(4); // 1 則播放中 + 最多 3 則排隊
    v.show('', 1, 'heart');
    expect(v.busy).toBe(false);
  });
});

describe('換樂章長度 (宿主在擊破回呼中設定)', () => {
  it('onBossDamaged 內設定的過場長度不會被擊破流程蓋回預設', async () => {
    const THREE = await import('three');
    const { FencerBoss } = await import('../src/entities/FencerBoss');
    const { BossFX } = await import('../src/effects/BossFX');
    const { FENCER } = await import('../src/game/fencer/fencerRules');
    let boss: InstanceType<typeof FencerBoss> | null = null;
    const host = {
      playerPos: new THREE.Vector3(FENCER.ARENA_X + 6, 0, FENCER.ARENA_Z), playerVel: new THREE.Vector3(), playerDead: false, isTouch: false,
      playerOutOfCombat: false, damagePlayer: () => undefined, shake: () => undefined, hitStop: () => undefined,
      onBossDamaged: (res: { barBroken: boolean }) => { if (res.barBroken) boss!.setTransitionDuration(21); }
    };
    boss = new FencerBoss(host, new BossFX());
    boss.resetForFight(FENCER.ARENA_X, FENCER.ARENA_Z);
    boss.startFight(0);
    boss.tryHitMelee(new THREE.Vector3(FENCER.ARENA_X, 0, FENCER.ARENA_Z + 1), 1.5, 99999);
    expect(boss.isInTransition).toBe(true);
    expect(boss.transitionTotal).toBe(21);
    for (let i = 0; i < 150; i++) boss.update(0.1); // 15s：仍在過場
    expect(boss.isInTransition).toBe(true);
    for (let i = 0; i < 70; i++) boss.update(0.1);
    expect(boss.isInTransition).toBe(false);
    expect(boss.transitionTotal).toBe(FENCER.BAR_BREAK_POSE_SEC + FENCER.BAR_TRANSITION_SEC);
  });
});
