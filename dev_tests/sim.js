const fs = require('fs');
let simT = 0;
global.performance = { now: () => simT * 1000 };
const ctxStub = new Proxy({}, { get: (t, k) => (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
global.document = { getElementById: () => ({ getContext: () => ctxStub, clientWidth: 640, clientHeight: 44, width: 0, height: 0 }) };
global.window = { devicePixelRatio: 1.5, addEventListener() {} };
eval(fs.readFileSync(process.argv[2], 'utf8') + '\nglobal.WaveEngine = WaveEngine;');

const series = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const gain = +process.argv[4] || 2.2;
function run(name, rows, opts = {}) {
  simT = 0;
  const eng = new WaveEngine('x'); eng.setGain(gain);
  const H = eng.height, n = eng.totalPoints, c = eng.halfSize - 1;
  let ai = 0, frames = 0, multi = 0, multi2 = 0, peakMax = 0, baseSum = 0, baseN = 0, pulses = 0, prevPulseSet = 0;
  const peakPerHit = [];
  const dt = 1 / 144;
  for (; simT < 8; simT += dt) {
    while (ai < rows.length && rows[ai][0] <= simT) {
      const r = rows[ai++];
      eng.updateAudio(r[1], r[2], true, opts.noMid ? undefined : r[3], opts.noMid ? undefined : r[4]);
    }
    eng.render(dt);
    if (simT < 1.0) continue;                 // warm-up
    frames++;
    // right-half profile (heights in px)
    const ys = eng.ys; const hs = []; for (let i = c; i < n; i++) hs.push(H - ys[i]);
    // count prominent peaks (prominence >= 4px) on right half
    let peaks = 0;
    for (let i = 1; i < hs.length - 1; i++) {
      if (hs[i] > hs[i - 1] && hs[i] >= hs[i + 1]) {
        let l = hs[i], r2 = hs[i];
        for (let j = i - 1; j >= 0; j--) l = Math.min(l, hs[j]);
        for (let j = i + 1; j < hs.length; j++) r2 = Math.min(r2, hs[j]);
        if (hs[i] - Math.max(l, r2) >= 4) peaks++;
      }
    }
    // center-origin crest at front counts as a peak at index 0
    if (hs[0] > hs[1] && hs[0] - Math.min(...hs) >= 4) peaks++;
    if (peaks >= 2) multi++;
    // v1.1.1 追加：合併「谷深 < 2px」的相鄰峰 (視覺上同一座浪頭的 1px 抖動不算碎波)
    {
      const idx = [];
      for (let i = 0; i < hs.length; i++) {
        const lft = i === 0 ? -1e9 : hs[i - 1], rgt = i === hs.length - 1 ? -1e9 : hs[i + 1];
        if (hs[i] > lft && hs[i] >= rgt) idx.push(i);
      }
      const kept = [];
      for (const i of idx) {
        if (kept.length) {
          const j = kept[kept.length - 1];
          let tr = 1e9; for (let k = j; k <= i; k++) tr = Math.min(tr, hs[k]);
          if (Math.min(hs[i], hs[j]) - tr < 2) { if (hs[i] > hs[j]) kept[kept.length - 1] = i; continue; }
        }
        kept.push(i);
      }
      // 只計「離地 >= 4px」的峰
      const mn = Math.min(...hs);
      if (kept.filter(i => hs[i] - mn >= 4).length >= 2) multi2++;
    }
    const mx = Math.max(...hs); peakMax = Math.max(peakMax, mx);
    const act = eng.pOn.reduce((a, b) => a + b, 0);
    if (act === 0) { baseSum += hs[0]; baseN++; }
  }
  console.log(`${name.padEnd(22)} frames=${frames} 多峰幀=${(100 * multi / frames).toFixed(1)}% 真碎波(谷深≥2px)=${(100 * multi2 / frames).toFixed(1)}%  最高=${(100 * peakMax / H).toFixed(0)}%  無脈衝時基線=${baseN ? (100 * baseSum / baseN / H).toFixed(0) + '%' : '-'}`);
}
for (const k of Object.keys(series)) run(k, series[k]);
// v1 failure mode: saturated 1.0 / 1.0 input
const sat = []; for (let t = 0; t < 8; t += 0.0116) sat.push([t, 1, 1, 1, 1]);
run('飽和輸入(v1 log 情境)', sat);
// old backend without mid/high
run('舊後端(無 mid/high)', series.full, { noMid: true });
// silence
const sil = []; for (let t = 0; t < 8; t += 0.1) sil.push([t, 0, 0, 0, 0]);
run('靜音', sil);
