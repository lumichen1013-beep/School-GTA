import * as THREE from 'three';
import { FX_POOL_MAX, getFxQuality } from './fxQuality';
import { updateVisibleMatricesOnly } from '../core/matrixUpdate';
import { FINISHER_FX_BOOST, TRAIL_WIDTH, type WeaponFxStyle } from './weaponFxStyle';

// 揮擊拖尾：4 條軌跡 (右手 0/1、左手 2/3 輪替) 共用 1 個 BufferGeometry / Mesh (1 draw call)，預配置緩衝、執行期零配置。
// 歷史點以 Catmull-Rom 平滑；頂點色為預乘 alpha (rgb 超出 alpha 的部分等同加亮)，
// 以 ONE / ONE_MINUS_SRC_ALPHA 混合：亮色地面上純 Additive 會被洗白，改此法兼具發光與遮蓋。
const SLOTS = 4;
const BASE_DIM = 0.4;  // 握把端相對亮度
const TIP_WHITE = 0.4; // 尖端色往白色混合比例 (亮白核心)

interface Slot {
  open: boolean;      // 仍在接收 push
  count: number;
  pts: Float32Array;  // 每點 6 值：base xyz + tip xyz (舊 → 新)
  ages: Float32Array;
  r: number; g: number; b: number;
  tr: number; tg: number; tb: number;
  intensity: number;
  life: number;
  width: number;
}

// 單軸 Catmull-Rom (p1→p2 之間，t∈[0,1])
function cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}

function createSoftEdgeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 8;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.25, 'rgba(255,255,255,1)');
  g.addColorStop(0.8, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.clearRect(0, 0, 64, 8);
  ctx.fillRect(0, 0, 64, 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

class SwingTrailSystem {
  private mesh: THREE.Mesh | null = null;
  private positions!: Float32Array;
  private colors!: Float32Array;
  private posAttr!: THREE.BufferAttribute;
  private colAttr!: THREE.BufferAttribute;
  private slots: Slot[] = [];
  private maxSamples = 0;
  private hist = 0;

  // 初始化並加入場景 (閒置時 visible=false，不產生 draw call)
  public init(scene: THREE.Object3D) {
    if (this.mesh) return;
    // 緩衝依最高檔 (最多歷史點 × 最多插值) 預建；實際插值數每幀取目前檔位，不足的樣本退化為零面積
    this.hist = FX_POOL_MAX.trailPoints;
    this.maxSamples = (this.hist - 1) * (FX_POOL_MAX.trailSubdiv + 1) + 1;
    const S = this.maxSamples;
    const vertsPerSlot = S * 2;
    const total = vertsPerSlot * SLOTS;
    this.positions = new Float32Array(total * 3);
    this.colors = new Float32Array(total * 4);
    const uvs = new Float32Array(total * 2);
    const indices = new Uint16Array(SLOTS * (S - 1) * 6);
    let ii = 0;
    for (let s = 0; s < SLOTS; s++) {
      for (let i = 0; i < S; i++) {
        const v = (s * S + i) * 2;
        const vv = i / (S - 1);
        uvs[v * 2] = 0; uvs[v * 2 + 1] = vv;
        uvs[v * 2 + 2] = 1; uvs[v * 2 + 3] = vv;
        if (i < S - 1) {
          indices[ii++] = v; indices[ii++] = v + 1; indices[ii++] = v + 2;
          indices[ii++] = v + 1; indices[ii++] = v + 3; indices[ii++] = v + 2;
        }
      }
      this.slots.push({
        open: false, count: 0, pts: new Float32Array(this.hist * 6), ages: new Float32Array(this.hist),
        r: 1, g: 1, b: 1, tr: 1, tg: 1, tb: 1, intensity: 1, life: 0.14, width: 1,
      });
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    const mat = new THREE.MeshBasicMaterial({
      map: createSoftEdgeTexture(), vertexColors: true, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
      depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    });
    // 貼圖只取 alpha 作柔邊並預乘進 rgb
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>',
        'float edgeA = texture2D(map, vMapUv).a;\ndiffuseColor.rgb *= edgeA;\ndiffuseColor.a *= edgeA;');
    };
    mat.customProgramCacheKey = () => 'swingTrailPremul';
    mat.forceSinglePass = true; // 雙面透明預設分兩趟繪製，強制單趟以維持 1 draw call
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false; // 頂點每幀改動，略過包圍球剔除
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    updateVisibleMatricesOnly(this.mesh); // 閒置隱藏時略過矩陣更新
    scene.add(this.mesh);
  }

  // 暫時顯示以便 renderer.compile 預熱 shader
  public prewarm(compile: () => void) {
    if (!this.mesh) return;
    this.mesh.visible = true;
    compile();
    this.mesh.visible = false;
  }

  // 清空所有軌跡 (切換世界 / 死亡復活時呼叫)，不配置新物件
  public reset() {
    if (!this.mesh) return;
    for (const s of this.slots) { s.open = false; s.count = 0; }
    this.positions.fill(0);
    this.colors.fill(0);
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.mesh.visible = false;
  }

  // 開始一條軌跡 (重用同一槽會清空舊點)
  public begin(slot: number, style: WeaponFxStyle, finisher: boolean) {
    const s = this.slots[slot];
    if (!s) return;
    const boost = finisher ? FINISHER_FX_BOOST : null;
    s.open = true;
    s.count = 0;
    s.r = ((style.color >> 16) & 255) / 255; s.g = ((style.color >> 8) & 255) / 255; s.b = (style.color & 255) / 255;
    s.tr = ((style.tipColor >> 16) & 255) / 255; s.tg = ((style.tipColor >> 8) & 255) / 255; s.tb = (style.tipColor & 255) / 255;
    s.tr += (1 - s.tr) * TIP_WHITE; s.tg += (1 - s.tg) * TIP_WHITE; s.tb += (1 - s.tb) * TIP_WHITE;
    s.intensity = style.intensity * (boost ? boost.brightness : 1);
    s.life = style.life * (boost ? boost.life : 1);
    s.width = boost ? boost.width : TRAIL_WIDTH;
  }

  // 加入目前 base / tip 世界座標 (與上一點幾乎重合時略過)
  public push(slot: number, base: THREE.Vector3, tip: THREE.Vector3) {
    const s = this.slots[slot];
    if (!s || !s.open) return;
    // 條帶加寬：沿握把 → 尖端方向兩端外擴 (尖端佔 70%、握把端 30%)
    const w = s.width - 1;
    const tx = tip.x + (tip.x - base.x) * w * 0.7;
    const ty = tip.y + (tip.y - base.y) * w * 0.7;
    const tz = tip.z + (tip.z - base.z) * w * 0.7;
    const bx = base.x - (tip.x - base.x) * w * 0.3;
    const by = base.y - (tip.y - base.y) * w * 0.3;
    const bz = base.z - (tip.z - base.z) * w * 0.3;
    if (s.count > 0) {
      const o = (s.count - 1) * 6;
      const dx = tx - s.pts[o + 3], dy = ty - s.pts[o + 4], dz = tz - s.pts[o + 5];
      if (dx * dx + dy * dy + dz * dz < 1e-6) return;
    }
    // 歷史點上限依目前檔位 (不超過預建容量)；降檔後殘留較多點時一次丟棄最舊的多餘點
    const lim = Math.min(this.hist, getFxQuality().trailPoints);
    if (s.count >= lim) {
      const drop = s.count - lim + 1;
      s.pts.copyWithin(0, drop * 6, s.count * 6);
      s.ages.copyWithin(0, drop, s.count);
      s.count -= drop;
    }
    const o = s.count * 6;
    s.pts[o] = bx; s.pts[o + 1] = by; s.pts[o + 2] = bz;
    s.pts[o + 3] = tx; s.pts[o + 4] = ty; s.pts[o + 5] = tz;
    s.ages[s.count] = 0;
    s.count++;
  }

  // 停止接收新點，殘影自然淡出
  public end(slot: number) {
    const s = this.slots[slot];
    if (s) s.open = false;
  }

  public update(delta: number) {
    if (!this.mesh) return;
    // 閒置 (隱藏且各槽皆無點)：隱藏時緩衝必已清空，略過逐槽清除與頂點上傳
    if (!this.mesh.visible && this.isIdle()) return;
    let any = false;
    for (let si = 0; si < SLOTS; si++) {
      const s = this.slots[si];
      if (s.count === 0) { if (this.writeSlot(si, s)) any = true; continue; }
      for (let i = 0; i < s.count; i++) s.ages[i] += delta;
      let drop = 0;
      while (drop < s.count && s.ages[drop] >= s.life) drop++;
      if (drop > 0) {
        s.pts.copyWithin(0, drop * 6, s.count * 6);
        s.ages.copyWithin(0, drop, s.count);
        s.count -= drop;
      }
      if (this.writeSlot(si, s) || s.count > 0) any = true;
    }
    if (any || this.mesh.visible) {
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
    }
    this.mesh.visible = any;
  }

  private isIdle(): boolean {
    for (let si = 0; si < SLOTS; si++) if (this.slots[si].count > 0) return false;
    return true;
  }

  // 將槽內歷史點展開成條帶頂點；回傳是否有可見內容
  private writeSlot(si: number, s: Slot): boolean {
    const S = this.maxSamples;
    const base = si * S * 2;
    const n = s.count;
    const pos = this.positions;
    const col = this.colors;
    if (n < 2) {
      // 無可見內容：全部退化為零面積並塗黑 (僅在上一幀有內容時才需清，這裡成本極低)
      pos.fill(0, base * 3, (base + S * 2) * 3);
      col.fill(0, base * 4, (base + S * 2) * 4);
      return false;
    }
    const sub = Math.min(FX_POOL_MAX.trailSubdiv, getFxQuality().trailSubdiv);
    const total = (n - 1) * (sub + 1) + 1;
    const pts = s.pts;
    for (let k = 0; k < S; k++) {
      // 超出實際取樣數的樣本重複最後一點 (退化)
      const kk = k < total ? k : total - 1;
      const seg = Math.min(n - 2, Math.floor(kk / (sub + 1)));
      const t = sub === 0 ? 0 : (kk - seg * (sub + 1)) / (sub + 1);
      const i1 = seg, i2 = seg + 1;
      const i0 = seg > 0 ? seg - 1 : seg;
      const i3 = seg + 2 < n ? seg + 2 : i2;
      const tt = kk === total - 1 ? 1 : t;
      const v = (base + k * 2) * 3;
      for (let c = 0; c < 3; c++) {
        // base 端 (偏移 c)、tip 端 (偏移 3 + c)
        pos[v + c] = cr(pts[i0 * 6 + c], pts[i1 * 6 + c], pts[i2 * 6 + c], pts[i3 * 6 + c], tt);
        pos[v + 3 + c] = cr(pts[i0 * 6 + 3 + c], pts[i1 * 6 + 3 + c], pts[i2 * 6 + 3 + c], pts[i3 * 6 + 3 + c], tt);
      }
      // 年齡插值 → 淡出 (平方曲線)；超出取樣數的樣本亮度 0
      let f = 0;
      if (k < total) {
        const age = s.ages[i1] + (s.ages[i2] - s.ages[i1]) * tt;
        f = 1 - age / s.life;
        f = f > 0 ? f * f : 0;
      }
      const a = Math.min(1, f * (0.55 + s.intensity * 0.45)); // 覆蓋率 (亮度越高越不透明)
      const c = (base + k * 2) * 4;
      const gi = f * Math.min(1, s.intensity * 0.75); // 色彩上限 1，強度主要反映在覆蓋率
      col[c] = s.r * gi * BASE_DIM; col[c + 1] = s.g * gi * BASE_DIM; col[c + 2] = s.b * gi * BASE_DIM; col[c + 3] = a * 0.6;
      col[c + 4] = s.tr * gi; col[c + 5] = s.tg * gi; col[c + 6] = s.tb * gi; col[c + 7] = a;
    }
    return true;
  }
}

export const swingTrail = new SwingTrailSystem();
