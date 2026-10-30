# 🧊 Taskbar Liquid Lyrics (工作列液態玻璃歌詞器)

> **專為 Windows 11 設計的高幀率、全透明、音訊響應式工作列懸浮歌詞膠囊**  
> 純綠色免安裝（Portable）架構・DWM 每像素 Alpha 完美穿透・144Hz 滿幀流體彩虹波浪・GSMTC / WebNowPlaying 雙模態媒體同步・智慧多來源歌詞與時間軸滾輪即時校正

---

## 🌟 核心特色與亮點 (v1.2.0)

- **💎 真・每像素 Alpha 透明（DWM Per-Pixel Alpha）**：  
  告別色鍵（Color Keying）鋸齒紫邊與傳統 Region 硬切階梯感。透過 DWM 底層 API 延伸框架與清空色鍵，實現極致純淨的半透明磨砂毛玻璃與抗鋸齒平滑邊界；內建透明度看門狗，休眠喚醒自動復原無黑底。
- **🌊 144Hz 滿幀事件驅動波浪引擎（Canvas 2D）**：  
  前端採用純 Canvas 2D 物理流體傳播渲染，具備子步長插值（Sub-step Interpolation）與全域 TypedArray 零 GC 配置，極致流暢且幾無 CPU 負擔。
- **🎵 GSMTC ＋ WebNowPlaying 雙模態媒體監聽**：  
  同時支援 Windows 全域媒體（Spotify、KKBOX、Edge 等）與瀏覽器 WebNowPlaying 擴充套件（YouTube、YouTube Music）。具備「播放中優先覆蓋仲裁」與標題歌手智慧清洗，杜絕背景分頁搶佔與新聞台標籤干擾。
- **📜 智慧多來源歌詞庫與雙語解耦**：  
  整合 LRCLIB 與多個 LyricsPlus 鏡像，以逾時熔斷（fetchWithTimeout）與漸進式即時交付（commitCollected）技術架構，0.25 秒極速顯詞，徹底告別卡頓；支援雙語歌名智慧解耦搜尋。
- **🖱️ 穿透模式下滑鼠滾輪即時校正（Win32 RawInput）**：  
  獨創底層 RawInput 游標偵測，即使在開啟「點擊穿透（WS_EX_TRANSPARENT）」完全不擋後方視窗的狀態下，滑鼠游標停在膠囊上方滾動滾輪即可即時微調歌詞時間軸（`±0.2s`），中鍵點擊立即歸零（`0.0s`）。
- **🎯 自由拖曳定位與一鍵預設座標鎖定**：  
  未儲存座標時預設停在螢幕正中央方便調整，拖曳膠囊時控制中心即時讀取實體座標；按下「儲存預設座標」後自動啟用「鎖定防拖曳」與「點擊穿透」，且設定值永久儲存不被新版本覆蓋。
- **📦 純綠色可攜式架構（Portable）**：  
  解壓即用，免安裝、零登錄檔殘留、不佔用 AppData，隨身攜帶立即可用。

---

## 🚀 快速開始

### 啟動與使用
1. 下載最新綠色免安裝封包 `TaskbarLiquidLyrics_v1.2.0_Setup.zip`。
2. 解壓縮至任意資料夾（建議放置於固定工具目錄，如 `D:\Tools\TaskbarLiquidLyrics`）。
3. 雙擊執行 `TaskbarLiquidLyrics.exe` 或 `啟動歌詞器.bat` 即可啟動。

### 操作指南
* **定位與儲存**：
  - 首次開啟時，膠囊預設浮動於**畫面正中央**。
  - 右鍵點擊膠囊（或點擊右下角系統匣圖示）開啟「外觀控制中心」。
  - 直接用滑鼠將膠囊拖曳至你喜愛的位置（例如螢幕頂端或工作列上方），點擊控制中心內的 **「💾 儲存預設座標（鎖定並穿透）」**。
  - 膠囊將立即固定該位置，並自動開啟鎖定與點擊穿透，往後每次開機皆會記住此位置。
* **歌詞時間軸微調**：
  - 當遇到歌曲與歌詞略有時差時，直接將滑鼠移到膠囊上方，**滾動滾輪**即可即時前移或延後時間軸（每次微調 0.2 秒）。
  - 按一下**滑鼠滾輪中鍵**即可立刻恢復歸零（0.0s）。
  - 亦可在外觀控制中心點擊按鈕手動微調或手動搜尋替換候選版本。
* **系統匣控制（System Tray）**：
  - ⚙️ **開啟外觀控制中心**：調整尺寸、風格主題、波浪靈敏度、文字顏色。
  - 🎯 **解鎖並移至畫面中央**：重設預設座標，恢復拖曳調整。
  - 🖱️ **切換點擊穿透**：暫時關閉或開啟穿透。
  - 🚀 **開機自動啟動**：一鍵開啟/關閉登入 Windows 自動執行。
  - 🖥️ **建立桌面捷徑**：快速於桌面建立捷徑。
  - ❌ **結束程式**：安全釋放音訊環回線程與系統匣資源。

---

## ⚙️ 設定檔說明 (`config.json`)

程式同目錄下的 `config.json` 支援即時自訂參數：

