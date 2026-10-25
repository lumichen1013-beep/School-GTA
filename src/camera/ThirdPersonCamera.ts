import * as THREE from 'three';
import { CollidableBox } from '../world/CampusWorld';

export class ThirdPersonCamera {
  public camera: THREE.PerspectiveCamera;
  private target: THREE.Vector3 = new THREE.Vector3();
  private currentPosition: THREE.Vector3 = new THREE.Vector3();
  private currentLookAt: THREE.Vector3 = new THREE.Vector3();

  // Spherical orbit parameters
  public yaw: number = 0; // Horizontal angle (radians)
  public pitch: number = 0.25; // Vertical angle (radians)
  public distance: number = 4.2;
  public targetDistance: number = 4.2;

  public sensitivityX: number = 0.0022;
  public sensitivityY: number = 0.002;

  constructor(fov: number, aspect: number, near: number, far: number) {
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  }

  public updateRotation(deltaX: number, deltaY: number) {
    this.yaw -= deltaX * this.sensitivityX;
    this.pitch += deltaY * this.sensitivityY;

    // Clamp pitch to avoid camera flipping over head or under ground
    const minPitch = -0.15; // slightly looking up
    const maxPitch = 1.35; // steep look down
    this.pitch = Math.max(minPitch, Math.min(maxPitch, this.pitch));
  }

  public setMode(isVehicle: boolean) {
    this.targetDistance = isVehicle ? 7.5 : 4.2;
    this.camera.fov = isVehicle ? 72 : 65;
    this.camera.updateProjectionMatrix();
  }

