import type { Text } from '../../text/text';
import { make, openScreen } from './screen';
import { sliderRow, toggleRow } from './settingRows';

/** 聲音設定 (audio-design 6)：三條音量 0～1、靜音、減弱緊張效果 */
export interface SoundSettingsModel { masterVolume: number; musicVolume: number; sfxVolume: number; mute: boolean; calmTension: boolean }

/**
 * 聲音設定頁 (疊在選單上方；關閉 = 回到選單)：滑桿拖動時即時套用 (change)，放開時試聽 (preview)；回傳關閉函式
 */
export function showSoundSettings(text: Text, m: SoundSettingsModel, on: { change(s: SoundSettingsModel): void; preview(kind: 'music' | 'sfx'): void; back(): void }): () => void {
  const root = openScreen('pz-sound');
  root.append(make('h1', undefined, text('ui.sound.title')));
  const s = { ...m };
  const sec = make('section', 'pz-card pz-settings');
  soundRows(sec, text, s, { change: v => on.change(v), preview: k => on.preview(k) });
  sec.append(make('p', 'pz-hint', text('ui.sound.calmHint')));
  root.append(sec);
  const back = make('button', 'pz-btn pz-btn-ghost', text('ui.sound.back'));
  back.type = 'button';
  back.id = 'pz-sound-back';
  back.addEventListener('click', () => on.back());
  root.append(back);
  return () => root.remove();
}

/** 聲音的四列 (三條音量 + 靜音) 與減弱緊張效果：選單的聲音頁與關卡中的「設定」popup 共用 (s 直接改、每次改完 change 一份副本) */
export function soundRows(sec: HTMLElement, text: Text, s: SoundSettingsModel, on: { change(s: SoundSettingsModel): void; preview(kind: 'music' | 'sfx'): void }): void {
  const vol = (labelKey: string, id: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume', kind: 'music' | 'sfx') =>
    sliderRow(sec, text(labelKey), id, s[key], { input: v => { s[key] = v; on.change({ ...s }); }, change: () => on.preview(kind) });
  vol('ui.sound.master', 'pz-sound-master', 'masterVolume', 'sfx');
  vol('ui.sound.music', 'pz-sound-music', 'musicVolume', 'music');
  vol('ui.sound.sfx', 'pz-sound-sfx', 'sfxVolume', 'sfx');
  const flag = (labelKey: string, id: string, key: 'mute' | 'calmTension') =>
    toggleRow(sec, text(labelKey), id, { value: () => text(s[key] ? 'ui.settings.on' : 'ui.settings.off'), pressed: () => s[key], toggle: () => { s[key] = !s[key]; on.change({ ...s }); } });
  flag('ui.sound.mute', 'pz-sound-mute', 'mute');
  flag('ui.sound.calm', 'pz-sound-calm', 'calmTension');
}
