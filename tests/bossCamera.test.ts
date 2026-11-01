import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  BOSS_CAM_DESKTOP, BOSS_CAM_MOBILE_LANDSCAPE, BOSS_CAM_PORTRAIT, BOOST_WARN_BIG, BOOST_HOLD,
  BossZoomDirector, SoftLock, SOFTLOCK_MAX_RATE, arenaFit, arenaHeightCap, ARENA_WALL_TOP, bossCamProfile, offscreenArrow, pitchToClear,
  updateFar, wantedBoost, yawToward, type BossCamProfile, type OffscreenArrow
} from '../src/camera/bossCamera';
import { ThirdPersonCamera } from '../src/camera/ThirdPersonCamera';
import { portraitFactor } from '../src/camera/portraitCamera';

const prof = (): BossCamProfile => ({ distance: 0, pitch: 0, fov: 0, lookAhead: 0 });
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

describe('Boss 戰鏡頭：裝置基準', () => {
  it('桌機 / 手機橫屏 / 直屏各取對應參數，直屏更遠更高', () => {
    expect(bossCamProfile(0, false, prof())).toMatchObject(BOSS_CAM_DESKTOP);
    expect(bossCamProfile(0, true, prof())).toMatchObject(BOSS_CAM_MOBILE_LANDSCAPE);
    expect(bossCamProfile(1, true, prof())).toMatchObject(BOSS_CAM_PORTRAIT);
    expect(BOSS_CAM_PORTRAIT.distance).toBeGreaterThan(BOSS_CAM_DESKTOP.distance);
    expect(BOSS_CAM_PORTRAIT.distance * Math.sin(BOSS_CAM_PORTRAIT.pitch))
      .toBeGreaterThan(BOSS_CAM_DESKTOP.distance * Math.sin(BOSS_CAM_DESKTOP.pitch));
    // 皆遠大於平時 (步行 4.2m、直屏 7.56m)
    expect(BOSS_CAM_MOBILE_LANDSCAPE.distance).toBeGreaterThan(4.2 * 2);
    expect(BOSS_CAM_PORTRAIT.distance).toBeGreaterThan(7.56 * 1.5);
  });
});

describe('Boss 戰鏡頭：動態拉遠 (小幅、慢速、遲滯)', () => {
  it('觸發條件與幅度：S3/S4 +25%、S5 / 拉開 +15%，S1/S2 與近身不變', () => {
    expect(wantedBoost('S3', false)).toBe(0.25);
    expect(wantedBoost('S4', true)).toBe(0.25);
    expect(wantedBoost('S5', false)).toBe(0.15);
    expect(wantedBoost(null, true)).toBe(0.15);
    expect(wantedBoost('S1', false)).toBe(0);
    expect(wantedBoost('S2', false)).toBe(0);
  });

  it('拉開判定有門檻遲滯 (>13 開、<10 關)', () => {
    expect(updateFar(false, 12.5)).toBe(false);
    expect(updateFar(false, 13.5)).toBe(true);
    expect(updateFar(true, 11)).toBe(true);
    expect(updateFar(true, 9.5)).toBe(false);
  });

  it('臨界阻尼：0.8s 內未完成、不過衝；觸發解除後至少維持 2s', () => {
    const d = new BossZoomDirector();
    const dt = 1 / 60;
    let t = 0;
    let max = 0;
    for (; t < 0.8; t += dt) { d.update(dt, 'S4', 3, true); max = Math.max(max, d.boost); }
    expect(d.boost).toBeLessThan(BOOST_WARN_BIG * 0.95);
    expect(d.boost).toBeGreaterThan(BOOST_WARN_BIG * 0.5);
    for (; t < 3; t += dt) { d.update(dt, 'S4', 3, true); max = Math.max(max, d.boost); }
    expect(max).toBeLessThanOrEqual(BOOST_WARN_BIG + 1e-6);
    // 招式結束：2s 內目標不回落
    for (let k = 0; k < BOOST_HOLD - 0.1; k += dt) d.update(dt, null, 3, true);
    expect(d.target).toBe(BOOST_WARN_BIG);
    for (let k = 0; k < 0.3; k += dt) d.update(dt, null, 3, true);
    expect(d.target).toBe(0);
  });

  it('頻繁觸發 (距離在門檻附近抖動、招式短暫中斷) 不造成來回跳動', () => {
    const d = new BossZoomDirector();
    const dt = 1 / 60;
    let reversals = 0;
    let lastSign = 0;
    let prev = 0;
    for (let i = 0; i < 60 * 20; i++) {
      const t = i * dt;
      const dist = 11.5 + Math.sin(t * 7) * 1.8; // 9.7 ~ 13.3m 快速抖動
      const atk = Math.floor(t * 1.5) % 2 === 0 ? 'S5' : null; // 每 0.67s 開關一次
      d.update(dt, atk, dist, true);
      const s = Math.sign(Math.round((d.boost - prev) * 1e5));
      if (s !== 0 && lastSign !== 0 && s !== lastSign) reversals++;
      if (s !== 0) lastSign = s;
      prev = d.boost;
    }
    expect(reversals).toBeLessThanOrEqual(2);
    expect(d.boost).toBeLessThanOrEqual(0.15 + 1e-6);
  });

  it('固定模式完全不變；手動縮放後 5s 內不自動拉遠', () => {
    const fixed = new BossZoomDirector();
    for (let i = 0; i < 300; i++) fixed.update(1 / 60, 'S4', 15, false);
    expect(fixed.boost).toBe(0);
    const d = new BossZoomDirector();
    d.onManualZoom();
    for (let i = 0; i < 240; i++) d.update(1 / 60, 'S3', 15, true);
    expect(d.boost).toBe(0);
    for (let i = 0; i < 180; i++) d.update(1 / 60, 'S3', 15, true);
    expect(d.boost).toBeGreaterThan(0.05);
  });
});

