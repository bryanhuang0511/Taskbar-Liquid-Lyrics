"""
============================================================================
🧊 Taskbar Liquid Lyrics - Standalone Executable Host (Robust Route A Edition)
============================================================================
Refined with expert Win32 / WebView2 architecture:
1. os.environ["WEBVIEW2_DEFAULT_BACKGROUND_COLOR"] = "00000000" before webview import
2. Per-monitor DPI awareness (SetProcessDpiAwareness(2))
3. Full diagnostic logging to tll.log (Zero silent exceptions)
4. Safe Single-Instance Mutex (bypasses when --settings is present)
5. DPI-aware Win32 capsule region clipping via GetWindowRect actual physical pixels
6. All WinForms / NotifyIcon operations dispatched strictly onto UI thread via form.Invoke(Action(on_ui))
7. Solid Route A obsidian base: crisp per-pixel capsule geometry, zero color-key fringing
============================================================================
"""

import os
import sys
import json
import time
import re
import ctypes
from ctypes import wintypes
import logging
import warnings
import threading
import subprocess
import numpy as np

# 1. 讓 WebView2 預設背景為純透明（必須在 import webview 前設定）
os.environ["WEBVIEW2_DEFAULT_BACKGROUND_COLOR"] = "00000000"
# Keep WebView2 rendering active when Windows temporarily occludes the top-level window.
# These switches are defensive hints; they do not replace the transparency reapply path.
_existing_wv_args = os.environ.get("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "").strip()
_tll_wv_args = "--disable-backgrounding-occluded-windows --disable-renderer-backgrounding"
os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (
    (_existing_wv_args + " " + _tll_wv_args).strip()
)

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)  # Per-monitor DPI Aware
except Exception:
    pass

# 2. 確定執行目錄與日誌設定
if getattr(sys, "frozen", False):
    BUNDLE_DIR = sys._MEIPASS
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BUNDLE_DIR = os.path.dirname(os.path.abspath(__file__))
    BASE_DIR = BUNDLE_DIR

LOG_FILE = os.path.join(BASE_DIR, "tll.log")
# v2: 原本 root logger 為 DEBUG，websockets 套件會把「每一筆」音訊封包都寫進 tll.log
# (約 86 行/秒、數百 MB/天)。改成 INFO + 輪替檔案，並把 websockets/asyncio 壓到 WARNING。
from logging.handlers import RotatingFileHandler
_log_handler = RotatingFileHandler(LOG_FILE, maxBytes=1_000_000, backupCount=2, encoding="utf-8")
_log_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logging.basicConfig(level=logging.INFO, handlers=[_log_handler])
for _noisy in ("websockets", "websockets.server", "websockets.client", "asyncio"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)
sys.excepthook = lambda t, v, tb: logging.critical("UNCAUGHT FATAL EXCEPTION", exc_info=(t, v, tb))

logging.info("TaskbarLiquidLyrics starting up...")


def _preflight_clr():
    """打包版專用：在 pywebview 載入 pythonnet 之前，先明確預載 ClrLoader.dll。
    - 把 DLL 所在資料夾加進 DLL 搜尋路徑，並用 ctypes.WinDLL 預載 (會搜尋 DLL 自己的資料夾找相依檔)。
    - 失敗時把真正的 Windows 錯誤碼寫進 tll.log (126=缺相依 DLL, 193=位元數不符, 5=被拒絕/被防毒攔截)。
    - 預載成功後，clr_loader 之後用 cffi 載入同一路徑時會直接取得已載入的模組。"""
    if not getattr(sys, "frozen", False):
        return
    try:
        arch = "amd64" if sys.maxsize > 2 ** 32 else "x86"
        dll_dir = os.path.join(sys._MEIPASS, "clr_loader", "ffi", "dlls", arch)
        dll = os.path.join(dll_dir, "ClrLoader.dll")
        exists = os.path.isfile(dll)
        logging.info(f"[clr preflight] MEIPASS={sys._MEIPASS}")
        logging.info(f"[clr preflight] ClrLoader exists={exists} path={dll}")
        if os.path.isdir(dll_dir):
            logging.info(f"[clr preflight] files in dll dir: {os.listdir(dll_dir)}")
        for d in (dll_dir, sys._MEIPASS):
            if os.path.isdir(d):
                try:
                    os.add_dll_directory(d)
                except Exception:
                    pass
        os.environ["PATH"] = os.pathsep.join([dll_dir, sys._MEIPASS, os.environ.get("PATH", "")])
        if exists:
            ctypes.WinDLL(dll)
            logging.info("[clr preflight] ClrLoader.dll preloaded OK")
    except OSError as e:
        logging.error(f"[clr preflight] preload FAILED winerror={getattr(e, 'winerror', None)}: {e}")
    except Exception:
        logging.exception("[clr preflight] unexpected error")


_preflight_clr()


def _fatal_box(msg):
    """windowed (console=False) 的 exe 啟動失敗時不會有任何畫面；跳出一個對話框指向 log。"""
    try:
        ctypes.windll.user32.MessageBoxW(0, f"{msg}\n\n詳細錯誤請看：\n{LOG_FILE}", "TaskbarLiquidLyrics", 0x10)
    except Exception:
        pass


import webview

CONFIG_FILE = os.path.join(BASE_DIR, "config.json")

# UI HTML 路徑
if os.path.isfile(os.path.join(BASE_DIR, "ui", "index.html")):
    UI_DIR = os.path.join(BASE_DIR, "ui")
else:
    UI_DIR = os.path.join(BUNDLE_DIR, "ui")

local_html = os.path.join(UI_DIR, "index.html")
UI_URL = "file:///" + local_html.replace("\\", "/")
settings_html = os.path.join(UI_DIR, "settings.html")
SETTINGS_URL = "file:///" + settings_html.replace("\\", "/")

APP_VERSION = "1.2.0"
APP_NAME = "TaskbarLiquidLyrics"
APP_DISPLAY_NAME = "工作列液態玻璃歌詞器"


def _find_asset(*parts):
    """先找 exe 旁邊 (可自行替換)，再找打包內建的 assets。"""
    for root in (BASE_DIR, BUNDLE_DIR):
        p = os.path.join(root, *parts)
        if os.path.isfile(p):
            return p
    return None


ICON_PATH = _find_asset("assets", "app.ico")

# 使用「私有」的 DLL 實例。ctypes.windll.xxx 是全行程共用的單例，在上面設定 argtypes 會污染
# pywebview / pythonnet 內部的 Win32 呼叫 (曾導致設定視窗啟動時 LP_MARGINS 型別衝突而崩潰)。
user32 = ctypes.WinDLL("user32")
dwmapi = ctypes.WinDLL("dwmapi")
gdi32 = ctypes.WinDLL("gdi32")

_main_hwnd = None
_main_form = None
_active_cfg = None
_standby_os_hidden = False
_latest_lyrics_status = {}
_tray_icon = None
_app_mutex = None

user32.SetWindowRgn.argtypes = [wintypes.HWND, ctypes.c_void_p, wintypes.BOOL]
gdi32.CreateRoundRectRgn.restype = ctypes.c_void_p
gdi32.CreateRoundRectRgn.argtypes = [ctypes.c_int] * 6
gdi32.CreateRectRgn.restype = ctypes.c_void_p
gdi32.GetRgnBox.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.RECT)]
gdi32.DeleteObject.argtypes = [ctypes.c_void_p]
user32.GetWindowRgn.argtypes = [wintypes.HWND, ctypes.c_void_p]
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]

_EnumChildProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)

def apply_capsule_region(hwnd):
    """對主視窗以及它底下所有子 HWND (含 WebView2 的 Chrome_WidgetWin_*) 套用膠囊 Region。
    子視窗的 Region 以自己的左上角為原點，所以用各自的實際大小建立。"""
    try:
        rect = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rect))
        pw = rect.right - rect.left
        ph = rect.bottom - rect.top
        if pw <= 0 or ph <= 0:
            return

        def _apply(h, w, hgt):
            hrgn = gdi32.CreateRoundRectRgn(0, 0, w + 1, hgt + 1, ph, ph)  # 半徑一律用主視窗高度 = 膠囊
            user32.SetWindowRgn(h, hrgn, True)  # 成功後 Region 歸系統所有，不可再 DeleteObject

        _apply(hwnd, pw, ph)

        count = [0]
        def _child(h, lparam):
            r = wintypes.RECT()
            user32.GetWindowRect(h, ctypes.byref(r))
            cw, chh = r.right - r.left, r.bottom - r.top
            if cw > 0 and chh > 0:
                _apply(h, cw, chh)
                count[0] += 1
            return True
        user32.EnumChildWindows(hwnd, _EnumChildProc(_child), 0)
        logging.debug(f"Applied capsule region: main {pw}x{ph}, children={count[0]}")
    except Exception:
        logging.exception("apply_capsule_region failed")

# ---------------------------------------------------------------------------
# 真・每像素 Alpha 去背 (Tauri / wry / winit 在 Windows 上使用的同一套做法)
#   1. 視窗不使用 TransparencyKey 色鍵，也不使用 Region
#   2. Form.BackColor = 黑 (配合 DWM，黑色視為 alpha 0)
#   3. WebView2 DefaultBackgroundColor = Transparent (alpha 0)
#   4. DwmEnableBlurBehindWindow(ENABLE | BLURREGION, 空區域) 讓 DWM 依 alpha 合成，但不做模糊
#   5. 不可關閉 NC rendering (DWMNCRP_DISABLED 會讓上述失效)
# ALPHA_MODE = "dwm"(預設) 走上述路線；"region" 回到舊的 SetWindowRgn 路線
# ---------------------------------------------------------------------------
ALPHA_MODE = "dwm"

CAPSULE_H = 44   # 膠囊高度 (CSS px)
PAD = 4          # 視窗四周透明邊 (CSS px)，必須與 style.css 的 body padding 相同

