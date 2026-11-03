# 《圖紙之間》手機觸控操控設計 v0.1

> 狀態：設計草案（2026-11-02），先於開發；不改任何程式碼。對應 `game-spec-v0.2.md`（下稱「規格」）、`architecture-v0.2.md`（下稱「架構」）。
> 修訂紀錄：2026-11-03 依 story-bible v0.2 新劇情更新名詞（提示字條改稱「父親的筆記」）；操控設計不變。
> 標記：**〔碼 file:line〕** = 依據現有程式；**〔來源〕** = 參考資料有說；**〔推論〕** = 我的判斷，未經實作或來源驗證；**〔參考〕** = 讀自 GTA 主遊戲，只作設計參考，**不得 import**（架構 2.2 GTA 隔離規則）。

---

## 0. 現況（已讀程式，2026-11-02 HEAD `3e02cf4`）

| 項目 | 現況 | 出處 |
|------|------|------|
| 輸入介面 | `InputSource { poll(): InputFrame; clear(); releaseAll(); dispose() }`；`InputFrame = { moveX, moveZ, jump, pressed, anyKey }` | `src/puzzle/input/types.ts` |
| 動作 | 世界動作 `flip / reset / interact`（+ 日後 `pin / section / mark`）；外殼動作 `restart / confirm / cancel`；軸 `left / right / up / down / jump` | `input/types.ts`、`input/bindings.ts` |
| 鍵盤 | `KeyboardSource`：輸入框內按鍵不當操作；`blur` 時清空按住的鍵；`releaseAll` 清空 | `input/keyboard.ts` |
| 確認窗 | R → `RestartConfirm` 開窗（遊戲暫停）；確認鍵需開窗 300 ms 後才算；同幀取消優先；開窗與關窗都 `releaseAll` | `app/restartConfirm.ts`、`app/app.ts` `openConfirm / closeConfirm` |
| 確認窗 UI | 遮罩 + 卡片，「確認」「繼續玩」兩個 `<button>`（已可點擊） | `ui/confirm.ts` |
| HUD 說明 | `deriveHelp(bindings)` 依按鍵產生說明列（文字 key：`ui.help.*`）；互動提示 `ui.prompt` = 「[E] 動詞」 | `app/hudModel.ts`、`content/text/zh-Hant/ui.ts` |
| 主迴圈 | 固定步長 1/60、單幀上限 1/20 秒；過場鎖期間丟棄按鍵 | `app/loop.ts` |
| 相機 | 3D 固定偏移 `(0, 5.4, 8.2)`、**沒有偏航（yaw）**，看向 -z；直屏（aspect < 1）時 FOV 46 → 62、2D 可視高度 ×1.3 | `render/cameras.ts` |
| 版面 | `puzzle.html` viewport 為 `width=device-width, initial-scale=1.0`（**沒有** `viewport-fit=cover`）；`#pz-root { position: fixed; inset: 0; user-select: none }`；`html, body { overflow: hidden }`；HUD 文字固定 px | `puzzle.html`、`ui/puzzle.css` |
| 渲染 | 像素比上限 2；PCF 軟陰影、太陽陰影貼圖 2048² | `app/app.ts:56`、`render/scene.ts:51` |
| 觸控 | **完全沒有**觸控程式 | `grep touch / pointer` 無結果 |
| 暫停選單、H 重看字條 | 規格已定，**尚未實作**（`ShellAction` 目前只有 `restart / confirm / cancel`） | `input/types.ts` 註解 |

