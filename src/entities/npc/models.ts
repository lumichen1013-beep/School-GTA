import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { NPCRole } from '../NPC';
import { bakeNode, bakeStaticParts } from './modelCache';
import { buildUmbrella } from '../shared/umbrella';

// NPC 3D 模型建構 (自 NPC.ts 抽出)：各建構函式讀寫 NPCModelRig，由 NPC 於建構與角色切換時套用結果
export interface NPCModelRig {
  readonly mesh: THREE.Group;
  readonly role: NPCRole;
  readonly studentOutfit: { shirt: number; pants: number };
  readonly hasUmbrella: boolean;
  humanoidParts: THREE.Object3D[];
  headMesh?: THREE.Mesh;
  leftArm?: THREE.Mesh;
  rightArm?: THREE.Mesh;
  leftLeg?: THREE.Mesh;
  rightLeg?: THREE.Mesh;
  dogFrontLeftLeg?: THREE.Object3D;
  dogFrontRightLeg?: THREE.Object3D;
  dogBackLeftLeg?: THREE.Object3D;
  dogBackRightLeg?: THREE.Object3D;
  dogTail?: THREE.Object3D;
  dogHead?: THREE.Object3D;
  bikeFrontWheel?: THREE.Mesh;
  bikeRearWheel?: THREE.Mesh;
  umbrellaMesh?: THREE.Group;
  bossTelegraphMat?: THREE.MeshBasicMaterial;
}

