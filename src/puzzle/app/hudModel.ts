import type { Mode, World } from '../core/types';
import { findTarget } from '../core/interact';
import type { Text } from '../text/text';
import type { Bindings } from '../input/types';
import { keyLabel } from '../input/bindings';
import type { HelpRow } from '../ui/dom';
import type { HudData } from '../ui/hud';

/** HUD 要顯示的一切 (純資料；ui/hud.ts 只做 diff 後寫 DOM)：模式、物品、[E] 提示 (過場中 / 通關後為 null)、最後訊息 */
export type HudModel = HudData;

export interface HudView { renderMode: Mode; locked: boolean; bindings: Bindings }

/** 由世界狀態推導 HUD (純函式，可在 Node 測) */
export function deriveHud(w: World, text: Text, view: HudView): HudModel {
  const t = view.locked || w.cleared ? null : findTarget(w);
  let prompt: string | null = null;
  if (t) {
    const key = keyLabel(view.bindings.interact[0] ?? '');
    const verb = text(w.rt.mechanics.types.get(t.def.type)?.spec.verbKey ?? 'obj.default.verb');
    const label = t.def.labelKey ? text(t.def.labelKey) : '';
    prompt = label ? text('ui.prompt.withLabel', { key, verb, label }) : text('ui.prompt', { key, verb });
  }
  return {
    mode: view.renderMode,
    modeText: text(view.renderMode === '3d' ? 'term.mode3d' : 'term.mode2d'),
    items: Object.entries(w.inv).map(([id, n]) => ({ id, n, name: text(`term.${id}`) })),
    prompt,
    toast: { seq: w.msgSeq, text: w.msg }
  };
}

/** 操作說明由按鍵設定產生 (重綁後說明自動一致)；移動鍵合併成一個按鍵框 (WASD) */
export function deriveHelp(b: Bindings): HelpRow[] {
  const all = (codes: readonly string[]): string[] => codes.map(keyLabel);
  return [
    { keys: [[b.up, b.left, b.down, b.right].map(c => keyLabel(c[0] ?? '')).join('')], labelKey: 'ui.help.move' },
    { keys: all(b.jump), labelKey: 'ui.help.jump' },
    { keys: all(b.flip), labelKey: 'ui.help.flip' },
    { keys: all(b.interact), labelKey: 'ui.help.interact' },
    { keys: all(b.reset), labelKey: 'ui.help.reset' },
    { keys: all(b.restart), labelKey: 'ui.help.restart' }
  ];
}