**GTA 主遊戲參考〔參考〕**（`src/input/MobileControls.ts`、`src/style.css`、`src/core/dynamicResolution.ts`）：搖桿以區域寬度 × 比例決定最大半徑、按下時重新量測區域（翻轉後版面會變）；`orientationchange` 與 `releaseAll` 時放開搖桿；按鈕 `touchstart` 時 `preventDefault + stopPropagation`；CSS 對畫布、HUD、搖桿區、按鈕一律 `touch-action: none`、`overscroll-behavior: none`、`-webkit-touch-callout: none`、`user-select: none`；容器以 `max(16px, env(safe-area-inset-*))` 留安全區；動態解析度以平均 FPS 遲滯升降像素比（< 55 持續 2 秒降 0.1、> 58 持續 5 秒升 0.1、下限 1.0）。本作改用 Pointer Events（主遊戲用 Touch Events），其餘做法可沿用思路。

---

## 1. 目標與範圍

| 項目 | 建議 | 理由 |
|------|------|------|
| 瀏覽器 | **iOS Safari 16.4+、Android Chrome 111+**（含以 WebKit / Blink 為核心的 App 內瀏覽器，盡力支援） | `dvh` 單位 iOS 15.4 起支援、`overscroll-behavior` iOS 16 起支援〔來源：OpenReplay mobile papercuts〕；取 16.4 作為兩者都有的穩定線〔推論〕；Chrome 111 約為兩年內版本〔推論〕 |
| 方向 | **橫屏優先；直屏可玩但不最佳** | 2D 是側視、橫向延伸的關卡（玄關寬 40 單位），橫屏看得更遠；雙拇指操作在橫屏最自然〔推論〕。現有相機已處理直屏（FOV 62、2D 視高 ×1.3）〔碼 `render/cameras.ts`〕，所以直屏不需鎖定，只在關卡中顯示一次「橫放手機體驗更好」的提示（可關） |
| 選單 / 暱稱 / 通關畫面 | 直橫皆支援 | 都是置中卡片，已可捲動〔碼 `.pz-screen { overflow: auto }`〕 |
| 平板 | 同手機版面；按鈕以**實體尺寸**計算（見 2.4），平板上不會變得巨大 | — |
| 桌機觸控螢幕 | 觸控與鍵盤並存；最後一次輸入是觸控時顯示觸控疊層，鍵盤輸入 5 秒後自動淡出疊層〔推論〕 | — |
| 手把 | **日後擴充**：另一個 `InputSource`（Gamepad API），本版不做 | 架構 4.6 已預留 `mergeSources` |

---

## 2. 控制映射

### 2.1 映射表

| 動作（鍵盤） | 觸控元件 | 常駐 / 情境式 | 規則 |
|-------------|---------|--------------|------|
| 移動（WASD / 方向鍵） | 左下**浮動搖桿** | 常駐（未觸碰時只顯示淡淡的底座位置） | 3D：x → `moveX`、y → `moveZ`（畫面向上 = 往房間深處 -z，與 W 相同）；2D：**只取水平軸**，垂直分量丟棄（不會變成跳） |
| 跳（Space，按住） | 右下**跳躍鍵**（最大顆） | 常駐 | 按住 = `jump` 為真（與鍵盤按住語意相同） |
| 切換視角（F / Q） | **切換鍵**（跳躍鍵左上） | 常駐 | 按下送一次 `flip`；過場鎖期間按了會被丟棄（沿用迴圈語意） |
| 互動（E） | **互動鍵**（跳躍鍵上方）＋ HUD 互動提示本身可點 | **情境式**：只在 `findTarget` 有目標時出現（`deriveHud` 的 `prompt` 非空） | 提示文字改為觸控版（「點一下 動詞」，新 key `ui.prompt.touch`） |
| 木箱歸位（T） | 頂列小按鈕，**按住 0.5 秒**才觸發（顯示圓環進度） | 常駐（只在本關有可推物時） | 防誤觸；鍵盤 T 行為不變 |
| 重新進房（R，需確認） | 暫停選單內的「重新進房」 | 不在遊戲畫面上 | 開啟既有 `RestartConfirm`；確認窗按鈕沿用 300 ms 保護（觸控點擊也要過 300 ms 才算，避免連點穿透） |
| 確認窗的確認 / 取消（Enter / Esc） | 確認窗內兩顆按鈕（已存在）；點遮罩空白處 = 取消 | 情境式 | 取消鍵放在拇指較近的右下〔推論〕 |
| 重看字條（H，規格 7.1） | 頂列「字條」圖示 | 情境式：本關有已出現的字條後才出現 | 打開唯讀清單 |
| 暫停 / 選單 | 頂列左上「⏸」 | 常駐 | 打開暫停選單（重新進房、解答手稿、設定、回選單） |
| 火漆印章（G，N5）、圖釘（V，N16） | 右側動作弧上的能力鍵 | 情境式：本關 `abilities` 有該能力才出現 | 與鍵盤同一個動作 id |
| 剖面尺（C，N8） | 右側動作弧上的能力鍵 | 情境式：有能力且**目前在實景（3D）**才出現（規格：剖面只能在 3D 切換） | 2D 時隱藏，避免誤以為能按 |
| 跳過旁白 | 點畫面任何處 | — | 沿用 `anyKey` |

