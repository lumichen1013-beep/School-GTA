// 第四章 地下室的機制 (規格 6「4-1 根窖走廊（細化）」)：
// - 拉繩 (foldCord)：只在藏寶圖按得到 (高 2.6 m：要站上只畫在圖上的台階)；拉下 = used + done (折疊梯放下；書庫天花板梯口的 sealed 以它的 doneFlag 解開)
// - 只畫在圖上的台階 (inkStep)：純實體 (presence 由 visible '2d' 決定)，沒有互動
// - 根結踏板 (rootPlate)：可推物壓上 (3D 盒子 x-z 重疊、底面貼著板面) → used + done + solvedText (閂住)；
//   木箱從上一層的地板梯口落下來的那一刻由章節層判定 (pressOnLanding：踏板在玩家不在的房間，不必等人走進去)
import type { Mechanic } from '../core/registry';
import type { ObjDef, ObjId, TextKey, World } from '../core/types';
import { say } from '../core/world';
import { objBox } from '../core/geometry';
import { roomObjects, type ChapterSession } from '../core/chapter';

declare module '../core/types' {
  interface ObjKinds {
    /** 拉繩：useText = 拉下時的訊息；usedText = 已經拉下再按的訊息 */
    foldCord: { usedText?: TextKey };
    /** 只畫在圖上的台階 (2D 實體；visible '2d') */
    inkStep: {};
    /** 根結踏板：solvedText = 壓下時的訊息 */
    rootPlate: { solvedText: TextKey };
  }
}

/** 物件 (定義 + 位置) 的盒子是否壓在踏板上：x-z 有重疊、底面離板面 < 0.15 */
function onPlate(plate: { x: number; y: number; z: number; w: number; h: number; d: number }, o: { x: number; y: number; z: number; w: number; d: number }): boolean {
  const ox = Math.abs(o.x - plate.x) < (o.w + plate.w) / 2 - 0.05;
  const oz = Math.abs(o.z - plate.z) < (o.d + plate.d) / 2 - 0.05;
  return ox && oz && Math.abs(o.y - plate.y) < 0.15;
}

function pressPlates(w: World): void {
  for (const plate of w.objs) {
    if (plate.def.type !== 'rootPlate' || plate.used || plate.gone) continue;
    const pb = objBox(plate);
    const box = { x: plate.x, y: plate.y, z: plate.z, w: pb.max[0] - pb.min[0], h: 0, d: pb.max[2] - pb.min[2] };
    if (!w.objs.some(c => c.def.pushable && !c.gone && onPlate(box, { x: c.x, y: c.y, z: c.z, w: c.def.w, d: c.def.d }))) continue;
    plate.used = true;
    say(w, plate.def.solvedText);
    if (plate.def.doneFlag) w.events.push({ t: 'done', flag: plate.def.doneFlag });
  }
}

/**
 * 木箱剛從地板梯口落進別的房間 (core/chapter transferObject 已把它寫進那間房的快照)：那間房的根結踏板若被它壓住 → 快照裡的踏板 used、
 * 在當前房說踏板的 solvedText；回傳新的 session 與成立的旗標 (沒有 = null)。外殼隨後 refreshUnlocks (4-1c → 下層的根結鬆開)
 */
export function pressOnLanding(cs: ChapterSession, obj: ObjId): { cs: ChapterSession; flag: string | null } {
  const m = cs.state.moved[obj];
  const room = m?.room;
  if (!room || room === cs.state.room) return { cs, flag: null };
  const defs = roomObjects(cs.spec, cs.state, room);
  const box = defs.find(d => d.id === obj);
  if (!box) return { cs, flag: null };
  const snap = cs.state.rooms[room] ?? { objs: [], flags: [] };
  const plate = defs.find((d): d is ObjDef & { type: 'rootPlate' } => d.type === 'rootPlate' && !snap.objs.some(s => s.id === d.id && s.used)
    && onPlate(d, { x: m.x, y: m.y, z: m.z, w: box.w, d: box.d }));
  if (!plate) return { cs, flag: null };
  const prev = snap.objs.find(s => s.id === plate.id);
  const objs = [...snap.objs.filter(s => s.id !== plate.id), { id: plate.id, x: plate.x, y: plate.y, z: plate.z, gone: false, touched: prev?.touched ?? false, ...prev, used: true }];
  say(cs.world, plate.solvedText);
  return { cs: { ...cs, state: { ...cs.state, rooms: { ...cs.state.rooms, [room]: { ...snap, objs } } } }, flag: plate.doneFlag ?? null };
}

export const cellar: Mechanic = {
  id: 'cellar',
  types: {
    foldCord: {
      verbKey: 'obj.foldCord.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'foldCord') return;
        if (o.used) { say(w, o.def.usedText ?? 'msg.cellar.cordUsed'); return; }
        o.used = true;
        say(w, o.def.useText ?? 'msg.cellar.cord');
        if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      }
    },
    inkStep: {},
    rootPlate: {}
  },
  afterPhysics: pressPlates
};
