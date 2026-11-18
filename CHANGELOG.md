# 更新紀錄 (Changelog)

本文件記錄 **Taskbar Liquid Lyrics（工作列液態玻璃歌詞器）** 的正式版本發行與架構基準。

## [v1.0.0] - 2026-11-18

### 核心功能與架構里程碑
- **DWM 每像素 Alpha 透明合成**：採用 `DwmEnableBlurBehindWindow` + `DwmExtendFrameIntoClientArea` + WebView2 透明畫布，並配備低頻 WinForms UI 執行緒透明度守護與待機喚醒自動重套，告別鋸齒色鍵與休眠黑底問題。
- **144Hz 滿幀流體波浪引擎 (`WaveEngine`)**：後端 2048 點 Hann 窗滑動 FFT 分析（30–150Hz 重低音、250–2000Hz 中頻、2000–8000Hz 高頻）與 dBFS 線性映射；前端預配置 TypedArray 零 GC 配置、孤立重低音衝擊波與旋律基線融合；休眠時徹底停止動畫迴圈與畫布繪製。
- **雙模態多媒體偵測與防衝突仲裁**：整合 Windows 原生 GSMTC 與 WebSocket WebNowPlaying 協議，強制以正在播放（`PLAYING`）之工作階段優先覆蓋、過濾無效短音軌與官方頻道雜訊，確保 YouTube / YouTube Music / Spotify 切換流暢。
- **多來源歌詞引擎與智慧校時 (`LyricsEngine`)**：平行查詢 LRCLIB、5 個 LyricsPlus 鏡像與 Better Lyrics TTML，支援每請求獨立逾時熔斷、漸進式候補渲染、雙語括號標題解耦、韓文原文評分防禦、簡轉臺灣正體中文，以及具備 250 首上限 LRU 防護之本機快取。
- **點擊穿透模式下原生滾輪校時**：透過 Win32 `RawInput`（`RIDEV_INPUTSINK`）於完全點擊穿透（`WS_EX_TRANSPARENT`）狀態下，精準捕捉懸停於膠囊上方時的滾輪微調（`±0.2s`）與中鍵歸零（`0.0s`），並於程式結束時安全反註冊與釋放訊息視窗資源。
- **多螢幕定位保護與獨立控制中心**：未儲存預設座標時自動置中且不鎖定不穿透，方便跨螢幕環境使用者拖曳調校；個人 `config.json` 嚴格隔離於本機執行目錄，不污染原始碼庫與公開發行封包；支援使用者層級開機自啟與桌面捷徑維護。
- **模組化開發與純淨發布管線**：完善 `.gitignore`、`config.example.json`、`LICENSE`、`build.ps1 -PackageZip`（防個人設定與快取洩漏驗證）與全套自動化單元／通訊／系統整合測試。
