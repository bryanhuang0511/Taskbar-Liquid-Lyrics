# -*- mode: python ; coding: utf-8 -*-
# onedir 版：不再於每次啟動解壓到 %TEMP%\_MEIxxxx，避免 ClrLoader.dll 在 Temp 載入失敗 (0x7e)。
# 產出：dist\TaskbarLiquidLyrics\TaskbarLiquidLyrics.exe + _internal\
import os
from PyInstaller.utils.hooks import collect_all

datas = [('ui', 'ui'), ('assets/app.ico', 'assets'), ('assets/app_256.png', 'assets')]   # v1.1.1：新圖示
binaries = []
hiddenimports = []

# 套件整包收集 (含原生 DLL)。缺哪個就略過，但會在 build 輸出中印出，方便診斷。
for pkg in ('clr_loader', 'pythonnet', 'webview', 'winrt', 'websockets', 'soundcard', 'cffi'):
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
        print(f'[spec] collect_all({pkg}): datas={len(d)} binaries={len(b)} hidden={len(h)}')
    except Exception as e:
        print(f'[spec] WARNING collect_all({pkg}) failed: {e}')

# 保險：ClrLoader.dll 及其所在資料夾 (amd64 / x86) 一律以原目錄結構放進 _internal\clr_loader\ffi\dlls
try:
    import clr_loader
    _dlls = os.path.join(os.path.dirname(clr_loader.__file__), 'ffi', 'dlls')
    if os.path.isdir(_dlls):
        datas.append((_dlls, os.path.join('clr_loader', 'ffi', 'dlls')))
        print(f'[spec] added clr_loader dlls dir: {_dlls}')
except Exception as e:
    print(f'[spec] WARNING clr_loader dlls not added: {e}')

# 保險：把 Microsoft C++ 執行階段 DLL 一併放進根目錄 (ClrLoader.dll 若相依 msvcp140 之類，
# PyInstaller 不一定會自動分析到，因為它是 C 擴充以外的資料檔)。這些是 Microsoft 允許再散佈的檔案。
_sys32 = os.path.join(os.environ.get('SystemRoot', r'C:\Windows'), 'System32')
for _name in ('msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll', 'vcruntime140.dll',
              'vcruntime140_1.dll', 'concrt140.dll'):
    _p = os.path.join(_sys32, _name)
    if os.path.isfile(_p):
        binaries.append((_p, '.'))
        print(f'[spec] bundling VC runtime: {_name}')

hiddenimports += [
    'clr_loader', 'pythonnet', 'cffi', 'clr', 'System', 'System.Drawing', 'System.Windows.Forms',
    'winrt.windows.media.control', 'winrt.windows.foundation', 'winrt.runtime',
    'winrt.windows.foundation.collections', 'winrt.windows.storage.streams',
]

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,       # onedir
    name='TaskbarLiquidLyrics',
    icon='assets/app.ico',       # v1.1.1：exe 本身 / 桌面捷徑 / 工作列 / 工作管理員 使用的圖示
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,                   # UPX 會弄壞部分 DLL，務必關閉
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name='TaskbarLiquidLyrics',
)
