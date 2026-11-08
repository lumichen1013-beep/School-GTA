import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import { faceOfCell } from '../../core/cube';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { labelTag, scaleCornerTag } from '../textures';
import type { ModelCtx } from './types';

// 標籤的外觀 (N22；規格 5.4.5、7.2)：只在藏寶圖出現的墨框紙籤；貼了詞卡 → 卡片蓋住原字；
// 寫錯 (無效字) → 字顫動、墨色變淡 0.6 秒 (不閃爍：只降不閃，規格 9.1 光敏)

/** 拉桿方向字 → 顯示字 key (與 mechanics/cube WORD_KEYS 相同；render 只能 import type) */
const WORD_KEYS: Readonly<Record<string, string>> = { up: 'term.word.up', down: 'term.word.down', left: 'term.word.left', right: 'term.word.right' };
const WORD_KEY = (w: string): string => WORD_KEYS[w] ?? WORD_KEYS.up;
/** 詞卡 id `card.<方向字>` → 方向字 (mechanics/labels 的命名慣例) */
const cardWord = (card: string): string | null => /^card\.(\w+)$/.exec(card)?.[1] ?? null;
/** 字謎詞卡的卡面字 key (與 mechanics/labels CARDS 的 glyph 相同；render 只能 import type) */
const GLYPH_KEYS: Readonly<Record<string, string>> = {
  wai: 'term.glyph.wai', nei: 'term.glyph.nei', qian: 'term.glyph.qian', li: 'term.glyph.li', bian: 'term.glyph.bian',
  tai: 'term.glyph.tai', di: 'term.glyph.di', chui: 'term.glyph.chui', fu: 'term.glyph.fu'
};
/** 尺度卡 (N23；mechanics/scale SCALE_GLYPHS 同值；render 只能 import type) */
const SCALE_GLYPH_KEYS: Readonly<Record<string, string>> = { 'card.da': 'term.glyph.da', 'card.xiao': 'term.glyph.xiao' };

/** 物件此刻貼著的尺度卡的卡面字 (沒有方槽 / 沒貼 = '') */
export function scaleGlyph(c: ModelCtx, d: ObjDef): string {
  const l = d.label;
  if (!l?.scale) return '';
  const card = (c.world.ext.labels?.[l.id] ?? []).find(k => k in SCALE_GLYPH_KEYS);
  return card ? c.world.rt.text(SCALE_GLYPH_KEYS[card]) : '';
}

/**
 * 可量物件的縮放倍率 (有效尺寸 / 關卡資料的原尺寸；mechanics/scale 以底部中心改寫 def.w / h / d)：
 * 模型的本體依此縮放 (標籤不跟著縮)
 */
export function scaleRatio(c: ModelCtx): number {
  const base = c.world.level.objects.find(o => o.id === c.obj.def.id);
  return base && base.w > 0 ? c.obj.def.w / base.w : 1;
}

/** 標籤此刻顯示的字與是否被詞卡蓋住 (方向字 = 拉桿原字或詞卡的字；名詞 = textKey) */
export function labelText(c: ModelCtx, d: ObjDef): { text: string; covered: boolean } {
  const l = d.label;
  if (!l) return { text: '', covered: false };
  const cards = c.world.ext.labels?.[l.id] ?? [];
  const w = cards.map(cardWord).find((x): x is string => x !== null);
  if (l.kind === 'dir') {
    const base = d.type === 'lever' ? d.word : 'up';
    return { text: c.world.rt.text(WORD_KEY(w ?? base)), covered: w !== undefined };
  }
  if (l.kind === 'blank') {
    // 字謎空格 (2-2b)：空著 = 「＿」；貼了詞卡 = 卡面的字 (term.glyph.<字>，mechanics/labels 的命名慣例)
    const glyph = c.world.rt.text(w !== undefined && GLYPH_KEYS[w] ? GLYPH_KEYS[w] : 'ui.label.blank');
    // v0.4 第五章 5-2 換讀法 (label.flip；同 mechanics/labels blankTextKey)：這間房在那一面 = 倒讀
    const key = l.flip && faceOfCell(c.world.ext.cube?.at) === l.flip.face ? l.flip.textKey : l.textKey;
    return { text: key ? c.world.rt.text(key, { c: glyph }) : '', covered: w !== undefined };
  }
  if (l.kind === 'strip') return { text: c.world.rt.text((c.obj.used ? l.stripped : undefined) ?? l.textKey ?? ''), covered: false };
  if (l.kind === 'plate') {
    // 門牌 (2-3a)：原字「門」；貼了收的部件卡 = forms 的字 (「間」)
    const form = cards.map(k => l.forms?.[k]).find((k): k is string => k !== undefined);
    return { text: c.world.rt.text(form ?? l.textKey ?? ''), covered: form !== undefined };
  }
  return { text: l.textKey ? c.world.rt.text(l.textKey) : '', covered: false };
}

