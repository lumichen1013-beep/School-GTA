// 投射物碰撞純函式 (無 three.js 場景依賴、零配置，可單元測試)。
// 每幀以 prevPos → pos 線段做解析式掃掠判定 (高速彈體一幀數公尺也不會穿透，不需子步)，回傳線段參數 t ∈ [0, 1] (-1 = 未命中)。
// 呼叫端取所有候選中 t 最小者為本幀命中。禁止以 THREE.Raycaster 掃場景。

export interface MutableVec3 { x: number; y: number; z: number }

// 角色受擊膠囊 (垂直)：軸線 y + y0 ~ y + y1、半徑 r (另加彈體半徑)
export const HUMAN_CAPSULE_Y0 = 0.2;
export const HUMAN_CAPSULE_Y1 = 1.55;
export const HUMAN_CAPSULE_R = 0.35;
// 犬型 (校犬 / 特訓警戒犬)：半徑 0.4、高 0.8 → 軸線退化為 y + 0.4 的一點 (球體涵蓋 0 ~ 0.8)
export const DOG_CAPSULE_Y0 = 0.4;
export const DOG_CAPSULE_Y1 = 0.4;
export const DOG_CAPSULE_R = 0.4;

// 爆頭判定：命中點高於目標腳底此高度 (只限人型)
export const HEADSHOT_HEIGHT = 1.4;

// 射程傷害倍率：near (m) 內全額，near → far 線性衰減到 minMul，之後維持 minMul；near <= 0 = 不衰減
export function rangeDamageMul(dist: number, near: number, far: number, minMul: number): number {
  if (near <= 0 || dist <= near) return 1;
  if (dist >= far) return minMul;
  return 1 + (minMul - 1) * ((dist - near) / (far - near));
}

export function isCanineRole(role: string): boolean {
  return role === 'DOG' || role === 'DETENTION_WOLF';
}

// 命中點高度 (高於目標腳底) 是否算爆頭：高於 HEADSHOT_HEIGHT 且非犬型
export function isHeadshotHit(hitHeight: number, role: string): boolean {
  return hitHeight > HEADSHOT_HEIGHT && !isCanineRole(role);
}

// 線段 A→B 對球心 S、半徑 r 的球：回傳進入時的 t (起點已在球內回傳 0)
export function segmentSphereT(
  ax: number, ay: number, az: number, dx: number, dy: number, dz: number,
  sx: number, sy: number, sz: number, r: number
): number {
  const fx = ax - sx, fy = ay - sy, fz = az - sz;
  const c = fx * fx + fy * fy + fz * fz - r * r;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy + dz * dz;
  if (a < 1e-12) return -1;
  const b = fx * dx + fy * dy + fz * dz;
  if (b >= 0) return -1; // 遠離球心
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t <= 1 ? t : -1;
}

// 線段 A→B 對垂直膠囊 (軸線 (cx, y0..y1, cz)、半徑 r)：回傳首次接觸的 t。
// 膠囊 = 有限圓柱 ∪ 兩端球；各凸塊進入 t 的最小值即進入聯集的 t。起點在膠囊內 (線段最近點距離 ≤ r) 回傳 0
export function segmentCapsuleT(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  cx: number, cz: number, y0: number, y1: number, r: number
): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  // 起點至軸線最近點
  const yc = ay < y0 ? y0 : ay > y1 ? y1 : ay;
  const ex = ax - cx, ey = ay - yc, ez = az - cz;
  if (ex * ex + ey * ey + ez * ez <= r * r) return 0;

  let best = 2;
  // 圓柱側面 (XZ 二次式)
  const a = dx * dx + dz * dz;
  if (a > 1e-12) {
    const fx = ax - cx, fz = az - cz;
    const b = fx * dx + fz * dz;
    const c = fx * fx + fz * fz - r * r;
    const disc = b * b - a * c;
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0 && t <= 1) {
        const y = ay + dy * t;
        if (y >= y0 && y <= y1) best = t;
      }
    }
  }
  // 兩端球帽
  const t0 = segmentSphereT(ax, ay, az, dx, dy, dz, cx, y0, cz, r);
  if (t0 >= 0 && t0 < best) best = t0;
  if (y1 !== y0) {
    const t1 = segmentSphereT(ax, ay, az, dx, dy, dz, cx, y1, cz, r);
    if (t1 >= 0 && t1 < best) best = t1;
  }
  return best <= 1 ? best : -1;
}