  public update(targetPos: THREE.Vector3, delta: number, colliders: CollidableBox[] = []) {
    this.target.copy(targetPos);
    // Offset target to character head/chest height (1.35m)
    const focusPoint = this.target.clone().add(new THREE.Vector3(0, 1.35, 0));

    // 1. 檢測玩家所在場景區域
    // 北樓梯間：X: 27.5 ~ 34.5, Z: -9.5 ~ 1.5, Y: 0 ~ 24.5 (對齊 28.0 ~ 34.0 走廊與樓梯)
    const inNorthStairwell = targetPos.x >= 27.5 && targetPos.x <= 34.5 && targetPos.z >= -9.5 && targetPos.z <= 1.5;
    // 南樓梯間：X: 27.5 ~ 34.5, Z: 88.5 ~ 99.5, Y: 0 ~ 24.5
    const inSouthStairwell = targetPos.x >= 27.5 && targetPos.x <= 34.5 && targetPos.z >= 88.5 && targetPos.z <= 99.5;
    const inStairwell = (inNorthStairwell || inSouthStairwell) && targetPos.y < 23.5;

    // 教學大樓本體區域 (敬業樓、樂群樓與空中天橋，扣除樓梯間垂直軸)
    const inMainBuilding = targetPos.x >= 25.5 && targetPos.x <= 48.5 && targetPos.z >= 1.0 && targetPos.z <= 89.0;
    const isIndoors = (inMainBuilding || inStairwell) && targetPos.y < 17.5;

    // 2. 平滑調節適當跟隨距離：
    // 在狹窄的樓梯間內使用緊湊跟隨距離 (1.85m)，提供最佳爬樓梯與折返轉角視野，防止鏡頭推入外牆！
    // 在走廊與教室內使用 2.8m，室外則保持 4.2m (步行) / 7.5m (載具)
    const effectiveTargetDistance = inStairwell
      ? 1.85
      : (isIndoors ? Math.min(this.targetDistance, 2.8) : this.targetDistance);

    this.distance = THREE.MathUtils.lerp(this.distance, effectiveTargetDistance, delta * 6.0);

    // 3. 計算球面座標之理想鏡頭位置
    const horizontalDistance = this.distance * Math.cos(this.pitch);
    const verticalDistance = this.distance * Math.sin(this.pitch);

    const offsetX = horizontalDistance * Math.sin(this.yaw);
    const offsetZ = horizontalDistance * Math.cos(this.yaw);
    const offsetY = verticalDistance;

    const idealPosition = new THREE.Vector3(
      focusPoint.x + offsetX,
      focusPoint.y + offsetY,
      focusPoint.z + offsetZ
    );

    // 4. 實體障礙物與實體牆壁遮擋射線/球體檢測 (AABB Swept-Sphere Raycast)
    let actualPosition = idealPosition.clone();

    if (colliders.length > 0) {
      const rayDir = idealPosition.clone().sub(focusPoint);
      const targetDist = rayDir.length();

      if (targetDist > 0.05) {
        rayDir.normalize();
        let minHitDist = targetDist;
        const cameraRadius = 0.32; // 攝影機防穿透緩衝厚度

        for (const box of colliders) {
          if (box.isFloorOnly) continue; // 地板與斜坡單獨由高度限制與地面處理

          // 將 AABB 向外膨脹 cameraRadius，等效於球體掃描 (Swept Sphere)
          const bMinX = box.min.x - cameraRadius;
          const bMaxX = box.max.x + cameraRadius;
          const bMinY = box.min.y - cameraRadius;
          const bMaxY = box.max.y + cameraRadius;
          const bMinZ = box.min.z - cameraRadius;
          const bMaxZ = box.max.z + cameraRadius;

          // 若角色焦點已在膨脹盒內，略過以防止鏡頭直接吸附在角色身後
          if (
            focusPoint.x >= bMinX && focusPoint.x <= bMaxX &&
            focusPoint.y >= bMinY && focusPoint.y <= bMaxY &&
            focusPoint.z >= bMinZ && focusPoint.z <= bMaxZ
          ) {
            continue;
          }

          const hitDist = this.intersectRayAABB(
            focusPoint,
            rayDir,
            bMinX, bMaxX,
            bMinY, bMaxY,
            bMinZ, bMaxZ,
            minHitDist
          );

          if (hitDist !== null && hitDist < minHitDist && hitDist > 0.25) {
            minHitDist = hitDist;
          }
        }

        if (minHitDist < targetDist) {
          actualPosition = focusPoint.clone().add(rayDir.clone().multiplyScalar(minHitDist));
        }
      }
    }

    // 5. 樓梯間與室內空間絕對防穿牆約束 (Hard Spatial Boundaries)
    const inOrNearNorthStair = (inNorthStairwell || (actualPosition.x >= 27.0 && actualPosition.x <= 35.0 && actualPosition.z >= -9.5 && actualPosition.z <= 1.5)) && targetPos.y < 23.5;
    const inOrNearSouthStair = (inSouthStairwell || (actualPosition.x >= 27.0 && actualPosition.x <= 35.0 && actualPosition.z >= 88.5 && actualPosition.z <= 99.5)) && targetPos.y < 23.5;

    if (inOrNearNorthStair) {
      // 樓梯間外牆：西外牆 X=28.0，東外牆 X=34.0，北外牆 Z=-8.5
      // 鏡頭 X 座標嚴格鎖定在室內安全空間 [28.35, 33.65]，Z 座標不小於 -8.15，絕對杜絕穿透至外牆外！
      actualPosition.x = Math.max(28.35, Math.min(33.65, actualPosition.x));
      actualPosition.z = Math.max(-8.15, actualPosition.z);
      // 垂直高度：不低於當前踏步上方 0.25m，不高於梯屋頂蓋 (23.2m)
      actualPosition.y = Math.max(targetPos.y + 0.25, Math.min(23.2, actualPosition.y));
    } else if (inOrNearSouthStair) {
      // 南樓梯間外牆：西外牆 X=28.0，東外牆 X=34.0，南外牆 Z=98.5
      actualPosition.x = Math.max(28.35, Math.min(33.65, actualPosition.x));
      actualPosition.z = Math.min(98.15, actualPosition.z);
      actualPosition.y = Math.max(targetPos.y + 0.25, Math.min(23.2, actualPosition.y));
    } else {
      // 教學大樓一般室內樓層天花板限制 (僅在 Z: 1.0 ~ 89.0 範圍之教室與走廊)
      const camInMainBuilding = (actualPosition.x >= 27.0 && actualPosition.x <= 48.5 && actualPosition.z >= 1.0 && actualPosition.z <= 89.0);
      if ((inMainBuilding || camInMainBuilding) && targetPos.y < 17.5) {
        const floorH = 6.0;
        const floorIdx = Math.floor(Math.max(0, targetPos.y + 0.1) / floorH);
        const ceilingY = (floorIdx + 1) * floorH;
        const maxCameraY = ceilingY - 0.55;
        const minCameraY = floorIdx * floorH + 0.45;

        actualPosition.y = Math.min(actualPosition.y, maxCameraY);
        actualPosition.y = Math.max(actualPosition.y, minCameraY);
      }
    }

    // 6. 鏡頭位置與視線平滑插值 (Smooth Camera Lag)
    const lerpFactor = Math.min(delta * 14.0, 1.0);
    this.currentPosition.lerp(actualPosition, lerpFactor);
    this.currentLookAt.lerp(focusPoint, lerpFactor);

    // 7. 插值後再次確認不穿透樓梯間外牆
    if (inOrNearNorthStair) {
      this.currentPosition.x = Math.max(28.35, Math.min(33.65, this.currentPosition.x));
      this.currentPosition.z = Math.max(-8.15, this.currentPosition.z);
      this.currentPosition.y = Math.max(targetPos.y + 0.25, Math.min(23.2, this.currentPosition.y));
    } else if (inOrNearSouthStair) {
      this.currentPosition.x = Math.max(28.35, Math.min(33.65, this.currentPosition.x));
      this.currentPosition.z = Math.min(98.15, this.currentPosition.z);
      this.currentPosition.y = Math.max(targetPos.y + 0.25, Math.min(23.2, this.currentPosition.y));
    } else {
      const camInMainBuilding = (this.currentPosition.x >= 25.5 && this.currentPosition.x <= 48.5 && this.currentPosition.z >= 1.0 && this.currentPosition.z <= 89.0);
      if ((inMainBuilding || camInMainBuilding) && targetPos.y < 17.5) {
        const floorH = 6.0;
        const floorIdx = Math.floor(Math.max(0, targetPos.y + 0.1) / floorH);
        const ceilingY = (floorIdx + 1) * floorH;
        const maxCameraY = ceilingY - 0.55;
        const minCameraY = floorIdx * floorH + 0.45;

        this.currentPosition.y = Math.min(this.currentPosition.y, maxCameraY);
        this.currentPosition.y = Math.max(this.currentPosition.y, minCameraY);
      }
    }

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  // 高效射線-AABB相交算法 (Kay-Kajiya Slab Ray-AABB Intersection)
  private intersectRayAABB(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    minX: number, maxX: number,
    minY: number, maxY: number,
    minZ: number, maxZ: number,
    maxT: number
  ): number | null {
    let tMin = 0.0;
    let tMax = maxT;

    // X slab
    if (Math.abs(dir.x) < 1e-6) {
      if (origin.x < minX || origin.x > maxX) return null;
    } else {
      const invD = 1.0 / dir.x;
      let t1 = (minX - origin.x) * invD;
      let t2 = (maxX - origin.x) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }

    // Y slab
    if (Math.abs(dir.y) < 1e-6) {
      if (origin.y < minY || origin.y > maxY) return null;
    } else {
      const invD = 1.0 / dir.y;
      let t1 = (minY - origin.y) * invD;
      let t2 = (maxY - origin.y) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }

    // Z slab
    if (Math.abs(dir.z) < 1e-6) {
      if (origin.z < minZ || origin.z > maxZ) return null;
    } else {
      const invD = 1.0 / dir.z;
      let t1 = (minZ - origin.z) * invD;
      let t2 = (maxZ - origin.z) * invD;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return null;
    }

    return tMin <= maxT && tMin >= 0 ? tMin : null;
  }

  // Get camera's forward heading on the XZ horizontal plane
  public getForwardVector(): THREE.Vector3 {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    return forward;
  }

  // Get camera's right horizontal vector
  public getRightVector(): THREE.Vector3 {
    const forward = this.getForwardVector();
    return new THREE.Vector3(-forward.z, 0, forward.x).normalize();
  }
}
