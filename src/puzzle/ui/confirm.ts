import type { Text } from '../text/text';
import { make } from './screens/screen';

/** 確認窗的四個文字 key */
export interface ConfirmKeys { title: string; body: string; ok: string; cancel: string }

/**
 * 確認窗 (遮罩 + 置中奶油紙卡片)；回傳關閉函式。
 * 鍵盤的 Enter / Esc 由 app 的輸入層統一處理 (含 300ms 保護)；
 * 這裡攔下對話框內的 Enter / Esc 預設行為，避免焦點在按鈕上時 Enter 變成按下取消鈕。
 */
export function showConfirm(text: Text, keys: ConfirmKeys, cb: { onConfirm(): void; onCancel(): void }): () => void {
  document.getElementById('pz-confirm')?.remove();
  const overlay = make('div', 'pz-modal');
  overlay.id = 'pz-confirm';
  const card = make('div', 'pz-card pz-dialog');
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-modal', 'true');
  const title = make('h2', undefined, text(keys.title));
  title.id = 'pz-confirm-title';
  card.setAttribute('aria-labelledby', title.id);
  const ok = make('button', 'pz-btn pz-btn-ghost', text(keys.ok));
  ok.id = 'pz-confirm-ok';
  const cancel = make('button', 'pz-btn', text(keys.cancel));
  cancel.id = 'pz-confirm-cancel';
  ok.type = cancel.type = 'button';
  ok.addEventListener('click', cb.onConfirm);
  cancel.addEventListener('click', cb.onCancel);
  overlay.addEventListener('keydown', e => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') e.preventDefault();
  }, true);
  // 對話框上的點擊不傳到底下的過場畫面 (避免被當成推進 / 長按)
  for (const ev of ['pointerdown', 'pointerup'] as const) overlay.addEventListener(ev, e => e.stopPropagation());
  const row = make('div', 'pz-dialog-actions');
  row.append(ok, cancel);
  card.append(title, make('p', 'pz-hint', text(keys.body)), row);
  overlay.append(card);
  document.getElementById('pz-root')!.append(overlay);
  cancel.focus();
  return () => overlay.remove();
}

/** 「重新開始本關」確認窗 */
export const showRestartConfirm = (text: Text, cb: { onConfirm(): void; onCancel(): void }): (() => void) =>
  showConfirm(text, { title: 'ui.confirm.restart.title', body: 'ui.confirm.restart.body', ok: 'ui.confirm.restart.ok', cancel: 'ui.confirm.restart.cancel' }, cb);

/** 「跳過過場」確認窗 (同一個樣式) */
export const showSkipConfirm = (text: Text, cb: { onConfirm(): void; onCancel(): void }): (() => void) =>
  showConfirm(text, { title: 'ui.confirm.skip.title', body: 'ui.confirm.skip.body', ok: 'ui.confirm.skip.ok', cancel: 'ui.confirm.skip.cancel' }, cb);
