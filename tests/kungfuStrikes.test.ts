import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  KungFuLayer, PLAYER_COMBOS, StrikeTracker, crossedExtraStrikes, earliestStrike, lungeStep,
  strikeCanLaunch, strikeDmg, strikeFrac, strikeRoute, type KfMove
} from '../src/entities/shared/kungfu';

// 只在測試中使用的臨時招式 (沿用現有招式的關鍵影格，只覆寫多段命中 / 第二拖尾 / 突進欄位)，不加入正式武器
const BAT_1 = PLAYER_COMBOS.BAT[0];
const BAT_3 = PLAYER_COMBOS.BAT[2];
const DEBUG_LIGHT: KfMove = {
  ...BAT_1, name: '測試雙擊', extraStrikes: [0.6], extraDmg: [0.8],
  trail2: [0.4, 0.8], trailLimb2: 'WL', lunge: { dist: 1.2, from: 0.15, to: 0.35 }, hitShake: 0.15, slashFx: 'X'
};
// 額外擊排在主擊之前 (序號順序 ≠ 時間順序)
const DEBUG_FINISHER: KfMove = { ...BAT_3, name: '測試終結', extraStrikes: [0.2, 0.35], extraDmg: [0.5, 0.5] };

// 既有武器招式 (雙燕羽刃為多段招式，另有專屬測試 tests/dualRacket.test.ts；綁帶捆書見 tests/bookWhip.test.ts)
const ALL_PLAYER_MOVES = Object.entries(PLAYER_COMBOS).filter(([k]) => k !== 'DUAL' && k !== 'WHIP').flatMap(([, v]) => [...v]);

// 以固定幀長推進整招，回傳各幀送出的 strikeIndex 與送出時的圖層時間
function runMove(move: KfMove, tempo: number, frames: readonly number[]) {
  const kf = new KungFuLayer();
  const tracker = new StrikeTracker();
  kf.start(move, tempo, new THREE.Object3D());
  const out: { index: number; time: number; frame: number }[] = [];
  let f = 0;
  while (kf.move || f < frames.length) {
    const delta = frames[Math.min(f, frames.length - 1)];
    const i = tracker.step(kf, delta);
    if (i >= 0) {
      expect(tracker.move).toBe(move);
      out.push({ index: i, time: kf.time, frame: f });
    }
    f++;
    if (f > 2000) throw new Error('招式未結束');
  }
  // 收招後仍有補送 (掉幀同幀跨多擊)
  for (let k = 0; k < 8; k++) {
    const i = tracker.step(kf, frames[0]);
    if (i >= 0) out.push({ index: i, time: kf.time, frame: f + k });
  }
  return out;
}

describe('KfMove 選用欄位預設值 (現有招式行為不變)', () => {
  it('玩家全部招式：無額外擊 / 第二拖尾 / 突進 / 震動 / 斬痕', () => {
    for (const m of ALL_PLAYER_MOVES) {
      expect(m.extraStrikes).toEqual([]);
      expect(m.extraDmg).toEqual([]);
      expect(m.trail2).toBeNull();
      expect(m.trailLimb2).toBe('WL');
      expect(m.lunge).toBeNull();
      expect(m.hitShake).toBe(0);
      expect(m.slashFx).toBeNull();
    }
  });

  it('主擊分流 / 擊飛 / 傷害倍率與重構前相同', () => {
    for (const m of ALL_PLAYER_MOVES) {
      expect(strikeRoute(m, 0)).toBe(m.aoe ? 'AOE' : 'SINGLE');
      expect(strikeCanLaunch(m, 0)).toBe(m.finisher);
      expect(strikeDmg(m, 0)).toBe(m.dmg);
      expect(strikeFrac(m, 0)).toBe(m.strike);
    }
  });

  it('無額外擊的招式：StrikeTracker 與 KungFuLayer.update 於同一幀送出唯一一次主擊', () => {
    for (const m of ALL_PLAYER_MOVES) {
      for (const tempo of [1, 1.14]) {
        const raw = new KungFuLayer();
        raw.start(m, tempo, new THREE.Object3D());
        let rawFrame = -1;
        for (let f = 0; raw.move; f++) if (raw.update(1 / 60)) rawFrame = f;
        const hits = runMove(m, tempo, [1 / 60]);
        expect(hits.map((h) => h.index)).toEqual([0]);
        expect(hits[0].frame).toBe(rawFrame);
      }
    }
  });

  it('突進：未設定時位移為 0', () => {
    expect(lungeStep(BAT_1, BAT_1.dur, 0, BAT_1.dur)).toBe(0);
  });
});

