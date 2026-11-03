import type { Mechanic } from '../core/registry';
import type { DoorLinkState, ItemId, LevelDef, ObjId, ObjState, TextKey, World } from '../core/types';
import type { CubeOp, DoorInfo, DoorKind, Side } from '../core/cube';
import type { TransferBlock, TurnBlock } from '../core/chapter';
import { hasItem, say } from '../core/world';
import { objBox, overlaps } from '../core/geometry';

/** 拉桿的方向字 (內部 id；顯示字「上 / 下 / 左 / 右」在文字表 term.word.*) */
export type LeverWord = 'up' | 'down' | 'left' | 'right';

declare module '../core/types' {
  interface ObjKinds {
    /** 拉桿 (N21)：3D 拉下 → 依方向字把自己所在的房間滑一格 (規格 5.4.1「轉自己」) */
    lever: { word: LeverWord };
    /**
     * 魔方門位 (N21)：side = 本地門位、kind = 門 / 拱門 / 章門；此刻接到哪由章節層寫入 World.ext.cube。
     * 章門：key = 開門要的鑰匙 (房間的銅鑰匙，章節道具)；openText = 打開時的訊息 (開了 = 本章通關)；
     * frameText = 這扇門接到屋框的入口 (來時的走廊) 時的說明 (第二章起；沒有 = 大門「來時的門廊」)
     */
    cubeDoor: {
      side: Side; kind: DoorKind; key?: ItemId; openText?: TextKey; frameText?: TextKey;
      /** v0.4 門牌：這扇門的門牌標籤 id (標籤掛在 2D 的 doorPlate 物件上)；貼著部件卡「日」= 「間」(規格「門牌「間」」) */
      plate?: string;
      /** v0.4 洞位：平常不在場；對面讀作「間」的門正對這一面時才接上 (兩邊都能穿過) */
      hole?: boolean;
      /** 門旁 (房內側) 的活字 (2-3c；文字 key；只在 3D 看得到) */
      glyph?: TextKey;
      /** 門上刻的圖 (折線，外觀；2-5 章門 = 老宅立面圖) */
      carving?: string;
    };
    /** 門牌 (只在 2D；label kind 'plate' 掛在這裡) */
    doorPlate: {};
  }
}

/** 方向字 → 滑動方向 (上 = 北 = 後牆方向) */
export const WORD_SIDE: Readonly<Record<LeverWord, Side>> = { up: 'N', down: 'S', left: 'W', right: 'E' };
export const LEVER_WORDS = Object.keys(WORD_SIDE) as readonly LeverWord[];
/** 方向字的顯示文字 key (上 / 下 / 左 / 右) */
export const WORD_KEYS: Readonly<Record<LeverWord, TextKey>> = { up: 'term.word.up', down: 'term.word.down', left: 'term.word.left', right: 'term.word.right' };

/** 門牌讀作「間」要貼的部件卡 */
export const PLATE_CARD: ItemId = 'card.ri';

/** 拉桿 → 轉動 (轉自己所在的房間) */
export const leverOp = (room: string, word: LeverWord): CubeOp => ({ t: 'slide', room, dir: WORD_SIDE[word] });

/** 章節所有房間的門位 (由各房 LevelDef 的 cubeDoor 物件整理；依房間、物件順序) */
export function chapterDoors(rooms: Readonly<Record<string, LevelDef>>): DoorInfo[] {
  const out: DoorInfo[] = [];
  for (const [room, level] of Object.entries(rooms)) {
    for (const o of level.objects) {
      if (o.type !== 'cubeDoor') continue;
      out.push({
        room, door: o.id, side: o.side, kind: o.kind,
        ...(o.plate ? { plate: { label: o.plate, card: PLATE_CARD } } : {}), ...(o.hole ? { hole: true } : {}), ...(o.glyph ? { glyph: o.glyph } : {})
      });
    }
  }
  return out;
}

/** 這扇門此刻的接法 (單房關卡沒有章節層 → 門後是牆) */
export const doorLink = (w: World, o: ObjState): DoorLinkState => w.ext.cube?.links[o.def.id] ?? { to: 'wall' };

