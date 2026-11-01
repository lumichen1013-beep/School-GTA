import * as THREE from 'three';
import type { Mode, World } from '../logic/types';

const OFFSET_3D = new THREE.Vector3(0, 5.4, 8.2);
const VIEW_H_2D = 8.2;
const CENTER_Y_2D = 2.5;

/** 3D 斜後上方跟隨 (房間沒有前牆，鏡頭在前方不會被牆擋；隔牆由場景淡出) / 2D 正交側視水平跟隨 */
export class PuzzleCameras {
  readonly persp = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
  readonly ortho = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 100);
  private target = new THREE.Vector3();
  private orthoX = 0;

  constructor(private world: World) {
    this.snap();
  }

  resize(aspect: number): void {
    this.persp.aspect = aspect;
    // 直屏時拉開視角，避免左右太窄
    this.persp.fov = aspect < 1 ? 62 : 46;
    this.persp.updateProjectionMatrix();
    const viewH = aspect < 1 ? VIEW_H_2D * 1.3 : VIEW_H_2D;
    this.ortho.left = -viewH * aspect / 2;
    this.ortho.right = viewH * aspect / 2;
    this.ortho.top = viewH / 2;
    this.ortho.bottom = -viewH / 2;
    this.ortho.updateProjectionMatrix();
    this.follow(1, '2d');
  }

  snap(): void {
    const p = this.world.player;
    this.target.set(p.x, 0.8, p.z);
    this.orthoX = p.x;
    this.follow(1, '3d');
  }

  follow(k: number, mode: Mode): void {
    const p = this.world.player;
    const b = this.world.level.bounds;
    const z = mode === '3d' ? p.z : p.z3d;
    // 水平限制在房間內 (左右留一點邊)，高度隨玩家站的高度微調
    const tx = Math.min(Math.max(p.x, b.minX + 3), b.maxX - 3);
    const tz = Math.min(Math.max(z, b.minZ + 2), b.maxZ - 1);
    this.target.lerp(new THREE.Vector3(tx, 0.8 + Math.max(p.y, 0) * 0.5, tz), k);
    this.persp.position.copy(this.target).add(OFFSET_3D);
    this.persp.lookAt(this.target.x, this.target.y, this.target.z - 1.2);

    const half = (this.ortho.right - this.ortho.left) / 2;
    const lo = b.minX + half;
    const hi = b.maxX - half;
    const cx = lo > hi ? (b.minX + b.maxX) / 2 : Math.min(Math.max(p.x, lo), hi);
    this.orthoX += (cx - this.orthoX) * k;
    this.ortho.position.set(this.orthoX, CENTER_Y_2D, 30);
    this.ortho.lookAt(this.orthoX, CENTER_Y_2D, 0);
  }

  active(mode: Mode): THREE.Camera { return mode === '3d' ? this.persp : this.ortho; }
}
