import * as THREE from 'three';
import { CollidableBox } from '../world/CampusWorld';
import { isBlockedXZ, depenetrateXZ, getSupportFloorY } from '../physics/aabb';
import { InputManager } from '../core/InputManager';
import { Player } from '../entities/Player';
import { soundManager } from '../audio/SoundEffects';
import { bakeNode, bakeStaticParts, disposeNonShared } from '../entities/npc/modelCache';

export class Bicycle {
  public mesh: THREE.Group;
  public position: THREE.Vector3;
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public rotationY: number = 0;
  public speed: number = 0;
  public maxSpeed: number = 15.0; // 玩家騎車最高速度 (火柴人自行車騎士為 14.8：直線緊追但追不上)
  public acceleration: number = 14.0;
  public deceleration: number = 11.0;
  public turnSpeed: number = 2.1;
  public isMounted: boolean = false;
  public verticalVelocity: number = 0;
  public isGrounded: boolean = true;

  // Visual sub-components
  private frontWheel: THREE.Mesh;
  private rearWheel: THREE.Mesh;
  private handlebars: THREE.Group;
  private headGroup: THREE.Group;
  private animTimer: number = 0;

  constructor(scene: THREE.Scene, startPos: THREE.Vector3, colorHex: number = 0xf39c12) {
    this.position = startPos.clone();
    this.mesh = new THREE.Group();
    this.mesh.position.copy(this.position);

    // 1. 火柴人造型趴在輪子上 (Stickman Prone Vehicle Body)
    const stickMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4, metalness: 0.2 });
    const jointMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.3 });
    const rubberMat = new THREE.MeshLambertMaterial({ color: 0x1e272e });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const seatMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });

    const limbRadius = 0.045;
    const jointRadius = 0.07;

    // A. 骨盆 / 臀部球體 (Pelvis)
    const pelvis = new THREE.Mesh(new THREE.SphereGeometry(jointRadius * 1.1, 12, 12), jointMat);
    pelvis.position.set(0, 0.70, -0.42);
    this.mesh.add(pelvis);

    // B. 趴姿背部座墊 (供玩家騎乘的背部小軟墊)
    const backSeat = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.35), seatMat);
    backSeat.position.set(0, 0.76, -0.12);
    this.mesh.add(backSeat);

    // C. 軀幹脊椎 (Torso / Spine: 從臀部連至肩膀)
    const spineLen = 0.85;
    const spine = new THREE.Mesh(new THREE.CylinderGeometry(limbRadius * 1.1, limbRadius * 1.1, spineLen, 8), stickMat);
    spine.rotation.x = Math.PI / 2 + 0.06;
    spine.position.set(0, 0.73, 0.0);
    this.mesh.add(spine);

    // D. 肩膀橫向關節 (Shoulders)
    const shoulderBar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.07), stickMat);
    shoulderBar.position.set(0, 0.76, 0.42);
    this.mesh.add(shoulderBar);

    const shoulderL = new THREE.Mesh(new THREE.SphereGeometry(jointRadius, 10, 10), jointMat);
    shoulderL.position.set(-0.21, 0.76, 0.42);
    this.mesh.add(shoulderL);

    const shoulderR = new THREE.Mesh(new THREE.SphereGeometry(jointRadius, 10, 10), jointMat);
    shoulderR.position.set(0.21, 0.76, 0.42);
    this.mesh.add(shoulderR);

    // E. 雙腿伸向後輪軸心 (Legs gripping rear wheel axle at z = -0.85, y = 0.42)
    const legLen = 0.52;
    [-0.14, 0.14].forEach((sideX) => {
      // 大腿
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(limbRadius, limbRadius, legLen, 8), stickMat);
      thigh.position.set(sideX, 0.58, -0.62);
      thigh.rotation.x = -0.75;
      this.mesh.add(thigh);

      // 膝蓋
      const knee = new THREE.Mesh(new THREE.SphereGeometry(jointRadius * 0.9, 10, 10), jointMat);
      knee.position.set(sideX, 0.56, -0.64);
      this.mesh.add(knee);

      // 小腿至腳掌夾住後輪軸
      const calf = new THREE.Mesh(new THREE.CylinderGeometry(limbRadius, limbRadius, 0.35, 8), stickMat);
      calf.position.set(sideX, 0.48, -0.75);
      calf.rotation.x = -0.55;
      this.mesh.add(calf);
    });

    // F. 雙手向前向下抓住前輪軸心 (Arms gripping front wheel axle at z = 0.85, y = 0.42)
    const armLen = 0.58;
    [-0.18, 0.18].forEach((sideX) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(limbRadius, limbRadius, armLen, 8), stickMat);
      arm.position.set(sideX * 0.8, 0.58, 0.63);
      arm.rotation.x = 0.65;
      this.mesh.add(arm);

      // 肘關節
      const elbow = new THREE.Mesh(new THREE.SphereGeometry(jointRadius * 0.9, 10, 10), jointMat);
      elbow.position.set(sideX * 0.8, 0.58, 0.63);
      this.mesh.add(elbow);
    });

    // G. 火柴人大頭 (抬頭趴著向前看！)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 0.96, 0.65);

    // 脖子
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8), stickMat);
    neck.rotation.x = 0.45;
    neck.position.set(0, -0.06, -0.05);
    this.headGroup.add(neck);

    // 經典火柴人圓球大頭
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 16, 16), jointMat);
    head.position.set(0, 0.12, 0.08);
    this.headGroup.add(head);

    // 搞笑火柴人眼睛
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
    eyeL.position.set(-0.07, 0.15, 0.26);
    this.headGroup.add(eyeL);

    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), eyeMat);
    eyeR.position.set(0.07, 0.15, 0.26);
    this.headGroup.add(eyeR);

    this.mesh.add(this.headGroup);

    // 2. 前後輪胎 (+Z 前輪, -Z 後輪)
    const wheelGeo = new THREE.TorusGeometry(0.42, 0.05, 8, 24);

    // 後輪
    this.rearWheel = new THREE.Mesh(wheelGeo, rubberMat);
    this.rearWheel.position.set(0, 0.42, -0.85);
    this.rearWheel.castShadow = true;
    this.mesh.add(this.rearWheel);

    // 前輪
    this.frontWheel = new THREE.Mesh(wheelGeo, rubberMat);
    this.frontWheel.position.set(0, 0.42, 0.85);
    this.frontWheel.castShadow = true;
    this.mesh.add(this.frontWheel);

    // 輪輻 (Spokes)
    const spokeMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7, metalness: 0.8 });
    const spokeGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.8, 6);
    for (let i = 0; i < 3; i++) {
      const spF = new THREE.Mesh(spokeGeo, spokeMat);
      spF.rotation.z = (Math.PI / 3) * i;
      this.frontWheel.add(spF);

      const spR = new THREE.Mesh(spokeGeo, spokeMat);
      spR.rotation.z = (Math.PI / 3) * i;
      this.rearWheel.add(spR);
    }

    // 3. 龍頭與車手把
    this.handlebars = new THREE.Group();
    this.handlebars.position.set(0, 0.82, 0.50);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8), stickMat);
    stem.position.set(0, 0.15, 0);
    this.handlebars.add(stem);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.05), jointMat);
    bar.position.set(0, 0.32, 0);
    this.handlebars.add(bar);

    this.mesh.add(this.handlebars);

    // 烘焙合併 (同顏色單車共用幾何體與頂點色材質)：輪胎 (含輪輻)、龍頭、頭部為獨立動畫節點，其餘車身零件合併為單一靜態網格
    const colorKey = colorHex.toString(16);
    bakeNode(this.rearWheel, 'bicycle|wheel');
    bakeNode(this.frontWheel, 'bicycle|wheel');
    bakeNode(this.handlebars, `bicycle|${colorKey}|handlebars`);
    bakeNode(this.headGroup, `bicycle|${colorKey}|head`);
    const staticParts = this.mesh.children.filter(
      (c) => c !== this.rearWheel && c !== this.frontWheel && c !== this.handlebars && c !== this.headGroup
    );
    bakeStaticParts(this.mesh, staticParts, `bicycle|${colorKey}|body`);

    scene.add(this.mesh);
  }

  // 檢測指定 (X, Z) 位置下方的真實支撐面 (最高樓板、坡道或地面 Y = 0)
  public static getFloorHeightAt(posX: number, posY: number, posZ: number, colliders: CollidableBox[]): number {
    return getSupportFloorY(colliders, posX, posY, posZ, 0.85);
  }

  // 上車：校正 Y 軸座標並將玩家模型移上火柴人車架 (杜絕浮空)
  public mount(player: Player, forcedGroundY?: number) {
    this.isMounted = true;
    if (forcedGroundY !== undefined) {
      this.position.y = forcedGroundY;
    }
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.mesh.position.copy(this.position);

    this.mesh.add(player.mesh);
    player.mesh.position.set(0, 0.42, -0.15);
    player.mesh.rotation.set(0.3, 0, 0);
    player.mesh.visible = true;

    player.position.copy(this.position);
    player.velocity.set(0, 0, 0);
    player.isGrounded = true;

    soundManager.playBicycleBell(this.position);
  }

  // 下車：將玩家模型放回場景中並重置重力與著地狀態
  public dismount(player: Player, scene: THREE.Scene): THREE.Vector3 {
    this.isMounted = false;
    this.speed = 0;
    this.verticalVelocity = 0;
    this.isGrounded = true;

    const sideVec = new THREE.Vector3(-1.2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationY);
    const exitPos = this.position.clone().add(sideVec);

    scene.add(player.mesh);
    player.position.copy(exitPos);
    player.mesh.position.copy(exitPos);
    player.mesh.rotation.set(0, this.rotationY, 0);
    player.mesh.visible = true;
    player.velocity.set(0, 0, 0);
    player.isGrounded = true;

    return exitPos;
  }

  public ringBell() {
    soundManager.playBicycleBell(this.position);
  }

  // 自場景移除並釋放非共用資源 (烘焙幾何體與材質由快取共用，不可釋放；車主牽回或超量回收路邊單車時呼叫；騎乘中不得呼叫)
  public dispose(scene: THREE.Scene) {
    scene.remove(this.mesh);
    disposeNonShared(this.mesh);
  }

  // 停妥靜止判定：無人騎乘、已停穩貼地且位置未被外力改變時，跳過整套碰撞與重力運算
  private restTime: number = 0;
  private restPos: THREE.Vector3 = new THREE.Vector3(Infinity, Infinity, Infinity);

  public update(delta: number, input: InputManager, colliders: CollidableBox[]) {
    if (!this.isMounted && this.restTime > 0.5 && this.position.equals(this.restPos)) {
      return;
    }

    if (this.isMounted) {
      // 1. 加速與倒車 (W / S)
      if (input.forward) {
        this.speed = Math.min(this.maxSpeed, this.speed + this.acceleration * delta);
      } else if (input.backward) {
        this.speed = Math.max(-this.maxSpeed * 0.35, this.speed - this.deceleration * 1.5 * delta);
      } else {
        // 自然滑行
        if (this.speed > 0) this.speed = Math.max(0, this.speed - this.deceleration * 0.5 * delta);
        if (this.speed < 0) this.speed = Math.min(0, this.speed + this.deceleration * 0.5 * delta);
      }

      // 2. 轉向 (A / D)
      // 手機虛擬搖桿採類比轉向：推得越偏轉越快，方便小幅修正車頭
      let steer = 0;
      if (Math.abs(input.virtualAxisX) > 0.25) {
        steer = THREE.MathUtils.clamp(-input.virtualAxisX, -1, 1);
      } else if (input.left) {
        steer = 1;
      } else if (input.right) {
        steer = -1;
      }
      this.rotationY += this.turnSpeed * steer * delta * (this.speed >= 0 ? 1 : -1);
      const steerAngle = 0.35 * steer;

      // 龍頭轉向
      this.handlebars.rotation.y = THREE.MathUtils.lerp(this.handlebars.rotation.y, steerAngle, delta * 12);

      // 車身壓車傾角 (Roll)
      const targetRoll = steerAngle * (this.speed / this.maxSpeed) * 0.6;
      this.mesh.rotation.y = this.rotationY;
      this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, targetRoll, delta * 8);

      if (input.horn) {
        this.ringBell();
      }
    } else {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, delta * 8);
      this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, 0.22, delta * 5);
    }

    // 3. 前進位移 (車頭朝向 (sin, cos))
    const moveX = Math.sin(this.rotationY) * this.speed * delta;
    const moveZ = Math.cos(this.rotationY) * this.speed * delta;

    // 4. 碰撞檢測與滑牆
    const radius = 0.42; // 適度微調判定半徑，符合單車縱長窄身特性，不易在窄縫卡死

    // 若當前位移是遠離障礙物中心 (倒車或轉向外駛)，允許通行脫困
    const nextX = this.position.x + moveX;
    if (!isBlockedXZ(colliders, nextX, this.position.z, radius, this.position.y, 0.3, 1.2, 1, this.position.x, moveX)) {
      this.position.x = nextX;
    } else {
      this.speed *= 0.75;
    }

    const nextZ = this.position.z + moveZ;
    if (!isBlockedXZ(colliders, this.position.x, nextZ, radius, this.position.y, 0.3, 1.2, 2, this.position.z, moveZ)) {
      this.position.z = nextZ;
    } else {
      this.speed *= 0.75;
    }

    // 5. 主動穿透脫困排除器 (Depenetration / Unstuck Resolver)
    // 若因高速撞擊或原地轉向導致車身進入障礙物碰撞體，主動朝最小穿透方向彈出，徹底杜絕卡入椅子等障礙物不動！
    depenetrateXZ(colliders, this.position, radius, 0.3, 1.2, 0.03, 1, 'bicycle');

    // 6. 重力與地面吸附檢測 (Ground Snapping & Gravity - 杜絕浮空)
    const groundY = Bicycle.getFloorHeightAt(this.position.x, this.position.y, this.position.z, colliders);

    if (this.position.y > groundY + 0.05) {
      // 空中自由落體墜落
      this.verticalVelocity -= 26.0 * delta;
      const nextY = this.position.y + this.verticalVelocity * delta;
      if (nextY <= groundY) {
        this.position.y = groundY;
        this.verticalVelocity = 0;
        this.isGrounded = true;
      } else {
        this.position.y = nextY;
        this.isGrounded = false;
      }
    } else {
      // 貼地平滑吸附 (適應坡道與微小台階)
      this.position.y = THREE.MathUtils.lerp(this.position.y, groundY, Math.min(delta * 22.0, 1.0));
      this.verticalVelocity = 0;
      this.isGrounded = true;
    }

    this.mesh.position.copy(this.position);

    // 輪胎旋轉與火柴人顛簸動畫
    const wheelSpin = (this.speed / 0.42) * delta;
    this.frontWheel.rotation.x += wheelSpin;
    this.rearWheel.rotation.x += wheelSpin;

    if (Math.abs(this.speed) > 0.1) {
      this.animTimer += delta * Math.abs(this.speed) * 1.5;
      this.headGroup.position.y = 0.96 + Math.sin(this.animTimer) * 0.025;
    } else {
      this.headGroup.position.y = 0.96;
    }

    // 累計停妥時間 (車身傾角與貼地高度皆已收斂)
    const isSettled =
      !this.isMounted &&
      this.isGrounded &&
      Math.abs(this.speed) < 0.01 &&
      Math.abs(this.position.y - groundY) < 0.001 &&
      Math.abs(this.mesh.rotation.z - 0.22) < 0.002;
    if (isSettled) {
      this.restTime += delta;
      this.restPos.copy(this.position);
    } else {
      this.restTime = 0;
    }
  }
}
