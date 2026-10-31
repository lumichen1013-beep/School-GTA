import * as THREE from 'three';
import { CollidableBox } from '../world/CampusWorld';
import { IndoorManager } from '../systems/IndoorManager';
import { queryColliders } from '../physics/aabb';
import { consumeCameraShake } from '../effects/cameraShake';
import {
  PORTRAIT_BLEND_RATE,
  PORTRAIT_HEIGHT_LIFT,
  PORTRAIT_LOOK_LIFT,
  portraitDistanceScale,
  portraitFactor,
  portraitFov,
} from './portraitCamera';

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
  // 突進斬衝刺時略微拉遠 (公尺，由呼叫端每幀設定，內部平滑過渡)
  public dashPull: number = 0;
  private dashPullBlend: number = 0;

  // 瞄準鏡 (彈弓蓄力開鏡)：由呼叫端每幀設定目標比例 aimZoom (0..1，線性對應蓄力) 與倍率 aimZoomFactor (桌機 2×、手機 1.5×)，
  // 內部平滑過渡；FOV 線性拉近到 1/factor、鏡頭距離 4.2 → 2.2 並加過肩偏移 (遵守室內距離上限與直屏補償)，放開後平滑回復
  public aimZoom: number = 0;
  public aimZoomFactor: number = 2;
  private aimBlend: number = 0;
  private static readonly AIM_DISTANCE = 2.2;
  private static readonly AIM_SHOULDER = 0.6;
  private static readonly AIM_BLEND_RATE = 10;

  public sensitivityX: number = 0.0022;
  public sensitivityY: number = 0.002;

  // 暗殺運鏡 (Execution Shot)：由 CombatSystem 逐幀驅動，期間停用一般跟隨與自由視角
  public isCinematicExecution: boolean = false;
  private readonly shotAnchor = new THREE.Vector3(); // 起手時玩家與目標中點 (腳底高度)
  private readonly shotSide = new THREE.Vector3(); // 垂直於打擊軸的水平方向 (已選定不被遮擋的一側)
  private shotDistance: number = 0;
  private shotHeight: number = 0;
  private readonly shotBlendFromPos = new THREE.Vector3();
  private readonly shotBlendFromLook = new THREE.Vector3();
  private shotBlendFromFov: number = 65;
  private readonly _shotProbe = new THREE.Vector3();
  private readonly _shotFocus = new THREE.Vector3();
  private defaultFov: number = 65;
  // 直屏補償：目標係數 (由 aspect 決定) 與目前平滑係數，皆 0~1；橫屏恆為 0
  private portraitTarget: number = 0;
  private portraitBlend: number = 0;
  private aspectInitialized: boolean = false;
  private static readonly SHOT_FOV = 50;
  private static readonly SHOT_HEIGHT = 2.6;
  private static readonly SHOT_FALLBACK_HEIGHT = 3.6;
  private static readonly SHOT_MIN_DISTANCE = 3.5;
  private static readonly SHOT_LOOK_HEIGHT = 1.0;
  private static readonly SHOT_OCCLUSION_MARGIN = 0.3;

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
    if (this.isCinematicExecution) return; // 暗殺運鏡期間鎖定自由視角旋轉
    if (this.isMatchView) return; // 羽球比賽轉播視角鎖定朝向球場
    if (this.isVehicleFollow) return; // 手機騎車視角跟隨車頭
    // 開鏡時靈敏度 × fov / 預設 fov (放大倍率越高轉得越慢)
    const k = this.aimBlend > 0 ? this.camera.fov / this.defaultFov : 1;
    this.yaw -= deltaX * this.sensitivityX * k;
    this.pitch += deltaY * this.sensitivityY * k;

    // Clamp pitch to avoid camera flipping over head or under ground
    const minPitch = -0.15; // slightly looking up
    const maxPitch = 1.35; // steep look down
    this.pitch = Math.max(minPitch, Math.min(maxPitch, this.pitch));
  }

  public updateAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.portraitTarget = portraitFactor(aspect);
    // 首次同步直接到位，之後旋轉裝置由 update() 平滑過渡
    if (!this.aspectInitialized) {
      this.aspectInitialized = true;
      this.portraitBlend = this.portraitTarget;
    }
    this.applyPortraitFov();
  }

  private baseFov(): number {
    return this.isVehicleMode ? 72 : 65;
  }

  // 依目前平滑係數套用垂直 FOV 並更新投影矩陣 (暗殺運鏡期間只更新 defaultFov)
  private applyPortraitFov() {
    this.defaultFov = portraitFov(this.baseFov(), this.portraitBlend);
    if (!this.isCinematicExecution) {
      this.camera.fov = this.aimedFov();
      this.camera.updateProjectionMatrix();
    }
  }

  // 開鏡後的垂直 FOV：預設 FOV 依開鏡平滑比例線性拉近到 1/aimZoomFactor
  private aimedFov(): number {
    return this.aimBlend > 0 ? this.defaultFov * (1 - this.aimBlend * (1 - 1 / this.aimZoomFactor)) : this.defaultFov;
  }

  // 開鏡比例逼近目標 (真實時間)；變化時重算 FOV
  private stepAimBlend(delta: number) {
    const target = this.aimZoom < 0 ? 0 : this.aimZoom > 1 ? 1 : this.aimZoom;
    const diff = target - this.aimBlend;
    if (diff === 0) return;
    this.aimBlend = Math.abs(diff) < 1e-3 ? target : this.aimBlend + diff * Math.min(delta * ThirdPersonCamera.AIM_BLEND_RATE, 1.0);
    this.applyPortraitFov();
  }

  // 平滑係數逼近目標；僅在尚未收斂時重算 FOV
  private stepPortraitBlend(delta: number) {
    const diff = this.portraitTarget - this.portraitBlend;
    if (diff === 0) return;
    if (Math.abs(diff) < 1e-3) {
      this.portraitBlend = this.portraitTarget;
    } else {
      this.portraitBlend += diff * Math.min(delta * PORTRAIT_BLEND_RATE, 1.0);
    }
    this.applyPortraitFov();
  }

  // 開始暗殺側面運鏡：鏡頭置於打擊軸垂直側 (類 2D 格鬥遊戲構圖)。
  // 預定機位被遮擋時改用另一側；兩側皆遮擋則升高並縮短距離 (最短 3.5m)。
  // maxDolly / orbitMax 為整段運鏡中最大後拉距離與環繞角度，選側時一併檢查以免中途穿牆。
  public beginExecutionShot(
    playerPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    distance: number,
    maxDolly: number,
    orbitMax: number,
    colliders: CollidableBox[]
  ) {
    this.shotAnchor.addVectors(playerPos, targetPos).multiplyScalar(0.5);
    // 打擊軸 (玩家 → 目標) 的水平垂直向量
    let ax = targetPos.x - playerPos.x;
    let az = targetPos.z - playerPos.z;
    const len = Math.hypot(ax, az);
    if (len < 0.01) { ax = 0; az = 1; } else { ax /= len; az /= len; }

    const focus = this._shotFocus.set(this.shotAnchor.x, this.shotAnchor.y + ThirdPersonCamera.SHOT_LOOK_HEIGHT, this.shotAnchor.z);
    const height = ThirdPersonCamera.SHOT_HEIGHT;
    let chosen = false;
    for (let sign = 1; sign >= -1; sign -= 2) {
      this.shotSide.set(-az * sign, 0, ax * sign);
      if (this.isShotClear(focus, distance, maxDolly, orbitMax, height, colliders)) {
        this.shotDistance = distance;
        this.shotHeight = height;
        chosen = true;
        break;
      }
    }
    // 兩側皆遮擋：升高機位並逐步縮短距離，找不到則以最短距離取遮擋較少的一側
    for (let d = distance - 0.5; !chosen && d >= ThirdPersonCamera.SHOT_MIN_DISTANCE - 0.001; d -= 0.5) {
      for (let sign = 1; sign >= -1; sign -= 2) {
        this.shotSide.set(-az * sign, 0, ax * sign);
        if (this.isShotClear(focus, d, maxDolly, orbitMax, ThirdPersonCamera.SHOT_FALLBACK_HEIGHT, colliders)) {
          this.shotDistance = d;
          this.shotHeight = ThirdPersonCamera.SHOT_FALLBACK_HEIGHT;
          chosen = true;
          break;
        }
      }
    }
    if (!chosen) {
      this.shotSide.set(-az, 0, ax);
      this.shotDistance = ThirdPersonCamera.SHOT_MIN_DISTANCE;
      this.shotHeight = ThirdPersonCamera.SHOT_FALLBACK_HEIGHT;
    }

    this.isCinematicExecution = true;
    this.camera.fov = ThirdPersonCamera.SHOT_FOV;
    this.camera.updateProjectionMatrix();
    // 起手為硬切：視線直接對準中點
    this.currentLookAt.copy(focus);
  }

  // 每幀更新暗殺運鏡：dolly 為額外後拉距離、orbit 為繞錨點水平環繞角 (弧度)、lookTarget 為視線目標 (腳底座標，內部加上視線高度)
  public updateExecutionShot(dolly: number, orbit: number, lookTarget: THREE.Vector3, rawDelta: number) {
    this.computeShotPosition(this.currentPosition, this.shotDistance + dolly, orbit, this.shotHeight);
    this._shotFocus.set(lookTarget.x, lookTarget.y + ThirdPersonCamera.SHOT_LOOK_HEIGHT, lookTarget.z);
    this.currentLookAt.lerp(this._shotFocus, 1 - Math.exp(-8 * rawDelta));
    this.applyCinematicCamera(rawDelta);
  }

  // 記錄目前運鏡機位，作為收尾時平滑過渡回一般跟隨鏡頭的起點
  public markExecutionBlendStart() {
    this.shotBlendFromPos.copy(this.currentPosition);
    this.shotBlendFromLook.copy(this.currentLookAt);
    this.shotBlendFromFov = this.camera.fov;
  }

  // 收尾過渡：t (0~1) 由運鏡機位插值至玩家正後方 (與 resetBehind 相同的機位)
  public blendExecutionToBehind(targetPos: THREE.Vector3, yaw: number, t: number, rawDelta: number) {
    const k = t * t * (3 - 2 * t);
    const focus = this._shotFocus.set(targetPos.x, targetPos.y + 1.35, targetPos.z);
    const pitch = 0.25;
    const dist = this.targetDistance * portraitDistanceScale(this.portraitBlend);
    this._shotProbe.set(
      focus.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      focus.y + Math.sin(pitch) * dist,
      focus.z + Math.cos(yaw) * Math.cos(pitch) * dist
    );
    this.currentPosition.lerpVectors(this.shotBlendFromPos, this._shotProbe, k);
    this.currentLookAt.lerpVectors(this.shotBlendFromLook, focus, k);
    this.camera.fov = THREE.MathUtils.lerp(this.shotBlendFromFov, this.defaultFov, k);
    this.camera.updateProjectionMatrix();
    this.applyCinematicCamera(rawDelta);
  }

  // 結束暗殺運鏡，恢復一般跟隨鏡頭 (置於玩家正後方)
  public endExecutionShot(targetPos: THREE.Vector3, yaw: number) {
    this.isCinematicExecution = false;
    this.camera.fov = this.defaultFov;
    this.camera.updateProjectionMatrix();
    this.resetBehind(targetPos, yaw);
  }

  private computeShotPosition(out: THREE.Vector3, distance: number, orbit: number, height: number) {
    const c = Math.cos(orbit);
    const s = Math.sin(orbit);
    // 側向量繞 Y 軸旋轉 orbit
    const sx = this.shotSide.x * c + this.shotSide.z * s;
    const sz = -this.shotSide.x * s + this.shotSide.z * c;
    return out.set(this.shotAnchor.x + sx * distance, this.shotAnchor.y + height, this.shotAnchor.z + sz * distance);
  }

  // 檢查運鏡起訖機位 (未後拉/最大後拉、環繞起點/終點) 與焦點間是否無遮擋
  private isShotClear(focus: THREE.Vector3, distance: number, maxDolly: number, orbitMax: number, height: number, colliders: CollidableBox[]): boolean {
    if (colliders.length === 0) return true;
    const probe = this._shotProbe;
    return !this.isSegmentBlocked(focus, this.computeShotPosition(probe, distance, 0, height), colliders) &&
      !this.isSegmentBlocked(focus, this.computeShotPosition(probe, distance + maxDolly, orbitMax, height), colliders);
  }

  // 焦點至機位線段是否被碰撞盒阻擋 (碰撞盒向外膨脹 margin，含鏡頭本身半徑)
  private isSegmentBlocked(from: THREE.Vector3, to: THREE.Vector3, colliders: CollidableBox[]): boolean {
    const m = ThirdPersonCamera.SHOT_OCCLUSION_MARGIN;
    const dir = this._rayDir.subVectors(to, from);
    const len = dir.length();
    if (len < 0.05) return false;
    dir.divideScalar(len);
    const near = queryColliders(
      colliders,
      Math.min(from.x, to.x) - m, Math.max(from.x, to.x) + m,
      Math.min(from.z, to.z) - m, Math.max(from.z, to.z) + m,
      _cameraSegNear
    );
    for (let i = 0; i < near.length; i++) {
      const box = near[i];
      if (box.isFloorOnly) continue;
      const minX = box.min.x - m, maxX = box.max.x + m;
      const minY = box.min.y - m, maxY = box.max.y + m;
      const minZ = box.min.z - m, maxZ = box.max.z + m;
      // 焦點本身位於碰撞盒內 (例如角色緊貼牆面) 時略過，避免誤判
      if (from.x >= minX && from.x <= maxX && from.y >= minY && from.y <= maxY && from.z >= minZ && from.z <= maxZ) continue;
      if (this.intersectRayAABB(from, dir, minX, maxX, minY, maxY, minZ, maxZ, len) !== null) return true;
    }
    return false;
  }

  // 套用運鏡結果至實際鏡頭 (含打擊震動)
  private applyCinematicCamera(rawDelta: number) {
    this.camera.position.copy(this.currentPosition);
    const shake = consumeCameraShake(rawDelta) * 0.35;
    if (shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
      this.camera.position.z += (Math.random() - 0.5) * shake;
    }
    this.camera.lookAt(this.currentLookAt);
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
    this.distance = this.targetDistance * portraitDistanceScale(this.portraitBlend);
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
    // 暗殺運鏡期間由 CombatSystem 逐幀驅動鏡頭
    if (this.isCinematicExecution) return;

    this.stepPortraitBlend(delta);
    this.stepAimBlend(delta);
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
        : (isIndoors ? Math.min(this.targetDistance, 2.8) : this.targetDistance * portraitDistanceScale(this.portraitBlend)));

    // 羽球比賽轉播視角：鏡頭轉回玩家正後方 (yaw=0 朝 -Z 球網)、抬高俯角並拉遠，覆蓋室內 2.8m 限制
    this.matchBlend = THREE.MathUtils.lerp(this.matchBlend, this.isMatchView ? 1 : 0, Math.min(delta * 3.0, 1.0));
    if (this.isMatchView) {
      const yawDiff = Math.atan2(Math.sin(0 - this.yaw), Math.cos(0 - this.yaw));
      this.yaw += yawDiff * Math.min(delta * 4.0, 1.0);
      this.pitch = THREE.MathUtils.lerp(this.pitch, ThirdPersonCamera.MATCH_PITCH, Math.min(delta * 4.0, 1.0));
      effectiveTargetDistance = ThirdPersonCamera.MATCH_DISTANCE;
    }

    // 開鏡拉近：距離往 AIM_DISTANCE (直屏同樣乘補償係數) 靠攏，但不超過當下場景距離 (室內 2.8m / 樓梯間 / 電梯更近者維持)
    if (this.aimBlend > 0) {
      const aimDist = ThirdPersonCamera.AIM_DISTANCE * (isIndoors ? 1 : portraitDistanceScale(this.portraitBlend));
      effectiveTargetDistance = THREE.MathUtils.lerp(effectiveTargetDistance, Math.min(effectiveTargetDistance, aimDist), this.aimBlend);
    }

    this.dashPullBlend = THREE.MathUtils.lerp(this.dashPullBlend, this.dashPull, Math.min(delta * 8.0, 1.0));
    // 衝刺拉遠不得超過當下場景的距離上限 (電梯 1.75m / 樓梯間 1.85m / 室內 2.8m)
    const sceneCap = inElevator ? 1.75 : (inStairwell ? 1.85 : (isIndoors ? 2.8 : Infinity));
    const pulledDistance = Math.min(effectiveTargetDistance + this.dashPullBlend, Math.max(sceneCap, effectiveTargetDistance));
    this.distance = THREE.MathUtils.lerp(this.distance, pulledDistance, delta * 6.0);

    // 3. 計算球面座標之理想鏡頭位置
    const horizontalDistance = this.distance * Math.cos(this.pitch);
    // 直屏戶外額外抬高機位 (室內不抬高，避免頂到天花板)
    const heightLift = isIndoors ? 0 : PORTRAIT_HEIGHT_LIFT * this.portraitBlend;
    // 過肩偏移：機位與視線同向右移 (鏡頭右方向 = (cos yaw, 0, −sin yaw))，遮擋射線仍由角色頭部出發，故不會穿牆
    const shoulder = ThirdPersonCamera.AIM_SHOULDER * this.aimBlend;
    const shoulderX = Math.cos(this.yaw) * shoulder;
    const shoulderZ = -Math.sin(this.yaw) * shoulder;
    const idealPosition = this._ideal.set(
      focusPoint.x + horizontalDistance * Math.sin(this.yaw) + shoulderX,
      focusPoint.y + this.distance * Math.sin(this.pitch) + heightLift,
      focusPoint.z + horizontalDistance * Math.cos(this.yaw) + shoulderZ
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
      focusPoint.x - Math.sin(this.yaw) * lookAhead + shoulderX,
      focusPoint.y + PORTRAIT_LOOK_LIFT * this.portraitBlend,
      focusPoint.z - Math.cos(this.yaw) * lookAhead + shoulderZ
    );
    this.currentLookAt.lerp(this.matchLookAt, lerpFactor);

    // 7. 插值後再次確認不穿透樓梯間外牆、電梯車廂與室內天花板
    if (isCampus) {
      this.clampToCampusSpaces(this.currentPosition, targetPos, actualPosition, inNorthStairwell, inSouthStairwell, inElevator);
    }

    this.camera.position.copy(this.currentPosition);
    // 撞擊震動 (例如總教官衝撞撞柱)：僅偏移輸出鏡頭位置，不影響平滑插值狀態
    const shake = consumeCameraShake(delta) * 0.35;
    if (shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
      this.camera.position.z += (Math.random() - 0.5) * shake;
    }
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

    // 演藝大樓本體 (X: 63.0 ~ 85.0, Z: 23.0 ~ 53.0，1~3F 演藝廳 Y < 11.5，4F 羽球館 Y: 12.0 ~ 22.0)
    const inPerformingArts =
      (targetPos.x >= 63.0 && targetPos.x <= 85.0 && targetPos.z >= 23.0 && targetPos.z <= 53.0) ||
      (pos.x >= 63.0 && pos.x <= 85.0 && pos.z >= 23.0 && pos.z <= 53.0);
    if (inPerformingArts && targetPos.y < 17.5) {
      if (targetPos.y < 11.5) {
        pos.y = Math.max(0.45, Math.min(11.25, pos.y));
      } else {
        pos.y = Math.max(12.45, Math.min(21.45, pos.y));
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
