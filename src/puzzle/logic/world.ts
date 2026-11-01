import type { LevelDef, ObjState, World } from './types';

export function createWorld(level: LevelDef): World {
  const objs: ObjState[] = level.objects.map(def => ({ def, x: def.x, y: def.y, z: def.z, gone: false, used: false }));
  return {
    level, objs,
    byId: new Map(objs.map(o => [o.def.id, o])),
    player: { x: level.start.x, y: level.start.y, z: level.start.z, vy: 0, onGround: false, mode: '3d', z3d: level.start.z, facing: 0 },
    hasKey: false, sealed: true, cleared: false, msg: '', msgSeq: 0, time: 0
  };
}

export function say(w: World, text: string): void {
  w.msg = text;
  w.msgSeq++;
}

/** 回到房間起點 (保留目前模式) */
export function respawn(w: World, text: string): void {
  const p = w.player;
  const s = w.level.start;
  p.x = s.x; p.y = s.y; p.vy = 0; p.onGround = false;
  p.z3d = s.z;
  p.z = p.mode === '3d' ? s.z : 0;
  say(w, text);
}