class MARGINS(ctypes.Structure):
    _fields_ = [("cxLeftWidth", ctypes.c_int), ("cxRightWidth", ctypes.c_int),
                ("cyTopHeight", ctypes.c_int), ("cyBottomHeight", ctypes.c_int)]

class DWM_BLURBEHIND(ctypes.Structure):
    _fields_ = [("dwFlags", wintypes.DWORD), ("fEnable", wintypes.BOOL),
                ("hRgnBlur", ctypes.c_void_p), ("fTransitionOnMaximized", wintypes.BOOL)]

dwmapi.DwmEnableBlurBehindWindow.argtypes = [wintypes.HWND, ctypes.POINTER(DWM_BLURBEHIND)]
dwmapi.DwmExtendFrameIntoClientArea.argtypes = [wintypes.HWND, ctypes.POINTER(MARGINS)]
dwmapi.DwmSetWindowAttribute.argtypes = [wintypes.HWND, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD]

def make_per_pixel_alpha(form, hwnd, tag="", extend_frame=True):
    """必須在 UI 執行緒呼叫 (放進 form.Invoke)。"""
    try:
        import System.Drawing as D
        form.TransparencyKey = D.Color.Empty          # 拿掉色鍵 (pywebview transparent=True 會設)
        form.BackColor = D.Color.Black                # 黑 = alpha 0
        ctrls = []
        for c in form.Controls:
            ctrls.append(c.GetType().Name)
            if hasattr(c, "DefaultBackgroundColor"):
                c.DefaultBackgroundColor = D.Color.Transparent
        hr = {}
        rgn = gdi32.CreateRectRgn(0, 0, -1, -1)       # winit 的做法：空模糊區域，只為啟用 alpha 合成
        bb = DWM_BLURBEHIND(0x1 | 0x2, True, rgn, False)   # DWM_BB_ENABLE | DWM_BB_BLURREGION
        hr["blur"] = dwmapi.DwmEnableBlurBehindWindow(hwnd, ctypes.byref(bb))
        gdi32.DeleteObject(rgn)
        if extend_frame:
            m = MARGINS(-1, -1, -1, -1)
            hr["extend"] = dwmapi.DwmExtendFrameIntoClientArea(hwnd, ctypes.byref(m))
        else:
            # winit / Tauri 的做法：不延伸框架。若邊緣暗暈來自 DWM 陰影，關掉這個即可
            hr["extend"] = "skipped"
        hr["border_none"] = dwmapi.DwmSetWindowAttribute(hwnd, 34, ctypes.byref(ctypes.c_uint(0xFFFFFFFE)), 4)  # DWMWA_BORDER_COLOR = NONE
        hr["backdrop_none"] = dwmapi.DwmSetWindowAttribute(hwnd, 38, ctypes.byref(ctypes.c_int(1)), 4)  # DWMSBT_NONE
        hr["corner_donotround"] = dwmapi.DwmSetWindowAttribute(hwnd, 33, ctypes.byref(ctypes.c_int(1)), 4)
        ex = user32.GetWindowLongW(hwnd, -20)
        logging.info(f"[alpha {tag}] HRESULT={hr} controls={ctrls} "
                     f"TransparencyKey={form.TransparencyKey} BackColor={form.BackColor} "
                     f"exstyle={ex:#x} layered={bool(ex & 0x80000)}")
    except Exception:
        logging.exception("make_per_pixel_alpha failed")

def reapply_transparency(hwnd=None, form=None, tag="watchdog", extend_frame=True):
    """Reassert DWM + WebView2 transparent backgrounds on the WinForms UI thread."""
    hwnd = hwnd or _main_hwnd
    form = form or _main_form
    if not hwnd or form is None:
        return False
    try:
        import System.Drawing as D
        form.TransparencyKey = D.Color.Empty
        form.BackColor = D.Color.Black
        controls = []
        for child in form.Controls:
            controls.append(child)
            if hasattr(child, "DefaultBackgroundColor"):
                child.DefaultBackgroundColor = D.Color.Transparent
        # Reapply to nested WebView2 controls as well.
        for parent in controls:
            try:
                for child in parent.Controls:
                    if hasattr(child, "DefaultBackgroundColor"):
                        child.DefaultBackgroundColor = D.Color.Transparent
            except Exception:
                pass
        make_per_pixel_alpha(form, hwnd, tag, extend_frame)
        # Setting TransparencyKey on WinForms can reset WS_EX_TOPMOST; re-assert behavior.
        try:
            apply_behavior(hwnd, _active_cfg if _active_cfg is not None else load_config())
        except Exception:
            pass
        return True
    except Exception:
        logging.exception("reapply_transparency failed (%s)", tag)
        return False


def dump_window_state(hwnd, tag=""):
    """診斷：把視窗矩形 / Region 狀態 / 擴充樣式 / 子視窗類別寫進 tll.log"""
    try:
        rc = wintypes.RECT(); user32.GetWindowRect(hwnd, ctypes.byref(rc))
        tmp = gdi32.CreateRectRgn(0, 0, 0, 0)
        rtype = user32.GetWindowRgn(hwnd, tmp)  # 0=ERROR(沒有 Region) 1=NULL 2=SIMPLE 3=COMPLEX
        box = wintypes.RECT(); gdi32.GetRgnBox(tmp, ctypes.byref(box))
        gdi32.DeleteObject(tmp)
        ex = user32.GetWindowLongW(hwnd, -20)
        logging.info(f"[{tag}] hwnd={hwnd} IsWindow={user32.IsWindow(hwnd)} "
                     f"rect=({rc.left},{rc.top},{rc.right},{rc.bottom}) size={rc.right-rc.left}x{rc.bottom-rc.top} "
                     f"rgn_type={rtype} rgn_box=({box.left},{box.top},{box.right},{box.bottom}) "
                     f"exstyle={ex:#x} layered={bool(ex & 0x80000)}")
        def _child(h, lparam):
            buf = ctypes.create_unicode_buffer(128)
            user32.GetClassNameW(h, buf, 128)
            r = wintypes.RECT(); user32.GetWindowRect(h, ctypes.byref(r))
            t = gdi32.CreateRectRgn(0, 0, 0, 0)
            ct = user32.GetWindowRgn(h, t); gdi32.DeleteObject(t)
            logging.info(f"[{tag}]   child {h} class={buf.value} size={r.right-r.left}x{r.bottom-r.top} rgn_type={ct}")
            return True
        user32.EnumChildWindows(hwnd, _EnumChildProc(_child), 0)
    except Exception:
        logging.exception("dump_window_state failed")

class MONITORINFO(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.DWORD),
        ("rcMonitor", wintypes.RECT),
        ("rcWork", wintypes.RECT),
        ("dwFlags", wintypes.DWORD)
    ]

def list_monitors():
    mons = []
    Proc = ctypes.WINFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p, ctypes.POINTER(wintypes.RECT), ctypes.c_void_p)
    def cb(hmon, hdc, lprc, lparam):
        mi = MONITORINFO()
        mi.cbSize = ctypes.sizeof(MONITORINFO)
        user32.GetMonitorInfoW(ctypes.c_void_p(hmon), ctypes.byref(mi))
        r, w = mi.rcMonitor, mi.rcWork
        mons.append({
            "primary": bool(mi.dwFlags & 1),
            "mon": (r.left, r.top, r.right, r.bottom),
            "work": (w.left, w.top, w.right, w.bottom)
        })
        return 1
    cb_func = Proc(cb)
    user32.EnumDisplayMonitors(None, None, cb_func, 0)
    mons.sort(key=lambda m: not m["primary"])  # 主螢幕排第 1 個 (@1)
    return mons

_placing = False
user32.GetDpiForWindow.argtypes = [wintypes.HWND]
user32.GetDpiForWindow.restype = wintypes.UINT
user32.SetWindowPos.argtypes = [
    wintypes.HWND, wintypes.HWND,
    ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
    wintypes.UINT,
]
user32.SetWindowPos.restype = wintypes.BOOL

def dpi_scale(hwnd):
    try:
        d = user32.GetDpiForWindow(hwnd)
        return d / 96.0 if d else 1.0
    except Exception:
        return 1.0

def apply_window_size(hwnd, cfg):
    """用「整數實體像素」直接設定視窗大小 (CSS 尺寸 x DPI 縮放)，繞過 pywebview 的縮放。
    視窗 = 膠囊 + 四周各 PAD 的透明邊，膠囊邊緣的抗鋸齒像素就不會被視窗邊界裁掉。"""
    global _placing
    try:
        s = dpi_scale(hwnd)
        cw = int(cfg.get("width", 640)) + 2 * PAD
        ch = CAPSULE_H + 2 * PAD
        pw, ph = int(round(cw * s)), int(round(ch * s))
        _placing = True
        user32.SetWindowPos(hwnd, 0, 0, 0, pw, ph, 0x0002 | 0x0004 | 0x0010)  # NOMOVE | NOZORDER | NOACTIVATE
        _placing = False
        logging.info(f"apply_window_size: css={cw}x{ch} dpi_scale={s:.3f} -> phys={pw}x{ph}")
    except Exception:
        _placing = False
        logging.exception("apply_window_size failed")

