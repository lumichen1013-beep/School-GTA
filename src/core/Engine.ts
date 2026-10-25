import * as THREE from 'three';

export class Engine {
  public scene: THREE.Scene;
  public renderer: THREE.WebGLRenderer;
  public canvas: HTMLCanvasElement;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.clock = new THREE.Clock();

    // 3. 校園日光與環境光照
    this.setupLighting();

    // 4. 視窗縮放自適應
    window.addEventListener('resize', () => this.onResize());
  }

  private setupLighting() {
    // 柔和天光與地表反射光
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 0.75);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    // 主陽光 (Sunlight with Cast Shadow)
    const dirLight = new THREE.DirectionalLight(0xfff5e6, 1.25);
    dirLight.position.set(45, 70, 30);
    dirLight.castShadow = true;

    // 陰影覆蓋範圍
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 180;

    const shadowDistance = 90;
    dirLight.shadow.camera.left = -shadowDistance;
    dirLight.shadow.camera.right = shadowDistance;
    dirLight.shadow.camera.top = shadowDistance;
    dirLight.shadow.camera.bottom = -shadowDistance;
    dirLight.shadow.bias = -0.0005;

    this.scene.add(dirLight);
  }

  public getDelta(): number {
    return Math.min(this.clock.getDelta(), 0.1);
  }

  private onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}