### 2.2 搖桿參數

| 參數 | 值 | 依據 |
|------|----|------|
| 型式 | **浮動**：在左側移動區第一次按下的位置生成底座；放開後回到預設位置淡顯 | 浮動搖桿不用記位置、未觸碰時不擋畫面；要限制生成區域以免和按鈕衝突〔來源：Unity 討論串、bugnet 文章〕 |
| 移動區 | 畫面左側 45% 寬、頂列以下；扣除安全區 | 〔推論〕 |
| 底座半徑 | 56 CSS px（直徑 112）；拇指點 44 px | 〔推論，需試玩〕 |
| 死區 | 半徑的 15%，超出後**重映射**到 0～1（不從 0.15 直接跳） | 死區防拇指放著就漂移；重映射避免數值突跳〔來源：bugnet〕 |
| 輸出曲線 | 3D：線性；**2D 水平**：`|x| ≥ 0.6` 視為全速 | 2D 的跳躍距離取決於水平速度，接近全速更好預測〔推論〕 |
| 8 方向吸附 | **不做**（3D 用類比） | 現有物理接受類比值（`step` 會正規化長度 > 1 的向量）〔碼 `core/step.ts`〕 |
| 超出底座 | 夾在半徑內；**不拖動底座跟著走**（避免越拖越遠） | 〔推論〕 |
| 2D 與 3D 切換時 | 搖桿狀態保留（手指沒放開就繼續有效） | 切換後手感連續 |

### 2.3 按鈕尺寸與間距

| 元件 | 預設尺寸（CSS px，`buttonScale = 1`） | 最小（縮放後下限） |
|------|-------------------------------------|------------------|
| 跳躍 | 76 | 56 |
| 切換 | 64 | 48 |
| 互動 / 能力鍵 | 56 | 48 |
| 頂列（暫停、字條、歸位） | 48 | 44 |
| 按鈕間距 | ≥ 12 | ≥ 8 |

- 最小觸控目標：Apple HIG 44×44 pt、Material 48×48 dp〔來源：二手整理，見參考資料〕；WCAG 2.2 SC 2.5.8（AA）24×24 CSS px，SC 2.5.5（AAA）44×44〔來源：W3C〕。本作所有可點元件 ≥ 44 CSS px（手機上 CSS px 約等於 pt），主要動作 ≥ 56〔推論〕。
- `buttonScale` 0.8～1.5；縮放後低於上表下限時以下限為準。平板（短邊 ≥ 600 CSS px）預設 0.9〔推論〕。
- `buttonOpacity` 0.35～1，預設 0.7；按下時一律 1.0。

### 2.4 拇指可達區與左手模式
- 右手模式（預設）：左拇指 = 搖桿；右拇指 = 跳躍 / 切換 / 互動 / 能力鍵，排成以跳躍鍵為中心的弧形（離右下角 24～160 px）。
- 頂列放**不常用、會打斷**的動作（暫停、字條、歸位），遠離拇指，降低誤觸〔推論〕。
- 左手模式（`handedness: 'left'`）：整組左右鏡像；HUD 狀態列與互動提示位置不變。