describe('extraStrikes 觸發時序 (prevT / nowT)', () => {
  it('邊界：prevT < at 且 nowT ≥ at 才觸發', () => {
    const dur = DEBUG_LIGHT.dur;
    const at = 0.6 * dur;
    expect(crossedExtraStrikes(DEBUG_LIGHT, dur, at - 1e-4, at)).toBe(0b10);
    expect(crossedExtraStrikes(DEBUG_LIGHT, dur, at - 1e-4, at + 0.01)).toBe(0b10);
    expect(crossedExtraStrikes(DEBUG_LIGHT, dur, at, at + 0.01)).toBe(0); // 上一幀已觸發
    expect(crossedExtraStrikes(DEBUG_LIGHT, dur, at - 0.02, at - 1e-4)).toBe(0); // 尚未到達
    expect(crossedExtraStrikes(BAT_1, dur, 0, dur)).toBe(0);
  });

  it('同幀跨多擊時依時間先後取最早者 (序號 ≠ 時間順序)', () => {
    const dur = DEBUG_FINISHER.dur;
    expect(crossedExtraStrikes(DEBUG_FINISHER, dur, 0, dur)).toBe(0b110);
    expect(earliestStrike(DEBUG_FINISHER, 0b111)).toBe(1);
    expect(earliestStrike(DEBUG_FINISHER, 0b101)).toBe(2);
    expect(earliestStrike(DEBUG_FINISHER, 0b001)).toBe(0);
  });

  it('tempo 縮放：命中時間點隨節奏延後', () => {
    for (const tempo of [1, 1.14, 0.8]) {
      const hits = runMove(DEBUG_LIGHT, tempo, [1 / 120]);
      expect(hits.map((h) => h.index)).toEqual([0, 1]);
      const dur = DEBUG_LIGHT.dur * tempo;
      expect(hits[0].time).toBeGreaterThanOrEqual(DEBUG_LIGHT.strike * dur);
      expect(hits[0].time - 1 / 120).toBeLessThan(DEBUG_LIGHT.strike * dur);
      expect(hits[1].time).toBeGreaterThanOrEqual(0.6 * dur);
      expect(hits[1].time - 1 / 120).toBeLessThan(0.6 * dur);
    }
  });

  it('每擊恰好送出一次 (含掉幀 0.1s / 不規則幀長)，依時間先後', () => {
    for (const frames of [[1 / 60], [1 / 30], [0.1], [0.016, 0.05, 0.1, 0.007]]) {
      for (const tempo of [1, 1.14]) {
        const hits = runMove(DEBUG_FINISHER, tempo, frames);
        expect(hits.map((h) => h.index)).toEqual([1, 2, 0]);
        // 一幀至多一擊
        expect(new Set(hits.map((h) => h.frame)).size).toBe(hits.length);
      }
    }
  });

  it('中止出招時捨棄尚未送出的命中', () => {
    const kf = new KungFuLayer();
    const tracker = new StrikeTracker();
    kf.start(DEBUG_FINISHER, 1, new THREE.Object3D());
    expect(tracker.step(kf, DEBUG_FINISHER.dur * 0.4)).toBe(1); // 一次跨過兩個額外擊，先送最早者
    tracker.reset();
    expect(tracker.step(kf, 1 / 60)).toBe(-1);
  });

  it('KungFuLayer.duration 含節奏縮放', () => {
    const kf = new KungFuLayer();
    expect(kf.duration).toBe(0);
    kf.start(BAT_1, 1.14, new THREE.Object3D());
    expect(kf.duration).toBeCloseTo(BAT_1.dur * 1.14);
  });
});

describe('strikeIndex 分流', () => {
  it('非終結技額外擊：單體判定、不擊飛、傷害取 extraDmg', () => {
    expect(strikeRoute(DEBUG_LIGHT, 1)).toBe('SINGLE');
    expect(strikeCanLaunch(DEBUG_LIGHT, 0)).toBe(false);
    expect(strikeCanLaunch(DEBUG_LIGHT, 1)).toBe(false);
    expect(strikeDmg(DEBUG_LIGHT, 1)).toBe(0.8);
  });

  it('終結技：主擊群攻擊飛、額外擊只扣血群攻', () => {
    expect(strikeRoute(DEBUG_FINISHER, 0)).toBe('AOE');
    expect(strikeRoute(DEBUG_FINISHER, 1)).toBe('AOE_LIGHT');
    expect(strikeRoute(DEBUG_FINISHER, 2)).toBe('AOE_LIGHT');
    expect(strikeCanLaunch(DEBUG_FINISHER, 0)).toBe(true);
    expect(strikeCanLaunch(DEBUG_FINISHER, 1)).toBe(false);
    expect(strikeDmg(DEBUG_FINISHER, 0)).toBe(BAT_3.dmg);
    expect(strikeDmg(DEBUG_FINISHER, 2)).toBe(0.5);
  });

  it('extraDmg 未設時沿用 dmg', () => {
    const m: KfMove = { ...BAT_1, extraStrikes: [0.6, 0.7], extraDmg: [0.3] };
    expect(strikeDmg(m, 1)).toBe(0.3);
    expect(strikeDmg(m, 2)).toBe(BAT_1.dmg);
  });
});

describe('lunge 位移量', () => {
  it('各幀加總恰為 dist (含 tempo 縮放、不規則幀長)，區段外為 0', () => {
    const l = DEBUG_LIGHT.lunge!;
    for (const tempo of [1, 1.14]) {
      for (const frames of [[1 / 60], [1 / 30, 0.1, 0.004]]) {
        const dur = DEBUG_LIGHT.dur * tempo;
        let t = 0;
        let sum = 0;
        let f = 0;
        while (t < dur) {
          const d = frames[f++ % frames.length];
          const step = lungeStep(DEBUG_LIGHT, dur, t, t + d);
          if (t + d <= l.from * dur || t >= l.to * dur) expect(step).toBe(0);
          sum += step;
          t += d;
        }
        expect(sum).toBeCloseTo(l.dist, 6);
      }
    }
  });
});