describe('Boss 戰鏡頭：雙目標 soft lock', () => {
  it('Boss 在畫面內圈時不轉；在外圈時朝 Boss 轉、角速度 ≤ 60°/s', () => {
    const halfH = 0.8;
    const sl = new SoftLock();
    // 鏡頭在原點，yaw = 0 看向 -Z；Boss 在正前方 → 不轉
    let yaw = 0;
    for (let i = 0; i < 60; i++) yaw = sl.step(yaw, 1 / 60, 0, 0, 0, -10, 8, halfH, 1);
    expect(yaw).toBe(0);
    // Boss 在右後方 (+X, +Z)
    yaw = 0;
    sl.reset();
    let maxRate = 0;
    for (let i = 0; i < 600; i++) {
      const before = yaw;
      yaw = sl.step(yaw, 1 / 60, 0, 0, 10, 4, 8, halfH, 1);
      maxRate = Math.max(maxRate, Math.abs(wrap(yaw - before)) * 60);
    }
    expect(maxRate).toBeLessThanOrEqual(SOFTLOCK_MAX_RATE + 1e-9);
    const err = Math.abs(wrap(yawToward(0, 0, 10, 4) - yaw));
    expect(err).toBeLessThanOrEqual(halfH * 0.55 + 0.05); // 收斂到內圈邊緣 (不強制置中)
  });

  it('權重 0 (手動優先 / 瞄準) 或 Boss 貼身 (<2.5m) 不介入', () => {
    const sl = new SoftLock();
    let yaw = 0;
    for (let i = 0; i < 60; i++) yaw = sl.step(yaw, 1 / 60, 0, 0, 10, 4, 8, 0.8, 0);
    expect(yaw).toBe(0);
    for (let i = 0; i < 60; i++) yaw = sl.step(yaw, 1 / 60, 0, 0, 10, 4, 2, 0.8, 1);
    expect(yaw).toBe(0);
  });
});

describe('Boss 戰鏡頭：結界邊界與遮擋', () => {
  it('機位在圓內時不變；靠牆時水平內收並抬高 (總距離盡量維持)', () => {
    const out = { hd: 0, h: 0 };
    arenaFit(0, 0, 0, 1, 10, 6, 0, 0, 15.3, out);
    expect(out).toEqual({ hd: 10, h: 6 });
    // 玩家距牆 3m，鏡頭朝牆外
    arenaFit(0, 12.3, 0, 1, 10, 6, 0, 0, 15.3, out);
    expect(out.hd).toBeCloseTo(3, 5);
    expect(out.h).toBeGreaterThan(6);
    expect(Math.hypot(out.hd, out.h)).toBeLessThanOrEqual(Math.hypot(10, 6) + 1e-9);
    // 貼牆：俯角不超過上限 (仍有水平距離或高度上限)
    arenaFit(0, 15.3, 0, 1, 10, 6, 0, 0, 15.3, out);
    expect(out.hd).toBeCloseTo(0, 5);
    expect(out.h).toBeLessThan(Math.hypot(10, 6));
  });

  it('鏡頭高度上限：靠牆壓在牆頂下，往內逐步放寬', () => {
    expect(arenaHeightCap(15.6, 15.6)).toBe(ARENA_WALL_TOP - 0.5);
    expect(arenaHeightCap(16, 15.6)).toBe(ARENA_WALL_TOP - 0.5);
    expect(arenaHeightCap(10.6, 15.6)).toBe(ARENA_WALL_TOP + 4.5);
  });

  it('Boss 擋在玩家與鏡頭間：抬高俯角越過頭頂；不擋時不變', () => {
    // 鏡頭在 +Z 方向 (yaw 0)，Boss 在玩家後方 1.5m
    const p = pitchToClear(0, 1.35, 0, 0, 0.3, 0, 1.5, 0.75, 2.5, 1.2);
    expect(p).toBeGreaterThan(0.3);
    expect(Math.tan(p) * (1.5 - 0.75) + 1.35).toBeGreaterThanOrEqual(2.5);
    expect(pitchToClear(0, 1.35, 0, 0, 0.3, 4, 1.5, 0.75, 2.5, 1.2)).toBe(0.3);
    expect(pitchToClear(0, 1.35, 0, 0, 0.3, 0, -3, 0.75, 2.5, 1.2)).toBe(0.3);
  });
});