def place_window(hwnd, cfg):
    global _placing
    try:
        mons = list_monitors()
        if not mons:
            return
        mon_idx = min(int(cfg.get("monitor", 0)), len(mons) - 1)
        m = mons[mon_idx]
        rc = wintypes.RECT()
        user32.GetWindowRect(hwnd, ctypes.byref(rc))
        pw = rc.right - rc.left
        ph = rc.bottom - rc.top
        ml, mt, mr, mb = m["mon"]
        wl, wt, wr, wb = m["work"]
        scale = dpi_scale(hwnd)
        pad = int(round(PAD * scale))   # 透明邊：讓「膠囊」而不是「視窗」對齊錨點
        a = cfg.get("anchor", "center")
        if not cfg.get("position_saved", False) and a not in ("center", "top_center", "above_taskbar", "custom"):
            a = "center"
        if a == "above_taskbar":
            x = wl + (wr - wl - pw) // 2
            y = wb - ph - int(12 * scale) + pad
        elif a == "center":
            x = ml + (mr - ml - pw) // 2
            y = mt + (mb - mt - ph) // 2
        elif a == "custom" and cfg.get("x") is not None and cfg.get("y") is not None:
            x, y = int(cfg["x"]), int(cfg["y"])
        else:
            x = ml + (mr - ml - pw) // 2
            y = mt + int(16 * scale) - pad
        if cfg.get("snap", True):
            x = max(ml - pad, min(x, mr - pw + pad))
            y = max(mt - pad, min(y, mb - ph + pad))
        cfg["x"], cfg["y"] = int(x), int(y)
        _placing = True
        user32.SetWindowPos(hwnd, 0, x, y, 0, 0, 0x0001 | 0x0004 | 0x0010)  # SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE
        _placing = False
        logging.debug(f"place_window: anchor={a}, mon={mon_idx}, pos=({x}, {y})")
    except Exception:
        _placing = False
        logging.exception("place_window failed")

def apply_behavior(hwnd, cfg):
    try:
        GWL_EXSTYLE = -20
        WS_EX_TOOLWINDOW = 0x80
        WS_EX_APPWINDOW = 0x40000
        WS_EX_TRANSPARENT = 0x20
        WS_EX_LAYERED = 0x80000

        ex = user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
        ex = (ex | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW

        if cfg.get("click_through"):
            ex |= (WS_EX_TRANSPARENT | WS_EX_LAYERED)
        else:
            ex &= ~WS_EX_TRANSPARENT

        user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex)
        # 只有「啟用點擊穿透」時才需要 LAYERED + alpha=255。
        # 其餘情況絕不呼叫 SetLayeredWindowAttributes，避免覆寫掉任何既有的色鍵設定。
        if cfg.get("click_through"):
            user32.SetLayeredWindowAttributes(hwnd, 0, 255, 2)  # LWA_ALPHA

        HWND_TOPMOST = ctypes.c_void_p(-1)
        HWND_NOTOPMOST = ctypes.c_void_p(-2)
        z_order = HWND_TOPMOST if cfg.get("topmost", True) else HWND_NOTOPMOST
        user32.SetWindowPos(hwnd, z_order, 0, 0, 0, 0, 0x0002 | 0x0001 | 0x0010 | 0x0040)
        logging.debug(f"apply_behavior: topmost={cfg.get('topmost')}, click_through={cfg.get('click_through')}")
    except Exception:
        logging.exception("apply_behavior failed")

# ---------------------------------------------------------------------------
# v1.1.1 系統整合：開機自動啟動 (HKCU\...\Run) 與桌面捷徑 (.lnk)
#   - 開機自啟只寫「目前使用者」登錄檔，不需要系統管理員權限
#   - 同時尊重工作管理員「啟動」分頁的停用狀態 (StartupApproved)
#   - 桌面捷徑以 WScript.Shell 建立；桌面路徑向 Windows 查詢 (支援 OneDrive 重新導向的桌面)
# ---------------------------------------------------------------------------
_RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
_APPROVED_KEY = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
_CREATE_NO_WINDOW = 0x08000000


def _launch_parts():
    """回傳 (執行檔, 引數字串列表, 工作目錄)。打包版 = exe 本身；原始碼版 = pythonw + main.py。"""
    if getattr(sys, "frozen", False):
        return sys.executable, [], BASE_DIR
    exe = sys.executable
    pyw = os.path.join(os.path.dirname(exe), "pythonw.exe")
    if os.path.isfile(pyw):
        exe = pyw
    return exe, [os.path.abspath(__file__)], BASE_DIR


def _autostart_command():
    exe, args, _ = _launch_parts()
    parts = [f'"{exe}"'] + [f'"{a}"' for a in args] + ["--autostart"]
    return " ".join(parts)


def is_autostart_enabled():
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _RUN_KEY, 0, winreg.KEY_READ) as k:
            winreg.QueryValueEx(k, APP_NAME)
        # 使用者若在「工作管理員 → 啟動」停用，StartupApproved 第 1 byte 為奇數 (03/07...)
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _APPROVED_KEY, 0, winreg.KEY_READ) as k:
                data, _t = winreg.QueryValueEx(k, APP_NAME)
                if data and (data[0] & 1):
                    return False
        except OSError:
            pass
        return True
    except OSError:
        return False
    except Exception:
        logging.exception("is_autostart_enabled failed")
        return False


def set_autostart(enable):
    try:
        import winreg
        if enable:
            with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, _RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
                winreg.SetValueEx(k, APP_NAME, 0, winreg.REG_SZ, _autostart_command())
            # 清除先前在工作管理員被停用的標記，否則登錄檔有值也不會啟動
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _APPROVED_KEY, 0, winreg.KEY_SET_VALUE) as k:
                    winreg.DeleteValue(k, APP_NAME)
            except OSError:
                pass
        else:
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
                    winreg.DeleteValue(k, APP_NAME)
            except FileNotFoundError:
                pass
        logging.info(f"autostart -> {enable}: {_autostart_command() if enable else '(removed)'}")
        return True
    except Exception:
        logging.exception("set_autostart failed")
        return False


def refresh_autostart_path():
    """已啟用開機自啟時，每次啟動都把登錄檔指令更新成『目前』的 exe 路徑 (資料夾被搬移後自動修復)。"""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _RUN_KEY, 0, winreg.KEY_READ) as k:
            cur, _t = winreg.QueryValueEx(k, APP_NAME)
        if cur != _autostart_command():
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, _RUN_KEY, 0, winreg.KEY_SET_VALUE) as k:
                winreg.SetValueEx(k, APP_NAME, 0, winreg.REG_SZ, _autostart_command())
            logging.info("autostart path refreshed")
    except OSError:
        pass
    except Exception:
        logging.exception("refresh_autostart_path failed")


def desktop_dir():
    """向 Windows 查詢真正的桌面資料夾 (CSIDL_DESKTOPDIRECTORY)，OneDrive 重新導向也正確。"""
    try:
        shell32 = ctypes.WinDLL("shell32")
        buf = ctypes.create_unicode_buffer(1024)
        if shell32.SHGetFolderPathW(None, 0x0010, None, 0, buf) == 0 and buf.value:
            return buf.value
    except Exception:
        logging.exception("SHGetFolderPathW failed")
    return os.path.join(os.path.expanduser("~"), "Desktop")


def shortcut_path():
    return os.path.join(desktop_dir(), f"{APP_DISPLAY_NAME}.lnk")


def desktop_shortcut_exists():
    try:
        return os.path.isfile(shortcut_path())
    except Exception:
        return False


_PS_MAKE_LNK = (
    "$ErrorActionPreference='Stop';"
    "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:TLL_LNK);"
    "$s.TargetPath=$env:TLL_TARGET;"
    "$s.Arguments=$env:TLL_ARGS;"
    "$s.WorkingDirectory=$env:TLL_WD;"
    "$s.IconLocation=$env:TLL_ICON;"
    "$s.Description=$env:TLL_DESC;"
    "$s.Save()"
)


def create_desktop_shortcut():
    try:
        exe, args, wd = _launch_parts()
        icon = ICON_PATH if ICON_PATH else exe
        lnk = shortcut_path()
        icon_loc = icon + ",0" if icon.lower().endswith((".exe", ".ico")) else icon
        desc = f"{APP_DISPLAY_NAME} v{APP_VERSION}"

        # 方法 1：win32com.client (原生支援 Unicode，不走終端編碼)
        try:
            import win32com.client
            shell = win32com.client.Dispatch("WScript.Shell")
            s = shell.CreateShortcut(lnk)
            s.TargetPath = exe
            s.Arguments = " ".join(f'"{a}"' for a in args)
            s.WorkingDirectory = wd
            s.IconLocation = icon_loc
            s.Description = desc
            s.Save()
            if desktop_shortcut_exists():
                logging.info(f"desktop shortcut created via COM: {lnk}")
                return True
        except Exception:
            pass

        # 方法 2：PowerShell + Base64 (徹底防範中文字符串路徑被編碼扭曲)
        import base64
        def _b64(val):
            return base64.b64encode(val.encode("utf-8")).decode("ascii")

        ps_script = (
            "$ErrorActionPreference='Stop';"
            f"$lnk=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{_b64(lnk)}'));"
            f"$target=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{_b64(exe)}'));"
            f"$args=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{_b64(' '.join(f'\"{a}\"' for a in args))}'));"
            f"$wd=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{_b64(wd)}'));"
            f"$icon=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{_b64(icon_loc)}'));"
            f"$desc=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('{_b64(desc)}'));"
            "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($lnk);"
            "$s.TargetPath=$target;$s.Arguments=$args;$s.WorkingDirectory=$wd;$s.IconLocation=$icon;$s.Description=$desc;$s.Save()"
        )
        env = dict(os.environ)
        env.update({
            "TLL_LNK": lnk,
            "TLL_TARGET": exe,
            "TLL_ARGS": " ".join(f'"{a}"' for a in args),
            "TLL_WD": wd,
            "TLL_ICON": icon_loc,
            "TLL_DESC": desc,
        })
        r = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
             "-Command", ps_script],
            env=env, capture_output=True, timeout=20, creationflags=_CREATE_NO_WINDOW)
        ok = (r.returncode == 0) and desktop_shortcut_exists()
        if ok:
            logging.info(f"desktop shortcut created via PS: {lnk}")
        else:
            logging.error(f"desktop shortcut failed rc={r.returncode} "
                          f"stderr={r.stderr.decode('utf-8', 'replace')[:300]}")
        return ok
    except Exception:
        logging.exception("create_desktop_shortcut failed")
        return False


