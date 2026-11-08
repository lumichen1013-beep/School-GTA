// 設定列的共用元件 (選單的聲音 / 操作設定頁與關卡中的「設定」popup 共用)：滑桿 (0～1 → 0～100) 與切換鈕
import { make } from './screen';

/** 音量滑桿：拖動時 onInput (即時套用)、放開時 onChange (試聽) */
export function sliderRow(sec: HTMLElement, label: string, id: string, value: number, on: { input(v: number): void; change?(): void }): HTMLInputElement {
  const r = make('label', 'pz-setting');
  const input = make('input');
  input.type = 'range';
  input.id = id;
  input.min = '0';
  input.max = '100';
  input.step = '5';
  input.value = String(Math.round(value * 100));
  input.style.width = '55%';
  input.style.accentColor = 'var(--inkblue)';
  input.setAttribute('aria-label', label);
  const val = make('span', undefined, `${input.value}`);
  val.style.minWidth = '2.5em';
  val.style.textAlign = 'right';
  input.addEventListener('input', () => { val.textContent = input.value; on.input(Number(input.value) / 100); });
  if (on.change) input.addEventListener('change', () => on.change!());
  r.append(make('span', undefined, label), input, val);
  sec.append(r);
  return input;
}

/** 切換鈕：label = 這一列的名稱；value() = 鈕上的字、pressed() = aria-pressed；點一下 = toggle() 後重畫 */
export function toggleRow(sec: HTMLElement, label: string, id: string, on: { value(): string; pressed(): boolean; toggle(): void }): HTMLButtonElement {
  const r = make('div', 'pz-setting');
  const b = make('button', 'pz-toggle');
  b.type = 'button';
  b.id = id;
  const sync = () => { b.textContent = on.value(); b.setAttribute('aria-pressed', String(on.pressed())); };
  b.addEventListener('click', () => { on.toggle(); sync(); });
  sync();
  r.append(make('span', undefined, label), b);
  sec.append(r);
  return b;
}