// 1. 建造校犬柴柴 / 特訓狼犬 3D 模型
export function buildDogModel(rig: NPCModelRig) {
  const isWolf = rig.role === 'DETENTION_WOLF';
  if (isWolf) {
    rig.mesh.scale.set(1.15, 1.15, 1.15);
  }

  // 經典配色材質 (柴犬: 暖金棕配奶白 / 特訓狼犬: 鐵甲黑背毛配棕褐)
  const bodyColor = isWolf ? 0x222831 : 0xc87a32;
  const underColor = isWolf ? 0x8b5a2b : 0xfff6ea;
  const collarColor = isWolf ? 0xc0392b : 0xe74c3c;

  const shibaTanMat = new THREE.MeshLambertMaterial({ color: bodyColor });
  const shibaWhiteMat = new THREE.MeshLambertMaterial({ color: underColor });
  const noseBlackMat = new THREE.MeshLambertMaterial({ color: 0x1e272e });
  const innerEarMat = new THREE.MeshLambertMaterial({ color: isWolf ? 0x5a3e2b : 0xf5d5c5 });
  const collarMat = new THREE.MeshLambertMaterial({ color: collarColor });
  const goldMat = new THREE.MeshLambertMaterial({ color: isWolf ? 0x95a5a6 : 0xf1c40f });
  const eyeMat = new THREE.MeshBasicMaterial({ color: isWolf ? 0xf1c40f : 0xffffff });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

  // A. 身體主幹 (背部金棕毛色)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.44, 0.88), shibaTanMat);
  body.position.set(0, 0.45, 0);
  body.castShadow = true;
  rig.mesh.add(body);

  // B. 胸前大片裏白毛 (Urajiro Chest Bib)
  const chestBib = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.36, 0.24), shibaWhiteMat);
  chestBib.position.set(0, 0.43, 0.36);
  rig.mesh.add(chestBib);

  // C. 腹部白色毛皮 (White Underbelly)
  const bellyWhite = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.60), shibaWhiteMat);
  bellyWhite.position.set(0, 0.25, -0.05);
  rig.mesh.add(bellyWhite);

  // D. 狗頭部 (Shiba Inu Head)
  rig.dogHead = new THREE.Group();
  rig.dogHead.position.set(0, 0.65, 0.48);
  rig.mesh.add(rig.dogHead);

  const headBase = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.38, 0.44), shibaTanMat);
  headBase.castShadow = true;
  rig.dogHead.add(headBase);

  // 柴柴圓鼓鼓的白腮幫子 (Urajiro White Cheeks)
  const cheekL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.26), shibaWhiteMat);
  cheekL.position.set(-0.17, -0.06, 0.10);
  rig.dogHead.add(cheekL);

  const cheekR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.26), shibaWhiteMat);
  cheekR.position.set(0.17, -0.06, 0.10);
  rig.dogHead.add(cheekR);

  // 柴犬口鼻部 (White Muzzle)
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.19, 0.26), shibaWhiteMat);
  snout.position.set(0, -0.08, 0.32);
  snout.castShadow = true;
  rig.dogHead.add(snout);

  // 黑鼻頭 (Black Nose Button)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.06), noseBlackMat);
  nose.position.set(0, 0.065, 0.12);
  snout.add(nose);

  // 經典黑嘴角線
  const mouthLine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.04), noseBlackMat);
  mouthLine.position.set(0, -0.04, 0.12);
  snout.add(mouthLine);

  // 柴犬標誌性白麻糬眉毛 (Iconic White Dot Eyebrows)
  const browGeo = new THREE.SphereGeometry(0.035, 8, 8);
  const browL = new THREE.Mesh(browGeo, shibaWhiteMat);
  browL.position.set(-0.10, 0.15, 0.22);
  browL.scale.set(1.2, 0.8, 0.4);
  rig.dogHead.add(browL);

  const browR = new THREE.Mesh(browGeo, shibaWhiteMat);
  browR.position.set(0.10, 0.15, 0.22);
  browR.scale.set(1.2, 0.8, 0.4);
  rig.dogHead.add(browR);

  // 柴柴黑亮眼睛 (Eyes with White Specular)
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
  eyeL.position.set(-0.12, 0.07, 0.22);
  const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), pupilMat);
  pupilL.position.set(0, 0, 0.025);
  eyeL.add(pupilL);
  rig.dogHead.add(eyeL);

  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), eyeMat);
  eyeR.position.set(0.12, 0.07, 0.22);
  const pupilR = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), pupilMat);
  pupilR.position.set(0, 0, 0.025);
  eyeR.add(pupilR);
  rig.dogHead.add(eyeR);

  // 柴犬直立三角形萌耳 (Erect Shiba Ears with Inner Lining)
  const earLGroup = new THREE.Group();
  earLGroup.position.set(-0.16, 0.24, -0.04);
  earLGroup.rotation.z = -0.25;
  const earLOuter = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 4), shibaTanMat);
  earLOuter.rotation.y = Math.PI / 4;
  earLGroup.add(earLOuter);
  const earLInner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 4), innerEarMat);
  earLInner.position.set(0, -0.01, 0.02);
  earLInner.rotation.y = Math.PI / 4;
  earLGroup.add(earLInner);
  rig.dogHead.add(earLGroup);

  const earRGroup = new THREE.Group();
  earRGroup.position.set(0.16, 0.24, -0.04);
  earRGroup.rotation.z = 0.25;
  const earROuter = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.18, 4), shibaTanMat);
  earROuter.rotation.y = Math.PI / 4;
  earRGroup.add(earROuter);
  const earRInner = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 4), innerEarMat);
  earRInner.position.set(0, -0.01, 0.02);
  earRInner.rotation.y = Math.PI / 4;
  earRGroup.add(earRInner);
  rig.dogHead.add(earRGroup);

  // E. 日式紅色項圈與金色鈴鐺 (Red Collar & Gold Bell)
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.09, 0.44), collarMat);
  collar.position.set(0, 0.52, 0.35);
  rig.mesh.add(collar);

  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 10), goldMat);
  bell.position.set(0, 0.46, 0.58);
  rig.mesh.add(bell);

  // F. 柴犬經典高翹甜甜圈捲尾巴 (Iconic Curled Sickle Tail)
  rig.dogTail = new THREE.Group();
  rig.dogTail.position.set(0, 0.62, -0.42);
  rig.mesh.add(rig.dogTail);

  const tailTorus = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.055, 8, 16, Math.PI * 1.3), shibaTanMat);
  tailTorus.rotation.y = Math.PI / 2;
  tailTorus.rotation.x = 0.3;
  tailTorus.position.set(0, 0.14, -0.05);
  tailTorus.castShadow = true;
  rig.dogTail.add(tailTorus);

  const tailTip = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), shibaWhiteMat);
  tailTip.position.set(0, 0.24, 0.08);
  rig.dogTail.add(tailTip);

  // G. 四隻腳：上截金棕、下截白襪子爪爪 (White Socks Shiba Legs)
  const createShibaLeg = (x: number, z: number): THREE.Group => {
    const legGroup = new THREE.Group();
    legGroup.position.set(x, 0.38, z); // 旋轉關節軸設在 Y = 0.38m

    // 上截腿部 (Tan Upper Leg)
    const upperLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.22, 0.14), shibaTanMat);
    upperLeg.position.set(0, -0.11, 0);
    upperLeg.castShadow = true;
    legGroup.add(upperLeg);

    // 下截白襪子小爪子 (White Socks Paws)
    const whiteSock = new THREE.Mesh(new THREE.BoxGeometry(0.142, 0.16, 0.142), shibaWhiteMat);
    whiteSock.position.set(0, -0.30, 0);
    whiteSock.castShadow = true;
    legGroup.add(whiteSock);

    rig.mesh.add(legGroup);
    return legGroup;
  };

  rig.dogFrontLeftLeg = createShibaLeg(-0.18, 0.32);
  rig.dogFrontRightLeg = createShibaLeg(0.18, 0.32);
  rig.dogBackLeftLeg = createShibaLeg(-0.18, -0.32);
  rig.dogBackRightLeg = createShibaLeg(0.18, -0.32);

  // 烘焙合併：頭、尾、四腿各自保留動畫關節，其餘身體零件合併為單一靜態網格 (同品種共用幾何體)
  const animatedParts: THREE.Object3D[] = [
    rig.dogHead, rig.dogTail,
    rig.dogFrontLeftLeg, rig.dogFrontRightLeg, rig.dogBackLeftLeg, rig.dogBackRightLeg
  ];
  bakeNode(rig.dogHead, `${rig.role}|head`);
  bakeNode(rig.dogTail, `${rig.role}|tail`);
  for (let i = 2; i < animatedParts.length; i++) bakeNode(animatedParts[i], `${rig.role}|leg`);
  bakeStaticParts(rig.mesh, rig.mesh.children.filter(c => !animatedParts.includes(c)), `${rig.role}|body`);
}

