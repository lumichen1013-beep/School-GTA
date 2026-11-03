import type { Mode, World } from '../core/types';
import { findTarget } from '../core/interact';
import type { Text } from '../text/text';
import type { Bindings } from '../input/types';
import { keyLabel } from '../input/bindings';
import type { HelpRow } from '../ui/dom';
import type { HudData } from '../ui/hud';
import { leverWord, promptLabelTarget } from '../mechanics/labels';
import { WORD_KEYS } from '../mechanics/cube';
import { labelTitle } from './cardTrayModel';

/** HUD 要顯示的一切 (純資料；ui/hud.ts 只做 diff 後寫 DOM)：模式、物品、[E] 提示 (過場中 / 通關後為 null)、最後訊息 */
export type HudModel = HudData;

/** ink = 控制盤章節 2D 的墨量小計 (app/cubeMapModel inkHud；第一章 / 3D 為 null) */
export interface HudView { renderMode: Mode; locked: boolean; bindings: Bindings; ink?: string | null }

/** 由世界狀態推導 HUD (純函式，可在 Node 測) */
export function deriveHud(w: World, text: Text, view: HudView): HudModel {
  const t = view.locked || w.cleared ? null : findTarget(w);
  let prompt: string | null = null;
  const key = keyLabel(view.bindings.interact[0] ?? '');
  if (t) {
    const verb = text(w.rt.mechanics.types.get(t.def.type)?.spec.verbKey ?? 'obj.default.verb');
    // 有標籤的拉桿：名稱跟著此刻的方向字 (詞卡蓋上去之後顯示新字；mobile-controls 2.1「拉　上」)
    const label = t.def.type === 'lever' && t.def.label ? text('ui.lever.label', { word: text(WORD_KEYS[leverWord(w, t)]) })
      : t.def.labelKey ? text(t.def.labelKey) : '';
    prompt = label ? text('ui.prompt.withLabel', { key, verb, label }) : text('ui.prompt', { key, verb });
  } else if (!view.locked && !w.cleared) {
    // 2D 靠近可寫的標籤 (N22)：「寫　拉桿：左」；謎題標籤缺卡也提示 (按 E 說明缺什麼)
    const l = promptLabelTarget(w);
    if (l) prompt = text('ui.prompt.withLabel', { key, verb: text('obj.label.verb'), label: labelTitle(w, text, l) });
  }
  return {
    mode: view.renderMode,
    modeText: text(view.renderMode === '3d' ? 'term.mode3d' : 'term.mode2d'),
    items: Object.entries(w.inv).map(([id, n]) => ({ id, n, name: text(`term.${id}`) })),
    prompt,
    toast: { seq: w.msgSeq, text: w.msg },
    ...(view.ink ? { ink: view.ink } : {})
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
    { keys: all(b.restart), labelKey: 'ui.help.restart', noteKey: 'ui.help.restart.note' }
  ];
}
