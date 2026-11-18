# 🧊 Taskbar Liquid Lyrics (工作列液態玻璃歌詞器)

> **專為 Windows 11 設計的高幀率、全透明、音訊響應式工作列懸浮歌詞膠囊 (`v1.0.0`)**  
> 純綠色免安裝（Portable）架構・DWM 每像素 Alpha 完美去背・144Hz 滿幀流體彩虹波浪・GSMTC / WebNowPlaying 雙模態媒體同步・智慧多來源歌詞與穿透滾輪微調

[📜 更新紀錄 (CHANGELOG.md)](CHANGELOG.md) ｜ [📄 授權條款 (MIT License)](LICENSE)

---

## 🌟 核心特色與亮點 (`v1.0.0`)

- **💎 真・每像素 Alpha 透明去背（DWM Per-Pixel Alpha）**：  
  告別傳統色鍵（Color Keying）鋸齒紫邊與 Region 硬切階梯感。透過 DWM 底層 API 延伸框架與清空色鍵，實現極致純淨的半透明磨砂玻璃與抗鋸齒平滑邊界；內建 WinForms UI 執行緒透明度守護與休眠喚醒自動復原，長時間運行不黑底。
- **🌊 144Hz 滿幀事件驅動波浪引擎（Canvas 2D）**：  
  採用純單層物理流體傳播與孤立重低音衝擊波，搭配子步長插值（Sub-step Interpolation）與全域 TypedArray 零 GC 配置，低音擊打同時保留清晰的中高音旋律起伏；待機休眠時自動停止渲染與 `requestAnimationFrame`，零背景算力消耗。
- **🎵 GSMTC ＋ WebNowPlaying 雙模態媒體監聽**：  
  同時支援 Windows 全域媒體（Spotify、KKBOX、Apple Music、Edge、Chrome 等）與瀏覽器 WebNowPlaying 擴充套件（YouTube、YouTube Music）。強制以目前播放中（`PLAYING`）的工作階段為最高優先權，並智慧清洗官方頻道非歌手標籤與多分頁搶佔衝突。
- **📜 智慧多來源歌詞庫與臺灣正體轉換**：  
  整合 **LRCLIB**、**5 個 LyricsPlus 鏡像** 與 **Better Lyrics TTML**，採每請求獨立逾時熔斷（`fetchWithTimeout`）與漸進式即時交付（`commitCollected`），搭配雙語歌名括號解耦、韓文原文防禦評分、OpenCC 零延遲簡轉臺灣正體中文，以及具 LRU 容量保護的本機快取。
- **🖱️ 穿透模式下原生滾輪即時微調（Win32 RawInput）**：  
  透過輕量級背景 Win32 `RawInput` 訊息接收器，即使在開啟「點擊穿透（`WS_EX_TRANSPARENT`）」完全不阻擋後方工作列與瀏覽器分頁的情況下，將滑鼠游標停在膠囊上方滾動滾輪即可即時微調歌詞時間軸（`±0.2s`），中鍵點擊立即歸零（`0.0s`）。
- **🎯 多螢幕自由拖曳與一鍵儲存預設位置**：  
  首次啟動時不鎖定、不穿透，自動居中顯示於螢幕正中央；可依個人單／多螢幕桌面環境自由拖曳至理想位置並即時同步實體座標，再按下「儲存預設座標」即自動鎖定並開啟點擊穿透（個人 `config.json` 僅保存於執行檔本機目錄）。
- **📦 純綠色可攜式架構（Portable）**：  
  解壓即用、免安裝、不污染系統目錄；支援使用者層級（HKCU）開機自動啟動與一鍵維護桌面捷徑，無需系統管理員權限。

---

## 📂 專案模組結構

| 路徑 | 角色 | 說明 |
| :--- | :--- | :--- |
| [`main.py`](main.py) | 核心宿主服務 | WASAPI 2048 點 Hann FFT、WinRT GSMTC 監聽、DWM 每像素透明合成、Win32 RawInput 滾輪偵測、本機 WebSocket 中樞與系統匣管理 |
| [`ui/index.html`](ui/index.html) | 膠囊視窗進入點 | 工作列懸浮液態玻璃膠囊版面配置 |
| [`ui/css/style.css`](ui/css/style.css) | 光學透明樣式表 | 4 種液態玻璃主題（純淨水晶 / 深曜靈動島 / 極光霓虹 / 冰霜霧面）與純內陰影零外擴去背規則 |
| [`ui/js/wave_engine.js`](ui/js/wave_engine.js) | 144Hz 波浪引擎 | 單層孤立重低音衝擊波、旋律基線融合與 30Hz 閒置節流 / 純淨休眠 |
| [`ui/js/lyrics_engine.js`](ui/js/lyrics_engine.js) | 多來源歌詞引擎 | LRCLIB / LyricsPlus / Better Lyrics TTML 解析、智慧評分、簡轉臺灣正體中文與 LRU 快取 |
| [`ui/js/app.js`](ui/js/app.js) | 前端主控與狀態機 | `standby` / `pure_audio` / `playing` 三態狀態機、雙模態曲目同步與跑馬燈控制 |
| [`ui/settings.html`](ui/settings.html) | 外觀控制中心 | 獨立 560×820 液態玻璃控制視窗（外觀風格、寬度靈敏度、座標定位與歌詞手動校正） |
| [`config.example.json`](config.example.json) | 預設設定範本 | 不含個人螢幕座標之中性預設範本（首次執行會於本機自動產生專屬 `config.json`） |
| [`build.ps1`](build.ps1) / [`verify_build.ps1`](verify_build.ps1) | 建置與驗收腳本 | PyInstaller `onedir` 打包、純淨 Portable ZIP 封裝與啟動日誌自動化檢驗 |
| [`dev_tests/`](dev_tests/) | 自動化測試套件 | 後端啟動／系統登錄檔 Mock 測試、生命週期與歌詞引擎單元測試、FFT / 波浪模擬測試 |