// 2. 建造騎單車糾察隊 3D 模型
export function buildBikePatrolModel(rig: NPCModelRig) {
  const frameMat = new THREE.MeshLambertMaterial({ color: 0x3498db });
  const rubberMat = new THREE.MeshLambertMaterial({ color: 0x1e272e });
  const shirtMat = new THREE.MeshLambertMaterial({ color: rig.studentOutfit.shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: rig.studentOutfit.pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xfad390 });
  const armBandMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c });

  // 單車前後輪
  const wheelGeo = new THREE.TorusGeometry(0.38, 0.045, 8, 20);
  rig.bikeRearWheel = new THREE.Mesh(wheelGeo, rubberMat);
  rig.bikeRearWheel.position.set(0, 0.38, -0.75);
  rig.mesh.add(rig.bikeRearWheel);

  rig.bikeFrontWheel = new THREE.Mesh(wheelGeo, rubberMat);
  rig.bikeFrontWheel.position.set(0, 0.38, 0.75);
  rig.mesh.add(rig.bikeFrontWheel);

  // 車架
  const frameTube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 8), frameMat);
  frameTube.rotation.x = Math.PI / 2;
  frameTube.position.set(0, 0.65, 0);
  rig.mesh.add(frameTube);

  // 龍頭車把
  const handlebar = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.05, 0.05), frameMat);
  handlebar.position.set(0, 0.95, 0.65);
  rig.mesh.add(handlebar);

  // 糾察隊員 (騎坐在車上)
  const riderTorso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), shirtMat);
  riderTorso.position.set(0, 1.15, -0.15);
  riderTorso.rotation.x = 0.25;
  rig.mesh.add(riderTorso);

  // 紅色值星臂章
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.18), armBandMat);
  band.position.set(-0.35, 1.3, -0.15);
  rig.mesh.add(band);

  // 頭部
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.36, 0.35), skinMat);
  head.position.set(0, 1.62, 0.0);
  rig.mesh.add(head);
  rig.headMesh = head;

  // 帽子 (糾察隊白便帽)
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.12, 0.44), shirtMat);
  cap.position.set(0, 1.82, 0.04);
  rig.mesh.add(cap);

  // 騎車手臂伸向前把手
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.65, 6), shirtMat);
  armL.position.set(-0.25, 1.05, 0.25);
  armL.rotation.x = 0.75;
  rig.mesh.add(armL);

  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.65, 6), shirtMat);
  armR.position.set(0.25, 1.05, 0.25);
  armR.rotation.x = 0.75;
  rig.mesh.add(armR);

  // 彎曲雙腿踩在腳踏板
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), pantsMat);
  legL.position.set(-0.2, 0.65, -0.1);
  legL.rotation.x = 0.5;
  rig.mesh.add(legL);

  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), pantsMat);
  legR.position.set(0.2, 0.65, -0.1);
  legR.rotation.x = 0.5;
  rig.mesh.add(legR);

  // 烘焙合併：前後輪 (會轉動) 與頭部 (會轉頭) 保留，車架與坐姿騎士合併為單一靜態網格
  const outfitKey = `${rig.studentOutfit.shirt}|${rig.studentOutfit.pants}`;
  bakeNode(rig.bikeRearWheel, 'BIKE_PATROL|wheel');
  bakeNode(rig.bikeFrontWheel, 'BIKE_PATROL|wheel');
  bakeNode(head, 'BIKE_PATROL|head');
  const staticParts = [frameTube, handlebar, riderTorso, band, cap, armL, armR, legL, legR];
  bakeStaticParts(rig.mesh, staticParts, `BIKE_PATROL|${outfitKey}|body`);
}

