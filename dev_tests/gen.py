import re, sys, json, numpy as np
src = open(sys.argv[1], encoding='utf-8').read()
a = src.index('_SR = 44100'); b = src.index('def audio_capture_worker')
ns = {'np': np}
exec(src[a:b], ns)
SR, HOP, N = 44100, 512, 2048
rng = np.random.default_rng(1)

def kick(t, f0=60):  # 808-ish kick: pitch drop + decay
    return np.sin(2*np.pi*(f0*t + 40*(1-np.exp(-t*30))/30*0 )*t) * np.exp(-t*9)

def synth(kind, dur=8.0):
    n = int(dur*SR); t = np.arange(n)/SR; x = np.zeros(n, np.float32)
    if kind == 'rapid':                                   # 16 分音符 808 連打 (140BPM)
        for k in np.arange(0.2, dur, 0.107):
            i = int(k*SR); m = min(n-i, int(0.2*SR)); tt = np.arange(m)/SR
            x[i:i+m] += 0.7*np.sin(2*np.pi*(50*tt))*np.exp(-tt*14)
    if kind in ('kicks', 'full'):
        for k in np.arange(0.2, dur, 0.5):            # 120 BPM four-on-floor
            i = int(k*SR); m = min(n-i, int(0.4*SR)); tt = np.arange(m)/SR
            x[i:i+m] += 0.7*np.sin(2*np.pi*(55*tt + 90*(1-np.exp(-tt*40))/40))*np.exp(-tt*10)
    if kind in ('vocal', 'full'):
        env = 0.5+0.5*np.sin(2*np.pi*0.7*t)
        for h, a in ((1,0.12),(2,0.08),(3,0.06),(5,0.03)):
            x += (a*env*np.sin(2*np.pi*330*h*t)).astype(np.float32)
    if kind == 'full':
        hat = rng.normal(0, 0.03, n).astype(np.float32)
        gate = ((t*8) % 1 < 0.15).astype(np.float32); x += hat*gate
    if kind == 'sustained_loud':                         # 持續高響度低音+全頻 (舊版會一直=1.0)
        x += 0.5*np.sin(2*np.pi*70*t) + 0.2*np.sin(2*np.pi*500*t) + rng.normal(0,0.1,n).astype(np.float32)
    return np.clip(x, -1, 1)

out = {}
for kind in ('kicks', 'vocal', 'full', 'rapid', 'sustained_loud'):
    x = synth(kind); ring = np.zeros(N, np.float32); rows = []
    for bi in range(len(x)//HOP):
        blk = x[bi*HOP:(bi+1)*HOP]; ring[:-HOP] = ring[HOP:]; ring[-HOP:] = blk
        bass, energy, mid, high = ns['analyze_block'](ring)
        rows.append([round(bi*HOP/SR,4), round(bass,3), round(energy,3), round(mid,3), round(high,3)])
    out[kind] = rows
json.dump(out, open(sys.argv[2], 'w'))
for k, r in out.items():
    a = np.array(r)[:, 1:]
    print(f"{k:15s} bass[min/mean/max]={a[:,0].min():.2f}/{a[:,0].mean():.2f}/{a[:,0].max():.2f}  energy mean={a[:,1].mean():.2f}  mid mean={a[:,2].mean():.2f}  high mean={a[:,3].mean():.2f}")
