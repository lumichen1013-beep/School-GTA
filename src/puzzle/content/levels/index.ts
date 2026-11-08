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
import { mezz } from './ch2/H1-mezz';
import { nursery } from './ch3/3-1-nursery';
import { gallery } from './ch3/3-2-gallery';
import { night } from './ch3/3-3-night';
import { depths } from './ch3/3-4-depths';
import { hall } from './ch4/4-1-hall';
import { sky } from './ch5/5-1-sky';
import { eastRoom } from './ch5/5-2-east';
import { westRoom } from './ch5/5-3-west';
import { northRoom } from './ch5/5-4-north';
import { engineRoom } from './ch5/5-5-engine';
import { furnace } from './ch4/4-2-furnace';
import { archive } from './ch4/4-3-archive';
import { drawer } from './ch4/4-4-drawer';

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
  /** v0.4 隱藏房 (H1～H3；規格 6 隱藏房表)：解鎖前不列進選單 (不劇透)；章門通關不順帶記入 (只由房間通關記入) */
  hidden?: boolean;
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
  // H1 夾層：第二章隱藏房 (同一章魔方；從選單進 = 接著第二章存檔玩)；要第三章的比例尺 → 3-1 通關 (能力 scale) 後開放、之前不列出
  { id: 'H1', chapter: 2, titleKey: 'lvl.H1.title', abilities: ['nib'], unlock: { after: ['3-1'] }, hidden: true, load: () => mezz },
  // 3-1 苗圃：第三章第一關 (魔方 3×3 滑動、控制盤 = 園丁羅盤)；第二章章門打開 (2-5 通關) 後開放；前置能力 = 筆尖 (占位版，謎題逐關加入)
  { id: '3-1', chapter: 3, titleKey: 'lvl.3-1.title', abilities: ['nib'], unlock: { after: ['2-5'] }, load: () => nursery },
  // 3-2 玻璃長廊：第三章第二關 (同一章魔方；光路 N26)；3-1 通關後開放 (章內：啟動園丁羅盤、經夜溫室走進長廊即可，不必等 3-1b)
  { id: '3-2', chapter: 3, titleKey: 'lvl.3-2.title', abilities: ['nib'], unlock: { after: ['3-1'] }, load: () => gallery },
  // 3-3 夜溫室：第三章第三關 (中心格；跨房天平、跨房伸出、P4 墨 4)；3-1 通關後開放 (3-3a 需 3-1b)
  { id: '3-3', chapter: 3, titleKey: 'lvl.3-3.title', abilities: ['nib'], unlock: { after: ['3-1'] }, load: () => night },
  // 3-4 溫室深處：第三章第四關 (章末；九格花窗、唯一的「小」、追逐 1、章門 = 第三章通關)；3-3 通關後開放 (3-4a 需 3-1b / 3-2a / 3-3a 的三片玻璃)
  { id: '3-4', chapter: 3, titleKey: 'lvl.3-4.title', abilities: ['nib'], unlock: { after: ['3-3'] }, load: () => depths },
  // 4-1 根窖走廊：第四章第一關 (魔方 3×3×2 層轉、控制盤 = 年輪根盤)；第三章章門打開 (3-4 通關) 後開放；前置能力 = 筆尖 (占位版，謎題逐關加入)
  { id: '4-1', chapter: 4, titleKey: 'lvl.4-1.title', abilities: ['nib'], unlock: { after: ['3-4'] }, load: () => hall },
  // 4-2 墨爐間：第四章第二關 (墨流 P15 首次、光往下、顯影)；4-1 通關後開放 (章內：開場經根井的根梯就到得了)
  { id: '4-2', chapter: 4, titleKey: 'lvl.4-2.title', abilities: ['nib'], unlock: { after: ['4-1'] }, load: () => furnace },
  // 4-3 封存書庫：第四章第三關 (P11 兩層的讀法、兩股墨、驚嚇)；4-2 通關後開放 (章內：4-1a 的梯口或 4-2a 的西門)
  { id: '4-3', chapter: 4, titleKey: 'lvl.4-3.title', abilities: ['nib'], unlock: { after: ['4-2'] }, load: () => archive },
  // 4-4 最後的抽屜：第四章章末 (追逐 2 = P8 首次、墨閘、章門 = 第四章通關)；4-3 通關後開放
  { id: '4-4', chapter: 4, titleKey: 'lvl.4-4.title', abilities: ['nib'], unlock: { after: ['4-3'] }, load: () => drawer },
  // 5-1 天窗間：第五章第一關 (魔方 3×3×3 切片轉、控制盤 = 觀星儀)；第四章章門打開 (4-4 通關) 後開放；能力 = 筆尖 + 比例尺 (第五章要「小」；占位版，謎題逐關加入)
  { id: '5-1', chapter: 5, titleKey: 'lvl.5-1.title', abilities: ['nib', 'scale'], unlock: { after: ['4-4'] }, load: () => sky },
  // 5-2 東窗：第五章三扇窗之一 (P18 / P1 倒過來的詩；完成 = 窗框 SE 鬆開)；5-1 通關後開放 (三扇窗任意順序)
  { id: '5-2', chapter: 5, titleKey: 'lvl.5-2.title', abilities: ['nib', 'scale'], unlock: { after: ['5-1'] }, load: () => eastRoom },
  // 5-3 西窗：第五章三扇窗之一 (P13 / P1 爸爸的墨 + 許問津的紙；完成 = 窗框 SW 鬆開)；5-1 通關後開放 (三扇窗任意順序)
  { id: '5-3', chapter: 5, titleKey: 'lvl.5-3.title', abilities: ['nib', 'scale'], unlock: { after: ['5-1'] }, load: () => westRoom },
  // 5-4 北窗：第五章三扇窗之一 (P17 / P1 吊秤：秤繩從地板垂下去，秤的是那一整間房；完成 = 窗框 SN 鬆開)；5-1 通關後開放 (三扇窗任意順序)
  { id: '5-4', chapter: 5, titleKey: 'lvl.5-4.title', abilities: ['nib', 'scale'], unlock: { after: ['5-1'] }, load: () => northRoom },
  // 5-5 最後的機關：第五章 Boss 三階段 (5-5a 地板被重畫 / 5-5b 殘影守門 / 5-5c 收束)；三扇窗都通關後開放 (星釘門 = ch5.windows)
  { id: '5-5', chapter: 5, titleKey: 'lvl.5-5.title', abilities: ['nib', 'scale'], unlock: { after: ['5-2', '5-3', '5-4'] }, load: () => engineRoom }
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
