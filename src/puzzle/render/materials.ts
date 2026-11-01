import * as THREE from 'three';
import type { Mode } from '../logic/types';
import { PAL } from './palette';

/** 2D 描邊粗細 (世界單位) */
const OUTLINE = 0.04;

export interface PaintOpts {
  /** 3D 才貼的紋理 (2D 用扁平色) */
  map?: THREE.Texture;
  emissive?: number;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  /** 2D 扁平色 (預設同 color) */
  flat?: number;
  /** 2D 也貼紋理 (紙條字跡、掛畫、壁紙這類本來就是「畫」的東西) */
  flatMap?: boolean;
  /** 2D 是否畫深色描邊 (預設 true) */
  outline?: boolean;
  /** 3D 陰影 (預設 true) */
  shadow?: boolean;
  /** 不共用材質 (需要個別調整透明度時) */
  unique?: boolean;
  side?: THREE.Side;
}

interface Item { mesh: THREE.Mesh; m3: THREE.Material; m2: THREE.Material; outline: THREE.Mesh | null }

/**
 * 同一個網格兩套外觀：
 * - 現實 (3D)：MeshStandardMaterial + 紋理 + 陰影
 * - 圖紙 (2D)：MeshBasicMaterial 扁平色塊 + 放大背面的深色描邊 (剪紙 / 繪本風)
 */
export class Painter {
  private items: Item[] = [];
  private cache3 = new Map<string, THREE.Material>();
  private cache2 = new Map<string, THREE.Material>();
  private outlineMat = new THREE.MeshBasicMaterial({ color: PAL.outline, side: THREE.BackSide });
  private mode: Mode = '3d';

  mesh(geo: THREE.BufferGeometry, color: number, opts: PaintOpts = {}): THREE.Mesh {
    const m3 = this.mat3(color, opts);
    const m2 = this.mat2(opts.flat ?? color, opts);
    const mesh = new THREE.Mesh(geo, this.mode === '3d' ? m3 : m2);
    const shadow = opts.shadow ?? true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    let outline: THREE.Mesh | null = null;
    if (opts.outline ?? true) {
      outline = this.makeOutline(geo);
      outline.visible = this.mode === '2d';
      mesh.add(outline);
    }
    this.items.push({ mesh, m3, m2, outline });
    return mesh;
  }

  /** 兩種模式的所有材質 (釋放資源用) */
  allMaterials(): THREE.Material[] {
    return [this.outlineMat, ...this.items.flatMap(i => [i.m3, i.m2])];
  }

  private makeOutline(geo: THREE.BufferGeometry): THREE.Mesh {
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const size = bb.getSize(new THREE.Vector3());
    const center = bb.getCenter(new THREE.Vector3());
    const o = new THREE.Mesh(geo, this.outlineMat);
    const s = (v: number) => 1 + (2 * OUTLINE) / Math.max(v, 0.05);
    o.scale.set(s(size.x), s(size.y), s(size.z));
    o.position.set(center.x * (1 - o.scale.x), center.y * (1 - o.scale.y), center.z * (1 - o.scale.z));
    o.castShadow = false;
    o.receiveShadow = false;
    return o;
  }

  private mat3(color: number, o: PaintOpts): THREE.Material {
    const key = [color, o.map?.uuid ?? '', o.emissive ?? '', o.emissiveIntensity ?? '', o.roughness ?? '', o.metalness ?? '', o.side ?? ''].join('|');
    const hit = !o.unique && this.cache3.get(key);
    if (hit) return hit;
    const m = new THREE.MeshStandardMaterial({
      color, map: o.map ?? null, roughness: o.roughness ?? 0.82, metalness: o.metalness ?? 0,
      emissive: o.emissive ?? 0x000000, emissiveIntensity: o.emissiveIntensity ?? 1, side: o.side ?? THREE.FrontSide
    });
    if (!o.unique) this.cache3.set(key, m);
    return m;
  }

  private mat2(color: number, o: PaintOpts): THREE.Material {
    const map = o.flatMap ? o.map ?? null : null;
    const key = `${color}|${map?.uuid ?? ''}|${o.side ?? ''}`;
    const hit = !o.unique && this.cache2.get(key);
    if (hit) return hit;
    const m = new THREE.MeshBasicMaterial({ color, map, side: o.side ?? THREE.FrontSide });
    if (!o.unique) this.cache2.set(key, m);
    return m;
  }

  setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const it of this.items) {
      it.mesh.material = mode === '3d' ? it.m3 : it.m2;
      if (it.outline) it.outline.visible = mode === '2d';
    }
  }
}

/** 光暈 Sprite (預設一般混合：在奶油色紙張上也看得見；additive 適合暗處) */
export function glowSprite(tex: THREE.Texture, color: number, size: number, opacity = 0.8, additive = false): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  }));
  s.scale.set(size, size, 1);
  return s;
}
