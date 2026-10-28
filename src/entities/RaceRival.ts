import * as THREE from 'three';

const _scratchSegDir = new THREE.Vector3();

// 田徑 / 游泳競速陪賽對手：輕量獨立人形模型，不加入校園 NPC 名單，不可攻擊、不觸發通緝、不計入任務
export class RaceRival {
  public mesh: THREE.Group;
  public distance: number = 0; // 沿賽道已前進距離 (m)
  public totalLength: number = 0;
  public isFinished: boolean = false;

  private body: THREE.Group;
  private leftArm: THREE.Group;
  private rightArm: THREE.Group;
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;
  private nameTag: THREE.Sprite;
  private path: THREE.Vector3[] = [];
  private cumLengths: number[] = [];
  private animTimer: number = 0;
  private facingY: number = 0;

  constructor(scene: THREE.Scene, label: string, jerseyColor: number, capColor: number) {
    this.mesh = new THREE.Group();
    this.body = new THREE.Group();
    this.mesh.add(this.body);

    const skinMat = new THREE.MeshLambertMaterial({ color: 0xf1c27d });
    const jerseyMat = new THREE.MeshLambertMaterial({ color: jerseyColor });
    const shortsMat = new THREE.MeshLambertMaterial({ color: 0x1f2937 });
    const capMat = new THREE.MeshLambertMaterial({ color: capColor });

    // 軀幹與頭部 (腳底為原點，與玩家模型比例一致)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.28), jerseyMat);
    torso.position.y = 1.15;
    this.body.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skinMat);
    head.position.y = 1.66;
    this.body.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.38), capMat);
    cap.position.y = 1.86;
    this.body.add(cap);

    // 四肢以肩/髖為樞紐，供跑步擺臂與自由式划水動畫
    const buildLimb = (x: number, y: number, len: number, w: number, mat: THREE.Material): THREE.Group => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const limb = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
      limb.position.y = -len / 2;
      pivot.add(limb);
      this.body.add(pivot);
      return pivot;
    };
    this.leftArm = buildLimb(-0.33, 1.42, 0.6, 0.14, skinMat);
    this.rightArm = buildLimb(0.33, 1.42, 0.6, 0.14, skinMat);
    this.leftLeg = buildLimb(-0.13, 0.84, 0.84, 0.18, shortsMat);
    this.rightLeg = buildLimb(0.13, 0.84, 0.84, 0.18, shortsMat);

    // 頭頂名牌
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
      ctx.beginPath();
      ctx.roundRect(4, 6, 248, 52, 26);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 128, 33);
    }
    const tagMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false });
    this.nameTag = new THREE.Sprite(tagMat);
    this.nameTag.scale.set(1.8, 0.45, 1);
    this.nameTag.position.y = 2.35;
    this.nameTag.renderOrder = 10;
    this.mesh.add(this.nameTag);

    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  // 設定賽道折線路徑並預算累積長度
  public setPath(points: THREE.Vector3[]) {
    this.path = points;
    this.cumLengths = [0];
    for (let i = 1; i < points.length; i++) {
      this.cumLengths.push(this.cumLengths[i - 1] + points[i].distanceTo(points[i - 1]));
    }
    this.totalLength = this.cumLengths[this.cumLengths.length - 1];
    this.reset();
  }

  public reset() {
    this.distance = 0;
    this.isFinished = false;
    this.animTimer = 0;
    this.mesh.visible = true;
    this.placeAt(0);
    this.setPose('STAND', 0);
  }

  public hide() {
    this.mesh.visible = false;
  }

  public get progress(): number {
    return this.totalLength > 0 ? this.distance / this.totalLength : 0;
  }

  // 前進並更新位置與朝向
  public advance(distanceDelta: number) {
    if (this.isFinished) return;
    this.distance = Math.min(this.totalLength, this.distance + distanceDelta);
    if (this.distance >= this.totalLength) this.isFinished = true;
    this.placeAt(this.distance);
  }

  private placeAt(d: number) {
    if (this.path.length < 2) return;
    let i = 1;
    while (i < this.cumLengths.length - 1 && this.cumLengths[i] < d) i++;
    const a = this.path[i - 1];
    const b = this.path[i];
    const segLen = this.cumLengths[i] - this.cumLengths[i - 1];
    const t = segLen > 0 ? (d - this.cumLengths[i - 1]) / segLen : 0;
    this.mesh.position.lerpVectors(a, b, t);
    _scratchSegDir.subVectors(b, a);
    if (_scratchSegDir.lengthSq() > 1e-6) {
      this.facingY = Math.atan2(_scratchSegDir.x, _scratchSegDir.z);
    }
  }

  // STAND：起跑線待命；RUN：跑步擺臂；SWIM：自由式俯趴划水；CHEER：抵達終點振臂歡呼
  public setPose(mode: 'STAND' | 'RUN' | 'SWIM' | 'CHEER', delta: number, waterSurfaceY: number = 0.25) {
    const turn = Math.atan2(Math.sin(this.facingY - this.mesh.rotation.y), Math.cos(this.facingY - this.mesh.rotation.y));
    this.mesh.rotation.y += turn * Math.min(delta * 10.0, 1.0);

    if (mode === 'SWIM') {
      this.animTimer += delta * 6.0; // 配合放慢後的泳速 (約 3 m/s)
      // 俯趴：身體繞腳底向前倒 90 度，軀幹中線貼齊水面
      this.body.rotation.x = Math.PI / 2;
      this.mesh.position.y = waterSurfaceY - 0.08;
      this.leftArm.rotation.x = Math.sin(this.animTimer) * 2.2 - 0.4;
      this.rightArm.rotation.x = Math.sin(this.animTimer + Math.PI) * 2.2 - 0.4;
      this.leftLeg.rotation.x = Math.sin(this.animTimer * 2.0) * 0.35;
      this.rightLeg.rotation.x = -Math.sin(this.animTimer * 2.0) * 0.35;
      this.nameTag.position.y = 1.0;
      return;
    }

    this.body.rotation.x = 0;
    this.nameTag.position.y = 2.35;
    if (mode === 'RUN') {
      this.animTimer += delta * 13.0;
      const swing = Math.sin(this.animTimer);
      this.leftArm.rotation.x = swing * 1.0;
      this.rightArm.rotation.x = -swing * 1.0;
      this.leftLeg.rotation.x = -swing * 0.9;
      this.rightLeg.rotation.x = swing * 0.9;
      this.body.position.y = Math.abs(Math.cos(this.animTimer)) * 0.06;
    } else if (mode === 'CHEER') {
      this.animTimer += delta * 6.0;
      this.leftArm.rotation.x = Math.PI - 0.2 + Math.sin(this.animTimer) * 0.2;
      this.rightArm.rotation.x = Math.PI - 0.2 + Math.sin(this.animTimer + 1.0) * 0.2;
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.body.position.y = Math.abs(Math.sin(this.animTimer)) * 0.12;
    } else {
      this.leftArm.rotation.x = 0;
      this.rightArm.rotation.x = 0;
      this.leftLeg.rotation.x = 0;
      this.rightLeg.rotation.x = 0;
      this.body.position.y = 0;
    }
  }
}