---

## 3. 版面圖

### 3.1 橫屏（主要）
```
┌──────────────────────────────────────────────────────────────────────┐
│░ safe-area-inset-top ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│ [⏸]  [實景｜持有物：鋼筆筆尖]                         [字條] [歸位◔] │ ← 頂列 48px
│░                                                                    ░│
│░                     （遊戲畫面 / 父親的筆記閱讀區：                   ░│
│░                       toast 置中偏下，不被按鈕遮住）                  ░│
│░                                                                    ░│
│░                     ╭──────────────╮                                ░│
│░                     │ 點一下 閱讀 字條 │ ← 互動提示（可點）              ░│
│░                     ╰──────────────╯              [印] [釘] [剖]     ░│ ← 能力鍵（情境式）
│░    ·  ·  ·  ·                                         [互動]        ░│
│░   ·   ( ◯ )  ·    ← 浮動搖桿                    [切換]               ░│
│░    ·  ·  ·  ·       （左 45% 移動區）                  ( 跳 )        ░│
│░░ safe-area-inset-left ░░░ home indicator / safe-area-inset-bottom ░░░│
└──────────────────────────────────────────────────────────────────────┘
確認窗：置中卡片覆蓋整個畫面（遮罩擋住所有觸控），按鈕 [確認] [繼續玩]，「繼續玩」在右側。
```

### 3.2 直屏（可玩，非最佳）
```
┌──────────────────────────┐
│░ safe-area-inset-top ░░░░│
│[⏸] [藏寶圖｜持有物]  [字條]│ ← 頂列
│                          │
│    （遊戲畫面：相機自動拉遠 │
│      FOV 62、2D 視高 ×1.3）│
│                          │
│  ┌ 橫放手機體驗更好 [×] ┐ │ ← 只在關卡第一次進入時顯示
│                          │
│   點一下 轉動 墨水閥       │ ← 互動提示
│ ───────────────────────  │
│                 [印][釘]  │
│   ( ◯ )        [互動]     │ ← 控制區：畫面下 38%
│  浮動搖桿    [切換] (跳)  │
│░ home indicator ░░░░░░░░░│
└──────────────────────────┘
```

---

## 4. 觸控技術規格

| 主題 | 規格 |
|------|------|
| 事件 | 一律用 **Pointer Events**（`pointerdown / move / up / cancel`），只處理 `pointerType === 'touch'` 或 `'pen'`；滑鼠走鍵盤以外的 UI 點擊即可 |
| 多點觸控 | 每個 `pointerId` 在 `pointerdown` 時分配給一個控制元件（搖桿或某顆按鈕），並 `setPointerCapture`，之後該手指移出元件也持續屬於它〔來源：MDN setPointerCapture〕；同一元件同時只接受一根手指 |
| 取消 | `pointercancel`（瀏覽器接手手勢時會發）〔來源：W3C Pointer Events 討論〕、`lostpointercapture` → 該手指的元件放開 |
| 阻止瀏覽器手勢 | 觸控疊層與畫布 `touch-action: none`（擋捲動、雙擊縮放、雙指縮放）；`html, body` `overscroll-behavior: none`（擋橡皮筋）；`-webkit-touch-callout: none`、`user-select: none`（擋長按選單與選字）；疊層 `contextmenu` 事件 `preventDefault`；iOS `gesturestart` `preventDefault`〔參考 GTA style.css；推論 iOS gesture 事件〕 |
| 可捲動畫面 | 選單、章節列表保留 `touch-action: pan-y`，否則清單捲不動 |
| 視窗高度 | `#pz-root` 已是 `position: fixed; inset: 0`，不依賴 `100vh`；疊層定位以 `dvh` 為主、`vh` 為後備〔來源：OpenReplay〕 |
| 安全區 | `puzzle.html` viewport 加 `viewport-fit=cover`（**需改程式**）；疊層內距 `max(12px, env(safe-area-inset-*))`〔來源：OpenReplay；參考 GTA〕 |
| 螢幕鍵盤 / 暱稱輸入 | 暱稱畫面時**隱藏觸控疊層**；不因螢幕鍵盤造成的 `visualViewport` 縮小而重設渲染器尺寸（只在 `window` resize 且非輸入中時重設）〔推論：本次搜尋查不到可信來源〕；輸入框字級維持 ≥ 16px，避免 iOS 自動放大〔來源：OpenReplay；碼 `.pz-input` 為 18px〕 |
| 翻轉 / 尺寸改變 | `resize` 與 `orientationchange` 時：放開所有手指、重新量測版面（參考 GTA 做法）；直屏提示依新方向更新 |
| 背景 / 失焦 | `visibilitychange`（hidden）、`pagehide`、`blur` → 所有來源 `releaseAll`；關卡中自動開暫停選單〔推論〕 |
| 觸覺回饋 | `navigator.vibrate(10)` 用於跳躍、切換、確認；**預設關**（`haptics: false`），只在支援的瀏覽器（Android Chrome）顯示此設定；iOS Safari 不支援〔推論：常見情況，本次未查到官方來源〕 |
| 長按歸位 | 按住 0.5 秒觸發；期間手指移出按鈕或 `pointercancel` 即取消 |