/** 轉不動的原因 → 訊息 key (規格 5.4.1「轉不動」：說明原因) */
export const TURN_BLOCK_MSG: Readonly<Record<TurnBlock, TextKey>> = {
  notEmpty: 'msg.cube.notEmpty',
  outOfCube: 'msg.cube.outOfCube',
  doorway: 'msg.cube.doorway',
  noRoom: 'msg.cube.stuck',
  noCube: 'msg.cube.stuck',
  notHere: 'msg.cube.stuck'
};

/** 推不過拱門的原因 → 訊息 key */
export const TRANSFER_BLOCK_MSG: Readonly<Record<TransferBlock, TextKey>> = { notArch: 'msg.cube.doorOnly', occupied: 'msg.cube.archBlocked' };

/** 屋框：大門 / 來時的走廊 (門有 frameText) → 只提示；章門走廊 → 有鑰匙就打開 (本章通關)，沒有就鎖著 */
function frameDoor(w: World, o: ObjState, frame: string): void {
  const entry = o.def.type === 'cubeDoor' ? o.def.frameText : undefined;
  if (frame === 'porch' || entry) { say(w, entry ?? 'msg.cube.porch'); return; }
  const key = o.def.type === 'cubeDoor' ? o.def.key : undefined;
  if (key === undefined || !hasItem(w, key)) { say(w, 'msg.cube.chapterLocked'); return; }
  o.used = true;
  w.cleared = true;
  say(w, (o.def.type === 'cubeDoor' && o.def.openText) || 'msg.cube.chapterOpen');
}

/** 每個世界上一步壓在拱門上的可推物 (只在「推進去的那一刻」發事件 / 說明一次；不入快照，換房即重建) */
const inArch = new WeakMap<World, ReadonlySet<ObjId>>();

/**
 * 可推物被推進拱門 (箱子壓到拱門的門位上)：拱門對拱門 → objCross (外殼 → transferObject)；
 * 對面是門 → 只有人能過 (規格 5.4.1 型別取較窄者)；門後是牆 → 說明。都只在剛推進去時一次
 */
function archCrossing(w: World): void {
  const links = w.ext.cube?.links;
  if (!links) return;
  const prev = inArch.get(w);
  const now = new Set<ObjId>();
  for (const d of w.objs) {
    if (d.def.type !== 'cubeDoor' || d.def.kind !== 'arch' || d.gone) continue;
    const db = objBox(d);
    for (const o of w.objs) {
      if (!o.def.pushable || o.gone || !overlaps(objBox(o), db, '3d')) continue;
      now.add(o.def.id);
      if (prev?.has(o.def.id)) continue;
      const l = links[d.def.id];
      if (l?.to === 'room' && l.kind === 'arch') w.events.push({ t: 'objCross', obj: o.def.id, door: d.def.id });
      else say(w, l?.to === 'room' ? 'msg.cube.doorOnly' : 'msg.cube.archWall');
    }
  }
  inArch.set(w, now);
}

/**
 * N21 魔方機關：拉桿 (只在 3D、站穩) → emit turnRequest；魔方門 → 接通則 emit door (外殼換房)，
 * 門後是牆 / 屋框則說明 (無懲罰；章門有鑰匙 → 通關)；可推物推進拱門 → objCross。
 * 轉動、換房、跨房本身在 core/chapter (外殼呼叫)，機制只發事件
 */
export const cube: Mechanic = {
  id: 'cube',
  types: {
    lever: { verbKey: 'obj.lever.verb', interact: (w, o) => { w.events.push({ t: 'turnRequest', lever: o.def.id }); } },
    cubeDoor: {
      verbKey: 'obj.cubeDoor.verb',
      interact: (w, o) => {
        if (o.def.type === 'cubeDoor' && o.def.hole) { if (doorLink(w, o).to === 'room') w.events.push({ t: 'door', door: o.def.id }); return; }
        const l = doorLink(w, o);
        if (l.to === 'room') w.events.push({ t: 'door', door: o.def.id });
        else if (l.to === 'frame') frameDoor(w, o, l.frame);
        else say(w, 'msg.cube.wall');
      }
    },
    doorPlate: {}
  },
  afterPhysics: archCrossing,
  // 洞位：對面的「間」接上時才在場
  hidden: (w, o) => o.def.type === 'cubeDoor' && !!o.def.hole && doorLink(w, o).to !== 'room'
};
