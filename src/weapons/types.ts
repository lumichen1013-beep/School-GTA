import type * as THREE from 'three';
import type { KfMove } from '../entities/shared/kungfu';
import type { WeaponFxId } from '../effects/weaponFxStyle';

// 武器槽中的武器 (循環切換)；場景覆寫 (如 4F 羽球賽球拍) 不進武器槽
export type WeaponId = 'FIST' | 'NORMAL_BAT' | 'SPECIAL_BAT' | 'DUAL_RACKET';
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
// feathers = 主擊噴發羽毛
export interface WeaponFinisherFx {
  readonly feathers?: boolean;
  readonly slamBolt?: boolean;
  readonly waistY?: number;
  readonly landRadius?: number;
}

// 音效：strike 於每次命中時間點呼叫 (strikeIndex 0 = 主擊，之後依招式 extraStrikes 順序遞增)；start 於起手呼叫
export interface WeaponSounds {
  readonly strike?: (strikeIndex: number) => void;
  readonly start?: () => void;
}

// 拖尾 / 發光樣式：單一樣式或依持握手分色
export type WeaponFxSpec = WeaponFxId | { readonly R: WeaponFxId; readonly L?: WeaponFxId };

export type WeaponReadyPose = 'FIST' | 'WEAPON' | 'DUAL';

// 預建模型 (建構時一次建立，執行期只切換 visible / scale / 材質數值)
export interface WeaponModelHandle {
  readonly parts: WeaponHandMap<THREE.Object3D>;
  // emissive 脈衝：k = 0..1 相對強度、peak = 峰值；null = 不發光
  readonly glow: ((k: number, peak: number, color: number) => void) | null;
  // 還原材質原值 (發光基準)
  resetGlow(): void;
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
}

// 進度查詢介面 (由 Progression 提供，提示文字取解鎖進度)
export interface WeaponUnlockProgress {
  readonly studentDefeatedCount: number;
  readonly teacherDefeatedCount: number;
  readonly dogDefeatedCount: number;
  readonly bikePatrolDefeatedCount: number;
}

// 實際揮擊時生效的套組共通欄位 (武器定義與場景覆寫共用)
interface WeaponLoadoutFields {
  readonly name: string;
  readonly combo: readonly KfMove[];
  readonly tempo: number; // 出招時間縮放 (> 1 較慢)
  readonly fxStyle: WeaponFxSpec;
  readonly finisherFx?: WeaponFinisherFx;
  readonly model?: WeaponModelSpec;
  readonly anchors: WeaponHandMap<WeaponAnchor>;
  readonly sounds: WeaponSounds;
  readonly readyPose: WeaponReadyPose;
}

export interface WeaponDefinition extends WeaponLoadoutFields {
  readonly id: WeaponId;
  readonly slot: number;
  readonly icon: string;
  readonly banner: { readonly campus: string; readonly detention: string };
  readonly stats: WeaponStats;
  // 終結技群攻改讀招式上的 maxGold / shakeGold / hitStopGold (未設時回退一般欄位)
  readonly useGoldAoe?: boolean;
  // 左手持械 (雙持)：持有時不撐傘 (比照特訓院收傘)，出招也不鎖左臂
  readonly suppressUmbrella?: boolean;
  // null = 一開始即持有
  readonly unlock: { lockedHint(p: WeaponUnlockProgress, world: WeaponWorld): string } | null;
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
  readonly finisherFx: WeaponFinisherFx;
  readonly anchors: WeaponHandMap<WeaponAnchor>;
  readonly sounds: WeaponSounds;
  readonly readyPose: WeaponReadyPose;
}
