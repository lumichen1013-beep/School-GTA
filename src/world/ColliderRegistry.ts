import * as THREE from 'three';

export interface CollidableBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
  isFloorOnly?: boolean; // Walkable slabs/ramps: provides groundY support, never blocks horizontal movement!
  isRamp?: boolean;
  rampMinZ?: number;
  rampMaxZ?: number;
  rampYAtMinZ?: number;
  rampYAtMaxZ?: number;
}

export interface ColliderRegistryOptions {
  defaultWallHeight: number; // addCollider 未指定 maxY 時的預設牆高
  slabBelow: number;         // 地板層板向下厚度 (min.y = floorY - slabBelow)
  slabAbove: number;         // 地板層板向上延伸 (max.y = floorY + slabAbove)
  rampTopPad: number;        // 坡道碰撞盒頂部額外延伸
}

// 世界碰撞體登記：牆面/立柱 (阻擋)、地板層板與坡道 (僅提供站立高度，不阻擋水平移動)
export class ColliderRegistry {
  constructor(public readonly colliders: CollidableBox[], private readonly opts: ColliderRegistryOptions) {}

  // 註冊垂直阻擋物體 (牆面、立柱、鐵欄杆、設施等)
  public addCollider(minX: number, maxX: number, minZ: number, maxZ: number, minY: number = 0, maxY: number = this.opts.defaultWallHeight): CollidableBox {
    const box: CollidableBox = {
      min: new THREE.Vector3(Math.min(minX, maxX), minY, Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), maxY, Math.max(minZ, maxZ))
    };
    this.colliders.push(box);
    return box;
  }

  // 註冊可站立行走的地板層板 (Floor Slabs)
  public addFloorSlab(minX: number, maxX: number, minZ: number, maxZ: number, floorY: number) {
    this.colliders.push({
      min: new THREE.Vector3(Math.min(minX, maxX), floorY - this.opts.slabBelow, Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), floorY + this.opts.slabAbove, Math.max(minZ, maxZ)),
      isFloorOnly: true
    });
  }

  // 註冊平滑上下樓階梯坡道 (Ramps)：站立高度沿 Z 軸於 yAtMinZ ~ yAtMaxZ 間線性內插
  public addRamp(minX: number, maxX: number, minZ: number, maxZ: number, yAtMinZ: number, yAtMaxZ: number) {
    this.colliders.push({
      min: new THREE.Vector3(Math.min(minX, maxX), Math.min(yAtMinZ, yAtMaxZ) - 0.4, Math.min(minZ, maxZ)),
      max: new THREE.Vector3(Math.max(minX, maxX), Math.max(yAtMinZ, yAtMaxZ) + this.opts.rampTopPad, Math.max(minZ, maxZ)),
      isFloorOnly: true,
      isRamp: true,
      rampMinZ: Math.min(minZ, maxZ),
      rampMaxZ: Math.max(minZ, maxZ),
      rampYAtMinZ: yAtMinZ,
      rampYAtMaxZ: yAtMaxZ
    });
  }
}
