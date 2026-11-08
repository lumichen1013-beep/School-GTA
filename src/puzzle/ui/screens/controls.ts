import type { Text } from '../../text/text';
import { make, openScreen } from './screen';

/** 操作設定 (選單「操作」；疊在選單上方，關閉 = 回到選單)：轉動方式 (settings.turnMode) */
export interface ControlsSettingsModel { turnMode: 'instant' | 'confirm' }

export function showControlsSettings(text: Text, m: ControlsSettingsModel, on: { change(s: ControlsSettingsModel): void; back(): void }): () => void {
  const root = openScreen('pz-controls');
  root.append(make('h1', undefined, text('ui.controls.title')));
  const s = { ...m };
  const sec = make('section', 'pz-card pz-settings');
  const r = make('div', 'pz-setting');
  const b = make('button', 'pz-toggle');
  b.type = 'button';
  b.id = 'pz-set-turnmode';
  const sync = () => {
    b.textContent = text(s.turnMode === 'instant' ? 'ui.controls.turnMode.instant' : 'ui.controls.turnMode.confirm');
    b.dataset.value = s.turnMode;
  };
  b.addEventListener('click', () => { s.turnMode = s.turnMode === 'instant' ? 'confirm' : 'instant'; sync(); on.change({ ...s }); });
  sync();
  r.append(make('span', undefined, text('ui.controls.turnMode')), b);
  sec.append(r, make('p', 'pz-hint', text('ui.controls.turnModeHint')));
  root.append(sec);
  const back = make('button', 'pz-btn pz-btn-ghost', text('ui.controls.back'));
  back.type = 'button';
  back.id = 'pz-controls-back';
  back.addEventListener('click', () => on.back());
  root.append(back);
  return () => root.remove();
}