// 線段 A→B 對 AABB (slab 法，盒子各面外擴 pad = 彈體半徑)：回傳進入 t，並將撞擊面外法線寫入 outNormal。
// 起點已在盒內回傳 0，法線取與行進方向主軸相反的方向 (把彈體推回來處)
export function segmentAabbT(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number,
  pad: number, outNormal: MutableVec3
): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  let tmin = -Infinity;
  let tmax = Infinity;
  let axis = -1;
  let sign = 0;
  // X
  if (Math.abs(dx) < 1e-12) {
    if (ax < minX - pad || ax > maxX + pad) return -1;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - pad - ax) * inv, t2 = (maxX + pad - ax) * inv;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) { tmin = t1; axis = 0; sign = dx > 0 ? -1 : 1; }
    if (t2 < tmax) tmax = t2;
  }
  // Y
  if (Math.abs(dy) < 1e-12) {
    if (ay < minY - pad || ay > maxY + pad) return -1;
  } else {
    const inv = 1 / dy;
    let t1 = (minY - pad - ay) * inv, t2 = (maxY + pad - ay) * inv;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) { tmin = t1; axis = 1; sign = dy > 0 ? -1 : 1; }
    if (t2 < tmax) tmax = t2;
  }
  // Z
  if (Math.abs(dz) < 1e-12) {
    if (az < minZ - pad || az > maxZ + pad) return -1;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - pad - az) * inv, t2 = (maxZ + pad - az) * inv;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) { tmin = t1; axis = 2; sign = dz > 0 ? -1 : 1; }
    if (t2 < tmax) tmax = t2;
  }
  if (tmin > tmax || tmax < 0 || tmin > 1) return -1;
  outNormal.x = 0; outNormal.y = 0; outNormal.z = 0;
  if (tmin < 0 || axis < 0) {
    // 起點在盒內：沿行進主軸反推
    const adx = Math.abs(dx), ady = Math.abs(dy), adz = Math.abs(dz);
    if (adx >= ady && adx >= adz) outNormal.x = dx > 0 ? -1 : 1;
    else if (ady >= adz) outNormal.y = dy > 0 ? -1 : 1;
    else outNormal.z = dz > 0 ? -1 : 1;
    return 0;
  }
  if (axis === 0) outNormal.x = sign;
  else if (axis === 1) outNormal.y = sign;
  else outNormal.z = sign;
  return tmin;
}

// 線段對水平地板 (彈體底部 = 中心 y - r 觸及 floorY)：回傳接觸 t。起點已貼地且向下移動回傳 0，向上離開回傳 -1
export function segmentFloorT(ay: number, by: number, r: number, floorY: number): number {
  const a = ay - r - floorY;
  const b = by - r - floorY;
  if (a <= 0) return by < ay ? 0 : -1;
  if (b > 0) return -1;
  return a / (a - b);
}

// 二次貝茲曲線 (起點 p0、控制點 p1、終點 p2) 於 u 的單軸值
export function quadBezier(p0: number, p1: number, p2: number, u: number): number {
  const v = 1 - u;
  return v * v * p0 + 2 * v * u * p1 + u * u * p2;
}

// 回收 (RETURN) 飛行秒數：距離 / 60 m/s，限制於 0.1 ~ 0.3 秒 (籃球氣功彈：命中後化為光束極速收回，不拖慢連段節奏)
export const RETURN_SPEED = 60;
export const RETURN_T_MIN = 0.1;
export const RETURN_T_MAX = 0.3;
export function returnDuration(dist: number): number {
  const t = dist / RETURN_SPEED;
  return t < RETURN_T_MIN ? RETURN_T_MIN : t > RETURN_T_MAX ? RETURN_T_MAX : t;
}
