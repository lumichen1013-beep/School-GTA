# 《圖紙之間》程式架構設計 v0.2（含 v0.3 魔方增補）

> **修訂紀錄**
> | 版本 | 日期 | 內容 |
> |------|------|------|
> | **v0.4 增補（混合轉動方案）** | 2026-11-03 | 對應規格 v0.4：第一章拉桿不變；第二章起控制盤（N32）——`core/cube.ts` 新增 `applyTurn`（列 / 行 / 滑動格 / 層 / 切片）與 `inverseTurn`；`core/chapter.ts` 的 `ChapterSession` 新增步數預算（每次進房補滿）、回退堆疊、魔方儀啟動與鎖扣（純函式、確定性、可存檔）；新增 `mechanics/dial.ts`（魔方儀入口物件）；`app/cubeMapModel.ts` 轉動模式與預覽、`ui/cubeMap.ts` 選列互動；`ChapterCommand`（轉動 / 回退指令，與 `WorldCommand` 分開）；SaveV3 增補 `dial / unlocked / turns`（缺欄補預設、校正）；`validateCube` 多解 / 預算 / 鎖定 / 入口 / 狀態量檢查；7.4 新增 D1～D7（M-Dial）；決策 Q10～Q13 |
> | **v0.3 增補（魔方主軸）** | 2026-11-03 | 對應規格 v0.3：新增章節層級狀態 `core/cube.ts`、`core/chapter.ts`（4.16）；`mechanics/cube.ts`、`labels.ts`、`scale.ts` 與 N24～N31 各機制檔（4.17～4.19）；`ActionFrame.commands`、`AbilityId = nib｜scale`、新事件；展開圖與字卡匣 UI（`app/cubeMapModel.ts`、`ui/cubeMap.ts`、`ui/cardTray.ts`）；SaveV3；`devtools/validateCube`（BFS）；`pin.ts`、`section.ts`、`mark.ts`、`light.ts`、`seam.ts` 自計畫移除（N5 / N6 / N7 / N8 / N15 / N16 退役、N20 併入 N21）；依賴矩陣不新增層；6.6 第一章走查；7.4 M-Cube 步驟；決策 Q6～Q9 |
> | v0.1 | 2026-11-02 | 初版架構（commit `97bc79c`） |
> | v0.2（新劇情：老宅魔方・森林圖書館） | 2026-11-03 | 只改劇情名詞與指向：追逐者改稱守衛殘影；解答手稿改為許問津的解答手稿；`story.*` key 移除律師來信 `story.letter`、日記改為許問津的手記；新增 N20 接縫（`mechanics/seam.ts`，規格 5.4；**v0.3 已取消**，改由 4.16 魔方連接表）；章節主題改為森林中的圖書館（`render/themes/<章>.ts`、`render/decor/`，規格 9.3） |
> | v0.2（劇情演出） | 2026-11-03 | 新增 4.15 過場系統（`text/readingTime.ts`、`app/cutscene.ts`、`ui/cutscene.ts`、`render/cutscene/`、`content/cutscenes/`）與畫面狀態 `cutscene`；設計見 `cutscenes-v0.1.md` |
> | v0.2（手機觸控） | 2026-11-02 | 4.6 輸入層加入觸控（`input/touch.ts`、`touchLayout.ts`、`merge.ts`、`ui/touchOverlay.ts`）、純檔案 DOM 規則、文字 key、擴充劇本「新增一種輸入」；設計細節見 `mobile-controls-v0.1.md` |
> | v0.2（老宅尋寶・單人詭異版） | 2026-11-02 | 劇情改為老宅尋寶（顯示名見 `story-bible-v0.2.md`）；4.13 改為全遊戲氛圍 / 驚嚇；新增 4.14 `mechanics/chase`（N19 追逐，確定性）與 `chase` 事件；`calmTension` 語意擴大（驚嚇平靜版、追逐自動通過） |
> | v0.2（緊張感） | 2026-11-02 | 新增 4.13 緊張感呈現（`render/tension/`、`audio/`、`LevelEntry.mood`），依賴規則與 `validateMood`；`Settings.calmTension` |
> | v0.2（提示改便利貼） | 2026-11-02 | 移除提示角色與提示面板；提示改為場景 `note` 物件（`hint` 屬性、延遲顯字、預算檢查）；L4 改為暫停選單解答手稿頁（規格 7.1、7.1.2、7.1.3、H10） |
> | v0.2 | 2026-11-02 | 第 9 節 Q1～Q5 全部確認（照建議）；提示系統改為三級全抽象 + L4 解法筆記 + 提示驗證器（規格 7.1、7.1.1、7.1.2）；`HintDef` / `PuzzleDef` / `Settings` 格式更新；謎題 id `1-2a`～`1-2d`、`5-5a`～`5-5c` |

> 狀態：草案（2026-11-02），對應 `game-spec-v0.2.md`（下稱「規格」）與 `story-bible-v0.2.md`（下稱「劇情」）。基準程式為 commit `52635aa` 的 `src/puzzle/`（20 檔、約 2.3k 行）與 `tests/puzzle/`（36 個測試；全專案 `vitest run` 共 584 個測試）。
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
| H16 | `hud.ts:33,44`、`hud.ts:6-14` | 「現實 / 圖紙」「筆尖」、單一 `KEY_ICON`、`setInventory(boolean)` | 劇情 4 節改名（實景 / 藏寶圖 / 鋼筆筆尖）；多物品無法顯示 |
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
| L1 機制 | `mechanics/` | 每檔一個機制（壓板、連動、物品、魔方機關、標籤、尺度、管線、光路…；v0.3），經掛點插入核心 | `core/`；其他 mechanics（須無環，見 4.2） |
| L2 內容 | `content/` | 關卡、章節、物品表、提示、文字表（純資料） | `core/`、`mechanics/` 的**型別**（`import type`） |
| L2' 文字 | `text/` | `t(key, params)`、插值、詞彙表解析（純函式） | 無 |
| L3 外圍規則 | `meta/` | 存檔 / 遷移、設定、統計、解鎖、提示策略（純函式＋注入 storage） | `core/`、`content/`、`text/` |
| L4 呈現 | `render/`、`ui/`、`input/`、`audio/` | three 場景、DOM HUD / 選單、輸入來源 | `render`→`core`；`ui`→`text`；`input`→`core`（型別） |
| L5 外殼 | `app/` | 主迴圈、畫面狀態機、把上述接起來 | 全部 |
| 工具 | `devtools/` | 關卡驗證器、腳本回放、捷徑掃描（純函式，測試與開發用） | `core`、`mechanics`、`content`、`meta`、`text` |

> v0.3：魔方不新增層。章節層級狀態（`core/cube.ts` 魔方運算、`core/chapter.ts` ChapterSession）屬 L0 核心：純函式、可 JSON 序列化、不 import mechanics（建立房間 `World` 時由呼叫方傳入機制表，比照 `createWorld`）；轉動機關、標籤、尺度屬 L1 機制；展開圖的資料推導屬 `app/`（純函式），繪製屬 `ui/`。2.2 矩陣不變。

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

另：`audio/` 的權限同 `render`（DOM / Web Audio 可用，不得 import three 以外的裸模組）；`render/tension/` 與 `audio/` 對 `content` 只能 `import type` `content/moodTypes.ts`（4.13）；`ui/cutscene.ts` 與 `render/cutscene/` 對 `content` 只能 `import type` `content/cutsceneTypes.ts`（4.15）；`core / mechanics / meta / text / devtools` 不得 import `render/`、`audio/`。`src/puzzle/**` 不得 import `src/puzzle` 以外的專案檔（GTA 隔離，含 `src/audio/`）；`src/**` 其餘檔案不得 import `src/puzzle/**`。`render` 讀 `core` 只用查詢函式（`isActiveIn`、`allObjs`），不得呼叫會改狀態的函式（4.7 規則，測試以白名單檢查）。

### 2.3 可自動檢查的依賴規則（測試設計，不實作）

`tests/puzzle/architecture.test.ts`：
1. 以 `fs` 遞迴列出 `src/puzzle/**/*.ts`，用正規式擷取 `import … from '…'`、`import('…')`、`export … from '…'`，並記錄是否為 `import type`。
2. 依路徑第一段決定層（`core/…` → core；根目錄 `main.ts` 視為 app）。相對路徑解析成目標檔再判層；裸模組只允許 `three`（且只在 render / app）。
3. 對照 2.2 矩陣，違規列出 `檔案 → 目標（層）`，非空即失敗。
4. 額外字串規則：`core/`、`mechanics/`、`content/`、`meta/`、`text/`、`devtools/` 以及 `input/touch.ts`、`input/touchLayout.ts`、`input/merge.ts`（觸控純邏輯）內不得出現 `document.`、`window.`、`localStorage`、`performance.now`、`Date.now`、`Math.random`（確定性與 Node 可跑）。
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
    actions.ts               WorldAction、ActionFrame、ACTION_ORDER（v0.3：`commands` 帶參數的指令，4.16）
    cube.ts                  v0.3：CubeDef / CubeState、applyOp（拉桿的 slide）、links（連接表）；v0.4：TurnGroup / Turn、applyTurn（row / col / slideCell / layer / slice）、inverseTurn（純函式，4.16）
    chapter.ts               v0.3：ChapterSession（換房、房間快照、進房快照、跨房物件、章節道具 / 旗標 / 字卡；4.16）；v0.4：dialTurn / undoTurn / activateDial / turnBudgetFor / unlockedGroups、回退堆疊清空規則
  mechanics/                 L1 每檔一機制
    index.ts                 DEFAULT_MECHANICS（註冊順序即執行順序）
    basics.ts                floor/wall/rail/table/plinth/shelf/crate 類型宣告（無行為）
    items.ts                 C8/N9：物品、requires/grants、key/pickup/inklock 類型
    links.ts                 C7/N10/N13：opens 連結、gate/inkwall/inkbridge、延後關閉
    plates.ts                C6/N2/N3/N4/N14：壓板計重
    notes.ts                 C14：字條
    exit.ts                  出口門 → cleared
    （pin.ts / light.ts / section.ts / mark.ts：v0.3 自計畫移除，N5 / N6 / N7 / N8 / N15 / N16 退役；6.1～6.4 保留作設計紀錄）
    cube.ts                  v0.3 N21：lever / cubeDoor 類型、轉動請求、門後是牆、轉不動判定（4.16）
    dial.ts                  v0.4 N32：魔方儀（dial 類型，3D 啟動 → dialActivate 事件）、轉動模式的進入條件查詢（2D、站穩）（4.16）
    labels.ts                v0.3 N22：標籤、字卡貼取、詞典效果（方向字、門牌「間」、字謎）（4.17）
    scale.ts                 v0.3 N23：尺度三檔、碰撞 / 支撐 / 重量重算、卡牆檢查（4.18）
    reveal.ts、pipes.ts、lightpath.ts、locks.ts、combine.ts、balance.ts、mini.ts  v0.3 N24～N30（4.19）
    chase.ts                 N19：追逐（守衛殘影路徑、2D 限定判定、檢查點、減弱模式自動通過；4.14）；v0.3 加 N31 跨房追逐（4.19）
  content/                   L2 純資料
    items.ts                 ITEMS 物品表（nib/inkdrop/seal/diary/scrap；v0.3 加章節道具）
    cards.ts                 v0.3：CARDS 字卡表（詞卡 / 部件卡 / 尺度卡）
    lexicon.ts               v0.3：詞典（字 → 效果、同義字、無效字）（4.17）
    cubes/ch<N>.ts           v0.3：各章 CubeDef（初始排列、屋框、轉動方式）；v0.4：control（lever / dial）、dial.groups / locks / miniOnly
    chapters.ts              CHAPTERS（章、主題 id、旁白 key；主題 = 森林中的圖書館各章，規格 9.3）
    moodTypes.ts             MoodDef 純型別（零依賴，4.13）
    cutsceneTypes.ts         CutsceneDef / ShotDef 純型別（零依賴，4.15）
    cutscenes/*.ts           每場過場一檔（cs:prologue … cs:endB）
    levels/index.ts          LEVELS 登錄表（id、章、解鎖、def）
    levels/ch1/1-2-foyer.ts  現有玄關（export 名仍為 foyer）
    levels/ch1/…、ch2/…      各關一檔（22 + 3）
    text/zh-Hant/index.ts    zh-Hant 文字表（ui / msg / obj / lvl / note / guide / story / term 分檔）
  text/                      L2' 文字系統
    text.ts                  createText(bundle, fallback)、插值、[[term.*]] 解析
  meta/                      L3 外圍規則
    storage.ts               KeyValueStorage 介面、memoryStorage
    save.ts                  SaveV2、loadSave / writeSave、遷移鏈
    settings.ts              Settings、預設值、校正
    stats.ts                 puzzle:stats
    progress.ts              解鎖規則、能力計算
    hints.ts                 NoteRevealStrategy（timed/always/off）、卡關偵測、解答手稿解鎖
  input/                     L4 輸入
    types.ts                 InputSource、Bindings、ShellAction
    bindings.ts              DEFAULT_BINDINGS、重綁合併
    keyboard.ts              KeyboardSource（取代 input.ts）
    touch.ts                 TouchSource：搖桿、死區、按鈕狀態機（純邏輯，不碰 DOM；mobile-controls 5）
    touchLayout.ts           觸控版面矩形與情境式按鈕可見性（純函式）
    merge.ts                 mergeSources：鍵盤 + 觸控並存
  render/                    L4 three
    scene.ts                 PuzzleScene：依 allObjs 對帳（新增 / 移除 / 更新）
    cameras.ts               沿用
    materials.ts             Painter 沿用（2D/3D 雙材質）
    geometry.ts              同材質零件合成一個網格（mergeParts / placed；render 不能 import three/examples）
    textures.ts              沿用
    transitions.ts           Transition 介面：inkFade、plainFade（減少動態）
    markers.ts               P4 形狀符號裝飾（2D 專屬墨點、3D 專屬框、標籤墨框與尺度方槽、字條浮現字跡與邊角發光；v0.3）
    themes/index.ts          Theme 登錄表；palette.ts 拆成 base + ink 三組；各章主題（入口、書庫、溫室、根窖、觀星閣樓、林心草地；色板見 story-bible 8.2）
    models/index.ts          MODELS 登錄表（type → ModelFactory）、fallback 盒模型
    models/*.ts              沿用 props/devices/key/player/room；新類型一檔
    decor/index.ts           DecorKind → 建構函式（掛畫、吊燈、地毯、樹根、藤蔓、苔蘚、浮書、彩繪玻璃、星圖、魔法陣刻紋…由關卡資料擺放；非實體）
    decor/furniture.ts       家具裝飾：扶手椅、落地燈、書堆、書梯（v0.4 擺設規則；只在實景、非實體）
    debug.ts                 DEV：碰撞盒線框（可選）
    tension/director.ts      TensionDirector：氛圍、詭異裝飾事件、驚嚇、暈影、色溫、鏡頭緩推（4.13）
    models/chaser.ts         N19 守衛殘影外觀（只在藏寶圖）
  audio/                     L4 最小 Web Audio 合成（4.13）
    synth.ts                 PuzzleAudio：章節底音、分層音軌、脈動低音、鐘音、驚嚇音、限幅器、回饋音
  ui/                        L4 DOM
    hud.ts                   依 HudModel 繪製（模式、物品列、互動提示、吐司）
    cubeMap.ts               v0.3：2D 展開圖與轉動預覽（DOM / Canvas 2D 疊層）；v0.4：轉動模式（標頭箭頭、確認 / 回退 / 離開鈕、墨點、鎖扣、卡榫；鍵盤與觸控）
    cardTray.ts              v0.3：字卡匣（卡片列、貼 / 取、無效字回饋；含觸控）
    icons.ts                 物品 id → SVG
    touchOverlay.ts          觸控疊層 DOM、Pointer Events、pointer capture、阻止瀏覽器手勢；事件經 TouchSink 交給 app
    screens/*.ts             nickname、menu、clear、ending、journal（日誌 / 元謎題）、notes（H：重看已出現的字條，唯讀）、guide（許問津的解答手稿頁，解答模式）
    puzzle.css               沿用
  app/                       L5 外殼
    app.ts                   畫面狀態機
    loop.ts                  主迴圈（固定步長）、過場鎖
    cutscene.ts              過場時間軸狀態機（純邏輯：鏡 / 段 / 淡入停留淡出、minDwell、自動播放、跳過確認、暫停；4.15）
    hudModel.ts              deriveHud(world, text, …) 純函式
    cubeMapModel.ts          v0.3：deriveCubeMap(session, previewOp?) 純函式（展開圖、接通線、預覽）；v0.4：deriveTurnMode、reduceTurnMode（轉動模式的選取狀態機，純）
    services.ts              組裝 storage/save/settings/text/theme
  devtools/                  工具（純）
    validateLevel.ts         schema 與內容規則
    script.ts                通關腳本 → ActionFrame 序列（取代 tests helpers 的控制器）
    shortcutScan.ts          捷徑掃描器
    validateCube.ts          v0.3：章節抽象模型 BFS（有解、卡死、最短步數、捷徑；規格 5.4.8）；v0.4：控制盤模型（預算、鎖扣、魔方儀）、多解列舉、預算繞過、鎖定可達、入口可達、狀態量上限（規格 5.4.8 ⑥～⑪）
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
export type AbilityId = 'nib' | 'scale' | 'mini';   // v0.3：寫、量、縮影房內的主角縮小（規格 8 save.abilities；原 'pin' | 'section' | 'mark' 退役）
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
  | { t: 'flag'; flag: string } | { t: 'item'; id: ItemId; n: number } | { t: 'cleared' }
  | { t: 'chase'; id: string; s: 'start' | 'caught' | 'end' | 'autoPass' };   // N19（4.14）

export interface ActionFrame { moveX: number; moveZ: number; jump: boolean; pressed: readonly WorldAction[] }
export type WorldAction = 'flip' | 'reset' | 'interact';   // v0.3：pin / section / mark 退役；寫、量、轉動經 interact 與 ActionFrame.commands（4.16、4.17）
export const ACTION_ORDER: readonly WorldAction[] = ['flip', 'reset', 'interact'];

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

**註冊方式**：`mechanics/index.ts` 匯出 `DEFAULT_MECHANICS = [basics, items, links, plates, notes, exit, cube, dial, labels, scale, reveal, pipes, lightpath, locks, combine, balance, mini, chase]`（v0.3；原 `pin, section, light, mark` 移除；v0.4 加 `dial`）。**陣列順序 = 執行順序**；`createWorld` 必須傳入機制表（核心不 import mechanics，測試可只傳子集）。不做全域副作用註冊（import 順序決定行為會讓測試不穩定）。

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

export interface Region { id: string; minX: number; maxX: number }              // Q-C 墨記區域（x 分區；2D 只有 x）；v0.3 隨 N16 退役，不實作
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
- （v0.3：N8 退役，本條僅作紀錄）**剖面（N8）不是第三種模式**，是 `presence` 掛點：在 2D 依 `player.z3d` 過濾。因此 solids、壓板計數、互動、渲染全部自動吃到剖面。
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
- **P4 形狀符號**（規格 7.2）由 `markers.ts` 依特性統一加：`visible:'2d'` → 墨點、`'3d'` → 實線框、可寫標籤 → 墨框、可貼尺度卡 → 方槽、縮放中 → 大 / 小角標（v0.3；原印框、剖面斜線、影子網點隨 N5 / N8 / N6 退役）。新物件類型不必各自畫符號。
- 主題切換 = 重建場景（只在設定變更或換關時發生，不影響切換視角的流暢度）。
- 效能：切換視角只換材質與相機（現況做法）；derived 物件 id 穩定（`light:shadow:<casterId>`），對帳只在增減時建 / 拆模型，縮放走 `update`。數百物件不需 instancing〔推論〕。

### 4.6 輸入層（`input/`）

```ts
export type ShellAction = 'restart' | 'notes' | 'menu' | 'map' | 'cards' | 'turnMode' | 'undo';   // v0.3：map 展開圖、cards 字卡匣 / 道具欄；v0.4：turnMode（展開圖開著時進出轉動模式）、undo（回退一步）   // 'skip' 移到解答手稿頁內（只限擴充題）
export type InputAction = WorldAction | ShellAction;
export type Axis = 'left' | 'right' | 'up' | 'down' | 'jump';
export type Bindings = Record<InputAction | Axis, string[]>;   // KeyboardEvent.code
export const DEFAULT_BINDINGS: Bindings;  // F/Q flip、E interact（3D 拉機關、2D 對標籤開字卡匣）、T reset、R restart、M map（2D 展開圖，ShellAction）、H notes（重看已出現的字條；規格 7.1）。v0.3：G / C / V 退役

export interface InputSource {
  /** 每幀取樣：持續軸 + 本幀新按下的動作（取走即清空） */
  poll(): { moveX: number; moveZ: number; jump: boolean; pressed: InputAction[]; anyKey: boolean };
  clear(): void;
  releaseAll(): void;   // 確認窗開關、失焦、背景、翻轉時：視為全部放開（已實作於 KeyboardSource）
  dispose(): void;
}
export class KeyboardSource implements InputSource { constructor(bindings: Bindings) }
export function mergeSources(sources: InputSource[]): InputSource;   // input/merge.ts：軸取絕對值較大者、jump OR、pressed 依 INPUT_ACTIONS 聯集

