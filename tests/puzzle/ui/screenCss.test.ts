// 全螢幕畫面 (選單 / 暱稱 / 回憶 / 聲音 / 操作) 的版面：內容高於視窗時要能從頂端捲動
// (使用者回報「首頁的設定不見了」：第五章加入後選單超高，justify-content: center 把標題與「聲音 / 操作」連結推到視窗上方外、捲不上去)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(__dirname, '../../../src/puzzle/ui/puzzle.css'), 'utf8');
/** 某個選擇器 (完全相同) 的宣告區塊 */
const rule = (sel: string): string => {
  const i = CSS.split('\n').findIndex(l => l.trim().startsWith(`${sel} {`));
  if (i < 0) return '';
  const rest = CSS.split('\n').slice(i).join('\n');
  return rest.slice(rest.indexOf('{') + 1, rest.indexOf('}'));
};

describe('.pz-screen 超高時可從頂端捲動', () => {
  it('可捲動、不用會溢出頂端的 justify-content: center (要嘛 safe center，要嘛 flex-start + 子元素 auto 邊距)', () => {
    const r = rule('.pz-screen');
    expect(r).toMatch(/overflow:\s*auto/);
    const jc = /justify-content:\s*([^;]+);/.exec(r)?.[1].trim();
    expect(jc === 'safe center' || jc === 'flex-start').toBe(true);
    if (jc === 'flex-start') {
      expect(rule('.pz-screen > :first-child')).toMatch(/margin-top:\s*auto/);
      expect(rule('.pz-screen > :last-child')).toMatch(/margin-bottom:\s*auto/);
    }
  });
});

describe('通關畫面 #pz-clear 同規則', () => {
  it('可捲動、flex-start + 子元素 auto 邊距', () => {
    const r = rule('#pz-clear');
    expect(r).toMatch(/overflow:\s*auto/);
    expect(/justify-content:\s*([^;]+);/.exec(r)?.[1].trim()).toBe('flex-start');
    expect(rule('#pz-clear > :first-child')).toMatch(/margin-top:\s*auto/);
  });
});
