# Taskbar Liquid Lyrics 更新日誌 (CHANGELOG)

## [v1.2.0] - 2026-10-31 (Official Milestone: 智慧校正、自訂座標鎖定與雙模態媒體仲裁)

### 新增／修正
- **DWM 透明去背強化**：內建 WinForms 執行緒看門狗與待機喚醒自動重套 DWM 合成，徹底解決長時間或休眠後的黑底問題。
- **雙模態媒體仲裁與優先權**：同時支援 Windows 原生 GSMTC 與瀏覽器 WebNowPlaying，強制以目前 `PLAYING`（播放中）為優先來源，切換音訊時原子化覆蓋中繼資料；過濾 YouTube 官方頻道非歌手標籤。
- **智慧多來源歌詞庫**：整合 LRCLIB 與 5 個 LyricsPlus 鏡像，導入 `fetchWithTimeout` 逾時熔斷與 `commitCollected` 漸進式即時交付，0.25 秒極速顯詞，徹底避免慢速鏡像阻塞；支援雙語歌名解耦回退檢索。
- **穿透模式 RawInput 滾輪校正**：獨創 Win32 RawInput 游標偵測，即使在開啟「點擊穿透（WS_EX_TRANSPARENT）」狀態下，滑鼠游標停在膠囊上方滾動滾輪仍可即時微調時間軸（±0.2s）、中鍵歸零（0.0s）。
- **自由拖曳定位與預設座標鎖定**：未儲存時預設居中於畫面中央以利拖曳，控制中心即時讀取實體座標；一鍵「儲存預設座標」自動啟用鎖定與穿透，設定值跨版本持久化保護。
- **單元測試與綠色打包**：通過系統自啟、生命週期狀態機、歌詞引擎解析與評分等全項單元測試；提供一鍵執行版 `TaskbarLiquidLyrics_v1.2.0_Setup.zip`。

---

## [v1.1.0] - 2026-10-25 (Auto-Sleep + Pure Audio Fallback)

### 新增
- `standby` / `playing` / `pure_audio` 三態前端狀態機。
- 靜音超時後文字平滑淡出並清空，膠囊背景、邊框與陰影回歸純透明；同時 reset 歌詞引擎並取消進行中的歌詞請求。
- 休眠淡出完成後停止 requestAnimationFrame 與 Canvas 繪製；有效播放或音訊事件喚醒後恢復原生刷新節奏。
- 非 GSMTC 音訊回退：能量門檻連續維持指定時間後顯示「偵測到系統音訊」，不進行無效歌詞查詢。
- `config.json` 新增 `silence_timeout_seconds`、`audio_active_threshold`、`audio_confirm_ms`。
- GSMTC 無工作階段時主動清空舊曲目 metadata，避免殘留舊歌名。

---

## [v1.0.0] - 2026-10-25 (官方首發正式版 Milestone Release)

### 核心特性
- 奠定 DWM Per-pixel Alpha 純透明穿透管線，告別色鍵鋸齒。
- 導入本地專屬 WebSocket 音訊推播與 144Hz 滿幀 Canvas 2D 波浪引擎。
- 支援開機自動啟動與桌面捷徑管理。
- 推出液態磨砂玻璃獨立外觀控制中心。
- 採用 PyInstaller `onedir` 純綠色免安裝可攜架構。
