import { defineMove, E_IN, E_OUT, E_SMOOTH, REST, type KfMove } from '../../entities/shared/kungfu';

// 彈弓放手招式「放弦」(單發，非三段連段)：命中時間點 (石子離弦) 在 0.05 進度；
// 蓄力姿勢由 Player 依蓄力比例插值 (readyPose 'SLING_AIM')，招式第 0 格取當下畫面姿勢無縫接續。
// 右臂維持前指並微微後座，左臂 (拉弦手) 放鬆回彈。獨立於 kungfu.ts。
export function createSlingRelease(): readonly KfMove[] {
  return [defineMove('放弦', {
    dur: 0.3, strike: 0.05, cancel: 0.8, reach: 1.0, arc: -1, dmg: 1.0, knock: 0, projectile: 'SLING'
  }, [
    [0.05, E_IN, { tw: 0, ln: -0.04, h: 0, la: [-1.15, 0, 0.5], ra: [-1.5, 0, -0.04], ll: [-0.2, 0, -0.05], rr: [0.2, 0, 0.05] }],
    [0.4, E_OUT, { tw: 0, ln: 0, h: 0, la: [-0.6, 0, 0.25], ra: [-1.3, 0, -0.04], ll: [-0.1, 0, -0.04], rr: [0.1, 0, 0.04] }],
    [1, E_SMOOTH, REST]
  ])];
}