def remove_desktop_shortcut():
    try:
        p = shortcut_path()
        if os.path.isfile(p):
            os.remove(p)
            logging.info(f"desktop shortcut removed: {p}")
        return True
    except Exception:
        logging.exception("remove_desktop_shortcut failed")
        return False


def system_state():
    return {"cmd": "system", "autostart": is_autostart_enabled(),
            "shortcut": desktop_shortcut_exists(), "version": APP_VERSION}


_save_timer = None
def schedule_save(cfg):
    global _save_timer
    if _save_timer:
        _save_timer.cancel()
    _save_timer = threading.Timer(0.5, lambda: save_config(cfg))
    _save_timer.start()

def load_config():
    default_cfg = {
        "width": 640,
        "height": 44,
        "x": None,
        "y": None,
        "default_x": None,
        "default_y": None,
        "position_saved": False,
        "style": 2,
        "text_color": "white",
        "audio_gain": 2.2,
        "silence_timeout_seconds": 5.0,
        "audio_active_threshold": 0.25,
        "audio_confirm_ms": 300,
        "monitor": 0,
        "anchor": "center",
        "topmost": True,
        "locked": False,
        "click_through": False,
        "snap": True,
        "edge_test": False,
        "extend_frame": True,
        "shortcut_auto_done": False   # v1.1.1：首次啟動自動建立桌面捷徑只做一次 (使用者刪除後不會再偷偷生回來)
    }
    if os.path.isfile(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                if isinstance(saved, dict):
                    default_cfg.update(saved)
        except Exception:
            logging.exception("Failed to load config.json")
    default_cfg["height"] = 44
    if default_cfg.get("width", 640) < 400 or default_cfg.get("width", 640) > 800:
        default_cfg["width"] = 640
    # 若尚未儲存預設座標：強制預設於畫面正中央，且不鎖定、不穿透，方便使用者直接拖曳與滾輪微調
    if not default_cfg.get("position_saved", False):
        default_cfg["anchor"] = "center"
        default_cfg["locked"] = False
        default_cfg["click_through"] = False
    else:
        if default_cfg.get("default_x") is not None and default_cfg.get("default_y") is not None:
            default_cfg["x"] = int(default_cfg["default_x"])
            default_cfg["y"] = int(default_cfg["default_y"])
            default_cfg["anchor"] = "custom"
    return default_cfg

def save_config(cfg):
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(cfg, f, indent=2)
        # 若為打包後的 dist\TaskbarLiquidLyrics\config.json，同步回寫至專案根目錄 config.json，防止重編譯覆蓋
        root_cfg = os.path.abspath(os.path.join(BASE_DIR, "..", "..", "config.json"))
        if root_cfg != os.path.abspath(CONFIG_FILE) and os.path.isfile(root_cfg):
            try:
                with open(root_cfg, "w", encoding="utf-8") as rf:
                    json.dump(cfg, rf, indent=2)
            except Exception:
                pass
    except Exception:
        logging.exception("Failed to save config.json")

audio_state = {"bass": 0.0, "energy": 0.0, "mid": 0.0, "high": 0.0, "running": True}
active_sockets = set()
display_sockets = set()   # 只有膠囊顯示頁 (hello role=display) 會收到音訊串流
_ws_loop = None
_latest_audio_msg = None   # 只保留「最新一筆」；送不出去的舊值直接被覆蓋
_audio_sender_running = False


def broadcast_ws_threadsafe(payload_dict):
    """從任何執行緒 (UI / RawInput / Tray) 非同步廣播 JSON 訊息給所有已連線的 WebSocket 客戶端。"""
    if _ws_loop is None or not active_sockets:
        return
    try:
        msg_str = json.dumps(payload_dict, ensure_ascii=False)
        async def _send_all():
            for ws in list(active_sockets):
                try:
                    await ws.send(msg_str)
                except Exception:
                    active_sockets.discard(ws)
        _ws_loop.call_soon_threadsafe(lambda: _ws_loop.create_task(_send_all()))
    except Exception:
        pass


def raw_input_wheel_worker(cfg):
    """當開啟『點擊穿透 (WS_EX_TRANSPARENT)』時，左鍵點擊完全穿透，但透過 Win32 RawInput
    在零全域 Hook 負擔下偵測滑鼠游標位於膠囊上方時的滾輪滾動 (±0.2s) 與中鍵點擊 (歸零 0.0s)。"""
    try:
        class RAWINPUTDEVICE(ctypes.Structure):
            _fields_ = [
                ("usUsagePage", wintypes.USHORT),
                ("usUsage", wintypes.USHORT),
                ("dwFlags", wintypes.DWORD),
                ("hwndTarget", wintypes.HWND),
            ]

        class RAWINPUTHEADER(ctypes.Structure):
            _fields_ = [
                ("dwType", wintypes.DWORD),
                ("dwSize", wintypes.DWORD),
                ("hDevice", wintypes.HANDLE),
                ("wParam", wintypes.WPARAM),
            ]

        class RAWMOUSE(ctypes.Structure):
            _fields_ = [
                ("usFlags", wintypes.USHORT),
                ("_pad", wintypes.USHORT),
                ("usButtonFlags", wintypes.USHORT),
                ("usButtonData", wintypes.USHORT),
                ("ulRawButtons", wintypes.ULONG),
                ("lLastX", wintypes.LONG),
                ("lLastY", wintypes.LONG),
                ("ulExtraInformation", wintypes.ULONG),
            ]

        class RAWINPUT(ctypes.Structure):
            _fields_ = [
                ("header", RAWINPUTHEADER),
                ("mouse", RAWMOUSE),
            ]

        raw_u32 = ctypes.WinDLL("user32", use_last_error=True)
        raw_u32.CreateWindowExW.argtypes = [
            wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
            ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
            wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID,
        ]
        raw_u32.CreateWindowExW.restype = wintypes.HWND
        raw_u32.RegisterRawInputDevices.argtypes = [ctypes.POINTER(RAWINPUTDEVICE), wintypes.UINT, wintypes.UINT]
        raw_u32.RegisterRawInputDevices.restype = wintypes.BOOL
        raw_u32.GetRawInputData.argtypes = [
            ctypes.c_void_p, wintypes.UINT, ctypes.c_void_p,
            ctypes.POINTER(wintypes.UINT), wintypes.UINT,
        ]
        raw_u32.GetRawInputData.restype = wintypes.UINT
        raw_u32.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]
        raw_u32.GetMessageW.restype = ctypes.c_int
        raw_u32.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
        raw_u32.GetCursorPos.restype = wintypes.BOOL

        HWND_MESSAGE = wintypes.HWND(-3)
        sink_hwnd = raw_u32.CreateWindowExW(
            0, "Message", "TLLWheelSink", 0, 0, 0, 0, 0, HWND_MESSAGE, None, None, None
        )
        if not sink_hwnd:
            logging.warning("raw_input_wheel_worker: CreateWindowExW failed")
            return

        rid = RAWINPUTDEVICE(0x01, 0x02, 0x00000100, sink_hwnd)  # Generic Desktop / Mouse / RIDEV_INPUTSINK
        if not raw_u32.RegisterRawInputDevices(ctypes.byref(rid), 1, ctypes.sizeof(RAWINPUTDEVICE)):
            logging.warning("raw_input_wheel_worker: RegisterRawInputDevices failed")
            return

        logging.info("raw_input_wheel_worker active for click-through wheel lyrics offset")
        msg = wintypes.MSG()
        raw = RAWINPUT()
        header_sz = ctypes.sizeof(RAWINPUTHEADER)
        raw_sz = ctypes.sizeof(RAWINPUT)
        pt = wintypes.POINT()
        rc = wintypes.RECT()

        while audio_state.get("running", False):
            ret = raw_u32.GetMessageW(ctypes.byref(msg), sink_hwnd, 0, 0)
            if ret <= 0:
                break
            if msg.message != 0x00FF:  # WM_INPUT
                continue
            # 僅在點擊穿透開啟、膠囊可見時由 RawInput 接手滾輪 (未穿透時由 WebView2 DOM wheel 直接處理)
            if not cfg.get("click_through") or _standby_os_hidden or not _main_hwnd:
                continue
            sz = wintypes.UINT(raw_sz)
            res = raw_u32.GetRawInputData(
                ctypes.c_void_p(msg.lParam), 0x10000003, ctypes.byref(raw), ctypes.byref(sz), header_sz
            )
            if res == 0xFFFFFFFF or raw.header.dwType != 0:  # RIM_TYPEMOUSE = 0
                continue
            flags = raw.mouse.usButtonFlags
            if not (flags & (0x0400 | 0x0020)):  # RI_MOUSE_WHEEL (0x0400) | RI_MOUSE_MIDDLE_BUTTON_DOWN (0x0020)
                continue
            if not raw_u32.GetCursorPos(ctypes.byref(pt)):
                continue
            if not user32.GetWindowRect(_main_hwnd, ctypes.byref(rc)):
                continue
            if rc.left <= pt.x <= rc.right and rc.top <= pt.y <= rc.bottom:
                if flags & 0x0400:
                    wheel_delta = ctypes.c_short(raw.mouse.usButtonData).value
                    if wheel_delta != 0:
                        step = 0.2 if wheel_delta > 0 else -0.2
                        broadcast_ws_threadsafe({"cmd": "set_lyrics_offset", "delta": step})
                elif flags & 0x0020:
                    broadcast_ws_threadsafe({"cmd": "set_lyrics_offset", "value": 0})
    except Exception:
        logging.exception("raw_input_wheel_worker error")

async def _audio_sender():
    """在 WebSocket 事件圈內運行的單一發送協程：永遠只送最新值，跑完即退出。"""
    import asyncio
    global _latest_audio_msg, _audio_sender_running
    try:
        while True:
            msg = _latest_audio_msg
            if msg is None:
                break
            _latest_audio_msg = None

            async def _one(ws, m=msg):
                try:
                    # 超過 250ms 還送不出去 = 連線卡死，直接移除 (長時間常駐的保險)
                    await asyncio.wait_for(ws.send(m), timeout=0.25)
                except Exception:
                    display_sockets.discard(ws)

            socks = list(display_sockets)
            if len(socks) == 1:
                await _one(socks[0])
            elif socks:
                await asyncio.gather(*(_one(ws) for ws in socks))
    finally:
        _audio_sender_running = False

