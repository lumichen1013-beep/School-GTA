// v0.4 第五章 5-1 天窗間 (規格 6「5-1 天窗間（細化）」「第五章共用規則」縮影)：桌上的縮影 (P10)、玩家自己的標籤「你」、縮影裡的卡榫齒輪、觀星儀的刻度盤
// - selfTag：玩家自己的名詞標籤「你」(label.self；只收「小」)；每步跟著玩家 (只在藏寶圖)。貼著「小」→ Player.scale = 0.4 (外觀 / 碰撞 / 跳躍照比例)
// - miniCube：工作桌上的縮影 (實體，可以站在上面)。3D 按 E：原尺寸 = 看 (側門太窄)；縮小 = 鑽進去 (站到縮影頂上)；在縮影裡 = 鑽出來 (落在桌前)。
//   World.ext.mini = 縮小、站在縮影上 (core/chapter：轉動模式只列縮影的頂 / 底)。used = 縮影的底層轉過一次 (5-1b；DialDef.marks)
// - miniGear：卡在縮影底層軌道上的真齒輪 (名詞標籤「齒輪」，只收「小」；stayShrunk + pushTo)。貼上「小」的那一刻 → used (閂住：掉出軌道、
//   之後取下「小」也不回去)、freedText、doneFlag (解開 DialDef.jams 的 SB)
// - starScale：觀星儀底座的刻度盤 (5-1a)。align = 星圖對上刻度的排列：天窗間在 at、朝向 rot，home 的房都在原位原朝向 (ext.cube.layout / rots)；
//   成立的那一刻 → used、alignedText、doneFlag；3D 按 E = 此刻的樣子 (天窗朝別處 / 差一點 / 星圖對了但樓梯與三扇窗不在刻度上 / 完成)
import type { Mechanic } from '../core/registry';
import type { ObjState, TextKey, World } from '../core/types';
import { solidsFor } from '../core/presence';
import { boxAt, objBox, overlaps } from '../core/geometry';
import { say } from '../core/world';
import { resolvePlayerOverlap } from '../core/place';
import { scaleCardOn } from './scale';

declare module '../core/types' {
  interface ObjKinds {
    /** 玩家自己的標籤「你」(跟著玩家；label.self) */
    selfTag: {};
    /** 工作桌 (實體；縮影與齒輪放在桌面上) */
    workbench: {};
    /** 縮影：lookText = 原尺寸按 E、enterText = 縮小鑽進去、exitText = 鑽出來；exit = 鑽出來落在 [x, z] */
    miniCube: { lookText: TextKey; enterText: TextKey; exitText: TextKey; exit: readonly [number, number] };
    /** 卡在縮影底層的齒輪：jamText / doneText = 3D 按 E (卡著 / 已掉出軌道)、freedText = 量成「小」的那一刻 */
    miniGear: { jamText: TextKey; freedText: TextKey; doneText: TextKey };
    /**
     * 觀星儀的刻度盤：align = 星圖對上刻度的排列 (room 在 at、朝向 rot；home 的每間房在原位 [x, y, z]、朝向 0)；
     * awayText / offText / nearText / doneText = 3D 按 E；alignedText = 對上的那一刻
     */
    starScale: {
      align: { room: string; at: readonly [number, number, number]; rot: number; home: Readonly<Record<string, readonly [number, number, number]>> };
      awayText: TextKey; offText: TextKey; nearText: TextKey; doneText: TextKey; alignedText: TextKey;
    };
  }
}

/** 縮小的倍率 (規格「第五章共用規則」縮影：外觀與碰撞箱 × 0.4) */
export const SELF_SCALE = 0.4;

/** 標籤「你」此刻貼著「小」 */
const selfSmall = (w: World): boolean => w.objs.some(o => o.def.type === 'selfTag' && scaleCardOn(o.def, w.ext.labels) === 'card.xiao');

/** 人此刻在縮影裡：縮小、雙腳站在縮影上 */
function onMini(w: World): boolean {
  const p = w.player;
  if ((p.scale ?? 1) >= 1 || !p.onGround) return false;
  return w.objs.some(o => o.def.type === 'miniCube' && !o.gone && Math.abs(objBox(o).max[1] - p.y) < 0.02 && overlaps(boxAt(p.x, p.y - 0.05, p.z, p.scale ?? 1), objBox(o), p.mode));
}

