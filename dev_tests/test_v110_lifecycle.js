/*
 * v1.1.0 前端生命週期回歸測試（不需 Windows、WebView2 或 npm 套件）
 * 執行：node dev_tests/test_v110_lifecycle.js
 * 使用輕量 DOM / WaveEngine / LyricsEngine mock 驗證狀態轉換和文字清理。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...xs) { xs.forEach(x => this.values.add(x)); }
  remove(...xs) { xs.forEach(x => this.values.delete(x)); }
  contains(x) { return this.values.has(x); }
  toggle(x, force) {
    const on = force === undefined ? !this.values.has(x) : !!force;
    if (on) this.values.add(x); else this.values.delete(x);
    return on;
  }
}
class FakeElement {
  constructor(id) {
    this.id = id; this.classList = new FakeClassList(); this.style = {
      display: '', opacity: '', setProperty() {}, removeProperty() {}
    };
    this.textContent = ''; this.src = ''; this.clientWidth = 550; this.scrollWidth = 100;
    this.listeners = {};
  }
  addEventListener(n, fn) { this.listeners[n] = fn; }
  removeAttribute(name) { if (name === 'src') this.src = ''; }
  setAttribute(name, value) { this[name] = value; }
}
const elements = new Map();
const document = {
  addEventListener(name, cb) { if (name === 'DOMContentLoaded') cb(); },
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  }
};
class FakeWaveEngine {
  constructor() { this.isStandby = false; this.calls = {standby: [], playing: [], audio: 0, render: 0}; this.lastRenderMs = 0; this.lyrics = []; FakeWaveEngine.latest = this; }
  setStandby(v) { this.isStandby = !!v; this.calls.standby.push(!!v); }
  setPlaying(v) { this.calls.playing.push(!!v); }
  updateAudio() { this.calls.audio++; }
  render() { this.calls.render++; }
  setStyle() {}
  setGain() {}
  resize() {}
}
class FakeLyricsEngine {
  constructor() { this.lyrics = []; }
  setTrack(track) { this.lastTrack = track; this.calls = (this.calls || 0) + 1; }
  reset() { this.lyrics = []; this.didReset = (this.didReset || 0) + 1; }
}
class FakeWebSocket {
  static OPEN = 1;
  constructor() { this.readyState = 0; this.sent = []; }
  send(v) { this.sent.push(v); }
  close() {}
}
const window = { addEventListener() {}, S2TConverter: null };
let nextRafId = 1;
const pendingRafs = new Map();
const sandbox = {
  window, document, WaveEngine: FakeWaveEngine, LyricsEngine: FakeLyricsEngine,
  WebSocket: FakeWebSocket,
  performance,
  requestAnimationFrame: cb => { const id = nextRafId++; pendingRafs.set(id, cb); return id; },
  cancelAnimationFrame: id => pendingRafs.delete(id),
  setTimeout, clearTimeout,
  console,
  Number, Math, JSON, Date, String, parseInt, isNaN,
};
vm.createContext(sandbox);
const source = fs.readFileSync(path.join(__dirname, '../ui/js/app.js'), 'utf8');
vm.runInContext(source, sandbox, {filename: 'app.js'});
const capsule = elements.get('capsuleRoot');
const activeLyric = elements.get('activeLyric');
const marquee = elements.get('trackMarqueeText');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function run() {
  window.initConfig({ silence_timeout_seconds: 1, audio_active_threshold: 0.25, audio_confirm_ms: 300 });
  assert(capsule.classList.contains('is-standby'), 'initial state should be standby');
  assert.strictEqual(activeLyric.textContent, '', 'initial copy must be clean');

  // Generic system audio takes >300ms continuous energy before waking.
  const audioLoop = setInterval(() => window.updateAudioLevels(0.1, 0.45, 0.4, 0.3), 25);
  await wait(420);
  clearInterval(audioLoop);
  assert(capsule.classList.contains('is-pure-audio'), 'audio without playing SMTC metadata should enter pure_audio');
  assert.strictEqual(activeLyric.textContent, '偵測到系統音訊', 'pure audio label should be visible');
  assert(!capsule.classList.contains('is-standby'), 'pure audio should wake capsule');

  // A legitimate, playing GSMTC track takes priority over pure audio.
  window.updateTrackInfo({title: 'Test Song', artist: 'Test Artist', album: '', isPlaying: true, duration: 180, seek: 0});
  assert(!capsule.classList.contains('is-pure-audio'), 'valid playing metadata should override pure audio');
  assert.strictEqual(marquee.textContent, 'Test Song', 'track title only should be displayed without artist prefix');
  // Run one-shot layout callbacks (e.g. marquee width measurement), but leave appLoop pending.
  for (const [id, cb] of [...pendingRafs.entries()]) {
    if (cb.name !== 'appLoop') { pendingRafs.delete(id); cb(performance.now()); }
  }

  // Pause/stop the media session, then stop audio; watchdog should fade and clear old strings.
  window.updateTrackInfo({title: 'Test Song', artist: 'Test Artist', album: '', isPlaying: false, duration: 180, seek: null});
  window.updateAudioLevels(0, 0, 0, 0);
  await wait(1700);
  assert(capsule.classList.contains('is-standby'), 'silence timeout should enter standby');
  assert.strictEqual(activeLyric.textContent, '', 'standby should clear old lyric text');
  assert.strictEqual(marquee.textContent, '', 'standby should clear old title text');
  assert(FakeWaveEngine.latest.calls.standby.at(-1) === true, 'wave engine should enter true standby');
  assert.strictEqual(pendingRafs.size, 0, 'standby should cancel the pending animation frame');
  console.log('PASS initial transparent standby and clean content');
  console.log('PASS sustained audio fallback and generic label');
  console.log('PASS GSMTC metadata priority');
  console.log('PASS silence timeout clears text and enters standby');
  process.exit(0);
}
run().catch(err => { console.error(err); process.exitCode = 1; });
