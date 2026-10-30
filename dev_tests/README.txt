開發用模擬測試（不進 PyInstaller）。需 python3 + numpy、node。
1) python3 -I gen.py ../main.py series.json        # 合成音訊 → 後端 analyze_block → series.json
2) node sim.js ../ui/js/wave_engine.js series.json 2.2   # 144Hz 波形統計(多峰幀/最高/基線)
3) node count.js ../ui/js/wave_engine.js series.json     # 各情境發射脈衝數
4) node profile.js ../ui/js/wave_engine.js series.json full 4.15 4.7 0.04   # 單次踢鼓波形 ASCII
5) python3 -I ws_test.py ../main.py                # WebSocket 覆蓋式發送 + 分析耗時

6) node test_v120_lyrics.js  # LRC offset、候選切換與評分單元測試（不需 Windows / npm）