// 3. 建造普通人型 NPC 3D 模型 (生教、步巡糾察、普通學生)
export function buildHumanoidModel(rig: NPCModelRig) {
  rig.humanoidParts = [];
  const addHumanoidPart = (part: THREE.Object3D) => {
    rig.mesh.add(part);
    rig.humanoidParts.push(part);
  };

  // 學生、糾察隊、單車巡邏同學 (徒步) 預設穿著學生服裝
  let shirtColor = rig.studentOutfit.shirt;
  let pantsColor = rig.studentOutfit.pants;

  if (rig.role === 'TEACHER') {
    shirtColor = 0x2c3e50;
    pantsColor = 0x34495e;
  } else if (rig.role === 'INSTRUCTOR') {
    // 教官卡其色軍訓制服
    shirtColor = 0xbeb698;
    pantsColor = 0x82775c;
  } else if (rig.role === 'PE_TEACHER_BOSS') {
    // 大如老師：熱血深紅運動夾克與黑色運動長褲
    shirtColor = 0xc0392b;
    pantsColor = 0x2c3e50;
  } else if (rig.role === 'DODGE_TEACHER') {
    // 閃身步老師：神秘深紫武術長袍配墨黑勁裝
    shirtColor = 0x582c87;
    pantsColor = 0x1e272e;
  } else if (rig.role === 'DETENTION_GUARD') {
    // 特訓教官：高對比海軍藍警備制服與深灰長褲
    shirtColor = 0x2980b9;
    pantsColor = 0x34495e;
  } else if (rig.role === 'DETENTION_SENIOR') {
    // 特訓資深學長：高可視度亮橘運動背心與休閒淺灰運動褲
    shirtColor = 0xe67e22;
    pantsColor = 0x718093;
  } else if (rig.role === 'DETENTION_HEAVY') {
    // 重訓霸榜生：石墨炭灰重訓背心與深海軍藍短褲
    shirtColor = 0x485460;
    pantsColor = 0x2c3e50;
  } else if (rig.role === 'DETENTION_BOSS') {
    // 鐵面總長：威嚴深海軍藍金邊將官大衣
    shirtColor = 0x2c3a47;
    pantsColor = 0x1e272e;
  }

  const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pantsColor });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xfad390 });
  const hairMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

  // 軀幹
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.75, 0.35), shirtMat);
  torso.position.y = 1.05;
  torso.castShadow = true;
  addHumanoidPart(torso);

  // 角色專屬配飾 (臂章、反光背心、裁判哨)
  if (rig.role === 'INSPECTOR') {
    const armBandMat = new THREE.MeshLambertMaterial({ color: 0xe74c3c });
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), armBandMat);
    band.position.set(-0.45, 1.25, 0);
    addHumanoidPart(band);
  } else if (rig.role === 'TEACHER') {
    // 生教組長螢光背心
    const vestMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.7, 0.38), vestMat);
    vest.position.y = 1.05;
    addHumanoidPart(vest);
  } else if (rig.role === 'PE_TEACHER_BOSS') {
    // 體育組長胸前裁判金屬哨子與白色運動條紋
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const stripeL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.36), stripeMat);
    stripeL.position.set(-0.25, 1.05, 0);
    addHumanoidPart(stripeL);
    const stripeR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.36), stripeMat);
    stripeR.position.set(0.25, 1.05, 0);
    addHumanoidPart(stripeR);

    const whistleMat = new THREE.MeshStandardMaterial({ color: 0xdcdde1, metalness: 0.85, roughness: 0.2 });
    const whistle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.08), whistleMat);
    whistle.position.set(0, 1.22, 0.2);
    addHumanoidPart(whistle);
  } else if (rig.role === 'DODGE_TEACHER') {
    // 閃身步老師：金色太極武術腰帶與身法束髮帶
    const sashMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
    const sash = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.16, 0.38), sashMat);
    sash.position.y = 0.72;
    addHumanoidPart(sash);

    const headBandMat = new THREE.MeshLambertMaterial({ color: 0xf5f6fa });
    const headBand = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.42), headBandMat);
    headBand.position.y = 1.76;
    addHumanoidPart(headBand);
  } else if (rig.role === 'DETENTION_HEAVY') {
    // 重訓霸榜生：粗獷體格與深褐牛皮健美舉重腰帶
    torso.scale.set(1.28, 1.05, 1.25);
    const beltMat = new THREE.MeshLambertMaterial({ color: 0x5d4037 });
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.16, 0.42), beltMat);
    belt.position.y = 0.75;
    addHumanoidPart(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.44), new THREE.MeshLambertMaterial({ color: 0xbdc3c7 }));
    buckle.position.set(0, 0.75, 0);
    addHumanoidPart(buckle);
  } else if (rig.role === 'DETENTION_BOSS') {
    // 鐵面總長：金色將官肩章與金屬哨鍊
    const epL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.38), new THREE.MeshLambertMaterial({ color: 0xf1c40f }));
    epL.position.set(-0.35, 1.44, 0);
    addHumanoidPart(epL);
    const epR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.38), new THREE.MeshLambertMaterial({ color: 0xf1c40f }));
    epR.position.set(0.35, 1.44, 0);
    addHumanoidPart(epR);

    const bWhistle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshLambertMaterial({ color: 0xdcdde1 }));
    bWhistle.position.set(0, 1.25, 0.2);
    addHumanoidPart(bWhistle);
  }

  // 第二世界特訓院人形角色 (教官、資深學長、霸榜生、總教官)：
  // 正面配備戰術防彈插板與發光巡邏手電筒 (前向光錐)，背面配備戰術大背包與無線電天線，徹底解決「分不出正面背面」問題
  const isDetentionHuman = (
    rig.role === 'DETENTION_GUARD' ||
    rig.role === 'DETENTION_SENIOR' ||
    rig.role === 'DETENTION_HEAVY' ||
    rig.role === 'DETENTION_BOSS'
  );

  if (isDetentionHuman) {
    // 1. 【正面 +Z 標誌】：戰術防彈胸板與金屬扣鎖
    const vestMat = new THREE.MeshLambertMaterial({ color: 0x1e272e });
    const vestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.52, 0.06), vestMat);
    vestPlate.position.set(0, 0.04, 0.185);
    torso.add(vestPlate);

    const buckleMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
    const bL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.07), buckleMat);
    bL.position.set(-0.16, 0.14, 0.19);
    const bR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.07), buckleMat);
    bR.position.set(0.16, 0.14, 0.19);
    torso.add(bL, bR);

    // 2. 【正面 +Z 戰術手電筒與前向光錐】：一眼看清巡邏視線朝向！
    const torchGroup = new THREE.Group();
    const torchBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.16, 8),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    torchBody.rotation.x = Math.PI / 2;
    torchGroup.add(torchBody);

    const lensMat = new THREE.MeshBasicMaterial({ color: 0xfffae0 });
    const torchLens = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8), lensMat);
    torchLens.position.set(0, 0, 0.081);
    torchGroup.add(torchLens);

    // 前向柔和半透明光錐 (朝向正面 +Z，遠距離或背對時均清晰可見視野朝向)
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xfffae0,
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    });
    const beamGeo = new THREE.ConeGeometry(0.48, 2.8, 8, 1, true);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0, 1.4);
    const beamMesh = new THREE.Mesh(beamGeo, beamMat);
    torchGroup.add(beamMesh);

    torchGroup.position.set(0.20, 0.16, 0.19);
    torso.add(torchGroup);

    // 3. 【背面 -Z 標誌】：戰術作戰背包與無線電鞭狀天線 (背面絕無視線特徵)
    const packMat = new THREE.MeshLambertMaterial({ color: 0x151b22 });
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.54, 0.16), packMat);
    pack.position.set(0, 0.02, -0.22);
    torso.add(pack);

    const antennaMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.008, 0.60, 6), antennaMat);
    antenna.position.set(0.20, 0.40, -0.20);
    antenna.rotation.x = -0.15;
    torso.add(antenna);
  }

  // 頭部
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.4, 0.38), skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  addHumanoidPart(head);
  rig.headMesh = head;

  // 眼睛與五官 (正面 +Z 方向專屬標記)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), eyeMat);
  eyeL.position.set(-0.09, 0.03, 0.20);
  head.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), eyeMat);
  eyeR.position.set(0.09, 0.03, 0.20);
  head.add(eyeR);

  if (rig.role === 'PE_TEACHER_BOSS') {
    // 大如老師：熱血濃眉 (加強羽球教練神韻)
    const browMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const browL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.02), browMat);
    browL.position.set(-0.09, 0.068, 0.202);
    browL.rotation.z = -0.15;
    head.add(browL);

    const browR = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.025, 0.02), browMat);
    browR.position.set(0.09, 0.068, 0.202);
    browR.rotation.z = 0.15;
    head.add(browR);

    // 大如老師：專屬招牌喜感立體蓬鬆爆炸頭 (Afro) 與運動吸汗頭帶
    const afro = buildAfroHair();
    head.add(afro);
  } else {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.42), hairMat);
    hair.position.set(0, 0.16, 0);
    head.add(hair);
  }

  // 教官大盤帽 (Military Cap)
  if (rig.role === 'INSTRUCTOR') {
    const capMat = new THREE.MeshLambertMaterial({ color: 0x6e6650 });
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.22, 0.12, 12), capMat);
    cap.position.set(0, 0.25, 0);
    head.add(cap);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.16), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    visor.position.set(0, 0.21, 0.14);
    head.add(visor);
  } else if (rig.role === 'DETENTION_GUARD') {
    // 特訓教官防暴貝雷帽
    const beret = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.22, 0.12, 12),
      new THREE.MeshLambertMaterial({ color: 0x11161d })
    );
    beret.position.set(0, 0.24, 0);
    head.add(beret);

    // 正面戰術防暴護目鏡 (亮琥珀金夜視感測光條，正面一眼可見)
    const goggleMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const goggles = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.06), goggleMat);
    goggles.position.set(0, 0.04, 0.20);
    head.add(goggles);
    const sensorMat = new THREE.MeshBasicMaterial({ color: 0xf39c12 });
    const sensor = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.07), sensorMat);
    sensor.position.set(0, 0.04, 0.20);
    head.add(sensor);
  } else if (rig.role === 'DETENTION_SENIOR') {
    // 資深學長：正面運動吸汗頭帶
    const headBandMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const headBand = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.08, 0.40), headBandMat);
    headBand.position.set(0, 0.14, 0);
    head.add(headBand);
  } else if (rig.role === 'DETENTION_BOSS') {
    // 鐵面總長大盤帽與金徽章、金屬鐵面遮面
    const bCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.22, 0.14, 12),
      new THREE.MeshLambertMaterial({ color: 0x11161d })
    );
    bCap.position.set(0, 0.26, 0);
    head.add(bCap);

    const bVisor = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.03, 0.18),
      new THREE.MeshLambertMaterial({ color: 0x050505 })
    );
    bVisor.position.set(0, 0.22, 0.16);
    bVisor.rotation.x = 0.2;
    head.add(bVisor);

    const bBadge = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.02),
      new THREE.MeshLambertMaterial({ color: 0xf1c40f })
    );
    bBadge.position.set(0, 0.28, 0.22);
    head.add(bBadge);

    const bossMask = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.12, 0.15),
      new THREE.MeshLambertMaterial({ color: 0x7f8c8d })
    );
    bossMask.position.set(0, 0.04, 0.18);
    head.add(bossMask);
  }

  // 手腳
  const armGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
  rig.leftArm = new THREE.Mesh(armGeo, shirtMat);
  rig.leftArm.position.set(-0.45, 1.05, 0);
  addHumanoidPart(rig.leftArm);

  rig.rightArm = new THREE.Mesh(armGeo, shirtMat);
  rig.rightArm.position.set(0.45, 1.05, 0);
  addHumanoidPart(rig.rightArm);

  // 重訓霸榜生增粗手臂
  if (rig.role === 'DETENTION_HEAVY') {
    rig.leftArm.scale.set(1.3, 1.0, 1.3);
    rig.rightArm.scale.set(1.3, 1.0, 1.3);
  }

  // 特訓教官手持防暴海綿盾 (左手) 與防暴警棍 (右手)
  if (rig.role === 'DETENTION_GUARD') {
    const shieldMat = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.85, 0.52), shieldMat);
    shield.position.set(-0.1, -0.05, 0.22);
    rig.leftArm.add(shield);

    const shieldStripe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.53), new THREE.MeshBasicMaterial({ color: 0xf1c40f }));
    shieldStripe.position.set(-0.1, -0.05, 0.22);
    rig.leftArm.add(shieldStripe);

    const baton = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.65, 8),
      new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    baton.position.set(0, -0.22, 0.15);
    rig.rightArm.add(baton);
  }

  // 體育老師專屬羽球拍 3D 裝備 (Attached to right arm)
  if (rig.role === 'PE_TEACHER_BOSS') {
    const racketGroup = new THREE.Group();
    // 握把 (Grip)
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.24, 8),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    grip.position.y = 0.12;
    racketGroup.add(grip);
    // 中桿 (Shaft)
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.42, 8),
      new THREE.MeshLambertMaterial({ color: 0x2d3436 })
    );
    shaft.position.y = 0.45;
    racketGroup.add(shaft);
    // 拍框 (Frame)
    const frame = new THREE.Mesh(
      new THREE.TorusGeometry(0.16, 0.016, 8, 16),
      new THREE.MeshLambertMaterial({ color: 0xe74c3c })
    );
    frame.position.y = 0.82;
    racketGroup.add(frame);
    // 拍線網面 (Strings)
    const stringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
    const strings = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), stringMat);
    strings.position.y = 0.82;
    racketGroup.add(strings);

    racketGroup.position.set(0, -0.28, 0.12);
    racketGroup.rotation.x = Math.PI / 3; // 正角度朝向前方+Z
    rig.rightArm.add(racketGroup);
  }

  // 下雨天 3D Low-Poly 雨傘裝備 (Attached to right arm)
  if (rig.hasUmbrella) {
    rig.umbrellaMesh = buildNpcUmbrella();
    rig.umbrellaMesh.position.set(0, -0.28, 0.10);
    rig.umbrellaMesh.rotation.set(Math.PI * 0.65, -0.12, 0.12);
    rig.rightArm.add(rig.umbrellaMesh);
  }

  const legGeo = new THREE.BoxGeometry(0.24, 0.7, 0.24);
  rig.leftLeg = new THREE.Mesh(legGeo, pantsMat);
  rig.leftLeg.position.set(-0.18, 0.35, 0);
  addHumanoidPart(rig.leftLeg);

  rig.rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rig.rightLeg.position.set(0.18, 0.35, 0);
  addHumanoidPart(rig.rightLeg);

  // 烘焙合併：頭與四肢保留各自動畫關節 (手持裝備併入手臂、雨傘保留可切換顯示)，
  // 軀幹與配飾合併為單一靜態網格；同角色同服裝的 NPC 共用同一份幾何體
  const lookKey = `${rig.role}|${shirtColor}|${pantsColor}`;
  const umbrella = rig.umbrellaMesh;
  bakeNode(head, `${lookKey}|head`);
  bakeNode(rig.leftArm, `${lookKey}|armL`);
  bakeNode(rig.rightArm, `${lookKey}|armR`, obj => obj === umbrella);
  bakeNode(rig.leftLeg, `${lookKey}|leg`);
  bakeNode(rig.rightLeg, `${lookKey}|leg`);
  const animated: THREE.Object3D[] = [head, rig.leftArm, rig.rightArm, rig.leftLeg, rig.rightLeg];
  const body = bakeStaticParts(rig.mesh, rig.humanoidParts.filter(p => !animated.includes(p)), `${lookKey}|body`);
  rig.humanoidParts = [body, ...animated];
}

