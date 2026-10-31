import * as THREE from 'three';
import { QUALITY_STORAGE_KEY, parseStoredQuality, resolveAntialias } from './quality';
import { getDiagFlags } from './diagFlags';

// 陽光相對於陰影焦點 (玩家) 的固定偏移，維持原有光照方向
const SUN_OFFSET = new THREE.Vector3(45, 70, 30);
const SHADOW_DISTANCE = 40;
// 光源視角座標軸 (與陰影相機 lookAt 一致)，用於將焦點對齊陰影貼圖像素格防止移動時陰影閃爍
const _sunAxisZ = SUN_OFFSET.clone().normalize();
const _sunAxisX = new THREE.Vector3(0, 1, 0).cross(_sunAxisZ).normalize();
const _sunAxisY = new THREE.Vector3().crossVectors(_sunAxisZ, _sunAxisX);

export class Engine {
  public scene: THREE.Scene;
  public renderer: THREE.WebGLRenderer;
  public canvas: HTMLCanvasElement;
  public hemiLight!: THREE.HemisphereLight;
  public dirLight!: THREE.DirectionalLight;
  private clock: THREE.Clock;
  // 本次 WebGL context 實際的抗鋸齒設定 (建立後無法更改，變更需重新整理)
  public readonly antialias: boolean;
  private shadowTexelSize = 0;
  // 畫質檔位決定的像素比上限與陰影貼圖尺寸 (由 QualityManager.attach / applyQuality 設定；預設為中檔)
  private maxPixelRatio = 1.5;
  private shadowRes = 1024;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

    // 1. Scene with atmospheric fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa0c4e2); // 明亮校園天藍色
    this.scene.fog = getDiagFlags().fog === false ? null : new THREE.FogExp2(0xa0c4e2, 0.007);
    // 場景根節點永不移動：凍結其本地矩陣，否則每幀 updateMatrix 會強制重算全場所有物件的世界矩陣，
    // 世界群組內已凍結的靜態子樹 (見 sceneUtils.freezeStatic) 便無法略過
    this.scene.matrixAutoUpdate = false;

