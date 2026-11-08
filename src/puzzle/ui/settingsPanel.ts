// 關卡中的「設定」popup (2026-11-08；工具列齒輪 / Esc)：聲音 (三條音量 + 靜音 + 減弱緊張效果)、轉動方式、畫面與過場 (減弱動態、文字速度)；
// 「重看操作說明」「回到選單」(確認窗) 「重置記錄」(次要、紅褐色)「關閉」。列元件與選單的聲音 / 操作頁共用 (screens/settingRows、soundRows、turnModeRow)
import type { Text } from '../text/text';
import { make } from './screens/screen';
import { soundRows, type SoundSettingsModel } from './screens/sound';
import { turnModeRow, type ControlsSettingsModel } from './screens/controls';
import { toggleRow } from './screens/settingRows';

export interface DisplaySettingsModel { reduceMotion: boolean; textSpeed: 'normal' | 'slow' }
export interface SettingsPanelModel { sound: SoundSettingsModel; controls: ControlsSettingsModel; display: DisplaySettingsModel }
export interface SettingsPanelHandlers {
  sound(s: SoundSettingsModel): void;
  preview(kind: 'music' | 'sfx'): void;
  controls(s: ControlsSettingsModel): void;
  display(s: DisplaySettingsModel): void;
  help(): void;
  menu(): void;
  reset(): void;
  close(): void;
}

/** 「設定」popup (右上角下方的紙卡；可捲動)：打開時建好內容，關閉 = 移除 */
export class SettingsPanel {
  private card: HTMLElement | null = null;

  constructor(private root: HTMLElement, private text: Text) {}

  get isShown(): boolean { return this.card !== null; }

  show(m: SettingsPanelModel, on: SettingsPanelHandlers): void {
    this.hide();
    const t = this.text;
    const card = make('div', 'pz-panel pz-settings-panel');
    card.id = 'pz-settings';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', t('ui.panel.title'));
    const head = make('div', 'pz-items-head');
    const close = make('button', 'pz-items-close', t('ui.items.close'));
    close.type = 'button';
    close.id = 'pz-settings-close';
    close.addEventListener('click', e => { e.preventDefault(); on.close(); });
    head.append(make('b', 'pz-items-title', t('ui.panel.title')), close);
    const body = make('div', 'pz-panel-body');
    const sec = (titleKey: string): HTMLElement => { const s = make('section', 'pz-settings'); s.append(make('h3', undefined, t(titleKey))); body.append(s); return s; };
    const sound = { ...m.sound };
    soundRows(sec('ui.panel.sound'), t, sound, { change: on.sound, preview: on.preview });
    turnModeRow(sec('ui.panel.controls'), t, { ...m.controls }, on.controls);
    const d = { ...m.display };
    const disp = sec('ui.panel.display');
    toggleRow(disp, t('ui.settings.reduceMotion'), 'pz-panel-reduce', { value: () => t(d.reduceMotion ? 'ui.settings.on' : 'ui.settings.off'), pressed: () => d.reduceMotion, toggle: () => { d.reduceMotion = !d.reduceMotion; on.display({ ...d }); } });
    toggleRow(disp, t('ui.settings.textSpeed'), 'pz-panel-speed', { value: () => t(d.textSpeed === 'slow' ? 'ui.settings.textSpeed.slow' : 'ui.settings.textSpeed.normal'), pressed: () => d.textSpeed === 'slow', toggle: () => { d.textSpeed = d.textSpeed === 'normal' ? 'slow' : 'normal'; on.display({ ...d }); } });
    disp.append(make('p', 'pz-hint', t('ui.panel.displayHint')));
    const actions = make('div', 'pz-panel-actions');
    const btn = (key: string, id: string, cls: string, fn: () => void) => { const b = make('button', `pz-btn ${cls}`, t(key)); b.type = 'button'; b.id = id; b.addEventListener('click', e => { e.preventDefault(); fn(); }); actions.append(b); };
    btn('ui.panel.help', 'pz-settings-help', 'pz-btn-ghost', on.help);
    btn('ui.panel.menu', 'pz-settings-menu', 'pz-btn-ghost', on.menu);
    btn('ui.reset.open', 'pz-settings-reset', 'pz-btn-danger', on.reset);
    body.append(actions);
    card.append(head, body);
    // popup 上的點擊 / 鍵盤不穿到底下的遊戲 (方向鍵 / 空白鍵在滑桿上照常調整)
    for (const ev of ['pointerdown', 'pointerup'] as const) card.addEventListener(ev, e => e.stopPropagation());
    this.root.append(card);
    this.card = card;
  }

  hide(): void { this.card?.remove(); this.card = null; }
}
