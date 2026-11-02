import { describe, it, expect } from 'vitest';
import { zhHant } from '../../../src/puzzle/content/text/zh-Hant';
import { foyer } from '../../../src/puzzle/content/levels/ch1/1-2-foyer';
import { DEFAULT_MECHANICS } from '../../../src/puzzle/mechanics';
import { createWorld, say } from '../../../src/puzzle/core/world';
import type { LevelDef } from '../../../src/puzzle/core/types';
import { CJK, PUZZLE_SRC, listTs, stringLiterals } from '../sourceScan';
import { TEXT } from '../msgs';

/** 關卡驗證器雛形 (S9 移入 devtools/validateLevel)：關卡引用的文字 key 全部存在於文字表 */
function missingLevelKeys(level: LevelDef, bundle: Readonly<Record<string, string>>): string[] {
  const keys = [level.titleKey, level.narrationKey, level.nextKey];
  for (const o of level.objects) {
    keys.push(...[o.labelKey, o.lockedText, o.useText, o.type === 'note' ? o.textKey : undefined].filter((k): k is string => k !== undefined));
  }
  return keys.filter(k => !(k in bundle));
}

const KEY_LIKE = /^(msg|ui|obj|lvl|term)\.[\w.-]+$/;
const files = listTs(PUZZLE_SRC).filter(f => !f.includes('/content/text/'));

describe('文字 key 齊全', () => {
  it('玄關所有文字 key 存在於 zh-Hant', () => {
    expect(missingLevelKeys(foyer, zhHant)).toEqual([]);
    expect(missingLevelKeys({ ...foyer, titleKey: 'lvl.x.nope' }, zhHant)).toEqual(['lvl.x.nope']);
  });

  it('機制類型的 verbKey 都存在', () => {
    const missing = DEFAULT_MECHANICS.flatMap(m => Object.values(m.types ?? {}).map(s => s.verbKey)).filter(k => k !== undefined && !(k in zhHant));
    expect(missing).toEqual([]);
    expect('obj.default.verb' in zhHant).toBe(true);
  });

  it('src/puzzle 程式中出現的 key 字面值都存在', () => {
    const used = files.flatMap(stringLiterals).filter(l => KEY_LIKE.test(l.value));
    expect(used.length).toBeGreaterThan(10);
    expect(used.filter(l => !(l.value in zhHant)).map(l => `${l.file}:${l.line} ${l.value}`)).toEqual([]);
  });

  it('say 記下 key，msg 為注入文字表解析後的字串', () => {
    const w = createWorld(foyer, { mechanics: DEFAULT_MECHANICS, text: TEXT });
    say(w, 'msg.squeeze');
    expect([w.msgKey, w.msg]).toEqual(['msg.squeeze', '這裡塞不下']);
    const raw = createWorld(foyer, { mechanics: DEFAULT_MECHANICS });
    say(raw, 'msg.squeeze');
    expect(raw.msg).toBe('msg.squeeze');
  });
});

describe('字串常值不含 CJK (玩家可見文字只在 content/text)', () => {
  it('src/puzzle/core 與 src/puzzle/mechanics 無 CJK 字元', () => {
    const scoped = files.filter(f => /\/(core|mechanics)\//.test(f));
    expect(scoped.length).toBeGreaterThan(10);
    expect(scoped.flatMap(stringLiterals).filter(l => CJK.test(l.value)).map(l => `${l.file}:${l.line}`)).toEqual([]);
  });

  it('src/puzzle 其餘程式 (content/text 以外) 也無 CJK 字串常值', () => {
    const bundleFiles = listTs(PUZZLE_SRC).filter(f => f.includes('/content/text/'));
    expect(bundleFiles.flatMap(stringLiterals).some(l => CJK.test(l.value))).toBe(true); // 對照組：掃描器抓得到 CJK
    expect(files.flatMap(stringLiterals).filter(l => CJK.test(l.value)).map(l => `${l.file}:${l.line} ${l.value}`)).toEqual([]);
  });
});
