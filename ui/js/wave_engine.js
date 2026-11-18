/**
 * ============================================================================
 * 🌊 WaveEngine v2 - Single-layer Solitary Shockwave Engine
 * ============================================================================
 * 設計目標（對齊夥伴 Rainmeter 手感）：
 *  A. 純單層波浪：只畫一條主波，沒有背景副波。
 *  B. 重低音 = 一顆孤立衝擊波：偵測到「低音起拍 (onset)」才從中心發射一個脈衝，
 *     脈衝 = 一個帶方向性的鐘形波包，由中心向兩端推進、衰減、離場後平息。
 *     不再把連續音訊每 16ms 灌進傳播緩衝區（那是碎波的來源）。
 *  C. 中高音 (mid/high) = 低振幅「基線波」(約 20%~35% 高度)，人聲/鋼琴/吉他
 *     不會讓波浪躺平；基線也沿用 Rainmeter 式的 W0→W14 傳播緩衝區，慢速起伏。
 *  D. 合成 (v1.1.1 改版)：y = base + (pulsePeak - baseAvg) * envelope
 *     v1.1.0 是 base + (peak - base) * env，脈衝經過處「基線整個被脈衝取代」，旋律起伏被吞沒。
 *     v1.1.1 改減去「慢速平均基線 baseAvg」(不隨旋律抖動)，脈衝只負責抬高整體，
 *     旋律的瞬時起伏 (base - baseAvg) 仍然疊在浪頭上 → 大浪推著小浪花，鼓一退旋律立即回到主導。
 *
 * 輸入契約：updateAudio(bass, energy, isPlaying, mid, high)
 *   bass/mid/high/energy 皆為 0~1、dB 映射後的值 (後端 main.py 已做 dB 映射)。
 *   mid/high 缺省時退回 energy (相容舊版後端)。
 *
 * 其餘維持原樣：RGB 120° 相位、4 種 Style 配色、膠囊圓角裁切、閒置平躺。
 */

class WaveEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d', {
      alpha: true,
      willReadFrequently: false
    });

    this.width = 640;
    this.height = 44;

    // ── 幾何：中心 → 邊緣的取樣節點 ─────────────────────────────
    this.halfSize = 21;                       // W0..W20
    this.totalPoints = this.halfSize * 2 - 1; // 41 個樣條節點 (原 29)
    this.baseBuffer = new Float32Array(this.halfSize); // 基線傳播緩衝 (px)
    this.xs = new Float32Array(this.totalPoints);
    this.ys = new Float32Array(this.totalPoints);

    // ── 衝擊波脈衝池 (預先配置，零 GC) ───────────────────────────
    this.MAX_PULSES = 4;
    this.pFront = new Float32Array(this.MAX_PULSES); // 波前位置 0=中心 1=邊緣
    this.pAge = new Float32Array(this.MAX_PULSES);   // 秒
    this.pPeak = new Float32Array(this.MAX_PULSES);  // 目標峰高 (px)
    this.pSpeed = new Float32Array(this.MAX_PULSES); // 波前速度 (單位/秒)
    this.pOn = new Uint8Array(this.MAX_PULSES);

    // ── 可調參數 (全部集中在這裡，方便 agent / 夥伴微調手感) ──────────
    this.cfg = {
      // 脈衝外形
      peakMin: 0.38,        // 最弱的可偵測低音 → 38% 高度
      peakMax: 0.85,        // 最強重低音 → 85% 高度
      sigmaFront: 0.14,     // 波前(外側)寬度，越小越尖
      sigmaTail: 0.30,      // 波尾(內側)寬度，越小平息越快
      travelDecay: 0.45,    // 波前過了 25% 路程後才開始衰減，到邊緣損失此比例 (中心附近維持滿高)
      speedBase: 3.0,       // 中心→邊緣 約 0.33s (原 224ms 且連續灌入)
      speedBoost: 1.2,      // 越強的拍子越快
      attackRate: 70.0,     // 脈衝上升 1-exp(-rate*age)，約 14ms 到 63%
      captureMs: 70,        // 起拍後 70ms 內持續追蹤峰值，取真正的最大力道
      // 低音起拍偵測
      refractoryMs: 170,    // 兩次發射最短間隔 → 同時最多 ~2 顆波，不碎
      bassFloor: 0.28,      // 低音絕對下限；人聲/鋼琴無低音時不會誤觸發
      onsetRel: 0.12,       // 起拍門檻 = max(0.05, onsetRel * bassRef) / sens
      avgTau: 0.60,         // 低音慢速平均 (秒)
      refDecayTau: 4.0,     // 近期峰值參考的衰退時間 (秒)
      // 基線波 (中高音)
      baseLow: 0.17,        // 有聲音時最低 17% 高度   (v1.1.0: 20%)
      baseHigh: 0.44,       // 中高音最強時 44% 高度   (v1.1.0: 35%) → 動態範圍由 15% 擴到 27%
      melodyBoost: 1.15,    // v1.1.1：旋律偏離平均基線的部分再放大，大浪旁邊的小浪花才看得見
      baseAvgTau: 1.4,      // 慢速平均基線時間常數 (秒)；脈衝以它為「地板」而非瞬時基線
      baseIdle: 0.04,       // 無聲閒置
      baseAttack: 14.0,     // 1/s
      baseDecay: 5.0,       // 1/s
      midGamma: 1.35,       // 拉開中高音對比 (v1.1.0: 1.8；調低 = 弱信號也有起伏)
      midFloorRise: 0.35,   // v1.1.1：近期最低中高音能量的上升速度 (1/s)；用「地板→峰值」做對比正規化
      // 資料逾時 (WebSocket 斷線時自動回平)
      staleMs: 320
    };

    // ── 音訊分析狀態 ───────────────────────────────────────────
    this.bass = 0.0;           // 平滑後 (給色相速度用，外部相容)
    this.energy = 0.0;
    this.targetBass = 0.0;
    this.targetEnergy = 0.0;
    this.bassAvg = 0.0;
    this.bassRef = 0.3;
    this.midRef = 0.25;
    this.midFloor = 0.0;       // v1.1.1：近期中高音最低值 (對比正規化的下緣)
    this.baseAvg = 0.0;        // v1.1.1：慢速平均基線 (px)
    this.activeTime = 0.0;     // v1.1.1：連續有聲時間 (秒)，決定 baseAvg 的跟隨速度
    this.prevBass = 0.0;
    this.baseTarget = 0.0;     // px
    this.baseSmooth = 0.0;     // px
    this.lastOnsetMs = -1e9;
    this.capIdx = -1;
    this.capUntilMs = 0;
    this.capAvgSnap = 0.0;
    this.lastAudioMs = 0;

    this.colorPhase = 0.0;
    this.isPlaying = false;
    this.gain = 2.2;
    this.style = 2;
    this.propagationTimer = 0.0;
    this.idleAcc = 0.0;
    this.lastRenderMs = 0.0;   // 最近一次 render() 實際耗時 (診斷用)
    this.isStandby = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth || 640;
    this.height = this.canvas.clientHeight || 44;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.dpr = dpr;
  }

  setGain(val) {
    this.gain = Math.max(1.0, Math.min(4.0, Number(val) || 2.2));
  }

  setStyle(styleNum) {
    this.style = parseInt(styleNum) || 2;
  }

  /** 真正休眠：清除動態狀態與 Canvas 像素；喚醒後再由新音訊重新初始化。 */
  setStandby(standby) {
    this.isStandby = !!standby;
    if (!this.isStandby) {
      this.lastAudioMs = 0;
      this.idleAcc = 0;
      return;
    }
    this._silence();
    this.bass = 0; this.energy = 0;
    this.targetBass = 0; this.targetEnergy = 0;
    this.baseTarget = 0; this.baseSmooth = 0; this.baseAvg = 0;
    this.bassAvg = 0; this.bassRef = 0.3; this.midRef = 0.25; this.midFloor = 0;
    this.activeTime = 0; this.prevBass = 0;
    this.capIdx = -1; this.capUntilMs = 0; this.lastAudioMs = 0;
    this.pOn.fill(0); this.pFront.fill(0); this.pAge.fill(0); this.pPeak.fill(0); this.pSpeed.fill(0);
    this.isPlaying = false;
    this.idleAcc = 0;
    if (this.ctx && this.canvas) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** 僅切換播放狀態，不餵音訊 (避免用平滑值回灌造成假起拍) */
  setPlaying(isPlaying) {
    this.isPlaying = !!isPlaying;
    if (!this.isPlaying) this._silence();
  }

  _silence() {
    this.targetBass = 0.0;
    this.targetEnergy = 0.0;
    this.baseTarget = 0.0;
    this.prevBass = 0.0;
    this.capIdx = -1;
  }

  _spawnPulse(peakPx, strength) {
    let idx = -1, oldest = -1, oldestFront = -1;
    for (let i = 0; i < this.MAX_PULSES; i++) {
      if (!this.pOn[i]) { idx = i; break; }
      if (this.pFront[i] > oldestFront) { oldestFront = this.pFront[i]; oldest = i; }
    }
    if (idx < 0) idx = oldest; // 池滿 → 回收最老(最外側)的那顆
    this.pOn[idx] = 1;
    this.pFront[idx] = 0.0;
    this.pAge[idx] = 0.0;
    this.pPeak[idx] = peakPx;
    this.pSpeed[idx] = this.cfg.speedBase + this.cfg.speedBoost * strength;
    return idx;
  }

  /**
   * 音訊輸入 (約 86Hz，由 WebSocket 推進來)
   */
  updateAudio(bass, energy, isPlaying = true, mid, high) {
    if (this.isStandby) return;
    const c = this.cfg;
    const now = performance.now();
    const dtA = Math.min(0.1, Math.max(0.001, (now - (this.lastAudioMs || now - 12)) / 1000));
    this.lastAudioMs = now;
    this.isPlaying = !!isPlaying;

    if (!this.isPlaying || (bass < 0.003 && energy < 0.003)) {
      this._silence();
      return;
    }
    if (mid === undefined || isNaN(mid)) mid = energy;
    if (high === undefined || isNaN(high)) high = energy;

    const h = this.height;
    const sens = this.gain / 2.2;             // 0.45 ~ 1.82
    const b = Math.max(0.0, Math.min(1.0, bass));
    const e = Math.max(0.0, Math.min(1.0, energy));

    this.targetBass = b;
    this.targetEnergy = e;

    // ── 低音：慢速平均 + 近期峰值參考 (自動適應歌曲響度) ──────────
    const avgPre = this.bassAvg;
    this.bassAvg += (b - this.bassAvg) * (1.0 - Math.exp(-dtA / c.avgTau));
    this.bassRef = Math.max(b, this.bassRef * Math.exp(-dtA / c.refDecayTau), 0.25);

    // ── 起拍偵測 ───────────────────────────────────────────────
    const over = b - avgPre;
    const thr = Math.max(0.05, c.onsetRel * this.bassRef) / sens;
    const rising = b > this.prevBass;
    this.prevBass = b;

    if (b >= c.bassFloor && over > thr && rising &&
        (now - this.lastOnsetMs) > c.refractoryMs) {
      this.lastOnsetMs = now;
      this.capAvgSnap = avgPre;
      const s = this._strength(b);
      this.capIdx = this._spawnPulse(this._peakPx(s), s);
      this.capUntilMs = now + c.captureMs;
    } else if (this.capIdx >= 0) {
      // 起拍後短暫視窗內，跟著低音真實峰值把脈衝高度拉到位
      if (now < this.capUntilMs && this.pOn[this.capIdx]) {
        const s = this._strength(b);
        const px = this._peakPx(s);
        if (px > this.pPeak[this.capIdx]) {
          this.pPeak[this.capIdx] = px;
          this.pSpeed[this.capIdx] = c.speedBase + c.speedBoost * s;
        }
      } else {
        this.capIdx = -1;
      }
    }

    // ── 中高音：基線波目標 (20%~35%) ───────────────────────────
    const m = 0.65 * Math.max(0.0, Math.min(1.0, mid)) + 0.35 * Math.max(0.0, Math.min(1.0, high));
    this.midRef = Math.max(m, this.midRef * Math.exp(-dtA / 6.0), 0.2);
    // 地板：變小時立刻跟下去，變大時緩慢上浮 → 鼓點密集、整體很響的段落，旋律對比不會被壓扁
    if (m < this.midFloor) this.midFloor = m;
    else this.midFloor += (Math.min(m, this.midRef * 0.7) - this.midFloor) * (1.0 - Math.exp(-c.midFloorRise * dtA));
    const mSpan = Math.max(0.25, this.midRef - this.midFloor);
    const mN = Math.pow(Math.max(0.0, Math.min(1.0, (m - this.midFloor) / mSpan)), c.midGamma);
    if (e < 0.04) {
      this.baseTarget = c.baseIdle * h;
    } else {
      this.baseTarget = h * (c.baseLow + (c.baseHigh - c.baseLow) * mN);
    }
  }

  _strength(b) {
    const base = this.capAvgSnap;
    const s = (b - base) / Math.max(0.05, this.bassRef - base + 0.05);
    return Math.max(0.0, Math.min(1.0, s * Math.min(1.4, this.gain / 2.2 + 0.2)));
  }

  _peakPx(s) {
    const c = this.cfg;
    const frac = c.peakMin + (c.peakMax - c.peakMin) * Math.pow(s, 0.8);
    return Math.min(c.peakMax, frac) * this.height;
  }

  render(dt = 0.016) {
    if (!this.canvas || !this.ctx) return;
    const t0 = performance.now();
    const c = this.cfg;
    const h = this.height;
    const w = this.width;

    // ── 資料逾時保護：WebSocket 斷線 / 後端卡住 → 回平 ──────────────
    if (this.lastAudioMs && (t0 - this.lastAudioMs) > c.staleMs && this.targetEnergy > 0) {
      this._silence();
    }

    // ── 色相 / 平滑 (與 FPS 無關的指數平滑) ───────────────────────
    const kAttack = 1.0 - Math.exp(-32.0 * dt);
    const kDecay = 1.0 - Math.exp(-6.0 * dt);
    this.bass += (this.targetBass - this.bass) * (this.targetBass > this.bass ? kAttack : kDecay);
    this.energy += (this.targetEnergy - this.energy) * (this.targetEnergy > this.energy ? kAttack : kDecay);

    // 基線平滑 (慢攻慢放，確保中高音起伏柔順不碎)
    const kb = 1.0 - Math.exp(-(this.baseTarget > this.baseSmooth ? c.baseAttack : c.baseDecay) * dt);
    this.baseSmooth += (this.baseTarget - this.baseSmooth) * kb;
    // 慢速平均基線：剛出聲 / 靜音時快速貼齊 (避免暖機期偏離值被誤認成旋律)，之後才放慢
    if (this.baseTarget > 0.5 * h * c.baseIdle) this.activeTime = Math.min(2.0, this.activeTime + dt);
    else this.activeTime = 0.0;
    const avgTau = 0.12 + (c.baseAvgTau - 0.12) * Math.min(1.0, this.activeTime / 1.5);
    this.baseAvg += (this.baseSmooth - this.baseAvg) * (1.0 - Math.exp(-dt / avgTau));

    // ── 脈衝推進 ────────────────────────────────────────────────
    let anyPulse = false;
    for (let i = 0; i < this.MAX_PULSES; i++) {
      if (!this.pOn[i]) continue;
      this.pAge[i] += dt;
      this.pFront[i] += this.pSpeed[i] * dt;
      if (this.pFront[i] > 1.0 + 2.0 * c.sigmaTail) { this.pOn[i] = 0; continue; }
      anyPulse = true;
    }

    const activeMovement = (this.isPlaying && (this.energy > 0.01 || this.bass > 0.01));

    // ── 閒置節流：完全平躺且無脈衝時，降到 ~30Hz 重繪 (省 GPU/CPU) ──────
    const idle = !activeMovement && !anyPulse && this.baseSmooth < 0.6;
    if (idle) {
      this.idleAcc += dt;
      if (this.idleAcc < 1 / 30) { this.lastRenderMs = 0; return; }
      dt = this.idleAcc;
      this.idleAcc = 0.0;
    } else {
      this.idleAcc = 0.0;
    }

    const ctx = this.ctx;
    const dpr = this.dpr || 1;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // Clip strictly inside pill capsule rounded geometry
    const radius = h / 2;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(0, 0, w, h, radius);
    } else {
      ctx.arc(radius, radius, radius, Math.PI / 2, Math.PI * 1.5);
      ctx.arc(w - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
      ctx.closePath();
    }
    ctx.clip();

    // ── 色彩：Rainmeter 120° 相位 ───────────────────────────────
    const colorSpeed = activeMovement ? (0.65 + this.bass * 1.4) : 0.08;
    this.colorPhase = (this.colorPhase + dt * colorSpeed) % (Math.PI * 2);
    let r = Math.round(Math.sin(this.colorPhase) * 127 + 128);
    let g = Math.round(Math.sin(this.colorPhase + 2.094) * 127 + 128);
    let b = Math.round(Math.sin(this.colorPhase + 4.188) * 127 + 128);

    // ── 基線傳播緩衝 (W0→W20，固定 16ms 步長 + 子步長插值) ───────────
    const stepInterval = 0.016;
    this.propagationTimer += dt;
    let guard = 0;
    while (this.propagationTimer >= stepInterval && guard++ < 6) {
      this.propagationTimer -= stepInterval;
      for (let k = this.halfSize - 1; k > 0; k--) this.baseBuffer[k] = this.baseBuffer[k - 1];
      this.baseBuffer[0] = this.baseSmooth;
    }
    if (guard >= 6) this.propagationTimer = 0.0;
    const stepFrac = Math.min(1.0, this.propagationTimer / stepInterval);

    // ── Style 配色 (與 v1 完全相同) ─────────────────────────────
    let foreAlpha = 0.72;
    const crestAlpha = 0.95;
    if (this.style === 1) {
      r = Math.round(r * 0.7 + 75);
      g = Math.round(g * 0.85 + 35);
      b = 255;
      foreAlpha = activeMovement ? 0.35 : 0.06;
    } else if (this.style === 2) {
      foreAlpha = activeMovement ? 0.78 : 0.14;
    } else if (this.style === 3) {
      r = Math.round(r * 0.6 + 100);
      g = Math.round(g * 0.8 + 50);
      b = 255;
      foreAlpha = activeMovement ? 0.70 : 0.12;
    } else if (this.style === 4) {
      r = Math.round(r * 0.4 + 150);
      g = Math.round(g * 0.4 + 150);
      b = 255;
      foreAlpha = activeMovement ? 0.40 : 0.08;
    }

    // ── 建立單層波形 ────────────────────────────────────────────
    const xs = this.xs, ys = this.ys;
    const n = this.totalPoints;
    const centerIdx = this.halfSize - 1;
    const maxH = h * 0.92;
    const invSF = 1.0 / c.sigmaFront;
    const invST = 1.0 / c.sigmaTail;

    for (let i = 0; i < n; i++) {
      const d = Math.abs(i - centerIdx) / centerIdx; // 0 中心 → 1 邊緣

      // 基線 (子步長插值，144Hz 不跳格)
      const bi = Math.max(0.0, d * (this.halfSize - 1) - stepFrac);
      const i0 = Math.floor(bi);
      const i1 = Math.min(this.halfSize - 1, i0 + 1);
      const baseRaw = this.baseBuffer[i0] * (1.0 - (bi - i0)) + this.baseBuffer[i1] * (bi - i0);
      // 旋律 = 瞬時基線偏離慢速平均的部分，放大 melodyBoost 倍 (閒置/靜音時 baseAvg≈base，不影響)
      const base = Math.max(0.0, this.baseAvg + (baseRaw - this.baseAvg) * c.melodyBoost);

      // 孤立衝擊波：每顆脈衝 = 方向性鐘形包絡，取最大者 (不疊加)
      let extra = 0.0;
      for (let p = 0; p < this.MAX_PULSES; p++) {
        if (!this.pOn[p]) continue;
        const front = this.pFront[p];
        const u = d - front;
        const q = (u >= 0.0 ? u * invSF : -u * invST);
        const env = Math.exp(-q * q);
        if (env < 0.003) continue;
        // 起音：1-exp(-rate*age)；行進衰減：到邊緣剩 (1-travelDecay)；離場淡出
        const att = 1.0 - Math.exp(-c.attackRate * this.pAge[p]);
        const travel = 1.0 - c.travelDecay * Math.max(0.0, Math.min(1.0, (front - 0.25) / 0.75));
        const leave = front > 0.9 ? Math.exp(-(front - 0.9) * 3.0) : 1.0;
        const peak = this.pPeak[p] * att * travel * leave;
        // v1.1.1：減 baseAvg 而非瞬時 base，旋律起伏 (base - baseAvg) 不會被脈衝抹平
        const e2 = (peak - this.baseAvg) * env;
        if (e2 > extra) extra = e2;
      }

      // 軟膝限幅：旋律疊在浪頭上時，頂端不超過 ~87%，視覺維持 v1.1.0 的 84% 爆發力
      let hh = base + extra;
      const knee = 0.80 * h;
      if (hh > knee) hh = knee + (hh - knee) * 0.35;
      hh = Math.min(maxH, hh);
      xs[i] = (i / (n - 1)) * w;
      ys[i] = h - hh;
    }

    // ── 繪製 (單層：填色 + 波峰亮線) ─────────────────────────────
    const drawSpline = (close) => {
      ctx.beginPath();
      if (close) {
        ctx.moveTo(0, h);
        ctx.lineTo(xs[0], ys[0]);
      } else {
        ctx.moveTo(xs[0], ys[0]);
      }
      for (let i = 0; i < n - 1; i++) {
        const midX = (xs[i] + xs[i + 1]) * 0.5;
        const midY = (ys[i] + ys[i + 1]) * 0.5;
        ctx.quadraticCurveTo(xs[i], ys[i], midX, midY);
      }
      ctx.lineTo(xs[n - 1], ys[n - 1]);
      if (close) {
        ctx.lineTo(w, h);
        ctx.closePath();
      }
    };

    drawSpline(true);
    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${foreAlpha})`);
    grad.addColorStop(1, `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 40)}, ${Math.min(255, b + 40)}, ${crestAlpha})`);
    ctx.fillStyle = grad;
    ctx.fill();

    drawSpline(false);
    ctx.strokeStyle = `rgba(255, 255, 255, ${activeMovement ? 0.55 : 0.15})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.restore();
    this.lastRenderMs = performance.now() - t0;
  }
}

window.WaveEngine = WaveEngine;
