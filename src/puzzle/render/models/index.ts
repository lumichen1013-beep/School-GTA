import * as THREE from 'three';
import type { ObjDef } from '../../core/types';
import type { Painter } from '../materials';
import { NibKeyModel } from './key';
import { crateModel, noteModel, plinthModel, railModel, shelfModel, tableModel } from './props';
import { doorModel, gateModel, plateModel, valveModel, wallModel } from './devices';
import { floorModel } from './room';
import { cubeDoorModel, leverModel } from './cube';
import { cordModel, drawerModel, portraitModel } from './sequence';
import { coatRackModel, hookModel } from './closet';
import { dialModel, latchModel } from './dial';
import { bayShelfModel, bookendModel, bookLockModel, lampBookModel, lampLockModel, libraryStepModel, lowShelfModel, remarkModel, scrapModel, spineModel } from './shelf';
import { cardCatalogModel, coupletCabinetModel, coupletModel, inkveilModel, lecternModel, lensModel, openBookModel, readingTableModel, smallPrintModel } from './reading';
import { doorPlateModel, pressModel, typeCaseModel, typeLockModel, typeTrayModel, typeWheelModel } from './print';
import { bundleModel, bundleRackModel, patternCabinetModel, smallCabinetModel } from './manuscripts';
import { diaryStandModel, keyBenchModel, landingModel } from './deep';
import { balanceModel, paneModel, potModel, pottingShelfModel, rootModel, rulerModel, trellisModel } from './nursery';
import { sensorModel } from './light';
import { balanceHalfModel, bigPotModel, ledgeModel, pageModel, protrudeStepModel } from './night';
import { chaseGateModel, giantRootModel, latticeBoxModel, latticeModel, oldCompassModel, paneFrameModel } from './depths';
import { barsModel, glassModel, inkwallModel, plankModel, stoneModel } from './porch';
import { chaserModel } from './chaser';
import type { PropModel } from './types';
import type { Theme } from '../themes';

/** 物件類型 → 模型工廠：同一份物件資料產生 3D / 2D 兩種外觀 (Painter 每個網格兩套材質) */
export type ModelFactory = (paint: Painter, def: ObjDef, theme: Theme) => PropModel;

/** 筆尖鑰匙：旋轉漂浮 + 微光 (類別模型包成工廠) */
export const keyModel: ModelFactory = (p, _d, theme) => {
  const key = new NibKeyModel(p, theme.pal);
  return { root: key.root, update: c => key.update(c.t, c.mode === '2d') };
};

/**
 * 模型登錄表 (architecture 4.5)：新增物件類型 = 新增模型檔 + 這裡加一行。
 * 鍵為 ObjDef.type (字串，機制以 declaration merging 擴充的類型也適用)
 */
export const MODELS: Readonly<Partial<Record<string, ModelFactory>>> = {
  floor: floorModel, shelf: shelfModel, crate: crateModel, plinth: plinthModel, rail: railModel, table: tableModel,
  note: noteModel, wall: wallModel, gate: gateModel, door: doorModel, valve: valveModel, plate: plateModel, key: keyModel,
  bars: barsModel, inkwall: inkwallModel, glass: glassModel, plank: plankModel, stone: stoneModel,
  cubeDoor: cubeDoorModel, lever: leverModel,
  portrait: portraitModel, cord: cordModel, drawer: drawerModel,
  coatRack: coatRackModel, hook: hookModel,
  dial: dialModel, latch: latchModel,
  bayShelf: bayShelfModel, lowShelf: lowShelfModel, libraryStep: libraryStepModel, spine: spineModel, bookLock: bookLockModel, remark: remarkModel,
  lampBook: lampBookModel, lampLock: lampLockModel, bookend: bookendModel, scrap: scrapModel,
  lectern: lecternModel, openBook: openBookModel, inkveil: inkveilModel, readingTable: readingTableModel, smallPrint: smallPrintModel,
  coupletCabinet: coupletCabinetModel, couplet: coupletModel, cardCatalog: cardCatalogModel, lens: lensModel,
  typeCase: typeCaseModel, press: pressModel, typeTray: typeTrayModel, doorPlate: doorPlateModel, typeLock: typeLockModel, typeWheel: typeWheelModel,
  patternCabinet: patternCabinetModel, smallCabinet: smallCabinetModel, bundleRack: bundleRackModel, bundle: bundleModel,
  landing: landingModel, keyBench: keyBenchModel, diaryStand: diaryStandModel,
  // 3-1 苗圃
  balance: balanceModel, pot: potModel, trellis: trellisModel, pottingShelf: pottingShelfModel, root: rootModel, ruler: rulerModel, pane: paneModel,
  // 3-2 玻璃長廊：感光花 (光路 N26)
  sensor: sensorModel,
  // 3-3 夜溫室：半座天平、巨盆 (含手印)、伸過來的那一截陶槽、溫室深處的高台與筆記一頁 (陶盆的 shape 在 potModel)
  balanceHalf: balanceHalfModel, bigPot: bigPotModel, protrudeStep: protrudeStepModel, ledge: ledgeModel, page: pageModel,
  // 3-4 溫室深處：九格花窗、花窗架、抽屜裡的鑰匙與手記、巨根、舊羅盤架、長廊柵門 (苔窗 = sensorModel 的 mount 'wall')
  lattice: latticeModel, paneFrame: paneFrameModel, latticeBox: latticeBoxModel, giantRoot: giantRootModel, oldCompass: oldCompassModel, chaseGate: chaseGateModel,
  // 追逐 1：守衛殘影 (只在藏寶圖)
  chaser: chaserModel
};

/** 未登錄類型的後備外觀：洋紅盒 (開發期一眼看出缺模型，不會隱形) */
export const boxModel: ModelFactory = (p, d) => {
  const g = new THREE.Group();
  const m = p.mesh(new THREE.BoxGeometry(d.w, d.h, d.d), 0xff00ff);
  m.position.y = d.h / 2;
  g.add(m);
  return { root: g };
};

/** 依類型取模型工廠 (找不到 → boxModel) */
export const modelFor = (type: string): ModelFactory => MODELS[type] ?? boxModel;
