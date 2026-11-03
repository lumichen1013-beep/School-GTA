// 世界事件 → 章節層 (純邏輯，Node 可測；LevelSession 依結果播過場、重建場景、寫存檔)
import type { GameEvent } from '../core/types';
import type { WorldOptions } from '../core/world';
import { say } from '../core/world';
import type { Side } from '../core/cube';
import { activateDial, clearUndo, enterRoom, isDialChapter, noteFlag, refreshUnlocks, syncLinks, transferObject, turn, type ChapterSession } from '../core/chapter';
import { doorLink, leverOp, TRANSFER_BLOCK_MSG, TURN_BLOCK_MSG } from '../mechanics/cube';
import { leverWord } from '../mechanics/labels';

export type ChapterStep =
  | { kind: 'none' }
  /** 轉不動：已在當前世界說明原因 */
  | { kind: 'blocked' }
  /** 轉動成功：cs 已更新 (World 不變，只有連接表)；dir = 房間滑動方向 (過場用) */
  | { kind: 'turn'; cs: ChapterSession; dir: Side }
  /** 換房：next = 目標房間已建好的 session (外殼在過場換畫面點切過去) */
  | { kind: 'enter'; next: ChapterSession }
  /** 章節狀態更新但 World 照舊 (可推物推過拱門、記下旗標、謎題完成 → 解開鎖扣)；外殼寫存檔 */
  | { kind: 'state'; cs: ChapterSession }
  /** 魔方儀剛啟動 (v0.4)：外殼寫存檔，並在下一次能進轉動模式時自動打開展開圖的轉動模式 (規格 5.4.2) */
  | { kind: 'dial'; cs: ChapterSession };

/**
 * 處理一個事件：door → enterRoom；turnRequest → 拉桿此刻的方向字 (標籤上的詞卡優先) → turn (轉不動 → say 原因)；
 * objCross → transferObject (推不過去 → say 原因)；flag → 記下章節旗標；
 * v0.4：dialActivate → activateDial (本章是控制盤章、還沒啟動時)；done → 回退堆疊清空、解開條件成立的鎖扣寫回
 */
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
    const op = leverOp(cs.state.room, leverWord(w, o));
    const r = turn(cs, op);
    if ('blocked' in r) { say(w, TURN_BLOCK_MSG[r.blocked]); return { kind: 'blocked' }; }
    return { kind: 'turn', cs: r, dir: op.dir };
  }
  if (e.t === 'objCross') {
    const r = transferObject(cs, e.obj, e.door, opts);
    if ('blocked' in r) { say(w, TRANSFER_BLOCK_MSG[r.blocked]); return { kind: 'blocked' }; }
    say(w, 'msg.cube.crossed');
    return { kind: 'state', cs: r };
  }
  if (e.t === 'flag') return { kind: 'state', cs: noteFlag(cs, e.flag) };
  if (e.t === 'dialActivate') {
    if (!isDialChapter(cs.spec) || cs.state.dial || e.chapter !== cs.spec.chapter) return { kind: 'none' };
    // 啟動訊息 = 魔方儀物件的 useText (第三章：「九個花盆格，空了兩格。」)；沒有 = 通用說明 (第二章)
    const entry = cs.spec.cube?.dial?.entry;
    say(w, (entry && w.byId.get(entry.obj)?.def.useText) ?? 'msg.dial.activated');
    return { kind: 'dial', cs: activateDial(cs) };
  }
  if (e.t === 'done') return { kind: 'state', cs: refreshUnlocks(clearUndo(cs, [e])).cs };
  // 貼卡 / 取卡 (門牌貼上「日」= 「間」)：重算當前房間的門接法 (World 只更新 ext)
  if (e.t === 'card' && e.ok && cs.spec.cube) return { kind: 'state', cs: syncLinks(cs) };
  return { kind: 'none' };
}
