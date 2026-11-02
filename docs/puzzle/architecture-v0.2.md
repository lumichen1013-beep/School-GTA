# 《圖紙之間》程式架構設計 v0.2

> **修訂紀錄**
> | 版本 | 日期 | 內容 |
> |------|------|------|
> | v0.1 | 2026-11-02 | 初版架構（commit `97bc79c`） |
> | v0.2 | 2026-11-02 | 第 9 節 Q1～Q5 全部確認（照建議）；提示系統改為三級全抽象 + L4 解法筆記 + 提示驗證器（規格 7.1、7.1.1、7.1.2）；`HintDef` / `PuzzleDef` / `Settings` 格式更新；謎題 id `1-2a`～`1-2d`、`5-5a`～`5-5c` |

> 狀態：草案（2026-11-02），對應 `game-spec-v0.2.md`（下稱「規格」）與 `story-bible-v0.1.md`（下稱「劇情」）。基準程式為 commit `52635aa` 的 `src/puzzle/`（20 檔、約 2.3k 行）與 `tests/puzzle/`（36 個測試；全專案 `vitest run` 共 584 個測試）。
> 範圍：只寫架構，不改任何程式碼。標記：**〔規格 X〕** = 依據規格章節或 N 編號；**〔碼 file:line〕** = 依據現有程式；**〔推論〕** = 我的判斷，未經實作驗證。
> 總原則：**每個抽象都對應一個已知需求**；對應不到的一律不做（見第 8 節）。

---

## 1. 現況盤點與痛點

### 1.1 模組圖與依賴方向（現況）

```
puzzle.html ── main.ts ── game.ts ─┬─ levels/foyer.ts ──(type)──┐
                                   ├─ logic/* (純函式，無 three) ◄┘
                                   ├─ input.ts  (DOM keydown)
                                   ├─ hud.ts    (DOM，import logic/types)
                                   └─ render/scene.ts ─┬─ render/models/* ─ materials/palette/textures
                                                       └─ logic/geometry (activeIn)、logic/types
logic 內部：step → push, mechanisms, world, geometry；switchMode → place, geometry, world；interact → geometry, world
```

- 好的部分（保留）：`logic/` 完全不 import three，測試在 Node 下以合成輸入跑完整通關〔碼 tests/puzzle/foyerSolution.test.ts:81〕；`Painter` 一個網格兩套材質，切換視角不重建場景〔碼 render/materials.ts:35-107〕；關卡已資料化為 `LevelDef`〔碼 logic/types.ts:34〕。
- 依賴方向單純（logic ← render/hud/game），但 **game.ts 是所有東西的交會點**，且 logic 只有「移動」走 `stepWorld`，切換 / 互動 / 歸位由 game.ts 直接呼叫〔碼 game.ts:103-106〕。

### 1.2 寫死之處（逐項標位置）

| # | 位置 | 現況 | 問題 |
|---|------|------|------|
| H1 | `logic/interact.ts:50-68` | `switch (t.def.type)` 處理 note/key/gate/valve/door | 新物件類型必改核心；鑰匙鏈寫死（規格 C8） |
| H2 | `logic/types.ts:67-68`、`world.ts:10`、`interact.ts:53,59,63` | `World.hasKey`、`World.sealed` 全域單一旗標 | 無法多鑰匙 / 墨滴 / 章印（N9）；門的狀態不在門身上 |
| H3 | `logic/types.ts:4-6` | `ObjType` 封閉聯集 | 新類型要改核心型別；render `BUILDERS` 也綁同一聯集〔碼 render/scene.ts:15〕 |
| H4 | `logic/types.ts:10-30` | `ObjDef` 混雜通用欄位與類型專屬欄位（`text` 只給 note、`opens` 只給 plate） | 每加一機制就往同一介面塞欄位 |
| H5 | `logic/mechanisms.ts:20` | 壓板只看 `pushable && !gone`，**不看木箱在當前視角是否存在**；只認「有沒有」不計數 | 擋 N14、N2、N5（heavy 進紙）、N8（剖面計數） |
| H6 | `logic/mechanisms.ts:21-24` | 壓下即 `used=true` 永久鎖定，直接把單一閘門 `used=true` | 擋 N4 非鎖定、N10 一對多、N13 反向 |
| H7 | `geometry.ts:4,35`；`interact.ts:11,45`；`mechanisms.ts:17`；`switchMode.ts:24,39`；`render/scene.ts:142` | 共 7 處直接讀 `activeIn(o.def.visible, mode)` | 可見性是靜態欄位；N5 定稿印要「有效可見性」，得同時改 7 處 |
| H8 | `geometry.ts:31` | `isOpenGate` 在幾何核心判斷 `type === 'gate'` | 機制知識漏進核心；N10 墨橋「開啟 = 出現」無處表達 |
| H9 | `geometry.ts:18,42`；`interact.ts:20`；`step.ts:33,39,42,53`；`place.ts:8,38-40`；`switchMode.ts:12`；`cameras.ts:43,60` | `mode === '2d' ? … : …` 散落 | 每個規則分歧點都要重找一遍 |
| H10 | `switchMode.ts:13 → 16` | 先算 `solidsFor('2d')` 才記錄 `z3d` | N8 剖面需要「進紙深度」先確定，順序要反過來 |
| H11 | `step.ts:55` | `updatePlates(w)` 寫死在步進；沒有掛點 | N6 影子要每步推導、N4/N13 連動要在同一處更新 |
| H12 | `game.ts:3,23,75` | 直接 `import { foyer }` | 單關寫死（規格 C16） |
| H13 | `game.ts:107` | `localStorage.setItem('puzzle:foyer:cleared','1')` 直接寫 | 無 schema、無注入、無遷移（規格 8） |
| H14 | `game.ts:88,103-105`；`input.ts:23-26` | `KeyR/KeyF/KeyQ/KeyT/KeyE`、WASD 寫死 | 規格 7.2「全按鍵可重綁」、觸控 / 手把無處接 |
| H15 | `game.ts:17,19-20,121` | `VERBS` 中文字串、過場漸層、提示組字 | 文案與過場寫死在主迴圈；7.2「減少動態」要換過場 |
| H16 | `hud.ts:33,44`、`hud.ts:6-14` | 「現實 / 圖紙」「筆尖」、單一 `KEY_ICON`、`setInventory(boolean)` | 劇情 4 節改名（完成版 / 設計稿 / 畫筆工具）；多物品無法顯示 |
| H17 | `puzzle.html:13-28` | 模式文字、操作說明、「玄關 · 通關」寫在 HTML | 同上；重綁後說明會不一致 |
| H18 | `levels/foyer.ts:9-56`；`interact.ts:6-7,47,58-65`；`mechanisms.ts:6-8`；`step.ts:8`；`constants.ts:11` | 所有玩家可見文字是程式字面值 | 劇情 4 節列了 12 項「需改程式碼」，未來多語系無從下手 |
| H19 | `render/scene.ts:63,70-81` | 場景只在建構時依 `world.objs` 建模型；`key` 特例 | N6 影子、N7 定稿影子、N16 墨記是**執行期才出現**的物件，無法顯示 |
| H20 | `render/models/devices.ts:144` | 門模型讀 `c.world.sealed` | 渲染依賴全域旗標（H2 的連帶） |
| H21 | `render/models/room.ts:150-160,128-147` | 掛畫 / 吊燈 / 地毯座標為玄關專屬常數 | 每關都會長出玄關的裝飾；章節主題（書房 / 溫室…）無處設定 |
| H22 | `render/palette.ts:2-32` | 單一 `PAL` 常數 | 規格 7.2 色盲三組墨水色 |
| H23 | `logic/types.ts:60-73` | `World` 含 `Map`、`def` 參照，無快照 | 無法做「回到本謎題開始」（規格 7.2）、Boss 階段檢查點（規格 8）、捷徑掃描分支 |

### 1.3 N1～N18 會卡在哪裡

| 機制 | 卡點（對應 1.2） | 說明 |
|------|-----------------|------|
| N1 投影疊合 | 無 | C2 的推論，現況即成立 |
| N2 計重壓板 | H5 | 只判「有沒有」，要改成計數 |
| N3 現實壓板 | H5、H9 | 3D 壓板要看 x、z 投影並算玩家；現況只寫了 2D 判法 |
| N4 非鎖定壓板 | H6、H11 | 鎖定寫死；閘門關閉遇重疊要延後（規格 N4 風險欄）無處放 |
| N5 定稿印 | H7、H10、H19 | 7 處讀靜態可見性；新按鍵 G 要改 game.ts |
| N6 燈影 | H11、H19 | 影子是每步推導的實體，核心沒有「推導物件」概念；渲染不能動態加模型 |
| N7 定稿影子 | N5＋N6 的卡點 | 還要「推導物件被定稿 → 變成實體」的轉換 |
| N8 剖面尺 | H7、H10、H5 | 存在條件要多一層；切換順序；壓板要依剖面計數 |
| N9 通用鑰匙 | H1、H2、H16、H20 | 正是 M0 指名的重構〔規格 10 M0〕 |
| N10 墨水閥連動 | H6、H8 | 閥只能解 `sealed`；「開啟 = 出現」無處表達 |
| N13 反向連動 | H6 | 無連結資料結構 |
| N14 3D 專屬可推物 | H5 | 正好是 H5 的隱性行為 |
| N15 燈車 | N6 卡點 | 影子依燈位置重算；推燈本身走 C5 推箱即可 |
| N16 墨記 | H14、H23 | 新按鍵 V；區域資料（Q-C）無欄位；落點驗證可重用 `place.ts` |
| N11、N12、N17、N18 | — | 規格標為不做 / 不排入 / 不採用，本架構不為它們預留任何東西 |