def push_audio_ws(bass, energy, mid=0.0, high=0.0):
    """經由 WebSocket 把音訊值直接送進渲染行程：完全不經過 WinForms UI 執行緒。
    v2：以「最新值覆蓋 + 單一發送協程」取代每筆建立 Future，慢速客戶端不會累積延遲。
    封包格式：@a,bass,energy,mid,high (前兩欄與 v1 相容)。"""
    global _latest_audio_msg, _audio_sender_running
    if not display_sockets or _ws_loop is None:
        return False
    _latest_audio_msg = f"@a,{bass:.3f},{energy:.3f},{mid:.3f},{high:.3f}"
    if _audio_sender_running:
        return True
    _audio_sender_running = True
    try:
        _ws_loop.call_soon_threadsafe(lambda: _ws_loop.create_task(_audio_sender()))
    except Exception:
        _audio_sender_running = False   # loop 已關閉：下一筆再試
        return False
    return True

def open_settings_process():
    """啟動獨立外觀設定視窗"""
    try:
        if getattr(sys, "frozen", False):
            cmd = [sys.executable, "--settings"]
        else:
            cmd = [sys.executable, os.path.abspath(__file__), "--settings"]
        subprocess.Popen(cmd)
        logging.info("Spawned settings process")
    except Exception:
        logging.exception("Failed to spawn settings process")

def ensure_single_instance():
    """單一實例鎖：--settings 參數放行，主程式重複執行時喚醒控制中心並安全退出"""
    global _app_mutex
    if "--settings" in sys.argv:
        logging.info("Running in --settings mode, bypassing mutex check")
        return
    k32 = ctypes.windll.kernel32
    _app_mutex = k32.CreateMutexW(None, True, "Local\\TaskbarLiquidLyrics_SingleInstance_Mutex")
    if k32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
        if "--autostart" in sys.argv:
            logging.info("Another instance is already running (autostart launch). Exiting quietly.")
        else:
            logging.info("Another instance is already running. Opening settings and exiting.")
            open_settings_process()
        sys.exit(0)

# 1. WASAPI 音訊採樣
# v2 分析設計：
#  - 2048 取樣滑動視窗 (hop=512) + Hann 窗：頻率解析度 21.5Hz (原 512 點為 86Hz，
#    原本的 "bass = fft[1:6] = 86~430Hz" 其實是低中頻，鼓點與人聲混在一起)。
#  - 三個頻帶：bass 30~150Hz、mid 250~2000Hz、high 2000~8000Hz。
#  - dB 映射 (仿 Rainmeter AudioLevel Sensitivity)：把幅值轉 dBFS 後線性映射到 0~1，
#    不再用 min(1, x*常數) 硬截斷。v1 的 log 顯示 bass/energy 幾乎全程 = 1.0000 (飽和)，
#    前端完全拿不到動態，這是波峰碎裂/無層次的根本原因。
_SR = 44100
_FFT_N = 2048
_HOP = 512
_HANN = np.hanning(_FFT_N).astype(np.float32)
_AMP_NORM = float(_HANN.sum()) / 2.0          # 滿刻度正弦波 → 幅值 1.0 (0 dBFS)
_BIN_HZ = _SR / _FFT_N


def _bins(lo_hz, hi_hz):
    return max(1, int(round(lo_hz / _BIN_HZ))), int(round(hi_hz / _BIN_HZ)) + 1


_BASS_BINS = _bins(30, 150)
_MID_BINS = _bins(250, 2000)
_HIGH_BINS = _bins(2000, 8000)
BAND_RANGE_DB = 42.0      # 對齊 Rainmeter Sensitivity=42：-42dBFS → 0, 0dBFS → 1
ENERGY_RANGE_DB = 60.0    # 整體能量範圍放寬，避免安靜樂段被誤判成暫停


def _db_norm(amp, range_db):
    if amp <= 1e-9:
        return 0.0
    v = (20.0 * np.log10(amp) + range_db) / range_db
    return 0.0 if v < 0.0 else (1.0 if v > 1.0 else float(v))


def analyze_block(ring):
    """ring: 長度 _FFT_N 的 float32 滑動視窗。回傳 (bass, energy, mid, high)，皆 0~1。"""
    rms = float(np.sqrt(np.mean(ring[-_HOP:] ** 2)))
    if rms < 1e-5:
        return 0.0, 0.0, 0.0, 0.0
    mag = np.abs(np.fft.rfft(ring * _HANN)) / _AMP_NORM
    p = mag * mag
    bass_amp = float(np.sqrt(p[_BASS_BINS[0]:_BASS_BINS[1]].sum()))
    mid_amp = float(np.sqrt(p[_MID_BINS[0]:_MID_BINS[1]].sum()))
    high_amp = float(np.sqrt(p[_HIGH_BINS[0]:_HIGH_BINS[1]].sum()))
    return (_db_norm(bass_amp, BAND_RANGE_DB),
            _db_norm(rms, ENERGY_RANGE_DB),
            _db_norm(mid_amp, BAND_RANGE_DB),
            _db_norm(high_amp, BAND_RANGE_DB))


def audio_capture_worker(window):
    try:
        import soundcard as sc
        warnings.filterwarnings("ignore", category=sc.SoundcardRuntimeWarning)
    except Exception:
        logging.exception("soundcard import failed in worker")
        return

    while audio_state["running"]:
        try:
            def_spk = sc.default_speaker()
            try:
                mic = sc.get_microphone(id=def_spk.id, include_loopback=True)
            except Exception:
                try:
                    mic = sc.get_microphone(id=def_spk.name, include_loopback=True)
                except Exception:
                    loopbacks = [m for m in sc.all_microphones(include_loopback=True) if m.isloopback]
                    mic = loopbacks[0] if loopbacks else None

            if not mic:
                time.sleep(1.0)
                continue

            last_push = 0.0
            ring = np.zeros(_FFT_N, dtype=np.float32)
            with mic.recorder(samplerate=_SR, blocksize=_HOP) as rec:
                while audio_state["running"]:
                    data = rec.record(numframes=_HOP)
                    if data is None or len(data) == 0:
                        continue

                    mono = data.mean(axis=1) if data.ndim > 1 else data
                    n = min(len(mono), _HOP)
                    ring[:-n] = ring[n:]
                    ring[-n:] = mono[-n:]

                    bass, energy, mid, high = analyze_block(ring)

                    audio_state["bass"] = bass
                    audio_state["energy"] = energy
                    audio_state["mid"] = mid
                    audio_state["high"] = high

                    now = time.perf_counter()
                    # 靜音時降頻到 10Hz (前端靜音偵測只需要 350ms 內收到幾筆 0)
                    min_gap = 0.1 if (energy == 0.0 and bass == 0.0) else 0.008
                    if display_sockets and _ws_loop is not None:
                        # 主路徑：WebSocket，約每個音訊區塊 (11.6ms) 推一次
                        if now - last_push >= min_gap:
                            last_push = now
                            push_audio_ws(bass, energy, mid, high)
                    elif now - last_push >= 0.033:
                        # 備援：頁面尚未連上 WebSocket 時用 evaluate_js
                        last_push = now
                        try:
                            window.evaluate_js(f"if (window.updateAudioLevels) window.updateAudioLevels({bass:.3f}, {energy:.3f}, {mid:.3f}, {high:.3f});")
                        except Exception:
                            pass
        except Exception:
            logging.exception("audio loop error, retrying in 1s")
            time.sleep(1.0)

