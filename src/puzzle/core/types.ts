// 《圖紙之間》共用型別 (純邏輯，不依賴 three)
import type { CompiledMechanics } from './registry';

export type Mode = '3d' | '2d';
export type Visibility = 'both' | '2d' | '3d';
export type V3 = [number, number, number];
export type ObjId = string;
/** 文字 key (解析於 content/text；核心只存 key) */
export type TextKey = string;
export type TextParams = Readonly<Record<string, string | number>>;
/** 能力 (規格 8 save.abilities；關卡以白名單限制可用能力) */
export type AbilityId = 'nib' | 'pin' | 'section' | 'mark';
/** 物品 id ('nib' …；N9) */
export type ItemId = string;
/** 鎖的需求：字串 = 需持有、不消耗；consume = 使用時消耗一個 */
export type ItemReq = ItemId | { item: ItemId; consume?: boolean };

/** 物件通用欄位：x,z 為中心，y 為底部；w,h,d 為 x,y,z 尺寸 */
export interface ObjBase {
  id: ObjId;
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  /** 可見模式；同時決定碰撞 / 互動只在哪些模式生效 (除非 interactIn 另行指定) */
  visible: Visibility;
  solid: boolean;
  interactable?: boolean;
  /** 只在此模式可互動 (預設同 visible) */
  interactIn?: Visibility;
  pushable?: boolean;
  /** 顯示名稱的文字 key */
  labelKey?: TextKey;
  /** 切回 3D 時不可落在其範圍內 (3D 下被圍住、走不出去的區域)；會改落到最近可站處 */
  noLand3d?: boolean;
  /** 互動前須持有的物品 (N9)；不滿足時說 lockedText 並中止 */
  requires?: ItemReq;
  /** 互動即取得的物品 (N9)；取得後物件消失 */
  grants?: ItemId;
  /** 觸發 (互動 / 壓板壓下) 時開啟的物件 id (C6、C8) */
  opens?: ObjId;
  /** requires 不滿足時的訊息 (文字 key；未登錄的字串原樣顯示) */
  lockedText?: TextKey;
  /** requires / grants / opens 生效時的訊息 (文字 key；未登錄的字串原樣顯示) */
  useText?: TextKey;
}

/** 開放式類型表：每個機制檔以 declaration merging 加入自己的類型與專屬欄位 */
export interface ObjKinds {
  floor: {}; wall: {}; rail: {}; table: {}; plinth: {}; shelf: {}; crate: {};
}
export type ObjType = keyof ObjKinds;
export type ObjDef = { [K in ObjType]: ObjBase & { type: K } & ObjKinds[K] }[ObjType];

export interface Checkpoint { minX: number; x: number; y: number; z: number }

/** 謎題 (architecture 4.10 PuzzleDef 的子集)：id 用規格編號 ('1-2a')，titleKey = 顯示編號與名稱 (文字表) */
export interface PuzzleRef { id: string; titleKey: TextKey }

export interface LevelDef {
  id: string;
  titleKey: TextKey;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** 低於此高度視為掉入坑洞 */
  voidY: number;
  start: { x: number; y: number; z: number };
  /** 站上 x ≥ minX 的地面後，掉落改回此處重生 (依序遞進) */
  checkpoints?: Checkpoint[];
  narrationKey: TextKey;
  /** 本關謎題 (依解題順序；目前只供文字 / 測試 / 驗證器使用) */
  puzzles?: PuzzleRef[];
  /** 通關畫面的「下一間房」文字 */
  nextKey: TextKey;
  /** 呈現主題 id (render/themes)；未給 = 章節主題 */
  theme?: string;
  /** 房間裝飾 (純呈現：不進碰撞、不可互動，核心與機制不讀)；依序由 render/decor 登錄表建出 */
  decor?: DecorItem[];
  objects: ObjDef[];
}

/** 裝飾欄位值 (純資料，可 JSON 序列化) */
export type DecorValue = number | string | boolean;
/**
 * 一件裝飾 (architecture 4.3)：kind 決定由哪個 render/decor 工廠解讀，其餘欄位依 kind 而定
 * (例：painting 需 x / y / w / h / variant)；座標同物件 (x 向右、y 向上、z 向觀眾)
 */
export interface DecorItem { kind: string; [field: string]: DecorValue }

/** used：「已觸發」狀態 (閥已轉、壓力板已壓下、閘門已開、出口門已解封)；touched：壓力板提示已顯示 */
export interface ObjState { def: ObjDef; x: number; y: number; z: number; gone: boolean; used: boolean; touched: boolean }

export interface Player {
  x: number; y: number; z: number; vy: number;
  onGround: boolean;
  mode: Mode;
  /** 進入 2D 前記下的 z */
  z3d: number;
  facing: number;
}

export interface World {
  level: LevelDef;
  objs: ObjState[];
  byId: Map<string, ObjState>;
  player: Player;
  /** 目前重生點 (-1 = 起點) */
  checkpoint: number;
  /** 持有物品數量 (取代 hasKey；N9) */
  inv: Record<ItemId, number>;
  /** 本關開場可用能力 (關卡白名單 ∩ 存檔已得能力；目前尚無依能力限制的動作) */
  abilities: AbilityId[];
  cleared: boolean;
  /** 最後一則訊息：msg = 已解析字串 (相容既有測試)，msgKey = 其文字 key */
  msg: string;
  msgKey: TextKey;
  msgSeq: number;
  time: number;
  /** 本步事件外送匣，外殼每幀取走清空 */
  events: GameEvent[];
  /** 不序列化：編譯後的機制表與文字解析器 */
  readonly rt: Runtime;
}

export interface Runtime { mechanics: CompiledMechanics; text: (key: TextKey, params?: TextParams) => string }

export type GameEvent = { t: 'switch'; to: Mode } | { t: 'switchDenied' };

export interface Box { min: V3; max: V3 }
export interface InputState { moveX: number; moveZ: number; jump: boolean }