---

## 5. 架構掛點

| 檔案 | 層 | 職責 | DOM |
|------|----|------|-----|
| `input/touch.ts` | input | `TouchSource implements InputSource`：接收正規化的指標事件（`down / move / up / cancel(id, x, y, tMs)`），算搖桿向量、死區與重映射、2D 只取水平、按鈕狀態機（按下、放開、長按）、輸出 `InputFrame` | **不碰**（純邏輯，可在 Node 測） |
| `input/touchLayout.ts` | input | 純函式：`layoutTouch(viewport, safeArea, settings) → 各元件矩形`（含左手鏡像、`buttonScale` 下限）；`visibleButtons(ctx) → 按鈕 id[]`（ctx = 目前模式、`prompt` 是否非空、本關能力、是否有已出現字條、是否有可推物、目前畫面） | 不碰 |
| `input/merge.ts` | input | `mergeSources(sources)`：`moveX / moveZ` 取絕對值較大者、`jump` OR、`pressed` 依 `INPUT_ACTIONS` 順序取聯集去重、`anyKey` OR；`clear / releaseAll / dispose` 轉發給全部 | 不碰 |
| `ui/touchOverlay.ts` | ui | 建立疊層 DOM（搖桿、按鈕、文字 key 的 `aria-label`）、Pointer Events、`setPointerCapture`、阻止手勢；把正規化事件轉給 `TouchSink`（app 注入）；依 app 給的「可見按鈕 id」與矩形顯示 | 是 |
| `app/app.ts` | app | 偵測與切換：`matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window` 且 `settings.touchLayout !== 'off'`（`'on'` 強制開）；`new TouchSource` + `KeyboardSource` → `mergeSources`；每幀把 `deriveHud` 結果與關卡資訊交給 `visibleButtons`，再交給疊層；暱稱 / 確認窗 / 通關畫面時隱藏疊層並 `releaseAll` | 是 |