describe('Boss 戰鏡頭：畫外箭頭', () => {
  const a: OffscreenArrow = { visible: false, x: 0, y: 0, angle: 0 };
  it('畫面內隱藏；畫外貼邊並指向 Boss；鏡頭後方指向下緣', () => {
    expect(offscreenArrow(0.3, -0.2, false, 0.1, a).visible).toBe(false);
    offscreenArrow(2, 0.5, false, 0.1, a);
    expect(a.visible).toBe(true);
    expect(a.x).toBeCloseTo(0.9, 5);
    expect(Math.abs(a.y)).toBeLessThanOrEqual(0.9);
    expect(a.angle).toBeCloseTo(Math.atan2(0.5, 2), 5);
    offscreenArrow(0.2, 0.1, true, 0.1, a);
    expect(a.visible).toBe(true);
    expect(a.y).toBeLessThan(0);
    expect(Math.max(Math.abs(a.x), Math.abs(a.y))).toBeCloseTo(0.9, 5);
  });
});

describe('ThirdPersonCamera：Boss 戰鏡頭模式切換', () => {
  const run = (cam: ThirdPersonCamera, pos: THREE.Vector3, seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      each?.();
      cam.update(pos, 1 / 60);
    }
  };

  it('開啟後拉到遠景 (距離 / 俯角 / FOV)、關閉後回到一般跟隨，無過衝', () => {
    const cam = new ThirdPersonCamera(65, 16 / 10, 0.1, 500);
    cam.updateAspect(16 / 10);
    const pos = new THREE.Vector3(0, 0, 0);
    cam.resetBehind(pos, 0);
    run(cam, pos, 1);
    expect(cam.distance).toBeCloseTo(4.2, 1);
    cam.bossMode = true;
    let maxDist = 0;
    run(cam, pos, 5, () => { maxDist = Math.max(maxDist, cam.distance); });
    expect(cam.distance).toBeCloseTo(BOSS_CAM_DESKTOP.distance, 1);
    expect(maxDist).toBeLessThanOrEqual(BOSS_CAM_DESKTOP.distance + 0.01);
    expect(cam.pitch).toBeCloseTo(BOSS_CAM_DESKTOP.pitch, 2);
    expect(cam.camera.fov).toBeCloseTo(BOSS_CAM_DESKTOP.fov, 3);
    const camH = cam.camera.position.y - 1.35;
    expect(camH).toBeGreaterThan(5);
    cam.bossMode = false;
    run(cam, pos, 3);
    expect(cam.distance).toBeCloseTo(4.2, 1);
    expect(cam.camera.fov).toBeCloseTo(65, 3);
    expect(cam.pitch).toBeCloseTo(0.25, 2);
  });

  it('過場接手 (cancelBossMode) 立即還原 FOV', () => {
    const cam = new ThirdPersonCamera(65, 16 / 10, 0.1, 500);
    cam.updateAspect(16 / 10);
    const pos = new THREE.Vector3();
    cam.bossMode = true;
    run(cam, pos, 2);
    expect(cam.camera.fov).toBeCloseTo(BOSS_CAM_DESKTOP.fov, 3);
    cam.cancelBossMode();
    expect(cam.camera.fov).toBeCloseTo(65, 3);
  });

  it('動態拉遠：S4 預警時距離最多 +25%，固定模式不變', () => {
    const cam = new ThirdPersonCamera(65, 16 / 10, 0.1, 500);
    cam.updateAspect(16 / 10);
    const pos = new THREE.Vector3();
    cam.bossMode = true;
    cam.bossTarget = { x: 0, z: -5 };
    run(cam, pos, 4);
    const base = cam.distance;
    cam.bossAttack = 'S4';
    let max = 0;
    run(cam, pos, 4, () => { max = Math.max(max, cam.distance); });
    expect(max).toBeLessThanOrEqual(base * 1.25 + 0.02);
    expect(cam.distance).toBeGreaterThan(base * 1.2);
    const fixed = new ThirdPersonCamera(65, 16 / 10, 0.1, 500);
    fixed.updateAspect(16 / 10);
    fixed.bossCamDynamic = false;
    fixed.bossMode = true;
    fixed.bossTarget = { x: 0, z: -5 };
    fixed.bossAttack = 'S4';
    run(fixed, pos, 5);
    expect(fixed.distance).toBeCloseTo(BOSS_CAM_DESKTOP.distance, 2);
  });

  it('結界邊界：玩家靠牆時鏡頭留在牆內、水平內收、不越過牆頂', () => {
    const cam = new ThirdPersonCamera(65, 16 / 10, 0.1, 500);
    cam.updateAspect(16 / 10);
    cam.arenaBound = { x: 0, z: 0, r: 15.6 };
    const pos = new THREE.Vector3(0, 0, 13); // 鏡頭 yaw 0 位於 +Z (牆外側)
    cam.resetBehind(pos, 0);
    cam.bossMode = true;
    run(cam, pos, 5);
    const p = cam.camera.position;
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(15.6 + 1e-6);
    expect(p.y).toBeLessThan(ARENA_WALL_TOP); // 不越過近側牆頂
    // 抬高但受牆頂上限 (仍維持基準高度 9 成以上)，水平距明顯內收
    expect(p.y - 1.35).toBeGreaterThan(0.9 * BOSS_CAM_DESKTOP.distance * Math.sin(BOSS_CAM_DESKTOP.pitch));
    expect(Math.hypot(p.x, p.z - 13)).toBeLessThan(BOSS_CAM_DESKTOP.distance * Math.cos(BOSS_CAM_DESKTOP.pitch));
  });

  it('手動轉鏡頭 3s 內 soft lock 不介入，之後慢慢把 Boss 帶回畫面', () => {
    const cam = new ThirdPersonCamera(65, 16 / 10, 0.1, 500);
    cam.updateAspect(16 / 10);
    const pos = new THREE.Vector3();
    cam.bossMode = true;
    cam.bossTarget = { x: 0, z: 10 }; // Boss 在鏡頭後方 (鏡頭 yaw 0 看向 -Z)
    cam.update(pos, 1 / 60);
    cam.updateRotation(50, 0);
    const yaw0 = cam.yaw;
    run(cam, pos, 2.5);
    expect(cam.yaw).toBe(yaw0);
    let maxRate = 0;
    let prev = cam.yaw;
    run(cam, pos, 6, () => {
      maxRate = Math.max(maxRate, Math.abs(wrap(cam.yaw - prev)) * 60);
      prev = cam.yaw;
    });
    expect(maxRate).toBeLessThanOrEqual(SOFTLOCK_MAX_RATE + 1e-6);
    // Boss 已進入畫面水平視角內
    const camPos = cam.camera.position;
    const err = Math.abs(wrap(yawToward(camPos.x, camPos.z, 0, 10) - cam.yaw));
    expect(err).toBeLessThan(0.8);
  });

  it('開鏡時俯角輔助壓低、距離拉近；退出瞄準後回到 Boss 戰俯角', () => {
    const cam = new ThirdPersonCamera(65, 16 / 10, 0.1, 500);
    cam.updateAspect(16 / 10);
    const pos = new THREE.Vector3();
    cam.bossMode = true;
    run(cam, pos, 4);
    cam.aimZoom = 1;
    run(cam, pos, 1.5);
    expect(cam.pitch).toBeLessThan(0.2);
    expect(cam.distance).toBeLessThan(4);
    cam.aimZoom = 0;
    run(cam, pos, 5);
    expect(cam.pitch).toBeCloseTo(BOSS_CAM_DESKTOP.pitch, 2);
    expect(cam.distance).toBeCloseTo(BOSS_CAM_DESKTOP.distance, 1);
  });

  it('直屏與手機橫屏使用各自參數', () => {
    const port = new ThirdPersonCamera(65, 390 / 844, 0.1, 500);
    port.updateAspect(390 / 844);
    port.isTouch = true;
    port.bossMode = true;
    run(port, new THREE.Vector3(), 5);
    const pp = bossCamProfile(portraitFactor(390 / 844), true, prof());
    expect(port.distance).toBeCloseTo(pp.distance, 1);
    expect(pp.distance).toBeGreaterThan(14.5);
    expect(port.camera.fov).toBeCloseTo(pp.fov, 3);
    const land = new ThirdPersonCamera(65, 844 / 390, 0.1, 500);
    land.updateAspect(844 / 390);
    land.isTouch = true;
    land.bossMode = true;
    run(land, new THREE.Vector3(), 5);
    expect(land.distance).toBeCloseTo(BOSS_CAM_MOBILE_LANDSCAPE.distance, 1);
    expect(land.camera.fov).toBeCloseTo(BOSS_CAM_MOBILE_LANDSCAPE.fov, 3);
  });
});


