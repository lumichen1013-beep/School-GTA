import * as THREE from 'three';
import { FX_POOL_MAX, getFxQuality } from './fxQuality';
import { updateVisibleMatricesOnly } from '../core/matrixUpdate';

// 投射物光痕：加法混色的拉長 quad (沿彈道、繞彈道軸朝向鏡頭)，全部共用 1 個 InstancedMesh (1 draw call)。
// 槽位與投射物槽一一對應 (呼叫端以投射物槽號存取)；依品質檔位 tracerPool 限制可用槽數 (低檔 0 = 關閉)、
// tracerLife 決定光痕長度 (= 速度 × 壽命秒數)。預建物件池，閒置時 visible=false，執行期零配置。

const VERT = /* glsl */`
attribute vec3 aCol;
varying vec2 vUv;
varying vec3 vCol;
void main() {
  vUv = uv;
  vCol = aCol;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

// uv.x：0 = 尾端、1 = 彈頭；尾端淡出、彈頭最亮，橫向中心亮芯
const FRAG = /* glsl */`
varying vec2 vUv;
varying vec3 vCol;
void main() {
  float along = vUv.x * vUv.x;
  float y = abs(vUv.y - 0.5) * 2.0;
  float prof = max(1.0 - y, 0.0);
  float a = prof * prof * along;
  vec3 col = mix(vCol, vec3(1.0), prof * prof * prof * 0.7);
  gl_FragColor = vec4(col * a, 1.0);
}`;

const _m = new THREE.Matrix4();
const _axis = new THREE.Vector3();
const _side = new THREE.Vector3();
const _norm = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

class TracerFXSystem {
  private mesh: THREE.InstancedMesh | null = null;
  private colAttr!: THREE.InstancedBufferAttribute;
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
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
      blending: THREE.AdditiveBlending
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

  // 設定 / 更新第 i 槽光痕 (彈頭 h、尾端 t、半寬、顏色)；超出目前檔位槽數時略過
  public set(i: number, hx: number, hy: number, hz: number, tx: number, ty: number, tz: number, halfWidth: number, color: number) {
    if (!this.mesh || i >= getFxQuality().tracerPool) return;
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
      _mid.set((s[o] + s[o + 3]) * 0.5, (s[o + 1] + s[o + 4]) * 0.5, (s[o + 2] + s[o + 5]) * 0.5);
      _norm.subVectors(cameraPos, _mid);
      _side.crossVectors(_norm, _axis);
      const sl = _side.length();
      if (sl < 1e-6) { mesh.setMatrixAt(i, _zeroMatrix); continue; }
      _side.multiplyScalar((s[o + 6] * 2) / sl); // quad y 範圍 [-0.5, 0.5] → 全寬 = 2 × 半寬
      _norm.crossVectors(_axis, _side).normalize();
      _m.makeBasis(_axis, _side, _norm);
      _m.setPosition(s[o + 3], s[o + 4], s[o + 5]);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

export const tracerFX = new TracerFXSystem();
