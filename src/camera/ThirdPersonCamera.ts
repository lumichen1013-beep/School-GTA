import * as THREE from 'three';
import { CollidableBox } from '../world/CampusWorld';
import { IndoorManager } from '../systems/IndoorManager';
import { queryColliders } from '../physics/aabb';

const _cameraSegNear: CollidableBox[] = [];

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

  // 慢動作特寫鏡頭系統 (Cinematic Execution Close-Up)
  public isCinematicExecution: boolean = false;
  private cinematicTimer: number = 0;
  private cinematicDuration: number = 0;
  private cinematicCamPos: THREE.Vector3 = new THREE.Vector3();
  private cinematicLookAt: THREE.Vector3 = new THREE.Vector3();
  private defaultFov: number = 65;

  // 當前世界 (樓梯間/電梯/大樓天花板約束僅適用天天國中)
  public currentWorld: 'CAMPUS' | 'DETENTION' = 'CAMPUS';

  // 每幀重複使用的暫存向量 (避免 update 迴圈配置新物件)
  private _focus: THREE.Vector3 = new THREE.Vector3();
  private _ideal: THREE.Vector3 = new THREE.Vector3();
  private _actual: THREE.Vector3 = new THREE.Vector3();
  private _rayDir: THREE.Vector3 = new THREE.Vector3();
  private _forward: THREE.Vector3 = new THREE.Vector3();
  private _right: THREE.Vector3 = new THREE.Vector3();

  constructor(fov: number, aspect: number, near: number, far: number) {
    this.defaultFov = fov;
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  }

  private isVehicleMode: boolean = false;

  // 羽球比賽轉播視角：拉遠拉高、視線前移至球網方向，讓角色落在畫面下方不擋球
  public isMatchView: boolean = false;
  private matchBlend: number = 0;
  private matchLookAt: THREE.Vector3 = new THREE.Vector3();
  private static readonly MATCH_DISTANCE = 5.5;
  private static readonly MATCH_PITCH = 0.4;
  private static readonly MATCH_LOOK_AHEAD = 3.0;

  // 手機騎乘單車：視角自動鎖定車頭方向，玩家只需用虛擬搖桿操控
  public isVehicleFollow: boolean = false;

  // 平滑將鏡頭轉至目標朝向正後方 (headingY 為載具 rotationY，前進方向為 (sin, cos))
  public followHeading(headingY: number, delta: number) {
    let diff = (headingY + Math.PI) - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const t = Math.min(delta * 5.0, 1.0);
    this.yaw += diff * t;
    this.pitch = THREE.MathUtils.lerp(this.pitch, 0.25, t);
  }

  public updateRotation(deltaX: number, deltaY: number) {
    if (this.isCinematicExecution && this.cinematicTimer > 0) return; // 特寫運鏡期間鎖定自由視角旋轉
    if (this.isMatchView) return; // 羽球比賽轉播視角鎖定朝向球場
    if (this.isVehicleFollow) return; // 手機騎車視角跟隨車頭
    this.yaw -= deltaX * this.sensitivityX;
    this.pitch += deltaY * this.sensitivityY;

    // Clamp pitch to avoid camera flipping over head or under ground
    const minPitch = -0.15; // slightly looking up
    const maxPitch = 1.35; // steep look down
    this.pitch = Math.max(minPitch, Math.min(maxPitch, this.pitch));
  }

  public updateAspect(aspect: number) {
    this.camera.aspect = aspect;
    // 直向螢幕 (aspect < 1.0) 時適當補償 FOV，避免視野被截斷過窄
    const baseFov = this.isVehicleMode ? 72 : 65;
    if (aspect < 1.0) {
      this.defaultFov = Math.min(80, baseFov + (1.0 - aspect) * 12);
    } else {
      this.defaultFov = baseFov;
    }
    if (!this.isCinematicExecution) {
      this.camera.fov = this.defaultFov;
      this.camera.updateProjectionMatrix();
    }
  }

  // 觸發暗殺/處決慢動作特寫鏡頭 (Cinematic Camera Framing)
  public triggerCinematicExecution(
    bossPos: THREE.Vector3,
    playerPos: THREE.Vector3,
    duration: number = 1.0,
    isFinisher: boolean = false,
    colliders: CollidableBox[] = []
  ) {
    this.isCinematicExecution = true;
    this.cinematicTimer = duration;
    this.cinematicDuration = duration;

    // 焦點設在玩家與受擊目標中間略偏打擊點 (高度約 1.15m)
    const midPoint = new THREE.Vector3().addVectors(playerPos, bossPos).multiplyScalar(0.5);
    this.cinematicLookAt.copy(midPoint).add(new THREE.Vector3(0, 1.15, 0));

    // 打擊方向 (從 Boss 指向 Player)
    const strikeDir = new THREE.Vector3().subVectors(playerPos, bossPos);
    strikeDir.y = 0;
    if (strikeDir.lengthSq() < 0.01) {
      strikeDir.set(0, 0, 1);
    } else {
      strikeDir.normalize();
    }

    // 垂直側翼向量 (90度側角)
    const sideDir = new THREE.Vector3(-strikeDir.z, 0, strikeDir.x);

    // 低角度仰角側前方 2.1m 特寫：形成極富張力的近身搏擊刺客特寫
    const dist = isFinisher ? 2.5 : 2.1;
    this.cinematicCamPos.copy(midPoint)
      .addScaledVector(sideDir, dist * 0.88)
      .addScaledVector(strikeDir, dist * 0.45);
    this.cinematicCamPos.y = Math.max(0.45, playerPos.y + 0.82);

    // 障礙物防穿牆檢測 (避免特寫鏡頭推入水泥柱或掩體)
    if (colliders.length > 0) {
      const rayDir = this.cinematicCamPos.clone().sub(midPoint);
      const targetDist = rayDir.length();
      if (targetDist > 0.1) {
        rayDir.normalize();
        let minHit = targetDist;
        for (const box of colliders) {
          if (box.isFloorOnly) continue;
          const hit = this.intersectRayAABB(
            midPoint,
            rayDir,
            box.min.x - 0.25, box.max.x + 0.25,
            box.min.y - 0.25, box.max.y + 0.25,
            box.min.z - 0.25, box.max.z + 0.25,
            minHit
          );
          if (hit !== null && hit < minHit && hit > 0.3) {
            minHit = hit;
          }
        }
        if (minHit < targetDist) {
          this.cinematicCamPos.copy(midPoint).addScaledVector(rayDir, minHit - 0.1);
        }
      }
    }

    // 鏡頭特寫拉近 (FOV: 65 -> 48 帶來魄力壓縮感)
    this.camera.fov = 48;
    this.camera.updateProjectionMatrix();
  }

  public setMode(isVehicle: boolean) {
    this.isVehicleMode = isVehicle;
    this.targetDistance = isVehicle ? 7.5 : 4.2;
    this.updateAspect(this.camera.aspect);
  }

  // 重設相機至目標正後方 (例如過場動畫結束或世界切換)
  public resetBehind(targetPos: THREE.Vector3, playerRotY: number = 0) {
    this.yaw = playerRotY;
    this.pitch = 0.25;
    this.distance = this.targetDistance;
    this.target.copy(targetPos);
    const focusPoint = this._focus.set(targetPos.x, targetPos.y + 1.35, targetPos.z);
    this.currentPosition.set(
      focusPoint.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.distance,
      focusPoint.y + Math.sin(this.pitch) * this.distance,
      focusPoint.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.distance
    );
    this.camera.position.copy(this.currentPosition);
    this.currentLookAt.copy(focusPoint);
    this.camera.lookAt(focusPoint);
  }

  public update(targetPos: THREE.Vector3, delta: number, colliders: CollidableBox[] = []) {
    // 慢動作特寫鏡頭模式 (Cinematic Execution Hold & Smooth Recovery)
    if (this.isCinematicExecution) {
      this.cinematicTimer -= delta;
      if (this.cinematicTimer > 0) {
        // 快速推入特寫機位 (帶微彈性平滑)
        this.currentPosition.lerp(this.cinematicCamPos, Math.min(delta * 14.0, 1.0));
        this.currentLookAt.lerp(this.cinematicLookAt, Math.min(delta * 14.0, 1.0));

        // 打擊微震顫 (Trauma Shake)
        const trauma = Math.max(0, this.cinematicTimer / this.cinematicDuration);
        const shake = trauma * 0.035;
        this.camera.position.set(
          this.currentPosition.x + (Math.random() - 0.5) * shake,
          this.currentPosition.y + (Math.random() - 0.5) * shake,
          this.currentPosition.z + (Math.random() - 0.5) * shake
        );
        this.camera.lookAt(this.currentLookAt);
        return;
      } else {
        // 特寫計時結束，平滑復原 FOV
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.defaultFov, Math.min(delta * 6.0, 1.0));
        this.camera.updateProjectionMatrix();
        if (Math.abs(this.camera.fov - this.defaultFov) < 0.5) {
          this.camera.fov = this.defaultFov;
          this.camera.updateProjectionMatrix();
          this.isCinematicExecution = false;
        }
      }
    }

    this.target.copy(targetPos);
    // Offset target to character head/chest height (1.35m)
    const focusPoint = this._focus.set(targetPos.x, targetPos.y + 1.35, targetPos.z);
    const isCampus = this.currentWorld === 'CAMPUS';

    // 1. 檢測玩家所在場景區域 (樓梯間、電梯、演藝大樓為天天國中專屬空間，其他世界不套用)
    // 北樓梯間：X: 27.5 ~ 34.5, Z: -9.5 ~ 1.5；南樓梯間：X: 27.5 ~ 34.5, Z: 88.5 ~ 99.5 (Y: 0 ~ 24.5)
    const inNorthStairwell = isCampus && targetPos.x >= 27.5 && targetPos.x <= 34.5 && targetPos.z >= -9.5 && targetPos.z <= 1.5;
    const inSouthStairwell = isCampus && targetPos.x >= 27.5 && targetPos.x <= 34.5 && targetPos.z >= 88.5 && targetPos.z <= 99.5;
    const inStairwell = (inNorthStairwell || inSouthStairwell) && targetPos.y < 23.5;
    // 演藝大樓電梯井車廂內部 (X: 63.6 ~ 67.4, Z: 42.0 ~ 45.2)
    const inElevator = isCampus && targetPos.x >= 63.6 && targetPos.x <= 67.4 && targetPos.z >= 42.0 && targetPos.z <= 45.2;

    const isIndoors = IndoorManager.isIndoors(targetPos, this.currentWorld) || inStairwell || inElevator;

    // 2. 平滑調節適當跟隨距離：
    // 電梯車廂 1.75m 防止後腦杓剪裁與穿頂；狹窄樓梯間 1.85m 防止鏡頭推入外牆；
    // 走廊與教室/演藝廳內 2.8m，室外則保持 4.2m (步行) / 7.5m (載具)
    let effectiveTargetDistance = inElevator
      ? 1.75
      : (inStairwell
        ? 1.85
        : (isIndoors ? Math.min(this.targetDistance, 2.8) : this.targetDistance));

    // 羽球比賽轉播視角：鏡頭轉回玩家正後方 (yaw=0 朝 -Z 球網)、抬高俯角並拉遠，覆蓋室內 2.8m 限制
    this.matchBlend = THREE.MathUtils.lerp(this.matchBlend, this.isMatchView ? 1 : 0, Math.min(delta * 3.0, 1.0));
    if (this.isMatchView) {
      const yawDiff = Math.atan2(Math.sin(0 - this.yaw), Math.cos(0 - this.yaw));
      this.yaw += yawDiff * Math.min(delta * 4.0, 1.0);
      this.pitch = THREE.MathUtils.lerp(this.pitch, ThirdPersonCamera.MATCH_PITCH, Math.min(delta * 4.0, 1.0));
      effectiveTargetDistance = ThirdPersonCamera.MATCH_DISTANCE;
    }

    this.distance = THREE.MathUtils.lerp(this.distance, effectiveTargetDistance, delta * 6.0);

    // 3. 計算球面座標之理想鏡頭位置
    const horizontalDistance = this.distance * Math.cos(this.pitch);
    const idealPosition = this._ideal.set(
      focusPoint.x + horizontalDistance * Math.sin(this.yaw),
      focusPoint.y + this.distance * Math.sin(this.pitch),
      focusPoint.z + horizontalDistance * Math.cos(this.yaw)
    );

    // 4. 實體障礙物與實體牆壁遮擋射線/球體檢測 (AABB Swept-Sphere Raycast)
    const actualPosition = this._actual.copy(idealPosition);

    if (colliders.length > 0) {
      const rayDir = this._rayDir.subVectors(idealPosition, focusPoint);
      const targetDist = rayDir.length();

      if (targetDist > 0.05) {
        rayDir.divideScalar(targetDist);
        let minHitDist = targetDist;
        const cameraRadius = 0.32; // 攝影機防穿透緩衝厚度

        // 射線線段外包盒 (已含鏡頭半徑)，先以 AABB 粗篩剔除與線段無交集的碰撞盒
        const segMinX = Math.min(focusPoint.x, idealPosition.x) - cameraRadius;
        const segMaxX = Math.max(focusPoint.x, idealPosition.x) + cameraRadius;
        const segMinY = Math.min(focusPoint.y, idealPosition.y) - cameraRadius;
        const segMaxY = Math.max(focusPoint.y, idealPosition.y) + cameraRadius;
        const segMinZ = Math.min(focusPoint.z, idealPosition.z) - cameraRadius;
        const segMaxZ = Math.max(focusPoint.z, idealPosition.z) + cameraRadius;

        const segNear = queryColliders(colliders, segMinX, segMaxX, segMinZ, segMaxZ, _cameraSegNear);
        for (let i = 0; i < segNear.length; i++) {
          const box = segNear[i];
          if (box.isFloorOnly) continue; // 地板與斜坡單獨由高度限制與地面處理
          if (
            box.max.x < segMinX || box.min.x > segMaxX ||
            box.max.y < segMinY || box.min.y > segMaxY ||
            box.max.z < segMinZ || box.min.z > segMaxZ
          ) continue;

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
          actualPosition.copy(focusPoint).addScaledVector(rayDir, minHitDist);
        }
      }
    }

    // 5. 樓梯間、電梯與室內空間絕對防穿牆約束 (Hard Spatial Boundaries，僅天天國中)
    // 樓梯間判定一律以遮擋修正後的理想機位為準，插值前後兩次約束結果一致
    if (isCampus) {
      this.clampToCampusSpaces(actualPosition, targetPos, actualPosition, inNorthStairwell, inSouthStairwell, inElevator);
    }

    // 6. 鏡頭位置與視線平滑插值 (Smooth Camera Lag)
    const lerpFactor = Math.min(delta * 14.0, 1.0);
    this.currentPosition.lerp(actualPosition, lerpFactor);
    // 比賽視角時視線焦點往鏡頭前方 (球網方向) 推移，角色落在畫面下方
    const lookAhead = ThirdPersonCamera.MATCH_LOOK_AHEAD * this.matchBlend;
    this.matchLookAt.set(
      focusPoint.x - Math.sin(this.yaw) * lookAhead,
      focusPoint.y,
      focusPoint.z - Math.cos(this.yaw) * lookAhead
    );
    this.currentLookAt.lerp(this.matchLookAt, lerpFactor);

    // 7. 插值後再次確認不穿透樓梯間外牆、電梯車廂與室內天花板
    if (isCampus) {
      this.clampToCampusSpaces(this.currentPosition, targetPos, actualPosition, inNorthStairwell, inSouthStairwell, inElevator);
    }

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  // 天天國中室內空間鏡頭約束：樓梯間外牆、電梯車廂、演藝大樓與教學大樓天花板
  // pos 為要約束的鏡頭位置；stairProbe 為判斷「靠近樓梯間」所用的機位 (維持以遮擋修正後的理想機位判定)
  private clampToCampusSpaces(
    pos: THREE.Vector3,
    targetPos: THREE.Vector3,
    stairProbe: THREE.Vector3,
    inNorthStairwell: boolean,
    inSouthStairwell: boolean,
    inElevator: boolean
  ) {
    const nearNorthStair = (inNorthStairwell || (stairProbe.x >= 27.0 && stairProbe.x <= 35.0 && stairProbe.z >= -9.5 && stairProbe.z <= 1.5)) && targetPos.y < 23.5;
    const nearSouthStair = (inSouthStairwell || (stairProbe.x >= 27.0 && stairProbe.x <= 35.0 && stairProbe.z >= 88.5 && stairProbe.z <= 99.5)) && targetPos.y < 23.5;

    if (nearNorthStair || nearSouthStair) {
      // 樓梯間外牆 X=28.0 / 34.0：鏡頭 X 鎖定在 [28.35, 33.65]；北外牆 Z=-8.5、南外牆 Z=98.5
      pos.x = Math.max(28.35, Math.min(33.65, pos.x));
      if (nearNorthStair) {
        pos.z = Math.max(-8.15, pos.z);
      } else {
        pos.z = Math.min(98.15, pos.z);
      }
      // 垂直高度：不低於當前踏步上方 0.25m，不高於梯屋頂蓋 (23.2m)
      pos.y = Math.max(targetPos.y + 0.25, Math.min(23.2, pos.y));
      return;
    }

    const nearElevator = inElevator || (
      pos.x >= 63.6 && pos.x <= 67.4 &&
      pos.z >= 42.0 && pos.z <= 45.2 &&
      ((targetPos.y < 6.0 && pos.y < 4.0) || (targetPos.y >= 6.0 && pos.y >= 10.0 && pos.y <= 16.5))
    );
    if (nearElevator) {
      // 電梯車廂內部約束，防止仰角鏡頭穿出車頂看見黑暗井道
      pos.x = Math.max(63.8, Math.min(67.2, pos.x));
      pos.z = Math.max(42.2, Math.min(45.0, pos.z));
      if (targetPos.y < 6.0) {
        pos.y = Math.max(0.45, Math.min(2.45, pos.y));
      } else {
        pos.y = Math.max(12.45, Math.min(14.45, pos.y));
      }
      return;
    }

    // 演藝大樓本體 (X: 63.0 ~ 85.0, Z: 23.0 ~ 53.0，1~3F 演藝廳 Y < 11.5，4F 羽球館 Y: 12.0 ~ 16.5)
    const inPerformingArts =
      (targetPos.x >= 63.0 && targetPos.x <= 85.0 && targetPos.z >= 23.0 && targetPos.z <= 53.0) ||
      (pos.x >= 63.0 && pos.x <= 85.0 && pos.z >= 23.0 && pos.z <= 53.0);
    if (inPerformingArts && targetPos.y < 17.5) {
      if (targetPos.y < 11.5) {
        pos.y = Math.max(0.45, Math.min(11.25, pos.y));
      } else {
        pos.y = Math.max(12.45, Math.min(15.95, pos.y));
      }
      return;
    }

    // 教學大樓 (敬業樓、樂群樓與空中天橋) 一般樓層天花板限制：走廊外緣 X=28.0，向外保留 2.5m 緩衝
    const inMainBuilding =
      (targetPos.x >= 25.5 && targetPos.x <= 48.5 && targetPos.z >= 1.0 && targetPos.z <= 89.0) ||
      (pos.x >= 25.5 && pos.x <= 48.5 && pos.z >= 1.0 && pos.z <= 89.0);
    if (inMainBuilding && targetPos.y < 17.5) {
      const floorH = 6.0;
      const floorIdx = Math.floor(Math.max(0, targetPos.y + 0.1) / floorH);
      pos.y = Math.min(pos.y, (floorIdx + 1) * floorH - 0.55);
      pos.y = Math.max(pos.y, floorIdx * floorH + 0.45);
    }
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

  // 鏡頭於 XZ 水平面的前方向量 (回傳內部暫存向量，呼叫端勿長期持有或修改)
  public getForwardVector(): THREE.Vector3 {
    this.camera.getWorldDirection(this._forward);
    this._forward.y = 0;
    return this._forward.normalize();
  }

  // 鏡頭水平右方向量 (需在 getForwardVector 之後呼叫，沿用同幀前方向量)
  public getRightVector(): THREE.Vector3 {
    return this._right.set(-this._forward.z, 0, this._forward.x);
  }
}
