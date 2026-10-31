import type { MissionTrackerData, DetentionRadarData } from './HUD';
import { getCampusPoi, type CampusPoiId } from '../world/campusLayout';
import { fencerQuestText } from '../game/fencer/fencerStory';

// 大地圖「下一步目標」：第一個未完成且有固定地點的任務 (純函式，供地圖脈衝環與目標卡共用)
export interface FullMapGoal {
  key: string;
  icon: string;
  title: string;
  desc: string;
  x: number;
  z: number;
}

interface CampusGoalDef {
  key: string;
  poi: CampusPoiId;
  icon: string;
  title: string;
  desc: string;
  done: (d: MissionTrackerData) => boolean;
  /** 依進度改寫圖示 / 標題 / 說明 (花劍客三段揭露) */
  text?: (d: MissionTrackerData) => { icon: string; title: string; desc: string };
  /** 為 true 時完全隱藏 (尋寶：發現前不出現在目標卡 / 地圖) */
  hidden?: (d: MissionTrackerData) => boolean;
}

const fencerStageText = (d: MissionTrackerData) => {
  const s = fencerQuestText(d.fencerStage, d.fencerGrowth);
  return { icon: s.goalIcon, title: s.goalTitle, desc: s.goalDesc };
};

// 依任務清單順序 (戰鬥 → 競技 → 探索)；無固定地點的任務 (擊倒同學 / 神兵 / 教官 / 甩掉校犬) 略過
const CAMPUS_GOALS: readonly CampusGoalDef[] = [
  { key: 'dodge', poi: 'dodgeTeacher', icon: '🥋', title: '尋訪閃身步老師', desc: '敬業樓 A 棟 1F 走廊，學習閃身步需 NT$1000', done: (d) => d.dodgeSkillLevel >= 1 },
  { key: 'pe', poi: 'badminton', icon: '🏸', title: '挑戰羽球大如老師', desc: '演藝大樓 4F 羽球館，搶 5 分勝', done: (d) => d.peBossDefeated },
  { key: 'plant', poi: 'plant', icon: '🌸', title: '挑戰溫室食人花王', desc: '自然生態探索園區 秘境霸主', done: (d) => d.plantBossDefeated },
  { key: 'basketball', poi: 'basketball', icon: '🏀', title: '三分球投籃挑戰', desc: '籃球場', done: (d) => d.basketballRecord > 0 || d.basketballStreak > 0 },
  { key: 'track', poi: 'track', icon: '🏃', title: '操場 400m 競速', desc: '操場 PU 跑道', done: (d) => Boolean(d.trackRecordText) && d.trackRecordText !== '未完成' },
  { key: 'swim', poi: 'pool', icon: '🏊', title: '25m 水上競速', desc: '標準游泳館', done: (d) => Boolean(d.swimRecordText) && d.swimRecordText !== '未完成' },
  { key: 'bike', poi: 'bikeShed', icon: '🚲', title: '騎乘火柴人自行車', desc: '自行車棚取車，按 E 騎乘', done: (d) => d.hasRiddenBike },
  { key: 'pond', poi: 'pond', icon: '🪙', title: '許願池投幣', desc: '生態園區蓮花許願池', done: (d) => d.hasWishedPond },
  { key: 'hotfood', poi: 'commissary', icon: '🍱', title: '合作社品嚐熱食', desc: '天天合作社櫃台', done: (d) => d.hasTastedHotFood },
  { key: 'fencer', poi: 'sunflower', icon: '❓', title: '', desc: '', done: (d) => d.fencerDefeated, text: fencerStageText, hidden: (d) => !d.fencerDiscovered }
];

// 校園下一目標 (全部完成回傳 null)
export function pickCampusGoal(d: MissionTrackerData): FullMapGoal | null {
  for (const g of CAMPUS_GOALS) {
    if (g.done(d) || g.hidden?.(d)) continue;
    const poi = getCampusPoi(g.poi);
    const t = g.text ? g.text(d) : g;
    return { key: g.key, icon: t.icon, title: t.title, desc: t.desc, x: poi.x, z: poi.z };
  }
  return null;
}

// 興趣點完成狀態遮罩 (bit 依序：合作社 / 羽球場 / 食人花 / 許願池 / 閃身步老師 / 太陽花 / 已發現怪苗)，供靜態底圖快取判斷是否重繪
export function campusPoiDoneMask(d: MissionTrackerData | null): number {
  if (!d) return 0;
  return (d.hasTastedHotFood ? 1 : 0) | (d.peBossDefeated ? 2 : 0) | (d.plantBossDefeated ? 4 : 0) | (d.hasWishedPond ? 8 : 0) | (d.dodgeSkillLevel >= 1 ? 16 : 0) | (d.fencerDefeated ? 32 : 0) | (d.fencerDiscovered ? 64 : 0);
}

const CAMPUS_POI_DONE_BIT: Partial<Record<CampusPoiId, number>> = { commissary: 1, badminton: 2, plant: 4, pond: 8, dodgeTeacher: 16, sunflower: 32 };
/** 發現前完全不畫的興趣點 (太陽花：mask bit 64 = 已發現) */
export function isCampusPoiHidden(mask: number, id: CampusPoiId): boolean {
  return id === 'sunflower' && (mask & 64) === 0;
}
export function isCampusPoiDone(mask: number, id: CampusPoiId): boolean {
  const bit = CAMPUS_POI_DONE_BIT[id];
  return bit !== undefined && (mask & bit) !== 0;
}

// 特訓院下一目標：門禁卡 A → 門禁卡 B → 萬能鑰匙卡 (總教官掉落) / 擊破總教官 → 南大門撤離
export function pickDetentionGoal(d: DetentionRadarData, bossPos: { x: number; z: number } | null): FullMapGoal {
  if (!d.hasKeycardA) return { key: 'keyA', icon: '💳', title: '取得門禁卡 A', desc: '中央警衛室，開啟管制閘門 1', x: d.keycardAPos.x, z: d.keycardAPos.z };
  if (!d.hasKeycardB) return { key: 'keyB', icon: '📦', title: '取得門禁卡 B', desc: '東側器材庫，開啟管制閘門 2', x: d.keycardBPos.x, z: d.keycardBPos.z };
  if (d.masterKeycardPos && !d.hasMasterKeycard) {
    return { key: 'master', icon: '🗝️', title: '拾取萬能鑰匙卡', desc: '總教官已倒下，取卡解鎖南大門', x: d.masterKeycardPos.x, z: d.masterKeycardPos.z };
  }
  if (!d.hasMasterKeycard && bossPos) return { key: 'boss', icon: '⚡', title: '擊破總教官鐵面總長', desc: '引誘撞柱硬直後暗殺，取得萬能鑰匙卡', x: bossPos.x, z: bossPos.z };
  return { key: 'escape', icon: '🚪', title: '南大門撤離', desc: '前往南側脫逃大門，逃出特訓院', x: 0, z: 95 };
}