// input/touch.ts（純邏輯）
export type TouchControlId = 'stick' | 'jump' | 'flip' | 'interact' | 'reset' | 'pause' | 'notes' | 'map';   // v0.3：pin / section / mark 移除、加 map；v0.4：轉動模式的標頭 / 確認 / 回退 / 離開鈕屬 ui/cubeMap 的 DOM 按鈕，不是疊層控制元件（mobile-controls 2.5）
export class TouchSource implements InputSource {
  constructor(opts: { deadZone: number /* 0.15 */; full2d: number /* 0.6 */; holdMs: { reset: number /* 500 */ } });
  setContext(c: { mode: Mode; layout: TouchLayout; visible: readonly TouchControlId[] }): void;
  down(id: number, x: number, y: number, tMs: number): void;   // 依 layout 把手指分配給一個元件（之後只屬於它）
  move(id: number, x: number, y: number, tMs: number): void;
  up(id: number, tMs: number): void;
  cancel(id: number): void;
}
// input/touchLayout.ts（純函式）
export function layoutTouch(view: { w: number; h: number; safe: Insets }, s: Pick<Settings, 'handedness' | 'buttonScale'>): TouchLayout;
export function visibleButtons(ctx: { screen: string; mode: Mode; canInteract: boolean; abilities: readonly AbilityId[]; hasPushable: boolean; notesSeen: boolean }): TouchControlId[];
// ui/touchOverlay.ts（DOM）：ui 不得 import input，故自行宣告 TouchSink，TouchSource 以結構型別符合、由 app 接線
export interface TouchSink { down(id: number, x: number, y: number, tMs: number): void; move(...a: [number, number, number, number]): void; up(id: number, tMs: number): void; cancel(id: number): void }
```

- 重綁：`settings.keys` 覆蓋 `DEFAULT_BINDINGS`；操作說明由 `ui` 依 bindings 產生（修 H17）。
- v0.4 轉動模式鍵位（`DEFAULT_BINDINGS` 新增）：`turnMode` = Tab（展開圖開著、2D、站穩、本章魔方儀已啟動時才有效）；轉動模式中 app 把方向軸改讀為「選標頭」（←→ 換列 / 層 / 片、↑↓ 換行；WASD 同），`confirm` = Enter、`undo` = Z / Backspace、`cancel` = Esc（離開轉動模式）；移動輸入在轉動模式中不送進 `step`（`releaseAll`）。字卡匣與轉動模式互斥（同時只開一個疊層）。
- 新增輸入方式：新增一個 `InputSource` 並在 `app` 以 `mergeSources` 合併（觸控見 `mobile-controls-v0.1.md` 第 5 節；偵測 `(pointer: coarse)` / `ontouchstart` 與 `Settings.touchLayout`）。
- 觸控模式下 `deriveHud` 的互動提示改用 `ui.prompt.touch`，操作說明改由 `deriveTouchHelp(layout)` 產生；暱稱、確認窗、通關畫面時隱藏觸控疊層並 `releaseAll`。

### 4.7 應用外殼（`app/`）

```ts
type Screen =
  | { id: 'boot' } | { id: 'nickname' } | { id: 'menu' }
  | { id: 'level'; levelId: string } | { id: 'clear'; levelId: string }
  | { id: 'journal' } | { id: 'ending'; which: 'A' | 'B' }
  | { id: 'cutscene'; cutsceneId: CutsceneId; next: Screen };   // 4.15
// boot →(無暱稱) nickname →(未看序章) cutscene(prologue) → level 1-1；clear →(該關有未看過場) cutscene → (下一關 | menu)；6-1 → cutscene(endA|endB) → menu；選單「回憶」→ cutscene → menu
```

資料流（單向）：

```
InputSource.poll ─► ShellAction ─► App（restart/notes/menu）
                └─► ActionFrame ─► step(world) ─► world.events ─► meta（字條顯字計時與卡關計數、stats、save）
                                         │
                                         ├─► deriveHud(world, text, noteState, bindings) ─► ui.render(HudModel)
                                         └─► PuzzleScene.update(world)
UI 按鈕 ─► App 指令（不直接改 world）
```

- `app/loop.ts`：固定步長 1/60 累加器（測試 `DT=1/60` 相同；決策 Q4 已確認）、過場鎖 0.3 秒期間不呼叫 `step`（沿用 `game.ts:90-101` 語意）。
- `deriveHud` 是純函式（可在 Node 測）：`{ modeText, items: {id, n}[], prompt, toast, narration, newNoteGlow }`（`newNoteGlow` 只是「有新字條浮現」的小圖示狀態，不顯示內容）；`ui/hud.ts` 只做 diff 後寫 DOM。
- 畫面狀態機用一個 `switch` + `enter/exit`，不引入狀態機函式庫（只有 7 個狀態）。

### 4.8 內容載入（`content/levels/index.ts`、`meta/progress.ts`）

```ts
export interface LevelEntry {
  id: string; chapter: 1 | 2 | 3 | 4 | 5 | 6 | 'H';
  def: LevelDef;
  unlock: Unlock; core: boolean;   // core：只做核心題時的範圍篩選（規格 6.9）
  mood?: MoodDef;                  // 氛圍 / 緊張 / 驚嚇呈現資料（4.13；全遊戲，強度依規格 9.1）
  chases?: ChaseDef[];             // N19 追逐走道（4.14；只在 3-4、4-4、5-5）
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

/** v0.3：SaveV3 = SaveV2 + cards + chapters（ChapterState，4.16）、abilities 改 'nib' | 'scale'；MIGRATIONS[2] 丟棄 pin / section / mark、已通關 1-2 → 第一章快照預設 1-2a / 1-2b 旗標（規格 8）
 *  v0.4：chapters[n] 增補選填 dial / unlocked / turns（4.16.1）；不升版號、不加 MIGRATIONS 項，由校正函式補預設（dial:false、unlocked:[]、turns = 該房基礎預算 + 空堆疊）；turns 不合法（left 超出 0～預算、undo 過長或組 id 不存在）→ 只丟棄該章 turns */
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
export function loadSettings(s: KeyValueStorage): Settings;   // { hints, guideMode, noteScale, calmTension, autoAdvance, textSpeed, skipConfirm, inkPalette, reduceMotion, keys, touchLayout, handedness, buttonScale, buttonOpacity, haptics, jumpCarry, quality }（guideMode / calmTension 預設 false，規格 8）
export function recordPuzzle(s: KeyValueStorage, id: string, delta: Partial<PuzzleStat>): void;
```

- **壞資料回退**：JSON 解析失敗或校正後不合法 → 原字串備份到 `puzzle:save:corrupt`、回傳預設存檔，不丟例外（遊戲照樣能開）。校正是手寫 type guard（不引入 zod 等相依）。
- 關內不存檔（規格 Q4）：`snapshot` 只供記憶體內使用（回到謎題開始、Boss 階段），不寫 storage。

### 4.10 提示系統（場景字條：`content` 資料 + `meta/hints.ts` + `render/markers.ts`；無提示面板、無對話框）

規格 7.1：提示只用場景裡的字條（`type:'note'`），沒有提示角色。L1 一開始可讀；L2、L3 是空白字條，時間到或卡關偵測才「浮現字跡」。

```ts
export interface PuzzleDef {
  id: string;                       // '1-2a'～'1-2d'、'5-5a'～'5-5c'（決策 Q3，已確認）
  core: boolean;
  difficulty: number;               // 規格 6 的難度；驗證器據此檢查字條預算（規格 7.1.3）
  stuckProne?: boolean;             // 「易卡關」：難度 3～4.5 也可放 L2
  doneFlag: string;                 // 完成判定，例 'item:nib'、'on:plate'、'zone:exit'
  area: Box2;                       // 謎題範圍（x、y），提示字條必須在內（驗證器）
  aha: TextKey;                     // 本題 aha 一句（審稿用，不顯示），H10 人工比對
  ahaTerms: string[];               // H10 自動比對詞表（例 2-1b：['深度','疊','並排','左右']）
  keyObjects: ObjId[];              // H4：字條不得點名
  solutionKey: TextKey;             // 解答手稿頁內容（規格 7.1.2）
}

/** 提示字條 = 一般 note 物件多一個 hint 屬性；位置、可見模式（預設 both）都在關卡資料裡 */
export interface NoteHint { puzzle: string; level: 1 | 2 | 3; truthRef: string }
// ObjDef（4.3）新增選填欄位：hint?: NoteHint；文字 key = `note.<puzzleId>.<1|2|3>`

export interface NoteState { puzzleId: string | null; revealed: Record<ObjId, true>; sinceSec: number; guideReady: boolean }
export interface NoteRevealStrategy {
  /** realSec 為真實經過秒數（暫停不計）；events 為本幀 world.events */
  update(s: NoteState, realSec: number, events: readonly GameEvent[]): NoteState;
}
export const NOTE_STRATEGIES: Record<'timed' | 'always' | 'off', () => NoteRevealStrategy>;
```

- **目前謎題** = `level.puzzles` 中第一個 `doneFlag` 未成立者（關內謎題線性，規格 6；〔推論〕5-x 若需並行再加欄位）。新旗標事件 → 計時與計數歸零。
- **顯字計時**：L1 不計時（場景物件，`always` 可讀）；L2 進入謎題 4 分鐘、L3 8 分鐘。`always` = 一開始就顯字；`off` = L2、L3 字條不生成（L1 照常）。
- **卡關偵測**只吃 `world.events`：`reset ≥3`、`switch ≥12 且無 flag`、`fall ≥3` → 下一張空白字條提前顯字；不影響解答手稿以外的任何東西。
- **「字條浮現」事件**：`meta/hints.ts` 產生 `{ type:'noteRevealed', id }` 給 app；app 把 `revealed` 寫進 `world.ext.notes`（供 `interact` 讀到文字：未顯字時互動只顯示「這張還是空白的。」），`render/markers.ts` 依 `revealed` 畫字跡淡入與邊角發光，HUD 只亮 `newNoteGlow` 小圖示。不彈窗、不暫停遊戲。
- **解答手稿**（規格 7.1.2，暫定）：`guideReady` 在進入謎題 10 分鐘後成立（卡關偵測可縮至 6 分）或 `Settings.guideMode` 開啟；`ui/screens/guide.ts` 在暫停選單顯示，打開前需確認警語；擴充題（`core === false`）另有「跳過此題」，寫入 `stats.skipped`。
- C9「看得見，卻碰不到」仍由核心 `say('msg.unreachable')`，是系統訊息，無說話者。

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

- key 命名：`ui.*`（HUD / 選單）、`msg.*`（系統訊息）、`obj.<type>.*`（類型預設 label / verb）、`lvl.<levelId>.*`（標題、旁白、字條、物件 label）、`note.<puzzleId>.<1|2|3>`（提示字條；劇情字條仍在 `lvl.<levelId>.note.*`）、`guide.<puzzleId>`（解答手稿）、`story.*`（旁白、許問津的手記 `story.diary.<1..5>`、老宅圖殘片背面 `story.scrap.<1..6>`、結局 `story.ending.<A|B>`）、`term.*`（詞彙表）。
- 觸控 key（`mobile-controls-v0.1.md` 5）：`ui.prompt.touch`、`ui.touch.btn.<控制 id>`（aria-label）、`ui.touch.hold`、`ui.touch.rotate`、`ui.help.touch.*`、`ui.settings.touch.*`；不得在 `ui/touchOverlay.ts` 寫死文字。
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

**驗證器規則**（每條附規格依據）：id 唯一；類型已註冊；`opens/requires/grants` 參照存在；`requires` 的能力在 `abilities` 或關內可得（規格 8）；**字條預算**（規格 7.1.3）：每題提示字條張數符合難度表（`stuckProne` 例外）、每關提示字條 ≤ 謎題數 + 1、每關字條總數（提示 + 劇情）≤ 謎題數 + 3、同一 2D 畫面寬（約 16）內 ≤ 3 張且間距 ≥ 3；每張提示字條位於所屬謎題 `area` 內、兩模式都站得到（重用 `place` 檢查）、`note.*` 與 `guide.<id>` key 存在；**字條 lint**（規格 7.1.1 H1～H4、H10）：L1 ≤24、L2 ≤30、L3 ≤36 字（署名不計），禁用祈使開頭與動詞清單、按鍵名、方位精確詞、任何數字，不得含 `keyObjects` 的 label / 顯示名，不得含該題 `ahaTerms`（H5～H10 語意部分為人工審稿與 G1 試玩項）；起點與檢查點在兩模式站得住（現有測試 `puzzleLogic.test.ts:24`）；全遊戲 diary=5、scraps=6 且位置符合劇情 6.1；所有 `*Key` 在 zh-Hant 存在；各機制 `validate`。
**捷徑掃描**是取樣器而非求解器：誠實地說，它只能證明「取樣到的配置 × 探針」沒有捷徑；探針與取樣格由寫關卡的人負責。成本估計：3 箱 × 10×6 格 × 數個玩家點 × 6 探針，每探針 ≤3 秒模擬，單關約數秒〔推論〕。
**通關回放**：每關一個 `tests/puzzle/levels/<id>.test.ts`，以 `runScript` 從 `createWorld` 走到 `cleared`。
**Debug 疊層**（可選，DEV only）：`render/debug.ts` 畫 `solidsFor(renderMode)` 線框與 flags 清單；`main.ts` 已有 `window.__puzzle`（`main.ts:5`）沿用。

### 4.13 氛圍、緊張與驚嚇呈現（`render/tension/`、`audio/`；規格 9.1）

全遊戲使用，強度逐章上升（規格 9.1 曲線）；**純呈現層**，核心與機制不知道它存在。四種詭異手法（只在藏寶圖出現的守衛殘影、不一致的影子、魔方轉動後的小變化（v0.3）、切換瞬間換位的裝飾）全部是 decor，不是 `ObjDef`。

- **資料位置**：放在 content 層 `LevelEntry`（4.8）的 `mood?: MoodDef` 欄位，**不放進 core 的 `LevelDef`**（否則核心型別得認識呈現資料）。型別在 `content/moodTypes.ts`（純型別、零依賴）。

```ts
// content/moodTypes.ts
export interface MoodDef {
  intensity: 0 | 1 | 2 | 3;                         // 關卡基準；Boss 由 stages 覆寫
  light?: { intensity: number /* 0.55～1 */; breathe?: { amp: number /* ≤ 0.1 */; periodSec: number /* ≥ 3 */ } };
  fog?: { near: number /* ≥ 12 */; far: number /* ≥ 28 */ };
  saturation?: number;                              // 0.6～1
  vignette?: { edgeDark: number /* ≤ 0.30 */; clearCenter: number /* ≥ 0.75 */ };
  tint?: { hue: 'cool' | 'warm'; amount: number /* ≤ 0.12 */; fromFlag?: string };
  cameraDrift?: { dolly3d: number /* ≤ 0.10 */; zoom2d: number /* ≤ 0.08 */; inSec: number /* ≥ 8 */; outSec: number /* ≥ 2 */ };
  ambience: { bed: 'pad' | 'drone' | 'layers' | 'dawn'; layers?: Array<'pad' | 'pulse' | 'arp'>; pulseBpm?: [number, number] /* 60～96 */; droneHz?: number /* 40～80 */ };
  events: MoodEventDef[];
  stages?: Array<{ untilFlag: string; patch: Partial<MoodDef> }>;   // Boss 三階段，以階段旗標切換
}
export interface MoodEventDef {
  id: string;
  kind: 'sketchFigure' | 'mismatchShadow' | 'pinEcho' | 'swapOnSwitch' | 'envStep' | 'silenceThenChime' | 'tintShift' | 'cameraDrift' | 'scare';
  on: { flag?: string; switchNth?: number[]; pinRecall?: true; chase?: 'start' | 'end'; cleared?: true };
  category: 'env' | 'sound' | 'visual';
  strong?: boolean;                                 // 同時最多兩類（規格 9.1）
  decorIds?: string[];                              // 只能指向 decor，保證無碰撞、不可互動
  calmVariant?: 'skip' | 'gentle';                  // 減弱模式下：不播 / 改平靜版（驚嚇必須是 'gentle'）
}

// render/tension/director.ts
export interface TensionDirector {
  load(def: MoodDef | undefined, calm: boolean): void;   // calm = Settings.calmTension
  update(dt: number, events: readonly GameEvent[], view: { mode: Mode; puzzleArea: Box2 | null }): void;
  dispose(): void;
}
// audio/synth.ts（新增；最小 Web Audio 合成，不得 import src/audio/）
export interface PuzzleAudio {
  setBed(bed: MoodDef['ambience']['bed'], fadeSec: number): void;
  setLayers(layers: readonly ('pad' | 'pulse' | 'arp')[], fadeSec: number): void;
  setPulseBpm(bpm: number, rampSec: number): void;
  chime(afterSilenceSec: number): void;
  sting(calm: boolean): void;                             // 驚嚇音；經限幅器（門檻 -6 dBFS）；calm 時改柔和聲
  thump(): void;                                          // 關鍵動作回饋音
  setViewFilter(mode: Mode): void;                        // 藏寶圖低通 1.2 kHz / 實景 4 kHz
  stopAll(): void;
}
```

- **單向事件匯流**：core → `world.events`（`switch`、`flag`、`fall`、`cleared`、`chase`）→ `app/loop.ts` → `TensionDirector.update` / `PuzzleAudio`。director 只讀、不回寫 world；Boss 階段以旗標表示（`stages[].untilFlag`），與 4.3 的 `phases` 同一組旗標。（v0.2 的「回到圖釘」`mark:recalled` 隨 N16 退役；v0.3 手法 C 改由 `turnRequest` 成功後的 `flag:'cube:turned'` 觸發。）
- **預算執行**（規格 9.1）：director 內部檢查同時類別 ≤ 2、事件最小間隔、驚嚇前後留白（前 ≥ 2 秒、後 ≥ 15 秒）、謎題開始 60 秒 / 重生 10 秒 / 字條浮現 5 秒靜默窗、事件不落在目前謎題 `area` 內。
- **減弱緊張效果**（`Settings.calmTension`，預設 false）：`load(def, true)` 時暈影、色溫、鏡頭推近、脈動低音、環境漸變與詭異裝飾事件停用，驚嚇改 `gentle`；**追逐自動通過屬邏輯效果，由 4.14 的 `chase` 機制處理**（`createWorld` 的 `options.calmTension`），不靠呈現層。
- **依賴規則**：`render/tension/`、`audio/` 可 `import type` `content/moodTypes.ts` 與 `core` 的 `GameEvent`；`core/`、`mechanics/`、`meta/`、`text/`、`devtools/` 不得 import `render/` 或 `audio/`；`content/moodTypes.ts` 不得 import 任何檔（2.3 測試加一條）。
- **測試策略**：邏輯測試不載入 tension / audio，因此不受影響；`devtools/validate.ts` 加 `validateMood(LEVELS)`：參數上下限（上方註解）、強度曲線與規格 9.1 一致、事件數 ≤ 強度上限、驚嚇每章 ≤ 1 且 `calmVariant === 'gentle'`、`decorIds` 只指向 decor；`TensionDirector` 的預算邏輯以假事件序列在 Node 單元測試（不碰 three）；限幅器與音量以 `OfflineAudioContext` 在瀏覽器測試量峰值〔推論〕；視覺與聽覺以 G1 / 各里程碑人工試玩檢查。

### 4.14 N19 追逐（`mechanics/chase.ts`；規格 4.2）

**確定性邏輯，放機制層**；守衛殘影的外觀放 `render/models/chaser.ts`（依 `allObjs` 對帳，與其他物件相同）。

```ts
export interface ChaseDef {
  id: string;                        // 例 'chase:3-4'
  startFlag: string;                 // 進入走道（zone 旗標）
  endZone: Box2;                     // 抵達即結束 → flag `${id}:done`
  checkpoint: { x: number; y: number; z: number };
  path: Array<{ x: number; y: number }>;   // 只沿 x 前進、貼地；位置 = f(觸發後模擬時間)
  speed: number;                     // 2.6（規格 Q-H 暫定）
  lead: number;                      // 起跑落後 ≥ 6
  assistAfterCaught: number;         // 3 → 速度 ×0.8
  region: string;                    // v0.2 為圖釘區域；v0.3 N16 退役，此欄移除（走道是獨立房間區段）
}
// 機制掛點（4.2）：
//   init   ：每個 ChaseDef 生成一個 ObjState{ def:{ type:'chaser', visible:'2d', solid:false } }（不擋路、不算重量、不可蓋印、不投影）
//   presence(2d)：恆 true（不受剖面過濾）
//   afterStep：若已觸發 → 依 t 推進位置；玩家在 2D 且 x-y 盒重疊 → respawn 到 checkpoint、重置 t、caught+1、emit { t:'chase', s:'caught' }
//              抵達 endZone → setFlag(`${id}:done`)、emit { t:'chase', s:'end' }
//   options.calmTension：startFlag 成立時直接 setFlag(`${id}:done`)、emit { t:'chase', s:'autoPass' }，不生成殘影
```

- 走道位於謎題 `area` 之外；`validate` 檢查：走道與任何謎題 `area` 不相交、走道沒有可推物、`region` 與相鄰區域不重疊、`startFlag` 只在某題 `doneFlag` 之後可達（規格：追逐不屬於任何謎題）。
- **測試策略**（規格 4.2）：`runScript` 腳本回放——成功路徑必過；一直待在 2D 必被追上且旗標不變；同輸入兩次逐幀位置相同；`calmTension` 下進入即通過；被追上 3 次後速度 ×0.8；加入走道後該關既有通關腳本與捷徑掃描結果不變。


### 4.15 過場系統（劇情演出；`cutscenes-v0.1.md` 6）

| 檔案 | 層 | 職責 |
|------|----|------|
| `content/cutsceneTypes.ts` | content | 純型別（零依賴）；ui / render 以 `import type` 使用（比照 `moodTypes.ts`，2.3 例外清單加入） |
| `content/cutscenes/*.ts` | content | 每場一檔：鏡頭（剪紙 `paper` 或引擎 `engine`）、文字 key `cs.<id>.<鏡>.<段>`、轉場、音訊提示；**不寫秒數** |
| `text/readingTime.ts` | text | `readingSeconds(s, { cps, nameLen })` = `max(3, 1.5 + n/cps + 標點停頓)`；純函式 |
| `app/cutscene.ts` | app | 時間軸狀態機（純邏輯，可 Node 測）：淡入 → 停留（`minDwell` 1.2 秒後才接受推進）→ 淡出；自動播放、跳過確認（與重新進房共用 300 ms 確認保護）、暫停 |
| `ui/cutscene.ts` | ui | 字幕帶（≤ 2 行 × 16 字、字級 ≥ 20 px）、跳過按鈕與長按進度、確認窗；文字由 key 與 `{name}` 插值取得 |
| `render/cutscene/` | render | `paper.ts` 剪紙元件（紙邊、描邊、陰影、剪影、常用物件）、分鏡場景；`engine` 鏡頭重用 `PuzzleScene` + 鏡頭路徑 |

- **單向**：`app` 依存檔與觸發條件決定進入 `cutscene` 畫面，把 `CutsceneDef` 交給 ui / render；`core`、`mechanics` 不知道過場存在。
- **設定 / 存檔**：`autoAdvance`、`textSpeed`、`skipConfirm`（沿用 `reduceMotion`、`noteScale`、`calmTension`）；`seenCutscenes`、`skippedCutscenes`。
- **驗證器**（`devtools/validate.ts`）：每段 ≤ 2 行 × 16 字（`{name}` 以 `NAME_MAX` 計）、每場總長在目標區間、key 齊全、`engine` 鏡頭的關卡已登錄或有 `paper` 替代、無驚嚇提示。
- **文字 key**：`cs.<id>.title`、`cs.<id>.<鏡>.<段>`、`ui.cutscene.<skip|hold|replay|log|unfinished>`。

### 4.16 魔方與章節層級狀態（v0.3；`core/cube.ts`、`core/chapter.ts`、`mechanics/cube.ts`；規格 5.4）

**問題**：現況一次只載入一個關卡（`app/levelSession.ts` 持有一個 `World`）。魔方需要「同章多個房間同時存在、物件狀態保留、門接到哪隨魔方改變」。做法：**房間仍是一個 `LevelDef` / `World`**（物理、切換、互動全不改），上面加一層純資料的 `ChapterSession`。

```ts
// core/cube.ts（純函式、可 JSON 序列化）
export type Side = 'N' | 'S' | 'E' | 'W' | 'U' | 'D';
export type Cell = [number, number, number];                   // [x, y, layer]
export interface CubeDef {                                      // content/cubes/ch<N>.ts
  id: string; dims: Cell; ops: 'slide' | 'rowcol' | 'layer' | 'slice';
  cells: Array<{ at: Cell; room: string | 'solid' | 'empty' }>;  // 初始排列 S0
  frame: Array<{ at: Cell; side: Side; kind: 'porch' | 'chapterExit' | 'skylight'; to?: string }>;
}
export interface CubeState { pos: Record<string, Cell>; rot: Record<string, 0 | 1 | 2 | 3> }   // 房間 → 格、朝向
export type CubeOp =
  | { t: 'slide'; room: string; dir: Side }
  | { t: 'row' | 'col'; index: number; step: 1 | -1 }
  | { t: 'layer'; layer: number; cw: boolean }
  | { t: 'slice'; axis: 'x' | 'y' | 'z'; index: number; cw: boolean };
export function applyOp(def: CubeDef, s: CubeState, op: CubeOp): CubeState | { blocked: 'notEmpty' | 'outOfCube' };
export interface DoorInfo { room: string; door: ObjId; side: Side; kind: 'door' | 'arch' | 'chapter'; label: string /* 門牌，預設「門」 */ }
export interface Link { from: { room: string; door: ObjId }; to: { room: string; door: ObjId | null } | { frame: string }; kind: 'door' | 'arch' }
/** 連接表：依格位與朝向算出每扇門此刻接到哪；門牌「間」可對無門的牆接通（規格 5.4.5） */
export function links(def: CubeDef, s: CubeState, doors: readonly DoorInfo[]): Link[];
```

```ts
// core/chapter.ts（純資料 + 純函式；不 import mechanics，建 World 時由呼叫方傳入）
export interface RoomSnapshot { objs: WorldSnapshot['objs']; flags: string[] }      // 重用 4.1 的 snapshot
export interface ChapterState {
  chapter: number; cube: CubeState;
  room: string; door: ObjId | null;                     // 玩家所在房、從哪扇門進來
  rooms: Record<string, RoomSnapshot>;                   // 已離開房間的物件快照
  moved: Array<{ obj: ObjId; from: string; to: string }>;   // 跨房物件（拱門）的歸屬變更
  labels: Record<string, string[]>;                      // labelId → 貼著的字卡
  cards: Record<string, number>; items: Record<string, number>;
  levers: Record<ObjId, { word: string; ink?: number }>; // 方向字（可被寫改）與墨量
  flags: string[];
}
export interface ChapterSession {
  state: ChapterState;
  entry: ChapterState;                                  // R 用的「本次進房時」快照（深拷貝 JSON）
  world: World;                                          // 當前房間
}
export function enterRoom(cs: ChapterSession, room: string, door: ObjId | null, opts: WorldOpts): ChapterSession;   // 存當前房快照 → 載入 / 復原目標房 → 記 entry
export function turn(cs: ChapterSession, op: CubeOp): ChapterSession | { blocked: string };                          // 檢查跨界物件 / 卡榫 / 墨量 → applyOp → 重算連接表寫入 world.ext.cube
export function restartRoom(cs: ChapterSession, opts: WorldOpts): ChapterSession;                                    // R：state ← entry
export function transferObject(cs: ChapterSession, obj: ObjId, via: Link): ChapterSession;                         // 拱門跨房（規格 5.4.6）
```

- **房間內與章節層的界線**：`World` 只知道自己的門此刻是否接通（`world.ext.cube = { links: Record<doorId, 'open' | 'wall'> }`，由 session 每次換房 / 轉動後寫入）。玩家走進接通的門、拉機關、箱子越過拱門時，`mechanics/cube.ts` 只發事件，由 app 呼叫 session：

```ts
// core/types.ts GameEvent 新增（v0.3）
| { t: 'door'; door: ObjId }                    // 穿過接通的門 → enterRoom
| { t: 'turnRequest'; lever: ObjId }            // 3D 拉機關 → turn（機關的 word 決定 op）
| { t: 'objCross'; obj: ObjId; door: ObjId }    // 可推物越過拱門 → transferObject
| { t: 'card'; label: string; ok: boolean }     // 4.17 回饋
```

- **轉動時玩家的位置**：第一章的拉桿只推自己所在的房間（「轉自己」原則，規格 5.4.1），玩家永遠在被轉的那一組裡；第二章起控制盤可以轉不含玩家的組，玩家所在房若不在組內就不動。兩種情況房間本地座標都不變，所以 `World` 不用動；只重算連接表並播短過場（`render/transitions.ts` 新增 `cubeTurn`，減弱動態用 `plain`）。
- **轉不動**（規格 5.4.1）：`turn` 先查當前房間——玩家或可推物的盒子跨出房間邊界、`scale` 機制回報巨物伸進軌道（4.18）、墨量 0 → 回傳 `blocked`，app 用 `say` 顯示原因。
- **存檔**：`ChapterState` 就是 SaveV3 的 `chapters[n]`（4.9）；寫入時機 = `enterRoom` 與 `turn` 成功後（規格 8）。
- **確定性**：`applyOp`、`links`、`turn` 不讀時鐘 / 亂數；同一序列同結果（測試鎖定）；2.3 第 4 條的字串規則自動涵蓋 `core/`。
- **mechanics/cube.ts** 擁有類型 `lever`（`interactIn:'3d'`，互動 → emit `turnRequest`）、`cubeDoor`（`kind`；`passable` 掛點讀 `world.ext.cube.links`，接不通時 `say('msg.cube.wall')`）。v0.4：類型 `dial`（魔方儀）移到 `mechanics/dial.ts`（4.16.1）。
- 實作現況（C8）：`ChapterState` 實際欄位 = `chapter / cube / room / door / rooms / items / flags / labels / moved`（`moved` 為 `Record<obj, {room,x,y,z}>`，取代上方草案的陣列；方向字不另存 `levers`，由 `labels` 上的詞卡推得）；`transferObject(cs, obj, door, opts)` 以門 id 查連接表；另有 `noteFlag(cs, flag)`（演出旗標，R 不還原）。詳見 7.4 C8 註記。

#### 4.16.1 控制盤（v0.4；規格 5.4.1、5.4.9、N32）

**界線**：第一章的拉桿路徑（`turnRequest` → `turn(cs, op)` → `applyOp`）**一行不改**；控制盤是平行的新路徑，只在 `CubeDef.control === 'dial'` 的章節啟用。轉動、回退是**章節層指令**（作用在 `ChapterSession`，不進 `World.step`），所以不放進 `WorldCommand`，另立 `ChapterCommand`，由 app 在固定步之間套用（與 `WorldCommand` 一樣「只送進下一個固定步」，可錄製回放）。

```ts
// core/cube.ts（v0.4 新增；純函式、確定性）
export type TurnKind = 'row' | 'col' | 'slideCell' | 'layer' | 'slice';
export interface TurnGroup { id: string; kind: TurnKind; index: number; axis?: 'x' | 'y' | 'z' }   // 'slideCell'：index = 格號，dir 由目標空格決定
export interface Turn { group: string; dir: 1 | -1 | Side }              // row / col / layer / slice：±1（col 對調時 dir 無意義，固定 1）；slideCell：滑向的邊
export type TurnBlockCube = CubeBlock | 'noGroup';
/** 列：一列循環平移；行：一行兩格對調（2×3）；slideCell：鄰格為空才滑；layer：繞層中心 90°、朝向 ±1；slice：三軸切片，中心格只在原地轉 */
export function applyTurn(def: CubeDef, s: CubeState, t: Turn): CubeState | { blocked: TurnBlockCube };
export function inverseTurn(def: CubeDef, before: CubeState, t: Turn): Turn;   // 列 ±1 互反、行自反、滑動反向、層 / 切片 cw ↔ ccw
export function cellsOf(def: CubeDef, s: CubeState, group: string): Cell[];      // 這一組此刻包含的格（卡榫、預覽、玩家是否隨轉用）
```

```ts
// core/chapter.ts（v0.4 新增；ChapterState 加三個選填欄位，缺欄 = 預設）
export interface TurnRec { group: string; dir: Turn['dir'] }
export interface ChapterState {
  // …v0.3 / C8 欄位不變…
  dial?: boolean;                                  // 本章魔方儀已啟動（R 不還原：同 noteFlag，寫進 state 與 entry）
  unlocked?: string[];                             // 已解開的鎖扣（組 id）；R 會還原（解鎖旗標若是本次進房才拿到，一併退回）
  turns?: { left: number; undo: TurnRec[] };       // 剩餘墨、本段回退堆疊（長度 ≤ 該房預算）
}
export type DialBlock = TurnBlockCube | 'noDial' | 'locked' | 'jammed' | 'noInk' | 'doorway' | 'nothingToUndo';
export type ChapterCommand = { t: 'turn'; turn: Turn } | { t: 'undo' };

