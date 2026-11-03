import type { Mechanic } from '../core/registry';
import type { DoorLinkState, LevelDef, ObjState, TextKey, World } from '../core/types';
import type { CubeOp, DoorInfo, DoorKind, Side } from '../core/cube';
import type { TurnBlock } from '../core/chapter';
import { say } from '../core/world';

/** 拉桿的方向字 (內部 id；顯示字「上 / 下 / 左 / 右」在文字表 term.word.*) */
export type LeverWord = 'up' | 'down' | 'left' | 'right';

declare module '../core/types' {
  interface ObjKinds {
    /** 拉桿 (N21)：3D 拉下 → 依方向字把自己所在的房間滑一格 (規格 5.4.1「轉自己」) */
    lever: { word: LeverWord };
    /** 魔方門位 (N21)：side = 本地門位、kind = 門 / 拱門 / 章門；此刻接到哪由章節層寫入 World.ext.cube */
    cubeDoor: { side: Side; kind: DoorKind };
  }
}

/** 方向字 → 滑動方向 (上 = 北 = 後牆方向) */
export const WORD_SIDE: Readonly<Record<LeverWord, Side>> = { up: 'N', down: 'S', left: 'W', right: 'E' };
export const LEVER_WORDS = Object.keys(WORD_SIDE) as readonly LeverWord[];

/** 拉桿 → 轉動 (轉自己所在的房間) */
export const leverOp = (room: string, word: LeverWord): CubeOp => ({ t: 'slide', room, dir: WORD_SIDE[word] });

/** 章節所有房間的門位 (由各房 LevelDef 的 cubeDoor 物件整理；依房間、物件順序) */
export function chapterDoors(rooms: Readonly<Record<string, LevelDef>>): DoorInfo[] {
  const out: DoorInfo[] = [];
  for (const [room, level] of Object.entries(rooms)) {
    for (const o of level.objects) if (o.type === 'cubeDoor') out.push({ room, door: o.id, side: o.side, kind: o.kind });
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

/** 屋框 → 訊息 (大門通回門廊；章門走廊要鑰匙，C8 前一律鎖著) */
const frameMsg = (frame: string): TextKey => (frame === 'porch' ? 'msg.cube.porch' : 'msg.cube.chapterLocked');

/**
 * N21 魔方機關：拉桿 (只在 3D、站穩) → emit turnRequest；魔方門 → 接通則 emit door (外殼換房)，
 * 門後是牆 / 屋框則說明 (無懲罰)。轉動與換房本身在 core/chapter (外殼呼叫)，機制只發事件
 */
export const cube: Mechanic = {
  id: 'cube',
  types: {
    lever: { verbKey: 'obj.lever.verb', interact: (w, o) => { w.events.push({ t: 'turnRequest', lever: o.def.id }); } },
    cubeDoor: {
      verbKey: 'obj.cubeDoor.verb',
      interact: (w, o) => {
        const l = doorLink(w, o);
        if (l.to === 'room') w.events.push({ t: 'door', door: o.def.id });
        else if (l.to === 'frame') say(w, frameMsg(l.frame));
        else say(w, 'msg.cube.wall');
      }
    }
  }
};
