// 世界事件 → 章節層 (純邏輯，Node 可測；LevelSession 依結果播過場、重建場景、寫存檔)
import type { GameEvent } from '../core/types';
import type { WorldOptions } from '../core/world';
import { say } from '../core/world';
import type { Side } from '../core/cube';
import { enterRoom, turn, type ChapterSession } from '../core/chapter';
import { doorLink, leverOp, TURN_BLOCK_MSG } from '../mechanics/cube';

export type ChapterStep =
  | { kind: 'none' }
  /** 轉不動：已在當前世界說明原因 */
  | { kind: 'blocked' }
  /** 轉動成功：cs 已更新 (World 不變，只有連接表)；dir = 房間滑動方向 (過場用) */
  | { kind: 'turn'; cs: ChapterSession; dir: Side }
  /** 換房：next = 目標房間已建好的 session (外殼在過場換畫面點切過去) */
  | { kind: 'enter'; next: ChapterSession };

/** 處理一個事件：door → enterRoom；turnRequest → 拉桿方向字 → turn (轉不動 → say 原因) */
export function applyChapterEvent(cs: ChapterSession, e: GameEvent, opts: WorldOptions): ChapterStep {
  const w = cs.world;
  if (e.t === 'door') {
    const o = w.byId.get(e.door);
    const l = o && doorLink(w, o);
    if (!l || l.to !== 'room') return { kind: 'none' };
    return { kind: 'enter', next: enterRoom(cs, l.room, l.door, opts) };
  }
  if (e.t === 'turnRequest') {
    const o = w.byId.get(e.lever);
    if (!o || o.def.type !== 'lever') return { kind: 'none' };
    const op = leverOp(cs.state.room, o.def.word);
    const r = turn(cs, op);
    if ('blocked' in r) { say(w, TURN_BLOCK_MSG[r.blocked]); return { kind: 'blocked' }; }
    return { kind: 'turn', cs: r, dir: op.dir };
  }
  return { kind: 'none' };
}