---

## 2. 目標架構總覽

### 2.1 分層

| 層 | 資料夾 | 職責（一句話） | 可 import |
|----|--------|---------------|-----------|
| L0 核心模擬 | `core/` | 世界狀態、幾何、步進、切換、推箱、互動分派、機制掛點、快照；確定性、無 I/O | 只有 `core/` |
| L1 機制 | `mechanics/` | 每檔一個機制（壓板、連動、物品、定稿、燈影、剖面、墨記…），經掛點插入核心 | `core/`；其他 mechanics（須無環，見 4.2） |
| L2 內容 | `content/` | 關卡、章節、物品表、提示、文字表（純資料） | `core/`、`mechanics/` 的**型別**（`import type`） |
| L2' 文字 | `text/` | `t(key, params)`、插值、詞彙表解析（純函式） | 無 |
| L3 外圍規則 | `meta/` | 存檔 / 遷移、設定、統計、解鎖、提示策略（純函式＋注入 storage） | `core/`、`content/`、`text/` |
| L4 呈現 | `render/`、`ui/`、`input/` | three 場景、DOM HUD / 選單、輸入來源 | `render`→`core`；`ui`→`text`；`input`→`core`（型別） |
| L5 外殼 | `app/` | 主迴圈、畫面狀態機、把上述接起來 | 全部 |
| 工具 | `devtools/` | 關卡驗證器、腳本回放、捷徑掃描（純函式，測試與開發用） | `core`、`mechanics`、`content`、`meta`、`text` |

### 2.2 依賴矩陣（列 = 匯入方，欄 = 被匯入方；✓ 可、T 僅 `import type`、✗ 禁止）

| 匯入方 \ 被匯入 | core | mechanics | content | text | meta | render | ui | input | app | devtools | three | DOM API |
|----|----|----|----|----|----|----|----|----|----|----|----|----|
| core | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| mechanics | ✓ | ✓(無環) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| content | T | T | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| text | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| meta | ✓ | T | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| devtools | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ |
| render | ✓ | T | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| ui | T | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| input | T | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ |
| app | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓(僅 DEV) | ✓ | ✓ |

另：`src/puzzle/**` 不得 import `src/puzzle` 以外的專案檔（GTA 隔離）；`src/**` 其餘檔案不得 import `src/puzzle/**`。`render` 讀 `core` 只用查詢函式（`isActiveIn`、`allObjs`），不得呼叫會改狀態的函式（4.7 規則，測試以白名單檢查）。

### 2.3 可自動檢查的依賴規則（測試設計，不實作）

`tests/puzzle/architecture.test.ts`：
1. 以 `fs` 遞迴列出 `src/puzzle/**/*.ts`，用正規式擷取 `import … from '…'`、`import('…')`、`export … from '…'`，並記錄是否為 `import type`。
2. 依路徑第一段決定層（`core/…` → core；根目錄 `main.ts` 視為 app）。相對路徑解析成目標檔再判層；裸模組只允許 `three`（且只在 render / app）。
3. 對照 2.2 矩陣，違規列出 `檔案 → 目標（層）`，非空即失敗。
4. 額外字串規則：`core/`、`mechanics/`、`content/`、`meta/`、`text/`、`devtools/` 內不得出現 `document.`、`window.`、`localStorage`、`performance.now`、`Date.now`、`Math.random`（確定性與 Node 可跑）。
5. `mechanics/` 內部 import 圖做 DFS，有環即失敗。
6. 反向隔離：掃 `src/**/*.ts`（排除 `src/puzzle`），不得出現指向 `puzzle/` 的 import；掃 `src/puzzle` 不得出現 `../main`、`../game/` 等跳出 puzzle 的路徑。
7. render 對 core 的值匯入名稱必須在白名單（`isActiveIn`、`allObjs`、`objBox`、型別）內。

---

## 3. 目錄結構

```
src/puzzle/
  main.ts                    入口（puzzle.html 指向此檔，保留路徑）：建立 App
  core/                      L0 純模擬
    types.ts                 Mode、Visibility、ObjBase、ObjKinds、ObjDef、ObjState、Player、World、LevelDef
    constants.ts             物理常數（無文字）
    modes.ts                 ModeSpec（2d/3d 差異集中處）
    geometry.ts              Box、overlaps、sweepAxis、supportsAt（讀 ModeSpec.axes）
    presence.ts              isActiveIn、effectiveVisibility、solidsFor、allObjs（掛點匯流處）
    place.ts                 inBounds、nearestFree、hits、resolvePlayerOverlap
    push.ts                  pushCrate、resetCrates（C5、C12）
    switchMode.ts            trySwitchMode（C10、C11），落點掛 canLand
    interact.ts              findTarget、interact 分派（通用 requires/grants/opens → 類型 handler）
    step.ts                  step(world, frame, dt)、stepWorld 相容包裝
    world.ts                 createWorld、say、emit、respawn、updateCheckpoint、flags
    registry.ts              Mechanic / ObjTypeSpec 介面、compileMechanics（衝突檢查）
    snapshot.ts              snapshot / restore（JSON）
    actions.ts               WorldAction、ActionFrame、ACTION_ORDER
  mechanics/                 L1 每檔一機制
    index.ts                 DEFAULT_MECHANICS（註冊順序即執行順序）
    basics.ts                floor/wall/rail/table/plinth/shelf/crate 類型宣告（無行為）
    items.ts                 C8/N9：物品、requires/grants、key/pickup/inklock 類型
    links.ts                 C7/N10/N13：opens 連結、gate/inkwall/inkbridge、延後關閉
    plates.ts                C6/N2/N3/N4/N14：壓板計重
    notes.ts                 C14：便利貼
    exit.ts                  出口門 → cleared
    pin.ts                   N5（N7 的定稿入口）
    light.ts                 N6/N7/N15：燈、caster、影子推導與定稿
    section.ts               N8：剖面
    mark.ts                  N16：墨記、區域限制
  content/                   L2 純資料
    items.ts                 ITEMS 物品表（nib/inkdrop/seal/diary/scrap）
    chapters.ts              CHAPTERS（章、主題 id、旁白 key）
    levels/index.ts          LEVELS 登錄表（id、章、解鎖、def）
    levels/ch1/1-2-foyer.ts  現有玄關（export 名仍為 foyer）
    levels/ch1/…、ch2/…      各關一檔（22 + 3）
    text/zh-Hant/index.ts    zh-Hant 文字表（ui / msg / obj / lvl / hint / story / term 分檔）
  text/                      L2' 文字系統
    text.ts                  createText(bundle, fallback)、插值、[[term.*]] 解析
  meta/                      L3 外圍規則
    storage.ts               KeyValueStorage 介面、memoryStorage
    save.ts                  SaveV2、loadSave / writeSave、遷移鏈
    settings.ts              Settings、預設值、校正
    stats.ts                 puzzle:stats
    progress.ts              解鎖規則、能力計算
    hints.ts                 HintStrategy（timed/always/off）、卡關偵測
  input/                     L4 輸入
    types.ts                 InputSource、Bindings、ShellAction
    bindings.ts              DEFAULT_BINDINGS、重綁合併
    keyboard.ts              KeyboardSource（取代 input.ts）
  render/                    L4 three
    scene.ts                 PuzzleScene：依 allObjs 對帳（新增 / 移除 / 更新）
    cameras.ts               沿用
    materials.ts             Painter 沿用（2D/3D 雙材質）
    textures.ts              沿用
    transitions.ts           Transition 介面：inkFade、plainFade（減少動態）
    markers.ts               P4 形狀符號裝飾（2D 專屬墨點、3D 專屬框、印框、剖面斜線）
    themes/index.ts          Theme 登錄表；palette.ts 拆成 base + ink 三組
    models/index.ts          MODELS 登錄表（type → ModelFactory）、fallback 盒模型
    models/*.ts              沿用 props/devices/key/player/room；新類型一檔
    decor/index.ts           DecorKind → 建構函式（掛畫、吊燈、地毯…由關卡資料擺放）
    debug.ts                 DEV：碰撞盒線框（可選）
  ui/                        L4 DOM
    hud.ts                   依 HudModel 繪製（模式、物品列、提示、吐司）
    icons.ts                 物品 id → SVG
    screens/*.ts             nickname、menu、clear、ending、journal（日誌 / 元謎題）
    hintPanel.ts             小格提示面板
    puzzle.css               沿用
  app/                       L5 外殼
    app.ts                   畫面狀態機
    loop.ts                  主迴圈（固定步長）、過場鎖
    hudModel.ts              deriveHud(world, text, …) 純函式
    services.ts              組裝 storage/save/settings/text/theme
  devtools/                  工具（純）
    validateLevel.ts         schema 與內容規則
    script.ts                通關腳本 → ActionFrame 序列（取代 tests helpers 的控制器）
    shortcutScan.ts          捷徑掃描器
tests/puzzle/
  architecture.test.ts、core/*、mechanics/*、levels/<id>.test.ts（通關＋反例）、meta/*、content.test.ts（全關驗證）
```

