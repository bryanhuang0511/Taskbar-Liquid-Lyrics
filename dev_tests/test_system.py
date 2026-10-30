"""v1.1.1 開機自啟 / 桌面捷徑邏輯測試 (不需 Windows：以假的 winreg 與 subprocess 驗證)。
用法: python3 -I test_system.py ../main.py"""
import sys, types, os, logging, subprocess, tempfile
src = open(sys.argv[1], encoding='utf-8').read()
a = src.index('_RUN_KEY = '); b = src.index('_save_timer = None')

# ---- fake winreg ----
store = {}
class Key:
    def __init__(s, path): s.path = path
    def __enter__(s): return s
    def __exit__(s, *x): return False
fw = types.ModuleType('winreg')
fw.HKEY_CURRENT_USER = 'HKCU'; fw.KEY_READ = 1; fw.KEY_SET_VALUE = 2; fw.REG_SZ = 1
def OpenKey(h, p, r=0, acc=1):
    if not any(k[0] == p for k in store) and p.endswith('Run') and 'Approved' not in p and 'RUNKEY_MISSING' in os.environ: raise FileNotFoundError
    return Key(p)
def CreateKeyEx(h, p, r=0, acc=2): return Key(p)
def SetValueEx(k, n, r, t, v): store[(k.path, n)] = v
def QueryValueEx(k, n):
    if (k.path, n) not in store: raise FileNotFoundError(n)
    return store[(k.path, n)], 1
def DeleteValue(k, n):
    if (k.path, n) not in store: raise FileNotFoundError(n)
    del store[(k.path, n)]
for n, f in dict(OpenKey=OpenKey, CreateKeyEx=CreateKeyEx, SetValueEx=SetValueEx, QueryValueEx=QueryValueEx, DeleteValue=DeleteValue).items(): setattr(fw, n, f)
sys.modules['winreg'] = fw

calls = []
class R: returncode = 0; stderr = b''
tmp = tempfile.mkdtemp()
def fake_run(cmd, **kw):
    calls.append((cmd, kw))
    open(kw['env']['TLL_LNK'], 'wb').write(b'lnk')   # 模擬 PowerShell 建立檔案
    return R()
ns = dict(os=os, sys=sys, logging=logging, subprocess=types.SimpleNamespace(run=fake_run), ctypes=types.SimpleNamespace(),
          BASE_DIR=r'C:\Apps\TLL', BUNDLE_DIR='x', ICON_PATH=r'C:\Apps\TLL\assets\app.ico',
          APP_VERSION='1.2.0', APP_NAME='TaskbarLiquidLyrics', APP_DISPLAY_NAME='工作列液態玻璃歌詞器')
exec(src[a:b], ns)
ns['desktop_dir'] = lambda: tmp
sys.frozen = True; sys.executable = r'C:\Apps\TLL\TaskbarLiquidLyrics.exe'

RUN = ns['_RUN_KEY']; APP = ns['_APPROVED_KEY']
ok = lambda c, m: print(('PASS ' if c else 'FAIL ') + m) or (None if c else sys.exit(1))

ok(ns['_autostart_command']() == r'"C:\Apps\TLL\TaskbarLiquidLyrics.exe" --autostart', 'autostart command quoted + --autostart')
ok(ns['is_autostart_enabled']() is False, 'initially disabled')
ns['set_autostart'](True)
ok(ns['is_autostart_enabled']() is True, 'enabled after set_autostart(True)')
store[(APP, 'TaskbarLiquidLyrics')] = bytes([3, 0, 0, 0])      # 使用者在工作管理員停用
ok(ns['is_autostart_enabled']() is False, 'respects Task Manager disabled flag (03)')
ns['set_autostart'](True)
ok((APP, 'TaskbarLiquidLyrics') not in store and ns['is_autostart_enabled']() is True, 're-enable clears disabled flag')
store[(RUN, 'TaskbarLiquidLyrics')] = r'"D:\old\TaskbarLiquidLyrics.exe" --autostart'
ns['refresh_autostart_path']()
ok(store[(RUN, 'TaskbarLiquidLyrics')] == ns['_autostart_command'](), 'refresh_autostart_path repairs moved exe')
ns['set_autostart'](False)
ok(ns['is_autostart_enabled']() is False, 'disabled after set_autostart(False)')
ok(ns['set_autostart'](False) is True, 'disable twice is harmless')

ok(ns['desktop_shortcut_exists']() is False, 'no shortcut initially')
ok(ns['create_desktop_shortcut']() is True and ns['desktop_shortcut_exists'](), 'create shortcut')
env = calls[-1][1]['env']; cmd = calls[-1][0]
ok(env['TLL_TARGET'] == sys.executable and env['TLL_ARGS'] == '' and env['TLL_ICON'].endswith('app.ico,0'), 'shortcut target/icon env')
ok(cmd[0] == 'powershell.exe' and '-NoProfile' in cmd and calls[-1][1]['creationflags'] == 0x08000000, 'powershell hidden, no profile')
ok(env['TLL_LNK'].endswith('工作列液態玻璃歌詞器.lnk'), 'unicode shortcut name')
ok(ns['remove_desktop_shortcut']() and not ns['desktop_shortcut_exists'](), 'remove shortcut')
ns['set_autostart'](True)
st = ns['system_state']()
ok(st == {'cmd': 'system', 'autostart': True, 'shortcut': False, 'version': '1.2.0'}, f'system_state {st}')
print('ALL PASS')