/** 取下自己的「小」此刻長得回去 (不在縮影裡、長回原尺寸不撞到東西) */
export function selfGrowOk(w: World): boolean {
  if (w.ext.mini) return false;
  const p = w.player;
  const box = boxAt(p.x, p.y, p.mode === '2d' ? p.z3d : p.z);
  return !solidsFor(w, '3d').some(s => overlaps(objBox(s), box, '3d')) && !solidsFor(w, '2d').some(s => overlaps(objBox(s), boxAt(p.x, p.y, p.z), '2d'));
}

/** 星圖此刻對上刻度 (align)：'away' = 那間房不在 at、'off' = 朝向不對、'near' = 朝向對了但 home 有房不在原位原朝向、'done' */
export function alignState(w: World, o: ObjState): 'away' | 'off' | 'near' | 'done' {
  if (o.def.type !== 'starScale') return 'away';
  const a = o.def.align;
  const layout = w.ext.cube?.layout ?? {};
  const rots = w.ext.cube?.rots ?? {};
  const same = (c: readonly number[] | undefined, d: readonly number[]) => !!c && c[0] === d[0] && c[1] === d[1] && c[2] === d[2];
  if (!same(layout[a.room], a.at)) return 'away';
  if ((rots[a.room] ?? 0) !== a.rot) return 'off';
  return Object.entries(a.home).every(([r, c]) => same(layout[r], c) && (rots[r] ?? 0) === 0) ? 'done' : 'near';
}

const ALIGN_TEXT = { away: 'awayText', off: 'offText', near: 'nearText', done: 'doneText' } as const;

export const attic: Mechanic = {
  id: 'attic',
  types: {
    selfTag: {},
    workbench: {},
    miniCube: {
      verbKey: 'obj.miniCube.verb',
      usableWhenUsed: true,
      interact: (w, o) => {
        if (o.def.type !== 'miniCube') return;
        const p = w.player;
        if (w.ext.mini) {
          // 鑽出來：落在桌前 (地板上)
          p.x = o.def.exit[0]; p.z = o.def.exit[1]; p.y = 0; p.vy = 0;
          w.ext = { ...w.ext, mini: false };
          resolvePlayerOverlap(w);
          say(w, o.def.exitText);
          return;
        }
        if ((p.scale ?? 1) >= 1) { say(w, o.def.lookText); return; }
        // 縮小：從側面的小門鑽進去 = 站到縮影頂上 (中央)
        const b = objBox(o);
        p.x = o.x; p.z = o.z; p.y = b.max[1]; p.vy = 0; p.onGround = true;
        w.ext = { ...w.ext, mini: true };
        say(w, o.def.enterText);
      }
    },
    miniGear: {
      verbKey: 'obj.miniGear.verb',
      usableWhenUsed: true,
      interact: (w, o) => { if (o.def.type === 'miniGear') say(w, o.used ? o.def.doneText : o.def.jamText); }
    },
    starScale: {
      verbKey: 'obj.starScale.verb',
      usableWhenUsed: true,
      interact: (w, o) => { if (o.def.type === 'starScale') say(w, o.used ? o.def.doneText : o.def[ALIGN_TEXT[alignState(w, o)]]); }
    }
  },
  // 尺寸 (標籤「你」) 與標籤跟著人走 (只在 2D 畫；在玩家頭頂右側)
  beforePhysics: w => {
    const k = selfSmall(w) ? SELF_SCALE : 1;
    if ((w.player.scale ?? 1) !== k) w.player.scale = k;
    for (const o of w.objs) if (o.def.type === 'selfTag') { o.x = w.player.x; o.y = w.player.y; }
  },
  afterPhysics: w => {
    const mini = onMini(w);
    if (!!w.ext.mini !== mini) w.ext = { ...w.ext, mini };
    for (const o of w.objs) {
      if (o.used) continue;
      // 齒輪量成「小」的那一刻：掉出軌道 (閂住)
      if (o.def.type === 'miniGear' && scaleCardOn(o.def, w.ext.labels) === 'card.xiao') {
        o.used = true;
        say(w, o.def.freedText);
        if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      }
      // 星圖對上刻度的那一刻 (5-1a)
      if (o.def.type === 'starScale' && alignState(w, o) === 'done') {
        o.used = true;
        say(w, o.def.alignedText);
        if (o.def.doneFlag) w.events.push({ t: 'done', flag: o.def.doneFlag });
      }
    }
  }
};
