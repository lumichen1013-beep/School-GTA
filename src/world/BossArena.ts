import * as THREE from 'three';

// 玫瑰荊棘結界：開口圓柱牆 (高 12m：下 70% 不透明荊棘紋、上 30% 加法發光帶，單一 shader 1 call)、
// 頂緣金色光環 + 地面荊棘環 (加法 1 call)、結界內草皮地板 + 中央玫瑰紋章 (1 call)。
// 升降只動根節點 position.y (不改幾何)；碰撞一律由呼叫端以圓形解析式夾回 (fencerRules.clampToCircle)。

export const WALL_H = 12;
const WALL_SEGS = 48;
const RISE_SEC = 1.5;
const LOWER_SEC = 1.2;

const WALL_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
// 下 70% 不透明：深紅→暗金漸層 + 滾動荊棘紋；上 30% 加法發光帶 (以 alpha 輸出，混色 ONE / ONE_MINUS_SRC_ALPHA)
const WALL_FRAG = /* glsl */`
uniform float uTime;
uniform float uDawn;
varying vec2 vUv;
void main() {
  float h = vUv.y;
  float u = vUv.x * 48.0;
  vec3 deep = mix(vec3(0.32, 0.03, 0.09), vec3(0.45, 0.2, 0.08), uDawn);
  vec3 gold = mix(vec3(0.55, 0.36, 0.08), vec3(0.85, 0.62, 0.22), uDawn);
  float vine = abs(sin(u * 3.14159 + h * 9.0 + uTime * 0.6)) ;
  vine = smoothstep(0.92, 1.0, vine) + smoothstep(0.94, 1.0, abs(sin(u * 3.14159 * 0.5 - h * 7.0 - uTime * 0.4)));
  float thorn = step(0.82, fract(u * 2.0 + h * 14.0)) * step(0.6, fract(h * 9.0 + u * 0.3)) * 0.6;
  if (h < 0.7) {
    vec3 col = mix(deep, gold, h / 0.7 * 0.55);
    col = mix(col, vec3(0.08, 0.01, 0.03), clamp(vine * 0.8 + thorn * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(col, 1.0);
  } else {
    float k = (h - 0.7) / 0.3;
    float a = (1.0 - k) * (0.75 + 0.25 * sin(uTime * 2.0 + vUv.x * 60.0));
    vec3 col = mix(mix(vec3(1.0, 0.45, 0.35), vec3(1.0, 0.82, 0.35), uDawn), vec3(1.0, 0.85, 0.4), k);
    gl_FragColor = vec4(col * a, a * 0.6);
  }
}`;

const RIM_VERT = WALL_VERT;
const RIM_FRAG = /* glsl */`
uniform float uTime;
uniform float uDawn;
varying vec2 vUv;
void main() {
  float a = 0.7 + 0.3 * sin(uTime * 3.0 + vUv.x * 50.0);
  gl_FragColor = vec4(mix(vec3(1.0, 0.78, 0.35), vec3(1.0, 0.95, 0.75), uDawn) * a * (1.0 + 0.4 * uDawn), a);
}`;

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export type ArenaAnim = 'DOWN' | 'RISING' | 'UP' | 'LOWERING';

export class BossArena {
  public readonly group = new THREE.Group();
  public readonly center: THREE.Vector3;
  public readonly radius: number;
  private readonly wallRoot = new THREE.Group();
  private readonly floor: THREE.Mesh;
  private readonly wallMat: THREE.ShaderMaterial;
  private readonly rimMat: THREE.ShaderMaterial;
  public anim: ArenaAnim = 'DOWN';
  private t = 0;
  private time = 0;

