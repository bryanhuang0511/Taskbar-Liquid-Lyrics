// v1.1.1 旋律可見度：同一首歌，比較「真實中高音」與「中高音凍結成常數」兩次渲染的波形差。
// 差越大 = 旋律越看得見。分別統計「脈衝進行中」與「無脈衝」的畫面。比值越接近 1 = 低音沒有吞沒旋律。
const fs = require('fs');
let simT = 0;
global.performance = { now: () => simT * 1000 };
const ctxStub = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
global.document = { getElementById: () => ({ getContext: () => ctxStub, clientWidth: 640, clientHeight: 44, width: 0, height: 0 }) };
global.window = { devicePixelRatio: 1.5, addEventListener() {} };
eval(fs.readFileSync(process.argv[2], 'utf8') + '\nglobal.WaveEngine = WaveEngine;');
const series = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const rows = series[process.argv[4] || 'full'];
const mAll = rows.map(r => r[3]), hAll = rows.map(r => r[4]);
const meanMid = mAll.reduce((a, b) => a + b, 0) / mAll.length, meanHigh = hAll.reduce((a, b) => a + b, 0) / hAll.length;
function run(freeze) {
  simT = 0;
  const eng = new WaveEngine('x'); eng.setGain(2.2);
  const n = eng.totalPoints, H = eng.height, dt = 1 / 144, out = [];
  let ai = 0;
  for (; simT < 8; simT += dt) {
    while (ai < rows.length && rows[ai][0] <= simT) {
      const r = rows[ai++];
      eng.updateAudio(r[1], r[2], true, freeze ? meanMid : r[3], freeze ? meanHigh : r[4]);
    }
    eng.render(dt);
    if (simT < 1.5) continue;
    out.push({ ys: Array.from(eng.ys), pulse: eng.pOn.some(v => v) });
  }
  return { out, H, n };
}
const a = run(false), b = run(true);
let sumP = 0, nP = 0, sumQ = 0, nQ = 0, multi = 0, maxH = 0;
for (let f = 0; f < a.out.length; f++) {
  let d = 0, cnt = 0;
  for (let i = 0; i < a.n; i++) { d += Math.abs(a.out[f].ys[i] - b.out[f].ys[i]); cnt++; maxH = Math.max(maxH, a.H - a.out[f].ys[i]); }
  d /= cnt;
  if (a.out[f].pulse) { sumP += d; nP++; } else { sumQ += d; nQ++; }
}
const P = nP ? sumP / nP : 0, Q = nQ ? sumQ / nQ : 0;
console.log(`melody visibility  脈衝中=${P.toFixed(2)}px  無脈衝=${Q.toFixed(2)}px  比值=${Q ? (P / Q).toFixed(2) : '-'}  (1.0 = 旋律不受低音影響)  最高=${(100 * maxH / a.H).toFixed(0)}%`);
