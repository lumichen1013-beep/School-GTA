import type { Text } from '../../text/text';
import { make, openScreen } from './screen';

export interface MemoryItem { id: string; titleKey: string; status: 'seen' | 'unfinished' | 'unseen' }
/** 過場相關設定 (回憶頁的最小設定入口) */
export interface CutsceneSettingsModel { autoAdvance: boolean; textSpeed: 'normal' | 'slow'; skipConfirm: boolean; reduceMotion: boolean }
export interface MemoriesModel { items: MemoryItem[]; settings: CutsceneSettingsModel }

/** 回憶頁：已看過 (含跳過) 的過場可重看；下方是過場設定 (自動播放、文字速度、跳過需確認、減弱動態) */
export function showMemories(text: Text, m: MemoriesModel, on: { replay(id: string): void; back(): void; change(s: CutsceneSettingsModel): void }): () => void {
  const root = openScreen('pz-memories');
  root.append(make('h1', undefined, text('ui.memories.title')));
  const list = make('div', 'pz-memories');
  if (!m.items.length) list.append(make('p', 'pz-hint', text('ui.memories.empty')));
  for (const it of m.items) {
    const card = make('button', `pz-card pz-memory ${it.status}`);
    card.type = 'button';
    card.dataset.cutscene = it.id;
    card.append(make('span', 'pz-level-title', text(it.titleKey)), make('span', 'pz-memory-play', text('ui.cutscene.replay')));
    if (it.status !== 'seen') card.append(make('span', 'pz-tag', text(it.status === 'unfinished' ? 'ui.cutscene.unfinished' : 'ui.cutscene.unseen')));
    card.addEventListener('click', () => on.replay(it.id));
    list.append(card);
  }
  root.append(list);

  const s = { ...m.settings };
  const sec = make('section', 'pz-card pz-settings');
  sec.append(make('h2', undefined, text('ui.settings.title')));
  const row = (labelKey: string, id: string, value: () => string, toggle: () => void, pressed: () => boolean): void => {
    const r = make('div', 'pz-setting');
    const b = make('button', 'pz-toggle');
    b.type = 'button';
    b.id = id;
    const sync = () => { b.textContent = value(); b.setAttribute('aria-pressed', String(pressed())); };
    b.addEventListener('click', () => { toggle(); sync(); on.change({ ...s }); });
    sync();
    r.append(make('span', undefined, text(labelKey)), b);
    sec.append(r);
  };
  const onOff = (v: boolean) => text(v ? 'ui.settings.on' : 'ui.settings.off');
  row('ui.settings.autoAdvance', 'pz-set-auto', () => onOff(s.autoAdvance), () => { s.autoAdvance = !s.autoAdvance; }, () => s.autoAdvance);
  row('ui.settings.textSpeed', 'pz-set-speed', () => text(s.textSpeed === 'slow' ? 'ui.settings.textSpeed.slow' : 'ui.settings.textSpeed.normal'), () => { s.textSpeed = s.textSpeed === 'normal' ? 'slow' : 'normal'; }, () => s.textSpeed === 'slow');
  row('ui.settings.skipConfirm', 'pz-set-skipconfirm', () => onOff(s.skipConfirm), () => { s.skipConfirm = !s.skipConfirm; }, () => s.skipConfirm);
  row('ui.settings.reduceMotion', 'pz-set-reduce', () => onOff(s.reduceMotion), () => { s.reduceMotion = !s.reduceMotion; }, () => s.reduceMotion);
  root.append(sec);

  const back = make('button', 'pz-btn pz-btn-ghost', text('ui.memories.back'));
  back.type = 'button';
  back.id = 'pz-memories-back';
  back.addEventListener('click', () => on.back());
  root.append(back);
  return () => root.remove();
}
