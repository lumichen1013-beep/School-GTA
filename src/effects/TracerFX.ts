import * as THREE from 'three';
import { FX_POOL_MAX, getFxQuality } from './fxQuality';
import { updateVisibleMatricesOnly } from '../core/matrixUpdate';

// 投射物光痕：加法混色的拉長 quad (沿彈道、繞彈道軸朝向鏡頭)，全部共用 1 個 InstancedMesh (1 draw call)。
// 槽位與投射物槽一一對應 (呼叫端以投射物槽號存取)；依品質檔位 tracerPool 限制可用槽數 (低檔 0 = 關閉)、
// tracerLife 決定光痕長度 (= 速度 × 壽命秒數)。預建物件池，閒置時 visible=false，執行期零配置。
// 樣式 (每實例 aStyle)：TRACER_LINE 細光痕 (彈弓石子等)；TRACER_KI 氣功彈彗星 (籃球)：圓形白熱彈頭 + 漸細光尾 + 3 顆殘影光球，
// 彈頭沿行進方向外推半寬 (彈頭圓心 = 彈體位置)、兩端沿鏡頭射線拉近 (不被第三人稱角色身體擋住、包覆彈體模型)；樣式不受 tracerPool 限制 (低檔仍保留短光束)。

export const TRACER_LINE = 0;
export const TRACER_KI = 1;

