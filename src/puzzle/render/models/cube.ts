import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import { glowSprite } from '../materials';
import type { Theme } from '../themes';
import { glow } from '../textures';
import type { ModelCtx, PropModel } from './types';

// 魔方機關 (N21) 的外觀：魔方門 (門 / 拱門 / 章門，依門位朝向房內) 與拉桿 (牌子上的箭頭 = 方向字)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const approach = (cur: number, target: number, k: number) => cur + (target - cur) * Math.min(1, k);
/** 門位 → 正面朝向 (模型以 +z 為正面；E 門朝西、W 門朝東、S 前緣的門朝後牆) */
const FACING: Readonly<Record<string, number>> = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };

/** 魔方門：門框 + 門扇 (門 / 章門) 或兩柱 + 拱頂 (拱門)；接通時門縫透出暖光 (章門另有銅鎖板) */
export function cubeDoorModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const face = new THREE.Group();
  const side = d.type === 'cubeDoor' ? d.side : 'N';
  const kind = d.type === 'cubeDoor' ? d.kind : 'door';
  face.rotation.y = FACING[side] ?? 0;
  g.add(face);
  const across = side === 'E' || side === 'W' ? d.d : d.w;
  const h = d.h;
  const fw = 0.16;
  const post = (x: number) => {
    const m = p.mesh(box(fw, h + fw, 0.3), pal.doorFrame);
    m.position.set(x, (h + fw) / 2, 0);
    face.add(m);
  };
  post(-across / 2 - fw / 2);
  post(across / 2 + fw / 2);
  // 門洞後的暗面 (門後是牆時看到的也是它)；門扇 / 拱門開口都在它前面
  // 厚 0.02、中心退後 0.12：前後面 (房內 0.11 / 0.13) 不與牆的踢腳線 (0.10)、護牆板 (0.06) 共面
  const back = p.mesh(box(across, h, 0.02), pal.outline, { outline: false, shadow: false });
  back.position.set(0, h / 2, -0.12);
  face.add(back);
  const light = glowSprite(glow(), pal.lampLight, 1.6, 0);
  light.scale.set(across * 1.3, h * 0.9, 1);
  light.position.set(0, h * 0.45, -0.05);
  face.add(light);
  let leaf: THREE.Group | null = null;
  if (kind === 'arch') {
    const top = p.mesh(new THREE.TorusGeometry(across / 2 + fw / 2, fw / 2, 8, 20, Math.PI), pal.doorFrame);
    top.position.set(0, h + fw / 2, 0);
    face.add(top);
  } else {
    const lintel = p.mesh(box(across + fw * 2 + 0.1, fw, 0.32), pal.doorFrame);
    lintel.position.set(0, h + fw / 2, 0);
    face.add(lintel);
    leaf = new THREE.Group();
    leaf.position.set(-across / 2, 0, 0.02);
    const slab = p.mesh(box(across, h, 0.08), kind === 'chapter' ? pal.crateDark : pal.door);
    slab.position.set(across / 2, h / 2, 0);
    leaf.add(slab);
    for (const y of [h * 0.7, h * 0.27]) {
      const panel = p.mesh(box(across * 0.7, h * 0.32, 0.03), pal.doorPanel, { outline: false });
      panel.position.set(across / 2, y, 0.05);
      leaf.add(panel);
    }
    const knob = p.mesh(new THREE.SphereGeometry(0.06, 12, 10), pal.brass, { metalness: 0.7, roughness: 0.3 });
    knob.position.set(across - 0.16, 1.1, 0.1);
    leaf.add(knob);
    if (kind === 'chapter') {
      const lock = p.mesh(box(0.16, 0.3, 0.03), pal.brass, { metalness: 0.7, roughness: 0.35, outline: false });
      lock.position.set(across - 0.16, 0.8, 0.07);
      leaf.add(lock);
    }
    face.add(leaf);
  }
  const update = (c: ModelCtx) => {
    const open = c.world.ext.cube?.links[c.obj.def.id]?.to === 'room';
    light.material.opacity = approach(light.material.opacity, open && c.mode === '3d' ? 0.55 : 0, c.dt * 4);
    if (leaf) leaf.rotation.y = approach(leaf.rotation.y, open ? 0.18 : 0, c.dt * 4);
  };
  return { root: g, update };
}

/** 拉桿方向字 → 牌子上箭頭的轉角 (箭頭預設朝上) */
const ARROW_ROT: Readonly<Record<string, number>> = { up: 0, right: -Math.PI / 2, down: Math.PI, left: Math.PI / 2 };

/** 拉桿 (貼後牆)：底座 + 槽 + 握柄；上方黃銅牌畫方向箭頭 (墨藍)；拉下時握柄擺動一次 */
export function leverModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const base = p.mesh(box(d.w, d.h * 0.62, 0.12), pal.iron, { metalness: 0.5, roughness: 0.5 });
  base.position.set(0, d.h * 0.31, -d.d / 2 + 0.06);
  const slot = p.mesh(box(0.08, d.h * 0.46, 0.02), pal.outline, { outline: false, shadow: false });
  slot.position.set(0, d.h * 0.31, -d.d / 2 + 0.13);
  g.add(base, slot);
  const pivot = new THREE.Group();
  pivot.position.set(0, d.h * 0.31, -d.d / 2 + 0.14);
  const arm = p.mesh(new THREE.CylinderGeometry(0.045, 0.045, d.h * 0.42, 10), pal.metal, { metalness: 0.6, roughness: 0.4 });
  arm.position.y = d.h * 0.21;
  const grip = p.mesh(new THREE.SphereGeometry(0.1, 14, 10), pal.gate);
  grip.position.y = d.h * 0.42;
  pivot.add(arm, grip);
  pivot.rotation.x = 0.5;
  g.add(pivot);
  const plaque = p.mesh(box(d.w * 0.9, d.h * 0.3, 0.04), pal.brass, { metalness: 0.6, roughness: 0.4 });
  plaque.position.set(0, d.h * 0.82, -d.d / 2 + 0.05);
  g.add(plaque);
  const arrow = new THREE.Group();
  const head = p.mesh(new THREE.ConeGeometry(0.1, 0.16, 3), pal.inkBlue, { outline: false, shadow: false });
  head.position.y = 0.07;
  const shaft = p.mesh(box(0.05, 0.14, 0.02), pal.inkBlue, { outline: false, shadow: false });
  shaft.position.y = -0.06;
  arrow.add(head, shaft);
  arrow.rotation.z = ARROW_ROT[d.type === 'lever' ? d.word : 'up'] ?? 0;
  arrow.position.set(0, d.h * 0.82, -d.d / 2 + 0.09);
  g.add(arrow);
  let lastSeq = -1;
  let swing = 0;
  const update = (c: ModelCtx) => {
    // 轉動完成的訊息一出現就擺一下 (第一章每房至多一支拉桿)
    if (lastSeq >= 0 && c.world.msgSeq !== lastSeq && c.world.msgKey === 'msg.cube.turned') swing = 1;
    lastSeq = c.world.msgSeq;
    swing = Math.max(0, swing - c.dt * 1.5);
    pivot.rotation.x = 0.5 - 1.0 * Math.sin(swing * Math.PI);
  };
  return { root: g, update };
}