  constructor(cx: number, cz: number, radius: number) {
    this.center = new THREE.Vector3(cx, 0, cz);
    this.radius = radius;
    this.group.name = 'boss_arena';
    this.group.position.set(cx, 0, cz);

    this.wallMat = new THREE.ShaderMaterial({
      vertexShader: WALL_VERT, fragmentShader: WALL_FRAG, uniforms: { uTime: { value: 0 }, uDawn: { value: 0 } },
      side: THREE.DoubleSide, fog: false, toneMapped: false, transparent: true,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation
    });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, WALL_H, WALL_SEGS, 1, true).translate(0, WALL_H / 2, 0), this.wallMat);
    wall.renderOrder = 0;

    // 頂緣光環 + 地面荊棘環合併 (加法)
    this.rimMat = new THREE.ShaderMaterial({
      vertexShader: RIM_VERT, fragmentShader: RIM_FRAG, uniforms: { uTime: { value: 0 }, uDawn: { value: 0 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false, blending: THREE.AdditiveBlending
    });
    const top = new THREE.TorusGeometry(radius, 0.14, 6, 64).rotateX(Math.PI / 2).translate(0, WALL_H, 0);
    const ground = new THREE.RingGeometry(radius - 0.8, radius - 0.05, 64, 1).rotateX(-Math.PI / 2).translate(0, 0.07, 0);
    const rimGeo = new THREE.BufferGeometry();
    const tA = top.toNonIndexed();
    const gA = ground.toNonIndexed();
    for (const name of ['position', 'uv'] as const) {
      const a = tA.getAttribute(name) as THREE.BufferAttribute;
      const b = gA.getAttribute(name) as THREE.BufferAttribute;
      const arr = new Float32Array(a.array.length + b.array.length);
      arr.set(a.array as Float32Array, 0);
      arr.set(b.array as Float32Array, a.array.length);
      rimGeo.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    const rim = new THREE.Mesh(rimGeo, this.rimMat);
    rim.renderOrder = 2;
    this.wallRoot.add(wall, rim);
    this.wallRoot.position.y = -WALL_H;

    // 地板：草皮 + 中央玫瑰紋章 (頂點色，receiveShadow)
    this.floor = new THREE.Mesh(BossArena.buildFloor(radius + 0.4), new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.floor.receiveShadow = true;
    this.floor.position.y = 0.045;

    this.group.add(this.wallRoot, this.floor);
    this.group.visible = false;
  }

  // 圓盤地板：依半徑 / 角度上色 (草皮、中央玫瑰花紋、外圈暗紅)
  private static buildFloor(r: number): THREE.BufferGeometry {
    const geo = new THREE.CircleGeometry(r, 96, 0, Math.PI * 2);
    // 增加環狀細分以承載頂點色紋章 (R23：20 環 × 96 段 ≈ 2k 頂點)
    const rings = 20;
    const segs = 96;
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i <= rings; i++) {
      const rr = (i / rings) * r;
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        pos.push(Math.cos(a) * rr, 0, -Math.sin(a) * rr);
        const nr = rr / r;
        const rose = Math.cos(a * 5) * 0.5 + 0.5;
        if (nr < 0.12) c.setHex(0xb3123a);
        else if (nr < 0.3) c.setHex(rose > 0.55 ? 0xd61f4b : 0x7a1035);
        else if (nr < 0.34) c.setHex(0xe2b33c);
        else if (nr > 0.93) c.setHex(0x5b1a2a);
        else c.setHex((i + j) % 2 === 0 ? 0x4a7a3a : 0x426f34);
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j;
        const b = a + segs + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    geo.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  public get isUp(): boolean {
    return this.anim === 'UP';
  }

  /** 開始升起 (1.5s easeOutBack) */
  public rise() {
    this.group.visible = true;
    this.anim = 'RISING';
    this.t = 0;
  }

  /** 開始降下 (1.2s) */
  public lower() {
    if (this.anim === 'DOWN') return;
    this.anim = 'LOWERING';
    this.t = 0;
  }

  /** 立即收起 (中止 / 切世界) */
  public hideNow() {
    this.anim = 'DOWN';
    this.wallRoot.position.y = -WALL_H;
    this.group.visible = false;
  }

  /** 地板顯示 (卸載校園草皮時接手) */
  /** 黎明程度 0~1 (牆與頂緣光環由暮紅轉晨金；只改 uniform) */
  public setDawn(k: number) {
    const v = Math.max(0, Math.min(1, k));
    this.wallMat.uniforms.uDawn.value = v;
    this.rimMat.uniforms.uDawn.value = v;
  }

  public setFloorVisible(v: boolean) {
    this.floor.visible = v;
  }

  public update(dt: number) {
    if (this.anim === 'DOWN') return;
    this.time += dt;
    this.wallMat.uniforms.uTime.value = this.time;
    this.rimMat.uniforms.uTime.value = this.time;
    if (this.anim === 'RISING') {
      this.t += dt / RISE_SEC;
      const k = this.t >= 1 ? 1 : easeOutBack(this.t);
      this.wallRoot.position.y = -WALL_H * (1 - k);
      if (this.t >= 1) { this.anim = 'UP'; this.wallRoot.position.y = 0; }
    } else if (this.anim === 'LOWERING') {
      this.t += dt / LOWER_SEC;
      const k = Math.min(1, this.t);
      this.wallRoot.position.y = -WALL_H * k * k;
      if (this.t >= 1) this.hideNow();
    }
  }

  public prewarm(compile: () => void) {
    const v = this.group.visible;
    const y = this.wallRoot.position.y;
    this.group.visible = true;
    this.wallRoot.position.y = 0;
    compile();
    this.wallRoot.position.y = y;
    this.group.visible = v;
  }
}