### 3.1 遷移對照表

| 現有檔案 | 目標 | 備註 |
|---------|------|------|
| `logic/types.ts` | `core/types.ts` | `ObjType` 改開放式 `ObjKinds`；`hasKey/sealed` 移除（改 `inv` 與門的 `used`） |
| `logic/constants.ts` | `core/constants.ts` | `MSG_SQUEEZE` → 文字 key `msg.squeeze` |
| `logic/geometry.ts` | `core/geometry.ts` + `core/presence.ts` | `solidsFor`/`activeIn` 移至 presence；`isOpenGate` → `mechanics/links.ts` 的 `passable` |
| `logic/world.ts` | `core/world.ts` | `say` 改收 key |
| `logic/place.ts`、`push.ts`、`switchMode.ts`、`step.ts` | `core/` 同名 | `resetCrates` 從 mechanisms 移入 `core/push.ts` |
| `logic/interact.ts` | `core/interact.ts` + `mechanics/{items,notes,exit,links}.ts` | switch 拆成類型 handler |
| `logic/mechanisms.ts` | `mechanics/plates.ts` | |
| `levels/foyer.ts` | `content/levels/ch1/1-2-foyer.ts` + `content/text/zh-Hant/lvl-1-2.ts` | 字面值換 key，字串原樣搬 |
| `game.ts` | `app/app.ts`、`app/loop.ts`、`app/hudModel.ts`、`render/transitions.ts` | |
| `hud.ts` | `ui/hud.ts`、`ui/icons.ts` | |
| `input.ts` | `input/keyboard.ts`、`input/bindings.ts` | |
| `puzzle.css` | `ui/puzzle.css` | |
| `render/palette.ts` | `render/themes/` | `PAL` 保留為預設主題 |
| `render/models/room.ts` `buildDecor` | `render/decor/` + `LevelDef.decor` | 玄關座標搬進關卡資料 |
| `render/scene.ts` `BUILDERS` | `render/models/index.ts` | |
| `main.ts` | 保留 | `puzzle.html` 不必改 script 路徑 |

---

## 4. 核心介面

### 4.1 世界狀態、步進、快照（`core/types.ts`、`core/step.ts`、`core/snapshot.ts`）

```ts
export type Mode = '3d' | '2d';
export type Visibility = 'both' | '2d' | '3d';
export type ObjId = string;
export type ItemId = string;                         // 'nib' | 'inkdrop' | 'seal' | 'diary:1' | 'scrap:4' …（content/items.ts 定義）
export type AbilityId = 'nib' | 'pin' | 'section' | 'mark';   // 規格 8 save.abilities
export type TextKey = string;
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface Player { x: number; y: number; z: number; vy: number; onGround: boolean; mode: Mode; z3d: number; facing: number }

/** 機制可擴充的世界狀態（各 mechanics 檔以 declaration merging 加欄位；值必須可 JSON 序列化） */
export interface WorldExt {}

export interface World {
  level: LevelDef;
  objs: ObjState[];                 // 關卡物件 + 執行期生成的實體（N7 定稿影子）
  derived: ObjState[];              // 每步由機制推導（N6 影子）；不進快照，restore 後重算
  byId: Map<ObjId, ObjState>;       // objs 與 derived 的索引
  player: Player;
  checkpoint: number;
  cleared: boolean;
  inv: Record<ItemId, number>;      // 取代 hasKey（N9）
  abilities: AbilityId[];           // 本關可用能力（4.9）
  flags: Record<string, true>;      // 進度旗標：'item:nib'、'on:plate'、'zone:hall' …（提示 / 謎題完成判定）
  ext: Partial<WorldExt>;
  msg: string; msgKey: TextKey; msgSeq: number;   // msg = 已解析字串（相容現有測試，見 7.3）
  events: GameEvent[];              // 本步事件外送匣，外殼每幀取走清空
  time: number;
  readonly rt: Runtime;             // 不序列化：機制表與文字解析器
}
export interface Runtime { mechanics: CompiledMechanics; text: (key: TextKey, p?: Record<string, string | number>) => string }

export type GameEvent =
  | { t: 'switch'; to: Mode } | { t: 'switchDenied' } | { t: 'reset' } | { t: 'fall' }
  | { t: 'flag'; flag: string } | { t: 'item'; id: ItemId; n: number } | { t: 'cleared' };

export interface ActionFrame { moveX: number; moveZ: number; jump: boolean; pressed: readonly WorldAction[] }
export type WorldAction = 'flip' | 'reset' | 'interact' | 'pin' | 'section' | 'mark';
export const ACTION_ORDER: readonly WorldAction[] = ['flip', 'reset', 'interact', 'pin', 'section', 'mark'];

export function createWorld(level: LevelDef, opts: { mechanics: readonly Mechanic[]; abilities?: AbilityId[]; text?: Runtime['text'] }): World;
/** 確定性：相同 (snapshot, frame 序列, dt 序列) → 相同結果；不讀時鐘 / 亂數 / DOM */
export function step(w: World, f: ActionFrame, dt: number): void;
/** 相容包裝：現有測試 helpers 的 run/place 不必改 */
export function stepWorld(w: World, input: { moveX: number; moveZ: number; jump: boolean }, dt: number): void;

export interface WorldSnapshot {
  v: 1; levelId: string; player: Player; checkpoint: number; cleared: boolean;
  objs: Array<{ id: ObjId; x: number; y: number; z: number; gone: boolean; used: boolean; touched: boolean; ext?: Json; spawned?: ObjDef }>;
  inv: Record<ItemId, number>; abilities: AbilityId[]; flags: string[]; ext: Json; time: number; msgKey: TextKey;
}
export function snapshot(w: World): WorldSnapshot;
export function restore(level: LevelDef, s: WorldSnapshot, opts: Parameters<typeof createWorld>[1]): World;
```

**step 內固定順序**（保留現況 `game.ts:103-106` 的「切換 → 歸位 → 互動 → 移動」）：
1. `refreshDerived(w)`（各機制 `derive`）
2. 依 `ACTION_ORDER` 處理 `f.pressed`；`flip/reset/interact` 是核心動作，其餘交給擁有該動作的機制（4.2）；每個動作後 `refreshDerived`
3. `beforePhysics` 掛點（依註冊順序）
4. 核心物理：現有 `stepWorld` 本體（移動 / 推箱 / 重力 / 邊界）
5. `afterPhysics` 掛點：`plates` → `links`（取代 `step.ts:55 updatePlates`，位置不變）
6. `updateCheckpoint`、掉落 `respawn`（順序同 `step.ts:56-57`）

**為什麼不做「回傳新 World」的純函式**：現有程式與 helpers 都是就地修改，且每幀複製數百物件無必要；「純」的需求（測試分支、回到謎題開始、Boss 階段檢查點〔規格 7.2、8〕）由 `snapshot/restore` 滿足。需要純函式形式時用 `restore → step → snapshot`。

### 4.2 機制模組介面（`core/registry.ts`）

```ts
export type MechanicId = string;

export interface Mechanic {
  readonly id: MechanicId;
  /** 設了則 actions 只在 world.abilities 含它時有效（LevelDef.abilities 白名單，規格 N8 風險欄） */
  readonly ability?: AbilityId;
  /** 此機制擁有的物件類型（類型只能有一個擁有者） */
  readonly types?: Readonly<Record<string, ObjTypeSpec>>;
  /** 此機制擁有的玩家動作（動作只能有一個擁有者） */
  readonly actions?: Partial<Record<WorldAction, (w: World) => void>>;

  init?(w: World): void;                                             // 建 w.ext 初始狀態
  visibility?(w: World, o: ObjState): Visibility | undefined;        // 有效可見性覆寫（N5）
  presence?(w: World, o: ObjState, mode: Mode): boolean;             // 額外存在條件，AND 合成（N8）
  passable?(w: World, o: ObjState): boolean;                         // 存在但不擋路（C7 開門），OR 合成
  derive?(w: World): ObjState[];                                     // 推導物件，id 必須以 `${id}:` 開頭（N6）
  materialize?(w: World, derived: ObjState): ObjState | null;        // 推導物件被定稿 → 生成實體（N7）
  canLand?(w: World, box: Box, mode: Mode): boolean;                 // 切換落點否決，AND 合成（noLand3d）
  beforePhysics?(w: World, dt: number): void;
  afterPhysics?(w: World, dt: number): void;                         // plates、links
  onModeSwitch?(w: World, from: Mode, to: Mode): void;               // 切換成功後
  validate?(level: LevelDef): LevelIssue[];                          // 關卡驗證器呼叫
}

export interface ObjTypeSpec {
  defaults?: Partial<ObjBase>;      // 例：gate 預設 interactable、visible:'3d'
  verbKey?: TextKey;                // [E] 動詞（取代 game.ts:17 VERBS）
  /** 通用前置（requires 不滿足 → 說 lockedKey 並中止；滿足 → consume / grants / opens / useKey）之後呼叫 */
  interact?(w: World, o: ObjState): void;
  mass?(o: ObjState): number;       // 壓板計重；預設 (pushable || heavy) ? 1 : 0
}

export interface CompiledMechanics {
  list: readonly Mechanic[];
  types: ReadonlyMap<string, { owner: MechanicId; spec: ObjTypeSpec }>;
  actions: ReadonlyMap<WorldAction, { owner: Mechanic; run: (w: World) => void }>;
  // 各掛點預先篩出的陣列，避免每次呼叫掃全表
}
export function compileMechanics(list: readonly Mechanic[]): CompiledMechanics;  // 重複類型 / 動作 / id → throw
```

