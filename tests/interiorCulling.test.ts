import { describe, expect, it } from 'vitest';
import { PAB_ENTRANCE_VIEW, computePabInteriorVisibility, isWithinView, type PabInteriorVisibility } from '../src/world/interiorCulling';

const fresh = (): PabInteriorVisibility => ({ hall: false, shaft: false, floor4: false, nearEntrance: false });
// 鏡頭與玩家同位置時的判定 (玩家 Y 為腳底，判定點另加 1.35m)
const at = (x: number, y: number, z: number, wasNear = false) =>
  computePabInteriorVisibility(x, y + 1.35, z, x, y, z, wasNear, fresh());

describe('演藝大樓室內剔除', () => {
  it('遠處室外：全部室內不畫', () => {
    expect(at(-20, 0, 30)).toMatchObject({ hall: false, shaft: false, floor4: false });
    expect(at(100, 0, 38)).toMatchObject({ hall: false, shaft: false, floor4: false }); // 東側實牆外
  });

  it('正門前方可經大門看進演藝廳：顯示 1~3F 與井道，4F 不畫', () => {
    expect(at(40, 0, 38)).toMatchObject({ hall: true, shaft: true, floor4: false, nearEntrance: true });
  });

  it('正門可視距離有遲滯', () => {
    const x = 62 - (PAB_ENTRANCE_VIEW.enter + PAB_ENTRANCE_VIEW.exit) / 2;
    expect(at(x, 0, 38, false).hall).toBe(false);
    expect(at(x, 0, 38, true).hall).toBe(true);
  });

  it('1F 演藝廳內：4F 不畫；4F 羽球館內：演藝廳不畫', () => {
    expect(at(74, 0, 38)).toMatchObject({ hall: true, shaft: true, floor4: false });
    expect(at(74, 12, 38)).toMatchObject({ hall: false, shaft: true, floor4: true });
  });

  it('電梯車廂內 (上下樓過場)：兩層都畫', () => {
    expect(at(65.5, 0, 43.5)).toMatchObject({ hall: true, shaft: true, floor4: true });
    expect(at(65.5, 6, 43.5)).toMatchObject({ hall: true, shaft: true, floor4: true });
  });

  it('鏡頭被推出牆外但玩家仍在室內時不剔除', () => {
    const v = computePabInteriorVisibility(90, 14, 38, 84, 12, 38, false, fresh());
    expect(v.floor4).toBe(true);
  });
});

describe('isWithinView 距離顯示遲滯', () => {
  const view = { enter: 10, exit: 12 };
  it('進入/離開半徑不同', () => {
    expect(isWithinView(11, 0, 0, 0, false, view)).toBe(false);
    expect(isWithinView(11, 0, 0, 0, true, view)).toBe(true);
    expect(isWithinView(9, 0, 0, 0, false, view)).toBe(true);
    expect(isWithinView(13, 0, 0, 0, true, view)).toBe(false);
  });
});
