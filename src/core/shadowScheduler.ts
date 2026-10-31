import * as THREE from 'three';

// 陰影貼圖降頻 (中 / 低檔與觸控裝置)：renderer.shadowMap.autoUpdate = false，只在
//   (1) 動態投影物 (位置 / 旋轉 / 縮放 / 顯示狀態 / 實例矩陣) 改變、
//   (2) 陰影焦點 (玩家) 在光源視角平面上移動超過一個陰影貼圖像素、
//   (3) 陰影貼圖失效 (檔位改尺寸、結界戰縮放範圍、卸載 / 恢復世界)
// 時才重繪，且最多隔幀一次 (貼圖遺失時例外，立即重建)。高檔維持每幀。
// 未重繪的幀沿用上一張陰影貼圖與其投影矩陣，靜態陰影位置不變；動態物件的陰影最多落後 1 幀。
//
// 動態投影物的判定：freezeStatic 凍結的子樹 (matrixWorldAutoUpdate = false) 不會移動，不往下掃描，
// 只記錄子樹根的顯示狀態 (結界戰卸載校園等整片顯示切換)；其餘 castShadow 網格逐幀比對世界矩陣。

export const SHADOW_MIN_FRAME_GAP = 2;    // 兩次重繪至少相隔的幀數 (2 = 最多隔幀一次)
export const SHADOW_MAX_STALE_FRAMES = 60; // 保險：無偵測到變化時最久每 60 幀仍重繪一次
export const SHADOW_RESCAN_FRAMES = 30;    // 每 30 幀重新收集投影物清單 (新生成的投影物最慢 0.5 秒納入)

export interface ShadowDecisionInput {
  framesSinceUpdate: number; // 距上次重繪的幀數
  mapMissing: boolean;       // 陰影貼圖不存在 (首次 / 尺寸變更後)，須立即重建
  invalidated: boolean;      // 外部宣告失效 (範圍 / 尺寸 / 世界卸載)
  casterChanged: boolean;    // 動態投影物有變化
  focusMoved: boolean;       // 焦點移動超過一個貼圖像素
}

// 純函式：本幀是否重繪陰影貼圖
export function shouldUpdateShadow(i: ShadowDecisionInput): boolean {
  if (i.mapMissing) return true;
  if (i.framesSinceUpdate < SHADOW_MIN_FRAME_GAP) return false;
  return i.invalidated || i.casterChanged || i.focusMoved || i.framesSinceUpdate >= SHADOW_MAX_STALE_FRAMES;
}

const STRIDE = 18; // 16 矩陣元素 + 有效顯示狀態 + 實例矩陣版本

function effectiveVisible(obj: THREE.Object3D, root: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (!o.visible) return false;
    if (o === root) return true;
    o = o.parent;
  }
  return false; // 已自場景移除
}

export class ShadowScheduler {
  private throttled = false;
  private frame = 0;
  private lastUpdateFrame = -1e9;
  private invalidated = true;
  private casterChanged = true;
  private focusU = NaN;
  private focusV = NaN;
  private shadowU = NaN; // 上次重繪時的焦點像素格
  private shadowV = NaN;
  private watched: THREE.Object3D[] = [];
  private snap = new Float64Array(0);
  private framesToRescan = 0;
  private updatedThisFrame = false;
  // 診斷：最近 60 幀實際重繪次數
  private history: boolean[] = [];

  get isThrottled(): boolean { return this.throttled; }
  get watchedCount(): number { return this.watched.length; }
  get recentUpdates(): number { return this.history.reduce((n, v) => n + (v ? 1 : 0), 0); }
  get recentFrames(): number { return this.history.length; }

  public setThrottled(on: boolean) {
    if (on === this.throttled) return;
    this.throttled = on;
    this.invalidate();
  }

  /** 陰影內容整體失效 (尺寸 / 範圍 / 世界切換)：下一個允許的幀重繪 */
  public invalidate() {
    this.invalidated = true;
    this.framesToRescan = 0;
  }

