// 《圖紙之間》共用型別 (純邏輯，不依賴 three)
export type Mode = '3d' | '2d';
export type Visibility = 'both' | '2d' | '3d';
export type ObjType = 'floor' | 'shelf' | 'crate' | 'plinth' | 'rail' | 'key' | 'valve' | 'door' | 'note';
export type V3 = [number, number, number];

/** 物件定義：x,z 為中心，y 為底部；w,h,d 為 x,y,z 尺寸 */
export interface ObjDef {
  id: string;
  type: ObjType;
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  /** 可見模式；同時決定碰撞 / 互動只在哪些模式生效 (除非 interactIn 另行指定) */
  visible: Visibility;
  solid: boolean;
  interactable?: boolean;
  /** 只在此模式可互動 (預設同 visible) */
  interactIn?: Visibility;
  pushable?: boolean;
  /** 顯示名稱；note 則為紙條內容 */
  label?: string;
  /** note 的紙條內容 */
  text?: string;
}

export interface LevelDef {
  id: string;
  title: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** 低於此高度視為掉入坑洞 */
  voidY: number;
  start: { x: number; y: number; z: number };
  narration: string;
  nextRoom: string;
  objects: ObjDef[];
}

export interface ObjState { def: ObjDef; x: number; y: number; z: number; gone: boolean; used: boolean }

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
  hasKey: boolean;
  sealed: boolean;
  cleared: boolean;
  msg: string;
  msgSeq: number;
  time: number;
}

export interface Box { min: V3; max: V3 }
export interface InputState { moveX: number; moveZ: number; jump: boolean }
