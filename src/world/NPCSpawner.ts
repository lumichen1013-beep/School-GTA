import * as THREE from 'three';
import { NPC, NPCRole, NPCMovementStyle, NPCLook, NPCCampusAnchor } from '../entities/NPC';

export interface NPCSpawnDef {
  role: NPCRole;
  pos: [number, number, number];
  waypoints: [number, number, number][];
  style?: NPCMovementStyle;
  hp?: number;
  maxHp?: number;
  look?: NPCLook;
  anchor?: NPCCampusAnchor;
}

// ============================================================================
// 天天國中校園 NPC 生成配置數據
// ============================================================================
const CAMPUS_NPC_DEFS: NPCSpawnDef[] = [
  // 1. 生教組長 (中庭綠帶與走廊威嚴步巡，巡邏路徑延伸至 95m+)
  {
    role: 'DISCIPLINE_CHIEF',
    pos: [15, 0, 15],
    waypoints: [[15, 0, 15], [15, 0, 50], [2, 0, 58], [-5, 0, 30], [5, 0, 12]],
    style: 'OFFICER_PATROL'
  },
  // 2. 主任教官 (校門口廣場與中央大道大型巡邏圈，巡邏路徑延伸至 85m+)
  {
    role: 'INSTRUCTOR',
    pos: [0, 0, 92],
    waypoints: [[0, 0, 92], [-18, 0, 85], [-12, 0, 58], [12, 0, 58], [18, 0, 85]],
    style: 'OFFICER_PATROL'
  },
  // 3. 校犬柴柴 (遼闊草皮大範圍自由巡遊，嗅聞青草與原地端坐休養，巡查範圍 150m+)
  {
    role: 'DOG',
    pos: [-45, 0, -15],
    waypoints: [[-45, 0, -15], [-25, 0, 5], [-22, 0, 42], [-48, 0, 58], [-72, 0, 32], [-65, 0, -8]]
  },
  // 4. 單車巡邏糾察隊 (共 4 名，覆蓋全校各大主幹道與運動場外環，每圈 130m~175m)
  {
    role: 'BIKE_PATROL',
    pos: [-22, 0, 55],
    waypoints: [[-22, 0, 55], [-22, 0, -15], [8, 0, -35], [8, 0, 65]]
  },
  {
    role: 'BIKE_PATROL',
    pos: [-45, 0, -55],
    waypoints: [[-45, 0, -55], [-12, 0, -50], [-5, 0, -18], [-38, 0, -22]]
  },
  {
    role: 'BIKE_PATROL',
    pos: [12, 0, 8],
    waypoints: [[12, 0, 8], [12, 0, 82], [-6, 0, 78], [-6, 0, 12]]
  },
  {
    role: 'BIKE_PATROL',
    pos: [-82, 0, -6],
    waypoints: [[-82, 0, -6], [-82, 0, 64], [-48, 0, 70], [-48, 0, -12]]
  },
  // 5. 風紀糾察隊 (步巡 2 名，雙手負後巡查，路線 80m+)
  {
    role: 'INSPECTOR',
    pos: [15, 0, -18],
    waypoints: [[15, 0, -18], [5, 0, -42], [-14, 0, -40], [-8, 0, -15]],
    style: 'OFFICER_PATROL'
  },
  {
    role: 'INSPECTOR',
    pos: [0, 0, 92],
    waypoints: [[0, 0, 92], [-16, 0, 82], [-10, 0, 65], [12, 0, 65], [16, 0, 82]],
    style: 'OFFICER_PATROL'
  },
  // 6. 普通學生 (1F 12 名 (含田徑隊阿凱) + 泳池 1 名 + 籃球場 2 名 + 操場足球 2 名，各具獨特行為風格、慢跑/疾走/散步與長距離移動路線)
  // 6.1 田徑隊阿凱 (PU 跑道外側分道逆時針慢跑繞圈；200m 對決由他上場，見 CampusSportsCrew)
  {
    role: 'STUDENT',
    pos: [-28, 0, 14],
    waypoints: [
      [-28, 0, 14], [-36.6, 0, -4.4], [-55, 0, -12], [-73.4, 0, -4.4], [-81, 0, 14], [-81, 0, 46],
      [-73.4, 0, 64.4], [-55, 0, 72], [-36.6, 0, 64.4], [-29, 0, 46]
    ],
    style: 'JOGGING',
    look: 'TRACK',
    anchor: 'TRACK'
  },
  // 6.2 田徑跑者 2 號 (錯開半圈起跑的慢跑同學)
  {
    role: 'STUDENT',
    pos: [-80, 0, 30],
    waypoints: [[-80, 0, 30], [-80, 0, 50], [-55, 0, 70], [-30, 0, 40], [-30, 0, 14], [-55, 0, -10]],
    style: 'JOGGING'
  },
  // 6.3 趕課疾走同學 (從林蔭大道大步快走奔向教學樓 A 棟，75m)
  {
    role: 'STUDENT',
    pos: [0, 0, 72],
    waypoints: [[0, 0, 72], [12, 0, 52], [18, 0, 22], [22, 0, 8], [16, 0, 32]],
    style: 'HURRIED_WALK'
  },
  // 6.4 趕買早餐同學 (大步快走前往合作社，70m)
  {
    role: 'STUDENT',
    pos: [12, 0, 12],
    waypoints: [[12, 0, 12], [2, 0, -12], [-10, 0, -32], [-15, 0, -46], [-4, 0, -28]],
    style: 'HURRIED_WALK'
  },
  // 6.5 & 6.6 合作社戶外桌交談結伴同學
  {
    role: 'STUDENT',
    pos: [-14, 0, -42],
    waypoints: [[-14, 0, -42], [-24, 0, -46], [-32, 0, -52], [-22, 0, -38]],
    style: 'CASUAL_WALK'
  },
  {
    role: 'STUDENT',
    pos: [-12, 0, -40],
    waypoints: [[-12, 0, -40], [-22, 0, -44], [-30, 0, -50], [-20, 0, -36]],
    style: 'CASUAL_WALK'
  },
  // 6.7 低頭滑手機同學 (沿中央林蔭大道散步，高頻率停步低頭看手機 55m)
  {
    role: 'STUDENT',
    pos: [2, 0, 18],
    waypoints: [[2, 0, 18], [2, 0, 42], [2, 0, 70], [2, 0, 36]],
    style: 'CASUAL_WALK'
  },
  // 6.8 中庭花園漫步同學 (環形巡遊噴泉綠樹廣場 55m)
  {
    role: 'STUDENT',
    pos: [8, 0, 22],
    waypoints: [[8, 0, 22], [14, 0, 42], [6, 0, 56], [-2, 0, 38]],
    style: 'CASUAL_WALK'
  },
  // 6.9 & 6.10 樹下聊天雙人組 (結伴在中庭林蔭大道旁談笑 50m)
  {
    role: 'STUDENT',
    pos: [-8, 0, 16],
    waypoints: [[-8, 0, 16], [-14, 0, 32], [-8, 0, 44], [-2, 0, 28]],
    style: 'CASUAL_WALK'
  },
  {
    role: 'STUDENT',
    pos: [-6, 0, 18],
    waypoints: [[-6, 0, 18], [-12, 0, 34], [-6, 0, 46], [0, 0, 30]],
    style: 'CASUAL_WALK'
  },
  // 6.11 生態池許願小憩同學 (漫步生態園水池與石橋 40m)
  {
    role: 'STUDENT',
    pos: [-46, 0, -74],
    waypoints: [[-46, 0, -74], [-55, 0, -80], [-64, 0, -78], [-52, 0, -70]],
    style: 'CASUAL_WALK'
  },
  // 6.12 校門口迎賓大道散步同學 (45m)
  {
    role: 'STUDENT',
    pos: [-16, 0, 84],
    waypoints: [[-16, 0, 84], [0, 0, 88], [16, 0, 84], [0, 0, 80]],
    style: 'CASUAL_WALK'
  },
  // 6.13 游泳隊小魚 (池畔北側甲板出發台旁熱身；50m 自由式對決由他上場，見 CampusSportsCrew)
  {
    role: 'STUDENT',
    pos: [77.5, 0.3, -49.6],
    waypoints: [[77.5, 0.3, -49.6], [81, 0.3, -49.6]],
    style: 'CASUAL_WALK',
    look: 'SWIMMER',
    anchor: 'POOL'
  },
  // 6.14 & 6.15 籃球場鬥牛雙人組 (東南籃框半場輪流運球、投籃、搶籃板與傳球)
  {
    role: 'STUDENT',
    pos: [36.6, 0, -28.6],
    waypoints: [[36.6, 0, -28.6], [40.5, 0, -30.5], [41.5, 0, -27.5]],
    style: 'CASUAL_WALK',
    look: 'PE',
    anchor: 'COURT'
  },
  {
    role: 'STUDENT',
    pos: [39.4, 0, -26.4],
    waypoints: [[39.4, 0, -26.4], [35.5, 0, -30], [38, 0, -32]],
    style: 'CASUAL_WALK',
    look: 'PE',
    anchor: 'COURT'
  },
  // 6.16 & 6.17 操場球門前踢足球雙人組 (北端球門前草皮來回滾傳球、偶爾射門，球與動作見 CampusSoccerPair)
  {
    role: 'STUDENT',
    pos: [-58, 0, 14],
    waypoints: [[-58, 0, 14], [-56, 0, 20], [-60, 0, 18]],
    style: 'CASUAL_WALK',
    look: 'PE',
    anchor: 'PITCH'
  },
  {
    role: 'STUDENT',
    pos: [-52, 0, 18],
    waypoints: [[-52, 0, 18], [-50, 0, 13], [-54, 0, 22]],
    style: 'CASUAL_WALK',
    look: 'PE',
    anchor: 'PITCH'
  },
  // 7. 高樓層師生 (敬業樓 A 棟 & 樂群樓 B 棟 2F/3F，含貫穿兩棟建築物 70m+ 的空中走廊天橋；學生 2F 4 名、3F 3 名)
  {
    role: 'TEACHER',
    pos: [31, 6.0, 10],
    waypoints: [[31, 6.0, 10], [31, 6.0, 32], [31, 6.0, 52], [31, 6.0, 78]],
    style: 'OFFICER_PATROL'
  },
  {
    role: 'STUDENT',
    pos: [31, 6.0, 76],
    waypoints: [[31, 6.0, 76], [31, 6.0, 50], [31, 6.0, 30], [31, 6.0, 14]],
    style: 'CASUAL_WALK'
  },
  {
    role: 'STUDENT',
    pos: [36, 6.0, 8],
    waypoints: [[36, 6.0, 8], [44, 6.0, 8], [44, 6.0, 16], [36, 6.0, 16]]
  },
  {
    role: 'STUDENT',
    pos: [36, 6.0, 22],
    waypoints: [[36, 6.0, 22], [44, 6.0, 22], [44, 6.0, 30], [36, 6.0, 30]]
  },
  {
    role: 'STUDENT',
    pos: [36, 6.0, 74],
    waypoints: [[36, 6.0, 74], [44, 6.0, 74], [44, 6.0, 84], [36, 6.0, 84]]
  },
  {
    role: 'TEACHER',
    pos: [31, 12.0, 12],
    waypoints: [[31, 12.0, 12], [31, 12.0, 32], [31, 12.0, 52], [31, 12.0, 78]],
    style: 'OFFICER_PATROL'
  },
  {
    role: 'STUDENT',
    pos: [31, 12.0, 76],
    waypoints: [[31, 12.0, 76], [31, 12.0, 50], [31, 12.0, 30], [31, 12.0, 14]],
    style: 'CASUAL_WALK'
  },
  {
    role: 'STUDENT',
    pos: [36, 12.0, 8],
    waypoints: [[36, 12.0, 8], [44, 12.0, 8], [44, 12.0, 16], [36, 12.0, 16]]
  },
  {
    role: 'STUDENT',
    pos: [36, 12.0, 60],
    waypoints: [[36, 12.0, 60], [44, 12.0, 60], [44, 12.0, 68], [36, 12.0, 68]]
  },
  // 8. 校外強盜 (圍牆外長程巡邏，65m~110m)
  {
    role: 'BANDIT',
    pos: [-35, 0, 118],
    waypoints: [[-35, 0, 118], [0, 0, 118], [35, 0, 118], [0, 0, 122]]
  },
  {
    role: 'BANDIT',
    pos: [15, 0, 124],
    waypoints: [[15, 0, 124], [48, 0, 124], [32, 0, 128], [15, 0, 128]]
  },
  {
    role: 'BANDIT',
    pos: [-15, 0, 126],
    waypoints: [[-15, 0, 126], [-48, 0, 126], [-32, 0, 130], [-15, 0, 130]]
  },
  {
    role: 'BANDIT',
    pos: [-118, 0, -45],
    waypoints: [[-118, 0, -45], [-118, 0, 10], [-118, 0, 65], [-118, 0, 15]]
  },
  {
    role: 'BANDIT',
    pos: [118, 0, -45],
    waypoints: [[118, 0, -45], [118, 0, 10], [118, 0, 65], [118, 0, 15]]
  },
  // 9. 演藝大樓 4F 羽球場：大如老師 (北半場步法跑動 drill)
  {
    role: 'PE_TEACHER_BOSS',
    pos: [76, 12.0, 31],
    waypoints: [[72, 12.0, 31], [80, 12.0, 31], [76, 12.0, 27], [76, 12.0, 34]],
    style: 'OFFICER_PATROL'
  },
  // 10. 教學大樓 1F 走廊：閃身步老師 (身法宗師，傳授閃身步與狗熊哆嗦毛，長廊身法巡走 20m)
  {
    role: 'DODGE_TEACHER',
    pos: [32, 0.0, 18],
    waypoints: [[32, 0.0, 8], [32, 0.0, 18], [32, 0.0, 28], [32, 0.0, 18]],
    style: 'OFFICER_PATROL'
  }
];

