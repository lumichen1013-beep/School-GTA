import * as THREE from 'three';

// 遠程武器 (籃球 / 彈弓) 共用：預輸入緩衝時間與 DOM 準星 (只改 transform，不佔 GPU 特效)。

export const PRE_INPUT_WINDOW = 0.25; // 預輸入緩衝 (秒)：不可出手期間按攻擊，可出手瞬間自動接續

const _p = new THREE.Vector3();

/**
 * 螢幕準星 DOM 元素：首次顯示時才建立並掛到 body，之後只切換 display / transform / class。
 * 顯示狀態有快取，狀態不變時不寫入 style。
 */
export class ScreenReticle {
  private el: HTMLElement | null = null;
  private shown = false;
  private classes = '';

  constructor(private readonly id: string, private readonly baseClass: string) {}

  // 取得 (必要時建立) 元素
  public element(): HTMLElement {
    if (!this.el) {
      const el = document.createElement('div');
      el.id = this.id;
      el.className = this.baseClass;
      el.style.display = 'none';
      document.body.appendChild(el);
      this.el = el;
      this.classes = this.baseClass;
    }
    return this.el;
  }

  public show(show: boolean) {
    if (show === this.shown) return;
    this.shown = show;
    if (this.el || show) this.element().style.display = show ? 'block' : 'none';
  }

  // 附加狀態 class (如 'sling-reticle--head')；內容不變時不寫入
  public setModifier(modifier: string) {
    const cls = modifier ? `${this.baseClass} ${modifier}` : this.baseClass;
    if (cls === this.classes) return;
    this.classes = cls;
    this.element().className = cls;
  }

  // 世界座標投影到螢幕後定位；點在鏡頭後方 / 視錐外回傳 false (呼叫端據此隱藏)
  public placeAt(world: { x: number; y: number; z: number }, camera: THREE.Camera): boolean {
    _p.set(world.x, world.y, world.z).project(camera);
    if (_p.z > 1 || _p.z < -1) return false;
    this.element().style.transform = `translate(${((_p.x + 1) * 0.5 * window.innerWidth).toFixed(1)}px, ${((1 - _p.y) * 0.5 * window.innerHeight).toFixed(1)}px)`;
    return true;
  }

  // 固定在螢幕中心 (桌機開鏡準星)
  public placeCenter() {
    this.element().style.transform = `translate(${(window.innerWidth * 0.5).toFixed(1)}px, ${(window.innerHeight * 0.5).toFixed(1)}px)`;
  }
}
