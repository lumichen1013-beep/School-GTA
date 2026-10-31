// 彈弓瞄準姿勢 (蓄力滿時的雙臂角度，Player 依蓄力比例插值；手臂 x 旋轉負值 = 前舉)。
// 右臂前舉持弓架；左臂 (拉弦手) 向內前伸到彈兜附近。模型掛點旋轉由 slingshotModel 依右臂角度推算 (模型 +Y 轉到臂前方)。
export const SLING_AIM_STANCE = {
  rightArm: { x: -1.45, y: 0.04, z: 0.02 },
  leftArm: { x: -1.3, y: 0, z: 0.8 }
} as const;
