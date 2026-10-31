import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/audio/SoundEffects', () => ({ soundManager: new Proxy({}, { get: () => () => undefined }) }));

import { Sunflower, sunflowerLook } from '../src/world/Sunflower';
import { sunflowerStage, sunflowerPokeRange, SunflowerTaunt, FENCER } from '../src/game/fencer/fencerRules';
import { parseFencerSave, serializeFencerSave, defaultFencerSave } from '../src/game/fencer/fencerSave';
import { pickCampusGoal, campusPoiDoneMask, isCampusPoiHidden } from '../src/ui/fullMapGoals';
import { fencerQuestText, RUMOR, POKE_PROMPT, storyLen } from '../src/game/fencer/fencerStory';
import { safeTopNdc, ndcOvershoot, worldDropForNdc, shouldFitBubble, ndcInsetX } from '../src/game/fencer/bubbleSafeArea';
import type { MissionTrackerData } from '../src/ui/HUD';

const done: MissionTrackerData = {
  studentDefeated: 0, hasNormalBat: false, teacherDefeated: 0, dogDefeated: 0, bikeDefeated: 0, inspectorDefeated: 0,
  hasSpecialBat: false, plantBossDefeated: true, peBossDefeated: true, trackRecordText: '60.0s', swimRecordText: '30.0s',
  basketballStreak: 0, basketballRecord: 3, hasRiddenBike: true, hasEscapedDog: false, hasWishedPond: true, hasTastedHotFood: true,
  dodgeSkillLevel: 2, fencerDefeated: false, fencerStage: 0, fencerDiscovered: false, fencerGrowth: 0
};

const stemOf = (s: Sunflower) => (s.root.children.find((c) => c.type === 'Group') as THREE.Group).children[0];

function visibleMeshes(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible) n++; });
  return n;
}

describe('太陽花成長階段規則', () => {
  it('首戰前 = 已戳次數 (0~10)；任何一場戰鬥後一律完整 (戰敗 / 首勝都不回綠苗)', () => {
    for (let p = 0; p <= 10; p++) expect(sunflowerStage(p, 'NONE')).toBe(p);
    expect(sunflowerStage(99, 'NONE')).toBe(10);
    expect(sunflowerStage(0, 'LOSS')).toBe(10);
    expect(sunflowerStage(3, 'WIN')).toBe(10);
  });
  it('戳 10 次用 SunflowerTaunt 實測：第 n 戳成長階段 = n', () => {
    const t = new SunflowerTaunt();
    for (let i = 1; i <= 10; i++) {
      t.poke(i * 2);
      expect(sunflowerStage(t.pokes, t.lastResult)).toBe(i);
    }
    t.recordResult('LOSS');
    expect(sunflowerStage(t.pokes, t.lastResult)).toBe(10);
  });
  it('互動範圍：小苗 2m 起，隨成長擴大到 3.2m', () => {
    expect(sunflowerPokeRange(0)).toBeCloseTo(2, 5);
    expect(sunflowerPokeRange(10)).toBeCloseTo(3.2, 5);
    expect(sunflowerPokeRange(5)).toBeGreaterThan(sunflowerPokeRange(2));
  });
  it('外觀表：初始小苗 15~25cm、2 片葉、無花；4~6 花苞、7~9 半開、10 綻放；高度 / 粗細 / 葉數單調', () => {
    const l0 = sunflowerLook(0);
    expect(l0.height).toBeGreaterThanOrEqual(0.15);
    expect(l0.height).toBeLessThanOrEqual(0.25);
    expect(l0.leaves).toBeGreaterThanOrEqual(2);
    expect(l0.leaves).toBeLessThanOrEqual(3);
    expect(l0.kind).toBe('NONE');
    for (let g = 0; g <= 3; g++) expect(sunflowerLook(g).kind).toBe('NONE');
    for (const g of [4, 5, 6]) expect(sunflowerLook(g).kind).toBe('BUD');
    for (const g of [7, 8, 9]) expect(sunflowerLook(g).kind).toBe('HALF');
    expect(sunflowerLook(10).kind).toBe('FULL');
    expect(sunflowerLook(10).headScale).toBe(1);
    for (let g = 1; g <= 10; g++) {
      expect(sunflowerLook(g).height).toBeGreaterThan(sunflowerLook(g - 1).height);
      expect(sunflowerLook(g).thickness).toBeGreaterThan(sunflowerLook(g - 1).thickness);
      expect(sunflowerLook(g).leaves).toBeGreaterThanOrEqual(sunflowerLook(g - 1).leaves);
    }
  });
});