// ============================================================================
// 第二世界【特訓少年院】NPC 生成配置數據
// ============================================================================
const DETENTION_NPC_DEFS: NPCSpawnDef[] = [
  // ===== A 區：監區 (Z: -95 ~ -28) =====
  // 收容車道巡邏 (開局第一道視線；可利用卸貨木箱與彈藥箱掩護通過)
  { role: 'DETENTION_GUARD', pos: [-20, 0, -88.5], waypoints: [[-40, 0, -88.5], [-8, 0, -88.5]], style: 'OFFICER_PATROL' },
  // 中央檢查哨駐守 (主線正面)
  { role: 'DETENTION_GUARD', pos: [6, 0, -76.5], waypoints: [[5, 0, -76.5], [9, 0, -76.5]], style: 'OFFICER_PATROL' },
  // 放風庭院環狀巡邏 (繞行中央警衛室外圍)
  { role: 'DETENTION_SENIOR', pos: [-20, 0, -70], waypoints: [[-20, 0, -70], [20, 0, -70], [20, 0, -46], [-20, 0, -46]], style: 'OFFICER_PATROL' },
  // 中央警衛室門口站崗 (看守門禁卡 A)
  { role: 'DETENTION_GUARD', pos: [0, 0, -53], waypoints: [[-3, 0, -53], [3, 0, -53]], style: 'OFFICER_PATROL' },
  // 西外圍巡邏路 (西潛行路線)
  { role: 'DETENTION_GUARD', pos: [-90, 0, -60], waypoints: [[-90, 0, -82], [-90, 0, -34]], style: 'OFFICER_PATROL' },
  // 東服務巷巡邏 (東潛行路線)
  { role: 'DETENTION_GUARD', pos: [47.5, 0, -60], waypoints: [[47.5, 0, -76], [47.5, 0, -40]], style: 'OFFICER_PATROL' },
  // 醫務室門口站崗
  { role: 'DETENTION_GUARD', pos: [-73, 0, -35], waypoints: [[-76, 0, -35], [-70, 0, -35]], style: 'OFFICER_PATROL' },
  // 食堂門口站崗
  { role: 'DETENTION_SENIOR', pos: [79, 0, -35], waypoints: [[76, 0, -35], [82, 0, -35]], style: 'OFFICER_PATROL' },
  // 閘門 1 前站崗
  { role: 'DETENTION_GUARD', pos: [8, 0, -31], waypoints: [[7, 0, -31], [10, 0, -31]], style: 'OFFICER_PATROL' },
  // 庭院西半部狼犬
  { role: 'DETENTION_WOLF', pos: [-24, 0, -64], waypoints: [[-36, 0, -66], [-12, 0, -64]] },

  // ===== B 區：訓練場 (Z: -28 ~ 35) =====
  // 西外圍巡邏路
  { role: 'DETENTION_GUARD', pos: [-90, 0, 0], waypoints: [[-90, 0, -24], [-90, 0, 30]], style: 'OFFICER_PATROL' },
  // 職訓工坊東側站崗
  { role: 'DETENTION_GUARD', pos: [-55, 0, -16], waypoints: [[-55, 0, -20], [-55, 0, -12]], style: 'OFFICER_PATROL' },
  // 貨櫃北巷巡邏
  { role: 'DETENTION_GUARD', pos: [0, 0, -14], waypoints: [[-24, 0, -14], [24, 0, -14]], style: 'OFFICER_PATROL' },
  // 貨櫃南巷巡邏
  { role: 'DETENTION_SENIOR', pos: [0, 0, 17], waypoints: [[-24, 0, 17], [24, 0, 17]], style: 'OFFICER_PATROL' },
  // 探照燈塔下重裝守衛
  { role: 'DETENTION_HEAVY', pos: [0, 0, -2], waypoints: [[-6, 0, -2], [6, 0, -2]], style: 'OFFICER_PATROL' },
  // 障礙訓練場狼犬
  { role: 'DETENTION_WOLF', pos: [-36, 0, 10], waypoints: [[-42, 0, 10], [-30, 0, 10]] },
  // 器材庫捲門口站崗 (看守門禁卡 B)
  { role: 'DETENTION_GUARD', pos: [55, 0, 6], waypoints: [[55, 0, 3], [55, 0, 9]], style: 'OFFICER_PATROL' },
  // 東外圍巡邏路
  { role: 'DETENTION_GUARD', pos: [90, 0, 0], waypoints: [[90, 0, -24], [90, 0, 30]], style: 'OFFICER_PATROL' },
  // 閘門 2 前站崗
  { role: 'DETENTION_GUARD', pos: [8, 0, 30], waypoints: [[7, 0, 30], [10, 0, 30]], style: 'OFFICER_PATROL' },

  // ===== C 區：決戰區 (Z: 35 ~ 95) =====
  // 行政大樓門口站崗
  { role: 'DETENTION_GUARD', pos: [-44, 0, 62], waypoints: [[-44, 0, 58], [-44, 0, 66]], style: 'OFFICER_PATROL' },
  // 軍械庫門口站崗
  { role: 'DETENTION_HEAVY', pos: [44, 0, 62], waypoints: [[44, 0, 58], [44, 0, 66]], style: 'OFFICER_PATROL' },
  // 南側道路巡邏
  { role: 'DETENTION_GUARD', pos: [0, 0, 85], waypoints: [[-30, 0, 85], [30, 0, 85]], style: 'OFFICER_PATROL' },
  // 南大門檢查亭站崗
  { role: 'DETENTION_GUARD', pos: [0, 0, 90.5], waypoints: [[-5, 0, 90.5], [5, 0, 90.5]], style: 'OFFICER_PATROL' },

  // C 區小 Boss【鐵面總教官】(駐守決戰庭院中央，X: -10 ~ 10 橫向巡視；5 次暗殺擊破)
  {
    role: 'DETENTION_BOSS',
    pos: [0, 0, 63],
    waypoints: [[-10, 0, 63], [10, 0, 63]],
    style: 'OFFICER_PATROL',
    hp: 500,
    maxHp: 500
  }
];