**註冊方式**：`mechanics/index.ts` 匯出 `DEFAULT_MECHANICS = [basics, items, links, plates, notes, exit, pin, section, light, mark]`。**陣列順序 = 執行順序**；`createWorld` 必須傳入機制表（核心不 import mechanics，測試可只傳子集）。不做全域副作用註冊（import 順序決定行為會讓測試不穩定）。

**衝突規則**

| 掛點 | 合成方式 | 衝突處理 |
|------|---------|---------|
| `types` / `actions` | 唯一擁有者 | 重複 → `compileMechanics` 拋錯 |
| `visibility` | 第一個回傳非 undefined 者勝 | 目前只有 pin 使用；驗證器禁止同一物件同時 `pinnable` 與其他覆寫 |
| `presence` | AND | 優先序寫在機制內（如 section 對 `isPinned` 放行 =「定稿 > 剖面」，規格 4-2c） |
| `passable` | OR | — |
| `derive` | 串接 | id 前綴必須是機制 id，重複 → 拋錯 |
| `canLand` | AND | — |
| `beforePhysics/afterPhysics/onModeSwitch` | 依陣列順序 | plates 必須在 links 之前（index.ts 註解＋單元測試鎖定） |

**物件類型與機制的關係**：類型由機制註冊（`types` 欄）；一個機制可擁有多個類型（links 擁有 gate/inkwall/inkbridge）；不屬任何行為的類型（floor、wall…）由 `basics` 註冊，讓驗證器能偵測「未註冊類型」。**通用特性**（solid、pushable、requires…）放在 `ObjBase`，任何類型可用；**類型專屬參數**放在 `ObjKinds[type]`。

**機制間依賴**：允許 mechanics 互相 import **查詢函式**（例：`section.ts` import `isPinned` from `pin.ts`），必須無環（2.3 第 5 條）。不做事件匯流排；跨機制只有兩條通道：查詢函式、`materialize`。

### 4.3 物件與關卡 schema

```ts
export type LinkSpec = ObjId | { id: ObjId; invert?: boolean };          // N13
export type ItemReq = ItemId | { item: ItemId; consume?: boolean };     // N9：墨滴消耗、筆尖不消耗

export interface ObjBase {
  id: ObjId;
  x: number; y: number; z: number; w: number; h: number; d: number;   // x,z 中心、y 底部（沿用）
  visible: Visibility;
  solid: boolean;
  interactable?: boolean; interactIn?: Visibility;
  pushable?: boolean;
  heavy?: boolean;                  // 不可推但有重量（規格 2-4b 鉛字盤）
  noLand3d?: boolean;
  pinnable?: boolean;               // N5 白名單（規格 N5 風險欄）
  caster?: boolean;                 // N6 會投影
  requires?: ItemReq;               // N9
  grants?: ItemId | AbilityId;      // N9：拾取即得（拾取後 gone）
  opens?: LinkSpec | LinkSpec[];    // C6/N10/N13；保留字串形式（現有測試比對 opens === 'gate'）
  labelKey?: TextKey; textKey?: TextKey; lockedKey?: TextKey; useKey?: TextKey;
}

/** 開放式類型表：每個機制檔以 declaration merging 加入自己的類型與專屬欄位 */
export interface ObjKinds {
  floor: {}; wall: {}; rail: {}; table: {}; plinth: {}; shelf: {}; crate: {};
}
export type ObjType = keyof ObjKinds;
export type ObjDef = { [K in ObjType]: ObjBase & { type: K } & ObjKinds[K] }[ObjType];

// mechanics/plates.ts 內：
declare module '../core/types' {
  interface ObjKinds { plate: { weight?: number /* N2，預設 1 */; latch?: boolean /* N4，預設 true */; countsPlayer?: boolean /* N3，預設 visible==='3d' */ } }
}

export interface ObjState {
  def: ObjDef; x: number; y: number; z: number;
  gone: boolean;
  used: boolean;        // 沿用：閘門已開 / 壓板已壓 / 閥已轉（測試直接讀寫，見 foyerSolution.test.ts:54-59）
  touched: boolean;     // 沿用：壓板「太輕」提示已顯示
  ext?: Record<string, Json>;   // 機制私有的逐物件狀態
  derivedBy?: MechanicId;       // 推導物件的擁有者
}

export interface Region { id: string; minX: number; maxX: number }              // Q-C 墨記區域（x 分區；2D 只有 x）
export interface Zone { id: string; min: V3; max: V3; flag: string }             // 走到某處即設旗標（1-1a「走到盡頭」）
export interface DecorItem { kind: string; x: number; y: number; z: number; [k: string]: Json }

export interface LevelDef {
  id: string;                       // '1-2'（內部 id 不隨劇情改名；現有 'foyer' 於遷移時保留為 alias）
  titleKey: TextKey; narrationKey: TextKey;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  voidY: number;
  start: { x: number; y: number; z: number };
  checkpoints?: Checkpoint[];
  abilities: AbilityId[];           // 開場可用能力白名單（規格 8 重玩規則）
  regions?: Region[]; zones?: Zone[];
  puzzles: PuzzleDef[];             // 4.10
  theme?: string; decor?: DecorItem[];
  phases?: PhaseDef[];              // M4 Boss 三階段（規格 10 M4「重載物件子集」）；型別於 M4 定義，之前不實作
  initial?: Json;                   // 機制狀態初值，由各機制 init 自行解讀（6.3 發現的缺口：5-1 預置墨記）
  objects: ObjDef[];
}

/** content/items.ts：物品表（N9；規格 5.3 墨滴 / 章印、5.1 收集物） */
export interface ItemDef { id: ItemId; scope: 'level' | 'persist'; nameKey: TextKey; icon: string }
// nib/pin/section/mark → persist（寫入 save.abilities）；inkdrop/seal → level；diary:n/scrap:n → persist（寫入 save.diary/scraps）
```

`ObjBase` 本身也是 interface：機制若需要「任何類型都可帶」的特性（例：mark 的 `markFlag?: string`，6.3），同樣以 declaration merging 加在 `ObjBase`。

**擴充自訂欄位的做法**：`ObjKinds` 是開放 interface，新機制在自己的檔案 `declare module` 加類型，`ObjDef` 自動變成新的判別聯集，核心型別檔零修改；`switch (def.type)` 在 TS 下仍能窄化。逐物件執行期狀態走 `ObjState.ext`，世界級狀態走 `WorldExt`（同樣 declaration merging）。不用「任意 props bag」是為了保留型別檢查。

### 4.4 視角策略（`core/modes.ts`、`core/presence.ts`）

```ts
export interface ModeSpec {
  id: Mode; other: Mode;
  axes: 2 | 3;              // overlaps / sweepAxis / distanceTo 的比較軸數（取代 H9 的散落 if）
  moveZ: boolean;           // 2D 只能左右（C2）
  jumpV: number;            // C4
  boundsZ: boolean;         // inBounds 是否檢查 z
  enter(w: World): boolean; // 進入此模式的落點求解（3d→2d：C10；2d→3d：C11）；失敗回 false
}
export const MODES: Readonly<Record<Mode, ModeSpec>>;

/** 單一真相來源：所有「這東西在此模式存在嗎」都走這裡（取代 H7 的 7 處） */
export function effectiveVisibility(w: World, o: ObjState): Visibility;    // 機制 visibility 覆寫 ?? def.visible
export function isActiveIn(w: World, o: ObjState, mode: Mode): boolean;    // !gone && activeIn(effVis) && 所有 presence
export function allObjs(w: World): readonly ObjState[];                    // objs ++ derived
export function solidsFor(w: World, mode: Mode): ObjState[];               // isActiveIn && def.solid && !passable
```

- 只有兩種模式（N11 已否決），所以 `MODES` 是兩筆常數表，不是插件點；它的價值是把 2D/3D 差異收在一處。
- `trySwitchMode(w)` = `MODES[w.player.mode].other` 的 `enter`；**先記錄 `z3d` 再求解**（修 H10，失敗時還原），落點檢查合成 `canLand`（`noLand3d` 改由 `basics` 機制提供，現況行為不變）。
- **剖面（N8）不是第三種模式**，是 `presence` 掛點：在 2D 依 `player.z3d` 過濾。因此 solids、壓板計數、互動、渲染全部自動吃到剖面。
- 投影：2D 渲染位置的 z 由 render 決定（`FRONT_2D`），邏輯層 2D 只是 `axes=2`，不做投影矩陣。

### 4.5 渲染層（`render/`）

