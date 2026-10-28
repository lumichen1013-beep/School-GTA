import * as THREE from 'three';

export class Engine {
  public scene: THREE.Scene;
  public renderer: THREE.WebGLRenderer;
  public canvas: HTMLCanvasElement;
  public hemiLight!: THREE.HemisphereLight;
  public dirLight!: THREE.DirectionalLight;
  private clock: THREE.Clock;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

    // 1. Scene with atmospheric fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa0c4e2); // 明亮校園天藍色
    this.scene.fog = new THREE.FogExp2(0xa0c4e2, 0.007);

    // 2. High-quality WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const isMobile = Engine.isMobileDevice();
    const maxPixelRatio = isMobile ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.clock = new THREE.Clock();

    // 3. 校園日光與環境光照
    this.setupLighting();

    // 4. 視窗縮放與螢幕翻轉自適應：統一由 scheduleLayoutSync 處理 (翻轉後尺寸需數百毫秒才穩定，分段補量)
    const onLayoutChange = () => this.scheduleLayoutSync();
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('orientationchange', onLayoutChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onLayoutChange);
      window.visualViewport.addEventListener('scroll', onLayoutChange);
    }
    this.syncLayout();
  }

  private layoutSyncTimers: number[] = [];
  private lastLayoutW = 0;
  private lastLayoutH = 0;
  private viewportMetaContent: string | null = null;

  // 版面變更 (縮放/翻轉/瀏覽器工具列伸縮) 後立即同步，並於 100~1000ms 間補量直到尺寸穩定
  public scheduleLayoutSync() {
    for (const t of this.layoutSyncTimers) clearTimeout(t);
    this.syncLayout();
    this.layoutSyncTimers = [100, 300, 600, 1000].map((ms) => window.setTimeout(() => this.syncLayout(), ms));
  }

  // 以實際可視區 (visualViewport) 尺寸驅動整個版面：
  // 1. 歸零翻轉後殘留的頁面捲動偏移 (iOS 翻轉常留下 scrollY，所有絕對定位按鈕整體位移)
  // 2. 意外的雙指縮放 (iOS 忽略 user-scalable=no) 透過重設 viewport meta 還原為 1 倍
  // 3. 寫入 --app-w / --app-h 讓 body 與 HUD 精準貼齊可視區 (避開工具列遮擋與翻轉後殘留舊高度)
  // 4. 廣播 app-layout-change 讓 HUD 等以 JS 量測的版面數值重新同步
  private syncLayout() {
    if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    const vv = window.visualViewport;
    if (vv && Math.abs(vv.scale - 1) > 0.01) this.resetPageZoom();

    const width = Math.round(vv ? vv.width : window.innerWidth);
    const height = Math.round(vv ? vv.height : window.innerHeight);
    if (width <= 0 || height <= 0) return;
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--app-w', `${width}px`);
    rootStyle.setProperty('--app-h', `${height}px`);

    if (width !== this.lastLayoutW || height !== this.lastLayoutH) {
      this.lastLayoutW = width;
      this.lastLayoutH = height;
      this.resize(width, height);
    }
    window.dispatchEvent(new Event('app-layout-change'));
  }

  // 重新套用 viewport meta 迫使 iOS Safari 將頁面縮放還原為 1 倍
  private resetPageZoom() {
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    if (this.viewportMetaContent === null) this.viewportMetaContent = meta.getAttribute('content') || '';
    meta.setAttribute('content', `${this.viewportMetaContent}, maximum-scale=1.0001`);
    window.setTimeout(() => meta.setAttribute('content', this.viewportMetaContent || ''), 50);
  }

  public static isMobileDevice(): boolean {
    return ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || window.innerWidth <= 900;
  }

  private setupLighting() {
    // 柔和天光與地表反射光
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.75);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    // 主陽光 (Sunlight with Cast Shadow)
    this.dirLight = new THREE.DirectionalLight(0xfff5e6, 1.25);
    this.dirLight.position.set(45, 70, 30);
    this.dirLight.castShadow = true;

    // 陰影覆蓋範圍 (行動端降檔至 1024x1024 顯著降低 GPU 頻寬與發熱，PC 維持 2048x2048)
    const isMobile = Engine.isMobileDevice();
    const shadowRes = isMobile ? 1024 : 2048;
    this.dirLight.shadow.mapSize.width = shadowRes;
    this.dirLight.shadow.mapSize.height = shadowRes;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 180;

    const shadowDistance = 90;
    this.dirLight.shadow.camera.left = -shadowDistance;
    this.dirLight.shadow.camera.right = shadowDistance;
    this.dirLight.shadow.camera.top = shadowDistance;
    this.dirLight.shadow.camera.bottom = -shadowDistance;
    this.dirLight.shadow.bias = -0.0005;

    this.scene.add(this.dirLight);
  }

  public onResizeCallback?: (width: number, height: number, aspect: number) => void;

  public getDelta(): number {
    return Math.min(this.clock.getDelta(), 0.1);
  }

  public resize(width: number = window.innerWidth, height: number = window.innerHeight) {
    const safeWidth = Math.max(width, 1);
    const safeHeight = Math.max(height, 1);
    this.renderer.setSize(safeWidth, safeHeight);
    const isMobile = Engine.isMobileDevice();
    const maxPixelRatio = isMobile ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    if (this.onResizeCallback) {
      this.onResizeCallback(safeWidth, safeHeight, safeWidth / safeHeight);
    }
  }

  // 強制重新套用尺寸 (例如外部接上 onResizeCallback 後需立即同步鏡頭比例)
  public handleResize() {
    this.lastLayoutW = 0;
    this.lastLayoutH = 0;
    this.scheduleLayoutSync();
  }
}