// 建造大如老師專屬 3D 經典蓬鬆喜感爆炸頭 (Afro) 與運動吸汗頭帶
function buildAfroHair(): THREE.Group {
  const afro = new THREE.Group();
  afro.name = 'daru_afro_hair';

  // 爆炸頭深色捲髮材質 (flatShading 突顯多面體蓬鬆捲曲質感與光影立體層次)
  const afroMat = new THREE.MeshLambertMaterial({
    color: 0x161311,
    flatShading: true
  });
  const afroMatHighlight = new THREE.MeshLambertMaterial({
    color: 0x241d1a,
    flatShading: true
  });

  // 爆炸頭多組交疊微偏的十二面體叢集，打造立體飽滿、圓潤且富有喜感的蓬鬆輪廓
  const puffDefs: Array<{
    x: number;
    y: number;
    z: number;
    r: number;
    detail?: number;
    highlight?: boolean;
    scale?: [number, number, number];
  }> = [
    // 1. 核心大髮量基座
    { x: 0, y: 0.20, z: -0.04, r: 0.28, detail: 1, scale: [1.12, 0.98, 1.08] },

    // 2. 頂部高聳髮冠 (Crown / Top dome)
    { x: 0, y: 0.36, z: -0.05, r: 0.21, detail: 1 },
    { x: -0.14, y: 0.33, z: -0.03, r: 0.19, detail: 1 },
    { x: 0.14, y: 0.33, z: -0.03, r: 0.19, detail: 1 },
    { x: 0, y: 0.33, z: 0.09, r: 0.17, detail: 1, highlight: true },
    { x: 0, y: 0.30, z: -0.19, r: 0.19, detail: 1 },
    { x: -0.12, y: 0.35, z: 0.05, r: 0.16, detail: 1 },
    { x: 0.12, y: 0.35, z: 0.05, r: 0.16, detail: 1 },
    { x: -0.11, y: 0.32, z: -0.15, r: 0.17, detail: 1 },
    { x: 0.11, y: 0.32, z: -0.15, r: 0.17, detail: 1 },

    // 3. 左側蓬鬆外擴 (Left Afro flank)
    { x: -0.26, y: 0.22, z: -0.04, r: 0.21, detail: 1 },
    { x: -0.29, y: 0.12, z: -0.06, r: 0.20, detail: 1, highlight: true },
    { x: -0.24, y: 0.01, z: -0.06, r: 0.16, detail: 1 },
    { x: -0.23, y: 0.18, z: 0.08, r: 0.17, detail: 1 },
    { x: -0.23, y: 0.18, z: -0.18, r: 0.18, detail: 1 },
    { x: -0.25, y: 0.07, z: 0.06, r: 0.15, detail: 1 },
    { x: -0.25, y: 0.06, z: -0.16, r: 0.16, detail: 1 },

    // 4. 右側蓬鬆外擴 (Right Afro flank)
    { x: 0.26, y: 0.22, z: -0.04, r: 0.21, detail: 1 },
    { x: 0.29, y: 0.12, z: -0.06, r: 0.20, detail: 1, highlight: true },
    { x: 0.24, y: 0.01, z: -0.06, r: 0.16, detail: 1 },
    { x: 0.23, y: 0.18, z: 0.08, r: 0.17, detail: 1 },
    { x: 0.23, y: 0.18, z: -0.18, r: 0.18, detail: 1 },
    { x: 0.25, y: 0.07, z: 0.06, r: 0.15, detail: 1 },
    { x: 0.25, y: 0.06, z: -0.16, r: 0.16, detail: 1 },

    // 5. 後腦勺與頸後濃密包覆 (Rear skull & nape)
    { x: 0, y: 0.22, z: -0.23, r: 0.22, detail: 1 },
    { x: 0, y: 0.11, z: -0.24, r: 0.21, detail: 1 },
    { x: -0.14, y: 0.11, z: -0.21, r: 0.19, detail: 1 },
    { x: 0.14, y: 0.11, z: -0.21, r: 0.19, detail: 1 },
    { x: 0, y: -0.01, z: -0.21, r: 0.16, detail: 1 },
    { x: -0.11, y: 0.00, z: -0.19, r: 0.15, detail: 1 },
    { x: 0.11, y: 0.00, z: -0.19, r: 0.15, detail: 1 },

    // 6. 前額瀏海與鬢角自然包覆 (Forehead & temple, 不遮擋眼睛)
    { x: 0, y: 0.22, z: 0.15, r: 0.15, detail: 1 },
    { x: -0.13, y: 0.19, z: 0.15, r: 0.14, detail: 1, highlight: true },
    { x: 0.13, y: 0.19, z: 0.15, r: 0.14, detail: 1, highlight: true },
    { x: -0.19, y: 0.10, z: 0.12, r: 0.13, detail: 1 },
    { x: 0.19, y: 0.10, z: 0.12, r: 0.13, detail: 1 },

    // 7. 外圍俏皮捲髮微突顆粒 (Accent curls / Textured perimeter frizz)
    { x: -0.33, y: 0.25, z: -0.02, r: 0.11, detail: 0, highlight: true },
    { x: 0.33, y: 0.25, z: -0.02, r: 0.11, detail: 0, highlight: true },
    { x: 0, y: 0.44, z: -0.04, r: 0.12, detail: 0, highlight: true },
    { x: -0.17, y: 0.41, z: -0.05, r: 0.10, detail: 0 },
    { x: 0.17, y: 0.41, z: -0.05, r: 0.10, detail: 0 },
    { x: -0.24, y: 0.33, z: 0.08, r: 0.10, detail: 0 },
    { x: 0.24, y: 0.33, z: 0.08, r: 0.10, detail: 0 },
    { x: 0, y: 0.39, z: 0.12, r: 0.10, detail: 0, highlight: true },
    { x: 0, y: 0.35, z: -0.23, r: 0.11, detail: 0 },
    { x: -0.20, y: 0.23, z: -0.22, r: 0.11, detail: 0 },
    { x: 0.20, y: 0.23, z: -0.22, r: 0.11, detail: 0 },
    { x: -0.32, y: 0.06, z: -0.07, r: 0.10, detail: 0 },
    { x: 0.32, y: 0.06, z: -0.07, r: 0.10, detail: 0 },
  ];

  // 依材質將數十顆髮球烘焙合併為 2 個 Mesh (深色髮量 + 高光髮束)，大幅減少 Draw Call
  const baseGeos: THREE.BufferGeometry[] = [];
  const highlightGeos: THREE.BufferGeometry[] = [];
  for (const p of puffDefs) {
    const geo = new THREE.DodecahedronGeometry(p.r, p.detail ?? 1);
    if (p.scale) {
      geo.scale(p.scale[0], p.scale[1], p.scale[2]);
    }
    geo.translate(p.x, p.y, p.z);
    (p.highlight ? highlightGeos : baseGeos).push(geo);
  }
  for (const [geos, mat] of [[baseGeos, afroMat], [highlightGeos, afroMatHighlight]] as const) {
    if (geos.length === 0) continue;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    afro.add(mesh);
  }

  // 8. 體育老師專屬經典運動吸汗頭帶 (Retro PE Sweatband)
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xf8f9fa });
  const sweatband = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.06, 0.40), bandMat);
  sweatband.position.set(0, 0.115, 0);
  sweatband.castShadow = true;
  afro.add(sweatband);

  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xc0392b }); // 呼應紅色運動外套
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.406, 0.02, 0.406), stripeMat);
  stripe.position.set(0, 0.115, 0);
  afro.add(stripe);

  // 正面額前金牌羽球標章 (Gold Sports Emblem)
  const emblem = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.04, 0.015),
    new THREE.MeshLambertMaterial({ color: 0xf1c40f })
  );
  emblem.position.set(0, 0.115, 0.205);
  afro.add(emblem);

  // 9. 喜感羽球教練彩蛋：插在爆炸頭側邊的羽毛球髮飾 (Badminton Shuttlecock tucked in afro)
  const shuttlePin = new THREE.Group();
  shuttlePin.name = 'afro_shuttlecock';
  shuttlePin.position.set(0.31, 0.28, 0.06);
  shuttlePin.rotation.set(-0.25, 0.2, -Math.PI / 4.2);

  // 球頭 (軟木塞底座)
  const corkMat = new THREE.MeshLambertMaterial({ color: 0xdfe4ea });
  const cork = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), corkMat);
  cork.position.set(0, -0.035, 0);
  cork.castShadow = true;
  shuttlePin.add(cork);

  // 軟木塞紅膠帶
  const tape = new THREE.Mesh(
    new THREE.CylinderGeometry(0.027, 0.027, 0.009, 8),
    new THREE.MeshBasicMaterial({ color: 0xe74c3c })
  );
  tape.position.set(0, -0.025, 0);
  shuttlePin.add(tape);

  // 羽毛裙身
  const featherMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const skirt = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.07, 8, 1, true),
    featherMat
  );
  skirt.position.set(0, 0.015, 0);
  skirt.rotation.x = Math.PI;
  skirt.castShadow = true;
  shuttlePin.add(skirt);

  afro.add(shuttlePin);

  return afro;
}

