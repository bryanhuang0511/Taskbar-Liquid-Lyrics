/**
 * ============================================================================
 * 🚀 Taskbar Liquid Lyrics - Main Application Controller (All 4 Styles Edition)
 * ============================================================================
 * - Dual Engine: Windows GSMTC Native Media Control + WebNowPlaying Fallback
 * - Monotonic High-Precision Timeline with Automatic Seek / Scrub Detection
 * - 100% Taiwan Traditional OpenCC Syllable / Line Lyrics Synchronizer
 * - Anti-Jitter Line Locking: Zero horizontal bouncing, smooth optical crossfade
 * - Prioritized Display: Synced Lyrics > Track Title Marquee
 * - Real-Time Glass Settings Window Link (Click Gear or Right-Click to open)
 * - Precise Pause Detection & Smooth Edge Tapering
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. UI Elements
  const capsuleRoot = document.getElementById('capsuleRoot');
  const activeLyric = document.getElementById('activeLyric');
  const lyricsStage = document.getElementById('lyricsStage');
  const trackMarqueeWrapper = document.getElementById('trackMarqueeWrapper');
  const trackMarqueeText = document.getElementById('trackMarqueeText');
  const albumArt = document.getElementById('albumArt');
  const artBox = document.getElementById('artBox');

  // 2. State & Configuration
  let appConfig = {
    style: 2, // Default to Style 2 (Obsidian Dynamic Island)
    textColor: 'white',
    width: 640,
    audioGain: 2.2,
    silenceTimeoutSeconds: 5.0,
    audioActiveThreshold: 0.25,
    audioConfirmMs: 300
  };

  // 3. Initialize Wave Engine
  const waveEngine = new WaveEngine('waveCanvas');

  let currentTrack = {
    title: '',
    artist: '',
    album: '',
    duration: 0,
    isPlaying: false,
    source: ''
  };

  let currentLineIndex = -1;
  let lyricsCandidates = [];
  let lastDisplayedText = '';
  let isShowingLyrics = false;
  let estimatedPosition = 0.0;
  let lastLoopTime = performance.now();

  // v1.1.0：三態生命週期。standby 停止 rAF；只有實際音訊／有效媒體可喚醒。
  let appState = 'standby';
  let lastAudioActivityMs = 0;
  let audioAboveStartMs = null;
  let audioActiveConfirmed = false;
  let sleepTimer = null;
  let standbyClearTimer = null;
  let standbyFadeUntil = 0;
  let renderLoopRunning = false;
  let renderRafId = null;
  let sleepTimerDue = 0;

  let perfEvt = '';

  // 4. Lyrics Subsystem Wrapper
  const lyricsEngine = new LyricsEngine({
    viewportId: null,
    trackId: null,
    onDurationResolved: (dur) => {
      if (dur > 20) currentTrack.duration = dur;
    },
    onCandidatesChanged: (items) => {
      lyricsCandidates = Array.isArray(items) ? items : [];
      publishLyricsStatus();
    }
  });

  // Display a synchronized lyric line (Only triggers on genuine line changes)
  function updateDisplayedLyric(text) {
    perfEvt += 'lyric ';
    if (!text || text.trim() === '') return;
    if (text === lastDisplayedText && isShowingLyrics) return;

    lastDisplayedText = text;
    isShowingLyrics = true;

    lyricsStage.style.display = 'flex';
    trackMarqueeWrapper.style.display = 'none';

    // Gentle 0.18s optical crossfade
    activeLyric.style.opacity = '0';
    requestAnimationFrame(() => {
      activeLyric.textContent = text;
      activeLyric.style.opacity = '1';
    });
  }

  // Display the active track title when no lyrics are available or during song intro
  function showTrackInfo() {
    isShowingLyrics = false;
    currentLineIndex = -2;

    if (!currentTrack.title && !currentTrack.artist) {
      if (lastDisplayedText !== '等待音樂播放中...') {
        lastDisplayedText = '等待音樂播放中...';
        activeLyric.textContent = '等待音樂播放中...';
        lyricsStage.style.display = 'flex';
        trackMarqueeWrapper.style.display = 'none';
      }
      return;
    }

    // Display the active media title only. Artist metadata remains available
    // for lyric lookup but is deliberately not concatenated into the marquee.
    const fullTitle = currentTrack.title || currentTrack.artist;

    if (fullTitle === lastDisplayedText && trackMarqueeWrapper.style.display === 'flex') {
      return;
    }

    lastDisplayedText = fullTitle;
    lyricsStage.style.display = 'none';
    trackMarqueeWrapper.style.display = 'flex';
    trackMarqueeText.textContent = fullTitle;

    requestAnimationFrame(() => {
      const containerW = trackMarqueeWrapper.clientWidth || 550;
      const textW = trackMarqueeText.scrollWidth;
      const overflow = textW - containerW;

      trackMarqueeText.classList.remove('is-marquee');
      if (overflow > 6) {
        const overflowPx = overflow + 40;
        const durationSec = Math.max(10, Math.min(26, Math.round(overflowPx / 28 + 8)));
        trackMarqueeText.style.setProperty('--marquee-distance', `-${overflowPx}px`);
        trackMarqueeText.style.setProperty('--marquee-duration', `${durationSec}s`);
        trackMarqueeText.classList.add('is-marquee');
      }
    });
  }

  function onTrackChanged() {
    perfEvt += 'track ';
    currentLineIndex = -1;
    lastDisplayedText = '';
    isShowingLyrics = false;

    // 非正常播放狀態不查歌詞；避免 standby／pure_audio 時非同步請求又寫回舊內容。
    if (appState !== 'playing' || !currentTrack.isPlaying) return;
    // 空 metadata 不是一首新歌：不做無效歌詞檢索，也不覆寫目前淡出中的內容。
    if (!currentTrack.title && !currentTrack.artist) return;

    // Trigger instant lyrics fetcher with Korean priority
    lyricsEngine.setTrack({
      title: currentTrack.title,
      artist: currentTrack.artist,
      duration: currentTrack.duration
    }, true);

    if (appState === 'playing') showTrackInfo();
  }


  const hasTrackMetadata = () => !!(currentTrack.title.trim() || currentTrack.artist.trim());

  function clearDisplayedContent() {
    activeLyric.textContent = '';
    trackMarqueeText.textContent = '';
    trackMarqueeText.classList.remove('is-marquee');
    lyricsStage.style.display = 'flex';
    trackMarqueeWrapper.style.display = 'none';
    artBox.style.display = 'none';
    albumArt.removeAttribute('src');
    lastDisplayedText = '';
    isShowingLyrics = false;
    currentLineIndex = -1;
  }

  function showPureAudio() {
    lastDisplayedText = '__pure_audio__';
    isShowingLyrics = false;
    currentLineIndex = -1;
    activeLyric.textContent = '偵測到系統音訊';
    lyricsStage.style.display = 'flex';
    trackMarqueeWrapper.style.display = 'none';
    trackMarqueeText.textContent = '';
    trackMarqueeText.classList.remove('is-marquee');
    artBox.style.display = 'none';
    albumArt.removeAttribute('src');
  }

  function startRenderLoop() {
    if (renderLoopRunning) return;
    renderLoopRunning = true;
    lastLoopTime = performance.now();
    renderRafId = requestAnimationFrame(appLoop);
  }

  function stopRenderLoop() {
    renderLoopRunning = false;
    if (renderRafId !== null) cancelAnimationFrame(renderRafId);
    renderRafId = null;
  }

  function armSilenceWatchdog() {
    if (!lastAudioActivityMs || sleepTimer !== null) return;
    sleepTimerDue = performance.now() + Math.max(0, appConfig.silenceTimeoutSeconds * 1000);
    sleepTimer = setTimeout(checkSilenceTimeout, Math.max(0, sleepTimerDue - performance.now()));
  }

  function checkSilenceTimeout() {
    sleepTimer = null;
    const timeoutMs = Math.max(500, appConfig.silenceTimeoutSeconds * 1000);
    const elapsed = performance.now() - lastAudioActivityMs;
    if (lastAudioActivityMs && elapsed >= timeoutMs) {
      // 只有在沒有可用且仍標記播放中的 GSMTC 曲目時才休眠；避免長前奏／極安靜樂段被誤判。
      if (!(currentTrack.isPlaying && hasTrackMetadata())) {
        transitionAppState('standby');
        return;
      }
      sleepTimer = setTimeout(checkSilenceTimeout, timeoutMs);
      return;
    }
    // Audio activity timestamps are updated at sample rate, but the watchdog itself is only
    // re-armed when it fires, avoiding one setTimeout/GC allocation per 8–12ms audio packet.
    if (lastAudioActivityMs) {
      sleepTimerDue = performance.now() + Math.max(25, timeoutMs - elapsed);
      sleepTimer = setTimeout(checkSilenceTimeout, Math.max(25, sleepTimerDue - performance.now()));
    }
  }

  function noteAudioActivity(now) {
    lastAudioActivityMs = now;
    armSilenceWatchdog();
  }

  function transitionAppState(nextState) {
    if (!['standby', 'playing', 'pure_audio'].includes(nextState)) return;
    if (appState === nextState) return;
    const previous = appState;
    appState = nextState;
    capsuleRoot.classList.toggle('is-standby', nextState === 'standby');
    capsuleRoot.classList.toggle('is-pure-audio', nextState === 'pure_audio');

    if (standbyClearTimer !== null) {
      clearTimeout(standbyClearTimer);
      standbyClearTimer = null;
    }

    if (nextState === 'standby') {
      audioAboveStartMs = null;
      audioActiveConfirmed = false;
      if (sleepTimer !== null) { clearTimeout(sleepTimer); sleepTimer = null; }
      // 清除歌詞陣列並中止可能仍在執行的網路檢索；DOM 文字本身保留至淡出結束。
      if (lyricsEngine) lyricsEngine.reset();
      standbyFadeUntil = performance.now() + 430;
      // 將目標降為靜音，但讓現有波形在淡出區間自然收斂。
      if (waveEngine) waveEngine.setPlaying(false);
      if (!renderLoopRunning) startRenderLoop();
      standbyClearTimer = setTimeout(() => {
        standbyClearTimer = null;
        if (appState !== 'standby') return;
        clearDisplayedContent();
        // No active media owns the capsule in standby: clear metadata and invalidate
        // pending lyric requests so a late response cannot resurrect a previous tab.
        currentTrack = { title: '', artist: '', album: '', duration: 0, isPlaying: false, source: '' };
        estimatedPosition = 0;
        if (lyricsEngine) lyricsEngine.reset();
        lyricsCandidates = [];
        publishLyricsStatus();
        if (waveEngine) waveEngine.setStandby(true);
        sendHostCommand({ cmd: 'set_standby_os', standby: true });
        stopRenderLoop();
      }, 440);
      return;
    }

    standbyFadeUntil = 0;
    if (previous === 'standby') sendHostCommand({ cmd: 'set_standby_os', standby: false });
    if (waveEngine) {
      waveEngine.setStandby(false);
      waveEngine.setPlaying(nextState === 'pure_audio' || (nextState === 'playing' && currentTrack.isPlaying && !isHardwareSilent));
    }
    startRenderLoop();
    if (nextState === 'pure_audio') {
      if (lyricsEngine) lyricsEngine.reset();
      showPureAudio();
    }
    // normal track info/lyrics are applied by updateTrackInfo / updatePlaybackState on wake.
    if (previous === 'standby' && sleepTimer === null && lastAudioActivityMs) armSilenceWatchdog();
  }

  function resolveAudioMode() {
    const target = currentTrack.isPlaying && hasTrackMetadata() ? 'playing' : 'pure_audio';
    const wasPlaying = appState === 'playing';
    transitionAppState(target);
    if (target === 'playing' && !wasPlaying) onTrackChanged();
    else if (target === 'pure_audio') showPureAudio();
  }

  // 5. Apply Visual Styles
  function applyCapsuleStyle(styleNum, textColor) {
    if (styleNum) appConfig.style = parseInt(styleNum) || 3;
    if (textColor) appConfig.textColor = (textColor === 'black') ? 'black' : 'white';

    capsuleRoot.classList.remove('style-1', 'style-2', 'style-3', 'style-4', 'text-white', 'text-black');
    capsuleRoot.classList.add(`style-${appConfig.style}`);
    capsuleRoot.classList.add(`text-${appConfig.textColor}`);

    if (waveEngine) {
      waveEngine.setStyle(appConfig.style);
    }
  }

  // 6. WebSocket Messaging with Python Host
  let wnpSocket = null;
  let reconnectTimer = null;

  function sendHostCommand(cmdObj) {
    if (wnpSocket && wnpSocket.readyState === WebSocket.OPEN) {
      try {
        wnpSocket.send(JSON.stringify(cmdObj));
      } catch (e) {
        console.warn('Failed to send host command', e);
      }
    }
  }

  function publishLyricsStatus() {
    const selected = lyricsEngine && lyricsEngine.candidates
      ? lyricsEngine.candidates[lyricsEngine.selectedCandidateIndex] : null;
    sendHostCommand({
      cmd: 'lyrics_status',
      status: {
        title: currentTrack.title || '',
        artist: currentTrack.artist || '',
        offset: lyricsEngine ? lyricsEngine.offset : 0,
        source: selected ? selected.source : (lyricsEngine && lyricsEngine.lyrics.length ? 'Local cache' : '尚未載入'),
        candidates: lyricsCandidates
      }
    });
  }

  function setLyricsOffset(value) {
    if (!lyricsEngine) return;
    lyricsEngine.offset = Math.max(-30, Math.min(30, Number(value) || 0));
    publishLyricsStatus();
  }

  function openSettingsWindow() {
    sendHostCommand({ cmd: 'open_settings_window' });
  }

  // 7. Event Listeners for Opening Settings
  // Right-click or Double-click on capsule opens settings
  if (capsuleRoot) {
    capsuleRoot.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openSettingsWindow();
    });

    capsuleRoot.addEventListener('dblclick', () => {
      openSettingsWindow();
    });
  }

  // Wheel adjustment is intentionally bound to the capsule surface (not a missing viewport node).
  if (capsuleRoot) {
    capsuleRoot.addEventListener('wheel', (e) => {
      if (!lyricsEngine || !lyricsEngine.lyrics.length) return;
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.2 : -0.2;
      setLyricsOffset(lyricsEngine.offset + step);
    }, { passive: false });
    capsuleRoot.addEventListener('auxclick', (e) => {
      if (e.button === 1) { e.preventDefault(); setLyricsOffset(0); }
    });
  }

  // 8. Playback Status Sync (Real-time Pause Detection)
  window.updatePlaybackState = function(isPlaying) {
    const wasPlaying = currentTrack.isPlaying;
    currentTrack.isPlaying = !!isPlaying;
    if (currentTrack.isPlaying) {
      capsuleRoot.classList.remove('is-paused');
      if (hasTrackMetadata()) {
        // 不因重複的 PLAYING 通知重設靜音期限；只在恢復播放／離開其他狀態時記錄一次。
        if (!wasPlaying || appState !== 'playing') noteAudioActivity(performance.now());
        const wasInPlayingState = appState === 'playing';
        transitionAppState('playing');
        if (!wasInPlayingState || !wasPlaying) onTrackChanged();
      } else if (audioActiveConfirmed) {
        transitionAppState('pure_audio');
        showPureAudio();
      }
    } else {
      capsuleRoot.classList.add('is-paused');
      if (audioActiveConfirmed) {
        transitionAppState('pure_audio');
        showPureAudio();
      }
      // 暫停後保留現有文字至靜音超時，避免一暫停就閃爍；外部音訊若持續則會轉 pure_audio。
    }

    if (waveEngine) {
      const shouldAnimate = appState === 'pure_audio' || (appState === 'playing' && currentTrack.isPlaying && !isHardwareSilent);
      waveEngine.setPlaying(shouldAnimate);
    }
  };

  // 9. Windows Native Media Control Interface (Called from Python GSMTC thread)
  let lastWnpActiveTime = 0;
  let lastWnpState = false;

  window.updateTrackInfo = function(track) {
    if (!track) return;
    const previousState = appState;
    const wasPlaying = currentTrack.isPlaying;
    const nextTitle = track.title || '';
    const nextArtist = track.artist || '';
    const titleChanged = currentTrack.title !== nextTitle;
    const artistChanged = Boolean(nextArtist && currentTrack.artist !== nextArtist);
    const isNew = titleChanged || artistChanged;

    // Protection: If WebNowPlaying (e.g. YouTube Music) is active and playing a different track,
    // prevent background GSMTC periodic seek ticks from hijacking or resetting the song
    const isWnpActive = (currentTrack.source === 'WebNowPlaying' && currentTrack.isPlaying && (performance.now() - lastWnpActiveTime < 15000));
    if (isWnpActive && track.source !== 'WebNowPlaying') {
      if (!isNew) {
        return;
      }
    }

    if (titleChanged) {
      currentTrack.duration = 0;
      currentTrack.album = '';
      estimatedPosition = 0;
    }
    currentTrack.title = nextTitle;
    if (nextArtist || titleChanged) currentTrack.artist = nextArtist;
    currentTrack.album = track.album || currentTrack.album || '';
    currentTrack.duration = Number(track.duration) > 0 ? Number(track.duration) : (titleChanged ? 0 : currentTrack.duration);
    currentTrack.isPlaying = !!track.isPlaying;
    currentTrack.source = track.source || currentTrack.source || '';

    if (track.seek !== null && track.seek !== undefined && track.seek >= 0) {
      estimatedPosition = track.seek;
      currentLineIndex = -1;
    }

    if (currentTrack.isPlaying && hasTrackMetadata()) {
      // GSMTC 可能因位置跳躍而週期性推送 updateTrackInfo；位置更新不應延長靜音期限。
      if (isNew || previousState !== 'playing' || !wasPlaying) noteAudioActivity(performance.now());
      transitionAppState('playing');
      if (isNew || previousState !== 'playing' || !wasPlaying) onTrackChanged();
    } else if (audioActiveConfirmed) {
      transitionAppState('pure_audio');
      showPureAudio();
    } else if (isNew && hasTrackMetadata() && appState === 'playing') {
      // 曲目 metadata 改變但播放器已暫停時，只更新快取；等恢復播放或進入休眠再更新畫面。
      currentLineIndex = -1;
    }

    if (waveEngine) {
      const shouldAnimate = appState === 'pure_audio' || (appState === 'playing' && currentTrack.isPlaying && !isHardwareSilent);
      waveEngine.setPlaying(shouldAnimate);
    }
    if (isNew) publishLyricsStatus();
  };

  // 10. Initial Config Injection from Host
  window.initConfig = function(cfg) {
    if (!cfg) return;
    if (cfg.style) appConfig.style = parseInt(cfg.style);
    if (cfg.text_color) appConfig.textColor = cfg.text_color;
    if (cfg.width) appConfig.width = parseInt(cfg.width);
    if (cfg.audio_gain) appConfig.audioGain = parseFloat(cfg.audio_gain);
    if (Number.isFinite(Number(cfg.silence_timeout_seconds))) {
      appConfig.silenceTimeoutSeconds = Math.max(1, Math.min(120, Number(cfg.silence_timeout_seconds)));
    }
    if (Number.isFinite(Number(cfg.audio_active_threshold))) {
      appConfig.audioActiveThreshold = Math.max(0.01, Math.min(0.95, Number(cfg.audio_active_threshold)));
    }
    if (Number.isFinite(Number(cfg.audio_confirm_ms))) {
      appConfig.audioConfirmMs = Math.max(50, Math.min(2000, Number(cfg.audio_confirm_ms)));
    }

    if (waveEngine) {
      waveEngine.setGain(appConfig.audioGain);
      waveEngine.resize();
    }

    if (cfg.click_through !== undefined && capsuleRoot) {
      capsuleRoot.classList.toggle('click-through', !!cfg.click_through);
    }

    applyCapsuleStyle(appConfig.style, appConfig.textColor);
  };

  // 11. Host Audio Feed + three-state detector (playing / pure_audio / standby)
  let silenceStartTime = null;
  let isHardwareSilent = false;
  let lastPaused = null;

  window.updateAudioLevels = function(bass, energy, mid, high) {
    const safeBass = Number.isFinite(bass) ? bass : 0;
    const safeEnergy = Number.isFinite(energy) ? energy : 0;
    const now = performance.now();
    const aboveThreshold = safeEnergy >= appConfig.audioActiveThreshold;

    if (aboveThreshold) {
      if (audioAboveStartMs === null) audioAboveStartMs = now;
      noteAudioActivity(now);
      if (!audioActiveConfirmed && now - audioAboveStartMs >= appConfig.audioConfirmMs) {
        audioActiveConfirmed = true;
        resolveAudioMode();
      }
    } else {
      audioAboveStartMs = null;
      audioActiveConfirmed = false;
    }

    // 老版本極低能量靜音偵測保留供波浪平滑使用；狀態機改用可配置的 -45dBFS 等級門檻。
    const isSilent = (safeBass < 0.005 && safeEnergy < 0.005);
    if (isSilent) {
      if (silenceStartTime === null) silenceStartTime = now;
      else if (now - silenceStartTime > 350) isHardwareSilent = true;
    } else {
      silenceStartTime = null;
      isHardwareSilent = false;
    }

    if (appState !== 'standby' && lastAudioActivityMs && now - lastAudioActivityMs >= appConfig.silenceTimeoutSeconds * 1000
        && !(currentTrack.isPlaying && hasTrackMetadata())) {
      transitionAppState('standby');
    }

    const effectivePlaying = appState === 'pure_audio' || (appState === 'playing' && currentTrack.isPlaying && !isHardwareSilent);
    if (waveEngine) waveEngine.updateAudio(safeBass, safeEnergy, effectivePlaying, mid, high);

    const paused = !effectivePlaying;
    if (paused !== lastPaused) {
      capsuleRoot.classList.toggle('is-paused', paused);
      lastPaused = paused;
    }
  };

  // 12. WebNowPlaying WebSocket Client (Port 8974)
  function connectWebNowPlaying() {
    if (wnpSocket) {
      try { wnpSocket.close(); } catch (e) {}
    }

    try {
      wnpSocket = new WebSocket('ws://127.0.0.1:8974');
    } catch (e) {
      scheduleReconnect();
      return;
    }

    wnpSocket.onopen = () => {
      sendHostCommand({ cmd: 'hello', role: 'display' });
      sendHostCommand({ cmd: 'get_config' });
    };

    wnpSocket.onmessage = (event) => {
      const msg = event.data;
      if (typeof msg !== 'string') return;

      if (msg.charCodeAt(0) === 64 && msg.startsWith('@a,')) {
        const p = msg.split(',');
        // @a,bass,energy[,mid,high]  (mid/high 為 v2 後端新增，舊後端缺省時引擎退回 energy)
        window.updateAudioLevels(+p[1], +p[2], p.length > 3 ? +p[3] : undefined, p.length > 4 ? +p[4] : undefined);
        return;
      }

      // Handle JSON payload from Host / Settings Window
      if (msg.startsWith('{')) {
        try {
          const parsed = JSON.parse(msg);
          if (parsed.cmd === 'config') {
            window.initConfig(parsed.config);
          } else if (parsed.cmd === 'set_style') {
            applyCapsuleStyle(parsed.style, appConfig.textColor);
          } else if (parsed.cmd === 'set_text_color') {
            applyCapsuleStyle(appConfig.style, parsed.color);
          } else if (parsed.cmd === 'set_gain') {
            if (waveEngine) waveEngine.setGain(parsed.gain);
          } else if (parsed.cmd === 'set_lyrics_offset') {
            if (parsed.value !== undefined && parsed.value !== null) setLyricsOffset(parsed.value);
            else setLyricsOffset((lyricsEngine ? lyricsEngine.offset : 0) + (Number(parsed.delta) || 0));
          } else if (parsed.cmd === 'select_lyrics_candidate') {
            if (lyricsEngine && lyricsEngine.selectCandidate(parsed.index)) publishLyricsStatus();
          } else if (parsed.cmd === 'wake_capsule') {
            noteAudioActivity(performance.now());
            transitionAppState('playing');
            showTrackInfo();
          } else if (parsed.cmd === 'search_lyrics') {
            const title = String(parsed.title || '').trim();
            if (title && lyricsEngine) {
              currentTrack.title = title;
              currentTrack.artist = String(parsed.artist || '').trim();
              currentTrack.isPlaying = true;
              lyricsEngine.searchManually(currentTrack.title, currentTrack.artist);
              showTrackInfo();
              publishLyricsStatus();
            }
          }
          return;
        } catch (e) {}
      }

      // Legacy WNP Protocol parsing
      const colonIdx = msg.indexOf(':');
      if (colonIdx === -1) return;

      const key = msg.substring(0, colonIdx).trim().toUpperCase();
      const val = msg.substring(colonIdx + 1).trim();
      handleWnpMessage(key, val);
    };

    wnpSocket.onclose = () => { scheduleReconnect(); };
    wnpSocket.onerror = () => {};
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWebNowPlaying();
    }, 3500);
  }

  let wnpTitleAt = 0;
  let wnpPending = { title: '', artist: '', duration: 0, cover: '' };

  function applyWnpTrackToCurrent() {
    if (!wnpPending.title) return;
    const titleChanged = currentTrack.title !== wnpPending.title;
    const artistChanged = Boolean(wnpPending.artist && currentTrack.artist !== wnpPending.artist);
    const changed = titleChanged || artistChanged;
    currentTrack.title = wnpPending.title;
    if (wnpPending.artist || titleChanged) {
      currentTrack.artist = wnpPending.artist || '';
    }
    currentTrack.album = '';
    if (wnpPending.duration > 0) currentTrack.duration = wnpPending.duration;
    else if (titleChanged) currentTrack.duration = 0;
    currentTrack.source = 'WebNowPlaying';
    currentTrack.isPlaying = true;
    if (titleChanged) {
      estimatedPosition = 0;
    }
    if (changed || appState !== 'playing') {
      noteAudioActivity(performance.now());
      transitionAppState('playing');
      onTrackChanged();
    }
  }

  function handleWnpMessage(key, val) {
    switch (key) {
      case 'TITLE':
        if (wnpPending.title !== val) {
          wnpPending.title = val;
          wnpPending.artist = '';
          wnpPending.duration = 0;
          wnpTitleAt = performance.now();
        }
        if (lastWnpState || !currentTrack.isPlaying) {
          if (lastWnpState) {
            lastWnpActiveTime = performance.now();
            applyWnpTrackToCurrent();
          } else if (currentTrack.title !== val) {
            currentTrack.title = val;
            currentTrack.source = 'WebNowPlaying';
            currentTrack.artist = '';
            currentTrack.album = '';
            currentTrack.duration = 0;
            estimatedPosition = 0;
          }
        }
        break;
      case 'ARTIST':
        if (performance.now() - wnpTitleAt < 5000) {
          wnpPending.artist = val;
        }
        if ((currentTrack.source === 'WebNowPlaying' || currentTrack.title === wnpPending.title) && performance.now() - wnpTitleAt < 5000 && val && currentTrack.artist !== val) {
          currentTrack.artist = val;
          if (appState === 'playing' && currentTrack.isPlaying) onTrackChanged();
        }
        break;
      case 'COVER':
        wnpPending.cover = val || '';
        if (currentTrack.source === 'WebNowPlaying' || currentTrack.title === wnpPending.title) {
          if (val && val.startsWith('http') && appState === 'playing' && currentTrack.isPlaying) {
            albumArt.src = val;
            artBox.style.display = 'flex';
          } else {
            artBox.style.display = 'none';
            albumArt.removeAttribute('src');
          }
        }
        break;
      case 'STATE':
        const isPlaying = (val === '1' || val === 'PLAYING');
        lastWnpState = isPlaying;
        if (isPlaying) {
          lastWnpActiveTime = performance.now();
          applyWnpTrackToCurrent();
          window.updatePlaybackState(true);
        } else if (currentTrack.source === 'WebNowPlaying') {
          window.updatePlaybackState(false);
        }
        break;
      case 'DURATION':
        if (val.includes(':')) {
          const parts = val.split(':').map(Number);
          if (parts.length === 2) {
            const dur = parts[0] * 60 + parts[1];
            wnpPending.duration = dur;
            if (!wnpPending.title || currentTrack.title === wnpPending.title || currentTrack.source === 'WebNowPlaying') {
              currentTrack.duration = dur;
            }
          }
        }
        break;
      case 'POSITION':
        if (val.includes(':')) {
          const parts = val.split(':').map(Number);
          if (parts.length === 2) {
            const pos = parts[0] * 60 + parts[1];
            if (lastWnpState && wnpPending.title && currentTrack.title !== wnpPending.title) {
              lastWnpActiveTime = performance.now();
              applyWnpTrackToCurrent();
            }
            if (!wnpPending.title || currentTrack.title === wnpPending.title || currentTrack.source === 'WebNowPlaying') {
              if (lastWnpState) lastWnpActiveTime = performance.now();
              if (Math.abs(estimatedPosition - pos) > 1.5) {
                estimatedPosition = pos;
                currentLineIndex = -1;
              }
            }
          }
        }
        break;
    }
  }

  // 13. Main Animation & Lyrics Sync Loop. No perpetual rAF in standby.
  const perfDts = [], perfRender = []; let lastPerfNow = performance.now(), perfLastReport = lastPerfNow;
  function reportPerf(now) {
    perfDts.push(now - lastPerfNow); lastPerfNow = now;
    if (now - perfLastReport < 2000) return;
    perfLastReport = now;
    const samples = perfDts.splice(0).sort((a, b) => a - b), n = samples.length;
    const rs = perfRender.splice(0).sort((a, b) => a - b);
    if (!n) return;
    sendHostCommand({ cmd: 'perf', frames: n,
      avg: +(samples.reduce((a, b) => a + b, 0) / n).toFixed(2),
      p95: +samples[Math.floor(n * 0.95)].toFixed(2),
      slow17: samples.filter(x => x > 17).length,
      slow34: samples.filter(x => x > 34).length,
      slow100: samples.filter(x => x > 100).length,
      top5: samples.slice(-5).map(x => Math.round(x)),
      rAvg: rs.length ? +(rs.reduce((a, b) => a + b, 0) / rs.length).toFixed(3) : 0,
      rP95: rs.length ? +rs[Math.floor(rs.length * 0.95)].toFixed(3) : 0,
      rMax: rs.length ? +rs[rs.length - 1].toFixed(3) : 0,
      evt: perfEvt.trim(), state: appState });
    perfEvt = '';
  }

  function appLoop(now) {
    if (!renderLoopRunning) return;
    reportPerf(now);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastLoopTime) / 1000));
    lastLoopTime = now;

    if (appState === 'standby') {
      if (waveEngine) {
        waveEngine.render(dt);
        if (waveEngine.lastRenderMs > 0) perfRender.push(waveEngine.lastRenderMs);
      }
      if (now < standbyFadeUntil) renderRafId = requestAnimationFrame(appLoop);
      else { renderLoopRunning = false; renderRafId = null; }
      return;
    }

    // Only advance / animate synced lyrics while a valid GSMTC track is actively playing.
    if (appState === 'playing' && currentTrack.isPlaying && !isHardwareSilent) {
      estimatedPosition += dt;
      if (currentTrack.duration > 0 && estimatedPosition > currentTrack.duration) estimatedPosition = currentTrack.duration;
      const lyrics = lyricsEngine ? lyricsEngine.lyrics : null;
      if (lyrics && lyrics.length > 0) {
        let activeIndex = -1;
        const effectivePos = Math.max(0, estimatedPosition + (lyricsEngine ? lyricsEngine.offset : 0));
        for (let i = lyrics.length - 1; i >= 0; i--) {
          if (effectivePos >= lyrics[i].time - 0.15) { activeIndex = i; break; }
        }
        if (activeIndex >= 0) {
          if (activeIndex !== currentLineIndex) {
            currentLineIndex = activeIndex;
            const rawText = lyrics[activeIndex].text;
            const converted = (window.S2TConverter && window.S2TConverter.convertText)
              ? window.S2TConverter.convertText(rawText) : rawText;
            updateDisplayedLyric(converted);
          }
        } else if (currentLineIndex !== -2) {
          currentLineIndex = -2;
          showTrackInfo();
        }
      } else if (hasTrackMetadata()) {
        showTrackInfo();
      }
    }

    if (waveEngine) {
      waveEngine.render(dt);
      if (waveEngine.lastRenderMs > 0) perfRender.push(waveEngine.lastRenderMs);
    }
    renderRafId = requestAnimationFrame(appLoop);
  }

  window.wakeCapsule = function() {
    noteAudioActivity(performance.now());
    transitionAppState('playing');
    showTrackInfo();
  };

  // Initialize in a clean, fully transparent standby state.
  applyCapsuleStyle(appConfig.style, appConfig.textColor);
  clearDisplayedContent();
  if (waveEngine) waveEngine.setStandby(true);
  capsuleRoot.classList.add('is-standby');
  connectWebNowPlaying();
});
