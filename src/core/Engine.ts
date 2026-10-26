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
    this.renderer.toneMappingExposure = 1.05;

    this.clock = new THREE.Clock();

    // 3. 校園日光與環境光照
    this.setupLighting();

    // 4. 視窗縮放與螢幕翻轉自適應
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => {
      this.onResize();
      setTimeout(() => this.onResize(), 100);
      setTimeout(() => this.onResize(), 300);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.onResize());
    }
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

  private onResize() {
    const width = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const height = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    this.resize(width, height);
  }
}
