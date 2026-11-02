import type { Text } from '../../text/text';
import { make, openScreen } from './screen';

/** 暱稱輸入：非空才可確定 (Enter 亦可)；回傳關閉函式 */
export function showNickname(text: Text, opts: { initial: string; maxLength: number; onDone(name: string): void }): () => void {
  const root = openScreen('pz-nickname');
  const card = make('div', 'pz-card pz-form');
  const input = make('input', 'pz-input');
  input.id = 'pz-name';
  input.maxLength = opts.maxLength;
  input.value = opts.initial;
  input.placeholder = text('ui.nickname.placeholder');
  input.autocomplete = 'off';
  const ok = make('button', 'pz-btn', text('ui.nickname.ok'));
  ok.id = 'pz-name-ok';
  ok.type = 'button';
  const sync = (): void => { ok.disabled = input.value.trim() === ''; };
  const submit = (): void => { if (input.value.trim()) opts.onDone(input.value); };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) submit(); });
  ok.addEventListener('click', submit);
  card.append(make('p', 'pz-hint', text('ui.nickname.hint')), input, ok);
  root.append(make('h1', undefined, text('ui.nickname.title')), card);
  sync();
  input.focus();
  return () => root.remove();
}
