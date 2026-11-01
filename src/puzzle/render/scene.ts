import * as THREE from 'three';
import type { Mode, ObjType, World } from '../logic/types';
import { activeIn } from '../logic/geometry';
import { PLAYER_H, PLAYER_HW } from '../logic/constants';

const COLORS: Record<ObjType, number> = {
  floor: 0xd9c49b, shelf: 0x8b5a2b, crate: 0xc08f55, plinth: 0xa08158, rail: 0x7a5230,
  key: 0xe3b23c, valve: 0x6a8fa8, door: 0x6b4a32, note: 0xfff3d4
};
const PAPER = 0xefe2c6;
const BLUEPRINT = 0x12306b;

interface Entry { id: string; group: THREE.Object3D; mesh: THREE.Mesh; edges: THREE.LineSegments; orig: THREE.Material; type: ObjType | 'player' }

/** 場景：依世界狀態建立 / 更新網格，並依模式切換「現實」或「圖紙」外觀 */
export class PuzzleScene {
  readonly scene = new THREE.Scene();
  private entries: Entry[] = [];
  private decor: THREE.Object3D[] = [];
  private seal = new THREE.Group();
  private sealMat = new THREE.MeshBasicMaterial({ color: 0x17120d });
  private bpFill = new THREE.MeshBasicMaterial({ color: BLUEPRINT, transparent: true, opacity: 0.55, depthWrite: false });
  private bpPlayer = new THREE.MeshBasicMaterial({ color: 0x4f86e6, transparent: true, opacity: 0.9, depthWrite: false });
  private bpValve = new THREE.MeshBasicMaterial({ color: 0x1d6f9a, transparent: true, opacity: 0.8, depthWrite: false });
  private edgeMat = new THREE.LineBasicMaterial({ color: 0x4a3a28, transparent: true, opacity: 0.4 });
  private edgeMat2d = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true });
  private valveEdge2d = new THREE.LineBasicMaterial({ color: 0x8fecff, depthTest: false, transparent: true });
  private mode: Mode | null = null;
  private player!: Entry;

  constructor(private world: World) {
    this.scene.add(new THREE.AmbientLight(0xffe9cc, 0.85));
    const sun = new THREE.DirectionalLight(0xfff0d2, 1.1);
    sun.position.set(-6, 12, 8);
    this.scene.add(sun);
    const lamp = new THREE.PointLight(0xffb866, 28, 26, 1.6);
    lamp.position.set(0, 4.6, 1);
    this.scene.add(lamp);
    this.buildDecor();
    for (const o of world.objs) this.entries.push(this.makeBox(o.def.id, o.def.type, o.def.w, o.def.h, o.def.d));
    this.buildPlayer();
    this.buildSeal();
  }

  private makeBox(id: string, type: ObjType | 'player', w: number, h: number, d: number): Entry {
    const geo = type === 'valve' ? new THREE.CylinderGeometry(w / 2, w / 2, h, 16) : new THREE.BoxGeometry(w, h, d);
    const orig = new THREE.MeshLambertMaterial({ color: type === 'player' ? 0xc4553a : COLORS[type as ObjType] });
    const mesh = new THREE.Mesh(geo, orig);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.edgeMat);
    const group = new THREE.Group();
    group.add(mesh, edges);
    this.scene.add(group);
    return { id, group, mesh, edges, orig, type };
  }

  private buildPlayer(): void {
    this.player = this.makeBox('player', 'player', PLAYER_HW * 2, PLAYER_H, PLAYER_HW * 1.3);
    this.entries.push(this.player);
  }

  private buildSeal(): void {
    const door = this.world.byId.get('door')!;
    for (const y of [0.5, 1.1, 1.7]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, door.def.d + 0.1), this.sealMat);
      bar.position.set(0, y, 0);
      this.seal.add(bar);
    }
    const diag = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.09, door.def.d * 1.3), this.sealMat);
    diag.position.set(0, 1.2, 0);
    diag.rotation.x = Math.atan2(2.2, door.def.d);
    this.seal.add(diag);
    this.seal.position.set(door.x - 0.3, 0, door.z);
    this.scene.add(this.seal);
  }

  private buildDecor(): void {
    const b = this.world.level.bounds;
    const wallMat = new THREE.MeshLambertMaterial({ color: PAPER });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(b.maxX - b.minX, 11), wallMat);
    back.position.set(0, -0.5, b.minZ - 0.01);
    const side = (x: number, rot: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(b.maxZ - b.minZ, 11), wallMat);
      m.position.set(x, -0.5, 0);
      m.rotation.y = rot;
      return m;
    };
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(4, b.maxZ - b.minZ), new THREE.MeshBasicMaterial({ color: 0x2b2118 }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(0, -3.5, 0);
    this.decor.push(back, side(b.minX - 0.01, Math.PI / 2), side(b.maxX + 0.01, -Math.PI / 2), pit);
    this.scene.add(...this.decor);
  }

  /** 每幀：同步位置、可見性與外觀 */
  update(renderMode: Mode): void {
    const w = this.world;
    const is2d = renderMode === '2d';
    if (this.mode !== renderMode) {
      this.mode = renderMode;
      this.scene.background = new THREE.Color(is2d ? 0x0d2a63 : 0x3a2c1e);
      for (const d of this.decor) d.visible = !is2d;
      this.sealMat.color.set(is2d ? 0x8fecff : 0x17120d);
      for (const e of this.entries) {
        const isValve = e.type === 'valve';
        e.mesh.material = is2d ? (e.type === 'player' ? this.bpPlayer : isValve ? this.bpValve : this.bpFill) : e.orig;
        e.edges.material = is2d ? (isValve ? this.valveEdge2d : this.edgeMat2d) : this.edgeMat;
        e.mesh.renderOrder = is2d ? 1 : 0;
        e.edges.renderOrder = is2d ? 2 : 0;
      }
    }
    for (const o of w.objs) {
      const e = this.entries.find(en => en.id === o.def.id)!;
      e.group.visible = !o.gone && activeIn(o.def.visible, renderMode);
      e.group.position.set(o.x, o.y + o.def.h / 2, o.z);
      if (o.def.type === 'valve' && o.used) e.mesh.visible = false;
    }
    this.seal.visible = w.sealed;
    const p = w.player;
    this.player.group.position.set(p.x, p.y + PLAYER_H / 2, is2d ? 7 : p.z);
    this.player.group.rotation.y = p.facing;
  }
}