describe('Sunflower 模型 (成長 / draw calls / 碰撞盒)', () => {
  const make = () => {
    const parent = new THREE.Group();
    const s = new Sunflower(parent, 0, 0);
    const box = { min: new THREE.Vector3(-0.25, 0, -0.25), max: new THREE.Vector3(0.25, 2.2, 0.25) };
    s.bindCollider(box);
    return { s, box };
  };
  it('讀檔即時套用 (instant)：戳 0 次小苗 = 莖 + 兩片葉，無花、無臉', () => {
    const { s, box } = make();
    s.setGrowth(0, true);
    s.update(0.016);
    expect(visibleMeshes(s.root)).toBe(1);
    expect(box.max.y).toBeLessThan(0.5);
    expect(box.max.x).toBeLessThan(0.1);
  });
  it('各階段 draw calls ≤ 3；碰撞盒隨成長變大但不超過初始', () => {
    const { s, box } = make();
    let prevH = 0;
    for (let g = 0; g <= 10; g++) {
      s.setGrowth(g, true);
      s.update(0.016);
      expect(visibleMeshes(s.root)).toBeLessThanOrEqual(3);
      expect(box.max.y).toBeGreaterThanOrEqual(prevH);
      expect(box.max.x).toBeLessThanOrEqual(0.25 + 1e-9);
      prevH = box.max.y;
    }
    expect(visibleMeshes(s.root)).toBe(3);
  });
  it('成長是平滑動畫：下一階不會瞬間跳到位，約 1 秒內收斂', () => {
    const { s } = make();
    s.setGrowth(2, true);
    s.setGrowth(3);
    s.update(0.016);
    const h = stemOf(s).scale.y;
    expect(h).toBeLessThan(sunflowerLook(3).height / 1.75 - 1e-6);
    expect(h).toBeGreaterThan(sunflowerLook(2).height / 1.75 - 1e-6);
    for (let i = 0; i < 120; i++) s.update(1 / 60);
    const h2 = stemOf(s).scale.y;
    expect(h2).toBeCloseTo(sunflowerLook(3).height / 1.75, 2);
  });
  it('小苗只在玩家 5m 內才有細微反應 (輕抖 / 傾身)，離開後恢復', () => {
    const { s } = make();
    s.setGrowth(0, true);
    const pivot = () => (s.root.children.find((c) => c.type === 'Group') as THREE.Group);
    s.setPlayerNear(8, new THREE.Vector3(8, 0, 0), 5);
    for (let i = 0; i < 60; i++) s.update(1 / 60);
    expect(Math.abs(pivot().rotation.x)).toBeLessThan(0.06);
    s.setPlayerNear(3, new THREE.Vector3(3, 0, 0), 5);
    for (let i = 0; i < 60; i++) s.update(1 / 60);
    expect(pivot().rotation.x).toBeGreaterThan(0.1);
  });
});