```ts
export type ModelFactory = (paint: Painter, def: ObjDef, theme: Theme) => PropModel;   // PropModel 沿用 render/models/types.ts
export const MODELS: Partial<Record<string, ModelFactory>>;          // render/models/index.ts；找不到 → boxModel（開發期不會隱形）

export interface Theme {
  id: string;                       // 'foyer' | 'study' | 'greenhouse' | 'cellar' | 'attic' | 'meadow'
  pal: Palette;                     // 現 PAL（材質色）
  ink: InkPalette;                  // 2D 專屬物件墨水色；設定 inkPalette 切換（規格 7.2）
  bg2d: string[]; bg3d: number;
}
export function resolveTheme(chapterTheme: string, ink: 'default' | 'blueOrange' | 'mono'): Theme;

export type DecorFactory = (paint: Painter, item: DecorItem, level: LevelDef, theme: Theme) => DecorPart;
export const DECOR: Record<string, DecorFactory>;    // 'painting' | 'pendant' | 'rug' | 'wallShelf' | 'walls' | 'pit'

export interface Transition { start(to: Mode): void; tick(dt: number): { done: boolean; swapNow: boolean } }
export const TRANSITIONS: { ink: () => Transition; plain: () => Transition };   // reduceMotion → plain

export class PuzzleScene {
  constructor(world: World, theme: Theme);
  /** 每幀：對 allObjs(world) 做 id 對帳（新增 / 移除 derived 與 spawned 的模型），再同步位置與可見性 */
  update(renderMode: Mode, dt: number, t: number, camera: THREE.Camera): void;
  dispose(): void;
}
```

- **同一份物件資料產生兩種外觀**：沿用 `Painter`（每個網格一組 3D 材質 + 一組 2D 扁平色＋描邊），模型工廠只寫一次；不另做 2D 模型。
- 可見性一律 `isActiveIn(world, obj, renderMode)`（修 H7 的渲染那一處）；模型 `update` 讀 `obj.used/ext`，不讀全域旗標（修 H20：門讀自己的 `used`）。
- **P4 形狀符號**（規格 7.2）由 `markers.ts` 依特性統一加：`visible:'2d'` → 墨點、`'3d'` → 實線框、`pinnable` → 印框、剖面中 → 斜線、影子 → 網點。新物件類型不必各自畫符號。
- 主題切換 = 重建場景（只在設定變更或換關時發生，不影響切換視角的流暢度）。
- 效能：切換視角只換材質與相機（現況做法）；derived 物件 id 穩定（`light:shadow:<casterId>`），對帳只在增減時建 / 拆模型，縮放走 `update`。數百物件不需 instancing〔推論〕。

### 4.6 輸入層（`input/`）

```ts
export type ShellAction = 'restart' | 'hint' | 'skip' | 'menu';
export type InputAction = WorldAction | ShellAction;
export type Axis = 'left' | 'right' | 'up' | 'down' | 'jump';
export type Bindings = Record<InputAction | Axis, string[]>;   // KeyboardEvent.code
export const DEFAULT_BINDINGS: Bindings;  // F/Q flip、E interact、T reset、R restart、G pin、C section、V mark、H hint（規格 N5/N8/4.1/7.1）

export interface InputSource {
  /** 每幀取樣：持續軸 + 本幀新按下的動作（取走即清空） */
  poll(): { moveX: number; moveZ: number; jump: boolean; pressed: InputAction[]; anyKey: boolean };
  clear(): void; dispose(): void;
}
export class KeyboardSource implements InputSource { constructor(bindings: Bindings) }
export function mergeSources(sources: InputSource[]): InputSource;   // 觸控 / 手把日後各加一個 source
```

- 重綁：`settings.keys` 覆蓋 `DEFAULT_BINDINGS`；操作說明由 `ui` 依 bindings 產生（修 H17）。
- 新增輸入方式只需新增 `input/touch.ts` 實作 `InputSource` 並在 `app/services.ts` 合併。

### 4.7 應用外殼（`app/`）

```ts
type Screen =
  | { id: 'boot' } | { id: 'nickname' } | { id: 'menu' }
  | { id: 'level'; levelId: string } | { id: 'clear'; levelId: string }
  | { id: 'journal' } | { id: 'ending'; which: 'A' | 'B' };
// boot →(無暱稱) nickname → menu → level → clear → (下一關 | menu)；6-1 → ending → menu
```

資料流（單向）：

```
InputSource.poll ─► ShellAction ─► App（restart/hint/menu/skip）
                └─► ActionFrame ─► step(world) ─► world.events ─► meta（hints 計數、stats、save）
                                         │
                                         ├─► deriveHud(world, text, hintState, bindings) ─► ui.render(HudModel)
                                         └─► PuzzleScene.update(world)
UI 按鈕 ─► App 指令（不直接改 world）
```

- `app/loop.ts`：固定步長 1/60 累加器（測試 `DT=1/60` 相同；決策 Q4 已確認）、過場鎖 0.3 秒期間不呼叫 `step`（沿用 `game.ts:90-101` 語意）。
- `deriveHud` 是純函式（可在 Node 測）：`{ modeText, items: {id, n}[], prompt, toast, narration, hint }`；`ui/hud.ts` 只做 diff 後寫 DOM。
- 畫面狀態機用一個 `switch` + `enter/exit`，不引入狀態機函式庫（只有 7 個狀態）。

### 4.8 內容載入（`content/levels/index.ts`、`meta/progress.ts`）

```ts
export interface LevelEntry {
  id: string; chapter: 1 | 2 | 3 | 4 | 5 | 6 | 'H';
  def: LevelDef;
  unlock: Unlock; core: boolean;   // core：只做核心題時的範圍篩選（規格 6.9）
}
export type Unlock =
  | { after: string[] }                               // 線性；5-5 = after ['5-2','5-3','5-4']
  | { ability: AbilityId; seenIn: string };           // 隱藏房：取得能力且通過入口所在關（規格 8 章節解鎖）
export interface ChapterDef { id: number | 'H'; titleKey: TextKey; narrationKey: TextKey; theme: string; levels: string[] }

export const LEVELS: readonly LevelEntry[];
export const CHAPTERS: readonly ChapterDef[];
export function isUnlocked(e: LevelEntry, save: SaveV2): boolean;
export function startAbilities(e: LevelEntry, save: SaveV2): AbilityId[];   // def.abilities ∩ save.abilities
```

- **能力白名單**：`createWorld` 的 `abilities` = `def.abilities ∩ save.abilities`；關內拾取（`grants: 'pin'`）直接加入 `world.abilities`。1-2 的 `abilities: []`，所以重玩玄關仍需先撿筆尖（現況行為）。
- **不採用動態 import**：每關資料數 KB、25 關合計估 <150 KB〔推論〕，模型程式按類型共用；動態 import 會讓測試與驗證器變非同步、增加 chunk 管理，換來的載入節省可忽略。若 M4 後總量 >500 KB 再改 `load: () => import()`（介面只差一個欄位）。

### 4.9 存檔 / 設定 / 統計（`meta/`）

```ts
export interface KeyValueStorage { get(k: string): string | null; set(k: string, v: string): void; remove(k: string): void }
export const memoryStorage: () => KeyValueStorage;      // 測試用；app 注入 localStorage 包裝

export interface SaveV2 {                                // 規格 8
  v: 2; cleared: string[]; current: string; abilities: AbilityId[];
  diary: number[]; scraps: number[]; endings: { A: boolean; B: boolean }; name: string;
}
type Migration = (raw: unknown, s: KeyValueStorage) => unknown;
/** MIGRATIONS[n] 把 v=n 轉成 v=n+1；v0 = 「沒有 puzzle:save」 */
export const MIGRATIONS: Record<number, Migration> = {
  0: (_r, s) => s.get('puzzle:foyer:cleared') === '1'
    ? { v: 1, cleared: ['1-1', '1-2'], abilities: ['nib'] } : { v: 1, cleared: [], abilities: [] },
  1: r => ({ ...defaults(), ...(r as object), v: 2 }),
};
export function loadSave(s: KeyValueStorage): SaveV2;    // 依序套遷移 → 校正 → 寫回；舊 key 在成功寫回後才刪
export function writeSave(s: KeyValueStorage, save: SaveV2): void;
export function loadSettings(s: KeyValueStorage): Settings;   // { hints, hintAssist, assistMode, inkPalette, reduceMotion, keys }（hintAssist / assistMode 預設 false，規格 8）
export function recordPuzzle(s: KeyValueStorage, id: string, delta: Partial<PuzzleStat>): void;
```

- **壞資料回退**：JSON 解析失敗或校正後不合法 → 原字串備份到 `puzzle:save:corrupt`、回傳預設存檔，不丟例外（遊戲照樣能開）。校正是手寫 type guard（不引入 zod 等相依）。
- 關內不存檔（規格 Q4）：`snapshot` 只供記憶體內使用（回到謎題開始、Boss 階段），不寫 storage。

### 4.10 提示系統（`content` 資料 + `meta/hints.ts` + `ui/hintPanel.ts`）

