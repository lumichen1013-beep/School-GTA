import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import { glowSprite } from '../materials';
import type { Theme } from '../themes';
import { crateWood, glow, inscription } from '../textures';
import { mergeParts, placed } from '../geometry';
import { drawingTexture } from './manuscripts';
import type { ModelCtx, PropModel } from './types';
import { labelBadge } from './label';

// 魔方機關 (N21) 的外觀：魔方門 (門 / 拱門 / 章門，依門位朝向房內) 與拉桿 (牌子上的箭頭 = 方向字)

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const approach = (cur: number, target: number, k: number) => cur + (target - cur) * Math.min(1, k);
/** 門位 → 正面朝向 (模型以 +z 為正面；E 門朝西、W 門朝東、S 前緣的門朝後牆) */
const FACING: Readonly<Record<string, number>> = { N: 0, E: -Math.PI / 2, S: Math.PI, W: Math.PI / 2 };

/**
 * v0.4 第四章 梯口 (U / D 門位；規格 6「第四章共用規則」梯口)：
 * U = 靠後牆的梯子 (兩根梯柱 + 橫檔，頂端接天花板上的方形梯口框)；拱門形 (寬) = 梯子較寬、梯口框雙層
 * D = 地上的活板門 (木板 + 鐵環 + 外框)；接通 = 門板掀起 (往後立起)、露出往下的黑洞與梯子頂端；門後是土 = 門板蓋著
 * 兩個視角都畫 (藏寶圖：地上的一道縫 / 牆邊的梯子)
 */
function hatchModel(p: Painter, d: ObjDef, { pal }: Theme): PropModel {
  const g = new THREE.Group();
  const side = d.type === 'cubeDoor' ? d.side : 'U';
  const wide = d.type === 'cubeDoor' && d.kind === 'arch';
  if (side === 'U') {
    const w = d.w, h = d.h;
    const wood = [placed(box(0.09, h, 0.09), -w / 2 + 0.05, h / 2, 0), placed(box(0.09, h, 0.09), w / 2 - 0.05, h / 2, 0)];
    for (let y = 0.35; y < h - 0.1; y += 0.38) wood.push(placed(box(w - 0.1, 0.05, 0.07), 0, y, 0));
    // 4-1b 折疊梯：封著 (sealed) 且同一房的拉繩還沒拉 = 收在天花板上 (只剩上面三成)；拉下 = 整支放下
    const ladder = p.mesh(mergeParts(wood), pal.shelf, { map: crateWood(pal), flat: pal.shelf });
    g.add(ladder);
    const foldable = d.type === 'cubeDoor' && !!d.sealed;
    // 天花板上的梯口框 (方框 + 往上的暗洞)
    const fw = w + 0.5;
    const frame = [placed(box(fw, 0.12, 0.14), 0, h + 0.06, -0.3), placed(box(fw, 0.12, 0.14), 0, h + 0.06, 0.5), placed(box(0.14, 0.12, 0.8), -fw / 2, h + 0.06, 0.1), placed(box(0.14, 0.12, 0.8), fw / 2, h + 0.06, 0.1)];
    if (wide) frame.push(placed(box(fw - 0.3, 0.06, 0.06), 0, h + 0.15, 0.1));
    g.add(p.mesh(mergeParts(frame), pal.doorFrame));
    const hole = p.mesh(new THREE.PlaneGeometry(fw - 0.14, 0.66), pal.outline, { outline: false, shadow: false });
    hole.rotation.x = Math.PI / 2;
    hole.position.set(0, h + 0.01, 0.1);
    g.add(hole);
    let folded: boolean | null = null;
    const update = (c: ModelCtx) => {
      const now = foldable && !c.world.objs.some(o => o.def.type === 'foldCord' && o.used);
      if (now === folded) return;
      folded = now;
      ladder.scale.y = now ? 0.3 : 1;
      ladder.position.y = now ? h * 0.7 : 0;
    };
    return { root: g, update };
  }
  // D：活板門
  const w = d.w, dd = d.d;
  const frame = [placed(box(w + 0.16, 0.06, 0.08), 0, 0.03, -dd / 2 - 0.04), placed(box(w + 0.16, 0.06, 0.08), 0, 0.03, dd / 2 + 0.04), placed(box(0.08, 0.06, dd), -w / 2 - 0.04, 0.03, 0), placed(box(0.08, 0.06, dd), w / 2 + 0.04, 0.03, 0)];
  if (wide) frame.push(placed(box(w, 0.05, 0.05), 0, 0.03, 0));
  g.add(p.mesh(mergeParts(frame), pal.doorFrame, { outline: false }));
  const hole = p.mesh(new THREE.PlaneGeometry(w, dd), 0x0c0b0a, { outline: false, shadow: false });
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 0.005;
  g.add(hole);
  // 門板 (鉸鏈在後緣 z = -d/2)；接通 = 掀到 100°
  const leaf = new THREE.Group();
  leaf.position.set(0, 0.05, -dd / 2);
  const planks = [placed(box(w - 0.04, 0.05, dd - 0.04), 0, 0, dd / 2)];
  for (const z of [0.25, dd - 0.25]) planks.push(placed(box(w - 0.04, 0.03, 0.08), 0, 0.035, z));
  leaf.add(p.mesh(mergeParts(planks), pal.crate, { map: crateWood(pal), flat: pal.crate }));
  const ring = p.mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 14), pal.iron, { metalness: 0.6, roughness: 0.4, outline: false });
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.04, dd - 0.18);
  leaf.add(ring);
  g.add(leaf);
  const update = (c: ModelCtx) => {
    const open = c.world.ext.cube?.links[c.obj.def.id]?.to === 'room';
    leaf.rotation.x = approach(leaf.rotation.x, open ? -1.75 : 0, c.dt * 4);
  };
  return { root: g, update };
}

