import * as THREE from 'three';
import type { Mode, ObjDef, ObjType, World } from '../logic/types';
import { activeIn } from '../logic/geometry';
import { Painter } from './materials';
import { PAL } from './palette';
import { paperBackground } from './textures';
import { DraftsmanModel } from './models/player';
import { NibKeyModel } from './models/key';
import { crateModel, noteModel, plinthModel, railModel, shelfModel, tableModel } from './models/props';
import { doorModel, gateModel, plateModel, valveModel, wallModel } from './models/devices';
import { buildDecor, floorModel, type Decor } from './models/room';
import type { PropModel } from './models/types';

type Builder = (p: Painter, d: ObjDef) => PropModel;
const BUILDERS: Partial<Record<ObjType, Builder>> = {
  floor: floorModel, shelf: shelfModel, crate: crateModel, plinth: plinthModel, rail: railModel, table: tableModel,
  note: noteModel, wall: wallModel, gate: gateModel, door: doorModel, valve: valveModel, plate: plateModel
};

/** 圖紙專屬物件在 2D 畫在最前面 (不被牆 / 地板擋住)，玩家再前面一層 */
const FRONT_2D = 6.3;
const PLAYER_2D = 7;

interface Entry { id: string; model: PropModel; key?: NibKeyModel }

/** 場景：依世界狀態建立 / 更新模型，並依模式切換「現實」(光影材質) 或「圖紙」(扁平描邊色塊) 外觀 */
export class PuzzleScene {
  readonly scene = new THREE.Scene();
  private paint = new Painter();
  private entries: Entry[] = [];
  private decor: Decor;
  private player: DraftsmanModel;
  private sun = new THREE.DirectionalLight(0xfff0d8, 1.25);
  private bg3d = new THREE.Color(PAL.bg3d);
  private occluders: THREE.Mesh[] = [];
  /** 離鏡頭太近也要淡出的網格 (吊燈) */
  private nearFaders = new Set<THREE.Mesh>();
  private ray = new THREE.Raycaster();
  private mode: Mode | null = null;
  private lastX = 0;
  private lastY = 0;
  private lastZ = 0;

  constructor(private world: World) {
    this.scene.add(new THREE.HemisphereLight(0xfff1dc, 0x6b4a32, 0.85));
    this.scene.add(new THREE.AmbientLight(0xffe2c0, 0.25));
    const b = world.level.bounds;
    this.sun.position.set(-8, 16, 12);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    const half = (b.maxX - b.minX) / 2 + 3;
    cam.left = -half; cam.right = half; cam.top = 14; cam.bottom = -14; cam.near = 1; cam.far = 50;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.decor = buildDecor(this.paint, world.level);
    this.scene.add(this.decor.root);
    this.occluders.push(...this.decor.occluders);
    this.nearFaders = new Set(this.decor.occluders);
    for (const o of world.objs) this.entries.push(this.build(o.def));
    this.player = new DraftsmanModel(this.paint);
    this.scene.add(this.player.root);
    const p = world.player;
    this.lastX = p.x; this.lastY = p.y; this.lastZ = p.z;
  }

  private build(def: ObjDef): Entry {
    if (def.type === 'key') {
      const key = new NibKeyModel(this.paint);
      this.scene.add(key.root);
      return { id: def.id, model: { root: key.root }, key };
    }
    const builder = BUILDERS[def.type];
    const model = builder ? builder(this.paint, def) : { root: new THREE.Group() };
    this.scene.add(model.root);
    if (model.occluders) this.occluders.push(...model.occluders);
    return { id: def.id, model };
  }

  private applyMode(mode: Mode): void {
    this.mode = mode;
    const is2d = mode === '2d';
    this.paint.setMode(mode);
    this.scene.background = is2d ? paperBackground() : this.bg3d;
    this.sun.castShadow = !is2d;
    for (const m of this.occluders) this.setOpacity(m, 1);
  }

  private setOpacity(m: THREE.Mesh, a: number): void {
    const mat = m.material as THREE.Material;
    mat.opacity = a;
    mat.transparent = a < 0.999;
    mat.depthWrite = a > 0.6;
  }

  /** 3D：相機與玩家之間的隔牆 / 吊燈淡出，離鏡頭太近的吊燈也淡出，避免擋住視線 */
  private fadeOccluders(camera: THREE.Camera, dt: number): void {
    const p = this.world.player;
    const target = new THREE.Vector3(p.x, p.y + 0.6, p.z);
    const origin = camera.position.clone();
    const dir = target.clone().sub(origin);
    const far = dir.length();
    this.ray.set(origin, dir.normalize());
    this.ray.far = far;
    const blocked = new Set(this.ray.intersectObjects(this.occluders, false).map(h => h.object));
    const wp = new THREE.Vector3();
    const cp = new THREE.Vector3();
    const sight = new THREE.Line3(origin, target);
    for (const m of this.occluders) {
      const mat = m.material as THREE.Material;
      // 吊燈：離「鏡頭→玩家」視線太近就淡出 (燈罩比射線粗，單靠射線打不到)
      const near = this.nearFaders.has(m) && sight.closestPointToPoint(m.getWorldPosition(wp), true, cp).distanceTo(wp) < 1.8;
      const goal = blocked.has(m) || near ? 0.22 : 1;
      this.setOpacity(m, mat.opacity + (goal - mat.opacity) * Math.min(1, dt * 8));
    }
  }

  /** 釋放幾何與材質 (紋理為全域快取，保留) */
  dispose(): void {
    const mats = new Set<THREE.Material>();
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => mats.add(x));
    });
    this.paint.allMaterials().forEach(x => mats.add(x));
    mats.forEach(x => x.dispose());
    this.sun.shadow.map?.dispose();
  }

  /** 每幀：同步位置、可見性與動畫 */
  update(renderMode: Mode, dt: number, t: number, camera: THREE.Camera): void {
    const w = this.world;
    const is2d = renderMode === '2d';
    if (this.mode !== renderMode) this.applyMode(renderMode);
    for (const e of this.entries) {
      const o = w.byId.get(e.id)!;
      const root = e.model.root;
      root.visible = !o.gone && activeIn(o.def.visible, renderMode);
      const z = is2d && o.def.visible === '2d' ? FRONT_2D : o.z;
      root.position.set(o.x, o.y, z);
      if (!root.visible) continue;
      e.model.update?.({ obj: o, world: w, mode: renderMode, t, dt });
      e.key?.update(t, is2d);
    }
    this.decor.update(t, is2d);
    if (!is2d) this.fadeOccluders(camera, dt);

    const p = w.player;
    const sdt = Math.max(dt, 1e-3);
    const speed = Math.hypot(p.x - this.lastX, p.mode === '3d' ? p.z - this.lastZ : 0) / sdt;
    const vy = (p.y - this.lastY) / sdt;
    this.lastX = p.x; this.lastY = p.y; this.lastZ = p.z;
    this.player.root.position.set(p.x, p.y, is2d ? PLAYER_2D : p.z);
    this.player.update({ speed: speed > 8 ? 0 : speed, grounded: p.onGround, vy, facing: p.facing, mode: renderMode, t, dt });
  }
}