```json
{
  "width": 640,
  "height": 44,
  "x": 620,
  "y": -5,
  "default_x": 620,
  "default_y": -5,
  "position_saved": true,
  "style": 2,
  "text_color": "white",
  "audio_gain": 2.2,
  "monitor": 0,
  "anchor": "custom",
  "topmost": true,
  "locked": true,
  "click_through": true,
  "snap": true,
  "silence_timeout_seconds": 5.0,
  "audio_active_threshold": 0.25,
  "audio_confirm_ms": 300
}
```

* `style`: 
  - `1`: **純淨超透水晶（Pure Crystal）**（88% 極致透明感）
  - `2`: **深曜靈動島（Obsidian Dynamic Island）**（曜石透黑、純白字體最清晰）
  - `3`: **極光流體霓虹（Neon Aurora Wave）**（幻彩極光波浪）
  - `4`: **冰霜雪晶霧面（Frosted Snow Ice）**（柔美水漾光感）
* `position_saved`: 是否已鎖定儲存預設座標（若為 `false`，開機自動置中以利拖曳）。
* `audio_gain`: 音訊波浪起拍敏感度（建議值 `2.2`）。
* `silence_timeout_seconds`: 暫停或靜音超過幾秒淡出進入純透明休眠，預設 `5.0`。

---

## 🏗️ 系統架構圖

```
┌────────────────────────────────────────────────────────┐
│                   Windows 11 系統層                    │
│   [WASAPI 環回採樣]           [GSMTC / WNP 雙模態媒體]  │
└──────────┬─────────────────────────────┬───────────────┘
           │ (PCM 44.1kHz 音訊區塊)      │ (曲目元數據 / 播放狀態)
           ▼                             ▼
┌────────────────────────────────────────────────────────┐
│                  Python 3.12 後端服務                  │
│  - WASAPI Worker: 2048 點 Hann 窗滑動 FFT 頻譜分析     │
│  - Media Worker: GSMTC + WebNowPlaying 播放狀態優先仲裁│
│  - DWM Manager: Win32 API 視窗樣式與 Per-pixel Alpha   │
│  - RawInput Worker: 穿透模式下之全域游標滾輪事件捕捉   │
│  - 本地 WebSocket 伺服器 (ws://127.0.0.1:8974)         │
└──────────────────────────┬─────────────────────────────┘
                           │ 毫秒級即時推播音訊與控制指令
                           ▼
┌────────────────────────────────────────────────────────┐
│             前端視窗 (WebView2 / EdgeChromium)         │
│  - app.js: 接收 WebSocket 音訊封包，三態狀態機排程 DOM │
│  - wave_engine.js: 144Hz 滿幀 Canvas 2D 物理流體波浪   │
│  - lyrics_engine.js: 多來源鏡像檢索、評分排序與時間軸  │
│  - style.css: inset box-shadow 擬態無外框純淨流體玻璃  │
└────────────────────────────────────────────────────────┘
```

---

## 🛠️ 開發與建置

### 環境需求
- Windows 10 / 11 64-bit
- Python 3.12 64-bit
- Microsoft Visual C++ 2015-2022 Redistributable (x64)

### 一鍵編譯打包（PyInstaller onedir 目錄模式）
```powershell
.\build.ps1
```

### 自動化測試
```powershell
python -m py_compile .\main.py
python .\dev_tests\test_system.py .\main.py
node .\dev_tests\test_v110_lifecycle.js
node .\dev_tests\test_v120_lyrics.js
```

---

## 📜 版本歷程

- **v1.2.0 (智慧校正與自訂座標鎖定正式版)** (2026-10-31)
  - **DWM 透明度強化**：加入 WinForms 執行緒看門狗與待機喚醒自動重套 DWM 合成，解決待機黑底問題。
  - **雙模態多音訊仲裁**：重構 GSMTC 與 WebNowPlaying 接收邏輯，以 `PLAYING` 狀態優先整包替換，過濾非歌手標籤，徹底解決多分頁搶佔衝突。
  - **多來源歌詞非同步漸進載入**：整合 LRCLIB 與多個 LyricsPlus 鏡像，導入每請求逾時熔斷（fetchWithTimeout）與雙語歌名解耦搜尋，秒級出詞不卡死。
  - **穿透模式滾輪校正**：後端 Win32 RawInput 整合，在開啟「點擊穿透」狀態下游標停在膠囊上仍可直接滾動滾輪微調時間軸（±0.2s）、中鍵歸零（0.0s）。
  - **自由拖曳與預設座標鎖定**：未存時預設居中、拖曳即時回報 X/Y 實體座標、一鍵「儲存預設座標（鎖定並穿透）」，設定值跨版本持久化保護。

- **v1.1.0 (休眠與系統音訊回退)** (2026-10-25)
  - 新增 `standby` / `playing` / `pure_audio` 三態狀態機。
  - 音訊停止達到設定超時後，文字淡出、清空歌詞／曲名／歌手，膠囊回歸真正透明。
  - 加入非 GSMTC 音訊回退：偵測到系統無中繼資料音訊時顯示通用波浪視覺。

- **v1.0.0 (官方正式版)** (2026-10-25)
  - 奠定 DWM Per-pixel Alpha 純透明穿透管線。
  - 導入本地專屬 WebSocket 音訊推播與 144Hz 滿幀 Canvas 2D 波浪引擎。
  - 支援開機自動啟動與桌面捷徑管理。
  - 推出液態磨砂玻璃獨立外觀控制中心。