```ts
export interface PuzzleDef {
  id: string;                       // '1-2a'～'1-2d'、'5-5a'～'5-5c'（決策 Q3，已確認）
  core: boolean;
  doneFlag: string;                 // 完成判定，例 'item:nib'、'on:plate'、'zone:exit'
  hints: [HintDef, HintDef, HintDef];   // L1 意象 / L2 觀察角度 / L3 缺的性質，三級全抽象（規格 7.1、D7）
  solutionKey: TextKey;                 // L4 解法筆記（安全閥，預設鎖定；規格 7.1.2）
  keyObjects: ObjId[];                  // 本題關鍵物件：驗證器據此檢查提示不得點名（規格 7.1.1 H4）
  assistFocus?: ObjId[];                // 只在 Settings.hintAssist 開啟時用於 L2 描邊（規格 Q-E，預設關）
}
export interface HintDef { textKey: TextKey; truthRef: string }   // truthRef：對應解法大綱的步驟或規則（H5 人工審稿用）

export interface HintState { puzzleId: string | null; unlocked: 0 | 1 | 2 | 3 | 4; ready: 0 | 1 | 2 | 3 | 4; shown: 0 | 1 | 2 | 3 | 4 }   // 4 = L4 解法筆記
export interface HintStrategy {
  /** realSec 為真實經過秒數（暫停不計）；events 為本幀 world.events */
  update(s: HintState, realSec: number, events: readonly GameEvent[]): HintState;
  request(s: HintState, hold?: boolean): HintState;   // 按 H；L4 需 hold（按住 2 秒）
}
export const HINT_STRATEGIES: Record<'timed' | 'always' | 'off', () => HintStrategy>;
```

- **目前謎題** = `level.puzzles` 中第一個 `doneFlag` 未成立者（關內謎題線性，規格 6；〔推論〕5-x 若需並行再加欄位）。新旗標事件 → 計時與計數歸零。
- **計時**（規格 7.1）：L1 3 分、L2 +3 分、L3 +4 分；L4 在 L3 **顯示後**再 5 分鐘（`Settings.assistMode` 開啟則免等待）。
- **卡關偵測**（規格 7.1）只吃 `world.events`：`reset ≥3`、`switch ≥12 且無 flag`、`fall ≥3` → `ready+1`（只亮圖示），**上限 L3**；對 L4 只把等待縮短到 3 分鐘。
- **跳過此題**：只在 `core === false`（擴充題）時提供，與 L4 同條件出現；寫入 `stats.skipped`。
- **與「小格」的關係**：策略只產生「第幾級可用」；小格的台詞外殼（「運算中……」「找到線索了！……大概。」「好吧，直接說——啊不行，只能說這些。」；L4「借你社長的攻略筆記」）是 `ui/hintPanel.ts` + 文字表 `story.xiaoge.*`，換角色或關閉小格只動 UI 與文字。0 級回饋（C9「看得見，卻碰不到」）仍由核心 `say('msg.unreachable')`，劇情改由小格說只需改文字。

### 4.11 文字 / 文案系統（`text/`、`content/text/`）

```ts
export type TextBundle = Readonly<Record<TextKey, string>>;
export interface Text {
  (key: TextKey, params?: Record<string, string | number>): string;
  has(key: TextKey): boolean;
}
/** 插值：{name}、{n}；詞彙引用：[[term.nib]] 展開為 bundle['term.nib']（一層） */
export function createText(bundle: TextBundle, fallback?: TextBundle): Text;   // 缺 key → fallback → 回傳 key 本身（DEV 警告）
```

- key 命名：`ui.*`（HUD / 選單）、`msg.*`（系統訊息）、`obj.<type>.*`（類型預設 label / verb）、`lvl.<levelId>.*`（標題、旁白、便利貼、物件 label）、`hint.<puzzleId>.<1|2|3|sol>`、`story.*`（角色台詞、結局）、`term.*`（詞彙表）。
- **劇情詞彙與內部 id 分離**：內部一律用規格代號（`key`、`valve`、`pin`、`mark`、模式 `'2d'`）；玩家看到的名稱集中在 `term.*`：`term.mode3d='現實'`、`term.nib='筆尖'`。劇情 4 節的改名 = 改 `term.*` 幾行，其他字串透過 `[[term.nib]]` 自動跟著變。
- 暱稱：`{name}` 參數由 app 從存檔傳入（劇情 2 節「系統文字用玩家暱稱」）。
- 多語系：新增 `content/text/en/` 同 key 表，`createText(en, zhHant)` 以中文回退；驗證器檢查各語系 key 集合。

### 4.12 開發與測試工具（`devtools/`）

```ts
// validateLevel.ts
export interface LevelIssue { level: string; obj?: ObjId; rule: string; message: string }
export function validateLevel(def: LevelDef, ctx: { mechanics: readonly Mechanic[]; text: Text; items: typeof ITEMS }): LevelIssue[];

// script.ts：取代 tests/puzzle/helpers.ts 的 walkTo/hopUntil，輸出 ActionFrame 序列
export type Cmd =
  | { walkTo: [number | null, number | null]; zFirst?: boolean } | { hop: 1 | -1; until: (w: World) => boolean }
  | { act: WorldAction } | { wait: number } | { expect: (w: World) => void };
export function runScript(w: World, cmds: readonly Cmd[], dt?: number): void;

// shortcutScan.ts：規格 M1「網格取樣 × 兩模式，斷言關鍵旗標不成立」
export interface ScanSpec {
  level: LevelDef;
  setup?: (w: World) => void;                          // 例：先把狀態推進到某謎題開始（或 restore 快照）
  movable: Array<{ id: ObjId; xs: number[]; zs: number[] }>;   // 可推物取樣格
  playerAt: Array<{ x: number; y: number; z: number }>;
  probes: Cmd[][];                                     // 每個取樣點要嘗試的短操作（跳、切換、互動、往左右走）
  forbidden: string[];                                 // 不得成立的旗標（如 'item:nib'）
}
export function scanShortcuts(spec: ScanSpec, mechanics: readonly Mechanic[]): Array<{ sample: string; flag: string }>;
```

**驗證器規則**（每條附規格依據）：id 唯一；類型已註冊；`opens/requires/grants` 參照存在；`requires` 的能力在 `abilities` 或關內可得（規格 8）；每個 puzzle 三級提示 + `solutionKey` 齊全、`hint.*` key 存在（規格 7.1）；**提示 lint**（規格 7.1.1 H1～H4）：L1 ≤24、L2 ≤30、L3 ≤36 字，禁用祈使開頭與動詞清單、按鍵名、方位精確詞、任何數字，且不得含 `keyObjects` 的 label / 顯示名（H5～H9 為人工審稿與 G1 試玩項，不自動化）；每關 `pinnable` 1～3 個（規格 N5）；切換式閥 ≤2（規格 N10）；燈車 ≤1（規格 N15）；墨記關卡必有 `regions` 且不重疊（Q-C）；起點與檢查點在兩模式站得住（現有測試 `puzzleLogic.test.ts:24`）；全遊戲 diary=5、scraps=6 且位置符合劇情 6.1；所有 `*Key` 在 zh-Hant 存在；各機制 `validate`。
**捷徑掃描**是取樣器而非求解器：誠實地說，它只能證明「取樣到的配置 × 探針」沒有捷徑；探針與取樣格由寫關卡的人負責。成本估計：3 箱 × 10×6 格 × 數個玩家點 × 6 探針，每探針 ≤3 秒模擬，單關約數秒〔推論〕。
**通關回放**：每關一個 `tests/puzzle/levels/<id>.test.ts`，以 `runScript` 從 `createWorld` 走到 `cleared`。
**Debug 疊層**（可選，DEV only）：`render/debug.ts` 畫 `solidsFor(renderMode)` 線框與 flags 清單；`main.ts` 已有 `window.__puzzle`（`main.ts:5`）沿用。

---

## 5. 擴充劇本

| 情境 | 新增 | 修改 | 核心修改 |
|------|------|------|---------|
| 新增機制（例：N6 燈影） | `mechanics/light.ts`；`render/models/lamp.ts`、`shadow.ts`；`tests/puzzle/mechanics/light.test.ts`；`content/text/zh-Hant` 補 `obj.lamp.*`、`msg.light.*` | `mechanics/index.ts` 加一行；`render/models/index.ts` 加兩行 | 無 |
| 新增物件類型（例：墨橋 inkbridge） | 在擁有它的機制檔 `declare module` + `types.inkbridge`；`render/models/inkbridge.ts` | `render/models/index.ts` 一行 | 無 |
| 新增一關（例：2-1） | `content/levels/ch2/2-1-shelves.ts`；`content/text/zh-Hant/lvl-2-1.ts`、`hint-2-1.ts`；`tests/puzzle/levels/2-1.test.ts`（通關＋反例＋掃描） | `content/levels/index.ts` 一行；`chapters.ts` 的 levels 陣列 | 無 |
| 新增一章 | 該章各關檔；`render/themes/<theme>.ts`；必要的 `render/decor/*` | `chapters.ts` 一筆；`themes/index.ts` 一行 | 無 |
| 新增輸入（觸控） | `input/touch.ts`（實作 `InputSource`）；`ui/touchPad.ts`（虛擬按鈕 DOM） | `app/services.ts` 合併 source | 無 |
| 改一個顯示名稱（筆尖 → 畫筆工具） | — | `content/text/zh-Hant/term.ts` 一行；必要時字串內改用 `[[term.nib]]` | 無；測試若比對字面文字，需同步（劇情 4 節已指出 `puzzleLogic.test.ts:230`） |
| 新增語言 | `content/text/en/*.ts` | `app/services.ts` 依設定選 bundle；`settings.ts` 加 `lang` | 無 |
| 新提示策略 | 在 `meta/hints.ts` 加一個 factory | `Settings.hints` 聯集加值 | 無 |
| 新渲染風格 / 色盲組 | `render/themes/<id>.ts` 或 `InkPalette` 一組 | `themes/index.ts` | 無 |