const VERT = /* glsl */`
attribute vec3 aCol;
attribute float aStyle;
varying vec2 vUv;
varying vec3 vCol;
varying float vStyle;
varying vec2 vSize;
void main() {
  vUv = uv;
  vCol = aCol;
  vStyle = aStyle;
  vSize = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

// uv.x：0 = 尾端、1 = 彈頭；尾端淡出、彈頭最亮，橫向中心亮芯
// 氣功彈 (vStyle 1)：以實際長寬 (vSize) 換算公尺座標，彈頭圓心在 L - R；光尾寬度由尾往頭漸粗，3 顆殘影光球沿光尾遞減
const FRAG = /* glsl */`
varying vec2 vUv;
varying vec3 vCol;
varying float vStyle;
varying vec2 vSize;
void main() {
  if (vStyle > 0.5) {
    float R = vSize.y * 0.5;
    float px = vUv.x * vSize.x;
    float py = (vUv.y - 0.5) * vSize.y;
    float hx = max(vSize.x - R, 1e-3);
    float dh = length(vec2(px - hx, py)) / R;
    float head = exp(-dh * dh * 1.6);
    float core = smoothstep(0.6, 0.0, dh);
    float t = clamp(px / hx, 0.0, 1.0);
    float rw = R * (0.5 + 0.35 * t);
    float prof = max(1.0 - abs(py) / rw, 0.0);
    float tail = sqrt(prof) * (0.3 + 0.7 * t) * smoothstep(0.0, 0.12, t);
    float ghost = 0.0;
    for (int k = 1; k <= 3; k++) {
      float fk = float(k);
      float gx = hx * (1.0 - 0.24 * fk);
      float gr = R * (0.85 - 0.12 * fk);
      float d = length(vec2(px - gx, py)) / gr;
      ghost += exp(-d * d * 2.5) * (0.8 - 0.17 * fk);
    }
    float a = min(head + tail * 0.8 + ghost, 1.0);
    vec3 c = mix(vCol, vec3(1.0), clamp(core + prof * prof * prof * t * 0.35, 0.0, 1.0));
    // 預乘 alpha：光束主體近乎不透明地蓋住背景，亮色地面 (校園白地磚) 上仍看得出橘色光束；邊緣柔和淡出
    gl_FragColor = vec4(c * a, min(a * 1.3, 1.0) * 0.92);
    return;
  }
  float along = vUv.x * vUv.x;
  float y = abs(vUv.y - 0.5) * 2.0;
  float prof = max(1.0 - y, 0.0);
  float a = prof * prof * along;
  vec3 col = mix(vCol, vec3(1.0), prof * prof * prof * 0.7);
  gl_FragColor = vec4(col * a, 0.0); // alpha 0 = 純加法 (與改版前 AdditiveBlending 相同)
}`;

const _m = new THREE.Matrix4();
const _axis = new THREE.Vector3();
const _side = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _head = new THREE.Vector3();
const _tail = new THREE.Vector3();
const KI_PULL = 1.6;      // 氣功彈端點朝鏡頭拉近上限 (m)
const KI_PULL_FRAC = 0.45; // 拉近不超過端點到鏡頭距離的比例

// 端點沿射線朝鏡頭拉近 (原地改寫)，回傳縮放比例 (拉近後距離 / 原距離)
function pullToward(p: THREE.Vector3, cam: THREE.Vector3): number {
  const dx = cam.x - p.x, dy = cam.y - p.y, dz = cam.z - p.z;
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (d < 1e-4) return 1;
  const pull = Math.min(KI_PULL, d * KI_PULL_FRAC);
  const k = pull / d;
  p.x += dx * k; p.y += dy * k; p.z += dz * k;
  return (d - pull) / d;
}
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

class TracerFXSystem {
  private mesh: THREE.InstancedMesh | null = null;
  private colAttr!: THREE.InstancedBufferAttribute;
  private styleAttr!: THREE.InstancedBufferAttribute;
  // 每槽：彈頭 (3)、尾端 (3)、半寬 (1)
  private seg = new Float32Array(0);
  private on = new Uint8Array(0);
  private active = 0;
  private dirty = false;

  public init(scene: THREE.Object3D) {
    if (this.mesh) return;
    const n = FX_POOL_MAX.tracerPool;
    if (n <= 0) return;
    this.seg = new Float32Array(n * 7);
    this.on = new Uint8Array(n);
    // 單位 quad：x ∈ [0, 1] (尾 → 頭)、y ∈ [-0.5, 0.5]
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0.5, 0, 0);
    this.colAttr = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCol', this.colAttr);
    this.styleAttr = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aStyle', this.styleAttr);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
      // 預乘 alpha 混色 (src × 1 + dst × (1 − srcAlpha))：細光痕輸出 alpha 0 = 純加法；氣功彈輸出 alpha > 0 以壓暗背景
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
    });
    mat.forceSinglePass = true; // 雙面透明預設分兩趟繪製，強制單趟以維持 1 draw call
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, _zeroMatrix);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    updateVisibleMatricesOnly(this.mesh); // 閒置隱藏時略過矩陣更新
    scene.add(this.mesh);
  }

  // 暫時顯示以便 renderer.compile 預熱 shader
  public prewarm(compile: () => void) {
    if (!this.mesh) return;
    this.mesh.visible = true;
    compile();
    this.mesh.visible = this.active > 0;
  }

  // 目前檔位是否啟用光痕 (低檔關閉)
  public get enabled(): boolean {
    const q = getFxQuality();
    return this.mesh !== null && q.tracerPool > 0 && q.tracerLife > 0;
  }

  // 是否已建立 (氣功彈樣式不受檔位 tracerPool 開關限制)
  public get ready(): boolean {
    return this.mesh !== null;
  }

  // 設定 / 更新第 i 槽光痕 (彈頭 h、尾端 t、半寬、顏色、樣式)；細光痕超出目前檔位槽數時略過
  public set(i: number, hx: number, hy: number, hz: number, tx: number, ty: number, tz: number, halfWidth: number, color: number, style = TRACER_LINE) {
    if (!this.mesh || i >= this.on.length || (style === TRACER_LINE && i >= getFxQuality().tracerPool)) return;
    const o = i * 7;
    const s = this.seg;
    s[o] = hx; s[o + 1] = hy; s[o + 2] = hz; s[o + 3] = tx; s[o + 4] = ty; s[o + 5] = tz; s[o + 6] = halfWidth;
    if (!this.on[i]) {
      this.on[i] = 1;
      this.active++;
      const c = this.colAttr.array as Float32Array;
      // 自訂 shader 不做色彩空間轉換：直接寫入 sRGB 色值
      c[i * 3] = ((color >> 16) & 255) / 255; c[i * 3 + 1] = ((color >> 8) & 255) / 255; c[i * 3 + 2] = (color & 255) / 255;
      this.colAttr.needsUpdate = true;
      (this.styleAttr.array as Float32Array)[i] = style;
      this.styleAttr.needsUpdate = true;
      this.mesh.visible = true;
    }
    this.dirty = true;
  }

  public clear(i: number) {
    if (!this.mesh || i >= this.on.length || !this.on[i]) return;
    this.on[i] = 0;
    this.active--;
    this.mesh.setMatrixAt(i, _zeroMatrix);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.active === 0) this.mesh.visible = false;
  }

  public reset() {
    if (!this.mesh) return;
    for (let i = 0; i < this.on.length; i++) this.clear(i);
    this.dirty = false;
  }

  // 依鏡頭位置組合實例矩陣 (quad 長軸沿彈道、面法線盡量朝向鏡頭)；無光痕時不做事
  public update(cameraPos: THREE.Vector3) {
    const mesh = this.mesh;
    if (!mesh || this.active === 0 || !this.dirty) return;
    this.dirty = false;
    const s = this.seg;
    for (let i = 0; i < this.on.length; i++) {
      if (!this.on[i]) continue;
      const o = i * 7;
      _axis.set(s[o] - s[o + 3], s[o + 1] - s[o + 4], s[o + 2] - s[o + 5]);
      const len = _axis.length();
      if (len < 1e-4) { mesh.setMatrixAt(i, _zeroMatrix); continue; }
      const hw = s[o + 6];
      if ((this.styleAttr.array as Float32Array)[i] > 0.5) { this.composeKi(i, o, len, hw, cameraPos); continue; }
      _mid.set((s[o] + s[o + 3]) * 0.5, (s[o + 1] + s[o + 4]) * 0.5, (s[o + 2] + s[o + 5]) * 0.5);
      _norm.subVectors(cameraPos, _mid);
      _side.crossVectors(_norm, _axis);
      const sl = _side.length();
      if (sl < 1e-6) { mesh.setMatrixAt(i, _zeroMatrix); continue; }
      _side.multiplyScalar((hw * 2) / sl); // quad y 範圍 [-0.5, 0.5] → 全寬 = 2 × 半寬
      _norm.crossVectors(_axis, _side).normalize();
      _m.makeBasis(_axis, _side, _norm);
      _m.setPosition(s[o + 3], s[o + 4], s[o + 5]);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  // 氣功彈彗星：彈頭沿行進方向外推半寬 (彈頭圓心 = 彈體位置)；兩端各沿「端點 → 鏡頭」射線拉近 (螢幕投影位置不變)，
  // 使第三人稱鏡頭下剛出手的光束畫在角色背後之前、不被身體擋住，並依拉近比例縮小寬度維持視覺大小
  private composeKi(i: number, o: number, len: number, hw: number, cameraPos: THREE.Vector3) {
    const s = this.seg;
    const ext = (len + hw) / len;
    _head.set(s[o + 3] + (s[o] - s[o + 3]) * ext, s[o + 4] + (s[o + 1] - s[o + 4]) * ext, s[o + 5] + (s[o + 2] - s[o + 5]) * ext);
    _tail.set(s[o + 3], s[o + 4], s[o + 5]);
    const fh = pullToward(_head, cameraPos);
    const ft = pullToward(_tail, cameraPos);
    _axis.subVectors(_head, _tail);
    const width = hw * (fh + ft); // 2 × 半寬 × 平均縮放
    _mid.addVectors(_head, _tail).multiplyScalar(0.5);
    _norm.subVectors(cameraPos, _mid);
    _side.crossVectors(_norm, _axis);
    const sl = _side.length();
    if (_axis.lengthSq() < 1e-8 || sl < 1e-6) { this.mesh!.setMatrixAt(i, _zeroMatrix); return; }
    _side.multiplyScalar(width / sl);
    _norm.crossVectors(_axis, _side).normalize();
    _m.makeBasis(_axis, _side, _norm);
    _m.setPosition(_tail.x, _tail.y, _tail.z);
    this.mesh!.setMatrixAt(i, _m);
  }
}

export const tracerFX = new TracerFXSystem();
