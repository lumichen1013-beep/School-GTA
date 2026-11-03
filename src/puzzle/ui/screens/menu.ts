import type { Text } from '../../text/text';
import { make, openScreen } from './screen';

export interface MenuLevel { id: string; titleKey: string; state: 'locked' | 'open' | 'cleared' }
export interface MenuChapter { titleKey: string; levels: MenuLevel[] }
/** dev = 開發入口 (網址帶 ?dev=1 才有；原型占位的關卡，例：控制盤原型) */
export interface MenuModel { name: string; chapters: MenuChapter[]; dev?: MenuChapter }

/** 章節選單：每關一張卡片 (已通關 / 未解鎖標示)；回傳關閉函式 */
export function showMenu(text: Text, m: MenuModel, on: { play(id: string): void; rename(): void; memories(): void }): () => void {
  const root = openScreen('pz-menu');
  const head = make('div', 'pz-menu-head');
  const rename = make('button', 'pz-link', text('ui.menu.rename'));
  rename.type = 'button';
  rename.addEventListener('click', () => on.rename());
  const memories = make('button', 'pz-link', text('ui.menu.memories'));
  memories.type = 'button';
  memories.id = 'pz-menu-memories';
  memories.addEventListener('click', () => on.memories());
  head.append(make('span', undefined, text('ui.menu.player', { name: m.name })), rename, memories);
  root.append(make('h1', undefined, text('ui.menu.title')), head);
  for (const ch of m.dev ? [...m.chapters, m.dev] : m.chapters) {
    const sec = make('section', 'pz-chapter');
    sec.append(make('h2', undefined, text(ch.titleKey)));
    const list = make('div', 'pz-levels');
    for (const lv of ch.levels) {
      const card = make('button', `pz-card pz-level ${lv.state}`);
      card.type = 'button';
      card.dataset.level = lv.id;
      card.disabled = lv.state === 'locked';
      card.append(make('span', 'pz-level-id', lv.id), make('span', 'pz-level-title', text(lv.titleKey)));
      if (lv.state !== 'open') card.append(make('span', 'pz-tag', text(lv.state === 'cleared' ? 'ui.menu.cleared' : 'ui.menu.locked')));
      card.addEventListener('click', () => on.play(lv.id));
      list.append(card);
    }
    sec.append(list);
    root.append(sec);
  }
  return () => root.remove();
}