- **依賴矩陣不變**：`ui` 不能 import `input`（架構 2.2 ui 列 input 為 ✗），所以 `ui/touchOverlay.ts` 自己宣告 `TouchSink` 介面，`TouchSource` 以結構型別符合它，由 `app` 接線；`input/touch.ts`、`touchLayout.ts`、`merge.ts` 加入架構 2.3 的「純檔案不得出現 `document.` / `window.`」字串規則（`input/keyboard.ts` 仍可用 DOM）。
- **操作說明**：`deriveHelp` 增加觸控版 `deriveTouchHelp(layout)`，說明列改為按鈕圖示 + 文字（新 key `ui.help.touch.*`）；HUD 說明面板在觸控模式預設收起，點「?」展開〔推論：橫屏小螢幕空間有限〕。
- **新增文字 key**（不得寫死）：`ui.prompt.touch`（「點一下 {verb}」/「點一下 {verb}　{label}」）、`ui.touch.btn.<jump|flip|interact|reset|pause|notes|pin|section|mark>`（aria-label）、`ui.touch.hold`（「按住」）、`ui.touch.rotate`（橫放提示）、`ui.help.touch.<move|jump|flip|interact|reset>`、`ui.settings.touch.*`（設定頁標籤）。
- **確認窗 / 暱稱 / 選單 / 通關**：都是 DOM 按鈕，觸控可直接點；確認窗開啟時遮罩攔截所有觸控，疊層的手指全部放開（沿用 `openConfirm` 的 `releaseAll`）。

---

## 6. 效能與畫面

| 項目 | 手機策略 |
|------|---------|
| 像素比 | 觸控裝置上限 **1.5**（桌機維持 2）〔推論〕 |
| 陰影 | 太陽陰影貼圖 2048² → **1024²**；軟陰影改一般 PCF〔推論〕。**N6 實影是推導出的物件，不靠陰影貼圖**（架構 6.1），降階不影響解謎 |
| 動態解析度 | 需要，作為中低階手機的備援：參考 GTA `dynamicResolution.ts` 的遲滯升降法（純邏輯、可單元測試），在 `render/dynamicResolution.ts` **另寫一份**（不得 import 主遊戲）；下限 1.0 |
| 氛圍效果（規格 9.1） | 霧、暈影、色溫都是便宜的效果，手機保留；若 FPS 仍不足，降階順序：陰影 → 像素比 → 霧距縮短（仍守 near ≥ 12）。**效能降階與「減弱緊張效果」是兩件事**：前者自動、只為效能、不改驚嚇 / 追逐；後者是玩家設定（規格 7.2） |
| 不可降階 | P4 形狀符號、字條、互動提示、N6 實影、危險區虛線邊框——與解謎可讀性有關，永遠保留 |
| 設定 | `quality: 'auto' | 'high' | 'low'`（預設 auto，依 `pointer: coarse` 與動態解析度決定） |

---

## 7. 無障礙

- **不使用滑動手勢**：所有動作都是「點」或「按住」；沒有「上滑跳」「雙指切換」等難以操作或易誤觸的手勢。
- 按鈕可縮放（`buttonScale`）、可調透明度、可左手鏡像。
- **單手遊玩**：本作需要「移動 + 跳」同時進行，完全單手做不到；提供輔助 `jumpCarry`（預設關）：在移動中按跳時，跳躍期間**保持起跳時的水平方向**，讓同一隻拇指能從搖桿移到跳躍鍵〔推論〕。這只是輸入層的輔助，不改物理、不改可跳高度，所以不影響任何解法與捷徑掃描。
- 與其他設定：P4 形狀符號與色盲調色盤（規格 7.2）同樣套用在觸控按鈕的圖示上（圖示以形狀區分，不只靠顏色）；`reduceMotion` 時按鈕按下不做縮放動畫；「減弱緊張效果」同樣作用於手機。
- 字級：疊層與提示文字隨 `noteScale` 一起放大。

---

## 8. 測試策略

