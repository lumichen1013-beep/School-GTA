import { describe, expect, it } from 'vitest';
import { pickCampusGoal, campusPoiDoneMask, isCampusPoiDone } from '../src/ui/fullMapGoals';
import type { MissionTrackerData } from '../src/ui/HUD';

const base: MissionTrackerData = {
  studentDefeated: 0, hasNormalBat: false, teacherDefeated: 0, dogDefeated: 0, bikeDefeated: 0, inspectorDefeated: 0,
  hasSpecialBat: false, plantBossDefeated: false, peBossDefeated: false, trackRecordText: '未完成', swimRecordText: '未完成',
  basketballStreak: 0, basketballRecord: 0, hasRiddenBike: false, hasEscapedDog: false, hasWishedPond: false, hasTastedHotFood: false, dodgeSkillLevel: 0, fencerDefeated: false
};

describe('大地圖下一步目標', () => {
  it('依任務清單順序取第一個未完成且有地點者', () => {
    expect(pickCampusGoal(base)?.key).toBe('dodge');
    expect(pickCampusGoal({ ...base, dodgeSkillLevel: 1 })?.key).toBe('pe');
    expect(pickCampusGoal({ ...base, dodgeSkillLevel: 1, peBossDefeated: true, plantBossDefeated: true })?.key).toBe('basketball');
  });
  it('全部完成回傳 null', () => {
    const done = { ...base, dodgeSkillLevel: 2, peBossDefeated: true, plantBossDefeated: true, basketballRecord: 3, trackRecordText: '60.0s', swimRecordText: '30.0s', hasRiddenBike: true, hasWishedPond: true, hasTastedHotFood: true };
    expect(pickCampusGoal(done)?.key).toBe('fencer');
    expect(pickCampusGoal({ ...done, fencerDefeated: true })).toBeNull();
  });
  it('興趣點完成遮罩', () => {
    const mask = campusPoiDoneMask({ ...base, hasTastedHotFood: true, dodgeSkillLevel: 1 });
    expect(isCampusPoiDone(mask, 'commissary')).toBe(true);
    expect(isCampusPoiDone(mask, 'dodgeTeacher')).toBe(true);
    expect(isCampusPoiDone(mask, 'pond')).toBe(false);
    expect(isCampusPoiDone(mask, 'gate')).toBe(false);
    expect(isCampusPoiDone(mask, 'sunflower')).toBe(false);
    expect(isCampusPoiDone(campusPoiDoneMask({ ...base, fencerDefeated: true }), 'sunflower')).toBe(true);
  });
});