# 2. Windows GSMTC 媒體播放狀態監聽
def media_worker(window):
    import asyncio
    try:
        from winrt.windows.media.control import GlobalSystemMediaTransportControlsSessionManager as SMTCManager
    except Exception:
        logging.exception("Failed to import winrt SMTCManager")
        return

    async def run_media():
        # v1.1.1：開機自動啟動時，媒體服務可能還沒就緒；失敗就每 2 秒重試 (最多約 2 分鐘)，不再直接放棄
        manager = None
        for attempt in range(60):
            try:
                manager = await SMTCManager.request_async()
                if attempt:
                    logging.info(f"SMTCManager ready after {attempt} retries")
                break
            except Exception:
                if attempt in (0, 59):
                    logging.exception(f"Failed to request SMTCManager (attempt {attempt + 1})")
                await asyncio.sleep(2.0)
        if manager is None:
            return

        active_key = None
        active_title = ""
        active_artist = ""
        active_playing = None
        last_pos = 0.0
        session_state = {}
        startup_current_key = None

        while audio_state["running"]:
            try:
                if audio_state.get("force_media_resync"):
                    audio_state["force_media_resync"] = False
                    active_key = None
                    active_playing = None
                sessions = list(manager.get_sessions() or [])
                current_session = manager.get_current_session()
                current_source_id = (
                    str(getattr(current_session, "source_app_user_model_id", "") or "")
                    if current_session else ""
                )
                now = time.monotonic()
                observed = []
                for idx, session in enumerate(sessions):
                    try:
                        source_id = str(getattr(session, "source_app_user_model_id", "") or "unknown")
                        playback = session.get_playback_info()
                        status_val = playback.playback_status.value if playback else 0
                        is_playing = (status_val == 4)
                        is_current_session = bool(current_source_id and source_id == current_source_id)

                        info = await session.try_get_media_properties_async() if (is_playing or is_current_session) else None
                        title = re.sub(r'[\u200b-\u200f\ufeff]', '', (info.title or '')).strip() if info else ''
                        artist = re.sub(r'[\u200b-\u200f\ufeff]', '', (info.artist or '')).strip() if info else ''
                        album = re.sub(r'[\u200b-\u200f\ufeff]', '', (info.album_title or '')).strip() if info else ''

                        # Use title in the key when present so different tabs/tracks in the same browser
                        # (e.g. YouTube vs YouTube Music) never collide or overwrite each other's state.
                        key = f"{source_id}::{title}" if title else f"{source_id}#{idx}"

                        previous = session_state.get(key, {})
                        was_playing = bool(previous.get("playing", False))
                        if is_playing and not was_playing:
                            previous["last_started"] = now
                        if key not in session_state and is_playing:
                            previous["last_started"] = now + (0.001 if is_current_session else 0.0)

                        if is_playing and title and title != previous.get("title", ""):
                            previous["last_started"] = now

                        previous.update({"playing": is_playing, "title": title, "artist": artist, "album": album,
                                         "source_id": source_id, "session": session, "last_seen": now})
                        session_state[key] = previous

                        if is_playing and (title or artist):
                            observed.append((float(previous.get("last_started", 0)), key, session, title, artist, album, playback))
                    except Exception:
                        logging.debug("Skipping unreadable GSMTC session", exc_info=True)

                # Remove stale session records so closed browser tabs do not retain priority.
                for key in list(session_state):
                    if now - session_state[key].get("last_seen", now) > 8.0:
                        session_state.pop(key, None)

                chosen = max(observed, key=lambda item: item[0]) if observed else None
                if chosen:
                    _, key, session, clean_title, clean_artist, clean_album, playback = chosen
                    timeline = session.get_timeline_properties()
                    is_playing = True
                    dur = max(0.0, timeline.end_time.total_seconds()) if timeline else 0.0
                    current_pos = timeline.position.total_seconds() if (timeline and dur > 1.0) else None
                    is_new = (key != active_key or clean_title != active_title or clean_artist != active_artist)
                    seek_detected = current_pos is not None and (is_new or abs(current_pos - last_pos) > 1.8)
                    if is_new:
                        logging.info(f"[GSMTC active track] source={key} title={clean_title!r} artist={clean_artist!r}")
                    if is_new or active_playing is not True or seek_detected:
                        track_data = {"title": clean_title, "artist": clean_artist, "album": clean_album,
                                      "isPlaying": True, "duration": dur,
                                      "seek": current_pos if seek_detected else None,
                                      "source": key}
                        payload = json.dumps(track_data, ensure_ascii=False)
                        try:
                            window.evaluate_js(f"if (window.updateTrackInfo) window.updateTrackInfo({payload});")
                        except Exception:
                            pass
                    if current_pos is not None:
                        last_pos = current_pos
                    active_key, active_title, active_artist, active_playing = key, clean_title, clean_artist, True
                else:
                    # Keep paused metadata from the OS current session, but never let a paused
                    # session outrank a session that is actively playing.
                    paused = current_session
                    if paused:
                        try:
                            info = await paused.try_get_media_properties_async()
                            title = re.sub(r'[\u200b-\u200f\ufeff]', '', (info.title or '')).strip() if info else ''
                            artist = re.sub(r'[\u200b-\u200f\ufeff]', '', (info.artist or '')).strip() if info else ''
                            album = re.sub(r'[\u200b-\u200f\ufeff]', '', (info.album_title or '')).strip() if info else ''
                        except Exception:
                            title = artist = album = ''
                    else:
                        title = artist = album = ''
                    if active_playing is not False or title != active_title or artist != active_artist:
                        track_data = {"title": title, "artist": artist, "album": album,
                                      "isPlaying": False, "duration": 0.0, "seek": None}
                        payload = json.dumps(track_data, ensure_ascii=False)
                        try:
                            window.evaluate_js(f"if (window.updateTrackInfo) window.updateTrackInfo({payload});")
                        except Exception:
                            pass
                    active_key, active_title, active_artist, active_playing = None, title, artist, False
                    last_pos = 0.0
            except Exception:
                logging.debug("media_worker poll error", exc_info=True)
            await asyncio.sleep(0.2)

    try:
        asyncio.run(run_media())
    except Exception:
        logging.exception("media_worker asyncio.run failed")

# 3. WebSockets 通訊中樞 (8974)
_perf_state = {"n": 0}


def wnp_server_worker(window, cfg):
    import asyncio
    try:
        import websockets
    except Exception:
        logging.exception("websockets import failed")
        return

    async def broadcast(msg_str):
        for ws in list(active_sockets):
            try:
                await ws.send(msg_str)
            except Exception:
                active_sockets.discard(ws)

    async def handler(websocket):
        global _latest_lyrics_status
        active_sockets.add(websocket)
        try:
            async for msg in websocket:
                if isinstance(msg, str) and msg.startswith('{'):
                    try:
                        data = json.loads(msg)
                        cmd = data.get("cmd")
                        if cmd == "hello":
                            if data.get("role") == "display":
                                display_sockets.add(websocket)
                                audio_state["force_media_resync"] = True
                                logging.info("display page registered for audio stream")
                        elif cmd == "set_standby_os":
                            # Avoid SetLayeredWindowAttributes here: it can conflict with
                            # the per-pixel alpha path. WinForms opacity is applied on UI thread.
                            want_hidden = bool(data.get("standby"))
                            if _main_form is not None and want_hidden != _standby_os_hidden:
                                from System import Action
                                def _set_form_opacity():
                                    global _standby_os_hidden
                                    try:
                                        _main_form.Opacity = 0.0 if want_hidden else 1.0
                                        _standby_os_hidden = want_hidden
                                        if not want_hidden:
                                            reapply_transparency(_main_hwnd, _main_form, "standby-wake", cfg.get("extend_frame", True))
                                    except Exception:
                                        logging.exception("set_standby_os failed")
                                _main_form.BeginInvoke(Action(_set_form_opacity))
                        elif cmd == "lyrics_status":
                            # Keep the latest status so a settings window opened mid-song
                            # can render the current source/offset without waiting for another track event.
                            _latest_lyrics_status = data.get("status", {}) if isinstance(data.get("status", {}), dict) else {}
                            payload = json.dumps({"cmd": "lyrics_status", "status": _latest_lyrics_status}, ensure_ascii=False)
                            await broadcast(payload)
                        elif cmd == "adjust_lyrics_offset":
                            payload = json.dumps({"cmd": "set_lyrics_offset", "delta": float(data.get("delta", 0.0)),
                                                  "value": data.get("value")}, ensure_ascii=False)
                            await broadcast(payload)
                        elif cmd == "select_lyrics_candidate":
                            payload = json.dumps({"cmd": "select_lyrics_candidate", "index": int(data.get("index", -1))})
                            await broadcast(payload)
                        elif cmd == "search_lyrics":
                            payload = json.dumps({"cmd": "search_lyrics", "title": str(data.get("title", ""))[:200],
                                                  "artist": str(data.get("artist", ""))[:200]})
                            await broadcast(payload)
                        elif cmd == "perf":
                            # 每 2s 一筆太吵：有慢幀時立即記錄，否則每 30s 記一筆
                            _perf_state["n"] += 1
                            if data.get("slow34", 0) > 0 or _perf_state["n"] % 15 == 1:
                                logging.info(f"[perf] {data}")
                        elif cmd == "open_settings_window":
                            open_settings_process()
                        elif cmd == "get_config":
                            await websocket.send(json.dumps({"cmd": "config", "config": cfg}))
                            await websocket.send(json.dumps(system_state()))
                            if _latest_lyrics_status:
                                await websocket.send(json.dumps({"cmd": "lyrics_status", "status": _latest_lyrics_status}, ensure_ascii=False))
                            if websocket not in display_sockets:
                                if _main_form is not None:
                                    from System import Action
                                    def _wake_for_settings():
                                        global _standby_os_hidden
                                        try:
                                            _main_form.Opacity = 1.0
                                            _standby_os_hidden = False
                                            reapply_transparency(_main_hwnd, _main_form, "settings-wake", cfg.get("extend_frame", True))
                                        except Exception:
                                            pass
                                    _main_form.BeginInvoke(Action(_wake_for_settings))
                                await broadcast(json.dumps({"cmd": "wake_capsule"}))
                        elif cmd == "get_system":
                            await websocket.send(json.dumps(system_state()))
                        elif cmd == "set_autostart":
                            loop = asyncio.get_running_loop()
                            await loop.run_in_executor(None, set_autostart, bool(data.get("value")))
                            await websocket.send(json.dumps(system_state()))
                        elif cmd == "set_shortcut":
                            loop = asyncio.get_running_loop()
                            fn = create_desktop_shortcut if data.get("value") else remove_desktop_shortcut
                            await loop.run_in_executor(None, fn)
                            cfg["shortcut_auto_done"] = True   # 使用者自己動過，就不再自動建立
                            save_config(cfg)
                            await websocket.send(json.dumps(system_state()))
                        elif cmd == "set_style":
                            cfg["style"] = data.get("style", 2)
                            save_config(cfg)
                            await broadcast(json.dumps({"cmd": "set_style", "style": cfg["style"]}))
                        elif cmd == "set_text_color":
                            cfg["text_color"] = data.get("color", "white")
                            save_config(cfg)
                            await broadcast(json.dumps({"cmd": "set_text_color", "color": cfg["text_color"]}))
                        elif cmd == "set_gain":
                            cfg["audio_gain"] = data.get("gain", 2.2)
                            save_config(cfg)
                            await broadcast(json.dumps({"cmd": "set_gain", "gain": cfg["audio_gain"]}))
                        elif cmd == "set_width":
                            new_w = max(400, min(800, int(data.get("width", 640))))
                            cfg["width"] = new_w
                            save_config(cfg)
                            try:
                                if _main_hwnd:
                                    apply_window_size(_main_hwnd, cfg)
                                    place_window(_main_hwnd, cfg)
                            except Exception:
                                logging.exception("Failed to resize window on set_width")
                        elif cmd == "get_monitors":
                            mons = list_monitors()
                            m_list = [
                                {
                                    "index": i,
                                    "label": f"@{i+1} {'主顯示器' if m['primary'] else '副顯示器'} ({m['mon'][2]-m['mon'][0]}×{m['mon'][3]-m['mon'][1]})"
                                }
                                for i, m in enumerate(mons)
                            ]
                            await websocket.send(json.dumps({"cmd": "monitors", "monitors": m_list}))
                        elif cmd == "set_place":
                            for k in ("anchor", "monitor", "x", "y"):
                                if k in data:
                                    cfg[k] = data[k]
                            if "x" in data or "y" in data:
                                cfg["anchor"] = "custom"
                            if _main_hwnd:
                                place_window(_main_hwnd, cfg)
                            if cfg.get("position_saved", False):
                                save_config(cfg)
                            await broadcast(json.dumps({"cmd": "config", "config": cfg}))
                        elif cmd == "read_current_position":
                            if _main_hwnd:
                                rc = wintypes.RECT()
                                if user32.GetWindowRect(_main_hwnd, ctypes.byref(rc)):
                                    cfg["x"], cfg["y"] = int(rc.left), int(rc.top)
                            await websocket.send(json.dumps({
                                "cmd": "position_updated",
                                "x": cfg.get("x"),
                                "y": cfg.get("y"),
                                "anchor": cfg.get("anchor", "custom"),
                                "position_saved": bool(cfg.get("position_saved", False)),
                                "default_x": cfg.get("default_x"),
                                "default_y": cfg.get("default_y"),
                                "locked": bool(cfg.get("locked", False)),
                                "click_through": bool(cfg.get("click_through", False)),
                            }))
                        elif cmd == "save_default_position":
                            x_val = data.get("x")
                            y_val = data.get("y")
                            if (x_val is None or y_val is None) and _main_hwnd:
                                rc = wintypes.RECT()
                                if user32.GetWindowRect(_main_hwnd, ctypes.byref(rc)):
                                    x_val, y_val = int(rc.left), int(rc.top)
                            if x_val is not None and y_val is not None:
                                cfg["x"] = int(x_val)
                                cfg["y"] = int(y_val)
                                cfg["default_x"] = int(x_val)
                                cfg["default_y"] = int(y_val)
                            cfg["anchor"] = "custom"
                            cfg["position_saved"] = True
                            cfg["locked"] = True
                            cfg["click_through"] = True
                            save_config(cfg)
                            if _main_hwnd:
                                place_window(_main_hwnd, cfg)
                                apply_behavior(_main_hwnd, cfg)
                            await broadcast(json.dumps({"cmd": "config", "config": cfg}))
                        elif cmd == "unlock_position":
                            cfg["locked"] = False
                            cfg["click_through"] = False
                            if _main_hwnd:
                                apply_behavior(_main_hwnd, cfg)
                            await broadcast(json.dumps({"cmd": "config", "config": cfg}))
                        elif cmd == "set_flag":
                            k = data.get("key")
                            if k in ("topmost", "locked", "click_through", "snap"):
                                cfg[k] = bool(data.get("value"))
                                save_config(cfg)
                                if _main_hwnd:
                                    apply_behavior(_main_hwnd, cfg)
                                    place_window(_main_hwnd, cfg)
                                await broadcast(json.dumps({"cmd": "config", "config": cfg}))
                        elif cmd == "reset_position":
                            cfg["position_saved"] = False
                            cfg["anchor"] = "center"
                            cfg["locked"] = False
                            cfg["click_through"] = False
                            if _main_hwnd:
                                apply_behavior(_main_hwnd, cfg)
                                place_window(_main_hwnd, cfg)
                            save_config(cfg)
                            await broadcast(json.dumps({"cmd": "config", "config": cfg}))
                        elif cmd == "save_settings":
                            incoming = data.get("settings", {})
                            if isinstance(incoming, dict):
                                cfg.update(incoming)
                                if cfg.get("position_saved", False):
                                    if cfg.get("x") is not None and cfg.get("y") is not None:
                                        cfg["default_x"] = int(cfg["x"])
                                        cfg["default_y"] = int(cfg["y"])
                            save_config(cfg)
                            if _main_hwnd:
                                apply_behavior(_main_hwnd, cfg)
                                place_window(_main_hwnd, cfg)
                        elif cmd == "exit_app":
                            audio_state["running"] = False
                            try:
                                if _tray_icon:
                                    _tray_icon.Visible = False
                                    _tray_icon.Dispose()
                            except Exception:
                                pass
                            try:
                                window.destroy()
                            except Exception:
                                pass
                            os._exit(0)
                    except Exception:
                        logging.exception("ws message handle error")
                else:
                    # WebNowPlaying uses the legacy KEY:VALUE text protocol.
                    # Forward raw metadata only to registered display clients.
                    for display_ws in list(display_sockets):
                        try:
                            await display_ws.send(msg)
                        except Exception:
                            display_sockets.discard(display_ws)
        except Exception:
            pass
        finally:
            active_sockets.discard(websocket)
            display_sockets.discard(websocket)

    async def run_server():
        global _ws_loop
        _ws_loop = asyncio.get_running_loop()
        while audio_state["running"]:
            try:
                async with websockets.serve(handler, '127.0.0.1', 8974):
                    logging.info("WebSocket server active on ws://127.0.0.1:8974")
                    while audio_state["running"]:
                        await asyncio.sleep(1.0)
            except OSError as e:
                logging.warning(f"websockets.serve waiting for port 8974 to free: {e}")
                await asyncio.sleep(1.0)
            except Exception:
                logging.exception("websockets.serve error")
                await asyncio.sleep(1.0)

    try:
        asyncio.run(run_server())
    except Exception:
        logging.exception("wnp_server_worker asyncio.run failed")

