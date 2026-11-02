import type { LevelDef, ObjState, World } from './types';

export function createWorld(level: LevelDef): World {
  const objs: ObjState[] = level.objects.map(def => ({ def, x: def.x, y: def.y, z: def.z, gone: false, used: false, touched: false }));
  return {
    level, objs,
    byId: new Map(objs.map(o => [o.def.id, o])),
    player: { x: level.start.x, y: level.start.y, z: level.start.z, vy: 0, onGround: false, mode: '3d', z3d: level.start.z, facing: 0 },
    checkpoint: -1,
    hasKey: false, sealed: true, cleared: false, msg: '', msgSeq: 0, time: 0
  };
}

export function say(w: World, text: string): void {
  w.msg = text;
  w.msgSeq++;
}

/** 目前的重生點 (起點或最後抵達的檢查點) */
export function spawnPoint(w: World): { x: number; y: number; z: number } {
  return w.checkpoint >= 0 ? w.level.checkpoints![w.checkpoint] : w.level.start;
}

/** 回到重生點 (保留目前模式) */
export function respawn(w: World, text: string): void {
  const p = w.player;
  const s = spawnPoint(w);
  p.x = s.x; p.y = s.y; p.vy = 0; p.onGround = false;
  p.z3d = s.z;
  p.z = p.mode === '3d' ? s.z : 0;
  say(w, text);
}

/** 站在地面上越過檢查點門檻就推進重生點 (只會往前) */
export function updateCheckpoint(w: World): void {
  const cps = w.level.checkpoints;
  const p = w.player;
  if (!cps || !p.onGround) return;
  for (let i = cps.length - 1; i > w.checkpoint; i--) {
    if (p.x >= cps[i].minX) { w.checkpoint = i; return; }
  }
}
