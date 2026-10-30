import asyncio, threading, time, sys, numpy as np
src = open(sys.argv[1], encoding='utf-8').read()
# 只抽出 sender 與 analyze 區段來測
a = src.index('audio_state = {"bass"'); b = src.index('def open_settings_process')
c = src.index('_SR = 44100'); d = src.index('def audio_capture_worker')
ns = {'np': np, 'asyncio': asyncio, 'time': time}
exec(src[a:b], ns); exec(src[c:d], ns)

class FakeWS:
    def __init__(s, delay): s.got=[]; s.delay=delay
    async def send(s, m): await asyncio.sleep(s.delay); s.got.append(m)

loop = asyncio.new_event_loop()
threading.Thread(target=loop.run_forever, daemon=True).start()
ns['_ws_loop'] = loop
fast, slow = FakeWS(0), FakeWS(0.05)     # 慢客戶端 50ms/封包
ns['display_sockets'].update([fast, slow])
t0=time.perf_counter(); sent=0
while time.perf_counter()-t0 < 1.0:      # 以 ~86Hz 推 1 秒
    sent+=1; ns['push_audio_ws'](sent/1000, 0.5, 0.2, 0.1); time.sleep(0.0116)
time.sleep(0.2)
print(f"推送 {sent} 筆 → 快客戶端收到 {len(fast.got)}，慢客戶端(50ms/筆)收到 {len(slow.got)}；最後一筆={slow.got[-1]}")
print("sender 結束後旗標 =", ns['_audio_sender_running'])

ring = (np.random.default_rng(0).normal(0,0.1,2048)).astype(np.float32)
t=time.perf_counter()
for _ in range(2000): ns['analyze_block'](ring)
print(f"analyze_block 平均 {(time.perf_counter()-t)/2000*1e6:.0f} µs / 區塊 (每 11.6ms 一次 → CPU ≈ {(time.perf_counter()-t)/2000/0.0116*100:.2f}% 單核)")
