import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WeaponModelHandle } from '../types';
import { mountOnHand } from './batModels';
import { createTrailMaterial } from '../../effects/SwingTrail';
import { getFxTier, type FxTier } from '../../effects/fxQuality';
import { worldNow } from '../../core/worldClock';

/**
 * 綁帶捆書 (溜溜球式長鞭)：平常手裡直接拿著一疊用綁帶捆好的書 (綁帶收起)；出招時鬆手抓住綁帶末端把書甩出去，
 * 綁帶沿「手部徑向方向的歷史」逐節延遲排列 (越靠書越晚跟上) → 甩動時自然呈弧形 / S 形，書即鞭梢；打完綁帶快速收回、書回到手上。
 *
 * 繪製：綁帶 + 書堆 + 捆書帶合為 1 個世界座標 mesh (Lambert 頂點色，1 draw call)，書飛行軌跡的弧形光帶 + 抽擊閃光合為 1 個拖尾 mesh
 * (與 SwingTrail 共用同一 shader program，已於 swingTrail.prewarm 預熱；無內容時隱藏不產生 draw call)。
 * 頂點於 updateMatrixWorld (renderer.render 內、投影與上傳之前) 每幀改寫，全程零配置。
 *
 * 出招進度由 Player 的武器發光回呼 glow(k, peak) 取得：k = sin(π·u) (u = 拖尾區段進度，命中時間點位於 u = 0.5)、
 * peak > 1.5 為終結技 (BOOK 樣式 glow = 1，終結技 × FINISHER_FX_BOOST.glow)。因此 WHIP 各招 trail 區段中點須等於 strike。
 */

const RINGS = 24;          // 綁帶節數 (環)
const SIDES = 4;           // 綁帶截面邊數
const STRAP_R0 = 0.014;    // 綁帶半徑 (手端 → 書端)
const STRAP_R1 = 0.011;
const HAND_Y = 0.02;       // 綁帶手端 (模型本地 Y)
const BOOK_OFF = 0.12;     // 書堆中心距綁帶末端 (沿綁帶切線)
// 綁帶甩出長度：橫甩 / 旋甩書心約距身體中心 4.2m (扇形 / 圓形判定半徑)；回手抽擊沿前方長條甩到約 4.8m
const LEN_SWEEP = 3.55;
const LEN_LASH = 3.85;
const LAG = 0.065;         // 書端相對手端的方向延遲 (秒)：越大弧形越彎
const LAG_FINISHER = 0.016; // 終結技旋身極快，延遲小才能拉成大圓 (繃直)
const RISE_RATE = 30;      // 甩出速率 (伸長比例 / 秒)
const RETURN_RATE = 7.5;   // 收回速率 (約 0.13 秒收回手上，對齊各招接書關鍵影格)
const HIST = 48;           // 方向歷史環形緩衝

const STRAP_COLORS = [0xb98a55, 0x8d6a3d] as const;
const BOOK_COLORS = [0x2f4f9f, 0xf1ead8, 0xb8403a] as const; // 墨藍、紙白、磚紅
const TIE_COLOR = 0x8d6a3d;

// 拖尾 (書的弧形光帶)：依特效檔位調整歷史點數 / 插值 / 寬度；低檔不出抽擊閃光 (平板 Mali 透明 overdraw)
const TRAIL_MAX_PTS = 14;
const TRAIL_MAX_SUB = 2;
const TRAIL_TIER: Record<FxTier, { pts: number; sub: number; inner: number; flash: boolean }> = {
  high: { pts: 14, sub: 2, inner: 0.45, flash: true },
  medium: { pts: 12, sub: 1, inner: 0.35, flash: true },
  low: { pts: 8, sub: 0, inner: 0.18, flash: false },
};
const TRAIL_LIFE = 0.13;
const TRAIL_LIFE_FINISHER = 0.24;
const FLASH_LIFE = 0.1;
const TRAIL_COLOR = 0xf3efe2;  // 內緣紙白
const TRAIL_TIP = 0x7f98ff;    // 外緣墨藍偏亮

