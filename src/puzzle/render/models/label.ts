import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import type { Theme } from '../themes';
import { labelTag } from '../textures';
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
  wai: 'term.glyph.wai', nei: 'term.glyph.nei', qian: 'term.glyph.qian', li: 'term.glyph.li', bian: 'term.glyph.bian'
};

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
    return { text: l.textKey ? c.world.rt.text(l.textKey, { c: glyph }) : '', covered: w !== undefined };
  }
  if (l.kind === 'plate') {
    // 門牌 (2-3a)：原字「門」；貼了收的部件卡 = forms 的字 (「間」)
    const form = cards.map(k => l.forms?.[k]).find((k): k is string => k !== undefined);
    return { text: c.world.rt.text(form ?? l.textKey ?? ''), covered: form !== undefined };
  }
  return { text: l.textKey ? c.world.rt.text(l.textKey) : '', covered: false };
}

const SHAKE_SEC = 0.6;

/**
 * 標籤徽章：每種顯示字建一次網格 (之後切換可見性)；at = 相對物件原點的位置。
 * 只在 2D 顯示；寫錯的回饋：玩家附近的標籤在 msg.label.invalid 出現時顫動、墨色變淡
 */
export function labelBadge(p: Painter, d: ObjDef, { pal }: Theme, root: THREE.Group, at: THREE.Vector3, size = 0.55): (c: ModelCtx) => void {
  const scale = !!d.label?.scale;
  const holder = new THREE.Group();
  holder.position.copy(at);
  root.add(holder);
  const meshes = new Map<string, THREE.Mesh>();
  let lastSeq = -1;
  let shake = 0;
  return c => {
    holder.visible = c.mode === '2d';
    if (!holder.visible) return;
    const { text, covered } = labelText(c, d);
    const key = `${text}|${covered}`;
    if (!meshes.has(key)) {
      const w = size * (256 / 112);
      const m = p.mesh(new THREE.PlaneGeometry(w, size), 0xffffff, { map: labelTag(pal, text, covered, scale), flatMap: true, outline: false, shadow: false, unique: true });
      m.name = `label:${key}`;
      holder.add(m);
      meshes.set(key, m);
    }
    for (const [k, m] of meshes) m.visible = k === key;
    const w = c.world;
    if (lastSeq >= 0 && w.msgSeq !== lastSeq && w.msgKey === 'msg.label.invalid' && Math.abs(w.player.x - c.obj.x) < 2.2) shake = SHAKE_SEC;
    lastSeq = w.msgSeq;
    shake = Math.max(0, shake - c.dt);
    const k = shake / SHAKE_SEC;
    holder.position.x = at.x + Math.sin(shake * 60) * 0.05 * k;
    const cur = meshes.get(key)!.material as THREE.MeshBasicMaterial;
    if (cur.transparent !== k > 0) { cur.transparent = k > 0; cur.needsUpdate = true; }
    cur.opacity = 1 - 0.55 * k;
  };
}