// 建造總教官狂暴衝撞 3D 地面紅色危險預警軌跡線 (Telegraph Danger Corridor)
export function buildBossTelegraphMesh(rig: NPCModelRig): THREE.Group {
  const group = new THREE.Group();
  group.name = 'boss_telegraph';
  group.visible = false;

  // 地面警示紅毯 (2.4m 寬，22.0m 長，自腳下向前方 +Z 延伸)
  const planeGeo = new THREE.PlaneGeometry(2.4, 22.0);
  planeGeo.rotateX(-Math.PI / 2);
  planeGeo.translate(0, 0.02, 11.0);

  rig.bossTelegraphMat = new THREE.MeshBasicMaterial({
    color: 0xff1744,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const groundPlane = new THREE.Mesh(planeGeo, rig.bossTelegraphMat);
  group.add(groundPlane);

  // 左右兩側發光紅霓虹導軌邊界 (Left & Right Glowing Laser Rails)
  const railMat = new THREE.MeshBasicMaterial({ color: 0xff3838, depthWrite: false });
  const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 22.0), railMat);
  leftRail.position.set(-1.2, 0.03, 11.0);
  group.add(leftRail);

  const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 22.0), railMat);
  rightRail.position.set(1.2, 0.03, 11.0);
  group.add(rightRail);

  // 衝撞前進動態導向箭頭 (Forward Chevrons >>>)
  const chevronMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });
  for (let i = 1; i <= 6; i++) {
    const zPos = i * 3.4;
    // V 字型人字箭頭
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.95), chevronMat);
    armL.position.set(-0.35, 0.035, zPos);
    armL.rotation.y = Math.PI / 4;
    group.add(armL);

    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.95), chevronMat);
    armR.position.set(0.35, 0.035, zPos);
    armR.rotation.y = -Math.PI / 4;
    group.add(armR);
  }

  // 衝撞落點危險警示橫桿 (End Impact Danger Barrier)
  const endBarMat = new THREE.MeshBasicMaterial({ color: 0xff0033, depthWrite: false });
  const endBar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 0.4), endBarMat);
  endBar.position.set(0, 0.035, 22.0);
  group.add(endBar);

  // 腳底起點警示條
  const startBarMat = new THREE.MeshBasicMaterial({ color: 0xffd32a, depthWrite: false });
  const startBar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.05, 0.25), startBarMat);
  startBar.position.set(0, 0.035, 0.35);
  group.add(startBar);

  return group;
}