# 4. 註冊 Windows 原生系統匣常駐圖示 (必須在 WinForms UI 執行緒執行)
def setup_system_tray(window, cfg, hwnd):
    global _tray_icon
    try:
        import System.Windows.Forms as WinForms
        import System.Drawing as Drawing

        tray = WinForms.NotifyIcon()
        icon_set = False
        if ICON_PATH:
            try:
                # 依系統小圖示尺寸 (150% DPI = 24px) 從多尺寸 .ico 取最合適的一張，邊緣才不會糊
                tray.Icon = Drawing.Icon(ICON_PATH, WinForms.SystemInformation.SmallIconSize)
                icon_set = True
            except Exception:
                logging.exception("tray icon from app.ico failed")
        if not icon_set:
            try:
                tray.Icon = Drawing.Icon.ExtractAssociatedIcon(sys.executable)
            except Exception:
                tray.Icon = Drawing.SystemIcons.Application

        tray.Text = f"{APP_DISPLAY_NAME} v{APP_VERSION}"
        tray.Visible = True

        menu = WinForms.ContextMenuStrip()

        item_settings = menu.Items.Add("⚙️ 開啟外觀控制中心")
        item_settings.Click += lambda s, e: open_settings_process()

        item_reset = menu.Items.Add("🎯 解鎖並移至畫面中央")
        def on_reset_click(s, e):
            cfg["position_saved"] = False
            cfg["anchor"] = "center"
            cfg["locked"] = False
            cfg["click_through"] = False
            if _main_hwnd:
                apply_behavior(_main_hwnd, cfg)
                place_window(_main_hwnd, cfg)
            save_config(cfg)
            broadcast_ws_threadsafe({"cmd": "config", "config": cfg})
        item_reset.Click += on_reset_click

        item_ct = menu.Items.Add("🖱️ 切換點擊穿透")
        def on_ct_click(s, e):
            cfg["click_through"] = not cfg.get("click_through", False)
            save_config(cfg)
            if _main_hwnd:
                apply_behavior(_main_hwnd, cfg)
            broadcast_ws_threadsafe({"cmd": "config", "config": cfg})
            logging.info(f"click_through toggled from tray -> {cfg['click_through']}")
        item_ct.Click += on_ct_click

        menu.Items.Add(WinForms.ToolStripSeparator())

        # v1.1.1：開機自動啟動 (可勾選) 與桌面捷徑
        item_auto = WinForms.ToolStripMenuItem("🚀 開機自動啟動")
        item_auto.CheckOnClick = False
        def on_auto_click(s, e):
            threading.Thread(target=lambda: set_autostart(not is_autostart_enabled()), daemon=True).start()
        item_auto.Click += on_auto_click
        menu.Items.Add(item_auto)

        item_lnk = WinForms.ToolStripMenuItem("🖥️ 建立桌面捷徑")
        def on_lnk_click(s, e):
            threading.Thread(target=create_desktop_shortcut, daemon=True).start()
        item_lnk.Click += on_lnk_click
        menu.Items.Add(item_lnk)

        def on_menu_opening(s, e):
            try:
                item_auto.Checked = is_autostart_enabled()
                item_lnk.Text = "🖥️ 重新建立桌面捷徑" if desktop_shortcut_exists() else "🖥️ 建立桌面捷徑"
            except Exception:
                pass
        menu.Opening += on_menu_opening

        menu.Items.Add(WinForms.ToolStripSeparator())

        item_exit = menu.Items.Add("❌ 結束程式")
        def on_exit_click(s, e):
            audio_state["running"] = False
            try:
                tray.Visible = False
                tray.Dispose()
            except Exception:
                pass
            try:
                window.destroy()
            except Exception:
                pass
            os._exit(0)
        item_exit.Click += on_exit_click

        tray.ContextMenuStrip = menu
        tray.MouseClick += lambda s, e: open_settings_process() if e.Button == WinForms.MouseButtons.Left else None

        _tray_icon = tray
        logging.info("System tray NotifyIcon registered successfully on UI thread")
    except Exception:
        logging.exception("setup_system_tray failed")