---

## 6. 設計驗證

### 6.1 N6 燈影（規格 4、3-1～3-4）

- 資料：`lamp` 類型（`ObjKinds.lamp: { on?: boolean; wallZ?: number }`，燈的 z 即 `Lz`）；caster 用通用特性 `caster: true`。
- 掛點：`derive` —— 對每盞 `on` 的燈與每個 caster 計算影子盒：`s = (Lz − wallZ) / (Lz − objZ)`，x、y 邊界以燈的 (x, y) 為中心縮放；產生 `ObjState{ id:'light:shadow:<casterId>', def:{ type:'shadow', visible:'2d', solid:true, z: wallZ+band/2, d: band }, derivedBy:'light' }`。`band`（貼牆厚度）讓 N8 能以「剖到牆面深度」判定（見 6.2）。
- 連續縮放：每步重算即可（`refreshDerived` 在動作後與每步開頭），花盆 / 燈被推 → 下一步影子跟著變；推的時候玩家在 3D，影子是 2D 實體，3D 物理不受影響。
- 影子沒有重量（3-4a 誘導性錯誤）：`ObjTypeSpec.mass` 對 shadow 回 0。
- 關燈：燈是互動物件（`types.lamp.interact` 切換 `used`）；或由 `opens` 連結（N10 一般化）。
- 渲染：`MODELS.shadow` 畫 2D 網點剪影（P4），模型 `update` 依 def 尺寸縮放；scene 對帳負責出現 / 消失。
- 需要的新介面：`derive`、`ObjState.derivedBy`、scene 對帳（都已在第 4 節）。**放得下。**

### 6.2 N8 剖面（規格 4、4-1～4-4）

- 狀態：`WorldExt.section = { on: boolean }`；`actions.section`（C，`ability:'section'`）。切換剖面限 3D（已確認，決策 Q5）；2D 按 C 只 `say('msg.section.only3d')`。
- 掛點 `presence(w, o, '2d')`：`!on || isPinned(w, o) || zRangeContains(o, w.player.z3d)`；3D 恆 true。
  - `solidsFor('2d')` 依 cut 過濾：因 `solidsFor` 建在 `isActiveIn` 上，自動成立。
  - 壓板依 cut 計數：plates 的重量來源是 `solidsFor(mode)`（6.4、N14），自動成立；壓板本身不在刀上 → 不存在 → 不更新（R1 的延伸，4-4a 需要的正是這個）。
  - 「定稿 > 剖面」（4-2c）：`section.ts` import `isPinned`。
  - 剖到牆上的影（4-2b）：影子盒在牆面帶 `band` 內，刀落在帶內才存在。
- `trySwitchMode` 已改為先記 `z3d` 再求解（H10），所以「進紙深度決定紙上世界」成立。
- HUD「剖面檢視」字樣與剖切線：`deriveHud` 讀 `w.ext.section`。**放得下。**

### 6.3 N16 墨記（規格 4.1、Q-C）

- 狀態：`WorldExt.mark = { x: number; y: number; region: string } | null`；`LevelDef.regions`；`actions.mark`（V，`ability:'mark'`）。
- 放置（2D、站穩）：記 `(x, y)` 與 `regions` 中涵蓋 x 的 region；已有墨記則覆蓋（同時只有一個）。
- 兌現（3D、站穩）：玩家目前 x 所在 region ≠ 墨記 region → `say('msg.mark.region')`；否則目標盒 `boxAt(mx, my, p.z)` 須 `inBounds`、`!hits(solidsFor('3d'))`、`supportsAt(…,'3d')` 非空、通過 `canLand`；為吸收浮點誤差以 `nearestFree` 在半徑 0.1 內找點〔推論〕；失敗 → `say('msg.mark.noSupport')`（「這裡接不住你」）；成功 → 移動玩家、清除墨記、`emit flag 'mark:redeemed'`。
- 「記在影子上要先定稿」（5-1a）：影子只在 2D 存在，3D `supportsAt` 找不到 → 自然失敗；定稿後是實體 slab → 成功。無需特例。
- 「先記後拆」（4-4b、5-1b）：墨記只存座標，不參照物件，自然成立。
- 5-1「不是你放的標記點」：物件資料無法表達「世界狀態初值」→ 走查時發現缺口，**已回頭在 4.3 補 `LevelDef.initial?: Json`**，由 `mark.init` 讀取 `initial.mark`。
- 結局 B（劇情 6.2：在編輯桌放墨記不兌現）：`mark` 放置時若腳下支撐物有 `markFlag` 欄位 → `flags[markFlag]`；外殼依 `ending.B` 旗標 + `save.scraps` 齊全判定。
- 渲染：`derive` 產生 `mark:marker`（visible both、solid false）；`MODELS['mark']` 3D 畫橫跨深度墨線、2D 畫墨點（規格 7.2）。**放得下（補一欄位）。**

### 6.4 N5 提交 / 定稿（規格 4、2-3～2-5）

- 狀態：`WorldExt.pin = { target: ObjId | null }`；`actions.pin`（G，`ability:'pin'`）。
- 有效可見性：`visibility(w, o)` → `o.def.id === pin.target ? 'both' : undefined`。所有讀可見性的地方都經 `isActiveIn`，一次生效。
- 動作流程：找範圍內、當前模式存在、`pinnable` 的最近物件（重用 `findTarget` 的距離函式，加篩選參數）；
  1. **承載檢查**（2-4a「上面還有東西」）：若舊目標的原始可見性不是 both，在它將消失的模式中，任何 pushable / heavy / 玩家以它為支撐（`supportsAt`）→ 拒絕。
  2. 新目標出現的模式中若與木箱重疊 → 拒絕（`msg.pin.blocked`）〔推論，規格未定〕；與玩家重疊 → `resolvePlayerOverlap`（規格 N5 成本欄）。
  3. 目標是推導物件（影子）→ 呼叫擁有者 `materialize`，以生成的實體為目標（N7）。
- 重量進紙（2-4b）：鉛字盤 `heavy:true` 被定稿 → 在 2D `solidsFor` 出現 → plates 計入。N14（2-4c）：C 只有 3D，定稿進紙成牆 / 階梯，取消即消失。
- 「印搬走了，紙還不知道」（2-5）：pin 改變只影響「存在」，plates 只在其存在模式於 `afterPhysics` 更新（R1），回到 2D 才重算 → 自然成立。**放得下。**

### 6.5 其他機制快速驗證

- **N13 反向連動**：`opens: [{id:'G1'}, {id:'G2', invert:true}]`。links 在**來源狀態改變時**才推送（不是每步重算），所以 3D 中壓板凍結 → 閘門凍結（2-2c 的時間差）；初始化時以「來源全未觸發」推一次，使反向門開著。關閉遇重疊 → 標記 pending、每步重試（N4 風險欄）。也因為「改變時才推送」，現有測試手動 `gate.used = true`（`puzzleLogic.test.ts:239`）不會被覆寫。
- **N14 3D 專屬可推物**：plates 的重量來源 = `solidsFor(w, mode).filter(mass>0)`，3D 專屬箱在 2D 不在清單中。這是相對現況（H5）的行為修正；玄關只有 both 木箱，加一條測試鎖定。
- **N15 燈車**：燈 `pushable:true`，沿 C5 推箱規則（窄支撐條限軸）；影子由 `derive` 每步重算，零新程式。驗證器限每關燈車 ≤1。
- **N9 通用鑰匙**：`key` 類型 `grants:'nib'`；閥 `requires:'nib'`、`opens:'door'`；門（`exit` 類型）在 `used=false` 時說 `lockedKey`，`used=true` 時 `cleared`。墨滴 `requires:{item:'inkdrop', consume:true}`；章印 1 對 1。`items.ts` 在 `core/interact.ts` 的通用前置中處理，類型 handler 只管各自台詞。
- **N10 墨水閥連動**：閥 `opens` 任一目標；目標類型決定「開」的意義——gate 開 = `passable`（仍顯示升起的門）；inkwall 開 = `presence` 為 false（消失）；inkbridge 開 = `presence` 為 true（出現）。三者都由 `links.ts` 擁有，切換式閥 = 閥的 `latch:false` 互動切換 `used`。
- **N2 / N3 / N4**：plates 參數 `weight`、`countsPlayer`、`latch`；N1、N10 已涵蓋於上。

---

## 7. 遷移計畫（行為不變，對應規格 M0）

### 7.1 驗收基準（每步都要）
- `npx vitest run` 584 通過（puzzle 36 個），`npm run build`（含 `tsc`）通過。
- **斷言不得改弱**：`git diff -U0 tests/puzzle` 中，`expect(` 開頭的增刪行只允許 7.3 對照表內的機械替換；其餘只能是 import 路徑變更。以腳本檢查（`grep '^[-+].*expect'` 逐行比對對照表）。
- 手動：`npm run dev` 開 `puzzle.html` 走一次玄關（可用 Playwright 透過 `window.__puzzle`）。

### 7.2 步驟

