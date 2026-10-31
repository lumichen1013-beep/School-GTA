import type * as THREE from 'three';
import type { KfMove } from '../entities/shared/kungfu';
import type { WeaponFxId } from '../effects/weaponFxStyle';
import type { LaunchCap } from './launch';
import type { Vec3Like } from '../audio/spatialAudio';
import type { ImpactClass } from './impactClass';

// 武器槽中的武器 (循環切換)；場景覆寫 (如 4F 羽球賽球拍) 不進武器槽
// BOOK_WHIP / BASKETBALL / SLINGSHOT 由小遊戲 / 比賽成績解鎖；RAPIER 為花劍客首勝獎勵 (與 Boss 同步正式上線)
export type WeaponId = 'FIST' | 'NORMAL_BAT' | 'SPECIAL_BAT' | 'DUAL_RACKET' | 'RAPIER' | 'BOOK_WHIP' | 'BASKETBALL' | 'SLINGSHOT';
export type WeaponOverrideId = 'RACKET';
export type WeaponDisplayId = WeaponId | WeaponOverrideId;
export type WeaponWorld = 'CAMPUS' | 'DETENTION';

// 持握手：R = rightArm、L = leftArm；BOTH 為雙持 (兩手各一份模型)
export type WeaponHand = 'R' | 'L';
export type WeaponMount = WeaponHand | 'BOTH';
export type WeaponHandMap<T> = { readonly R?: T; readonly L?: T };

// 拖尾錨點：武器模型本地 Y 軸上的握把端 / 尖端位置 (尖端兼作下劈特效衝擊點)
export interface WeaponAnchor { readonly base: number; readonly tip: number }

export interface WeaponStats {
  readonly damage: number;
  readonly reach: number;     // 攻擊距離 (招式 reach / 群攻 radius 的基準)
  readonly knockback: number;
}

// 連段終結技特效參數：slamBolt = 下劈地裂附帶雷電、waistY = 旋身衝擊環高度、landRadius = 著地補環半徑 (0 / 未設 = 不補)、
// feathers = 主擊噴發羽毛 (featherColors = 自訂色盤，未設為雙燕羽刃預設白 / 青 / 粉；綁帶捆書用紙白 / 墨藍當書頁)
export interface WeaponFinisherFx {
  readonly feathers?: boolean;
  readonly featherColors?: readonly number[];
  readonly slamBolt?: boolean;
  readonly waistY?: number;
  readonly landRadius?: number;
}

// 音效：strike 於每次命中時間點 (判定結算後) 呼叫；start 於起手呼叫 (未設時依 impactClass 播揮空破風音，發射型招式除外)
// strike 參數：strikeIndex 0 = 主擊、之後依招式 extraStrikes 順序遞增；pos = 發聲者 (持武器者) 位置 (空間音效距離衰減)；
// isFinisher = 終結技主擊；step = 連段第幾段 (0..2)；landed = 本擊是否打中目標 (揮空時多數武器不出打擊聲)
export interface WeaponSounds {
  readonly strike?: (strikeIndex: number, pos: Vec3Like, isFinisher: boolean, step: number, landed: boolean) => void;
  readonly start?: (pos: Vec3Like) => void;
}

// 拖尾 / 發光樣式：單一樣式或依持握手分色
export type WeaponFxSpec = WeaponFxId | { readonly R: WeaponFxId; readonly L?: WeaponFxId };

// SLING_AIM：待命同 WEAPON，蓄力時右臂前舉 / 左臂拉弦依蓄力比例插值 (Player.aimCharge)
// FENCE：擊劍架勢 (右臂前伸劍尖斜上、左臂高舉)，出招時腕角轉為劍身順著手臂 (見 Player.applyHeldStance)
export type WeaponReadyPose = 'FIST' | 'WEAPON' | 'DUAL' | 'SLING_AIM' | 'FENCE';

// 預建模型 (建構時一次建立，執行期只切換 visible / scale / 材質數值)
export interface WeaponModelHandle {
  readonly parts: WeaponHandMap<THREE.Object3D>;
  // emissive 脈衝：k = 0..1 相對強度、peak = 峰值；null = 不發光
  readonly glow: ((k: number, peak: number, color: number) => void) | null;
  // 還原材質原值 (發光基準)
  resetGlow(): void;
  // 瞄準姿勢模型變化 (如彈弓橡皮筋拉伸 / 整支轉向前)：ratio = 蓄力比例 0..1；無則不處理
  readonly aim?: (ratio: number) => void;
}

export interface WeaponModelSpec {
  readonly mount: WeaponMount;
  build(): WeaponModelHandle;
}

// 世界別變體：覆寫招式組 / 樣式 / 節奏 / 終結特效 (如第二世界普通棒 → 警棍)
export interface WeaponVariant {
  readonly name: string;
  readonly combo: readonly KfMove[];
  readonly fxStyle: WeaponFxSpec;
  readonly tempo?: number;
  readonly finisherFx?: WeaponFinisherFx;
  readonly launchCap?: LaunchCap;
  readonly sounds?: WeaponSounds; // 變體專屬音效 (如警棍金屬電擊聲)；未設沿用定義本身
}