/** 魔方門：門框 + 門扇 (門 / 章門) 或兩柱 + 拱頂 (拱門)；接通時門縫透出暖光 (章門另有銅鎖板)；U / D = 梯口 (hatchModel) */
export function cubeDoorModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  if (d.type === 'cubeDoor' && (d.side === 'U' || d.side === 'D')) return hatchModel(p, d, theme);
  const { pal } = theme;
  const g = new THREE.Group();
  const face = new THREE.Group();
  const side = d.type === 'cubeDoor' ? d.side : 'N';
  const kind = d.type === 'cubeDoor' ? d.kind : 'door';
  face.rotation.y = FACING[side] ?? 0;
  g.add(face);
  // 前緣 (S) 的門在鏡頭與房間之間：網格用專屬材質並登記為遮擋物 (擋到玩家時淡出，同隔牆)；其他門位照舊共用材質
  const front = side === 'S';
  const occluders: THREE.Mesh[] = [];
  const mesh = (geo: THREE.BufferGeometry, color: number, opts: Parameters<Painter['mesh']>[2] = {}): THREE.Mesh => {
    const m = p.mesh(geo, color, front ? { ...opts, unique: true } : opts);
    if (front) occluders.push(m);
    return m;
  };
  const across = side === 'E' || side === 'W' ? d.d : d.w;
  const h = d.h;
  const fw = 0.16;
  const post = (x: number) => {
    const m = mesh(box(fw, h + fw, 0.3), pal.doorFrame);
    m.position.set(x, (h + fw) / 2, 0);
    face.add(m);
  };
  post(-across / 2 - fw / 2);
  post(across / 2 + fw / 2);
  // 門洞後的暗面 (門後是牆時看到的也是它)；門扇 / 拱門開口都在它前面
  // 厚 0.02、中心退後 0.12：前後面 (房內 0.11 / 0.13) 不與牆的踢腳線 (0.10)、護牆板 (0.06) 共面
  const back = mesh(box(across, h, 0.02), pal.outline, { outline: false, shadow: false });
  back.position.set(0, h / 2, -0.12);
  face.add(back);
  const light = glowSprite(glow(), pal.lampLight, 1.6, 0);
  light.scale.set(across * 1.3, h * 0.9, 1);
  light.position.set(0, h * 0.45, -0.05);
  face.add(light);
  let leaf: THREE.Group | null = null;
  if (kind === 'arch') {
    const top = mesh(new THREE.TorusGeometry(across / 2 + fw / 2, fw / 2, 8, 20, Math.PI), pal.doorFrame);
    top.position.set(0, h + fw / 2, 0);
    face.add(top);
  } else {
    const lintel = mesh(box(across + fw * 2 + 0.1, fw, 0.32), pal.doorFrame);
    lintel.position.set(0, h + fw / 2, 0);
    face.add(lintel);
    leaf = new THREE.Group();
    leaf.position.set(-across / 2, 0, 0.02);
    const slab = mesh(box(across, h, 0.08), kind === 'chapter' ? pal.crateDark : pal.door);
    slab.position.set(across / 2, h / 2, 0);
    leaf.add(slab);
    for (const y of [h * 0.7, h * 0.27]) {
      const panel = mesh(box(across * 0.7, h * 0.32, 0.03), pal.doorPanel, { outline: false });
      panel.position.set(across / 2, y, 0.05);
      leaf.add(panel);
    }
    const knob = mesh(new THREE.SphereGeometry(0.06, 12, 10), pal.brass, { metalness: 0.7, roughness: 0.3 });
    knob.position.set(across - 0.16, 1.1, 0.1);
    leaf.add(knob);
    if (kind === 'chapter') {
      const lock = mesh(box(0.16, 0.3, 0.03), pal.brass, { metalness: 0.7, roughness: 0.35, outline: false });
      lock.position.set(across - 0.16, 0.8, 0.07);
      leaf.add(lock);
    }
    // 門上刻的圖 (2-5 章門 = 老宅立面圖)：門扇上半的淺色木牌
    const carving = d.type === 'cubeDoor' ? d.carving : undefined;
    if (carving) {
      const pic = mesh(new THREE.PlaneGeometry(across * 0.66, across * 0.44), 0xffffff, { map: drawingTexture(carving, 0, 0, 3, 2, 256, '#d9c49a', '#3a2614'), flatMap: true, outline: false, shadow: false, unique: true });
      pic.position.set(across / 2, h * 0.7, 0.075);
      leaf.add(pic);
    }
    face.add(leaf);
  }
  // 門旁 (房內側) 的活字 (2-3c；只在實景看得到)：木牌刻字，掛在門框右柱旁
  const glyph = d.type === 'cubeDoor' ? d.glyph : undefined;
  let tag: THREE.Group | null = null;
  const update = (c: ModelCtx) => {
    if (glyph && !tag) {
      tag = new THREE.Group();
      tag.position.set(across / 2 + fw + 0.3, 1.45, 0.08);
      const board = mesh(box(0.42, 0.42, 0.04), pal.shelfDark, { outline: false });
      const face2 = mesh(new THREE.PlaneGeometry(0.34, 0.34), 0xffffff, { map: inscription(pal, c.world.rt.text(glyph), 'carved', 96), flatMap: true, outline: false, shadow: false, unique: true });
      face2.position.z = 0.025;
      tag.add(board, face2);
      face.add(tag);
    }
    if (tag) tag.visible = c.mode === '3d';
    const open = c.world.ext.cube?.links[c.obj.def.id]?.to === 'room';
    // 前緣的門在鏡頭前：門縫光淡一些，不罩住門內側的玩家
    light.material.opacity = approach(light.material.opacity, open && c.mode === '3d' ? (front ? 0.2 : 0.55) : 0, c.dt * 4);
    if (leaf) leaf.rotation.y = approach(leaf.rotation.y, open ? 0.18 : 0, c.dt * 4);
  };
  return { root: g, update, ...(front ? { occluders } : {}) };
}

