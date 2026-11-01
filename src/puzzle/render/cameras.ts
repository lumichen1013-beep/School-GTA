import * as THREE from 'three';
import type { Mode, World } from '../logic/types';

/** 3D 斜後上方固定角度跟隨 / 2D 正交側視 (沿 z 軸) */
export class PuzzleCameras {
  readonly persp = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
  readonly ortho = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 100);
  private target = new THREE.Vector3();
  private viewH = 9;

  constructor(private world: World) {
    this.snap();
  }

  resize(aspect: number): void {
    this.persp.aspect = aspect;
    this.persp.updateProjectionMatrix();
    this.ortho.left = -this.viewH * aspect / 2;
    this.ortho.right = this.viewH * aspect / 2;
    this.ortho.top = this.viewH / 2;
    this.ortho.bottom = -this.viewH / 2;
    this.ortho.updateProjectionMatrix();
  }

  snap(): void { this.follow(1, '3d'); }

  follow(k: number, mode: Mode): void {
    const p = this.world.player;
    const b = this.world.level.bounds;
    const z = mode === '3d' ? p.z : p.z3d;
    this.target.lerp(new THREE.Vector3(p.x, 0.8, z), k);
    this.persp.position.set(this.target.x, this.target.y + 6.5, this.target.z + 9);
    this.persp.lookAt(this.target.x, this.target.y, this.target.z - 1);
    const half = (this.ortho.right - this.ortho.left) / 2;
    const cx = Math.min(Math.max(p.x, b.minX + half), Math.max(b.maxX - half, b.minX + half));
    this.ortho.position.set(Math.abs(b.maxX - b.minX) <= half * 2 ? 0 : cx, 2.2, 30);
    this.ortho.lookAt(this.ortho.position.x, 2.2, 0);
  }

  active(mode: Mode): THREE.Camera { return mode === '3d' ? this.persp : this.ortho; }
}