---

## 🚀 快速開始（Portable 免安裝版）

### 下載與啟動
1. 前往 [**GitHub Releases**](https://github.com/bryanhuang0511/Taskbar-Liquid-Lyrics/releases/tag/v1.0.0) 下載最新版綠色免安裝封包 **`TaskbarLiquidLyrics_v1.0.0_Portable.zip`**。
2. 解壓縮至任意固定目錄（例如 `D:\Tools\TaskbarLiquidLyrics`）。
3. 雙擊執行 **`TaskbarLiquidLyrics.exe`**（或 **`Launch_TaskbarLiquidLyrics.bat`**）即可啟動。

### 首次使用與定位方式
* **自由調整位置**：首次開啟無個人設定檔時，膠囊會預設浮動於**主螢幕正中央**（未鎖定、未穿透），方便在不同解析度或多螢幕環境下手動調整。
* **儲存固定位置**：在膠囊上按右鍵（或點擊右下角系統匣圖示）開啟「外觀控制中心」，直接將膠囊拖曳至工作列上方或任何喜歡的位置，接著點擊 **「💾 儲存預設座標（鎖定並穿透）」** 即可固定位置並開啟點擊穿透。
* **歌詞時間軸微調**：若歌詞與歌聲有微小時差，將滑鼠游標移至膠囊上方**滾動滾輪**即可即時提前／延後 `±0.2s`（按一下**滑鼠中鍵**立即歸零 `0.0s`），或至控制中心點擊微調按鈕與切換候選版本。
* **系統匣選單**：右鍵點擊右下角通知區域小圖示，可隨時開啟控制中心、解鎖並移回畫面中央、切換點擊穿透、管理開機自動啟動與桌面捷徑，或安全結束程式。

---

## ⚙️ 設定檔說明 (`config.example.json`)

程式會在執行檔同目錄下讀寫專屬 `config.json`（首次啟動依內建中性預設建立，不會覆寫其他使用者環境）：

```json
{
  "width": 640,
  "height": 44,
  "x": null,
  "y": null,
  "default_x": null,
  "default_y": null,
  "position_saved": false,
  "style": 2,
  "text_color": "white",
  "audio_gain": 2.2,
  "silence_timeout_seconds": 5.0,
  "audio_active_threshold": 0.25,
  "audio_confirm_ms": 300,
  "monitor": 0,
  "anchor": "center",
  "topmost": true,
  "locked": false,
  "click_through": false,
  "snap": true,
  "edge_test": false,
  "extend_frame": true,
  "shortcut_auto_done": false
}
```

* `style`：膠囊風格 — `1` 純淨超透水晶、`2` 深曜靈動島（預設）、`3` 極光流體霓虹、`4` 冰霜雪晶霧面。
* `position_saved`：為 `false` 時啟動自動置中並保持可拖曳；儲存後固定依 `default_x` / `default_y` 定位。
* `audio_gain`：波浪律動靈敏度（範圍 `1.0 ~ 4.0`，建議 `2.2`）。
* `silence_timeout_seconds`：靜音或無媒體播放超過設定秒數（預設 `5.0` 秒）後淡出進入純透明休眠。

---

## 🛠️ 開發與打包（開發者）

### 環境需求
- Windows 10 / 11 64-bit
- Python 3.12 64-bit（含 `pywebview`、`pythonnet`、`clr_loader`、`soundcard`、`websockets`、`numpy`、`winrt-Windows.Media.Control`）
- Node.js（供執行前端單元測試）
- Microsoft Visual C++ 2015–2022 Redistributable (x64)

### 執行自動化測試
```powershell
python -m py_compile .\main.py
python .\dev_tests\test_system.py .\main.py
python -I .\dev_tests\ws_test.py .\main.py
node .\dev_tests\test_lifecycle.js
node .\dev_tests\test_lyrics.js
```

### 一鍵編譯與封裝潔淨發行包
```powershell
# 編譯 onedir 執行檔並於 releases\ 產出無個人座標污染的 Portable ZIP
.\build.ps1 -PackageZip

# 啟動背景實機自我檢測 (確認 ClrLoader 預載、UI 執行緒與零 Fatal Error)
.\verify_build.ps1
```

---

## 📄 授權條款 (License)

本專案採用 **[MIT License](LICENSE)** 授權條款開源釋出。
