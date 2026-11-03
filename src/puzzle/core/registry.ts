import type { ObjState, World } from './types';
import type { WorldCommand } from './actions';

export type MechanicId = string;

/** 物件類型規格 (S4 起由機制註冊；類型只能有一個擁有者) */
export interface ObjTypeSpec {
  /** [E] 提示的動詞文字 key (未設 → obj.default.verb) */
  verbKey?: string;
  /** used 之後仍可互動 (出口門：解封 = used，解封後才開得了) */
  usableWhenUsed?: boolean;
  /** 通用前置 (requires / grants / opens) 處理完之後呼叫 */
  interact?(w: World, o: ObjState): void;
}

/** 機制模組：經掛點插入核心；陣列順序 = 執行順序 (mechanics/index.ts) */
export interface Mechanic {
  readonly id: MechanicId;
  /** 此機制擁有的物件類型 */
  readonly types?: Readonly<Record<string, ObjTypeSpec>>;
  /** 建立世界時呼叫 */
  init?(w: World): void;
  /** 存在但不擋路 (C7 開啟的閘門)；OR 合成 */
  passable?(w: World, o: ObjState): boolean;
  /** 核心物理之前 (依註冊順序) */
  beforePhysics?(w: World, dt: number): void;
  /** 核心物理之後、檢查點之前 (依註冊順序；plates 必須在 links 之前) */
  afterPhysics?(w: World, dt: number): void;
  /** E 沒有一般目標時 (findTarget = null) 依序詢問；回傳 true = 已處理 (不再說「看得見，卻碰不到」)。例：2D 對標籤開字卡匣 */
  interactFallback?(w: World): boolean;
  /** 帶參數的指令 (WorldCommand)；回傳 true = 已處理 (後面的機制不再收到) */
  command?(w: World, cmd: WorldCommand): boolean;
  /** v0.4 卡榫 (P3)：此刻房內有東西伸進魔方軌道 → 牽涉這間房的控制盤轉動一律轉不動 (OR 合成；第三章 scale 實作) */
  blocksTrack?(w: World): boolean;
}

export interface CompiledMechanics {
  readonly list: readonly Mechanic[];
  readonly types: ReadonlyMap<string, { owner: MechanicId; spec: ObjTypeSpec }>;
  readonly init: readonly Mechanic[];
  readonly passable: readonly Mechanic[];
  readonly beforePhysics: readonly Mechanic[];
  readonly afterPhysics: readonly Mechanic[];
  readonly interactFallback: readonly Mechanic[];
  readonly command: readonly Mechanic[];
  readonly blocksTrack: readonly Mechanic[];
}

/** 編譯機制表：重複的機制 id / 物件類型 → 拋錯 */
export function compileMechanics(list: readonly Mechanic[]): CompiledMechanics {
  const ids = new Set<MechanicId>();
  const types = new Map<string, { owner: MechanicId; spec: ObjTypeSpec }>();
  for (const m of list) {
    if (ids.has(m.id)) throw new Error(`duplicate mechanic id: ${m.id}`);
    ids.add(m.id);
    for (const [type, spec] of Object.entries(m.types ?? {})) {
      const prev = types.get(type);
      if (prev) throw new Error(`object type ${type} registered by both ${prev.owner} and ${m.id}`);
      types.set(type, { owner: m.id, spec });
    }
  }
  return {
    list, types,
    init: list.filter(m => m.init),
    passable: list.filter(m => m.passable),
    beforePhysics: list.filter(m => m.beforePhysics),
    afterPhysics: list.filter(m => m.afterPhysics),
    interactFallback: list.filter(m => m.interactFallback),
    command: list.filter(m => m.command),
    blocksTrack: list.filter(m => m.blocksTrack)
  };
}