| # | 目標 | 動到的檔案 | 風險 | 驗證 | 依賴 |
|---|------|-----------|------|------|------|
| S1 | 搬目錄：`logic→core`、`levels→content/levels/ch1`、`hud/input/css→ui/input`；只改 import | 全部 import；tests 只改路徑 | 低 | 7.1 | — |
| S2 | `ModeSpec` 收斂 H9 的 if；`presence.ts` 建立 `isActiveIn/solidsFor`，取代 H7 的 7 處；`trySwitchMode` 先記 `z3d`（H10） | core/*、render/scene.ts | 中：切換落點 | 既有切換 / 落點測試；新增「切換失敗時 z3d 還原」測試 | S1 |
| S3 | `registry.ts` + `createWorld({mechanics})`；`step(w, ActionFrame)` 吸收 flip/reset/interact（保留 `stepWorld`、`trySwitchMode`、`interact`、`resetCrates` 匯出） | core/*、tests/puzzle/helpers.ts（傳入機制表） | 中 | 7.1；新增「ACTION_ORDER 與舊順序一致」測試 | S2 |
| S4 | 機制抽出：`basics`、`plates`（行為照舊，仍鎖定、不計數）、`links`（gate、`passable`）、`items`（`inv` 取代 hasKey；門用 `used` 取代 sealed）、`notes`、`exit` | mechanics/*、core/interact.ts、render/models/devices.ts:144 | **高**：C8 鑰匙鏈（規格 M0 風險欄） | 先補行為鎖定測試（鑰匙 / 閥 / 門各狀態訊息）再改；7.3 替換 | S3 |
| S5 | 文字系統：`text/`、`content/text/zh-Hant`；所有字面值搬成 key（**字串原樣**）；`say(key)`；`puzzle.html` 靜態字改由 ui 產生 | text/*、content/*、core/*、mechanics/*、ui/*、puzzle.html | 中：漏字 | 驗證器「key 齊全」；7.1；全字串 grep 測試：`src/puzzle/{core,mechanics}` 無 CJK 字元 | S4 |
| S6 | 輸入與外殼：`InputSource/Bindings`、`app/loop`、`app/app`（先只有 level 畫面）、`deriveHud`、`transitions` | app/*、input/*、ui/*、render/transitions.ts、main.ts | 中：手感 | `deriveHud` 單元測試；手動遊玩 | S5（HUD 文字） |
| S7 | 渲染登錄表、主題、scene 對帳、`LevelDef.decor`（玄關裝飾座標搬進資料） | render/* | 低～中：外觀回歸 | 截圖比對 S6 前後（Playwright，兩模式各一張） | S4 |
| S8 | 內容登錄表、章節、`meta/save`（遷移含舊 key）、`settings`、選單畫面 | content/levels/index.ts、meta/*、ui/screens/*、app/app.ts | 中 | 新測試：遷移（舊 key→v2、壞 JSON 回退、v2 原樣）、解鎖規則 | S6 |
| S9 | devtools：`validateLevel`、`runScript`（helpers 改薄包裝）、`shortcutScan`；`architecture.test.ts` 啟用 | devtools/*、tests/puzzle/* | 低 | 用玄關跑：驗證器 0 issue；以 `runScript` 重寫一份通關（舊測試保留） | S4 |

- **必須序列**：S1 → S2 → S3 → S4（核心 API 定型）。
- **可平行**（S4 完成後）：{S5 → S6 → S8} 一條線；S7；S9。S7 與 S6 都碰 `render/scene.ts` 的建構參數，約定 S7 先合併或由同一子任務做〔推論〕。
- **派工建議**（給主 agent；這是 TypeScript 前端專案，`sb-circus` 系列為 Spring Boot 專用，不適用）：
  - 子任務 A（general-purpose，序列）：S1～S4，每步一個 commit。
  - 子任務 B：S5 → S6 → S8。子任務 C：S7。子任務 D：S9（含架構測試）。B/C/D 可用 `isolation: worktree` 平行，合併時以 7.1 驗收。
  - 每個子任務完成後由另一個子任務只讀審查 `git diff tests/puzzle`（防斷言被改弱）。
- M0 的新功能（N9 一般化、`abilities`、存檔遷移、章節選單）在 S4/S8 內完成；**N14 計數修正、N2/N4/N13 留到 M1**，避免 M0 混入行為改變。

### 7.3 測試的機械替換對照（唯一允許的斷言改寫）

| 現況 | 替換為 | 位置 |
|------|-------|------|
| `expect(w.hasKey).toBe(B)` | `expect(hasItem(w, 'nib')).toBe(B)` | foyerSolution.test.ts:35,124,137,145 |
| `expect(w.sealed).toBe(B)` | `expect(get(w, 'door').used).toBe(!B)` | foyerSolution.test.ts:73,227；puzzleLogic.test.ts:215 |
| `import { MSG_X } from '…/logic/…'` | `import { MSG_X } from './msgs'`（`tests/puzzle/msgs.ts` = 以 zh-Hant 解析後的字串） | 兩個測試檔的 import 行 |

`w.msg` 仍是解析後的字串（`createWorld` 注入 `text`），所以 `expect(w.msg).toBe('這裡塞不下')` 等字面值斷言不動。

---

## 8. 取捨與風險

| # | 取捨 / 風險 | 決定與理由 |
|---|------------|-----------|
| T1 | **不做 ECS** | 物件數百、機制 10 個、每機制只關心少數類型；現有 `ObjState` 陣列 + 掛點已足夠。ECS 會重寫全部 2.3k 行並讓 36 個測試大改，與 M0「行為不變」衝突 |
| T2 | **不做事件匯流排（訂閱式）** | 只用 `world.events` 外送匣（單向、每幀清空），服務提示卡關偵測與統計（規格 7.1、8）。機制之間用查詢函式；訂閱式匯流排會讓執行順序隱形，不利確定性 |
| T3 | **不做插件系統 / 動態註冊** | 機制表是一個明確陣列；順序可讀、可測。「註冊」= 在 index 加一行 |
| T4 | **不做狀態機函式庫** | 外殼 7 個畫面，一個 switch 即可；遊戲內狀態由 `step` 推進 |
| T5 | **step 就地修改而非不可變** | 效能與現有程式風格；純度靠 snapshot/restore 滿足（4.1） |
| T6 | **不做動態 import、不做 instancing / 物件池** | 4.8、4.5 已述；資料量與物件數不需要 |
| T7 | **N11/N12/N17/N18 不預留任何介面** | 規格已否決；`ModeSpec` 只有兩筆，不為第三視角設計 |
| T8 | 風險：`presence/visibility` 掛點讓 `isActiveIn` 每次呼叫跑多個函式 | 估計每步數千次呼叫、各為 O(1)〔推論〕；若 profiling 顯示問題，再加「每步快取 solidsFor」——快取失效點只有動作與 afterPhysics，容易加 |
| T9 | 風險：mechanics 互相 import 演變成網狀 | 架構測試禁環；只允許 import 查詢函式（命名 `is*/get*`） |
| T10 | 風險：declaration merging 讓型別分散在各機制檔 | 好處是新增零核心修改；以「每機制檔開頭集中宣告」慣例緩解；驗證器檢查未註冊類型 |
| T11 | 風險：`w.msg` 同時存 key 與解析字串，是為相容現有測試的過渡設計 | 新測試一律斷言 `msgKey`；未來文案大改時再把舊測試改為 key 斷言（屆時劇情 4 節也要求同步改測試） |
| T12 | 風險：捷徑掃描給人「已證明無捷徑」的錯覺 | 文件與測試名稱明寫「取樣」；N16 依規格對每個可留記號高度 × 深度取樣 |
| T13 | **刻意不做**：關卡編輯器、遠端存檔、音效系統、本地化工具鏈、內容熱重載 | 規格未要求 |

---

## 9. 決策紀錄（已全部確認，2026-11-02，使用者回覆「全部照建議」）

| # | 問題 | 決定 |
|---|------|---------|
| Q1 | M0 遷移時，是否允許測試中 `w.hasKey`、`w.sealed`、`MSG_*` 匯入路徑做 7.3 的**等價機械替換**？（否則只能在 World 保留兩個相容欄位） | **允許**；替換表固定、以腳本檢查，其餘斷言一字不改（**已確認**） |
| Q2 | 規格內部矛盾（規格已改 H2，並列為規格 A2）：4-2b 說「物不在刀上，影還在」（caster 不受剖面影響），H2 說「只有剖到的花盆會投影」（caster 受剖面影響）。兩者需同一條規則 | **採 4-2b**（caster 不受剖面過濾、影子要剖到牆面帶才存在）；H2 改寫為「剖到牆面才看得到影子」的變奏。架構兩者都放得下（只差 light 的 caster 來源是否經 section 過濾）（**已確認**） |
| Q3 | 謎題 id 格式：1-2 原本的圈號編號是否統一為 `1-2a`～`1-2d`（存檔 / 統計 key 用） | **是**；顯示用編號放文字表（**已確認**） |
| Q4 | 瀏覽器主迴圈改為固定步長 1/60（與測試一致，可錄製試玩輸入回放 G1 問題），手感可能有極細微差異 | **採用**，於 S6 實作並手動確認（**已確認**） |
| Q5 | 剖面開關（C）是否只能在 3D 切換？在 2D 切換會讓腳下世界瞬間改變 | **只能在 3D**；2D 按下提示「回到完成版再切換剖面」（**已確認**） |
