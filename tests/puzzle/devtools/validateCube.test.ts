// C5：devtools/validateCube (BFS；規格 5.4.8、6「第一章抽象模型驗證」)
import { describe, it, expect } from 'vitest';
import { chapterOneModel, validateCube, type Ch1State, type ChapterModel } from '../../../src/puzzle/devtools/validateCube';
import { CH1_CUBE, CH1_MODEL } from '../../../src/puzzle/content/cubes/ch1';

const MODEL = chapterOneModel(CH1_CUBE, CH1_MODEL);

describe('validateCube：第一章模型', () => {
  it('可達排列 3 (S0 / S1 / S2)、卡死 0、有解、最短解轉動 3 次 (拉「上」→ 拉「左」→ 寫「右」後拉)', () => {
    const r = validateCube(MODEL);
    expect(r.arrangements).toBe(3);
    expect(r.deadEnds).toBe(0);
    expect(r.solvable).toBe(true);
    expect(r.minTurns).toBe(3);
    expect(r.path.filter(p => p.startsWith('lever'))).toEqual(['lever foyer:up', 'lever closet:left', 'lever closet:right']);
    // 與規格 6 列出的最短解同序：進玄關 → 拉「上」→ 樓梯間 → 衣帽間 → 拉「左」→ 推箱 → 取鑰匙 → 1-2d 取卡 → 回衣帽間 → 寫「右」→ 拉「右」→ 章門
    expect(r.path).toEqual([
      'lever foyer:up', 'walk foyer→stair', 'walk stair→closet', 'lever closet:left', 'crate closet→foyer', 'walk closet→foyer',
      'key', 'card', 'walk foyer→closet', 'write', 'lever closet:right', 'exit'
    ]);
  });

  it('抽象狀態數：本模型實算 96 (C8：詞卡也可貼在玄關拉桿上 = 規格 1-3b 的錯誤嘗試，多 27)；只許貼衣帽間拉桿 (C5～C7 的模型) 仍是 69 (非終點 65 + 終點 4)', () => {
    const r = validateCube(MODEL);
    expect(r.states).toBe(96);
    const goals = (m: typeof MODEL) => { const seen = new Set<string>(); const q = [m.initial]; let n = 0; seen.add(m.key(m.initial)); while (q.length) { const s = q.shift()!; if (m.isGoal(s)) { n++; continue; } for (const mv of m.moves(s)) if (!seen.has(m.key(mv.next))) { seen.add(m.key(mv.next)); q.push(mv.next); } } return n; };
    expect(goals(MODEL)).toBe(6);
    const old = validateCube(MODEL, ['write:foyer']);
    expect([old.states, old.arrangements, old.deadEnds, old.minTurns]).toEqual([69, 3, 0, 3]);
  });

  it('捷徑檢查 ④：不寫字 (衣帽間) / 不推箱 / 不拉玄關拉桿 / 不拉衣帽間拉桿 / 不取詞卡 / 不取鑰匙，皆無解；只禁玄關的寫字仍有解 (那是錯誤嘗試，不是必要步驟)', () => {
    expect(validateCube(MODEL, ['write:foyer']).solvable).toBe(true);
    for (const tag of ['write:closet', 'crate', 'lever:foyer', 'lever:closet', 'card', 'key']) {
      const r = validateCube(MODEL, [tag]);
      expect([tag, r.solvable, r.minTurns]).toEqual([tag, false, null]);
    }
  });

  it('確定性：兩次 BFS 結果相同', () => {
    expect(validateCube(MODEL)).toEqual(validateCube(MODEL));
  });
});

describe('validateCube：反向驗證 (故意放壞的模型必須被抓到)', () => {
  it('衣帽間拉桿原字改成「右」：轉不到 S2，箱子過不去 → 無解、全部卡死', () => {
    const r = validateCube(chapterOneModel(CH1_CUBE, { ...CH1_MODEL, levers: { ...CH1_MODEL.levers, closet: 'right' } }));
    expect(r.solvable).toBe(false);
    expect(r.deadEnds).toBe(r.states);
  });

  it('詞卡貼上後拿不下來、且木箱一推過去就回不來 (不可逆動作)：仍可解但出現卡死狀態', () => {
    const m: ChapterModel<Ch1State> = { ...MODEL, moves: s => MODEL.moves(s).filter(mv => mv.label !== 'unwrite' && !(mv.tag === 'crate' && mv.next.crate === 'closet')) };
    const r = validateCube(m);
    expect(r.solvable).toBe(true);
    expect(r.deadEnds).toBeGreaterThan(0);
  });
});