describe('發現前完全隱藏 / 發現後出現 (尋寶)', () => {
  it('存檔：新檔未發現；戳過 / 開過戰 / 贏過 (舊存檔) 視為已發現；序列化往返保留', () => {
    expect(defaultFencerSave().discovered).toBe(false);
    expect(parseFencerSave(null).discovered).toBe(false);
    expect(parseFencerSave('{"pokes":0}').discovered).toBe(false);
    expect(parseFencerSave('{"discovered":true}').discovered).toBe(true);
    expect(parseFencerSave('{"pokes":2}').discovered).toBe(true);
    expect(parseFencerSave('{"fightsStarted":1}').discovered).toBe(true);
    expect(parseFencerSave('{"defeated":true}').discovered).toBe(true);
    const s = { ...defaultFencerSave(), discovered: true };
    expect(parseFencerSave(serializeFencerSave(s)).discovered).toBe(true);
    expect(parseFencerSave(serializeFencerSave(defaultFencerSave())).discovered).toBe(false);
  });
  it('大地圖：發現前無目標 / 無興趣點圖示；發現後出現「❓ 怪苗」並隨成長更新', () => {
    expect(pickCampusGoal(done)).toBeNull();
    expect(isCampusPoiHidden(campusPoiDoneMask(done), 'sunflower')).toBe(true);
    expect(isCampusPoiHidden(campusPoiDoneMask(done), 'pond')).toBe(false);
    const d = { ...done, fencerDiscovered: true };
    expect(isCampusPoiHidden(campusPoiDoneMask(d), 'sunflower')).toBe(false);
    const g0 = pickCampusGoal(d)!;
    expect(g0.key).toBe('fencer');
    expect(g0.icon).toBe('❓');
    expect(g0.title).toContain('怪苗');
    expect(g0.title + g0.desc).not.toContain('花劍客');
    const g5 = pickCampusGoal({ ...d, fencerGrowth: 5 })!;
    expect(g5.title).not.toBe(g0.title);
    expect(pickCampusGoal({ ...d, fencerGrowth: 10 })!.title).toContain('怪花');
  });
  it('任務看板文字：階段 0 隨成長更新，遭遇後沿用既有段落', () => {
    expect(fencerQuestText(0, 0).name).toContain('怪苗');
    expect(fencerQuestText(0, 5).name).not.toBe(fencerQuestText(0, 0).name);
    expect(fencerQuestText(1, 10).goalTitle).toContain('花劍客');
  });
  it('傳聞保持模糊 (≤22 字、不點名位置與太陽花)；互動提示在發現前不點名', () => {
    for (const t of [...RUMOR.trackBefore, RUMOR.soccerShooterBefore, RUMOR.bench, RUMOR.chatBefore]) {
      expect(storyLen(t)).toBeLessThanOrEqual(22);
      expect(t).not.toContain('太陽花');
      expect(t).not.toContain('操場中');
    }
    expect(POKE_PROMPT.undiscovered).not.toContain('太陽花');
    expect(FENCER.TAUNT_COUNT).toBe(10);
  });
});

describe('Boss 頭頂框夾在螢幕安全區 (手機直屏)', () => {
  it('安全區上緣 NDC：頂部 UI 下緣 + 邊距', () => {
    expect(safeTopNdc(0, 800, 0)).toBe(1);
    expect(safeTopNdc(100, 800, 0)).toBeCloseTo(0.75, 5);
    expect(safeTopNdc(92, 844, 8)).toBeCloseTo(1 - 200 / 844, 5);
  });
  it('超出才下壓，沒超出不動；下移量受上限約束', () => {
    expect(ndcOvershoot(0.5, 0.8)).toBe(0);
    expect(ndcOvershoot(0.95, 0.8)).toBeCloseTo(0.15, 5);
    expect(worldDropForNdc(0, 0.2, 5)).toBe(0);
    expect(worldDropForNdc(0.15, 0.1, 5)).toBeCloseTo(1.5, 5);
    expect(worldDropForNdc(0.9, 0.1, 1.55)).toBe(1.55);
    expect(worldDropForNdc(0.1, 0, 5)).toBe(0);
  });
  it('水平夾制：超出左右邊緣就往內推，框夠窄且在內側不動', () => {
    expect(ndcInsetX(0, 0.4, 0.03)).toBe(0);
    expect(ndcInsetX(0.8, 0.4, 0.03)).toBeCloseTo(-0.23, 5);
    expect(ndcInsetX(-0.8, 0.4, 0.03)).toBeCloseTo(0.23, 5);
    expect(ndcInsetX(0.5, 1.2, 0.03)).toBe(0);
  });
  it('只有直屏啟用 (桌機 / 橫屏不受影響)', () => {
    expect(shouldFitBubble(390, 844)).toBe(true);
    expect(shouldFitBubble(844, 390)).toBe(false);
    expect(shouldFitBubble(1920, 1080)).toBe(false);
  });
});
