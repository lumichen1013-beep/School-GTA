// 建築室內渲染剔除判定 (純量運算、0-GC)：只決定各室內群組是否繪製，碰撞體與遊戲邏輯不受影響。
// 判定以「鏡頭」與「玩家」兩點取聯集：任一點位於可看見該室內的位置即顯示，避免鏡頭貼牆被推出室外時誤剔除。

// 演藝大樓 (外殼 X: 62~86、Z: 22~54；屋頂 Y 22.3；4F 樓板頂面 Y 12.0)
export const PAB_BOUNDS = { minX: 62, maxX: 86, minZ: 22, maxZ: 54, roofY: 22.3, floor4Y: 11.8 } as const;
// 西側正門開口 (X 62、Z 34~42、高 3.2m)：唯一可由室外看進 1~3F 演藝廳的開口
export const PAB_ENTRANCE = { x: 62, z: 38 } as const;
// 室外於正門前方此距離內 (水平) 顯示演藝廳內部；遲滯 5m 避免來回走動時切換閃爍
export const PAB_ENTRANCE_VIEW = { enter: 60, exit: 65 } as const;
// 電梯井道 (X: 63.6~67.4、Z: 42~45.2)：觀景玻璃同時面向 1~3F 演藝廳與 4F 羽球館
const PAB_SHAFT = { minX: 63.6, maxX: 67.4, minZ: 42.0, maxZ: 45.2 } as const;

export interface PabInteriorVisibility {
  hall: boolean;         // 1~3F 演藝廳 (舞台、銀幕、座椅、橫樑)
  shaft: boolean;        // 電梯井道與車廂 (1F/4F 門廳)
  floor4: boolean;       // 4F 羽球館場地 (地墊、白線、球網、裁判椅)
  nearEntrance: boolean; // 室外位於正門可視範圍 (供下次判定遲滯使用)
}

function inPab(x: number, y: number, z: number): boolean {
  const b = PAB_BOUNDS;
  return x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && y < b.roofY && y > -1;
}

function inShaft(x: number, z: number): boolean {
  const s = PAB_SHAFT;
  return x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;
}

// 位於正門外側 (X <= 62.5) 且水平距離門口在範圍內：可經由敞開的玻璃大門看見演藝廳內部
function seesEntrance(x: number, z: number, wasNear: boolean): boolean {
  if (x > PAB_ENTRANCE.x + 0.5) return false;
  const dx = x - PAB_ENTRANCE.x;
  const dz = z - PAB_ENTRANCE.z;
  const r = wasNear ? PAB_ENTRANCE_VIEW.exit : PAB_ENTRANCE_VIEW.enter;
  return dx * dx + dz * dz < r * r;
}

function pointVisibility(x: number, y: number, z: number, wasNear: boolean, out: PabInteriorVisibility) {
  const inside = inPab(x, y, z);
  const shaft = inside && inShaft(x, z);
  const near = !inside && seesEntrance(x, z, wasNear);
  out.nearEntrance = out.nearEntrance || near;
  out.hall = out.hall || near || shaft || (inside && y < PAB_BOUNDS.floor4Y);
  out.shaft = out.shaft || near || inside;
  out.floor4 = out.floor4 || shaft || (inside && y >= PAB_BOUNDS.floor4Y);
}

export function computePabInteriorVisibility(
  camX: number, camY: number, camZ: number,
  playerX: number, playerY: number, playerZ: number,
  wasNearEntrance: boolean,
  out: PabInteriorVisibility
): PabInteriorVisibility {
  out.hall = out.shaft = out.floor4 = out.nearEntrance = false;
  pointVisibility(camX, camY, camZ, wasNearEntrance, out);
  pointVisibility(playerX, playerY + 1.35, playerZ, wasNearEntrance, out);
  return out;
}

// 樓梯間告示牌 (每張為獨立畫布貼圖的透明網格，無法合併)：距離樓梯間入口水平距離內才顯示，遠處文字本就無法辨識
export const STAIR_SIGN_VIEW = { enter: 32, exit: 36 } as const;

export function isWithinView(x: number, z: number, cx: number, cz: number, wasVisible: boolean, view: { enter: number; exit: number }): boolean {
  const dx = x - cx;
  const dz = z - cz;
  const r = wasVisible ? view.exit : view.enter;
  return dx * dx + dz * dz < r * r;
}