// 建造 3D Low-Poly 雨傘模型 (傘中棒、握把、10 角多邊傘面、頂端金屬針)
function buildNpcUmbrella(): THREE.Group {
  // 隨機豐富傘面顏色 (8 款經典色調：黑、海軍藍、黃、紅、綠、紫、珊瑚粉、雅灰)
  const umbrellaColors = [
    0x1e272e, // 紳士墨黑
    0x1e3799, // 皇家海軍藍
    0xf6b93b, // 活力亮黃
    0xe55039, // 熱情朱紅
    0x079992, // 森林翡翠綠
    0x6a0dad, // 優雅薰衣紫
    0xff6b6b, // 珊瑚粉橘
    0x7f8c8d  // 簡約雅灰
  ];
  const canopyColor = umbrellaColors[Math.floor(Math.random() * umbrellaColors.length)];

  const umbrella = buildUmbrella({
    name: 'umbrella',
    canopyColor,
    shaftMetalness: 0.6,
    handleColor: 0x111111,
    tipMetalness: 0.8,
    rigX: -0.16,
    rigZ: -0.06
  });
  // 同色雨傘共用合併幾何體 (傘柄/傘骨/傘面/尖端合併)
  bakeNode(umbrella, `umbrella|${canopyColor}`);
  return umbrella;
}

