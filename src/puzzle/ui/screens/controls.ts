import type { Text } from '../../text/text';
import { make, openScreen } from './screen';
import { toggleRow } from './settingRows';

/** 操作設定 (選單「操作」；疊在選單上方，關閉 = 回到選單)：轉動方式 (settings.turnMode) */
export interface ControlsSettingsModel { turnMode: 'instant' | 'confirm' }

export function showControlsSettings(text: Text, m: ControlsSettingsModel, on: { change(s: ControlsSettingsModel): void; back(): void; reset?(): void }): () => void {
  const root = openScreen('pz-controls');
  root.append(make('h1', undefined, text('ui.controls.title')));
  const s = { ...m };
  const sec = make('section', 'pz-card pz-settings');
  turnModeRow(sec, text, s, v => on.change(v));
  sec.append(make('p', 'pz-hint', text('ui.controls.turnModeHint')));
  // 重置記錄 (次要、紅褐色；兩段式確認窗由外殼開)
  if (on.reset) {
    const r = make('button', 'pz-btn pz-btn-danger', text('ui.reset.open'));
    r.type = 'button';
    r.id = 'pz-controls-reset';
    r.addEventListener('click', () => on.reset?.());
    sec.append(r);
  }
  root.append(sec);
  const back = make('button', 'pz-btn pz-btn-ghost', text('ui.controls.back'));
  back.type = 'button';
  back.id = 'pz-controls-back';
  back.addEventListener('click', () => on.back());
  root.append(back);
  return () => root.remove();
}

/** 「轉動方式：直接轉 / 先預覽再確認」一列 (選單的操作設定頁與關卡中的「設定」popup 共用) */
export function turnModeRow(sec: HTMLElement, text: Text, s: ControlsSettingsModel, change: (s: ControlsSettingsModel) => void): void {
  const b = toggleRow(sec, text('ui.controls.turnMode'), 'pz-set-turnmode', {
    value: () => text(s.turnMode === 'instant' ? 'ui.controls.turnMode.instant' : 'ui.controls.turnMode.confirm'),
    pressed: () => s.turnMode === 'confirm',
    toggle: () => { s.turnMode = s.turnMode === 'instant' ? 'confirm' : 'instant'; b.dataset.value = s.turnMode; change({ ...s }); }
  });
  b.dataset.value = s.turnMode;
}