function bake(geo: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// 書堆範本 (書框座標：x = 法向 N、y = 綁帶切線 T、z = 副法向 B；原點 = 綁帶末端)
function buildBookTemplate(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    parts.push(bake(new THREE.BoxGeometry(0.17, 0.23, 0.05).translate((i - 1) * 0.012, BOOK_OFF, (i - 1) * 0.055), BOOK_COLORS[i]));
  }
  // 十字捆書帶
  parts.push(bake(new THREE.BoxGeometry(0.03, 0.236, 0.172).translate(0, BOOK_OFF, 0), TIE_COLOR));
  parts.push(bake(new THREE.BoxGeometry(0.186, 0.03, 0.172).translate(0, BOOK_OFF, 0), TIE_COLOR));
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

export function buildBookWhip(): WeaponModelHandle {
  // ───── 綁帶 + 書堆 (世界座標 mesh) ─────
  const book = buildBookTemplate();
  const bookPos = book.getAttribute('position').array as Float32Array;
  const bookNrm = book.getAttribute('normal').array as Float32Array;
  const bookCol = book.getAttribute('color').array as Float32Array;
  const bookIdx = book.getIndex()!.array;
  const strapVerts = RINGS * SIDES;
  const bookVerts = bookPos.length / 3;
  const totalVerts = strapVerts + bookVerts;
  const pos = new Float32Array(totalVerts * 3);
  const nrm = new Float32Array(totalVerts * 3);
  const col = new Float32Array(totalVerts * 3);
  const idx = new Uint16Array((RINGS - 1) * SIDES * 6 + bookIdx.length);
  let ii = 0;
  const strapCols = STRAP_COLORS.map((h) => new THREE.Color(h));
  for (let r = 0; r < RINGS; r++) {
    const c = strapCols[Math.floor(r / 3) % 2];
    for (let s = 0; s < SIDES; s++) {
      const v = r * SIDES + s;
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
      if (r < RINGS - 1) {
        const a = v, b = r * SIDES + (s + 1) % SIDES, c2 = a + SIDES, d = b + SIDES;
        idx[ii++] = a; idx[ii++] = c2; idx[ii++] = b;
        idx[ii++] = b; idx[ii++] = c2; idx[ii++] = d;
      }
    }
  }
  col.set(bookCol, strapVerts * 3);
  for (let i = 0; i < bookIdx.length; i++) idx[ii++] = bookIdx[i] + strapVerts;
  book.dispose();

  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const nrmAttr = new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('normal', nrmAttr);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const whip = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  whip.castShadow = false;
  whip.receiveShadow = false;
  whip.frustumCulled = false; // 頂點為世界座標且每幀改寫

  // ───── 書軌跡弧光 + 抽擊閃光 (世界座標 mesh) ─────
  const S = (TRAIL_MAX_PTS - 1) * (TRAIL_MAX_SUB + 1) + 1;
  const FLASH_V = 12; // 2 道交叉光條 × 3 列 × 2
  const tVerts = S * 2 + FLASH_V;
  const tPos = new Float32Array(tVerts * 3);
  const tCol = new Float32Array(tVerts * 4);
  const tUv = new Float32Array(tVerts * 2);
  const tIdx = new Uint16Array((S - 1) * 6 + 2 * 2 * 6);
  ii = 0;
  for (let i = 0; i < S; i++) {
    const v = i * 2;
    tUv[v * 2] = 0; tUv[v * 2 + 1] = i / (S - 1);
    tUv[v * 2 + 2] = 1; tUv[v * 2 + 3] = i / (S - 1);
    if (i < S - 1) {
      tIdx[ii++] = v; tIdx[ii++] = v + 1; tIdx[ii++] = v + 2;
      tIdx[ii++] = v + 1; tIdx[ii++] = v + 3; tIdx[ii++] = v + 2;
    }
  }
  for (let f = 0; f < 2; f++) {
    const b = S * 2 + f * 6;
    for (let row = 0; row < 3; row++) {
      tUv[(b + row * 2) * 2] = 0; tUv[(b + row * 2) * 2 + 1] = row / 2;
      tUv[(b + row * 2 + 1) * 2] = 1; tUv[(b + row * 2 + 1) * 2 + 1] = row / 2;
    }
    for (let row = 0; row < 2; row++) {
      const v = b + row * 2;
      tIdx[ii++] = v; tIdx[ii++] = v + 1; tIdx[ii++] = v + 2;
      tIdx[ii++] = v + 1; tIdx[ii++] = v + 3; tIdx[ii++] = v + 2;
    }
  }
  const tGeo = new THREE.BufferGeometry();
  const tPosAttr = new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage);
  const tColAttr = new THREE.BufferAttribute(tCol, 4).setUsage(THREE.DynamicDrawUsage);
  tGeo.setAttribute('position', tPosAttr);
  tGeo.setAttribute('color', tColAttr);
  tGeo.setAttribute('uv', new THREE.BufferAttribute(tUv, 2));
  tGeo.setIndex(new THREE.BufferAttribute(tIdx, 1));
  const trail = new THREE.Mesh(tGeo, createTrailMaterial());
  trail.castShadow = false;
  trail.receiveShadow = false;
  trail.frustumCulled = false;
  trail.renderOrder = 5;
  trail.visible = false;

  const root = new THREE.Group();
  root.add(whip, trail);
  mountOnHand(root);

  // ───── 狀態 (全為純數值 / 預建緩衝) ─────
  const histT = new Float32Array(HIST);
  const histD = new Float32Array(HIST * 3);
  let histHead = 0;
  let histCount = 0;
  let lastTime = -1;
  let ext = 0;            // 綁帶伸長比例 0..1
  let active = false;     // 位於出招拖尾區段內
  let rising = false;     // 命中時間點之前
  let prevK = 0;
  let phase = 0;          // u (0..1)
  let finisher = false;
  let lash = false;       // 回手抽擊 (起手時手高舉過頭)
  let lenMax = LEN_SWEEP;
  let crackPending = false;
  let flashAge = 99;
  const flashP = new Float32Array(3);
  const flashT = new Float32Array(3);
  const flashN = new Float32Array(3);
  const trailPts = new Float32Array(TRAIL_MAX_PTS * 6);
  const trailAges = new Float32Array(TRAIL_MAX_PTS);
  let trailCount = 0;
  let trailLife = TRAIL_LIFE;
  let body: THREE.Object3D | null = null;
  // 書框 (世界)：原點 O、切線 T、法向 N、副法向 B
  let ox = 0, oy = 0, oz = 0, tx = 0, ty = 1, tz = 0, nx = 1, ny = 0, nz = 0, bx = 0, by = 0, bz = 1;

  const pushHist = (t: number, x: number, y: number, z: number) => {
    histHead = (histHead + 1) % HIST;
    histT[histHead] = t;
    histD[histHead * 3] = x; histD[histHead * 3 + 1] = y; histD[histHead * 3 + 2] = z;
    if (histCount < HIST) histCount++;
  };
  // 取時間 tq 的徑向方向 (線性內插，未正規化)，寫入 _d
  const _d = new Float32Array(3);
  const sampleHist = (tq: number) => {
    let i = histHead;
    for (let n = 0; n < histCount - 1; n++) {
      const j = (i - 1 + HIST) % HIST;
      if (histT[j] <= tq) {
        const span = histT[i] - histT[j];
        const f = span > 1e-6 ? (tq - histT[j]) / span : 1;
        _d[0] = histD[j * 3] + (histD[i * 3] - histD[j * 3]) * f;
        _d[1] = histD[j * 3 + 1] + (histD[i * 3 + 1] - histD[j * 3 + 1]) * f;
        _d[2] = histD[j * 3 + 2] + (histD[i * 3 + 2] - histD[j * 3 + 2]) * f;
        return;
      }
      i = j;
    }
    _d[0] = histD[i * 3]; _d[1] = histD[i * 3 + 1]; _d[2] = histD[i * 3 + 2];
  };

  const findBody = (): THREE.Object3D | null => {
    let o: THREE.Object3D = root;
    while (o.parent && !(o.parent as THREE.Scene).isScene) o = o.parent;
    return o === root ? null : o;
  };

  const simulate = () => {
    const now = worldNow() * 0.001;
    let dt = now - lastTime;
    if (lastTime >= 0 && dt < 0.0005) return; // 同一幀多次渲染只算一次
    const fresh = lastTime < 0 || dt > 0.25;
    lastTime = now;
    if (fresh) { histCount = 0; dt = 1 / 60; trailCount = 0; }
    dt = Math.min(dt, 0.05);

    const m = root.matrixWorld.elements;
    // 手部框架 (模型本地軸向，去除蹲姿縮放)
    let ax = m[0], ay = m[1], az = m[2];
    let il = 1 / Math.hypot(ax, ay, az); ax *= il; ay *= il; az *= il;
    let gx = m[4], gy = m[5], gz = m[6];
    il = 1 / Math.hypot(gx, gy, gz); gx *= il; gy *= il; gz *= il;
    let cx = m[8], cy = m[9], cz = m[10];
    il = 1 / Math.hypot(cx, cy, cz); cx *= il; cy *= il; cz *= il;
    const hx = m[12] + m[4] * HAND_Y, hy = m[13] + m[5] * HAND_Y, hz = m[14] + m[6] * HAND_Y;

    if (!body || !body.parent) body = findBody();
    const bm = body ? body.matrixWorld.elements : null;
    const groundY = bm ? bm[13] + 0.06 : -1e9;
    // 甩出方向：胸口 → 手的徑向 (身體旋轉 + 手臂擺動都會帶動)，略往下壓讓書貼近判定平面
    let dx = hx - (bm ? bm[12] : hx - gx), dy = hy - (bm ? bm[13] + 1.2 : hy - gy), dz = hz - (bm ? bm[14] : hz - gz);
    let dl = Math.hypot(dx, dy, dz);
    if (dl < 1e-3) { dx = gx; dy = gy; dz = gz; dl = 1; }
    dx /= dl; dy /= dl; dz /= dl;
    if (active && phase < 0.12 && rising) lash = dy > 0.55; // 起手時手在頭頂 → 回手抽擊
    lenMax = lash ? LEN_LASH : LEN_SWEEP;
    if (lash && bm) {
      // 直線抽擊：水平分量轉到身體正前方 (前方長條判定)，保留仰角 (高舉 → 下抽)
      const hl = Math.hypot(dx, dz);
      let fx = bm[8], fz = bm[10];
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl; fz /= fl;
      dx = fx * hl; dz = fz * hl;
    }
    // 略往下壓：書飛行高度約在腰胸之間 (判定為水平面)
    dy -= lash ? 0.3 : 0.24;
    pushHist(now, dx, dy, dz);

    // 伸長比例：鬆手後急速甩出 (u = 0.4 時已全長)、命中後維持到拖尾區段結束 (回彈追擊仍在外)，之後快速收回手上
    let target = 0;
    if (active) target = rising ? Math.min(1, phase / 0.4) : 1;
    if (ext < target) ext = Math.min(target, ext + dt * RISE_RATE);
    else ext = Math.max(target, ext - dt * RETURN_RATE);
    const e = ext;
    const ee = 1 - (1 - e) * (1 - e); // 甩出 ease-out、收回末段加速
    const len = lenMax * ee;
    const seg = len / (RINGS - 1);
    const lag = finisher ? LAG_FINISHER : LAG;
    const sag = (1 - ee) * 1.6;

    // 綁帶：逐環沿延遲方向積分；截面框架以平行移動延續 (起始取手部 X 軸)
    let px = hx, py = hy, pz = hz;
    let qx = ax, qy = ay, qz = az; // 前一環法向
    let lx = gx, ly = gy, lz = gz; // 最後切線
    for (let r = 0; r < RINGS; r++) {
      const sig = r / (RINGS - 1);
      sampleHist(now - lag * sig);
      let ux = _d[0], uy = _d[1] - sag * sig, uz = _d[2];
      // 近手端沿手部握持方向離手，越往書端越接近延遲徑向
      const hw = (1 - sig) * (1 - sig) * (1 - e * 0.6);
      ux += gx * hw; uy += gy * hw; uz += gz * hw;
      il = 1 / (Math.hypot(ux, uy, uz) || 1); ux *= il; uy *= il; uz *= il;
      if (r > 0) {
        px += ux * seg; py += uy * seg; pz += uz * seg;
        if (py < groundY) py = groundY;
      }
      // 平行移動法向
      const dot = qx * ux + qy * uy + qz * uz;
      qx -= ux * dot; qy -= uy * dot; qz -= uz * dot;
      il = Math.hypot(qx, qy, qz);
      if (il < 1e-4) { qx = -uz; qy = 0; qz = ux; il = Math.hypot(qx, qy, qz) || 1; }
      qx /= il; qy /= il; qz /= il;
      const wx = uy * qz - uz * qy, wy = uz * qx - ux * qz, wz = ux * qy - uy * qx;
      const rad = (STRAP_R0 + (STRAP_R1 - STRAP_R0) * sig) * (e > 0.02 ? 1 : 0.3);
      for (let s = 0; s < SIDES; s++) {
        const a = (s / SIDES) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const ox2 = qx * ca + wx * sa, oy2 = qy * ca + wy * sa, oz2 = qz * ca + wz * sa;
        const v = (r * SIDES + s) * 3;
        pos[v] = px + ox2 * rad; pos[v + 1] = py + oy2 * rad; pos[v + 2] = pz + oz2 * rad;
        nrm[v] = ox2; nrm[v + 1] = oy2; nrm[v + 2] = oz2;
      }
      lx = ux; ly = uy; lz = uz;
    }

    // 書框：手持 (手部框架) ↔ 綁帶末端 (末端切線 + 平行移動法向) 依伸長比例混合
    const k = Math.min(1, e * 5);
    tx = gx + (lx - gx) * k; ty = gy + (ly - gy) * k; tz = gz + (lz - gz) * k;
    il = 1 / (Math.hypot(tx, ty, tz) || 1); tx *= il; ty *= il; tz *= il;
    nx = ax + (qx - ax) * k; ny = ay + (qy - ay) * k; nz = az + (qz - az) * k;
    const nd = nx * tx + ny * ty + nz * tz;
    nx -= tx * nd; ny -= ty * nd; nz -= tz * nd;
    il = Math.hypot(nx, ny, nz);
    if (il < 1e-4) { nx = cx; ny = cy; nz = cz; il = 1; }
    nx /= il; ny /= il; nz /= il;
    bx = ty * nz - tz * ny; by = tz * nx - tx * nz; bz = tx * ny - ty * nx;
    // 收回中書已回到手上就不轉向 (避免書在手中抖)
    if (k <= 0) { bx = cx; by = cy; bz = cz; }
    ox = px; oy = py; oz = pz;
    for (let i = 0, n = bookVerts; i < n; i++) {
      const s3 = i * 3, v = (strapVerts + i) * 3;
      const x = bookPos[s3], y = bookPos[s3 + 1], z = bookPos[s3 + 2];
      pos[v] = ox + nx * x + tx * y + bx * z;
      pos[v + 1] = oy + ny * x + ty * y + by * z;
      pos[v + 2] = oz + nz * x + tz * y + bz * z;
      const x2 = bookNrm[s3], y2 = bookNrm[s3 + 1], z2 = bookNrm[s3 + 2];
      nrm[v] = nx * x2 + tx * y2 + bx * z2;
      nrm[v + 1] = ny * x2 + ty * y2 + by * z2;
      nrm[v + 2] = nz * x2 + tz * y2 + bz * z2;
    }
    posAttr.needsUpdate = true;
    nrmAttr.needsUpdate = true;

    updateTrail(dt);
  };

  const updateTrail = (dt: number) => {
    const tier = TRAIL_TIER[getFxTier()];
    // 書心 (書框原點沿切線 BOOK_OFF)；光帶外緣過書外端、內緣沿綁帶往手端
    const bcx = ox + tx * BOOK_OFF, bcy = oy + ty * BOOK_OFF, bcz = oz + tz * BOOK_OFF;
    if (crackPending) {
      crackPending = false;
      if (tier.flash) {
        flashAge = 0;
        flashP[0] = bcx; flashP[1] = bcy; flashP[2] = bcz;
        flashT[0] = tx; flashT[1] = ty; flashT[2] = tz;
        flashN[0] = nx; flashN[1] = ny; flashN[2] = nz;
      }
    }
    for (let i = 0; i < trailCount; i++) trailAges[i] += dt;
    let drop = 0;
    while (drop < trailCount && trailAges[drop] >= trailLife) drop++;
    if (trailCount > tier.pts) drop = Math.max(drop, trailCount - tier.pts);
    if (drop > 0) {
      trailPts.copyWithin(0, drop * 6, trailCount * 6);
      trailAges.copyWithin(0, drop, trailCount);
      trailCount -= drop;
    }
    if (active && ext > 0.35) {
      const ix = bcx - tx * tier.inner, iy = bcy - ty * tier.inner, iz = bcz - tz * tier.inner;
      const fx = bcx + tx * 0.16, fy = bcy + ty * 0.16, fz = bcz + tz * 0.16;
      let skip = false;
      if (trailCount > 0) {
        const o = (trailCount - 1) * 6;
        const ddx = fx - trailPts[o + 3], ddy = fy - trailPts[o + 4], ddz = fz - trailPts[o + 5];
        skip = ddx * ddx + ddy * ddy + ddz * ddz < 1e-4;
      }
      if (!skip) {
        if (trailCount >= tier.pts) {
          trailPts.copyWithin(0, 6, trailCount * 6);
          trailAges.copyWithin(0, 1, trailCount);
          trailCount--;
        }
        const o = trailCount * 6;
        trailPts[o] = ix; trailPts[o + 1] = iy; trailPts[o + 2] = iz;
        trailPts[o + 3] = fx; trailPts[o + 4] = fy; trailPts[o + 5] = fz;
        trailAges[trailCount] = 0;
        trailCount++;
      }
    }
    flashAge += dt;
    const flashOn = flashAge < FLASH_LIFE;
    const any = trailCount >= 2 || flashOn;
    if (!any) {
      if (trail.visible) { tCol.fill(0); tColAttr.needsUpdate = true; trail.visible = false; }
      return;
    }
    trail.visible = true;
    writeTrail(tier.sub);
    writeFlash(flashOn);
    tPosAttr.needsUpdate = true;
    tColAttr.needsUpdate = true;
  };

  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
  };
  const rB = ((TRAIL_COLOR >> 16) & 255) / 255, gB = ((TRAIL_COLOR >> 8) & 255) / 255, bB = (TRAIL_COLOR & 255) / 255;
  const rT = ((TRAIL_TIP >> 16) & 255) / 255, gT = ((TRAIL_TIP >> 8) & 255) / 255, bT = (TRAIL_TIP & 255) / 255;

  const writeTrail = (subWanted: number) => {
    const n = trailCount;
    if (n < 2) { tPos.fill(0, 0, S * 6); tCol.fill(0, 0, S * 8); return; }
    const sub = Math.min(TRAIL_MAX_SUB, subWanted);
    const total = (n - 1) * (sub + 1) + 1;
    const intensity = finisher ? 1.35 : 1.1;
    for (let k = 0; k < S; k++) {
      const kk = k < total ? k : total - 1;
      const segI = Math.min(n - 2, Math.floor(kk / (sub + 1)));
      const t = kk === total - 1 ? 1 : sub === 0 ? 0 : (kk - segI * (sub + 1)) / (sub + 1);
      const i1 = segI, i2 = segI + 1, i0 = segI > 0 ? segI - 1 : segI, i3 = segI + 2 < n ? segI + 2 : i2;
      const v = k * 6;
      for (let c = 0; c < 6; c++) tPos[v + c] = cr(trailPts[i0 * 6 + c], trailPts[i1 * 6 + c], trailPts[i2 * 6 + c], trailPts[i3 * 6 + c], t);
      let f = 0;
      if (k < total) {
        const age = trailAges[i1] + (trailAges[i2] - trailAges[i1]) * t;
        f = 1 - age / trailLife;
        f = f > 0 ? f * f : 0;
      }
      const a = Math.min(1, f * intensity * 0.85);
      const gi = f * 0.95;
      const c4 = k * 8;
      tCol[c4] = rB * gi * 0.35; tCol[c4 + 1] = gB * gi * 0.35; tCol[c4 + 2] = bB * gi * 0.35; tCol[c4 + 3] = a * 0.35;
      tCol[c4 + 4] = (rT + (1 - rT) * 0.45) * gi; tCol[c4 + 5] = (gT + (1 - gT) * 0.45) * gi; tCol[c4 + 6] = (bT + (1 - bT) * 0.45) * gi; tCol[c4 + 7] = a;
    }
  };

  // 抽擊閃光：書心兩道交叉光條 (沿切線 / 法向)，快速放大淡出
  const writeFlash = (on: boolean) => {
    const base = S * 2;
    if (!on) { tCol.fill(0, base * 4, (base + FLASH_V) * 4); return; }
    const u = flashAge / FLASH_LIFE;
    const len = (finisher ? 1.5 : 1.0) * (0.45 + 0.75 * u);
    const wid = (finisher ? 0.32 : 0.22) * (1 - 0.5 * u);
    const bri = (1 - u) * (1 - u);
    const fbx = flashT[1] * flashN[2] - flashT[2] * flashN[1];
    const fby = flashT[2] * flashN[0] - flashT[0] * flashN[2];
    const fbz = flashT[0] * flashN[1] - flashT[1] * flashN[0];
    for (let f = 0; f < 2; f++) {
      // 光條長軸 L、寬軸 W
      const Lx = f === 0 ? flashT[0] : flashN[0], Ly = f === 0 ? flashT[1] : flashN[1], Lz = f === 0 ? flashT[2] : flashN[2];
      const Wx = f === 0 ? flashN[0] : fbx, Wy = f === 0 ? flashN[1] : fby, Wz = f === 0 ? flashN[2] : fbz;
      for (let row = 0; row < 3; row++) {
        const sl = (row - 1) * len * 0.5;
        const mid = row === 1 ? 1 : 0;
        for (let side = 0; side < 2; side++) {
          const sw = (side - 0.5) * wid * (mid ? 1 : 0.3);
          const v = (base + f * 6 + row * 2 + side);
          tPos[v * 3] = flashP[0] + Lx * sl + Wx * sw;
          tPos[v * 3 + 1] = flashP[1] + Ly * sl + Wy * sw;
          tPos[v * 3 + 2] = flashP[2] + Lz * sl + Wz * sw;
          const g = bri * mid;
          tCol[v * 4] = g; tCol[v * 4 + 1] = g * 0.97; tCol[v * 4 + 2] = g * 0.9; tCol[v * 4 + 3] = g * 0.9;
        }
      }
    }
  };

  // 綁帶 / 拖尾 mesh 頂點為世界座標：世界矩陣固定為單位矩陣；模擬於渲染前的矩陣更新階段執行 (root 已更新)
  whip.matrixAutoUpdate = false;
  trail.matrixAutoUpdate = false;
  whip.updateMatrixWorld = function () {
    this.matrixWorld.identity();
    this.matrixWorldNeedsUpdate = false;
    if (!root.visible) { lastTime = -1; return; }
    simulate();
  };
  trail.updateMatrixWorld = function () {
    this.matrixWorld.identity();
    this.matrixWorldNeedsUpdate = false;
  };

  const resetSwing = () => {
    if (active && rising) crackPending = true; // 未偵測到峰值即結束 (極短區段)，仍補出閃光
    active = false;
    rising = false;
    prevK = 0;
  };

  return {
    parts: { R: root },
    // 以出招拖尾進度驅動 (見檔頭)：k 上升段 = 甩出、k 開始下降 = 越過命中時間點 (書在最外側抽擊)
    glow: (k, peak) => {
      if (!active) {
        active = true;
        rising = true;
        finisher = peak > 1.5;
        lash = false;
        trailLife = finisher ? TRAIL_LIFE_FINISHER : TRAIL_LIFE;
        prevK = 0;
      }
      if (rising && k < prevK - 1e-4) { rising = false; crackPending = true; }
      prevK = k;
      const a = Math.asin(Math.min(1, Math.max(0, k))) / Math.PI;
      phase = rising ? a : 1 - a;
    },
    resetGlow: resetSwing
  };
}
