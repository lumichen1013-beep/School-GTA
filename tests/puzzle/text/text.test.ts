import { describe, it, expect } from 'vitest';
import { createText } from '../../../src/puzzle/text/text';
import { TEXT } from '../msgs';

describe('createText', () => {
  const t = createText({ 'a': '你好，{name}', 'term.nib': '筆尖', 'b': '拿到[[term.nib]] {n} 個' }, { 'c': '回退' });

  it('插值、詞彙引用、fallback；缺 key 回傳 key 本身', () => {
    expect(t('a', { name: '小明' })).toBe('你好，小明');
    expect(t('a')).toBe('你好，{name}');
    expect(t('b', { n: 2 })).toBe('拿到筆尖 2 個');
    expect(t('c')).toBe('回退');
    expect(t('missing.key')).toBe('missing.key');
    expect(t.has('a')).toBe(true);
    expect(t.has('c')).toBe(true);
    expect(t.has('missing.key')).toBe(false);
  });

  it('zh-Hant 組字與搬移前的字面值相同 (字串原樣)', () => {
    expect(TEXT('ui.prompt.withLabel', { key: 'E', verb: TEXT('obj.note.verb'), label: TEXT('lvl.1-2.note') })).toBe('[E] 閱讀　叔公的字條');
    expect(TEXT('ui.prompt', { key: 'E', verb: TEXT('obj.default.verb') })).toBe('[E] 互動');
    expect(TEXT('ui.clear.title', { level: TEXT('lvl.1-2.title') })).toBe('玄關 · 機關解開了');
    expect(TEXT('ui.docTitle', { level: TEXT('lvl.1-2.title') })).toBe('圖紙之間 · 玄關');
    expect([TEXT('term.mode3d'), TEXT('term.mode2d'), TEXT('ui.inv.none')]).toEqual(['實景', '藏寶圖', '持有物：無']);
  });
});