  /** 焦點所在的陰影貼圖像素格 (Engine.updateShadowFocus 每幀回報) */
  public setFocusCell(u: number, v: number) {
    this.focusU = u;
    this.focusV = v;
  }

  /** render 前：決定本幀是否重繪陰影貼圖 */
  public beforeRender(renderer: THREE.WebGLRenderer, light: THREE.DirectionalLight) {
    const sm = renderer.shadowMap;
    this.frame++;
    if (!this.throttled || !light.castShadow) {
      sm.autoUpdate = true;
      this.updatedThisFrame = light.castShadow;
      return;
    }
    sm.autoUpdate = false;
    const update = shouldUpdateShadow({
      framesSinceUpdate: this.frame - this.lastUpdateFrame,
      mapMissing: !light.shadow.map,
      invalidated: this.invalidated,
      casterChanged: this.casterChanged,
      focusMoved: this.focusU !== this.shadowU || this.focusV !== this.shadowV,
    });
    sm.needsUpdate = update;
    this.updatedThisFrame = update;
    if (update) {
      this.lastUpdateFrame = this.frame;
      this.invalidated = false;
      this.casterChanged = false;
      this.shadowU = this.focusU;
      this.shadowV = this.focusV;
    }
  }

  /** render 後 (世界矩陣已是本幀值)：重繪過就記下快照，否則比對快照標記變化 */
  public afterRender(scene: THREE.Object3D) {
    this.history.push(this.updatedThisFrame);
    if (this.history.length > 60) this.history.shift();
    if (!this.throttled) return;
    if (--this.framesToRescan <= 0) {
      this.framesToRescan = SHADOW_RESCAN_FRAMES;
      const before = this.watched;
      if (!this.updatedThisFrame && !this.casterChanged && this.differs(scene)) this.casterChanged = true;
      this.rescan(scene);
      if (!this.updatedThisFrame && !sameList(before, this.watched)) this.casterChanged = true;
      this.snapshot(scene);
      return;
    }
    if (this.updatedThisFrame) this.snapshot(scene);
    else if (!this.casterChanged && this.differs(scene)) this.casterChanged = true;
  }

  private rescan(scene: THREE.Object3D) {
    const out: THREE.Object3D[] = [];
    const visit = (o: THREE.Object3D) => {
      const kids = o.children;
      for (let i = 0; i < kids.length; i++) {
        const c = kids[i];
        if (c.matrixWorldAutoUpdate === false) { out.push(c); continue; } // 凍結子樹：只看根的顯示狀態
        if (c.castShadow && (c as THREE.Mesh).isMesh) out.push(c);
        visit(c);
      }
    };
    visit(scene);
    this.watched = out;
    if (this.snap.length < out.length * STRIDE) this.snap = new Float64Array(out.length * STRIDE * 2);
  }

  private snapshot(scene: THREE.Object3D) {
    const w = this.watched;
    const s = this.snap;
    for (let i = 0; i < w.length; i++) {
      const o = w[i];
      const e = o.matrixWorld.elements;
      const b = i * STRIDE;
      for (let k = 0; k < 16; k++) s[b + k] = e[k];
      s[b + 16] = effectiveVisible(o, scene) ? 1 : 0;
      s[b + 17] = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).instanceMatrix.version : 0;
    }
  }

  private differs(scene: THREE.Object3D): boolean {
    const w = this.watched;
    const s = this.snap;
    for (let i = 0; i < w.length; i++) {
      const o = w[i];
      const b = i * STRIDE;
      const vis = effectiveVisible(o, scene) ? 1 : 0;
      if (s[b + 16] !== vis) return true;
      if (!vis) continue; // 持續隱藏的物件移動不影響陰影
      const e = o.matrixWorld.elements;
      for (let k = 0; k < 16; k++) if (s[b + k] !== e[k]) return true;
      if ((o as THREE.InstancedMesh).isInstancedMesh && s[b + 17] !== (o as THREE.InstancedMesh).instanceMatrix.version) return true;
    }
    return false;
  }
}

function sameList(a: readonly THREE.Object3D[], b: readonly THREE.Object3D[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