function instantiateNPCs(scene: THREE.Scene, defs: NPCSpawnDef[], initialVisible: boolean = true): NPC[] {
  const result: NPC[] = [];
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    const startVec = new THREE.Vector3(d.pos[0], d.pos[1], d.pos[2]);
    const wpVecs: THREE.Vector3[] = [];
    for (let w = 0; w < d.waypoints.length; w++) {
      wpVecs.push(new THREE.Vector3(d.waypoints[w][0], d.waypoints[w][1], d.waypoints[w][2]));
    }
    const npc = new NPC(scene, startVec, d.role, wpVecs, d.style, d.look);
    if (d.anchor) npc.campusAnchor = d.anchor;
    if (d.hp !== undefined) npc.hp = d.hp;
    if (d.maxHp !== undefined) npc.maxHp = d.maxHp;
    npc.mesh.visible = initialVisible;
    result.push(npc);
  }
  return result;
}

/**
 * 建立天天國中第一世界全體校園 NPC (學生、老師、教官、糾察隊、強盜、Boss)
 */
export function createCampusNPCs(scene: THREE.Scene): NPC[] {
  return instantiateNPCs(scene, CAMPUS_NPC_DEFS, true);
}

/**
 * 建立特訓少年院第二世界全體 NPC (守衛教官、特訓學長、巡查狼犬、總教官 Boss)
 */
export function createDetentionNPCs(scene: THREE.Scene): NPC[] {
  return instantiateNPCs(scene, DETENTION_NPC_DEFS, false);
}
