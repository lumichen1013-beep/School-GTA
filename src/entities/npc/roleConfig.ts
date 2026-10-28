import type { NPCRole, NPCMovementStyle } from '../NPC';

// 各角色數值設定表 (取代建構子內冗長 if/else 與散落各處的角色純量判斷)
export interface NPCRoleConfig {
  maxHp: number;
  // 巡邏速度 = baseSpeed + speedJitter × jitterScale
  baseSpeed: number;
  jitterScale: number;
  chaseSpeed: number;
  attackPower: number;
  attackRange: number;
  // null：平民學生，依移動風格查 STUDENT_STYLE_STATS
  defaultStyle: NPCMovementStyle | null;
  // true：固定風格，忽略生成時指定的 movementStyle
  styleFixed: boolean;
  pauseChance: number;
  isCanine: boolean;
  isDetention: boolean;
  canCarryUmbrella: boolean;
  hpBarY: number;
  viewDist: number;
  eyeHeight: number;
  chaseAccelRate: number;
}

const BASE: Omit<NPCRoleConfig, 'maxHp' | 'baseSpeed' | 'jitterScale' | 'chaseSpeed' | 'attackPower' | 'attackRange' | 'defaultStyle' | 'pauseChance'> = {
  styleFixed: false,
  isCanine: false,
  isDetention: false,
  canCarryUmbrella: false,
  hpBarY: 2.05,
  viewDist: 14.0,
  eyeHeight: 1.5,
  chaseAccelRate: 4.0
};

// 少年院特訓群：慢速規律巡邏、必定駐足警戒、不持傘
const DETENTION = { ...BASE, isDetention: true, pauseChance: 1.0, attackRange: 2.0, jitterScale: 0 };

export const ROLE_CONFIG: Record<NPCRole, NPCRoleConfig> = {
  // 閃身步老師 (教學大樓身法宗師)
  DODGE_TEACHER: { ...BASE, maxHp: 9999, baseSpeed: 4.5, jitterScale: 0, chaseSpeed: 9.0, attackPower: 0, attackRange: 2.0, defaultStyle: 'OFFICER_PATROL', pauseChance: 0.50, canCarryUmbrella: true },
  // 大如老師 (4F 羽球教練)：爆炸頭頂約 2.19m，血條抬高避免被頭髮遮擋
  PE_TEACHER_BOSS: { ...BASE, maxHp: 950, baseSpeed: 4.2, jitterScale: 0, chaseSpeed: 8.5, attackPower: 28, attackRange: 2.4, defaultStyle: 'OFFICER_PATROL', pauseChance: 0.40, hpBarY: 2.4 },
  // 生教組長 / 教官：威嚴步巡
  TEACHER: { ...BASE, maxHp: 315, baseSpeed: 4.8, jitterScale: 1, chaseSpeed: 10.0, attackPower: 36, attackRange: 1.8, defaultStyle: 'OFFICER_PATROL', pauseChance: 0.55, canCarryUmbrella: true },
  INSTRUCTOR: { ...BASE, maxHp: 315, baseSpeed: 4.8, jitterScale: 1, chaseSpeed: 10.0, attackPower: 36, attackRange: 1.8, defaultStyle: 'OFFICER_PATROL', pauseChance: 0.55, canCarryUmbrella: true },
  // 校外強盜：手持砍刀在圍牆外徘徊
  BANDIT: { ...BASE, maxHp: 180, baseSpeed: 8.5, jitterScale: 0.6, chaseSpeed: 16.5, attackPower: 44, attackRange: 1.9, defaultStyle: 'CASUAL_WALK', pauseChance: 0.40 },
  // 校犬柴柴：敏捷四足犬
  DOG: { ...BASE, maxHp: 630, baseSpeed: 3.8, jitterScale: 0.4, chaseSpeed: 11.5, attackPower: 30, attackRange: 2.0, defaultStyle: 'CASUAL_WALK', styleFixed: true, pauseChance: 0.65, isCanine: true, hpBarY: 1.05, viewDist: 22.0, eyeHeight: 0.6, chaseAccelRate: 6.0 },
  // 火柴人自行車騎士：巡邏與追捕速度統一為 15.0
  BIKE_PATROL: { ...BASE, maxHp: 225, baseSpeed: 15.0, jitterScale: 0, chaseSpeed: 15.0, attackPower: 26, attackRange: 2.4, defaultStyle: 'CASUAL_WALK', styleFixed: true, pauseChance: 0.30, viewDist: 16.0, chaseAccelRate: 8.0 },
  // 風紀糾察 (步巡)
  INSPECTOR: { ...BASE, maxHp: 158, baseSpeed: 4.9, jitterScale: 1, chaseSpeed: 10.0, attackPower: 18, attackRange: 1.8, defaultStyle: 'OFFICER_PATROL', pauseChance: 0.55, canCarryUmbrella: true },
  // 平民學生：速度依移動風格決定
  STUDENT: { ...BASE, maxHp: 112, baseSpeed: 0, jitterScale: 0, chaseSpeed: 0, attackPower: 12, attackRange: 1.6, defaultStyle: null, pauseChance: 0, canCarryUmbrella: true },
  // 特訓教官：防暴盾與指揮棒，慢速巡邏讓玩家潛行可追近背刺
  DETENTION_GUARD: { ...DETENTION, maxHp: 160, baseSpeed: 1.45, chaseSpeed: 7.6, attackPower: 12, defaultStyle: 'OFFICER_PATROL', viewDist: 22.0 },
  // 特訓資深學長
  DETENTION_SENIOR: { ...DETENTION, maxHp: 130, baseSpeed: 1.50, chaseSpeed: 8.2, attackPower: 14, defaultStyle: 'OFFICER_PATROL' },
  // 重訓霸榜生
  DETENTION_HEAVY: { ...DETENTION, maxHp: 220, baseSpeed: 1.30, chaseSpeed: 6.6, attackPower: 18, defaultStyle: 'OFFICER_PATROL' },
  // 特訓狼犬：脆皮敏捷
  DETENTION_WOLF: { ...DETENTION, maxHp: 105, baseSpeed: 1.80, chaseSpeed: 8.6, attackPower: 10, defaultStyle: 'JOGGING', styleFixed: true, isCanine: true, hpBarY: 1.05, viewDist: 22.0 },
  // 總教官 Boss【鐵面總長】
  DETENTION_BOSS: { ...DETENTION, maxHp: 420, baseSpeed: 1.35, chaseSpeed: 7.8, attackPower: 20, defaultStyle: 'OFFICER_PATROL', viewDist: 22.0 }
};

// 平民學生各移動風格數值 (散步、疾走、慢跑、步巡)
export const STUDENT_STYLE_STATS: Record<NPCMovementStyle, { speed: number; jitterScale: number; chaseSpeed: number; pauseChance: number }> = {
  JOGGING: { speed: 7.6, jitterScale: 0.8, chaseSpeed: 10.8, pauseChance: 0.25 },
  HURRIED_WALK: { speed: 5.9, jitterScale: 0.6, chaseSpeed: 10.0, pauseChance: 0.45 },
  OFFICER_PATROL: { speed: 4.8, jitterScale: 1, chaseSpeed: 10.0, pauseChance: 0.55 },
  CASUAL_WALK: { speed: 4.4, jitterScale: 0.6, chaseSpeed: 9.8, pauseChance: 0.60 }
};
