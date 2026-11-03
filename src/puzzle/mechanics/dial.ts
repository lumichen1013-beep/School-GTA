// N32 控制盤的入口 (v0.4；architecture 4.16.1、規格 5.4.1「魔方儀與控制盤」)：
// 魔方儀 (dial) = 各章一座的世界物件，3D 站穩按 E 啟動 → dialActivate 事件 (外殼 → core/chapter.activateDial)；已啟動再按 → 說明。
// 鎖扣開關 (latch) = 一次性的開關：3D 按 E → used，物件的 doneFlag 成立 → done 事件 (外殼 → 解開鎖扣、清空回退堆疊；R 會還原)。
// 轉動本身是章節層指令 (ChapterCommand)，不經過這裡；這裡只提供「能不能進轉動模式」的查詢
import type { Mechanic } from '../core/registry';
import type { TextKey, World } from '../core/types';
import type { DialBlock } from '../core/chapter';
import { say } from '../core/world';

declare module '../core/types' {
  interface ObjKinds {
    /** 魔方儀 (黃銅魔方儀、園丁羅盤…)：chapter = 啟動哪一章的控制盤 */
    dial: { chapter: number };
    /** 鎖扣開關 (一次性)：拉下 = used；doneFlag 給解開條件 (useText = 拉下時的訊息) */
    latch: {};
  }
}

/** 進不了轉動模式的原因：不在藏寶圖、沒站穩、本章魔方儀沒啟動 (或本章不是控制盤章)、有其他疊層開著 (字卡匣、過場) */
export type TurnModeDeny = 'not2d' | 'air' | 'noDial' | 'overlay';

/** 轉動模式的進入條件 (規格 5.4.1：只在 2D、站穩；已啟動；字卡匣沒開、不在過場鎖)；回傳第一個不成立的條件 */
export function turnModeDenied(w: World, overlay = false): TurnModeDeny | null {
  if (!w.ext.dial?.active) return 'noDial';
  if (overlay) return 'overlay';
  if (w.player.mode !== '2d') return 'not2d';
  if (!w.player.onGround) return 'air';
  return null;
}
export const canEnterTurnMode = (w: World, overlay = false): boolean => turnModeDenied(w, overlay) === null;

export const TURN_MODE_DENY_MSG: Readonly<Record<TurnModeDeny, TextKey>> = {
  noDial: 'msg.dial.noDial', overlay: 'msg.dial.notNow', not2d: 'msg.dial.only2d', air: 'msg.dial.notNow'
};

/** 控制盤轉不動 / 退不回的原因 → 訊息 (規格 5.4.1：「這一排鎖著。」「軌道卡住了。」「墨乾了。」「門口有東西卡著。」) */
export const DIAL_BLOCK_MSG: Readonly<Record<DialBlock, TextKey>> = {
  noCube: 'msg.cube.stuck', noDial: 'msg.dial.noDial', noGroup: 'msg.cube.stuck', noRoom: 'msg.cube.stuck',
  locked: 'msg.dial.locked', jammed: 'msg.dial.jammed', doorway: 'msg.dial.doorway', noInk: 'msg.dial.noInk',
  notEmpty: 'msg.dial.notEmpty', outOfCube: 'msg.dial.outOfCube', nothingToUndo: 'msg.dial.nothingToUndo'
};

export const dial: Mechanic = {
  id: 'dial',
  types: {
    dial: {
      verbKey: 'obj.dial.verb',
      interact: (w, o) => {
        if (o.def.type !== 'dial') return;
        if (w.ext.dial?.active) { say(w, 'msg.dial.ready'); return; }
        w.events.push({ t: 'dialActivate', chapter: o.def.chapter });
      }
    },
    latch: {
      verbKey: 'obj.latch.verb',
      interact: (w, o) => {
        o.used = true;
        say(w, o.def.useText ?? 'msg.dial.latch');
        if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      }
    }
  }
};
