import type { AbilityId, LevelDef } from '../../core/types';
import { porch } from './ch1/1-1-porch';
import { foyer } from './ch1/1-2-foyer';
import { closet } from './ch1/closet';
import { protoA } from './proto/dial';
import { shelf } from './ch2/2-1-shelf';
import { reading } from './ch2/2-2-reading';
import { print } from './ch2/2-3-print';
import { manuscripts } from './ch2/2-4-manuscripts';
import { deep } from './ch2/2-5-deep';
import { nursery } from './ch3/3-1-nursery';
import { gallery } from './ch3/3-2-gallery';
import { night } from './ch3/3-3-night';

/** 線性解鎖：after 中的關卡全部通關才開放 (規格 8；5-5 = after ['5-2','5-3','5-4']) */
export interface Unlock { after: readonly string[] }

/** 關卡登錄表的一筆 (id 用規格編號) */
export interface LevelEntry {
  id: string;
  chapter: number;
  titleKey: string;
  /** 本關開場允許的能力白名單 (重玩規則：防新能力破解舊關) */
  abilities: readonly AbilityId[];
  unlock: Unlock;
  load(): LevelDef;
}

/**
 * 已實作的關卡 (順序 = 選單順序)。
 * 1-1 門廊：第一關 (規格 6「1-1 門廊」)，無前置、無能力。
 * 1-2 玄關：現有關卡 (規格 6「1-2 玄關 (levels/foyer.ts)」、8 節遷移「舊玄關即新 1-2」)，前置 1-1
 * (已通關 1-2 或之後關卡的存檔不被擋，見 meta/progress isUnlocked)。
 */
export const LEVELS: readonly LevelEntry[] = [
  { id: '1-1', chapter: 1, titleKey: 'lvl.1-1.title', abilities: [], unlock: { after: [] }, load: () => porch },
  { id: '1-2', chapter: 1, titleKey: 'lvl.1-2.title', abilities: [], unlock: { after: ['1-1'] }, load: () => foyer },
  // 1-3 衣帽間：同一章魔方 (從選單進 = 接著第一章存檔玩)；前置 1-2
  { id: '1-3', chapter: 1, titleKey: 'lvl.1-3.title', abilities: [], unlock: { after: ['1-2'] }, load: () => closet },
  // 2-1 書架迴廊：第二章第一關 (魔方 2×3、控制盤)；第一章章門打開 (1-3 通關) 後開放；前置能力 = 筆尖
  { id: '2-1', chapter: 2, titleKey: 'lvl.2-1.title', abilities: ['nib'], unlock: { after: ['1-3'] }, load: () => shelf },
  // 2-2 閱覽室：第二章第二關 (同一章魔方；從選單進 = 接著第二章存檔玩)；2-1 通關後開放 (章內開場就走得到，選單照線性解鎖)
  { id: '2-2', chapter: 2, titleKey: 'lvl.2-2.title', abilities: ['nib'], unlock: { after: ['2-1'] }, load: () => reading },
  // 2-3 印房：第二章第三關 (同一章魔方)；2-2 通關後開放 (章內：上列轉一次就接得上)
  { id: '2-3', chapter: 2, titleKey: 'lvl.2-3.title', abilities: ['nib'], unlock: { after: ['2-2'] }, load: () => print },
  // 2-4 手稿庫：第二章第四關；2-3 通關後開放 (章內：開場就從閱覽室南門走得到)
  { id: '2-4', chapter: 2, titleKey: 'lvl.2-4.title', abilities: ['nib'], unlock: { after: ['2-3'] }, load: () => manuscripts },
  // 2-5 書房深處：第二章章末；2-4 通關後開放；章門打開 = 第二章通關
  { id: '2-5', chapter: 2, titleKey: 'lvl.2-5.title', abilities: ['nib'], unlock: { after: ['2-4'] }, load: () => deep },
  // 3-1 苗圃：第三章第一關 (魔方 3×3 滑動、控制盤 = 園丁羅盤)；第二章章門打開 (2-5 通關) 後開放；前置能力 = 筆尖 (占位版，謎題逐關加入)
  { id: '3-1', chapter: 3, titleKey: 'lvl.3-1.title', abilities: ['nib'], unlock: { after: ['2-5'] }, load: () => nursery },
  // 3-2 玻璃長廊：第三章第二關 (同一章魔方；光路 N26)；3-1 通關後開放 (章內：啟動園丁羅盤、經夜溫室走進長廊即可，不必等 3-1b)
  { id: '3-2', chapter: 3, titleKey: 'lvl.3-2.title', abilities: ['nib'], unlock: { after: ['3-1'] }, load: () => gallery },
  // 3-3 夜溫室：第三章第三關 (中心格；跨房天平、跨房伸出、P4 墨 4)；3-1 通關後開放 (3-3a 需 3-1b)
  { id: '3-3', chapter: 3, titleKey: 'lvl.3-3.title', abilities: ['nib'], unlock: { after: ['3-1'] }, load: () => night }
];

export const levelById = (id: string): LevelEntry | undefined => LEVELS.find(e => e.id === id);

/**
 * 【原型占位，不計入正式 22 關】開發入口的關卡 (選單只在網址帶 ?dev=1 時列出「開發：控制盤原型」)：
 * M-Dial 控制盤原型 (2×3 測試魔方，從甲室進；chapter 90 = 不屬於任何正式章節)
 */
export const PROTO_LEVELS: readonly LevelEntry[] = [
  { id: 'dev-dial', chapter: 90, titleKey: 'lvl.proto.title', abilities: [], unlock: { after: [] }, load: () => protoA }
];
export const protoLevelById = (id: string): LevelEntry | undefined => PROTO_LEVELS.find(e => e.id === id);
