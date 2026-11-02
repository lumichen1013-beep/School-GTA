/** 全螢幕畫面容器 (奶油紙卡片風格)；回傳根元素，關閉時呼叫 remove() */
export function openScreen(id: string): HTMLElement {
  document.getElementById(id)?.remove();
  const el = document.createElement('div');
  el.id = id;
  el.className = 'pz-screen';
  document.getElementById('pz-root')!.append(el);
  return el;
}

export const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