// 進度查詢介面 (由 Progression 提供，提示文字取解鎖進度)
export interface WeaponUnlockProgress {
  readonly studentDefeatedCount: number;
  readonly teacherDefeatedCount: number;
  readonly dogDefeatedCount: number;
  readonly bikePatrolDefeatedCount: number;
  readonly basketballMade: number; // 小遊戲投籃累計進球 (BasketballGame.totalMade；武器投出的球不計)
  readonly swimWon: boolean;       // 是否贏過游泳 (小魚)
  readonly trackWon: boolean;      // 是否贏過跑操場 (阿凱)
  readonly fencerDefeated: boolean; // 是否擊敗過世界 Boss 花劍客 (首勝)
}

// 實際揮擊時生效的套組共通欄位 (武器定義與場景覆寫共用)
interface WeaponLoadoutFields {
  readonly name: string;
  readonly combo: readonly KfMove[];
  readonly tempo: number; // 出招時間縮放 (> 1 較慢)
  readonly fxStyle: WeaponFxSpec;
  // 命中回饋分級 (停格 / 震動 / 星芒 / 碎片 / 揮空音高)，見 impactClass.ts
  readonly impactClass: ImpactClass;
  readonly finisherFx?: WeaponFinisherFx;
  // 玩家終結技擊飛初速度上限 (未設 = NPC.ts 預設 10 / 7)；飛行距離 = h × 2v / 26
  readonly launchCap?: LaunchCap;
  // 連段接續窗 (秒)：預設 0.6 (自命中時間點起算)；遠程回收型武器改自接到球起算
  readonly chainWindow?: number;
  readonly model?: WeaponModelSpec;
  readonly anchors: WeaponHandMap<WeaponAnchor>;
  readonly sounds: WeaponSounds;
  readonly readyPose: WeaponReadyPose;
}

// 遠程武器彈道參數：speed = 出手初速 (m/s，去程估算用；回程速度見 projectiles/collide RETURN_SPEED)、range = 最大射程 (m)、
// catchDelay = 接到球後到可再出手的緩衝 (秒)、dpsDistance = 裝備頁標準秒傷距離 (m)；
// charged = 蓄力單發型 (彈弓)：秒傷改用蓄力曲線 (slingshot/ballistics)，無回收
export interface WeaponRanged {
  readonly speed: number;
  readonly range: number;
  readonly catchDelay: number;
  readonly dpsDistance: number;
  readonly charged?: boolean;
}

export interface WeaponDefinition extends WeaponLoadoutFields {
  readonly id: WeaponId;
  readonly slot: number;
  readonly icon: string;
  readonly banner: { readonly campus: string; readonly detention: string };
  readonly stats: WeaponStats;
  // 終結技群攻改讀招式上的 maxGold / shakeGold / hitStopGold (未設時回退一般欄位)
  readonly useGoldAoe?: boolean;
  // 遠程回收型武器 (投出後飛行並回手)：裝備頁秒傷改用遠程口徑 (單發期望傷害 ÷ (前搖 + 去程 + 回程 + 接後 0.1s))
  readonly ranged?: WeaponRanged;
  // 非終結技推擊距離 (m)：> 0 時非終結技命中改走 SHOVE (推開並打斷前搖)；未設 / 0 = 只扣血 (現有武器)
  readonly lightPush?: number;
  // 左手持械 (雙持)：持有時不撐傘 (比照特訓院收傘)，出招也不鎖左臂
  readonly suppressUmbrella?: boolean;
  // null = 一開始即持有；steps = 大地圖裝備頁的解鎖進度條 (未設則依 Progression 內建的舊武器步驟)
  readonly unlock: {
    lockedHint(p: WeaponUnlockProgress, world: WeaponWorld): string;
    steps?(p: WeaponUnlockProgress): readonly { readonly label: string; readonly cur: number; readonly max: number }[];
  } | null;
  // true = 沿用定義本身；false = 該世界不可用；物件 = 該世界變體
  readonly worlds: { readonly CAMPUS: true | WeaponVariant; readonly DETENTION: boolean | WeaponVariant };
}

export interface WeaponOverrideDefinition extends WeaponLoadoutFields {
  readonly id: WeaponOverrideId;
}

// 查表結果 (模組載入時預建，執行期只回傳參照)：模型 / 錨點 / 音效隨顯示中的武器，fx 已正規化為依手分色
export interface ResolvedWeapon {
  readonly id: WeaponDisplayId;
  readonly name: string;
  readonly combo: readonly KfMove[];
  readonly tempo: number;
  readonly fx: { readonly R: WeaponFxId; readonly L: WeaponFxId };
  readonly impactClass: ImpactClass;
  readonly finisherFx: WeaponFinisherFx;
  readonly launchCap: LaunchCap | null;
  readonly chainWindow: number; // 連段接續窗 (秒)
  readonly anchors: WeaponHandMap<WeaponAnchor>;
  readonly sounds: WeaponSounds;
  readonly readyPose: WeaponReadyPose;
}