const SHAKE_SEC = 0.6;

/** 標籤徽章 / 尺度角標往上抬的高度 (label.tagLift；純呈現：相鄰物件的標籤在 2D 錯開，不影響互動) */
export const tagLift = (d: ObjDef): number => d.label?.tagLift ?? 0;

/**
 * 標籤徽章：每種顯示字建一次網格 (之後切換可見性)；at = 相對物件原點的位置。
 * 只在 2D 顯示；寫錯的回饋：玩家附近的標籤在 msg.label.invalid 出現時顫動、墨色變淡
 */
export function labelBadge(p: Painter, d: ObjDef, { pal }: Theme, root: THREE.Group, at: THREE.Vector3, size = 0.55): (c: ModelCtx) => void {
  const scale = !!d.label?.scale;
  const holder = new THREE.Group();
  at = at.clone().setY(at.y + tagLift(d));
  holder.position.copy(at);
  root.add(holder);
  const meshes = new Map<string, THREE.Mesh>();
  let lastSeq = -1;
  let shake = 0;
  const after = d.label?.after;
  return c => {
    // label.after：那個物件 used 之前標籤被蓋住 (不畫)
    holder.visible = c.mode === '2d' && (after === undefined || !!c.world.byId.get(after)?.used);
    if (!holder.visible) return;
    const { text, covered } = labelText(c, d);
    const slot = scaleGlyph(c, d);
    const key = `${text}|${covered}|${slot}`;
    if (!meshes.has(key)) {
      const w = size * (256 / 112);
      const m = p.mesh(new THREE.PlaneGeometry(w, size), 0xffffff, { map: labelTag(pal, text, covered, scale, slot), flatMap: true, outline: false, shadow: false, unique: true });
      m.name = `label:${key}`;
      holder.add(m);
      meshes.set(key, m);
    }
    for (const [k, m] of meshes) m.visible = k === key;
    const w = c.world;
    if (lastSeq >= 0 && w.msgSeq !== lastSeq && (w.msgKey === 'msg.label.invalid' || w.msgKey === d.label?.flip?.wrongText) && Math.abs(w.player.x - c.obj.x) < 2.2) shake = SHAKE_SEC;
    lastSeq = w.msgSeq;
    shake = Math.max(0, shake - c.dt);
    const k = shake / SHAKE_SEC;
    holder.position.x = at.x + Math.sin(shake * 60) * 0.05 * k;
    const cur = meshes.get(key)!.material as THREE.MeshBasicMaterial;
    if (cur.transparent !== k > 0) { cur.transparent = k > 0; cur.needsUpdate = true; }
    cur.opacity = 1 - 0.55 * k;
  };
}

/**
 * 縮放中的物件的「大 / 小」角標 (規格 7.2；只在藏寶圖)：at = 相對物件原點 (每幀可改，跟著有效尺寸走)。
 * 每個字建一次網格、之後只切可見性
 */
export function scaleCorner(p: Painter, d: ObjDef, { pal }: Theme, root: THREE.Group, size = 0.3): (c: ModelCtx, at: THREE.Vector3) => void {
  const lift = tagLift(d);
  const holder = new THREE.Group();
  root.add(holder);
  const meshes = new Map<string, THREE.Mesh>();
  return (c, at) => {
    const glyph = c.mode === '2d' ? scaleGlyph(c, d) : '';
    holder.visible = glyph !== '';
    if (!glyph) return;
    if (!meshes.has(glyph)) {
      const m = p.mesh(new THREE.PlaneGeometry(size, size), 0xffffff, { map: scaleCornerTag(pal, glyph), flatMap: true, outline: false, shadow: false, unique: true });
      m.name = `scale:${glyph}`;
      holder.add(m);
      meshes.set(glyph, m);
    }
    for (const [k, m] of meshes) m.visible = k === glyph;
    holder.position.copy(at);
    holder.position.y += lift;
  };
}