**純邏輯單元測試（Node，vitest）**
| 對象 | 案例 |
|------|------|
| `TouchSource` 搖桿 | 中心 → 0；死區內 → 0；剛出死區 → 接近 0（重映射無突跳）；邊緣與超出 → 長度 1；3D 斜向 → x、z 皆有值；**2D 只輸出 moveX、moveZ = 0**；2D 水平 ≥ 0.6 → 全速 |
| 多點觸控 | 搖桿手指 + 跳躍手指同時：`moveX ≠ 0` 且 `jump = true`；放開跳躍不影響搖桿；同一按鈕第二根手指被忽略 |
| 按鈕狀態機 | 按下送一次 `flip`（`poll` 取走即清空）；長按歸位 < 0.5 秒放開不觸發、≥ 0.5 秒觸發一次；`cancel` 中途取消 |
| `releaseAll` | 所有手指視為放開、搖桿歸零、未取走的動作丟棄 |
| `touchLayout` | 左手鏡像後矩形互換；`buttonScale` 0.8 時仍 ≥ 下限；安全區內距生效；直屏 / 橫屏矩形不重疊 |
| `visibleButtons` | 無目標 → 無互動鍵；有能力才有能力鍵；剖面鍵只在 3D；確認窗 / 暱稱畫面 → 全部隱藏 |
| `mergeSources` | 鍵盤 + 觸控同時：軸取較大者、動作聯集且順序固定 |

**Playwright 手機模擬**（device emulation，`hasTouch`、橫屏 viewport；多點觸控用 CDP `Input.dispatchTouchEvent` 傳多個 touchPoints〔推論：Playwright 內建 `touchscreen.tap` 只支援單點〕）
- 同時按住搖桿與跳躍：玩家位移且離地。
- 阻止手勢：在畫布上雙擊與拖曳後 `visualViewport.scale === 1`、`window.scrollY === 0`。
- 橫直屏切換：翻轉後按鈕矩形在視窗內、手指放開、遊戲不卡鍵。
- 確認窗：開窗 300 ms 內點「確認」無效、之後有效；點遮罩 = 取消；開窗時疊層無反應。
- 暱稱畫面：疊層隱藏、輸入框可輸入。
- 現有的鍵盤通關腳本在觸控疊層存在時仍通過（並存不互相干擾）。

**真機驗證清單**
| iOS Safari（16.4+，含有瀏海與動態島機型） | Android Chrome（111+，含手勢導覽列機型） |
|----------------------------------------|----------------------------------------|
| 雙擊 / 雙指不會縮放；長按不跳出選單或放大鏡 | 下拉不觸發重新整理；返回手勢不誤觸搖桿 |
| 瀏海與 home indicator 不擋按鈕（`viewport-fit=cover`） | 導覽列與摺疊 / 打孔螢幕不擋按鈕 |
| 網址列收合 / 展開時版面不跳動 | 分割畫面、橫直屏切換正常 |
| 切到背景再回來沒有卡鍵、遊戲暫停 | 同左 |
| 暱稱輸入時鍵盤不推亂版面、不自動放大 | 同左；觸覺回饋開關有效 |
| 低電量模式下 FPS 與動態解析度降階合理 | 中低階機 FPS ≥ 30〔推論目標〕 |

---

## 9. 風險與取捨

| # | 風險 | 取捨 |
|---|------|------|
| 1 | **精準跳躍在觸控上較難**：1-2b 等題要在箱頂起跳上高台（2D 跳高 1.6 對高台 2.5，餘裕 0.2） | 規格 D10 已要求高度餘裕 ≥ 0.15、水平餘裕 ≥ 0.3；2D 水平 ≥ 0.6 視為全速讓起跳距離可預測；`jumpCarry` 輔助；G1 試玩必須包含手機玩家 |
| 2 | **2D 跳得比 3D 高**：觸控玩家看不到「按鍵差異」，只感覺同一顆鍵跳高不同 | 這是設計（父親的筆記：「紙上的人比較輕？」）；切換鍵按下時給一次輕觸覺 / 音效，強化「換了世界」的感覺 |
| 3 | **拇指負擔**：左拇指移動、右拇指同時要跳與切換 | 跳與切換相鄰（一指可滑過）；切換是單次觸發不用按住；追逐（N19）只需在 3D / 2D 間切換、不要求邊跳邊切；「減弱緊張效果」讓追逐自動通過 |
| 4 | **誤觸**：歸位、重新進房會讓進度回到原樣 | 歸位改為按住 0.5 秒；重新進房只在暫停選單內並沿用確認窗與 300 ms 保護；頂列遠離拇指 |
| 5 | 按鈕遮住畫面（特別是直屏） | 情境式按鈕、可調透明度；直屏只建議不強制；字條閱讀區（toast）位置避開按鈕區 |
| 6 | iOS / Android 手勢與視窗怪癖（橡皮筋、網址列、螢幕鍵盤） | 以 `touch-action`、`overscroll-behavior`、`viewport-fit=cover`、不依賴 `100vh` 為基本盤；真機清單逐項驗證；查不到可信來源的部分（`visualViewport` 行為、iOS 震動）標為推論，以真機結果為準 |
| 7 | 手機效能拖慢判定 | 迴圈是固定步長 1/60、單幀上限 1/20 秒〔碼 `app/loop.ts`〕，FPS 低只會變慢、不會改變判定；動態解析度保 FPS |