    // 2. High-quality WebGL Renderer
    // 抗鋸齒需在建立 context 時決定：讀取上次存下的畫質設定 (低檔關閉；首次啟動維持開啟)；?diag=&aa= 可強制覆蓋
    let storedRaw: string | null = null;
    try { storedRaw = window.localStorage.getItem(QUALITY_STORAGE_KEY); } catch { /* 無法讀取時視為首次啟動 */ }
    this.antialias = getDiagFlags().aa ?? resolveAntialias(parseStoredQuality(storedRaw));
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.antialias,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this.effectivePixelRatio());
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.clock = new THREE.Clock();

    // 3. 校園日光與環境光照
    this.setupLighting();

    // 4. 視窗縮放與螢幕翻轉自適應：統一由 scheduleLayoutSync 處理 (翻轉後尺寸需數百毫秒才穩定，分段補量)
    // 以 rAF 合併同一幀內的大量事件 (iOS 工具列伸縮時 visualViewport scroll/resize 連續觸發)
    const onLayoutChange = () => {
      if (this.layoutRaf) return;
      this.layoutRaf = requestAnimationFrame(() => {
        this.layoutRaf = 0;
        this.scheduleLayoutSync();
      });
    };
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('orientationchange', onLayoutChange);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onLayoutChange);
      window.visualViewport.addEventListener('scroll', onLayoutChange);
    }
    this.syncLayout();
  }

  private layoutSyncTimers: number[] = [];
  private layoutRaf = 0;
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
  // 僅在尺寸改變或曾修正捲動/縮放時才寫入 CSS 變數並廣播，避免無變化時觸發 HUD 量測造成同步重排
  private syncLayout() {
    let corrected = false;
    if (window.scrollX !== 0 || window.scrollY !== 0) {
      window.scrollTo(0, 0);
      corrected = true;
    }
    if (document.documentElement.scrollTop !== 0) { document.documentElement.scrollTop = 0; corrected = true; }
    if (document.body.scrollTop !== 0) { document.body.scrollTop = 0; corrected = true; }

    const vv = window.visualViewport;
    if (vv && Math.abs(vv.scale - 1) > 0.01) {
      this.resetPageZoom();
      corrected = true;
    }

    const width = Math.round(vv ? vv.width : window.innerWidth);
    const height = Math.round(vv ? vv.height : window.innerHeight);
    if (width <= 0 || height <= 0) return;
    const sizeChanged = width !== this.lastLayoutW || height !== this.lastLayoutH;
    if (!sizeChanged && !corrected) return;

    if (sizeChanged) {
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--app-w', `${width}px`);
      rootStyle.setProperty('--app-h', `${height}px`);
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

  // 套用畫質參數：像素比上限立即生效 (重配繪圖緩衝)；陰影尺寸改變時釋放舊陰影貼圖，下一幀依新尺寸重建；
  // shadowRes = 0 關閉陽光投影 (光源陰影數改變會讓材質重新編譯一次)。回傳是否切換了陰影開關 (需重新預熱 shader)
  public setQualityParams(pixelRatio: number, shadowRes: number): boolean {
    this.maxPixelRatio = pixelRatio;
    if (Math.abs(this.renderer.getPixelRatio() - this.effectivePixelRatio()) > 1e-6) {
      this.renderer.setPixelRatio(this.effectivePixelRatio());
    }
    const light = this.dirLight;
    const wasCasting = light.castShadow;
    const casting = shadowRes > 0;
    if (casting && shadowRes !== this.shadowRes) {
      this.shadowRes = shadowRes;
      light.shadow.mapSize.set(shadowRes, shadowRes);
      if (light.shadow.map) {
        light.shadow.map.dispose();
        light.shadow.map = null;
      }
      this.shadowTexelSize = (SHADOW_DISTANCE * 2) / shadowRes;
    }
    if (!casting && light.shadow.map) {
      // 關閉陰影時一併釋放貼圖記憶體 (重新開啟時依 mapSize 重建)
      light.shadow.map.dispose();
      light.shadow.map = null;
    }
    light.castShadow = casting;
    return wasCasting !== casting;
  }

  // 目前生效的陰影貼圖邊長 (0 = 關閉)
  public getShadowMapSize(): number {
    return this.dirLight.castShadow ? this.shadowRes : 0;
  }

  private effectivePixelRatio(): number {
    const forced = getDiagFlags().rs; // ?diag=&rs= 診斷覆蓋，優先於檔位
    if (forced !== null) return forced;
    return Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
  }

  private setupLighting() {
    // 柔和天光與地表反射光
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.75);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    // 主陽光 (Sunlight with Cast Shadow)
    this.dirLight = new THREE.DirectionalLight(0xfff5e6, 1.25);
    this.dirLight.position.copy(SUN_OFFSET);
    this.dirLight.castShadow = true;

    // 陰影貼圖尺寸依畫質檔位 (低：關閉 / 中：1024 / 高：2048)，初始為中檔，QualityManager.attach 時套用實際檔位
    const shadowRes = this.shadowRes;
    this.dirLight.shadow.mapSize.width = shadowRes;
    this.dirLight.shadow.mapSize.height = shadowRes;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 180;

    // 陰影相機僅涵蓋玩家周圍 ±40m 並隨玩家移動 (見 updateShadowFocus)，大幅減少陰影繪製物件
    this.dirLight.shadow.camera.left = -SHADOW_DISTANCE;
    this.dirLight.shadow.camera.right = SHADOW_DISTANCE;
    this.dirLight.shadow.camera.top = SHADOW_DISTANCE;
    this.dirLight.shadow.camera.bottom = -SHADOW_DISTANCE;
    this.dirLight.shadow.bias = -0.0005;
    this.shadowTexelSize = (SHADOW_DISTANCE * 2) / shadowRes;

    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);
  }

  // 陽光與陰影相機跟隨焦點 (玩家/載具)；焦點在光源視角平面上對齊陰影像素格，避免移動時陰影邊緣閃爍
  public updateShadowFocus(focus: THREE.Vector3) {
    const texel = this.shadowTexelSize;
    const u = focus.dot(_sunAxisX);
    const v = focus.dot(_sunAxisY);
    const target = this.dirLight.target.position;
    target.copy(focus)
      .addScaledVector(_sunAxisX, Math.round(u / texel) * texel - u)
      .addScaledVector(_sunAxisY, Math.round(v / texel) * texel - v);
    this.dirLight.position.copy(target).add(SUN_OFFSET);
  }

  public onResizeCallback?: (width: number, height: number, aspect: number) => void;

  public getDelta(): number {
    return Math.min(this.clock.getDelta(), 0.1);
  }

  public resize(width: number = window.innerWidth, height: number = window.innerHeight) {
    const safeWidth = Math.max(width, 1);
    const safeHeight = Math.max(height, 1);
    // 先設像素比再設尺寸：setPixelRatio 內部會以舊尺寸再呼叫一次 setSize，順序顛倒會重複配置繪圖緩衝區
    this.renderer.setPixelRatio(this.effectivePixelRatio());
    this.renderer.setSize(safeWidth, safeHeight);
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
