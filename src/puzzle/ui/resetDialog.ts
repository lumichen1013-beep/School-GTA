// 「重置記錄」確認窗 (2026-11-08)：兩段式 (先勾「我了解，清除後無法復原」才能按「確定重置」；app/settingsModel canConfirmReset)、
// 「連設定一起重置」預設不勾；取消不改任何東西。結果 (失敗 / 記憶體版提醒 / 完成) 寫在同一張卡片上
import type { Text } from '../text/text';
import { make } from './screens/screen';

/** canConfirm = 兩段式的判斷 (app/settingsModel canConfirmReset；ui 不 import app，由外殼注入) */
export interface ResetDialogHandlers { confirm(withSettings: boolean): void; cancel(): void; canConfirm(s: { ack: boolean; withSettings: boolean }): boolean }

export class ResetDialog {
  private overlay: HTMLElement | null = null;
  private msg: HTMLElement | null = null;
  private actions: HTMLElement | null = null;

  constructor(private text: Text) {}

  get isOpen(): boolean { return this.overlay !== null; }

  open(on: ResetDialogHandlers): void {
    this.close();
    const t = this.text;
    const st = { ack: false, withSettings: false };
    const canConfirmReset = on.canConfirm;
    const overlay = make('div', 'pz-modal');
    overlay.id = 'pz-reset';
    const card = make('div', 'pz-card pz-dialog pz-reset');
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');
    const title = make('h2', undefined, t('ui.reset.title'));
    title.id = 'pz-reset-title';
    card.setAttribute('aria-labelledby', title.id);
    const check = (id: string, labelKey: string, onChange: (v: boolean) => void): HTMLLabelElement => {
      const l = make('label', 'pz-check');
      const box = make('input');
      box.type = 'checkbox';
      box.id = id;
      box.addEventListener('change', () => onChange(box.checked));
      l.append(box, make('span', undefined, t(labelKey)));
      return l;
    };
    const ok = make('button', 'pz-btn pz-btn-danger', t('ui.reset.ok'));
    ok.type = 'button';
    ok.id = 'pz-reset-ok';
    ok.disabled = !canConfirmReset(st);
    const cancel = make('button', 'pz-btn', t('ui.reset.cancel'));
    cancel.type = 'button';
    cancel.id = 'pz-reset-cancel';
    ok.addEventListener('click', () => { if (canConfirmReset(st)) on.confirm(st.withSettings); });
    cancel.addEventListener('click', () => on.cancel());
    const ack = check('pz-reset-ack', 'ui.reset.ack', v => { st.ack = v; ok.disabled = !canConfirmReset(st); });
    const withSettings = check('pz-reset-settings', 'ui.reset.withSettings', v => { st.withSettings = v; });
    const actions = make('div', 'pz-dialog-actions');
    actions.append(ok, cancel);
    const msg = make('p', 'pz-reset-msg');
    card.append(title, make('p', 'pz-hint', t('ui.reset.body')), ack, withSettings, msg, actions);
    // Enter / Esc 由 app 統一處理 (Esc = 取消)；這裡擋掉焦點在按鈕上時的預設行為
    overlay.addEventListener('keydown', e => { if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') e.preventDefault(); }, true);
    for (const ev of ['pointerdown', 'pointerup'] as const) overlay.addEventListener(ev, e => e.stopPropagation());
    overlay.append(card);
    document.getElementById('pz-root')!.append(overlay);
    cancel.focus();
    this.overlay = overlay;
    this.msg = msg;
    this.actions = actions;
  }

  /** 失敗：寫原因、留在確認窗 (可取消) */
  fail(message: string): void { if (this.msg) { this.msg.textContent = message; this.msg.classList.add('bad'); } }

  /** 完成：只留一句話與「好」 */
  done(message: string, ok: string, onOk: () => void): void {
    if (!this.overlay || !this.actions || !this.msg) return;
    const card = this.overlay.querySelector('.pz-reset')!;
    card.querySelectorAll('.pz-check, .pz-hint').forEach(e => e.remove());
    this.msg.textContent = message;
    this.msg.classList.remove('bad');
    const b = make('button', 'pz-btn', ok);
    b.type = 'button';
    b.id = 'pz-reset-done';
    b.addEventListener('click', () => onOk());
    this.actions.replaceChildren(b);
    b.focus();
  }

  close(): void { this.overlay?.remove(); this.overlay = null; this.msg = null; this.actions = null; }
}