# 5. 視窗特性注入（使用 form.Invoke 徹底解決跨執行緒 InvalidOperationException）
def setup_liquid_window(window, cfg):
    global _main_hwnd, _main_form
    hwnd = None
    form = None
    for _ in range(80):
        try:
            if window.native and getattr(window.native, "Handle", None):
                hwnd = window.native.Handle.ToInt64()
                form = window.native
                break
        except Exception:
            pass
        time.sleep(0.06)

    if not hwnd or not form:
        logging.error("Failed to acquire window native handle")
        return

    _main_hwnd = hwnd
    _main_form = form

    try:
        from System import Action

        def on_ui():
            try:
                # 1+2. 去背：預設走「每像素 Alpha」；舊 Region 路線只在 ALPHA_MODE == "region" 時使用
                if ALPHA_MODE == "dwm":
                    make_per_pixel_alpha(form, hwnd, "on_ui", cfg.get("extend_frame", True))
                else:
                    dwmapi.DwmSetWindowAttribute(hwnd, 2, ctypes.byref(ctypes.c_int(1)), 4)   # NCRENDERING DISABLED
                    dwmapi.DwmSetWindowAttribute(hwnd, 33, ctypes.byref(ctypes.c_int(1)), 4)  # DONOTROUND
                    apply_capsule_region(hwnd)

                # 3. 套用視窗行為 (ToolWindow / Topmost / Click-through) 與螢幕定位
                apply_window_size(hwnd, cfg)
                apply_behavior(hwnd, cfg)
                place_window(hwnd, cfg)

                # 4. 建立系統匣 NotifyIcon
                setup_system_tray(window, cfg, hwnd)
                logging.info("UI thread actions executed successfully")
            except Exception:
                logging.exception("on_ui execution failed")

        form.Invoke(Action(on_ui))
    except Exception:
        logging.exception("form.Invoke failed in setup_liquid_window")

    # 注入初始設定至前端
    try:
        cfg_json = json.dumps(cfg)
        window.evaluate_js(f"if (window.initConfig) window.initConfig({cfg_json});")
        logging.info("Injected initial config to DOM")
    except Exception:
        logging.exception("evaluate_js initConfig failed")

def run_settings_ui():
    """外觀設定控制中心獨立視窗"""
    logging.info("Running Settings UI Window")
    s_win = webview.create_window(
        title="工作列液態玻璃歌詞器・外觀控制中心",
        url=SETTINGS_URL,
        width=560,
        height=820,
        resizable=False,
        on_top=True
    )

    def _set_settings_icon():
        # 讓設定視窗標題列 / 工作列也顯示新圖示 (失敗無妨，維持預設)
        try:
            if not ICON_PATH:
                return
            import System.Drawing as Drawing
            from System import Action
            form = s_win.native
            def _do():
                try:
                    form.Icon = Drawing.Icon(ICON_PATH, 32, 32)
                except Exception:
                    logging.exception("settings window icon failed")
            form.Invoke(Action(_do))
        except Exception:
            logging.exception("set settings icon failed")

    s_win.events.shown += _set_settings_icon
    webview.start(gui="edgechromium")

def _first_run_tasks(cfg):
    """首次啟動 (打包版) 自動在桌面建立捷徑；只做一次，使用者之後刪除也不會再被偷偷生回來。"""
    try:
        if getattr(sys, "frozen", False) and not cfg.get("shortcut_auto_done"):
            ok = create_desktop_shortcut()
            cfg["shortcut_auto_done"] = True
            save_config(cfg)
            logging.info(f"first-run desktop shortcut: {'created' if ok else 'FAILED (see log above)'}")
        if getattr(sys, "frozen", False):
            refresh_autostart_path()
    except Exception:
        logging.exception("first-run tasks failed")


def main():
    global _active_cfg
    ensure_single_instance()

    if "--autostart" in sys.argv:
        # 登入當下 Explorer / 音訊服務可能還在起來；稍等一下比搶跑穩 (後端也有重試機制)
        logging.info("Started by Windows logon (--autostart), waiting 3s for shell/audio services")
        time.sleep(3.0)

    cfg = load_config()
    _active_cfg = cfg
    threading.Thread(target=_first_run_tasks, args=(cfg,), daemon=True).start()
    width = cfg.get("width", 640)
    height = 44

    logging.info(f"Creating main capsule window: width={width}, height={height}")

    # 啟用透明通道，搭配 CSS 純內部陰影 (0 外擴陰影) 與 DWM 關閉投影，實現完美去背
    window = webview.create_window(
        title="Taskbar Liquid Lyrics",
        url=UI_URL,
        width=width + 2 * PAD,
        height=height + 2 * PAD,
        min_size=(200, 40),
        frameless=True,
        transparent=(ALPHA_MODE == "dwm"),   # 只為了讓 WebView2 一開始就是透明；色鍵會在 make_per_pixel_alpha 拿掉
        background_color="#000000",
        on_top=cfg.get("topmost", True),
        resizable=False,
        easy_drag=True
    )

    _last_dpi = [0]

    def on_moved(x, y):
        if _placing or not _main_hwnd:
            return
        d = user32.GetDpiForWindow(_main_hwnd)
        if d and d != _last_dpi[0]:
            if _last_dpi[0]:
                apply_window_size(_main_hwnd, cfg)   # 換到不同縮放的螢幕
            _last_dpi[0] = d
        if cfg.get("locked"):
            place_window(_main_hwnd, cfg)  # 鎖定狀態：被拖動就彈回原位
            return
        rc = wintypes.RECT()
        user32.GetWindowRect(_main_hwnd, ctypes.byref(rc))
        cfg["x"], cfg["y"] = int(rc.left), int(rc.top)
        cfg["anchor"] = "custom"
        broadcast_ws_threadsafe({
            "cmd": "position_updated",
            "x": cfg["x"],
            "y": cfg["y"],
            "anchor": "custom",
            "position_saved": bool(cfg.get("position_saved", False)),
            "default_x": cfg.get("default_x"),
            "default_y": cfg.get("default_y"),
            "locked": bool(cfg.get("locked", False)),
            "click_through": bool(cfg.get("click_through", False)),
        })
        if cfg.get("position_saved", False):
            schedule_save(cfg)

    window.events.moved += on_moved

    def on_resized(w, h):
        if _main_hwnd:
            if ALPHA_MODE != "dwm":
                apply_capsule_region(_main_hwnd)
            place_window(_main_hwnd, cfg)

    window.events.resized += on_resized

    def on_loaded():
        try:
            cfg_json = json.dumps(cfg)
            window.evaluate_js(f"if (window.initConfig) window.initConfig({cfg_json});")
            if "--autostart" not in sys.argv:
                window.evaluate_js("if (window.wakeCapsule) window.wakeCapsule();")
        except Exception:
            logging.exception("on_loaded evaluate_js error")
        if cfg.get("edge_test"):
            try:
                window.evaluate_js("document.documentElement.classList.add('edge-test')")
                logging.warning("edge_test is ON: capsule shows as a plain white test shape")
            except Exception:
                logging.exception("edge_test inject failed")
        if cfg.get("click_through"):
            logging.warning("click_through is ON: the capsule ignores mouse clicks. Use the tray icon menu to toggle it.")

        # WebView2 的子視窗是非同步建立的：頁面載入後多次重套 Region，並把狀態寫進 log
        def reapply(tag):
            try:
                hwnd = window.native.Handle.ToInt64()
                global _main_hwnd
                if hwnd != _main_hwnd:
                    logging.warning(f"HWND changed! old={_main_hwnd} new={hwnd} (視窗 handle 被重建)")
                    _main_hwnd = hwnd
                    apply_behavior(hwnd, cfg)
                if ALPHA_MODE == "dwm":
                    from System import Action
                    window.native.Invoke(Action(lambda: reapply_transparency(hwnd, window.native, tag, cfg.get("extend_frame", True))))
                else:
                    apply_capsule_region(hwnd)
                apply_window_size(hwnd, cfg)
                dump_window_state(hwnd, tag)
            except Exception:
                logging.exception("reapply region failed")
        for delay in (0.2, 0.8, 2.0, 4.0):
            threading.Timer(delay, reapply, args=(f"loaded+{delay}s",)).start()

        # Low-frequency recovery for WebView2/DWM surface recreation. Keep all
        # WinForms/WebView2 mutations on the UI thread; skip while OS-hidden.
        def transparency_watchdog():
            if not audio_state.get("running", False):
                return
            try:
                if not _standby_os_hidden and _main_hwnd and user32.IsWindow(_main_hwnd):
                    from System import Action
                    window.native.BeginInvoke(Action(lambda: reapply_transparency(
                        _main_hwnd, window.native, "periodic-watchdog", cfg.get("extend_frame", True)
                    )))
            except Exception:
                logging.exception("transparency watchdog dispatch failed")
            threading.Timer(15.0, transparency_watchdog).start()
        threading.Timer(15.0, transparency_watchdog).start()

    window.events.loaded += on_loaded

    # 啟動背景 Worker 執行緒
    audio_thread = threading.Thread(target=audio_capture_worker, args=(window,), daemon=True)
    audio_thread.start()

    media_thread = threading.Thread(target=media_worker, args=(window,), daemon=True)
    media_thread.start()

    wnp_thread = threading.Thread(target=wnp_server_worker, args=(window, cfg), daemon=True)
    wnp_thread.start()

    setup_thread = threading.Thread(target=setup_liquid_window, args=(window, cfg), daemon=True)
    setup_thread.start()

    wheel_thread = threading.Thread(target=raw_input_wheel_worker, args=(cfg,), daemon=True)
    wheel_thread.start()

    try:
        logging.info("Starting webview message loop...")
        webview.start(gui="edgechromium", debug=False)
    finally:
        audio_state["running"] = False
        try:
            if _tray_icon:
                _tray_icon.Visible = False
                _tray_icon.Dispose()
        except Exception:
            pass
        logging.info("Application loop terminated cleanly")

if __name__ == "__main__":
    try:
        if "--settings" in sys.argv:
            run_settings_ui()
        else:
            main()
    except Exception:
        logging.exception("Fatal error in __main__")
        _fatal_box("程式啟動失敗。")