// 建造校外強盜 3D 外觀 (蒙面黑衣、手持鋼刀/砍刀)
export function buildBanditModel(rig: NPCModelRig) {
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xdfb48c });
  const maskMat = new THREE.MeshLambertMaterial({ color: 0x1e272e }); // 黑面罩
  const shirtMat = new THREE.MeshLambertMaterial({ color: 0x2f3542 }); // 黑灰夾克
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0x1e272e }); // 黑色長褲
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.85, roughness: 0.2 });
  const hiltMat = new THREE.MeshLambertMaterial({ color: 0x8b0000 });

  // 軀幹
  const bodyGeo = new THREE.BoxGeometry(0.64, 0.75, 0.34);
  const body = new THREE.Mesh(bodyGeo, shirtMat);
  body.position.y = 1.05;
  body.castShadow = true;
  rig.mesh.add(body);

  // 頭部與蒙面頭套
  const headGeo = new THREE.BoxGeometry(0.38, 0.38, 0.38);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.y = 1.62;
  head.castShadow = true;
  rig.mesh.add(head);
  rig.headMesh = head;

  // 黑色蒙面布 (覆蓋口鼻)
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.22, 0.39), maskMat);
  mask.position.set(0, 1.54, 0.01);
  rig.mesh.add(mask);

  // 兇惡紅瞳眼神
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3838 });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), eyeMat);
  eyeL.position.set(-0.09, 1.67, 0.20);
  rig.mesh.add(eyeL);
  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.02), eyeMat);
  eyeR.position.set(0.09, 1.67, 0.20);
  rig.mesh.add(eyeR);

  // 肢體
  const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2);
  rig.leftArm = new THREE.Mesh(armGeo, shirtMat);
  rig.leftArm.position.set(-0.44, 1.05, 0);
  rig.mesh.add(rig.leftArm);

  rig.rightArm = new THREE.Mesh(armGeo, shirtMat);
  rig.rightArm.position.set(0.44, 1.05, 0);
  rig.mesh.add(rig.rightArm);

  // 右手手持砍刀武器 (Machete)
  const macheteGroup = new THREE.Group();
  macheteGroup.position.set(0, -0.32, 0.15);
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), hiltMat);
  hilt.rotation.x = Math.PI / 2;
  macheteGroup.add(hilt);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.65, 0.12), steelMat);
  blade.position.set(0, 0.32, 0.12);
  blade.rotation.x = 0.2;
  blade.castShadow = true;
  macheteGroup.add(blade);
  rig.rightArm.add(macheteGroup);

  const legGeo = new THREE.BoxGeometry(0.24, 0.7, 0.24);
  rig.leftLeg = new THREE.Mesh(legGeo, pantsMat);
  rig.leftLeg.position.set(-0.18, 0.35, 0);
  rig.mesh.add(rig.leftLeg);

  rig.rightLeg = new THREE.Mesh(legGeo, pantsMat);
  rig.rightLeg.position.set(0.18, 0.35, 0);
  rig.mesh.add(rig.rightLeg);

  // 烘焙合併：頭與四肢保留動畫關節 (砍刀併入右臂)，軀幹、面罩與紅瞳合併為靜態網格
  bakeNode(head, 'BANDIT|head');
  bakeNode(rig.leftArm, 'BANDIT|armL');
  bakeNode(rig.rightArm, 'BANDIT|armR');
  bakeNode(rig.leftLeg, 'BANDIT|leg');
  bakeNode(rig.rightLeg, 'BANDIT|leg');
  const animated: THREE.Object3D[] = [head, rig.leftArm, rig.rightArm, rig.leftLeg, rig.rightLeg];
  bakeStaticParts(rig.mesh, rig.mesh.children.filter(c => !animated.includes(c)), 'BANDIT|body');
}
