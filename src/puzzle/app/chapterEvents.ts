// 世界事件 → 章節層 (純邏輯，Node 可測；LevelSession 依結果播過場、重建場景、寫存檔)
import type { GameEvent } from '../core/types';
import type { WorldOptions } from '../core/world';
import { say } from '../core/world';
import type { Side } from '../core/cube';
import { activateDial, clearUndo, doneFlags, doorArrival, enterRoom, isDialChapter, noteFlag, refreshUnlocks, syncLinks, transferObject, turn, turnBudgetFor, type ChapterSession } from '../core/chapter';
import { doorLink, leverOp, TRANSFER_BLOCK_MSG, TURN_BLOCK_MSG } from '../mechanics/cube';
import { leverWord } from '../mechanics/labels';
import { pressOnLanding } from '../mechanics/cellar';

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
 * v0.4 3-4b：本房 turnBudget.refillOn 列的題完成的那一刻 → 墨補滿到此刻的預算 (回退堆疊已由 clearUndo 清空)；
 * refillText 接在當下的訊息 (那一題的 solvedText) 後面說
 */
function refill(cs: ChapterSession, flag: string): ChapterSession {
  const tb = cs.spec.rooms[cs.state.room]?.turnBudget;
  if (!isDialChapter(cs.spec) || !tb?.refillOn?.includes(flag)) return cs;
  if (tb.refillText) say(cs.world, tb.refillText, { msg: cs.world.msg });
  return { ...cs, state: { ...cs.state, turns: { left: turnBudgetFor(cs.spec, cs.state, cs.world), undo: [] } } };
}

/**
 * 處理一個事件：door → 到達處空著 (v0.4 H1 doorArrival；被占 → say、blocked) → enterRoom；turnRequest → 拉桿此刻的方向字 (標籤上的詞卡優先) → turn (轉不動 → say 原因)；
 * objCross → transferObject (推不過去 → say 原因)；flag → 記下章節旗標；
 * v0.4：dialActivate → activateDial (本章是控制盤章、還沒啟動時)；done → 回退堆疊清空、解開條件成立的鎖扣寫回
 */
export function applyChapterEvent(cs: ChapterSession, e: GameEvent, opts: WorldOptions): ChapterStep {
  const w = cs.world;
  if (e.t === 'door') {
    const o = w.byId.get(e.door);
    const l = o && doorLink(w, o);
    if (!l || l.to !== 'room') return { kind: 'none' };
    // v0.4 第四章 封住的門 (墨線鎖 / 收起來的折疊梯)：旗標還沒成立 → 說明、不換房
    if (o.def.type === 'cubeDoor' && o.def.sealed && !doneFlags(cs.spec, cs.state, w).has(o.def.sealed.until)) { say(w, o.def.sealed.text); return { kind: 'blocked' }; }
    // v0.4 H1：到達處被實體占住 (例：夾層的書櫃堵住洞) → 在這一房說那個實體的話、不換房
    const blocked = doorArrival(cs, e.door);
    if (blocked) { say(w, blocked.blockText ?? 'msg.cube.doorBlocked'); return { kind: 'blocked' }; }
    // v0.4 第四章 第一次穿過這扇門 (4-1a 的地板梯口)：閂住 (doneFlag) 並在到達的房間說 passText
    const first = o.def.type === 'cubeDoor' && !!o.def.doneFlag && !o.used;
    if (first) o.used = true;
    const next = enterRoom(cs, l.room, l.door, opts);
    if (first && o.def.type === 'cubeDoor' && o.def.passText) say(next.world, o.def.passText);
    return { kind: 'enter', next };
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
    const src = w.byId.get(e.door);
    say(w, src?.def.type === 'cubeDoor' && src.def.side === 'D' ? 'msg.cube.dropped' : 'msg.cube.crossed');
    // v0.4 第四章 4-1c：落進別的房間就壓住那裡的根結踏板 → 鎖扣立刻解開 (不必等人走進去)
    const landed = pressOnLanding(r, e.obj);
    return { kind: 'state', cs: landed.flag ? refreshUnlocks(landed.cs).cs : r };
  }
  if (e.t === 'flag') return { kind: 'state', cs: noteFlag(cs, e.flag) };
  if (e.t === 'dialActivate') {
    if (!isDialChapter(cs.spec) || cs.state.dial || e.chapter !== cs.spec.chapter) return { kind: 'none' };
    // 啟動訊息 = 魔方儀物件的 useText (第三章：「九個花盆格，空了兩格。」)；沒有 = 通用說明 (第二章)
    const entry = cs.spec.cube?.dial?.entry;
    say(w, (entry && w.byId.get(entry.obj)?.def.useText) ?? 'msg.dial.activated');
    return { kind: 'dial', cs: activateDial(cs) };
  }
  if (e.t === 'done') return { kind: 'state', cs: refill(refreshUnlocks(clearUndo(cs, [e])).cs, e.flag) };
  // 貼卡 / 取卡 (門牌貼上「日」= 「間」)：重算當前房間的門接法 (World 只更新 ext)
  if (e.t === 'card' && e.ok && cs.spec.cube) return { kind: 'state', cs: syncLinks(cs) };
  return { kind: 'none' };
}