/** 拉桿方向字 → 牌子上箭頭的轉角 (箭頭預設朝上) */
const ARROW_ROT: Readonly<Record<string, number>> = { up: 0, right: -Math.PI / 2, down: Math.PI, left: Math.PI / 2 };

/** 詞卡 id `card.<方向字>` → 方向字 (mechanics/labels 的命名慣例；render 不 import 機制值) */
const cardWord = (card: string): string | null => /^card\.(\w+)$/.exec(card)?.[1] ?? null;

/**
 * 拉桿 (貼後牆)：底座 + 槽 + 握柄；上方黃銅牌畫方向箭頭 (墨藍，跟著此刻的方向字：標籤貼了詞卡就轉向)；拉下時握柄擺動一次。
 * 有標籤 (N22) → 藏寶圖裡牌子上方多一張墨框紙籤 (方向字)
 */
export function leverModel(p: Painter, d: ObjDef, theme: Theme): PropModel {
  const { pal } = theme;
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
  const baseWord = d.type === 'lever' ? d.word : 'up';
  arrow.rotation.z = ARROW_ROT[baseWord] ?? 0;
  arrow.position.set(0, d.h * 0.82, -d.d / 2 + 0.09);
  g.add(arrow);
  const badge = d.label ? labelBadge(p, d, theme, g, new THREE.Vector3(0, d.h + 0.38, -d.d / 2 + 0.12), 0.5) : null;
  let lastSeq = -1;
  let swing = 0;
  const update = (c: ModelCtx) => {
    const cards = d.label ? c.world.ext.labels?.[d.label.id] ?? [] : [];
    const word = cards.map(cardWord).find((x): x is string => x !== null) ?? baseWord;
    arrow.rotation.z = ARROW_ROT[word] ?? 0;
    badge?.(c);
    // 轉動完成的訊息一出現就擺一下 (第一章每房至多一支拉桿)
    if (lastSeq >= 0 && c.world.msgSeq !== lastSeq && c.world.msgKey === 'msg.cube.turned') swing = 1;
    lastSeq = c.world.msgSeq;
    swing = Math.max(0, swing - c.dt * 1.5);
    pivot.rotation.x = 0.5 - 1.0 * Math.sin(swing * Math.PI);
  };
  return { root: g, update };
}
