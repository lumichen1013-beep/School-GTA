import type { Text } from '../../text/text';
import { make, openScreen } from './screen';

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
  const slider = (labelKey: string, id: string, key: 'masterVolume' | 'musicVolume' | 'sfxVolume', kind: 'music' | 'sfx'): void => {
    const r = make('label', 'pz-setting');
    const input = make('input');
    input.type = 'range';
    input.id = id;
    input.min = '0';
    input.max = '100';
    input.step = '5';
    input.value = String(Math.round(s[key] * 100));
    input.style.width = '55%';
    input.style.accentColor = 'var(--inkblue)';
    input.setAttribute('aria-label', text(labelKey));
    const val = make('span', undefined, `${input.value}`);
    val.style.minWidth = '2.5em';
    val.style.textAlign = 'right';
    input.addEventListener('input', () => { s[key] = Number(input.value) / 100; val.textContent = input.value; on.change({ ...s }); });
    input.addEventListener('change', () => on.preview(kind));
    r.append(make('span', undefined, text(labelKey)), input, val);
    sec.append(r);
  };
  slider('ui.sound.master', 'pz-sound-master', 'masterVolume', 'sfx');
  slider('ui.sound.music', 'pz-sound-music', 'musicVolume', 'music');
  slider('ui.sound.sfx', 'pz-sound-sfx', 'sfxVolume', 'sfx');
  const toggle = (labelKey: string, id: string, key: 'mute' | 'calmTension'): void => {
    const r = make('div', 'pz-setting');
    const b = make('button', 'pz-toggle');
    b.type = 'button';
    b.id = id;
    const sync = () => { b.textContent = text(s[key] ? 'ui.settings.on' : 'ui.settings.off'); b.setAttribute('aria-pressed', String(s[key])); };
    b.addEventListener('click', () => { s[key] = !s[key]; sync(); on.change({ ...s }); });
    sync();
    r.append(make('span', undefined, text(labelKey)), b);
    sec.append(r);
  };
  toggle('ui.sound.mute', 'pz-sound-mute', 'mute');
  toggle('ui.sound.calm', 'pz-sound-calm', 'calmTension');
  sec.append(make('p', 'pz-hint', text('ui.sound.calmHint')));
  root.append(sec);
  const back = make('button', 'pz-btn pz-btn-ghost', text('ui.sound.back'));
  back.type = 'button';
  back.id = 'pz-sound-back';
  back.addEventListener('click', () => on.back());
  root.append(back);
  return () => root.remove();
}
