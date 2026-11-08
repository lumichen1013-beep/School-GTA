// 操作說明面板與一次性操作小提示 (純函式，Node 可測；ui/hud.ts 只負責畫)
// - 面板預設收合：只留一顆「H　操作說明」小鈕 (手機只剩「？」圖示)；H / 點小鈕展開、再按收合 (偏好存進 settings.helpOpen)
// - 展開時遇到展開圖 / 字卡匣 / 轉動模式 → 自動讓位 (面板暫時收起，疊層關掉後回來)
// - 第一次進關、第一次打開字卡匣 / 轉動模式：畫面上方一行小提示，TIP_MS 後自動消失；說過的記進 settings.tipsSeen
import type { Text } from '../text/text';
import type { Bindings } from '../input/types';
import { keyLabel } from '../input/bindings';

/** 一次性小提示：help = 第一次進關 (怎麼打開操作說明)；cards = 第一次打開字卡匣；turn = 第一次進轉動模式 */
export type TipId = 'help' | 'cards' | 'turn';
/** 小提示停留時間 (毫秒；規格：3 秒內自動消失) */
export const TIP_MS = 2800;

/** 此刻畫面上的狀態 (外殼每幀由 LevelSession 取得) */
export interface HelpContext {
  /** 在關卡裡 (選單 / 通關畫面 / 過場 = false：小鈕與面板都不顯示) */
  inLevel: boolean;
  mapOpen: boolean;
  trayOpen: boolean;
  turnMode: boolean;
  /** 章節過場 / 旁白進行中 (不出小提示) */
  busy: boolean;
  /** v0.4 觸控裝置 (粗指標)：小提示都是鍵盤操作 (方向鍵 / Enter / H…)，觸控不顯示 (手機上會壓住「藏寶圖」模式標籤) */
  touch?: boolean;
}

export interface HelpView {
  /** 小鈕是否顯示 */
  button: boolean;
  /** 面板此刻展開 (偏好展開、且沒有疊層要讓位) */
  expanded: boolean;
  /** 偏好展開、但因為疊層暫時收起 */
  yielded: boolean;
  /** 小鈕的字 (桌機)；手機只顯示圖示 */
  label: string;
}

/** 面板的樣子：偏好 open + 此刻的疊層 */
export function deriveHelpView(open: boolean, ctx: HelpContext, text: Text, b: Bindings): HelpView {
  const yielded = open && (ctx.mapOpen || ctx.trayOpen || ctx.turnMode);
  const key = keyLabel(b.help[0] ?? '');
  return {
    button: ctx.inLevel,
    expanded: ctx.inLevel && open && !yielded,
    yielded: ctx.inLevel && yielded,
    label: text(open ? 'ui.help.hide' : 'ui.help.show', { key })
  };
}

/** 此刻該說的一次性小提示 (說過的不再說；過場中不說)：字卡匣 / 轉動模式優先於「怎麼打開操作說明」 */
export function pendingTip(seen: readonly string[], ctx: HelpContext): TipId | null {
  if (!ctx.inLevel || ctx.busy || ctx.touch) return null;
  if (ctx.trayOpen && !seen.includes('cards')) return 'cards';
  if (ctx.turnMode && !seen.includes('turn')) return 'turn';
  if (!ctx.mapOpen && !ctx.trayOpen && !ctx.turnMode && !seen.includes('help')) return 'help';
  return null;
}

/** 小提示的字 (依目前按鍵設定；轉動模式依轉動方式 settings.turnMode：instant = 直接轉的鍵位、confirm = 選取 + 確認) */
export function tipText(id: TipId, text: Text, b: Bindings, turnStyle: 'instant' | 'confirm' = 'confirm'): string {
  const k = (codes: readonly string[]) => keyLabel(codes[0] ?? '');
  if (id === 'cards') return text('ui.tip.cards', { a: k(b.slot1), b: k(b.slot3), x: k(b.uncard), esc: k(b.cancel) });
  if (id === 'turn' && turnStyle === 'instant') return text('ui.tip.turnInstant', { w: k(b.up), s: k(b.down), undo: k(b.undo), exit: k(b.turnMode) });
  if (id === 'turn') return text('ui.tip.turn', { ok: k(b.confirm), undo: k(b.undo), exit: k(b.turnMode) });
  return text('ui.tip.help', { key: k(b.help) });
}
