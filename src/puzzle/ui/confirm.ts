import type { Text } from '../text/text';
import { make } from './screens/screen';

/**
 * 「重新開始本關」確認窗 (遮罩 + 置中奶油紙卡片)；回傳關閉函式。
 * 鍵盤的 Enter / Esc 由 app 的輸入層統一處理 (含 300ms 保護)；
 * 這裡攔下對話框內的 Enter / Esc 預設行為，避免焦點在按鈕上時 Enter 變成按下「繼續玩」。
 */
export function showRestartConfirm(text: Text, cb: { onConfirm(): void; onCancel(): void }): () => void {
  document.getElementById('pz-confirm')?.remove();
  const overlay = make('div', 'pz-modal');
  overlay.id = 'pz-confirm';
  const card = make('div', 'pz-card pz-dialog');
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-modal', 'true');
  const title = make('h2', undefined, text('ui.confirm.restart.title'));
  title.id = 'pz-confirm-title';
  card.setAttribute('aria-labelledby', title.id);
  const ok = make('button', 'pz-btn pz-btn-ghost', text('ui.confirm.restart.ok'));
  ok.id = 'pz-confirm-ok';
  const cancel = make('button', 'pz-btn', text('ui.confirm.restart.cancel'));
  cancel.id = 'pz-confirm-cancel';
  ok.type = cancel.type = 'button';
  ok.addEventListener('click', cb.onConfirm);
  cancel.addEventListener('click', cb.onCancel);
  overlay.addEventListener('keydown', e => {
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') e.preventDefault();
  }, true);
  const row = make('div', 'pz-dialog-actions');
  row.append(ok, cancel);
  card.append(title, make('p', 'pz-hint', text('ui.confirm.restart.body')), row);
  overlay.append(card);
  document.getElementById('pz-root')!.append(overlay);
  cancel.focus();
  return () => overlay.remove();
}