export function turnBudgetFor(spec: ChapterSpec, state: ChapterState, world: World): number;   // 房間 LevelDef.turnBudget：目前謎題是 P4 題時用 puzzles[id]，否則 base
export function unlockedGroups(spec: ChapterSpec, state: ChapterState, world: World): string[]; // CubeDef.dial.locks 依旗標 / 能力推得；與 state.unlocked 比對，新解開的寫回並發 { t:'flag', flag:'unlock:<group>' }
export function activateDial(cs: ChapterSession): ChapterSession;                              // dial = true（state 與 entry 都寫）、turns = 滿額
export function dialTurn(cs: ChapterSession, t: Turn): ChapterSession | { blocked: DialBlock }; // 檢查順序：noDial → noGroup / locked → jammed（scale.blocksTrack）→ doorway（玩家或可推物跨在組內房間的邊界）→ noInk → applyTurn；成功：left−1、undo.push、重算連接表
export function undoTurn(cs: ChapterSession): ChapterSession | { blocked: DialBlock };          // 堆疊空 → nothingToUndo；inverseTurn 照 dialTurn 的阻擋檢查（不含 noInk）；成功：left+1、undo.pop
export function clearUndo(cs: ChapterSession, events: readonly GameEvent[]): ChapterSession;   // 本幀有 flag / item / card / objCross 事件 → undo = []（規格 5.4.1「本段」）
// enterRoom：turns = { left: 新房預算, undo: [] }；restartRoom：state ← entry（turns 隨之回到進房時的滿額）；transferObject：undo = []
```

- **純度與確定性**：`dialTurn / undoTurn / clearUndo / turnBudgetFor` 不讀時鐘與亂數、只回傳新 session（比照 `turn`）；同一串 `ChapterCommand` 永遠得到同一個 `ChapterState`（單元測試鎖定）。`ChapterState` 仍可 JSON 序列化，就是 SaveV3 的 `chapters[n]`。
- **回退與狀態等價**（規格 5.4.8）：`undoTurn` 只能退回本段（上次 `clearUndo` 之後）的轉動，所以「轉 t 再回退」與「沒轉 t」的 `ChapterState` 逐欄相同（`turns.undo` 除外）；測試以 JSON 比對鎖定。
- **轉動模式的進入條件**（`mechanics/dial.ts` 提供查詢 `canEnterTurnMode(w)`）：2D、雙腳站穩、`dial:<章>` 已啟動、不在過場鎖、字卡匣沒開。條件不成立時 app 不進入並 `say('msg.dial.notNow')`。
- **世界不暫停**：轉動模式中 app 停止把移動軸送進 `step`（`releaseAll`），但 `step` 照常推進（追逐中的殘影會動；規格 Q-AF）。
- **跨房計算**：轉動後與拉桿相同，重算 `links`、管線、光路、天平（4.19），寫回當前 `World.ext`。

```ts
// mechanics/dial.ts（v0.4；經 4.2 掛點，核心零修改）
declare module '../core/types' { interface ObjKinds { dial: { chapter: number } } }
// types.dial：interactIn '3d'、站穩；interact → emit { t:'dialActivate', chapter }（已啟動 → say('msg.dial.ready')）
// GameEvent 新增：| { t: 'dialActivate'; chapter: number }      // app → activateDial(cs)
export function canEnterTurnMode(w: World): boolean;
```

```ts
// app/cubeMapModel.ts（v0.4 新增；純函式，可在 Node 測）
export interface TurnHeader { group: string; kind: TurnKind; dirs: Turn['dir'][]; state: 'ok' | 'locked' | 'jammed'; at: { side: 'top' | 'bottom' | 'left' | 'right' | 'ring'; i: number } }
export interface TurnModeModel {
  headers: TurnHeader[]; selected: { group: string; dir: Turn['dir'] } | null;
  preview: MapPreview | null;                    // 只算不寫：applyTurn 的結果畫成半透明
  ink: { left: number; max: number }; canUndo: boolean;
  blocked: DialBlock | null;                     // 選到的轉動若會被擋，預覽時就顯示原因（不必按確認才知道）
}
export function deriveTurnMode(cs: ChapterSession, text: Text, sel: TurnModeModel['selected']): TurnModeModel;
export type TurnModeInput = { t: 'pick'; group: string; dir: Turn['dir'] } | { t: 'step'; axis: 'h' | 'v'; d: 1 | -1 } | { t: 'confirm' } | { t: 'undo' } | { t: 'exit' };
export function reduceTurnMode(sel: TurnModeModel['selected'], input: TurnModeInput, m: TurnModeModel): { sel: TurnModeModel['selected']; command: ChapterCommand | null; exit: boolean };
```

- **ui/cubeMap.ts**（DOM）：轉動模式在展開圖周圍畫標頭箭頭（列 ◀▶、行 ⇅、層 / 切片 ↻↺）、確認 / 回退 / 離開三顆鈕、墨點、鎖扣與卡榫記號；點擊只把 `TurnModeInput` 交給 app（ui 不改 session，4.7 單向資料流）；`reduceTurnMode` 產生的 `ChapterCommand` 由 app 排進下一個固定步。觸控操作見 `mobile-controls-v0.1.md` 2.5。
- **HUD**：`deriveHud` 在第二章起的 2D 顯示墨量小計（「墨 ●●●○○○」，形狀區分），3D 不顯示。
- **存檔**：SaveV3 `chapters[n]` 的 `dial / unlocked / turns` 為選填，`loadSave` 校正補預設；`turns.left` 夾在 0～該房預算，`undo` 長度 ≤ 預算且組 id 存在，否則丟棄 `turns`（4.9）。寫入時機加「轉動 / 回退完成」「啟動魔方儀」「解開鎖扣」。
- **驗證器**（`devtools/validateCube`）：

```ts
export interface DialModel {                     // 由 content/cubes/ch<N>.ts 與各房 LevelDef 的 turnBudget / puzzles 抽象而來
  cube: CubeDef; rooms: Record<string, { budget: number; p4?: Record<string, number> }>;
  puzzles: Array<{ id: string; room: string; needs: string[]; goal: (s: CubeState, flags: ReadonlySet<string>) => boolean; teaching?: boolean; excluded?: { name: string; minSteps: number } }>;
  maxStates?: number;                             // 預設 2e6（規格 5.4.9）
}
export interface DialReport {
  states: number; arrangements: number; deadlocks: string[];
  perPuzzle: Array<{ id: string; shortest: number; second: number | null; solutions: number; distinct: number; sampled: boolean; budget: number; issues: string[] }>;
  budgetBypass: string[]; lockIssues: string[]; entryIssues: string[];
}
export function validateDial(model: DialModel): DialReport;   // 同檔 devtools/validateCube.ts，即規格的「validateCube 擴充」；既有第一章拉桿模型的檢查不改
```

### 4.17 標籤與字卡（寫；`mechanics/labels.ts`、`content/lexicon.ts`、`ui/cardTray.ts`；規格 N22）

```ts
// ObjBase 新增（declaration merging，比照 4.3）
label?: { id: string; base: string /* 原字，例「左」「門」「閉」「大衣」 */; slots: ('word' | 'part' | 'scale')[] };
// core/actions.ts：ActionFrame 新增帶參數的指令（可錄製、可回放）
export type WorldCommand = { t: 'card'; label: string; card: string } | { t: 'uncard'; label: string; card: string };
export interface ActionFrame { moveX: number; moveZ: number; jump: boolean; pressed: readonly WorldAction[]; commands?: readonly WorldCommand[] }
// content/lexicon.ts
export interface LexEntry { text: string; effect: LexEffect; alt?: string[] /* 同義字，規格 D14 */ }
export type LexEffect = { dir: Side | 'cw' | 'ccw' } | { door: 'gate' /* 「間」 */ } | { open: true } | { answer: string /* 字謎 */ };
export function resolveLabel(base: string, cards: readonly string[]): { text: string; entry: LexEntry | null };
```

- 只能在 2D、站穩、範圍內對有 `label` 的物件下指令（C9 同規則）；`labels.ts` 驗證卡片持有、槽型別、每張卡同時只貼一處 → 組字 → 查詞典：有效 → 改物件行為（方向字寫入 `ChapterState.levers`、門牌寫入 `DoorInfo.label`）；無效 → 不生效、卡片退回、emit `{t:'card', ok:false}`（ui 播字顫動 + 墨色變淡 + 輕音效，規格 D15）。
- 字謎（P18）的判定也走詞典：`answer` 比對 `text` 或 `alt`。
- UI：2D 靠近標籤時互動提示變「寫」；`ui/cardTray.ts` 顯示卡片列（詞卡 / 部件卡 / 尺度卡分組），選卡 → app 產生 `WorldCommand`。不在 ui 改 world（4.7 單向資料流）。

### 4.18 尺度三檔（量；`mechanics/scale.ts`；規格 N23）

- 尺度卡貼在標籤的 `scale` 槽，由 `labels.ts` 轉給 `scale.ts`：`tier: -1 | 0 | 1` 存在 `ObjState.ext.scale`。
- 有效盒：以底部中心縮放 ×0.5 / ×1 / ×1.5；`presence` 不變，**改 `objBox`**（核心新增查詢掛點 `size?(w, o) → {w,h,d}`，`geometry` / `place` / `push` 一律經 `objBox`；render 白名單已含 `objBox`）。
- 放大前卡牆檢查：新盒與 `solidsFor` 任一模式重疊、或超出房間 bounds → 拒絕（`msg.scale.noRoom`「這裡放不下。」）；與玩家重疊 → `resolvePlayerOverlap`；上面有東西時一律允許縮小、放大須上方淨空。
- 重量：`ObjTypeSpec.mass` 預設改為 `[1, 2, 3][tier + 1]`（原尺寸 2），plates 的 `weight` 一律以此單位（規格 5.4.7）。
- 卡榫（P3）：伸出房間邊界的部分若落在魔方軌道上（`turn` 檢查時查詢 `scale` 的 `blocksTrack(w)`）→ 轉不動。
- 主角縮小只在 N30 縮影房（`LevelDef.abilities` 含 `'mini'` 時，玩家自己的標籤才出現 `scale` 槽）。
- 測試：每個可縮放物 × 三檔 × 取樣位置跑捷徑掃描（4.12 `ScanSpec.movable` 加 `tiers`）。

### 4.19 其他 v0.3 機制（各一檔，皆經 4.2 掛點，核心零修改）

| 檔 | 機制 | 掛點與資料 |
|----|------|-----------|
| `reveal.ts` | N24 顯影（P14） | 類型 `inkveil`（`visible:'2d'`）；2D 互動 → `used=true`，顯出 `textKey` / 圖案；R 還原 |
| `pipes.ts` | N25 墨流管線（P15） | 類型 `pipe`（房間邊界接口 `side`）；連通由 session 依連接表跨房計算（`core/chapter.ts` 提供 `pipeGraph`），結果寫入 `world.ext.pipes`；終點物件讀它決定開關 |
| `lightpath.ts` | N26 光路（P6） | 類型 `window`（同側窗位）、`prism`、`sensor`；逐格傳播同上（`lightGraph`）；感光物讀結果 |
| `locks.ts` | N27 符號 / 順序鎖（P11、P16） | 類型 `seqlock`（`expect: string[]`）與 `cord` / `glyphKey`；輸入序列存 `ObjState.ext`，錯了清空 |
| `combine.ts` | N28 道具合成（P13） | `content/items.ts` 加配方表；合成在道具欄（ui → `WorldCommand {t:'combine'}`）；道具屬 `ChapterState.items` |
| `balance.ts` | N29 天平（P17） | 兩盤是 3D 壓板（N3），重量差 → `ext.tilt`；跨房天平由 session 依拱門連接合併兩盤重量 |
| `mini.ts` | N30 縮影遙控（P10） | 類型 `miniature`；玩家 `scale` 為小時互動 → app 載入縮影房（另一個 `LevelDef`）；縮影房裡的轉動走同一條 `ChapterCommand` 路徑、作用於**真實**魔方，但只允許 `CubeDef.dial.miniOnly` 的組（v0.4：第五章水平層外圈，觀星儀轉不到） |
| `chase.ts` | N31 跨房追逐（P8） | 在 4.14 之上：殘影的「所在房」存於 `ChapterState`；玩家換房後若兩房接通，殘影延遲固定秒數進房；轉動讓兩房斷開 → 殘影停留；`calmTension` 不生成 |

- 跨房計算（管線、光路、天平）都放在 `core/chapter.ts` 的純函式，輸入 = 連接表 + 各房的接口資料，輸出寫回當前 `World.ext`；機制檔只讀，不跨房存取其他 `World`。

---

## 5. 擴充劇本

| 情境 | 新增 | 修改 | 核心修改 |
|------|------|------|---------|
| 新增機制（例：N6 燈影） | `mechanics/light.ts`；`render/models/lamp.ts`、`shadow.ts`；`tests/puzzle/mechanics/light.test.ts`；`content/text/zh-Hant` 補 `obj.lamp.*`、`msg.light.*` | `mechanics/index.ts` 加一行；`render/models/index.ts` 加兩行 | 無 |
| 新增物件類型（例：墨橋 inkbridge） | 在擁有它的機制檔 `declare module` + `types.inkbridge`；`render/models/inkbridge.ts` | `render/models/index.ts` 一行 | 無 |
| 新增一種輸入（以觸控驗證一次） | `input/<name>.ts`（純邏輯 `InputSource`）、必要時 `ui/<name>Overlay.ts`（DOM）、`ui.*` 文字 key、`tests/puzzle/input/<name>.test.ts`；檢查清單：① `poll / clear / releaseAll / dispose` 語意與鍵盤一致 ② 經 `mergeSources` 與鍵盤並存 ③ 確認窗 / 暱稱 / 背景時 `releaseAll` ④ 操作說明與提示文字由文字 key 產生 ⑤ 純邏輯檔加入 2.3 第 4 條 ⑥ 現有通關腳本仍通過 | `app/app.ts` 偵測與合併、`meta/settings.ts` 欄位 | 無 |
| 新增一關（例：2-1） | `content/levels/ch2/2-1-shelves.ts`；`content/text/zh-Hant/lvl-2-1.ts`、`note-2-1.ts`（字條與解答手稿）；`tests/puzzle/levels/2-1.test.ts`（通關＋反例＋掃描） | `content/levels/index.ts` 一行；`chapters.ts` 的 levels 陣列 | 無 |
| 新增一章 | 該章各關檔；`render/themes/<theme>.ts`；必要的 `render/decor/*` | `chapters.ts` 一筆；`themes/index.ts` 一行 | 無 |
| 新增輸入（觸控） | `input/touch.ts`（實作 `InputSource`）；`ui/touchPad.ts`（虛擬按鈕 DOM） | `app/services.ts` 合併 source | 無 |
| 改一個顯示名稱（筆尖 → 畫筆工具） | — | `content/text/zh-Hant/term.ts` 一行；必要時字串內改用 `[[term.nib]]` | 無；測試若比對字面文字，需同步（劇情 4 節已指出 `puzzleLogic.test.ts:230`） |
| 新增語言 | `content/text/en/*.ts` | `app/services.ts` 依設定選 bundle；`settings.ts` 加 `lang` | 無 |
| 新的字條顯字策略 | 在 `meta/hints.ts` 加一個 factory | `Settings.hints` 聯集加值 | 無 |
| 新渲染風格 / 色盲組 | `render/themes/<id>.ts` 或 `InkPalette` 一組 | `themes/index.ts` | 無 |

---

## 6. 設計驗證

### 6.1 N6 燈影（規格 4、3-1～3-4）——v0.3 退役，保留作設計紀錄

- 資料：`lamp` 類型（`ObjKinds.lamp: { on?: boolean; wallZ?: number }`，燈的 z 即 `Lz`）；caster 用通用特性 `caster: true`。
- 掛點：`derive` —— 對每盞 `on` 的燈與每個 caster 計算影子盒：`s = (Lz − wallZ) / (Lz − objZ)`，x、y 邊界以燈的 (x, y) 為中心縮放；產生 `ObjState{ id:'light:shadow:<casterId>', def:{ type:'shadow', visible:'2d', solid:true, z: wallZ+band/2, d: band }, derivedBy:'light' }`。`band`（貼牆厚度）讓 N8 能以「剖到牆面深度」判定（見 6.2）。
- 連續縮放：每步重算即可（`refreshDerived` 在動作後與每步開頭），花盆 / 燈被推 → 下一步影子跟著變；推的時候玩家在 3D，影子是 2D 實體，3D 物理不受影響。
- 影子沒有重量（3-4a 誘導性錯誤）：`ObjTypeSpec.mass` 對 shadow 回 0。
- 關燈：燈是互動物件（`types.lamp.interact` 切換 `used`）；或由 `opens` 連結（N10 一般化）。
- 渲染：`MODELS.shadow` 畫 2D 網點剪影（P4），模型 `update` 依 def 尺寸縮放；scene 對帳負責出現 / 消失。
- 需要的新介面：`derive`、`ObjState.derivedBy`、scene 對帳（都已在第 4 節）。**放得下。**

### 6.2 N8 剖面（規格 4、4-1～4-4）——v0.3 退役，保留作設計紀錄

- 狀態：`WorldExt.section = { on: boolean }`；`actions.section`（C，`ability:'section'`）。切換剖面限 3D（已確認，決策 Q5）；2D 按 C 只 `say('msg.section.only3d')`。
- 掛點 `presence(w, o, '2d')`：`!on || isPinned(w, o) || zRangeContains(o, w.player.z3d)`；3D 恆 true。
  - `solidsFor('2d')` 依 cut 過濾：因 `solidsFor` 建在 `isActiveIn` 上，自動成立。
  - 壓板依 cut 計數：plates 的重量來源是 `solidsFor(mode)`（6.4、N14），自動成立；壓板本身不在刀上 → 不存在 → 不更新（R1 的延伸，4-4a 需要的正是這個）。
  - 「定稿 > 剖面」（4-2c）：`section.ts` import `isPinned`。
  - 剖到牆上的影（4-2b）：影子盒在牆面帶 `band` 內，刀落在帶內才存在。
- `trySwitchMode` 已改為先記 `z3d` 再求解（H10），所以「進紙深度決定紙上世界」成立。
- HUD「剖面檢視」字樣與剖切線：`deriveHud` 讀 `w.ext.section`。**放得下。**

### 6.3 N16 墨記（規格 4.1、Q-C）——v0.3 退役，保留作設計紀錄

- 狀態：`WorldExt.mark = { x: number; y: number; region: string } | null`；`LevelDef.regions`；`actions.mark`（V，`ability:'mark'`）。
- 放置（2D、站穩）：記 `(x, y)` 與 `regions` 中涵蓋 x 的 region；已有墨記則覆蓋（同時只有一個）。
- 兌現（3D、站穩）：玩家目前 x 所在 region ≠ 墨記 region → `say('msg.mark.region')`；否則目標盒 `boxAt(mx, my, p.z)` 須 `inBounds`、`!hits(solidsFor('3d'))`、`supportsAt(…,'3d')` 非空、通過 `canLand`；為吸收浮點誤差以 `nearestFree` 在半徑 0.1 內找點〔推論〕；失敗 → `say('msg.mark.noSupport')`（「這裡接不住你」）；成功 → 移動玩家、清除墨記、`emit flag 'mark:redeemed'`。
- 「記在影子上要先定稿」（5-1a）：影子只在 2D 存在，3D `supportsAt` 找不到 → 自然失敗；定稿後是實體 slab → 成功。無需特例。
- 「先記後拆」（4-4b、5-1b）：墨記只存座標，不參照物件，自然成立。
- 5-1「不是你釘的圖釘」：物件資料無法表達「世界狀態初值」→ 走查時發現缺口，**已回頭在 4.3 補 `LevelDef.initial?: Json`**，由 `mark.init` 讀取 `initial.mark`。
- 結局 B（劇情 6.2：在編輯桌放墨記不兌現）：`mark` 放置時若腳下支撐物有 `markFlag` 欄位 → `flags[markFlag]`；外殼依 `ending.B` 旗標 + `save.scraps` 齊全判定。
- 渲染：`derive` 產生 `mark:marker`（visible both、solid false）；`MODELS['mark']` 3D 畫橫跨深度墨線、2D 畫墨點（規格 7.2）。**放得下（補一欄位）。**

### 6.4 N5 火漆印章 / 定稿（規格 4、2-3～2-5）——v0.3 退役，保留作設計紀錄

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

### 6.6 第一章魔方走查（v0.3；規格 6 第一章）

- 資料：`content/cubes/ch1.ts` = 2×2，`cells` S0 = { A 空、B 樓梯間、C 衣帽間、D 玄關 }，`frame` = 大門（D 南，`porch`）、書房走廊（C 東，`chapterExit`）。玄關 `cubeDoor` S（arch）/ E（door）、樓梯間 W / S（door）、衣帽間 N（arch）/ E（chapter）；拉桿：玄關「上」、衣帽間「左」。
- 1-2c：玩家在玄關（3D）互動拉桿 → `turnRequest` → `turn({t:'slide', room:'foyer', dir:'N'})` → 玄關到 A → `links` 重算 → 玄關 E 門 `open`。2D 預覽 = `deriveCubeMap(session, op)` 只算不寫。**放得下。**
- 1-3a：衣帽間拉桿「左」→ 衣帽間到 D → 衣帽間 N 拱門 ↔ 玄關 S 拱門（arch-arch）；木箱越過邊界 → `objCross` → `transferObject` 把木箱移到玄關的 `rooms` 快照 / 當前 World。**需要 4.16 的 `transferObject`；放得下。**
- 1-3b：2D 對拉桿標籤下 `WorldCommand {t:'card', label:'lever:closet', card:'word:右'}` → `labels` 改 `levers['lever:closet'].word = '右'` → 3D 拉 → 衣帽間回 C → 章門 ↔ 書房走廊。R：`restartRoom` → `state = entry`（本次進房時衣帽間在 D），不會回到 S1。**放得下。**
- `validateCube` 對此模型：可達排列 3、抽象狀態 **96**（狀態 = 魔方排列 × 玩家所在房 × 詞卡（沒有 / 在手上 / 貼在衣帽間拉桿 / 貼在玄關拉桿）× 木箱所在房 × 有無鑰匙 × 是否已出章門，只計 BFS 可達者；非終點 90 + 終點 6）、卡死 0、最短轉動 3（規格 5.4.8）。C8 起詞卡也可貼在玄關拉桿上（規格 1-3b 列的錯誤嘗試，實作允許），比 C5～C7 只許貼衣帽間的模型（69 = 非終點 65 + 終點 4）多 27 個狀態；停用「玄關寫字」即回到 69，兩者的排列數、卡死、最短解相同。

### 6.7 控制盤走查（v0.4；M-Dial 的 2×3 測試魔方與規格第二章）

- 資料：`content/cubes/test-dial.ts`（M-Dial 專用，不進登錄表）= 2×3、`control:'dial'`、`groups` = row0 / row1 / col0～col2、`locks` = row1 ← `flag:test.a`、col* ← `flag:test.b`；六間占位房各有門 / 拱門，入口房放 `dial` 物件。
- 啟動：3D 站穩對魔方儀 E → `dialActivate` → `activateDial`（`dial:true` 寫進 state 與 entry）→ app 打開展開圖並進入轉動模式。**放得下**（新事件 + 新 session 函式，核心零修改）。
- 列轉：轉動模式點 row0 的 ▶ → `reduceTurnMode` 產生 `{t:'turn', turn:{group:'row0', dir:1}}` → 下一固定步 `dialTurn` → `applyTurn` → `links` 重算 → 玩家所在房若在 row0 就隨列移動、否則不動。**放得下**。
- 鎖扣：點 col1 的 ⇅ → `deriveTurnMode` 已把 col1 標 `locked`，預覽顯示「這一排鎖著。」、確認無效；拿到 `flag:test.b` → `unlockedGroups` 回報 col*、發 `unlock:col*` 旗標事件 → `clearUndo` 清空堆疊。**放得下**。
- 回退：轉兩次 → 回退一次 → `ChapterState` 與「只轉第一次」逐欄相同（除 `turns.undo`）；穿門 → `enterRoom` 補滿墨、清空堆疊。**放得下**。
- 預算：墨 0 → `dialTurn` 回 `noInk`、回退仍可用；R → `restartRoom` 回到進房時（墨滿額）。`validateDial` 對測試魔方：排列 720、卡死 0、刻意做一個「換房補墨即可繞過」的 P4 反例模型 → `budgetBypass` 非空。**放得下**。

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

### 7.4 v0.3 實作步驟（M-Cube 原型與第一章；規格 10）

| # | 目標 | 動到的檔案 | 驗證 | 停點 |
|---|------|-----------|------|------|
| C1 | `core/cube.ts`：CubeDef / CubeState、`applyOp`（先只有 slide）、`links` | core、tests/puzzle/core/cube.test.ts | 滑動 / 越界 / 非空格 / 連接表 / 確定性單元測試 | — |
| C2 | `core/chapter.ts`：`enterRoom`、`turn`、`restartRoom`；房間快照往返 | core、app/levelSession.ts 改用 session | 換房往返後物件逐欄相同；R 回到進房時 | — |
| C3 | `mechanics/cube.ts`：lever、cubeDoor、門後是牆、轉不動訊息 | mechanics、content/text | 1-2 現有測試全綠；門的兩狀態 | — |
| C4 | 展開圖：`app/cubeMapModel.ts`（純）+ `ui/cubeMap.ts`；M 鍵與觸控 map 鍵；轉動短過場 | app、ui、render/transitions.ts、input | `deriveCubeMap` 單元測試；Playwright 截圖 | — |
| C5 | `devtools/validateCube`（BFS）+ 第一章模型；SaveV3 骨架（只存 cube 與房間快照） | devtools、meta/save.ts | 規格 5.4.8 數字；v2 → v3 遷移測試 | — |
| C6 | 內容：玄關加 S 拱門入口、E cubeDoor、拉桿「上」；樓梯間 / 衣帽間占位房 | content | 可玩到 1-2c；`validateLevel` 0 issue | **M-Cube 完成，停下等使用者確認** |
| C7 | M1a：1-2 重做（規格 6 保留 / 改 / 廢表） | content、mechanics/sequence.ts（N27）、mechanics/plates.ts（weight）、render/models/sequence.ts、tests/puzzle/levels/1-2.test.ts | 通關 + 反例 + 捷徑掃描 | **已完成（2026-11-03）**，停下等確認 |
| C8 | M1b：1-3 衣帽間、拱門跨房、`labels.ts` 最小版 | core/chapter.ts、mechanics/labels.ts、content | 三房通關腳本；不寫字無解 | **已完成（2026-11-03）**，停下等確認 |

> 實作註記 (2026-11-03，M-Cube C1～C6 完成)：`validateCube` 對第一章模型實算為可達排列 3、卡死 0、最短轉動 3 (路徑與規格 6 的最短解同序)、拿掉寫字 / 推箱 / 任一拉桿皆無解；**抽象狀態數實算 69** (非終點 65 + 終點 4；狀態 = 魔方 × 所在房 × 詞卡 (無 / 手上 / 貼在拉桿) × 木箱所在房 × 鑰匙 × 是否出章門，拱門推箱可雙向、詞卡可取下)；C7 起規格 5.4.8 / 6 與本文件 6.6 已改為 69 並附上述編碼。C6 原型的取捨：魔方門以 E 互動進出 (只在 3D)；南拱門 / 南門只在實景；1-2 的 `puzzles` 只刪 1-2d、改號留給 C7；門廊大門屋框只提示不換關；衣帽間章門一律鎖著 (C8 加鑰匙)。
>
> 實作註記 (C7)：`puzzles` = 1-2a 推箱取筆尖、1-2b 長桌下的踏板、1-2c 門後是牆、1-2d 三代的年份 (書架過缺口降為不計題路段，原字條移除)。N27 順序鎖 = `mechanics/sequence.ts` (類型 portrait / cord / drawer；拉對一條停住、拉錯全部彈回、全對 → 抽屜 used + 取得 `reward`)；`validateLevel` 加 `ref.sequence` (order ≥ 3 條、互相指認) 並收集畫像年份 / 抽屜訊息的文字 key。踏板 `weight` (木箱 2、玩家 1，預設 2，行為不變)。筆尖 `grants:'nib'` 不變 (nib = 寫的能力，取得文字說明字卡匣開啟；字卡匣 UI 在 C8)。詞卡 = 章節道具 `card.right` (ChapterState.items → SaveV3 chapters[n].items)。v0.2 才有的文字 key 移到 `tests/puzzle/fixtures/foyerV02.ts` 的 `FOYER_V02_TEXT` (`v02.1-2.*`)；`obj.valve.verb` 保留 (valve 類型仍註冊，供凍結場景)。C8 注意：西區後牆 x∈[-19.5,-15.5] 已被畫像占用，1-3a 掛鉤建議放在 x≈-15 以東 (現有裝飾掛畫 x=-14 可移)。
>
> 實作註記 (C8)：**衣帽間** = 關卡 id `1-3`、房間 id `closet` (`content/levels/ch1/closet.ts`；登錄表 1-3 前置 1-2，從選單進 = 接著第一章存檔)：北拱門 x=-1、東章門 (`key:'key.brass'`)、拉桿「左」(x=2.5，標籤 `lever:closet`)、木箱 `closetCrate` (x=-1.6, z=1.2；id 與玄關的 `crate` 不同)、衣架 `coatRack` (標籤「大衣」+ 空尺度卡槽)、三張字條。玄關加掛鉤 `hook` (x=-14.8、y=2.3、2D；`grants:'key.brass'`、`also:['diary.1']`)，裝飾掛畫移到掛鉤上方；玄關拉桿也有標籤 `lever:foyer`。**拱門跨房**：`mechanics/cube` 的 afterPhysics 在可推物「剛壓上」拱門門位時發 `objCross` (拱門對拱門) 或說明 (對面是門 `msg.cube.doorOnly` / 牆)；`core/chapter.transferObject(cs, obj, door, opts)` 把物件放到對面拱門內側 (門內緣 + 1.3 + 半深，沿門橫向保留偏移)、被占住或沒地板 → `blocked:'occupied'`；`ChapterState.moved[obj] = { room, x, y, z }` (回到原房即刪除)，`roomObjects` 依此組房間物件 (跨房物件的定義取自原房、初值 = 到達點，所以 T 物歸原處 = 回到它進房時的拱門內側，規格 5.4.7)。R = entry，跨房也一併還原。**標籤 N22 最小版** (`mechanics/labels.ts`)：`ObjBase.label = { id, kind:'dir'|'noun', textKey?, scale? }`；詞典最小版放在機制檔 (`CARDS`：`card.<方向字>`；方向字標籤 + 詞卡 = 新方向、名詞 + 詞卡 = 無效)，因為 mechanics 不能 import content 的值 (第二章擴充時改為 `WorldOptions` 注入 `content/lexicon`)。核心新增兩個掛點：`Mechanic.interactFallback` (E 沒有一般目標時：2D 範圍內有標籤、且字卡匣有卡或標籤上有卡 → `labelOpen`；否則照舊「看得見，卻碰不到」) 與 `Mechanic.command` (`ActionFrame.commands` 的 `WorldCommand`，`step` 在動作之後處理；`LevelLoop` 與動作一樣只送進下一個固定步)。標籤上的卡存在 `World.ext.labels` (章節層載入 / `captureState` 收回 → `ChapterState.labels` → SaveV3 `chapters[n].labels`)；寫字需持有筆尖 `nib`；每張卡同時只貼一處 (貼上即離開字卡匣、換卡則舊卡回匣)；拉桿方向 = `leverWord(w, o)` (章節事件、展開圖預覽、HUD、3D 牌子箭頭都跟著它)。UI：`app/cardTrayModel.ts` (純) + `ui/cardTray.ts`；鍵位 E 開 / 關、1～3 貼第 n 格、X / Backspace 取下、Esc 關；觸控 = 點互動提示開匣、點卡片貼、點「關閉」或卡匣外關 (卡片 ≥ 56 px)；無效字 = 標籤字顫動 + 墨色變淡 0.6 秒 (不閃爍)。**章門**：`cubeDoor.key` 持有 → `w.cleared` (本章通關；外殼以玩家所在房對應的關卡 1-3 顯示通關畫面，`recordClear(…, also = 本章各關)` 記 1-2、1-3，並把持有的 `diary.<n>` 寫進 `save.diary`)；「第一夜」過場的觸發留待後續。**驚嚇** (規格 9.1)：`mechanics/coats.ts` 的 `coatRack`：持有 `fallWhen` (銅鑰匙) 進衣帽間、安靜 2.5 秒後 used (滑落) 並發 `{t:'flag', flag:'scare:coats'}`；`core/chapter.noteFlag` 同時寫進 state 與 entry (R 不重演；旗標只影響呈現)；之後進房 / R → 1 秒內安靜倒下。呈現：一般 0.45 秒同時落下、`calmTension` = 1.8 秒緩緩滑落；亮度不變；目前沒有音訊模組 (規格 9.1 音訊屬 M1)，所以沒有驚嚇音。**提示 L2**：`note.revealAfter` (秒，房間 `World.time`)：之前讀到「紙上還是空白的。」、模型是白紙，之後浮現字跡 + 邊角微光；設定「提示：計時 / 隨時 / 關閉」與卡關偵測尚未接 (M1 提示系統)。**BFS**：`CH1_MODEL.card.levers = ['foyer','closet']` → 抽象狀態 96 (見 6.6)；`write:closet` 停用 → 無解、`write:foyer` 停用 → 仍有解 (錯誤嘗試不是必要步驟)。南拱門 (前緣) 的模型改為專屬材質並登記為遮擋物 (擋在鏡頭與玩家之間時淡出)。順帶修正：`PuzzleScene` 遮擋物淡出切換 `transparent` 時補 `needsUpdate` (首次編譯為不透明的材質原本淡不掉)；窄螢幕 (≤ 600 px) 收起鍵盤操作說明 (原本蓋住狀態列與展開圖)。

#### 7.4.1 v0.4 實作步驟（M-Dial 控制盤原型；規格 10，排在 M1 第二章之前）

驗收基準（每步都要）：`npx vitest run` 全綠（含第一章 `levels/1-1～1-3.test.ts`、`validateCube` 第一章 96 / 卡死 0 / 最短 3 不變）、`npm run build` 通過；第一章的拉桿路徑（`turnRequest` → `turn` → `applyOp`）**不得改動行為**。

| # | 目標 | 動到的檔案 | 驗證 | 停點 |
|---|------|-----------|------|------|
| D1 | `core/cube.ts`：`TurnGroup / Turn`、`applyTurn`（row / col 完整；slideCell / layer / slice 先實作並單元測試，內容留到各章）、`inverseTurn`、`cellsOf` | core、tests/puzzle/core/cubeTurn.test.ts | 2×3：列 ±1、行對調、`applyTurn(inverseTurn(t))` = 原狀；BFS 列 + 行 = 720 排列、直徑 7，只開上列 = 3、兩列 = 9（規格 5.4.9）；3×3 兩空格實心格固定 = 2,520；層轉四次 = 原狀、兩層 = 16；確定性（同序列同結果） | — |
| D2 | `core/chapter.ts`：`ChapterState.dial / unlocked / turns`、`activateDial`、`dialTurn`、`undoTurn`、`clearUndo`、`turnBudgetFor`、`unlockedGroups`；`enterRoom` 補滿墨、`restartRoom` 回到進房時、`transferObject` 清空堆疊 | core、tests/puzzle/core/chapterDial.test.ts | 阻擋順序（noDial / locked / jammed / doorway / noInk）各一例；穿門補滿；R 回滿額；「轉 t 再回退」與「沒轉 t」的 state JSON 相同（除 `turns.undo`）；旗標 / 道具 / 字卡 / 跨房事件清空堆疊；`dial` 寫進 entry（R 不還原）、`unlocked` 隨 R 還原；第一章 `turn` 測試全綠 | — |
| D3 | `mechanics/dial.ts`（`dial` 類型、`dialActivate` 事件、`canEnterTurnMode`）；`content/cubes/test-dial.ts` 2×3 測試魔方與六間占位房（只有門 / 拱門 + 一座魔方儀 + 兩個解鎖旗標的開關）；文字 `msg.dial.*`、`obj.dial.*` | mechanics、content、content/text | 3D 才能啟動、2D 互動不啟動；已啟動再按 → `msg.dial.ready`；`validateLevel` 0 issue；`canEnterTurnMode` 四個條件（2D、站穩、已啟動、無疊層）各一例反例 | — |
| D4 | `app/cubeMapModel.ts`：`deriveTurnMode`、`reduceTurnMode`；`ChapterCommand` 佇列接進 `LevelLoop`（只送進下一個固定步）；`deriveHud` 墨量小計；`DEFAULT_BINDINGS` 加 `turnMode` / `undo` | app、input/bindings.ts、tests/puzzle/app/turnMode.test.ts | 預覽只算不寫（session JSON 不變）；鎖住 / 卡住 / 沒墨的標頭在預覽時就帶 `blocked`；方向鍵選標頭循環；確認 → 恰好一個 `ChapterCommand`；轉動模式中移動軸不進 `step`、世界照常推進（殘影位置逐幀與不開圖時相同） | — |
| D5 | `ui/cubeMap.ts` 轉動模式 DOM（標頭箭頭、確認 / 回退 / 離開、墨點、鎖扣、卡榫）；觸控（`mobile-controls-v0.1.md` 2.5）；轉動短過場沿用 `cubeTurn` | ui、render/transitions.ts | Playwright：桌機鍵盤一輪「啟動 → 列轉 → 解鎖 → 行轉 → 回退 → 墨用完 → R」；手機模擬（`hasTouch`、橫 / 直屏）點標頭與三顆鈕；按鈕 ≥ 44 CSS px、不與 D-pad / 動作鍵重疊；截圖兩模式各一張 | — |
| D6 | `meta/save.ts`：SaveV3 `chapters[n].dial / unlocked / turns` 寫入時機與校正 | meta、tests/puzzle/meta/saveV3.test.ts | 缺欄補預設（v3 第一章存檔原樣可讀）；`turns.left` 越界 / `undo` 過長 / 組 id 不存在 → 只丟棄 `turns`；房內讀檔不補墨；寫入 → 讀回 JSON 相同 | — |
| D7 | `devtools/validateCube.ts`：`validateDial`（預算、鎖扣、魔方儀、多解列舉與取樣、預算繞過、鎖定可達、入口可達、狀態上限 2×10⁶；規格 5.4.8 ⑥～⑪） | devtools、tests/puzzle/devtools/validateDial.test.ts | 測試魔方：排列 720、卡死 0、每題回報最短 / 次短 / 解法數；三個刻意的反例模型各觸發一種錯誤（預算繞過、鎖互相等待、入口需要轉動）；超過 `maxStates` 報錯而不是卡住；第一章 `validateCube` 數字不變 | **M-Dial 完成，停下等使用者確認**（再進 M1 第二章）；**D1～D7 已完成（2026-11-03）** |

> 實作註記 (M-Dial D1～D7，2026-11-03)：**D1** `applyTurn` 的 row / col 作用在第 0 層；col 為循環平移 (兩列 = 對調，`turnDirs` 只列方向 1)；slideCell 的 index = 格號 x + y·寬 + 層·寬·高、反向 = 從滑到的格往反方向滑回 (不需狀態)；層轉與 z 軸切片同時轉朝向，x / y 軸切片只追蹤位置 (俯仰朝向留到第五章)；組內有實心格 → `notEmpty`。BFS 實算：上列 3 (**直徑 1**，規格 5.4.9 原寫 2 已改)、兩列 9 (2)、列 + 行 720 (7)、上列 + 三行 720 (8)、3×3 兩空格兩實心 2,520、層轉兩層 16。**D2** 鎖扣條件 `until` = 謎題 doneFlag (`ObjBase.doneFlag`：物件 used 即成立；R 會還原) / `item:<id>` / `ability:<id>`；`unlocked` 只記已解開者 (`refreshUnlocks` 寫回並清空堆疊)；卡榫走新掛點 `Mechanic.blocksTrack(w)` (只查當前房；第三章 scale 擴充到其他房快照)；門口卡著 = 組內各房的可推物壓在門位 (其他房以快照判斷) 或玩家站在門位 (2D 以 `z3d` 判斷)；P4 的「目前謎題」= 本房 `puzzles` 中第一個列在 `turnBudget.puzzles`、doneFlag 尚未成立的題；另有 `dialBlocked` (只算不寫，預覽用)。`clearUndo(cs, events, gotItem)`：道具由外殼比對 `World.inv` 得知 (核心不新增道具事件，第一章事件流不變)。**D3** 鎖扣開關為新類型 `latch` (一次性；`done` 事件)；原型內容 = `content/cubes/test-dial.ts` + `content/levels/proto/dial.ts` (甲～己室，chapter 90)，不進 `LEVELS / CHAPTERS / CUBE_CHAPTERS`，另列 `PROTO_LEVELS / PROTO_CUBE_CHAPTERS`；選單只在網址帶 `?dev=1` 時多一區「開發（原型，不計入正式關卡）」。魔方儀在 3D 啟動、轉動模式只在 2D，所以「啟動後自動進一次轉動模式」實作為：啟動時說明一句，玩家下一次切到藏寶圖、站穩時自動打開展開圖的轉動模式。**D4** 標頭攤平為「每組 × 方向一顆」(`TurnHeader.dir` 單值)；確認後取消選取 (圖回到轉後的現況)；方向鍵另綁 `navLeft / navRight / navUp / navDown` 動作 (快速點按也抓得到；WASD 以軸「剛按下」計)；`turnMode` = Tab、`undo` = Z。轉動模式中世界照常推進、移動軸與世界動作不送進 `step`。只有你的房跟著動時才播 `cubeTurn` 過場。**D6** `sanitizeChapter` 只做結構校正 (turns 壞 → 只丟 turns)；對照章節定義的校正 (墨量 0～該房預算、堆疊 ≤ 預算、組 id 存在、鎖扣只留本章的組、存檔房間不在本章 → 不沿用墨量) 在 `meta/chapters.chapterStart`。**D7** `DialModel` 改為 `{ cube, doors, start, rooms, puzzles, finish, maxStates?, maxSolutions? }` (`dialModelOf` 由內容組成)；抽象狀態 = 排列 × 所在房 × 已完成的題 × 魔方儀 × 剩餘墨 (墨量展開成因子而非巨集邊，測試魔方仍只有 32,770)；卡死含 R 的判定 = 「進房快照本身到不了終點」(任何狀態按 R 都回到某個進房快照)，另報需要 R 才能救回的狀態數；多解從「前置剛湊齊」的第一個可達狀態出發、中間可自由穿門；預算繞過 = P4 房每次只給 (最短 − 1) 滴仍能完成；鎖扣 = 該鎖一直鎖著的子模型裡條件仍可達 + 互相等待；另查「題目可在前置之前完成」。測試魔方實算：排列 720、抽象狀態 32,770、卡死 0、test.a 最短 1 / 次短 1 / 2 解、test.b 1 / 2 / 82 解 (59 種)、test.goal 2 / 2 / 取樣 2,938 解 (626 種)，約 0.3 秒。

- **必須序列**：D1 → D2 → D3；D4 依賴 D2；D5 依賴 D4；D6 依賴 D2；D7 依賴 D1、D2。D6 與 D4 / D5 可平行。
- **不做**（留到各章）：第二章真正的六間房與謎題、`slideCell / layer / slice` 的內容與展開圖畫法（介面與單元測試在 D1 已有）、縮影（N30）的 `miniOnly` 路徑。

#### 7.4.2 M1 第二章：2-1 書架迴廊（逐關開發第一關；規格 6「第二章魔方與門位」「2-1 書架迴廊（細化）」）

> 實作註記 (2026-11-03)：**內容** `content/cubes/ch2.ts` (`CH2_CUBE` 2×3、`control:'dial'`、鎖扣 row1 ← `2-1a`、col0～2 ← `2-3a`；`CH2_ZONE21` = 2-1 區抽象模型：只有兩列，三行的解鎖在 2-3 區) + `content/levels/ch2/2-1-shelf.ts` (關卡 id `2-1`、房間 id `shelf`) + `content/levels/ch2/rooms.ts` (占位房 reading / print / mezz / manuscripts / deep：只有門、每房預算 6)；`CUBE_CHAPTERS` 第二章 start = 2-1 西門；登錄表 2-1 前置 1-3、能力白名單 `nib`；章節 2 主題 `study` (`render/themes/study.ts`)。**核心新增兩處** (皆向後相容)：① 掛點 `Mechanic.hidden(w, o)`，`presence.isActiveIn` 多一個條件 (OR 合成；`core/presence.isHidden`)——物件此刻不在場 (碰撞、互動、渲染都經 `isActiveIn`，所以一處生效)；② `World.ext.cube.at` = 這間房此刻的格位 (章節層 `cubeExt` 在進房 / 轉動後寫入)。`core/chapter.roomCleared(spec, state, world)`：控制盤章節、本房 `puzzles` 全有成立的 doneFlag = 房間通關 (第一章仍以章門通關，行為不變)。**機制** `mechanics/shelf.ts`：`ObjBase.frameBay` (屋框書牆的第幾段；房間不在上列那一行 → `hidden`；沒有魔方資訊 = 第 0 行)、類型 `bayShelf` / `lowShelf` / `libraryStep` (呈現)、`bookend` (3D 推倒 → used + done；倒下後 E = 讀底座刻字)、`spine` + `bookLock` (3D 抽書；答案 → 暗格開、給 reward、done；只畫在圖上的書 2D E = `drawnText`)、`remark` (眉批：資訊物件，不計入字條預算)、`scrap` (殘片，grants)。`mechanics/sequence.ts` 的 N27 擴充為 `lampBook` + `lampLock` (同拉繩 / 抽屜流程；鎖指定 step / reset 訊息、reward 可省略；物件有 doneFlag → 發 done，所以點亮每一本都清空回退堆疊，不能點了再退回去省墨)。`cubeDoor.frameText`：接到屋框入口 (來時的走廊) 時的說明 (沒有 = 大門的「來時的門廊」)。`validateLevel` 收集新類型的文字 key、`ref.sequence` 擴充到燈座 / 燈書 / 書 / 暗格。**外殼** `meta/progress`：`ClearKind = level | chapter | room`、`nextAfterClear` (level → 同章下一關、chapter → 下一章第一關、room → 回到同一關)、`recordClear` 另寫 `save.scraps`；`LevelSession` 新 hook `onRoomCleared(room)` (每場景一次)；通關畫面多一顆「繼續」(`#pz-continue`：1-1 →「前往玄關」、1-3 章門 →「前往第二章　書房」、2-1 →「繼續探索」)；換關 (prev = 另一關的通關畫面) 時播新房間的旁白。**呈現** `render/library.ts` (書櫃：書是重複貼圖平面、兩種書 (書背朝牆 / 朝外) 切換可見；藏寶圖裡淡色背景、不像平台)、`render/models/shelf.ts`、`render/decor/library.ts` (`roots` / `stainedGlass` / `floatBooks` / `bookcase`)；`textures.inscription` 加 `pencil` 外觀與寬度；魔方儀模型相鄰小方塊高低錯開 4 mm (轉斜時頂面包圍框重疊 → 共面)。**驗證** `validateDial(CH2_ZONE21)`：排列 9、狀態 2,086、卡死 0、needsRestart 64、無問題；每題最短 / 次短 / 序列 / 本質不同見規格 6 節 2-1。

#### 7.4.3 M1 第二章：2-2 閱覽室（逐關開發第二關；規格 6「2-2 閱覽室（細化）」）

> 實作註記 (2026-11-03)：**內容** `content/levels/ch2/2-2-reading.ts` (關卡 id `2-2`、房間 id `reading`；x∈[-6,14]，門位與占位版相同；`rooms.ts` 轉出 `reading` 維持舊匯入位置)；印房占位房加活字桌 (`readingTable`) 與鏡片 (`lens`)；登錄表 2-2 前置 2-1、章節 2 levels 加 2-2、`CUBE_CHAPTERS` levels 加 `'2-2': 'reading'`；`CH2_ZONE22` (2-1 區 + 2-2a / 2-2b / 2-2c.lens / 2-2c + 終點 `ch2.top`)。**機制** (皆經 4.2 掛點，核心只改 `WorldCommand` 聯集)：`mechanics/reveal.ts` (N24 最小版：`openBook` 3D 翻頁 = used；`inkveil` 的 `after` 經 `Mechanic.hidden` 決定在場、2D 要能寫才塗得開 → used + done)；`mechanics/combine.ts` (N28 最小版：配方表 `RECIPES`、`WorldCommand {t:'combine'}`、`readyRecipe`、類型 `lens` / `smallPrint`)；`mechanics/reading.ts` (書檯、閱覽桌、對聯櫃、下聯、卡片目錄櫃)；`mechanics/labels.ts` 擴充 N22：標籤 `kind:'blank'` (字謎空格；`textKey` 含 `{c}`、`answers` 詞典、`reward`、`solvedText`；寫對 = 物件 used + `opens` + done)、字謎詞卡 `card.wai / nei / qian / li / bian` (`CardDef.glyph`)、`canWrite` = 持有筆尖或開場能力 `nib` (第二章道具欄從空的開始)，`command` 只處理 card / uncard (其他回傳 false 給後面的機制)。**外殼**：C 鍵 (`combine`，`INPUT_ACTIONS` 插在 `turnMode` 之前) 與 HUD「合成」鈕 (`HudData.combine`，有可合的配方才出現)；字卡匣與標籤模型顯示字謎空格 (`ui.label.blank`「＿」)；`labelTag` 長字縮字級。**呈現** `render/models/reading.ts`。**順手**：`DecorCtx.still` (減弱動態) → 浮書靜止 (`PuzzleScene` opts `still`、`SessionContext.still`)。**驗證** `validateDial(CH2_ZONE22)`：排列 9、狀態 18,676、卡死 0、needsRestart 576、2-2c.lens 最短 1；測試 `levels/2-2.test.ts`。

#### 7.4.4 M1 第二章：2-3 印房（逐關開發第三關；規格 6「第二章 2-3～2-5 共用規則」「2-3 印房（細化）」）

> 實作註記 (2026-11-04)：**內容** `content/levels/ch2/2-3-print.ts` (關卡 id `2-3`、房間 id `print`；`rooms.ts` 轉出 `print`)；閱覽室 / 夾層 / 書房深處北牆的洞位 (`cubeDoor` `hole: true`、`kind:'arch'`)；各門 `glyph` (門旁活字)；手稿庫占位房加排字架與三個字輪；`CH2_ZONE23` (+ `plates`、`hasRoute`)。**核心** (向後相容)：`core/cube` `DoorInfo.plate / hole / glyph`、`links(def, s, doors, plates?)`——讀作「間」的門對面沒有門時接到洞位 (洞位回接，列在最後；同一面已有任何門 → 照一般規則)；`core/chapter` `activePlates` / `chapterLinks` / `syncLinks` (標籤改了重算門接法)、`roomLinks` 與 `cubeExt` 用即時標籤、控制盤章節的 `ext.cube.graph` (全章房 ↔ 房接通 + 出門那一側的活字) 與 `ext.cube.layout`、洞位不算門口 (dialCheck)、`clearedRooms` (任何一間房的題全部完成)。**機制** `mechanics/cube` (`doorPlate` 類型、洞位 `hidden` (沒接通不在場)、`PLATE_CARD`)；`mechanics/labels` (`kind:'plate'` + `forms`、部件卡 `card.ri / cai` (`CardDef.slot:'part'`))；`mechanics/print.ts` (`typeCase` / `press` (讀 `ext.cube.links`) / `typeWheel` (字 = used + touched 兩個位元，快照照存) / `typeLock` (`routeCodes` 讀 `ext.cube.graph`) / `typeTray`)。**外殼** `chapterEvents`：`card` ok → `syncLinks`；`LevelSession` 通關改用 `clearedRooms` (每場景每間房送一次)；`cubeMapModel` 門接法含門牌、沒接通的洞位不畫。**呈現** `render/models/print.ts`、門旁活字木牌 (`cubeDoorModel`，只在實景)。**驗證** `devtools/validateCube`：`DialModel.plates`、`DialPuzzle.goal(s, flags, ctx)` (`ctx.links()` 含門牌)；`devtools/validateLevel`：`label kind plate`、新類型的文字 key、`layoutDepthIssues` (擺設三帶)。數字見規格 2-3 區。

#### 7.4.5 M1 第二章：2-4 手稿庫（逐關開發第四關；規格 6「2-4 手稿庫（細化）」）

> 實作註記 (2026-11-04)：**內容** `content/levels/ch2/2-4-manuscripts.ts` (關卡 id `2-4`、房間 id `manuscripts`；x∈[-6,10]、東門 9.8；2-3c 排字架移入)；`content/levels/ch2/drawing.ts` (老宅立面圖折線 `HOUSE_DRAWING`、目標排列 `HOUSE_TARGET`、`floorPiece()`；六間房各加一件 `floorPiece` 裝飾)；印房線索② / 書房深處線索③ (`remark`)；`CH2_ZONE24`。**機制** `mechanics/manuscripts.ts` (`patternCabinet` 讀 `ext.cube.layout` 比對目標、`smallCabinet`、`bundle` (沿用 `shelf.pullSpine`)、`bundleRack`)；`mechanics/labels` `kind:'strip'` (`part` 原本就貼著、取下 = 解開；`attachedCards`)。**外殼** `cubeMapModel` 的 `MapCell.piece` (房間裝飾裡的 floorPiece)；字卡匣的貼著的卡改用 `attachedCards`。**呈現** `render/models/manuscripts.ts` (`drawingTexture` 共用：櫃門上的整張圖、地板上的一角)、`render/decor` `floorPiece` (只在實景)、`ui/cubeMap` 格子裡的淡墨圖。**驗證** `validateLevel`：`label kind strip`、`bundle` 的鎖、新類型的文字 key。數字見規格 2-4 區。

#### 7.4.6 M1 第二章：2-5 書房深處（逐關開發第五關、章末；規格 6「2-5 書房深處（細化）」）

> 實作註記 (2026-11-04)：**內容** `content/levels/ch2/2-5-deep.ts` (關卡 id `2-5`、房間 id `deep`；章門在 2.0 高的平台上、`carving` = 老宅立面圖、`doneFlag` 2-5)；`rooms.ts` 只剩 H1 夾層占位；`CH2_ZONE25`；登錄表 2-5 (前置 2-4)、章節 2 五關齊。**機制** `mechanics/deep.ts` (`keyBench` 柄 + 三枚齒 → `key.study`、`diaryStand` (`diary.2`)、`landing`)；`cubeDoor.carving`。**外殼** `LevelSession`：`world.cleared` (章門打開 = 整章通關) 時不再送房間通關。第三章尚未製作：`nextAfterClear('2-5','chapter')` = null → 通關畫面沒有「前往」鈕，`nextKey` 是占位文字。**呈現** `render/models/deep.ts`、章門刻圖。**驗證**數字見規格 2-5 區；Playwright：印房推鉛字盤過「間」的洞、鑰匙台、墊腳上平台、手記、章門 (兩種解法：印房在正上方 / 在第 1 行推過去再帶回第 2 行)。

> 實作註記 (2026-11-04，物件風格統一)：使用者回饋「物件跟場景沒有很搭配」→ 規格 6「第二章 2-3～2-5 共用規則」新增**物件外觀規則**。**呈現**：`notes` 的 `note.mount` (`'post'` 落地木柱 / `'pile'` 斜靠書堆；只影響外觀)；`models/props` `noteModel` 依 mount 畫支架；`models/dial` 魔方儀改為胡桃木圓几 + 黃銅渾儀環 (原用第一章木箱色 `pal.crateDark`)；`models/print` 鉛字盤改為活字推車 (腳輪、三層抽屜、木框淺盤；原為 `pal.crate` 亮色木箱)；`models/manuscripts` 閉櫃 (胡桃木、出簷頂板、鑲板門與黃銅圓鈕)、手稿架 (框板、後橫檔、下層紙疊)、手稿櫃頂冠高出櫃身 5 mm (原與櫃身頂面共面)；`models/deep` 章門平台 (踢腳、出簷、正面兩層書格、西側鑲板；拿掉西緣兩根柱子——那一側是墊腳爬上去的方向)、鑰匙台 (工作台：桌裙、橫撐、工具盒、虎鉗、托盤上鑰匙形凹槽)、手記架 (斜面書托)；`models/shelf` 矮書架 (開放書格塞滿書)、書 spine (兩片書皮夾書頁)、燈座 (胡桃木矮几上的燭台)；`models/reading` 閱覽桌 (桌裙、H 形橫撐、墨水瓶)；`render/library` 匯出 `booksPlane`；`render/geometry` (`mergeParts`)；`render/decor/furniture` (`armchair` / `floorLamp` / `bookPile` / `ladder`，只在實景)。**內容**：2-3 / 2-4 / 2-5 的字條加 `mount` (2-3、2-4 木柱；2-5 書堆)、2-4 閱讀角加扶手椅與落地燈、2-4 東側書櫃 x 8.6 → 8.4 (字條釘在書櫃上)。碰撞盒、謎題行為、所有座標相關測試不變。繪製次數 (3D 可見網格)：2-3 247 → 282、2-4 233 → 253、2-5 197 → 231。

> 實作註記 (2026-11-04，2-1 / 2-2 重排)：使用者回饋「房間的擺設只是把東西排成一列」→ 2-1、2-2 照擺設規則重排 (規格 6 兩關的「分區與擺設」與物件表)。只動非實體物件的 z (x 不變：藏寶圖的畫面、2D 互動距離、字條間距都不變；兩關的實體只有書梯，未動)。**2-1**：2-1b 整組 (矮書架、五本書與「影」、暗格、三條眉批、字條 B) 從書牆前 (z≈-4) 移到前景的書架島 (`ISLAND_Z` = 2.4；凸出的書 = 2.65、暗格 2.82、眉批二 2.8 夾在書堆裝飾正面、字條 B 改 `mount:'post'`)；中景走道鋪長地毯；裝飾加梯子、兩張扶手椅、落地燈、書堆。**2-2**：書檯 / 書 / 淡墨 z -3.8 / -3.7 / -3.45 → -1.6 / -1.5 / -1.25；閱覽桌與書脊 -3.4 → 0.6；卡片目錄櫃 -4.2 → -1.0；字條 C → (4.6, 0.2) `mount:'post'`；東側書櫃 11.4 (寬 1.4) → 12.0 (寬 2.6)；裝飾加書梯、三張扶手椅、兩盞落地燈、兩疊書，彩繪玻璃光斑移到書檯旁。**測試**：`levels/2-1` 抽書 / 看書 / 眉批二的站位 z -3.0 / -3.3 → `ISLAND_Z + 1.0`、凸出判定 `z > -4` → `z > ISLAND_Z`、字條站位 `-3.9` → `o.z + 0.5`；`levels/2-2` 翻頁 -2.9 → -0.7、目錄櫃 -3.2 → 0.0、書脊 -2.4 → 1.6、字條站位同上；兩關加 `layoutDepthIssues = []` 與分帶斷言。`validateDial` 數字不變。繪製次數 (3D 可見網格)：2-1 289 → 331、2-2 278 → 313。

> 實作註記 (2026-11-04，1-3 重排)：1-3 衣帽間的可互動物件原本全在後牆與中段 (`layoutDepthIssues` 缺前景)：字條 B (x=5) z -4.95 → 2.4、`mount:'post'`；裝飾加扶手椅與落地燈 (前景西側)。測試 `levels/1-3` 字條站位 `-4.4` → `o.z + 0.5`、加 `layoutDepthIssues = []`。1-1 (全深的鐵柵 / 墨牆 / 台階 / 玻璃牆) 與 1-2 (全深長桌、書架平台與木欄、牆上的畫像與拉繩、掛鉤) 的位置由謎題幾何與路線測試 (`foyerSolution`、`ch1Routes`) 決定，不重排。

#### 7.4.7 M1 第三章：溫室（規格 6「第三章魔方與門位（v0.4 細化）」「第三章共用規則」；逐關開發）

> 設計註記 (2026-11-04，第三章設計)：**內容** `content/cubes/ch3.ts`（3×3、`ops:'slide'`、`control:'dial'`；九個 `slideCell` 組、無鎖扣；屋框：入口 [0,1] W、天窗 [0,0] / [1,0] N、章門出口 [2,2] S）、`content/levels/ch3/*`（苗圃 / 長廊 / 夜溫室 / 深處 + 溫床占位）。**機制**（皆經 4.2 掛點）：`mechanics/scale.ts`（N23；尺度卡貼名詞標籤的方槽 → 改寫 `ObjState.def` 的 w / h / d 與重量；`jam` 物件伸出房間 → `blocksTrack`）、`mechanics/balance.ts`（N29；秤盤上固定的陶盆、閂住的 `want`；跨房半座天平讀 `World.ext.balance`）、`mechanics/light.ts`（N26；`sensor` 讀 `World.ext.light`）。**章節層**（`core/chapter.ts`，純函式）：`lightPaths`（天窗 → 逐格玻璃 / 稜鏡傳播）、跨房天平合成、`ChapterSpec.jammed(room, state)`（非當前房的卡榫；由 app 注入機制表的純函式，核心不 import mechanics）、`World.ext.protrude`（3-3c 伸進隔壁的盆）。**外殼**：轉動模式的滑動箭頭（`app/cubeMapModel` 的 slideCell 標頭 = 每間鄰接空格的房 × 方向）、光路圖層、卡榫楔形；存檔能力 `scale` 進第二章時另發尺度卡（H1）。**驗證**：`validateDial` 加 `jams`；各區模型 `CH3_ZONE31`…。第二章 → 第三章：`cs:ch2`（三鏡剪紙）、2-5 通關畫面「前往溫室」。

> 設計註記 (2026-11-04，第三章骨架與銜接；規格 6「第三章骨架與銜接（v0.4 細化）」)：**內容** `content/cubes/ch3.ts` (`CH3_CUBE`、`CH3_GLASS`；`CubeDef.cells[].label` = 實心格的顯示名) + `content/levels/ch3/3-1-nursery.ts` (關卡 id `3-1`、房間 id `nursery`) + `content/levels/ch3/rooms.ts` (gallery / night / depths / bed 占位房；每房墨 8)；`CHAPTERS` / `CUBE_CHAPTERS` / `LEVELS` 加第三章與 3-1。**機制** `mechanics/dial`：`dial` 類型加選填 `readyText`、`fixedCells` (外觀)；`chapterEvents` 的啟動訊息改取魔方儀物件的 `useText` (沒有 = `msg.dial.activated`，第二章不變)。**外殼** `app/cubeMapModel`：`deriveTurnMode` 為 `slideCell` 組產生標頭 (`at.side = 'cell'`、`cell: {x, y}`)；`TurnModeInput` 加 `{ t: 'cell'; x; y }` (點格子)；`reduceTurnMode` 回傳選填 `note` (說明的文字 key：實心格 / 旁邊沒有空格 / 沒有房間能往那邊滑)；方向鍵在滑動章節 = 選往那個方向滑的房。`ui/cubeMap`：滑動箭頭畫在房間與空格的交界、格子點擊區、實心格的名稱。`meta/cutscenes.cutsceneBeforeLevel`；`app.ts` 的「繼續」與選單進關先查它。**呈現** `render/themes/greenhouse.ts`、`render/decor/greenhouse.ts` (`glassPane` / `planter` / `pots` / `pottingRack` / `glowPlants` / `bench`；只在實景、同材質合併)、`render/models/dial` 的園丁羅盤、`render/cutscene/scenes.ts` 的 `ch2.*` 三鏡。**音訊** `CUTSCENE_SCORE['cs:ch2'] = 'ch2'`、`SHOT_MUSIC['cs:ch2']`。核心 (`core/`) 只多 `CubeDef.cells[].label` 一個選填欄位。

> 實作註記 (2026-11-04，第三章骨架與銜接)：照上方設計註記實作。**與設計的差異**：① 滑動箭頭的邊長 = min(44, 格寬 × 0.46)、至少 28 px (同一個角上最多四個箭頭；390×844 的格寬約 57 px → 28 px、1280×720 約 84 px → 38 px，四個箭頭都不重疊)，觸控區改由格子負責 (`ui/cubeMap` 的格子按鈕：點在箭頭 0.4 格內 = `pick` 那個箭頭，否則 = `cell`)；② 溫室深處中景的紙籤插在木樁上 (`stake` 裝飾) 且只在實景 (藏寶圖裡沒有依託會浮在空中)；③ 滑完的訊息依 `ops` 分「那間房滑進了空格。」/「房間連你一起滑進了空格。」(`msg.dial.slid*`)。**數字**：`validateDial` (CH3_CUBE、無卡榫、終點 = 苗圃滑到天窗下)：可達排列 2,520、抽象狀態 80,621、卡死 0、需要 R 的狀態 12,201、最短 1 / 次短 2；`cs:ch2` 計畫總長 28.8 秒 (鏡 9.7 / 10.4 / 8.6)。**繪製次數** (Playwright 1280×720，進房 4.8 秒後 `renderer.info.render`)：苗圃 3D 161 calls / 17,742 三角形 (2D 136 / 11,372)、玻璃長廊 146 / 10,336 (112 / 8,748)、夜溫室 129 / 11,046 (105 / 8,944)、溫室深處 129 / 10,482 (103 / 8,586)、溫床 121 / 8,740 (85 / 7,492)；對照 2-5 書房深處 3D 204 / 8,982。**測試**：`levels/ch3Skeleton.test.ts`、`app/turnModeSlide.test.ts`、`app/cutsceneCh2.test.ts`、`render/coplanar` 加第三章五間房。

> 設計註記 (2026-11-04，3-1 苗圃；規格 6「3-1 苗圃（細化）」)：**機制**（皆經 4.2 掛點，核心只多一個查詢）：`mechanics/scale.ts`（N23）——尺度卡 `card.da` / `card.xiao` 由 `labels.ts` 收進 `CARDS`（`slot: 'scale'`；只有 `label.scale` 的名詞標籤收）；貼 / 取卡時 `labels` 先問 `scale.canResize`（放大前卡牆：新盒與兩模式的實體重疊或出界 →「這裡放不下。」卡片退回；`jam` 物件不查出界），成功後 `applyScale`：以底部中心改寫 `ObjState.def` 的 w / h / d（原值 = `World.level.objects` 的同 id 定義），再 `resolvePlayerOverlap`；`beforePhysics` 每步依標籤重算（讀檔 / 換房後不必另存縮放狀態：縮放 = 標籤的函式）。重量 `weightOf` = 大 3 / 原 2 / 小 1（沒有標籤 = `weight` 欄或 2）。卡榫：`jam: true` 物件的有效盒伸出 `level.bounds` → `blocksTrack`；`roomJammed(level, labels)` 是同一判定的純資料版。**與 4.18 原設計的差異**：不加核心 `size` 掛點，改寫 `def`（規格 v0.4「第三章共用規則」）；縮放狀態不存 `ObjState.ext`（由標籤推導）。`mechanics/balance.ts`（N29 單房）：`balance` 的 `pans: { W, E }` 列秤盤上的固定物件 id、`want`；每步算傾向，成立 → `used`（閂住）、`opens`、`doneFlag`；傾向變成反方向時說 `wrongText`；`pot`（固定、3D 按 E = 說明）。跨房半座天平（3-3a）留介面：`balanceHalf` + `World.ext.balance`（章節層寫入）。`mechanics/nursery.ts`：`ruler`（3D 拿：道具 `scale` + 兩張尺度卡）、`trellis`（花架門：`used` = 不擋路）、`pottingShelf`（只在實景的實體）、`root`（樹根：`home` 格位；玩家在房內、`ext.cube.at` ≠ home → `used` + done）、`pane`（`under` 的物件 used 之後才在場）。**章節層**：`ChapterSpec.jammed?(room, state)`——`dialCheck` 對組內每一間房：玩家所在房問機制掛點 `blocksTrack(world)`，其他房問 `spec.jammed`（app 以 `mechanics/index.chapterSpecOf` 組 spec：`jammed = scale.jamQuery(rooms)`，讀該房關卡資料 + `state.labels`）。**驗證**：`DialModel.jams`（`until` 成立前 / `from` 成立後卡住；轉動邊與多解列舉都跳過卡住的房）；`CH3_ZONE31`。**呈現**：`render/models/nursery.ts`（花秤依兩盆的有效尺寸算傾向——render 不能 import mechanics 的值，傾向以 `def` 尺寸換算重量；陶盆 / 樹根的本體 `scale` = 有效尺寸 / 原尺寸，標籤不跟著縮；2D 角標「大 / 小」、陶盆重量點）。**存檔**：`AbilityId` / `ABILITY_IDS` 加 `scale`（讀檔校正只留白名單）；縮放不進快照。

> 實作註記 (2026-11-04，3-1 苗圃)：照上方 3-1 設計註記實作。**新檔**：`mechanics/scale.ts`（`SCALE_CARDS` / `scaleFactor` / `canResize` / `applyScale` / `rescale` / `weightOf` / `worldJammed` / `roomJammed` / `jamQuery`；機制 `scale`：`beforePhysics` = 依標籤重算尺寸、`blocksTrack` = 卡榫）、`mechanics/balance.ts`（`balance` / `pot`；`panWeight` / `tiltOf`；`WorldExt.balance` 型別先留給 3-3a）、`mechanics/nursery.ts`（`ruler` / `trellis` / `pottingShelf` / `root` / `pane`）、`render/models/nursery.ts`、`render/decor/greenhouse.toolBoard`。**改動**：`core/types` `AbilityId` 加 `scale`；`core/chapter` `ChapterSpec.jammed?` + `dialCheck` 查組內其他房；`mechanics/index` `chapterSpecOf`（app 與測試共用；`DEFAULT_MECHANICS` 尾端加 scale / balance / nursery）；`mechanics/labels` 尺度卡 (`CardDef.slot 'scale'`、`accepts`、貼 / 取前 `canResize`、`msg.scale.*`)、`label.after`（`labelCovered`；`labelTarget` 跳過被蓋住的標籤）；`devtools/validateCube` `DialModel.jams` + `dialModelOf(…, extra)`；`devtools/validateLevel` 新類型的文字 key、`ruler.also` 算進可取得的道具、`label.after` 的引用檢查；`meta/save` `ABILITY_IDS` 加 `scale`；`app/cardTrayModel` 名詞 + 尺度卡 =「大陶盆」、尺度訊息在字卡匣顯示；`render/textures.labelTag` 方槽貼卡時畫字、`scaleCornerTag`；`render/models/label` `scaleGlyph` / `scaleRatio` / `scaleCorner`、徽章遵守 `label.after`；`audio/events` `USED_ON` 加 balance / trellis / root；`app/app` + `LevelSession.closeOverlays()`（通關畫面模態，見規格 3-1 實作註記 ④）。**後續介面**（3-2 / 3-3 / H1）：量 = `scaleFactor(def, labels)` / `weightOf(w, o)` / `canResize(w, o, f)`（跨房伸出 3-3c：`jamOut` 的盒子越過拱門那一側時，章節層把「伸進隔壁的那一截」寫入 `World.ext.protrude`，`jamQuery` 改成同時查拱門此刻接到的房）；天平 = `balance.pans` + `tiltOf`，跨房半座由章節層合成後寫 `World.ext.balance[id].other`、`tiltOf` 加上對面的重量；卡榫 = `ChapterSpec.jammed(room, state)`（3-3c、3-4b 都走這條，`DialModel.jams` 的 `from` 給 3-3c「放大後卡住」用）；H1 = `chapterStart` 依 `save.abilities` 補 `card.da` / `card.xiao` 到第二章章節道具（字卡匣第四格待定）。

> 設計註記 (2026-11-04，3-2 玻璃長廊；規格 6「3-2 玻璃長廊（細化）」)：**核心**（4.19 原名 `lightGraph` / `lightpath.ts` 改為 `lightPaths` / `mechanics/light.ts`，同規格「第三章共用規則」）：`core/cube` 加 `RoomGlass { glass; prism?; covered? }` 與選填 `CubeDef.glass`（第三章 = `CH3_GLASS`；內容層只放資料）；`core/chapter` 加純函式 `lightPaths(def, cube, uncovered?) → { beams, hits }`（天窗依 `def.frame` 順序，逐格玻璃 / 稜鏡傳播、同一條光不進同一房兩次）與 `lightState(hits, from, via) → dark｜white｜weak｜lit`；`WorldExt.light = { hits }`（以 `declare module` 寫在 `core/chapter`，避免 `types ↔ cube` 型別循環），在 `writeExt`（進房 / 讀檔 / R）與 `writeLinks`（轉動 / 回退 / 改標籤）寫入當前房的那一份。**機制** `mechanics/light.ts`：類型 `sensor`（`from` / `via` / 文字 / `beam` 光柱起點 / `mount`）——`afterPhysics` 讀 `ext.light`、lit 的那一刻閂住 + done、變成 white / weak 時說一次；3D 按 E 說此刻的樣子；`ObjBase.revealedBy`（`hidden` 掛點：指定物件 used 之前不在場）。**驗證** `devtools/validateCube`：`DialPuzzle.light?: { from; via }`（內容層只能 import 核心型別，光路條件以資料宣告，`validateDial` 以同一個 `lightPaths` + `lightState` 判定，每個排列快取一次）；`CH3_ZONE32`。**外殼** `app/cubeMapModel`：`deriveCubeMap` / `deriveTurnMode` 的預覽各帶 `light: MapLight`（`segs` = 光路折線，格座標，`white` 標記天窗直射那一段；`stops`；`glass` / `prisms` = 窗與稜鏡記號）；`ui/cubeMap` 畫光路圖層（白光 = 點線、穿過玻璃的光 = 虛線 + 箭頭紋 ›、牆外停 = 短橫槓、房內停 = 圓點）與兩項圖例。**呈現** `render/models/light.ts`：感光花（落地大陶盆 / 窗台兩種 `mount`、花苞 ↔ 開花、2D 光點的形狀區分）與光柱（加色混合、不寫深度、亮度緩入緩出不閃爍）。**音訊** `USED_ON.sensor`。**內容**：`content/levels/ch3/3-2-gallery.ts`（關卡 id `3-2`，房間 id `gallery`；x∈[−10, 10]）、`LEVELS` / `CHAPTERS` / `CUBE_CHAPTERS` 登錄 3-2。**後續介面**（3-3 / 3-4）：3-4a 的「天光照進深處北窗」= `lightState(hits.depths, 'N', k)`；3-4b 的苔窗 = `CH3_GLASS.depths.covered`，巨根縮小後由章節層把 `'depths.W'` 放進 `uncovered`（`ChapterSpec` 加查詢，同 `jammed` 由 app 注入）；沒有感光物的房要畫光柱時加同一個模型的無花版本。

> 實作註記 (2026-11-04，3-2 玻璃長廊)：照上方 3-2 設計註記實作。**新檔**：`mechanics/light.ts`（`sensor`、`sensorLight`、`revealedBy`）、`render/models/light.ts`（`sensorModel`：落地大陶盆 / 窗台花架兩種 `mount`、花苞 ↔ 開花、光柱、2D 光點三種形狀）、`content/levels/ch3/3-2-gallery.ts`、`content/text/zh-Hant/lvl-3-2.ts`。**改動**：`core/cube` `RoomGlass` / `CubeDef.glass`；`core/chapter` `lightPaths` / `lightState` / `LightHit` / `LightBeam` / `WorldExt.light`（`writeExt`、`writeLinks` 寫入）；`content/cubes/ch3` `CH3_GLASS` 移到 `CH3_CUBE` 之前、深處 `covered: ['W']`、`CH3_ZONE32`；`content/cubes/ch2` `ZonePuzzle.light`；`devtools/validateCube` `DialPuzzle.light` + `goalHolds`（光路每個排列快取一次）；`app/cubeMapModel` `mapLight(def, cube, layer)`（`deriveCubeMap.light`、`deriveTurnMode` 預覽的 `light`、圖例 `stained` / `white`）；`ui/cubeMap` `MapLight` 型別、`light()` 圖層、格子分兩段畫（底 → 光路 → 房名描邊）；`ui/puzzle.css` 圖例兩項；`audio/events` `USED_ON.sensor = sfx.lamp.on`；登錄表（`LEVELS` 3-2、`CHAPTERS`、`CUBE_CHAPTERS`）；`term.pane.2` / `term.scrap.2`、`obj.sensor.verb`、`ui.map.legend.*`。**後續介面**（3-3 / 3-4）：光路 = `lightPaths(def, cube, uncovered?)`（`beams[i].steps` / `stop`、`hits[room]`）+ `lightState(hits, from, via)`；感光物 = `sensor { from, via, closedText, whiteText, weakText, solvedText, openText, beam?, mount? }`（閂住、`doneFlag`；3-4a 的「許」字若要讀排列另加條件，光的部分照用）；被蓋住的玻璃 = `RoomGlass.covered` + `uncovered`（`'room.side'`，本地門位；3-4b 由章節層依巨根的尺度卡給）；展開圖 = `mapLight` 已畫所有有玻璃的房，3-4 不必改 UI；驗證 = `DialPuzzle.light`（同一個純函式）。

> 設計註記 (2026-11-04，3-3 夜溫室；規格 6「3-3 夜溫室（細化）」)：**章節層**（`core/chapter`）：`ChapterSpec.derive?(room, state, labels) → Pick<WorldExt, 'balance' | 'protrude'>`——跨房的推導結果（半座天平的對面重量 / 已閂住、伸進這一房的那一截），由 app 以機制表的純函式注入（`mechanics/index.chapterSpecOf`，同 `jammed`；核心不 import mechanics），`writeExt`（進房 / 讀檔 / R）與 `writeLinks`（轉動 / 回退 / 改標籤）寫入當前房；`dialCheck` 查其他房的卡榫時傳即時標籤（`world.ext.labels`）。**機制**：`mechanics/balance` 加 `balanceHalf`（`door` + `pans` + `want 'level'`；讀 `ext.balance[id] = { other?, done? }`：接上才有 `other`，`done` = 對面那一半已閂住 → 這一半安靜閂住）；`mechanics/scale` 加 `protrude: <門 id>`（`canResize` 允許只從那扇門越界、而且那扇門此刻拱門對拱門）、推導實體 `protrudeStep`（每步依 `ext.protrude` 生成 / 移除，id `protrude:<物件>`；`snapshotRoom` 不收）、`ext.protrude` 非空 = `blocksTrack`、`jamQuery(rooms, cube, doors)` 同時查拱門此刻接到的房伸過來的東西、`stayShrunk`（`used` 的卡榫物件以「小」計：3-1b 之後的樹根）、`pushTo`（`used` = 被推過：位置與卡榫都照推過的位置；不在場的房讀快照的 `used`）；新檔 `mechanics/night.ts`（巨盆被推的時機：半座天平閂住、人在房內、相對安靜 2.5 秒 → `used` + 章節旗標 `scare:handprint`；旗標已在 = 安靜地推過去）；`mechanics/light` 的 `sensor` 加 `alone` / `crowdText`（四面門都不接房才算 lit）。**內容**：`content/levels/ch3/3-3-night.ts`（關卡 id `3-3`）、苗圃加 `halfS` / `potS`、溫室深處加 `ledge` / 筆記一頁；`CH3_ZONE33`；登錄表 3-3。**驗證**：`DialPuzzle.excluded.minSteps` 可為 `Infinity`（不縮 = 無解）。

> 實作註記 (2026-11-04，3-3 夜溫室)：照上方 3-3 設計註記實作。**新檔**：`mechanics/cross.ts`（`deriveQuery(rooms, cube, doors)` = `ChapterSpec.derive`：`balanceExt`（半座天平的 `other` / `done`）+ `protrusionsInto`；沒有的欄位寫 `undefined` 清掉上一次的結果）、`mechanics/night.ts`（`bigPot`：`pushWhen` 物件 used、人在房內、安靜 `SCARE_DELAY` → used + `scare:<id>` 旗標 + `pushText`；旗標已在 → 安靜地推；`ledge`；`page`：拾取 = used + `doneFlag`）、`content/levels/ch3/3-3-night.ts`、`content/text/zh-Hant/lvl-3-3.ts`、`render/themes` 的 `greenhouseNight`。**改動**：`core/types` `ObjBase.derived`（推導物件：`snapshotRoom` 不收）；`core/chapter` `ChapterSpec.derive?` + `writeDerived`（`writeExt` 用章節標籤、`writeLinks` 用即時標籤）、`dialCheck` 查其他房的卡榫時傳即時標籤；`mechanics/scale` `stayShrunk` / `pushTo` / `protrude`（`effectiveFactor`、`placeOf`、`defWeight`、`protrudeOk`（越界只在那扇門那一側、且 `ext.cube.links` 是拱門對拱門）、`protrusionsInto`、`jamQuery(CrossRooms)`（自己的卡榫物件用快照的 used + 伸進來的東西）、`syncProtrude`（每步依 `ext.protrude` 增刪 `protrudeStep`）、`WorldExt.protrude`）；`mechanics/balance` `balanceHalf`（`halfWeight` / `halfTilt`；`WorldExt.balance` 型別改為 `{ other?, done? }`；半座天平本身不可互動，盤上的 `pot` 按 E 在沒接上時說 `unjoinedText`；`pot.shape` can / trough）；`mechanics/light` `sensor.alone` / `crowdText`（`sensorLight` 回傳 `'crowd'`）、`roomConnected`；`mechanics/index` `chapterSpecOf` 注入 `jammed` / `derive`（`CrossRooms` 共用）、機制表尾端加 `night`；`content/cubes/ch2` `ZonePuzzle.excluded`、`ZoneLink.kind`；`content/cubes/ch3` `CH3_ZONE33`；苗圃加 `halfS` / `potS`、樹根 `stayShrunk`；溫室深處加 `ledge` / `pageGarden`；登錄表 3-3；`audio/events` `USED_ON`（balanceHalf / bigPot / page）、`SCARE_SFX['scare:handprint']`、`page.*` 撿到 = 紙聲。**後續介面**（3-4）：卡榫 = `ChapterSpec.jammed(room, state)`（`jamQuery`：`roomJammed(level, labels, used)` + `protrusionsInto`）；巨根若要「縮了之後露出苔窗」，`ChapterSpec.derive` 加一個欄位或另立 `uncovered` 查詢（`lightPaths(def, cube, uncovered)` 已收 `'depths.W'`），判定讀巨根的 `effectiveFactor`；跨房天平 = `balanceHalf { door, pans, pair }` + `ext.balance`；伸出 = `protrude: <門 id>` + `ext.protrude`（`protrudeStep` 推導實體）；花窗玻璃片三 = 物品 `pane.3`（夜溫室 `pane3`，`under: 'halfN'`）。

> 設計註記 (2026-11-05，3-4 溫室深處；規格 6「3-4 溫室深處（細化）」)：**章節層**（`core/chapter`）：`ChapterSpec.uncovered?(state, labels) → string[]`——此刻露出來的被蓋住的玻璃（`'depths.W'`：巨根的有效尺寸是「小」或 `stayShrunk`），由 app 以機制表的純函式注入（`mechanics/index.chapterSpecOf`，同 `jammed` / `derive`）；`lightExt` 收 `uncovered`（`writeExt` 用章節標籤、`writeLinks` 用即時標籤），`app/cubeMapModel.mapLight` 與 `validateDial` 以同一個結果呼叫 `lightPaths(def, cube, uncovered)`。`LevelDef.turnBudget.refillOn?: string[]`（該題的 `done` 事件 → 本房墨補滿；只用在 3-4b）。`GameEvent` 加 `{ t: 'chase'; id; s: 'omen' | 'start' | 'caught' | 'end' | 'autoPass' }`；`Runtime.calm`（`WorldOptions.calm`；`LevelSession` 的 `calm` 傳進 `openChapter` 選項），追逐自動通過屬邏輯效果（4.13 已述），不靠呈現層。**機制**：新檔 `mechanics/depths.ts`（`paneFrame`：`parts` 全持有 → 各減一、`used`；缺 → `missingText {n}`；`lattice`：`cells`（列優先，`'empty' | 'solid' | 'any' | <room>`）比對 `ext.cube.layout` + `lightState(ext.light.hits, light.from, light.via)`，成立 → `used` + `doneFlag`、狀態變成 patternOnly / lightOnly 時說一次（同 `sensor` 的寫法）；`chaseGate`：`passable` = `opensWhen` 的物件 used；`giantRoot`：卡榫物件（`jam`、`label.scale`、`label.after 'lattice'`、`stayShrunk`、`covers: Side`），苔窗 used 的那一刻 `used`（= 縮回土裡）；`uncoveredQuery(rooms)` = `ChapterSpec.uncovered`）；新檔 `mechanics/chase.ts`（4.14 落實：資料改為關卡物件 `chaser`（`ObjKinds`，`derived: true` 不進快照）——第三章的房由 `ChapterSpec.rooms` 建 World、不經 `LevelEntry`，所以 4.8 的 `LevelEntry.chases` 不用；狀態機 idle → omen（過 `omenX`、`requires` used、旗標未成立）→ run（過 `triggerX` 且預兆滿 `omenSec`）→ caught（2D 盒重疊：回 `checkpoint`、計數 +1、≥ `assistAfter` 時速度 × `assistFactor`）/ end（過 `endX`：`noteFlag(flag)`、事件 end）；走回 `omenX` 之前 = 重置；`rt.calm` = 過預兆線即 `noteFlag` + autoPass、不生成殘影；位置 = 出生點 + 速度 × 模擬時間，計數存在 World 本地）；`mechanics/light` 的 `sensor` 加 `coveredBy` / `coveredText` / `mount 'wall'`。**驗證**（`devtools/validateCube`）：`DialModel.cards?`（卡片位置 = 狀態的一維：槽或手上；動作 = 人在槽所在房時拿 / 放，不耗墨；`slot.after` = 該題完成後才貼得上）、`jams[].unless`（卡在某槽時不卡）、`DialPuzzle.card` / `light.uncovered` / `refill`；⑦ 多解列舉把拿放卡當成不耗步數的動作。理由：單調旗標的階段近似對「唯一的『小』在巨盆 / 巨根之間搬」會報假卡死（原型 742 個）。`CH3_ZONE34`（`3-4a.light` 起點、3-4a、3-4b、`ch3.depths`）。`validateLevel`：`chaser` 的走道檢查（4.14 的 `validate` 條目，改讀關卡物件）。**內容**：`content/levels/ch3/3-4-depths.ts`（關卡 id `3-4`、房間 id `depths`；x∈[−10, 62]：主室 + 追逐長廊；`ledge` / `pageGarden` / `chapterS` 的 id 不變）、`lvl-3-4.ts`、`term.key.greenhouse` / `term.diary.3`；登錄表 3-4（前置 3-3）；`nextAfterClear('3-4', 'chapter') = null`（第四章占位）；`cs:ch3` 本版不做。**呈現**：`render/models/depths`（九格花窗：剪影只在實景、墨線兩邊、「許」字緩亮；花窗架 / 抽屜；巨根依有效尺寸縮放並蓋住苔窗；苔窗 = `sensorModel` 的無花版本；舊羅盤架；柵門）、`render/models/chaser`（只在藏寶圖、`#8A96B0` 0.4、減弱動態 = 靜止）、長廊裝飾同材質合併 + 重複玻璃格 `InstancedMesh`；鐵柵 / 墨牆沿用 1-1。**音訊**：`USED_ON` 加 `paneFrame` / `lattice` / `chaseGate`；`worldEventActions` 的 `chase`（omen = 情境 `tension` + 遠處腳步、caught = `sfx.chase.caught`、end = `quiet` 20 秒 → `explore`）；`GAME_EVENT_TYPES` 加 `chase`；`SCARE_SFX` 不加。

> 實作註記 (2026-11-05，3-4 實作一)：照上方 3-4 設計註記實作 3-4a / 3-4b 與驗證器。**新檔**：`mechanics/depths.ts`（`paneFrame`、`lattice`（`latticeState` / `latticePattern`）、`latticeBox`、`giantRoot`、`chaseGate`（最小版 `passable`）、`oldCompass`、`uncoveredQuery`）、`content/levels/ch3/3-4-depths.ts`、`content/text/zh-Hant/lvl-3-4.ts`、`render/models/depths.ts`（花窗 / 花窗架 / 抽屜 / 巨根 / 舊羅盤架 / 柵門）、苔窗 = `render/models/light` 的 `mossWindowModel`、裝飾 `stonePath` / `chaseHall`（同材質合併、北牆玻璃格 `InstancedMesh`）。**改動**：`core/chapter` `ChapterSpec.uncovered?`、`uncoveredGlass` / `sessionUncovered`、`lightExt` 收即時標籤與 World；`core/types` `turnBudget.refillOn / refillText`；`app/chapterEvents` 補墨；`app/cubeMapModel.mapLight` 收 `uncovered`；`mechanics/light` `sensor.coveredBy / coveredText / mount 'wall'`；`devtools/validateCube` `cards`（卡片位置 = 狀態的一維，`cardSpaceOf`）、`jams[].unless`、`DialPuzzle.card / light.uncovered / refill / span`、⑦ 列舉把拿放卡當成不耗步數的動作（(房, 卡位置) 的閉包）、光路快取依魔方定義分開；`validateLevel` 認 sensor / paneFrame / lattice / oldCompass 的文字 key 與 `refillText`。**留給實作二**：`mechanics/chase.ts`（`chaser`）、`GameEvent chase`、`Runtime.calm`、`USED_ON chaseGate` 與 chase 音訊、`validateLevel` 的 `chaser` 檢查、繪製次數與 Playwright。

> 實作註記 (2026-11-05，3-4 實作二：追逐 1 與第三章通關)：照上方 3-4 設計註記實作追逐。**新檔**：`mechanics/chase.ts`（`chaser` 類型與 `afterPhysics`：狀態存 `WeakMap<ObjState, ChaseRun>`（World 本地）；位置 = `spawnX + speed × (World.time − startAt)`，只讀固定步長累加的模擬時間；被追上 = 2D 且 `overlaps(boxAt(玩家), objBox(殘影), '2d')`；完成 = `w.events` 推 `{ t: 'flag', flag }`（章節層 `noteFlag` 寫進 state 與 entry）+ `{ t: 'chase', s: 'end' | 'autoPass' }`；`ext.flags` 已有旗標 = done；`chaseRun` / `chaserSpeed` 匯出給測試）、`render/models/chaser.ts`。**改動**：`core/types` `Runtime.calm?`、`GameEvent { t: 'chase'; id; s: ChasePhase }`（`ChasePhase` 多 `'reset'`）；`core/world` `WorldOptions.calm` → `rt.calm`；`app/levelSession` 的 `opts` 帶 `ctx.calm`（`openChapter` / `enterRoom` / `restartRoom` 都用同一份）；`mechanics/index` 機制表尾端加 `chase`（在 `depths` 之後讀柵門）；`mechanics/depths` 柵門 `used` 跟著花窗；`audio/events` `GAME_EVENT_TYPES` 加 `chase`、`CHASE_ACTIONS`（omen = `{ kind: 'chase', op: 'on' }` + `sfx.amb.footstep`、caught = `sfx.chase.caught`、end = `op 'quiet'`、reset = `op 'off'`、start / autoPass = 無）、`AudioAction` 加 `{ kind: 'chase'; op }`、`USED_ON.chaseGate = sfx.gate.open`、`CHASE_QUIET_SEC = 20`；`audio/sfx` `sfx.chase.caught`（−20 dBFS、約 0.4 秒的揉紙聲）；`audio/music` `setContext(c, at, fade = 0.8)`；`audio/manager` `chase(op)`（`chaseBack` 記住外殼要的情境；`levelStart` / `levelEnd` 收回）、`CHASE_OMEN_FADE = 3`；`app/audioBridge` 換了 World（R / 換房）→ `chase('off')`；`devtools/validateLevel` `chase.field` + `chaserIssues` + `CHASE_MIN`、`typeKeys` 認 `caughtText`；`render/models/porch.barsModel` 同材質合併（每道鐵柵 71 → 2 個網格）；`render/models/index` 登錄 `chaser`。**第三章通關**沒有新程式（`world.cleared` → `go('clear', kind 'chapter')` → `recordClear(…, CUBE_CHAPTERS 第三章 levels)`、`nextAfterClear` = null → 「繼續」鈕隱藏）。**後續介面**（4-4a / 5-5b 的 N31 跨房追逐）：殘影的單房邏輯在 `mechanics/chase`（`ChaseRun`、`chaserSpeed`、`caughtText`、`checkpoint`）；跨房要把「殘影在哪間房」放進 `ChapterState`（4.19），音訊沿用 `CHASE_ACTIONS` / `manager.chase`。

> 設計註記 (2026-11-06，H1 夾層：第二章隱藏房；規格 6「H1 夾層（細化）」)：**內容**：`content/levels/ch2/H1-mezz.ts`（LevelDef id `H1`、房間 id `mezz`；門位與占位版相同；`rooms.ts` 只剩轉出）、`lvl-H1.ts`；登錄表 `LEVELS` 加 `H1`（`chapter 2`、`unlock.after ['3-1']`、新欄位 `LevelEntry.hidden: true`）、`CHAPTERS` 第二章 levels 加 `H1`、`CUBE_CHAPTERS` 第二章 `levels.H1 = 'mezz'` 與新欄位 `CubeChapter.scaleCards: true`；`CH2_ZONEH1`；`CH2_ZONE23/24/25` 加 `areas`（`ZoneArea` = `{ id; room; doors; opensWhen? }`）。**機制**：新檔 `mechanics/mezz.ts`（`bookWall`：只在實景的實體、`readText`；`innerShelf`：實體、名詞標籤 + 方槽、`readText` / `smallText` 依 `effectiveFactor`、`blockText`）；`ObjBase.blockText?: TextKey`（占住門 / 洞到達處時說的話）；`diaryStand` 加呈現欄位 `look?: 'desk'`。**章節層**（`core/chapter`）：`doorArrival(cs, door) → null | { by: ObjId }`——目標房的 probe（同 `transferObject` 的 `loadRoom`）先跑一次 `rt.mechanics.beforePhysics`（`scale` 依標籤重算尺寸），玩家在 `doorSpawn` 的盒與 3D 實體重疊 = 擋住；`transferObject` 的 probe 同樣先重算（現況沒重算，第三章沒有踩到）。app 的 `door` 事件：擋住 → 在當前房 `say(by.blockText ?? 'msg.cube.doorBlocked')`、不換房。**存檔 / 進度**：`meta/chapters.grantScaleCards(save, cc, state) → { state, granted }`（`save.abilities` 有 `scale`、`cc.scaleCards`、該章 `items` 與 `labels` 都沒有那張卡 → 補進 `items`；`granted` 非空 → 開章後 HUD 說一次 `msg.cards.scaleBack`）；`chapterStart` 的位置校正加「存檔的門 / 洞到達處此刻被占 → 從開章入口進」（純函式版本：關卡資料 + 快照 + 章節標籤，不建 World 也可，或沿用 probe）；`app` 章門通關的 `also` = `Object.keys(cc.levels)` 去掉 `levelById(id)?.hidden`；選單 `levels` 濾掉 `hidden && state === 'locked'`；房間通關 `roomCleared` 以 `cc.levels` 對回 `H1` 不變。**字卡匣**：`app/cardTrayModel.deriveCardTray(w, text, seq, tab?)` 加 `tabs: ('word' | 'part' | 'scale')[]`（持有或貼著的卡出現過的組，依此順序）與 `tab`（預設 = 標籤收的組：`noun + scale` → scale、`plate` / `strip` → part、`blank` / `dir` → word；沒有卡 → 第一個有卡的組）；`slots` = 本頁的卡（`TRAY_SLOTS = 3` 不變）；`ui/cardTray` 畫頁籤（只有一組時不畫）；`levelSession` 開匣時 `navLeft` / `navRight` 換頁（字卡匣與轉動模式互斥）。**驗證**：`devtools/validateCube` 的 `DialModel.areas`（`areaPairs(m, links, flags)`：連接表換成節點對，`dialGraph.walks` 與 ⑦ `enumerate.reach` 共用；`walks` 的快取鍵加上「已開的區」；`dialModelOf` 的 `extra` 收 `areas`、自動補區的預算 = 所在房）；`validateLevel` 認 `bookWall` / `innerShelf` 的文字 key 與 `blockText`；新增檢查（或測試）：每章每組可得的字卡 ≤ `TRAY_SLOTS`、第二章帶 `label.scale` 的物件只有 `innerShelf`。**呈現**：`render/models/mezz`（書牆：層板合併、書背 `InstancedMesh`；書櫃依有效尺寸縮放、藏寶圖剪影 = 書櫃 + 層板 + 書；小書桌 + 抽屜）；9.1 D 裝飾書（書牆頂，切回實景多一層、最多三層，`calm` 關閉）。**音訊**：無新增（`card` 事件、`USED_ON.diaryStand`、殘片紙聲沿用）。

> 實作註記 (2026-11-06，H1 夾層實作)：照上方設計註記實作。**新檔**：`content/levels/ch2/H1-mezz.ts`、`content/text/zh-Hant/lvl-H1.ts`、`mechanics/mezz.ts`（`bookWall` / `innerShelf`；`innerShelf` 的 3D 按 E 依 `effectiveFactor`）、`render/models/mezz.ts`（`bookWallModel`：木框 / 背板 / 書三個網格、`occluders`；`innerShelfModel`：木框 / 背板 / 書三個網格依有效尺寸縮放 + 標籤徽章 + 縮放角標；`deskModel`：`diaryStand` 的 `look 'desk'`，used = 抽屜拉開、殘片一角不見）、`tests/puzzle/levels/H1.test.ts`。**改動**：`core/types` `ObjBase.blockText`；`core/chapter` `probeRoom`（loadRoom 後跑一次 `beforePhysics`）、`arrivalBlocker(spec, state, opts) → ObjId | null`、`doorArrival(cs, door) → { by, blockText? } | null`、`ChapterSpec.arrival?(state)`；`transferObject` 的 probe 改用 `probeRoom` 與即時標籤；`app/chapterEvents` 的 `door` 事件先問 `doorArrival`（擋住 → `say(blockText ?? 'msg.cube.doorBlocked')`、`kind 'blocked'`）；`mechanics/index chapterSpecOf` 注入 `arrival`（`DEFAULT_MECHANICS` 建 probe）；`meta/chapters` `chapterStart` 到達處被占 → 開章入口（墨量不沿用）、`grantScaleCards`；`meta/progress` `listedInMenu`、`chapterClearAlso`（app 的選單與章門通關都用它）；`app/app` 開章時補發 → 立刻寫章節存檔 → 開場後 `say('msg.cards.scaleBack')`；`content/levels` `LevelEntry.hidden`；`content/cubes` `CubeChapter.scaleCards`、第二章 `levels.H1`；`content/cubes/ch2` `ZoneArea`、`MEZZ_BACK`、`CH2_ZONEH1`、`CH2_ZONE23/24/25.areas`；`devtools/validateCube` `DialArea`、`areaPairs`（walks / ⑦ reach / ⑩ 入口共用）、`withAreaRooms`（區的預算 = 所在房；`dialModelOf` 也補）；`devtools/validateLevel` 認 `bookWall` / `innerShelf` / `diaryStand.emptyText` 與 `blockText`；`mechanics/labels` `writableTarget`（方槽 + `noCardText`、手上沒有尺度卡 = 缺卡）、`sayMissingCard`（只算這個標籤收得下的卡）；`app/cardTrayModel` `TrayTab` / `TRAY_TABS` / `labelTab` / `shiftTab`、`deriveCardTray(w, text, seq, tab?)` 回 `tabs` / `tab` / `text.tabs`、`howto` 多一行換頁（只有一組時不說）；`ui/cardTray` 頁籤（`CardTrayHandlers.tab`）與 `.pz-tray-tab` 樣式；`app/levelSession` `trayTabSel`（開匣時重設）、`trayGoTab`、`trayTab`（自動化用）、開匣時 `navLeft` / `navRight` 換頁；`render/decor` `bookCart` / `stool` / `wallLamp`（furniture）、`wallTopBooks`（library；9.1 D，`DecorCtx.calm`，`render/scene` 傳入）；`render/decor/room` 護牆板分格合併。**沒有改**：音訊（`card` 事件、`USED_ON.diaryStand`、殘片紙聲沿用）、`roomCleared` / `nextAfterClear`（`cc.levels` 對回 `H1`、kind `room` → 回到 H1）。

## 8. 取捨與風險

| # | 取捨 / 風險 | 決定與理由 |
|---|------------|-----------|
| T1 | **不做 ECS** | 物件數百、機制 10 個、每機制只關心少數類型；現有 `ObjState` 陣列 + 掛點已足夠。ECS 會重寫全部 2.3k 行並讓 36 個測試大改，與 M0「行為不變」衝突 |
| T2 | **不做事件匯流排（訂閱式）** | 只用 `world.events` 外送匣（單向、每幀清空），服務字條卡關偵測與統計（規格 7.1、8）。機制之間用查詢函式；訂閱式匯流排會讓執行順序隱形，不利確定性 |
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
| T14 | 風險（v0.4）：控制盤讓魔方從「拉桿的 3 種排列」變成「玩家自選的數百～上萬種」，BFS 與玩家都可能迷路 | 規格 5.4.9 的鎖定 / 分區 / 預算把每章壓在 2×10⁶ 內；`validateDial` 超量即報錯；`ChapterCommand` 與第一章拉桿路徑分開，第一章行為與測試不受影響 |

---

## 9. 決策紀錄（Q1～Q5 已全部確認，2026-11-02，使用者回覆「全部照建議」；Q6～Q9 為 v0.3 新增；Q10～Q13 為 v0.4 新增）

| # | 問題 | 決定 |
|---|------|---------|
| Q1 | M0 遷移時，是否允許測試中 `w.hasKey`、`w.sealed`、`MSG_*` 匯入路徑做 7.3 的**等價機械替換**？（否則只能在 World 保留兩個相容欄位） | **允許**；替換表固定、以腳本檢查，其餘斷言一字不改（**已確認**） |
| Q2 | 規格內部矛盾（規格已改 H2，並列為規格 A2）：4-2b 說「物不在刀上，影還在」（caster 不受剖面影響），H2 說「只有剖到的花盆會投影」（caster 受剖面影響）。兩者需同一條規則 | **採 4-2b**（caster 不受剖面過濾、影子要剖到牆面帶才存在）；H2 改寫為「剖到牆面才看得到影子」的變奏。架構兩者都放得下（只差 light 的 caster 來源是否經 section 過濾）（**已確認**） |
| Q3 | 謎題 id 格式：1-2 原本的圈號編號是否統一為 `1-2a`～`1-2d`（存檔 / 統計 key 用） | **是**；顯示用編號放文字表（**已確認**） |
| Q4 | 瀏覽器主迴圈改為固定步長 1/60（與測試一致，可錄製試玩輸入回放 G1 問題），手感可能有極細微差異 | **採用**，於 S6 實作並手動確認（**已確認**） |
| Q5 | 剖面開關（C）是否只能在 3D 切換？在 2D 切換會讓腳下世界瞬間改變 | **只能在 3D**；2D 按下提示「回到實景再調剖面尺」（**已確認**；v0.3 隨 N8 退役） |
| Q6 | v0.3 章節狀態放哪一層 | `core/cube.ts` + `core/chapter.ts`（L0，純）；不新增層、矩陣不變 | **暫定，待確認**（建議） |
| Q7 | 帶參數的玩家指令（貼字卡、合成） | `ActionFrame.commands`（可錄製回放），不另開事件通道 | **暫定，待確認**（建議） |
| Q8 | 縮放如何影響碰撞 | 核心加 `size` 掛點，所有幾何經 `objBox` | **暫定，待確認**（建議） |
| Q9 | 退役機制的程式 | `pin / section / mark / light / seam` 不實作；6.1～6.4 保留作紀錄 | **暫定，待確認**（隨規格 Q-S） |
| Q10 | v0.4 轉動 / 回退指令放哪 | 另立 `ChapterCommand`（作用在 `ChapterSession`），不併入 `WorldCommand`：轉動改的是章節狀態，不是房內 `World`；同樣只送進下一個固定步、可錄製回放 | **暫定，待確認**（建議） |
| Q11 | v0.4 控制盤與第一章拉桿是否共用 `turn` | 不共用：新增 `dialTurn / undoTurn`，`turn` / `applyOp` 保持原樣（第一章已實作、測試全綠，不冒回歸風險）；兩者共用 `links` 與跨房計算 | **暫定，待確認**（建議） |
| Q12 | v0.4 SaveV3 增補欄位是否升版號 | 不升（v:3）；選填欄位 + 校正補預設（同 C8 的 `labels / moved`）；不合法只丟 `turns` | **暫定，待確認**（建議） |
| Q13 | v0.4 驗證器的回退建模 | 不展開回退邊（可達集合不變，規格 5.4.8）；卡死檢查不計回退（保守）；回退的正確性改由 D2 的「轉了再退 = 沒轉」等價測試保證 | **暫定，待確認**（建議） |
