// N19 追逐 (守衛殘影；規格 4.2、6「3-4 溫室深處（細化）」追逐 1；architecture 4.14)：確定性邏輯，殘影的外觀在 render/models/chaser
// - chaser：關卡物件 (derived：不進房間快照)，visible '2d'、不擋路、不可互動。狀態機 (World 本地；R / 換房 = 新的 World、重新算)：
//   idle →(柵門開著、玩家過 omenX)→ omen (殘影出現在 spawnX、事件 omen) →(玩家過 triggerX 且預兆滿 omenSec)→ run (事件 start)
//   run：位置 = spawnX + 速度 × 起跑後的模擬時間 (固定步長累加的 World.time；不讀亂數與時鐘)、不超過 endX；
//        玩家在 2D 且 x-y 盒重疊 → 被追上：回 checkpoint (位置歸位、速度清零、視角不變)、caughtText、計數 +1、殘影消失、事件 caught →
//        wait (再過一次 triggerX 就重新起跑，不再等預兆)；被追上 assistAfter 次之後速度 × assistFactor
//   任何非 idle 狀態：玩家走回 resetX 之前 → idle (殘影消失、事件 reset；計數保留)；玩家過 endX → done (章節旗標 flag + 事件 end)
//   Runtime.calm (減弱緊張效果)：殘影不生成；柵門開著、玩家過 omenX → done (旗標 + 事件 autoPass)
//   章節旗標 flag 已在 (World.ext.flags；通過過了、R 不重演) → 一開始就是 done
// - used = 殘影此刻在場 (omen / run；render 依此淡入淡出)
import type { Mechanic } from '../core/registry';
import type { ChasePhase, ObjId, ObjState, TextKey, World } from '../core/types';
import { boxAt, objBox, overlaps } from '../core/geometry';
import { isPassable } from '../core/presence';
import { say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /**
     * 守衛殘影：omenX / triggerX / endX / resetX = 預兆線 / 觸發線 / 終點線 / 走回主室的線；spawnX = 出生點 (= 被追上後重置的位置)；
     * checkpoint = 被追上時玩家回到的位置；speed = 速度；assistAfter 次被追上之後 × assistFactor；omenSec = 預兆至少幾秒；
     * gate = 長廊柵門 (此刻擋路 = 不追)；flag = 完成旗標 (章節旗標，R 不重演)；caughtText = 被追上的訊息
     */
    chaser: {
      omenX: number; triggerX: number; endX: number; resetX: number; spawnX: number;
      checkpoint: { x: number; y: number; z: number };
      speed: number; assistAfter: number; assistFactor: number; omenSec: number;
      gate: ObjId; flag: string; caughtText: TextKey;
    };
  }
}

type Phase = 'idle' | 'omen' | 'wait' | 'run' | 'done';
/** 一段追逐的狀態 (World 本地) */
export interface ChaseRun { phase: Phase; omenAt: number; startAt: number; caught: number }

const runs = new WeakMap<ObjState, ChaseRun>();

/** 殘影此刻的狀態 (測試 / 開發期自動化用；沒有 = idle) */
export const chaseRun = (o: ObjState): Readonly<ChaseRun> => runs.get(o) ?? { phase: 'idle', omenAt: 0, startAt: 0, caught: 0 };

/** 此刻的速度 (被追上 assistAfter 次之後減速) */
export function chaserSpeed(o: ObjState): number {
  if (o.def.type !== 'chaser') return 0;
  const r = chaseRun(o);
  return o.def.speed * (r.caught >= o.def.assistAfter ? o.def.assistFactor : 1);
}

const emit = (w: World, o: ObjState, s: ChasePhase): void => {
  if (o.def.type === 'chaser') w.events.push({ t: 'chase', id: o.def.flag, s });
};

function finish(w: World, o: ObjState, r: ChaseRun, s: 'end' | 'autoPass'): void {
  if (o.def.type !== 'chaser') return;
  r.phase = 'done';
  o.used = false;
  w.events.push({ t: 'flag', flag: o.def.flag });
  emit(w, o, s);
}

function update(w: World): void {
  for (const o of w.objs) {
    if (o.def.type !== 'chaser') continue;
    const d = o.def;
    let r = runs.get(o);
    if (!r) { r = { phase: 'idle', omenAt: 0, startAt: 0, caught: 0 }; runs.set(o, r); }
    if (r.phase !== 'done' && w.ext.flags?.includes(d.flag)) { r.phase = 'done'; o.used = false; }
    if (r.phase === 'done') continue;
    const gate = w.byId.get(d.gate);
    if (gate && !isPassable(w, gate)) continue;
    const p = w.player;
    if (w.rt.calm) { if (p.x >= d.omenX) finish(w, o, r, 'autoPass'); continue; }
    if (r.phase !== 'idle' && p.x < d.resetX) {
      r.phase = 'idle'; o.used = false; o.x = d.spawnX;
      emit(w, o, 'reset');
      continue;
    }
    if (r.phase === 'idle' && p.x >= d.omenX) {
      r.phase = 'omen'; r.omenAt = w.time; o.used = true; o.x = d.spawnX;
      emit(w, o, 'omen');
    }
    if ((r.phase === 'wait' || (r.phase === 'omen' && w.time - r.omenAt >= d.omenSec - 1e-9)) && p.x >= d.triggerX) {
      r.phase = 'run'; r.startAt = w.time; o.used = true; o.x = d.spawnX;
      emit(w, o, 'start');
    }
    if (r.phase === 'run') {
      o.x = Math.min(d.spawnX + chaserSpeed(o) * (w.time - r.startAt), d.endX);
      if (p.mode === '2d' && overlaps(boxAt(p.x, p.y, p.z), objBox(o), '2d')) {
        r.caught++;
        r.phase = 'wait'; o.used = false; o.x = d.spawnX;
        p.x = d.checkpoint.x; p.y = d.checkpoint.y; p.vy = 0; p.onGround = false;
        p.z3d = d.checkpoint.z;
        p.z = p.mode === '2d' ? 0 : d.checkpoint.z;
        say(w, d.caughtText);
        emit(w, o, 'caught');
        continue;
      }
    }
    if (r.phase !== 'idle' && p.x >= d.endX) finish(w, o, r, 'end');
  }
}

export const chase: Mechanic = {
  id: 'chase',
  types: { chaser: {} },
  afterPhysics: update
};