---

## 10. 開放決策（建議預設，暫定，待確認）

| # | 問題 | 建議預設 |
|---|------|---------|
| T1 | 支援範圍：iOS Safari 16.4+、Android Chrome 111+？ | **是** |
| T2 | 方向：橫屏優先、直屏可玩但顯示一次「橫放更好」提示，不鎖定 | **是** |
| T3 | 歸位（T）在觸控上改為「按住 0.5 秒」 | **是**（鍵盤不變） |
| T4 | 搖桿：浮動式、死區 15%、2D 水平 ≥ 0.6 全速 | **是**，G1 試玩後調整 |
| T5 | 觸控排在哪個里程碑：在 M1 垂直切片之後、G1 試玩之前（M1T，工作量 M） | **是**，讓 G1 同時驗證手機手感 |

---

## 11. 參考資料

| 主題 | 來源 | 用於 | 狀態 |
|------|------|------|------|
| WCAG 2.2 SC 2.5.8 目標尺寸 24×24（AA）；2.5.5 為 44×44（AAA） | https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html ；https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22 ；https://kb.daisy.org/publishing/docs/wcag/target-size-minimum.html | 2.3 | ✅（搜尋摘要） |
| Apple 44×44 pt、Material 48×48 dp | https://testparty.ai/blog/wcag-target-size-guide ；https://github.com/w3c/wcag/issues/1831 ；https://dequeuniversity.com/rules/attest-ios/1.0/touch-target-size | 2.3 | ⚠️ 二手整理；未取得 Apple / Google 官方頁原文 |
| 浮動搖桿、死區與重映射 | https://bugnet.io/blog/how-to-fix-mobile-virtual-joystick-feeling-bad ；https://discussions.unity.com/t/opinions-wanted-why-are-joystick-controls-so-terrible-on-mobile/640042 | 2.2 | ✅（實務文章，非官方） |
| dvh（iOS 15.4+）、safe-area、`viewport-fit=cover`、iOS 輸入框 < 16px 自動放大、`overscroll-behavior`（iOS 16+） | https://blog.openreplay.com/5-mobile-web-papercuts-fixes/ | 1、4 | ✅（搜尋摘要） |
| `setPointerCapture` | https://docs.w3cub.com/dom/element/setpointercapture | 4 | ✅（MDN 鏡像） |
| 瀏覽器接手手勢時發 `pointercancel` | https://lists.w3.org/Archives/Public/public-pointer-events/2013JanMar/0021.html ；https://docs.w3cub.com/dom/element/pointercancel_event | 4 | ✅ |
| `visualViewport` 與螢幕鍵盤行為、iOS Safari 不支援 `navigator.vibrate`、Playwright 多點觸控 | — | 4、8 | ⚠️ 本次搜尋查不到可信來源，標為推論 |
| GTA 主遊戲手機實作 | `src/input/MobileControls.ts`、`src/style.css`、`src/core/dynamicResolution.ts` | 0、4、6 | 〔參考〕只讀不 import |
